import { app } from './apps/api/app';
import { TelegramBotService } from './apps/telegram-bot/bot.service';
import { CompositeMarketDataProvider } from './services/market-data';
import { EconomicNewsService } from './services/market-data/news.service';
import { SignalMonitoringWorker } from './services/monitoring/signal-monitor.worker';
import { EnsembleEngine } from './services/strategy-engine/ensemble.engine';
import { BreakoutStrategy } from './services/strategy-engine/breakout.strategy';
import { RiskEngine } from './services/signal-engine/risk.engine';
import { SignalDeduplicationService } from './services/signal-engine/deduplication.service';
import { config } from './config';
import { prisma, seedInitialData } from './database';

let botService: TelegramBotService | null = null;
let monitoringInterval: NodeJS.Timeout | null = null;
let scannerInterval: NodeJS.Timeout | null = null;

// Concurrency Guards
let isMonitoring = false;
let isScanning = false;

// Task 5: Global Process Exception Safety
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [PROCESS] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ [PROCESS] Uncaught Exception:', error);
});

// Task 4: Graceful Shutdown Function
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 [SHUTDOWN] Received ${signal}. Initiating production-safe graceful shutdown...`);

  if (monitoringInterval) clearInterval(monitoringInterval);
  if (scannerInterval) clearInterval(scannerInterval);

  if (botService) {
    try {
      console.log('🤖 [SHUTDOWN] Stopping Telegram polling bot...');
      botService.bot.stop(signal);
    } catch (err) {
      console.error('⚠️ [SHUTDOWN] Telegram bot stop error:', err);
    }
  }

  try {
    console.log('🗄 [SHUTDOWN] Disconnecting Prisma PostgreSQL client...');
    await prisma.$disconnect();
  } catch (err) {
    console.error('⚠️ [SHUTDOWN] Prisma disconnect error:', err);
  }

  console.log('✅ [SHUTDOWN] Graceful shutdown complete. Exiting.');
  process.exit(0);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function bootstrap() {
  console.log('🚀 Initializing Hikima X10 AI Platform...');

  // 1. Seed initial DB data
  try {
    await seedInitialData();
    console.log('✅ Database initial seed verified.');
  } catch (err) {
    console.error('⚠️ Database seeding warning:', err);
  }

  // 2. Initialize Core Services
  const marketDataProvider = new CompositeMarketDataProvider();
  const newsService = new EconomicNewsService();
  const monitoringWorker = new SignalMonitoringWorker(marketDataProvider);
  const ensembleEngine = new EnsembleEngine();
  const breakoutStrategy = new BreakoutStrategy();
  const riskEngine = new RiskEngine();
  const deduplicationService = new SignalDeduplicationService();

  // 3. Start HTTP API Server
  app.listen(config.PORT, () => {
    console.log(`🌐 Hikima X10 AI Server listening on port ${config.PORT} [${config.NODE_ENV}]`);
  });

  // 4. Launch Single Telegram Bot Instance with Long Polling (Task 6)
  const botToken = config.TELEGRAM_BOT_TOKEN;

  if (botToken) {
    try {
      console.log('🤖 Connecting to Telegram Bot API...');
      botService = new TelegramBotService(botToken);
      // Purge any lingering webhooks or old bot script listeners
      await botService.bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      botService.bot.launch({
        allowedUpdates: ['message', 'callback_query'],
        dropPendingUpdates: true,
      }).then(() => {
        console.log('🤖 Telegram Bot (@HikimaAIbot) successfully launched and listening for updates!');
      }).catch((err) => {
        console.error('⚠️ Telegram Bot launch error:', err);
      });
    } catch (err) {
      console.error('⚠️ Telegram Bot initialization error:', err);
    }
  }

  // 5. Start Background Signal Monitoring Worker Loop with Concurrency Guard (Task 5)
  monitoringInterval = setInterval(async () => {
    if (isMonitoring) {
      console.log('⏳ [MONITOR] Previous monitoring cycle still running. Skipping overlapping cycle.');
      return;
    }

    isMonitoring = true;
    try {
      const events = await monitoringWorker.checkActiveSignals();
      for (const ev of events) {
        console.log(`[MONITOR] ${ev.symbol} -> ${ev.newStatus}: ${ev.message}`);
        if (botService) {
          // Find users who actually received this specific signal ID
          const recipientNotifications = await prisma.notification.findMany({
            where: { title: ev.signalId },
            include: { user: { include: { telegramUser: true } } },
          });

          for (const notif of recipientNotifications) {
            const user = notif.user;
            const tgId = user.telegramUser?.telegramId;
            if (!tgId) continue;

            const isPremium = user.accessType === 'PREMIUM';
            const symClean = ev.symbol.replace('/', '').toUpperCase();

            // 1. Free tier symbol check
            if (!isPremium && !['EURUSD', 'ETHUSD'].includes(symClean)) {
              continue;
            }

            // 2. Watchlist check: Only send monitoring event if symbol is in user's active watchlist
            const userWatchlist = await prisma.watchlist.findMany({
              where: { userId: user.id },
              include: { marketSymbol: true },
            });

            if (userWatchlist.length > 0) {
              const selectedSymbols = new Set(userWatchlist.map((w) => w.marketSymbol.symbol.replace('/', '').toUpperCase()));
              if (!selectedSymbols.has(symClean)) {
                continue; // User did NOT select this symbol! Skip notification.
              }
            }

            botService.bot.telegram.sendMessage(String(tgId), ev.message).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('⚠️ Signal monitoring worker error:', err);
    } finally {
      isMonitoring = false;
    }
  }, 15000);

  // 6. Start Market Scanner Loop with Concurrency Guard (Task 5)
  scannerInterval = setInterval(async () => {
    if (isScanning) {
      console.log('⏳ [SCANNER] Previous scanning cycle still running. Skipping overlapping cycle.');
      return;
    }

    isScanning = true;
    try {
      const symbols = await prisma.marketSymbol.findMany({ where: { isSupported: true } });
      const validCandidates: any[] = [];

      for (const sym of symbols) {
        const candles = await marketDataProvider.fetchCandles(sym.symbol, 'M15', 60);
        if (candles.length < 30) continue;

        const consensus = await ensembleEngine.evaluateConsensus(sym.symbol, 'M15', candles);
        if (consensus.finalDirection === 'NO_TRADE' || !consensus.chosenSetup) continue;

        const quote = await marketDataProvider.fetchQuote(sym.symbol);
        const spread = quote ? quote.spread : sym.pipSize;

        const riskCheck = riskEngine.evaluateRisk({
          symbol: sym.symbol,
          direction: consensus.finalDirection,
          qualityScore: consensus.consensusScore,
          spread,
          pipSize: sym.pipSize,
          dailySignalsSent: 0,
          maxDailyQuota: 5,
          entryMin: consensus.chosenSetup.entryZone.min,
          entryMax: consensus.chosenSetup.entryZone.max,
          stopLoss: consensus.chosenSetup.stopLoss,
          tp1: consensus.chosenSetup.takeProfitLevels.tp1,
          tp2: consensus.chosenSetup.takeProfitLevels.tp2,
        });

        if (!riskCheck.isApproved) continue;

        // Check persistent PostgreSQL database deduplication (active signal check + 4h symbol cooldown)
        const isDuplicate = await deduplicationService.isDatabaseDuplicate(sym.id, consensus.finalDirection, 4);
        if (isDuplicate) continue;

        // Dynamically resolve matching DB Strategy
        const stratNameUpper = consensus.chosenSetup.strategyName.toUpperCase();
        let dbStrategy = await prisma.strategy.findFirst({
          where: {
            OR: [
              { name: { contains: consensus.chosenSetup.strategyName, mode: 'insensitive' } },
              { code: stratNameUpper.includes('SMC') ? 'SMC' : stratNameUpper.includes('ALCHEMIST') ? 'ALCHEMIST' : 'TREND' },
            ],
          },
        });

        if (!dbStrategy) {
          dbStrategy = await prisma.strategy.findFirst({ where: { code: 'SMC' } });
        }

        if (!dbStrategy) continue;

        validCandidates.push({
          sym,
          consensus,
          dbStrategy,
          score: consensus.consensusScore,
        });
      }

      // 1. Fetch High-Impact News Events for Straddle evaluation
      let upcomingNews: any[] = [];
      try {
        upcomingNews = await newsService.fetchHighImpactNews();
      } catch {}

      // PROCESS CANDIDATES AND MATCH WITH ELIGIBLE USERS
      if (validCandidates.length > 0) {
        validCandidates.sort((a, b) => b.score - a.score);

        const activeUsers = await prisma.telegramUser.findMany({
          include: { user: { include: { watchlist: true, preferences: true } } },
        });

        for (const candidate of validCandidates) {
          let { sym, consensus, dbStrategy } = candidate;

          // Check if news straddle applies for users with newsFilterOn
          const imminentEvent = upcomingNews.find((n) => {
            const diffMin = Math.abs(new Date(n.time).getTime() - Date.now()) / (1000 * 60);
            return diffMin <= 15 && sym.symbol.includes(n.currency);
          });

          if (imminentEvent) {
            const candles = await marketDataProvider.fetchCandles(sym.symbol, 'M15', 30);
            if (candles.length >= 20) {
              const newsStraddleResult = breakoutStrategy.generateNewsStraddle(
                sym.symbol,
                'M15',
                candles,
                imminentEvent.title,
                sym.pipSize
              );
              consensus.chosenSetup = newsStraddleResult as any;
              consensus.consensusScore = 92;
              consensus.finalDirection = newsStraddleResult.direction;
              console.log(`⚡ [NEWS STRADDLE GENERATED] High impact event ${imminentEvent.title} for ${sym.symbol}`);
            }
          }

          const fingerprint = deduplicationService.generateFingerprint({
            symbol: sym.symbol,
            strategyCode: consensus.chosenSetup.strategyName,
            direction: consensus.finalDirection,
            timeframe: 'M15',
          });

          let newSignal;
          try {
            newSignal = await prisma.signal.create({
              data: {
                fingerprint,
                symbolId: sym.id,
                strategyId: dbStrategy.id,
                timeframe: 'M15',
                direction: consensus.finalDirection,
                confidence: consensus.chosenSetup.confidence,
                qualityScore: consensus.consensusScore,
                entryMin: consensus.chosenSetup.entryZone.min,
                entryMax: consensus.chosenSetup.entryZone.max,
                stopLoss: consensus.chosenSetup.stopLoss,
                tp1: consensus.chosenSetup.takeProfitLevels.tp1,
                tp2: consensus.chosenSetup.takeProfitLevels.tp2,
                tp3: consensus.chosenSetup.takeProfitLevels.tp3,
                riskReward: consensus.chosenSetup.riskRewardRatio,
                reasoning: consensus.chosenSetup.reasoning as any,
                supporting: consensus.chosenSetup.supportingFactors as any,
                opposing: consensus.chosenSetup.opposingFactors as any,
                marketRegime: consensus.chosenSetup.marketRegime,
                session: 'London/New York',
                status: 'SENT',
                sentAt: new Date(),
              },
            });
          } catch (dbErr) {
            console.error(`⚠️ Could not save signal for ${sym.symbol}:`, dbErr);
          }

          if (newSignal && botService) {
            console.log(`🔥 [SIGNAL CREATED] ${sym.symbol} ${consensus.finalDirection} (${consensus.consensusScore}/100) Strategy: ${dbStrategy.name}`);
            const now = new Date();

            for (const tu of activeUsers) {
              let currentDailyCount = tu.dailySignalCount;

              // Reset daily count if last signal was from a previous UTC calendar day
              if (tu.lastSignalDate) {
                const lastDateStr = new Date(tu.lastSignalDate).toISOString().split('T')[0];
                const nowDateStr = now.toISOString().split('T')[0];
                if (lastDateStr !== nowDateStr) {
                  currentDailyCount = 0;
                  await prisma.telegramUser.update({
                    where: { id: tu.id },
                    data: { dailySignalCount: 0 },
                  });
                }
              }

              const isPremium = tu.user.accessType === 'PREMIUM';
              const trialExpired = tu.user.accessType === 'FREE' && tu.user.trialEndDate && now > new Date(tu.user.trialEndDate);

              if (trialExpired) {
                console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=TRIAL_EXPIRED`);
                continue;
              }

              // PER-SYMBOL ACTIVE SIGNAL LIMIT: Max 1 active open signal per symbol per user
              const recentUserNotifs = await prisma.notification.findMany({
                where: { userId: tu.userId },
                orderBy: { createdAt: 'desc' },
                take: 20,
              });

              let activeSymbolSignalExists = false;
              let activeTotalCount = 0;

              for (const notif of recentUserNotifs) {
                const activeUserSignal = await prisma.signal.findUnique({
                  where: { id: notif.title },
                });
                if (
                  activeUserSignal &&
                  !activeUserSignal.closedAt &&
                  ['SENT', 'ACTIVE', 'ENTRY_REACHED'].includes(activeUserSignal.status)
                ) {
                  activeTotalCount++;
                  if (activeUserSignal.symbolId === sym.id) {
                    console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=ACTIVE_SIGNAL_FOR_SYMBOL_IN_PROGRESS activeSignalId=${activeUserSignal.id}`);
                    activeSymbolSignalExists = true;
                    break;
                  }
                }
              }

              if (activeSymbolSignalExists) {
                continue; // User already has an active pending signal on this exact symbol
              }

              // Overall concurrent active signal cap (Free: 1, Premium: 3)
              const maxConcurrentActive = isPremium ? 3 : 1;
              if (activeTotalCount >= maxConcurrentActive) {
                console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=MAX_CONCURRENT_ACTIVE_SIGNALS_REACHED activeCount=${activeTotalCount}`);
                continue;
              }

              // 1. Free Users Symbol & Welcome Rule (EURUSD / ETHUSD, or 1-time XAUUSD welcome signal)
              const symClean = sym.symbol.replace('/', '').toUpperCase();
              if (!isPremium) {
                const isXauWelcome = !tu.freeWelcomeXauSent && symClean === 'XAUUSD' && dbStrategy.code === 'SMC';
                const isAllowedFreePair = ['EURUSD', 'ETHUSD'].includes(symClean) && dbStrategy.code === 'SMC';

                if (!isXauWelcome && !isAllowedFreePair) {
                  console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=FREE_PAIR_NOT_ALLOWED`);
                  continue;
                }
              }

              // 2. Market Watchlist Filter (Respects custom selections; defaults to top liquid markets if empty)
              if (tu.user.watchlist && tu.user.watchlist.length > 0) {
                const userSelectedSymbolIds = new Set(tu.user.watchlist.map((w) => w.symbolId));
                if (!userSelectedSymbolIds.has(sym.id)) {
                  console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=SYMBOL_NOT_IN_WATCHLIST`);
                  continue;
                }
              } else if (isPremium) {
                // Default top symbols for Premium users with empty watchlist
                const defaultPremiumSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USOIL'];
                if (!defaultPremiumSymbols.includes(symClean)) {
                  console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=SYMBOL_NOT_IN_DEFAULT_PREMIUM_WATCHLIST`);
                  continue;
                }
              }

              // 3. User Selected Strategy Preference Filter
              const prefStrategy = tu.user.preferences?.preferredStrategy;
              if (prefStrategy && prefStrategy !== 'AI_CONSENSUS' && prefStrategy !== 'ALL') {
                const stratCodeUpper = dbStrategy.code.toUpperCase();
                const prefUpper = prefStrategy.toUpperCase();
                if (!stratCodeUpper.includes(prefUpper) && !dbStrategy.name.toUpperCase().includes(prefUpper)) {
                  console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=STRATEGY_MISMATCH userPref=${prefStrategy}`);
                  continue;
                }
              }

              // 4. Preferred Timeframe Filter
              const prefTimeframes = tu.user.preferences?.selectedTimeframes
                ? tu.user.preferences.selectedTimeframes.split(',').map((t) => t.trim().toUpperCase())
                : ['M15', 'H1', 'H4'];
              if (!prefTimeframes.includes(newSignal.timeframe.toUpperCase())) {
                console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=TIMEFRAME_MISMATCH signalTf=${newSignal.timeframe}`);
                continue;
              }

              // 5. Min Quality Score Threshold Filter
              const minScore = tu.user.preferences?.minQualityScore || 75;
              if (newSignal.qualityScore < minScore) {
                console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=QUALITY_SCORE_BELOW_MIN score=${newSignal.qualityScore} minScore=${minScore}`);
                continue;
              }

              const quota = isPremium ? 5 : 1;

              if (currentDailyCount < quota) {
                console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=ACCEPT`);
                const userTz = tu.user.preferences?.timezone || 'UTC';
                const sent = await botService.sendFormattedSignal(
                  String(tu.telegramId),
                  {
                    ...newSignal,
                    marketSymbol: sym,
                    strategyName: dbStrategy.name,
                  },
                  userTz
                );

                if (sent) {
                  await prisma.telegramUser.update({
                    where: { id: tu.id },
                    data: {
                      dailySignalCount: { increment: 1 },
                      lastSignalDate: now,
                      freeWelcomeXauSent: !isPremium && symClean === 'XAUUSD' ? true : tu.freeWelcomeXauSent,
                    },
                  });

                  // Record delivery notification linking user ID and signal ID
                  await prisma.notification.create({
                    data: {
                      userId: tu.userId,
                      title: newSignal.id,
                      body: sym.symbol,
                    },
                  });
                }
              } else {
                console.log(`[SignalEngine] user=${tu.username || tu.telegramId} symbol=${sym.symbol} strategy=${dbStrategy.code} decision=REJECT reason=DAILY_QUOTA_REACHED count=${currentDailyCount} quota=${quota}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('⚠️ Market scanner error:', err);
    } finally {
      isScanning = false;
    }
  }, 60000);
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
