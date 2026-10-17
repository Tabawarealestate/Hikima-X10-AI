import { SignalStatus } from '@prisma/client';
import { prisma } from '../../database';
import { MarketDataProvider } from '../market-data/provider.interface';

export interface MonitoringUpdateEvent {
  signalId: string;
  symbol: string;
  previousStatus: SignalStatus;
  newStatus: SignalStatus;
  price: number;
  message: string;
  recoveryAnalysis?: string;
}

export class SignalMonitoringWorker {
  private marketDataProvider: MarketDataProvider;

  constructor(dataProvider: MarketDataProvider) {
    this.marketDataProvider = dataProvider;
  }

  async checkActiveSignals(): Promise<MonitoringUpdateEvent[]> {
    const events: MonitoringUpdateEvent[] = [];

    // Fetch all active signals needing monitoring
    const activeSignals = await prisma.signal.findMany({
      where: {
        status: {
          in: ['SENT', 'ACTIVE', 'ENTRY_REACHED', 'TP1_HIT', 'TP2_HIT', 'SL_MOVED_TO_ENTRY', 'BREAKEVEN'],
        },
      },
      include: {
        marketSymbol: true,
        monitoring: true,
        levels: true,
      },
    });

    for (const signal of activeSignals) {
      try {
        const quote = await this.marketDataProvider.fetchQuote(signal.marketSymbol.symbol);
        if (!quote) continue;

        const currentPrice = signal.direction === 'BUY' ? quote.bid : quote.ask;
        const updateEvent = await this.evaluateSignalState(signal, currentPrice);

        if (updateEvent) {
          events.push(updateEvent);
        }
      } catch (err) {
        // Log & continue monitoring loop
      }
    }

    return events;
  }

  private async evaluateSignalState(signal: any, currentPrice: number): Promise<MonitoringUpdateEvent | null> {
    const prevStatus: SignalStatus = signal.status;
    let newStatus: SignalStatus = prevStatus;
    let notificationMsg = '';
    let recoveryMsg: string | undefined = undefined;

    const isBuy = signal.direction === 'BUY';
    const monitoringRecord = signal.monitoring;
    const hasReachedEntry = prevStatus !== 'SENT' || monitoringRecord?.isNotifiedEntry === true;
    const hasHitAnyTp = monitoringRecord?.isNotifiedTp1 === true || monitoringRecord?.isNotifiedTp2 === true || monitoringRecord?.isNotifiedTp3 === true;

    // 1. Entry Reached Check
    if (prevStatus === 'SENT' || prevStatus === 'ACTIVE') {
      const isPriceInZone = isBuy
        ? currentPrice >= signal.entryMin && currentPrice <= signal.entryMax + (signal.entryMax - signal.entryMin) * 0.1
        : currentPrice <= signal.entryMax && currentPrice >= signal.entryMin - (signal.entryMax - signal.entryMin) * 0.1;

      if (isPriceInZone) {
        newStatus = 'ENTRY_REACHED';
        notificationMsg = `🎯 ${signal.marketSymbol.symbol} ENTRY ZONE REACHED at ${currentPrice.toFixed(2)}. Signal active.`;
      }
    }

    // 2. Stop Loss Check
    const isSlHit = isBuy ? currentPrice <= signal.stopLoss : currentPrice >= signal.stopLoss;
    if (isSlHit) {
      if (!hasReachedEntry) {
        // Price hit SL BEFORE entry was ever reached -> Invalidated, NOT a loss!
        newStatus = 'INVALIDATED';
        notificationMsg = `⚪ ${signal.marketSymbol.symbol} SETUP INVALIDATED: Price broke stop loss before entry zone was reached. Setup cancelled.`;
      } else {
        newStatus = 'SL_HIT';
        if (hasHitAnyTp) {
          notificationMsg = `🛡 ${signal.marketSymbol.symbol} STOP LOSS REACHED AT BREAKEVEN (${currentPrice.toFixed(2)}). Trade closed with partial TP profits secured!`;
        } else {
          notificationMsg = `🔴 ${signal.marketSymbol.symbol} STOP LOSS HIT at ${currentPrice.toFixed(2)}. Setup invalidated.`;
          recoveryMsg = `🔎 RECOVERY ANALYSIS for ${signal.marketSymbol.symbol}:\nPrevious ${signal.direction} setup failed. Current structure invalidated. Monitoring for new structural confirmation before re-entry. (No automatic revenge trade).`;
        }
      }
    }

    // 3. Take Profit Checks (if SL not hit)
    if (!isSlHit && (prevStatus === 'ENTRY_REACHED' || prevStatus === 'ACTIVE' || prevStatus === 'TP1_HIT' || prevStatus === 'TP2_HIT' || prevStatus === 'BREAKEVEN')) {
      const isTp1 = isBuy ? currentPrice >= signal.tp1 : currentPrice <= signal.tp1;
      const isTp2 = isBuy ? currentPrice >= signal.tp2 : currentPrice <= signal.tp2;
      const isTp3 = isBuy ? currentPrice >= signal.tp3 : currentPrice <= signal.tp3;

      if (isTp3) {
        newStatus = 'TP3_HIT';
        notificationMsg = `🚀🚀🚀 ${signal.marketSymbol.symbol} FINAL TP3 TARGET HIT at ${currentPrice.toFixed(2)}! Trade closed in full profit.`;
      } else if (isTp2 && prevStatus !== 'TP2_HIT') {
        newStatus = 'TP2_HIT';
        notificationMsg = `✅✅ ${signal.marketSymbol.symbol} TP2 TARGET HIT at ${currentPrice.toFixed(2)}. SL moved to breakeven/locking profits.`;
      } else if (isTp1 && prevStatus !== 'TP1_HIT' && prevStatus !== 'TP2_HIT') {
        newStatus = 'TP1_HIT';
        notificationMsg = `✅ ${signal.marketSymbol.symbol} TP1 TARGET HIT at ${currentPrice.toFixed(2)}. Suggested management: Move SL to entry / manage risk.`;
      }
    }

    // 4. Signal Expiration Checks
    const hoursSinceCreation = (Date.now() - new Date(signal.createdAt).getTime()) / (1000 * 3600);

    // 4a. Pending setup expiration (4h without entry)
    if (prevStatus === 'SENT' && hoursSinceCreation > 4 && !isSlHit && newStatus === prevStatus) {
      newStatus = 'EXPIRED';
      notificationMsg = `⚪ ${signal.marketSymbol.symbol} SIGNAL EXPIRED: Entry zone not reached within 4 hours.`;
    }

    // 4b. Active trade expiration (24h max active trade duration)
    if (hasReachedEntry && hoursSinceCreation > 24 && !isSlHit && newStatus === prevStatus) {
      newStatus = 'EXPIRED';
      notificationMsg = `⚪ ${signal.marketSymbol.symbol} SIGNAL CLOSED: Active 24-hour monitoring limit reached. Position auto-closed.`;
    }

    // If state changed, verify this event hasn't already been emitted for this signal ID
    if (newStatus !== prevStatus) {
      if (
        (newStatus === 'ENTRY_REACHED' && monitoringRecord?.isNotifiedEntry) ||
        (newStatus === 'TP1_HIT' && monitoringRecord?.isNotifiedTp1) ||
        (newStatus === 'TP2_HIT' && monitoringRecord?.isNotifiedTp2) ||
        (newStatus === 'TP3_HIT' && monitoringRecord?.isNotifiedTp3) ||
        (newStatus === 'SL_HIT' && monitoringRecord?.isNotifiedSl)
      ) {
        return null; // Event already notified
      }

      const existingEvent = await prisma.signalEvent.findFirst({
        where: { signalId: signal.id, eventType: newStatus },
      });

      if (existingEvent) {
        return null;
      }

      const isTerminal = ['TP3_HIT', 'SL_HIT', 'EXPIRED', 'INVALIDATED'].includes(newStatus);
      const isWin = ['TP1_HIT', 'TP2_HIT', 'TP3_HIT'].includes(newStatus) || (newStatus === 'SL_HIT' && hasHitAnyTp);
      const isLoss = newStatus === 'SL_HIT' && !hasHitAnyTp;

      await prisma.$transaction([
        prisma.signal.update({
          where: { id: signal.id },
          data: {
            status: newStatus,
            closedAt: isTerminal ? new Date() : undefined,
            result: isWin ? 'WIN' : isLoss ? 'LOSS' : newStatus === 'EXPIRED' ? 'EXPIRED' : newStatus === 'INVALIDATED' ? 'INVALIDATED' : undefined,
          },
        }),
        prisma.signalEvent.create({
          data: {
            signalId: signal.id,
            eventType: newStatus,
            price: currentPrice,
            metadata: { message: notificationMsg, recovery: recoveryMsg },
          },
        }),
        prisma.signalMonitoring.upsert({
          where: { signalId: signal.id },
          update: {
            currentPrice,
            lastCheckedAt: new Date(),
            isNotifiedEntry: newStatus === 'ENTRY_REACHED' || monitoringRecord?.isNotifiedEntry ? true : undefined,
            isNotifiedTp1: newStatus === 'TP1_HIT' || monitoringRecord?.isNotifiedTp1 ? true : undefined,
            isNotifiedTp2: newStatus === 'TP2_HIT' || monitoringRecord?.isNotifiedTp2 ? true : undefined,
            isNotifiedTp3: newStatus === 'TP3_HIT' || monitoringRecord?.isNotifiedTp3 ? true : undefined,
            isNotifiedSl: newStatus === 'SL_HIT' || monitoringRecord?.isNotifiedSl ? true : undefined,
          },
          create: {
            signalId: signal.id,
            currentPrice,
            highestPrice: currentPrice,
            lowestPrice: currentPrice,
            isNotifiedEntry: newStatus === 'ENTRY_REACHED',
            isNotifiedTp1: newStatus === 'TP1_HIT',
            isNotifiedTp2: newStatus === 'TP2_HIT',
            isNotifiedTp3: newStatus === 'TP3_HIT',
            isNotifiedSl: newStatus === 'SL_HIT',
          },
        }),
      ]);

      if (isTerminal && (isWin || isLoss)) {
        try {
          const stats = await prisma.signalStatistic.findFirst();
          if (stats) {
            await prisma.signalStatistic.update({
              where: { id: stats.id },
              data: {
                totalSignals: { increment: 1 },
                totalWins: isWin ? { increment: 1 } : undefined,
                totalLosses: isLoss ? { increment: 1 } : undefined,
                updatedAt: new Date(),
              },
            });
          } else {
            await prisma.signalStatistic.create({
              data: {
                period: 'ALL_TIME',
                totalSignals: 1,
                totalWins: isWin ? 1 : 0,
                totalLosses: isLoss ? 1 : 0,
              },
            });
          }
        } catch {}
      }

      return {
        signalId: signal.id,
        symbol: signal.marketSymbol.symbol,
        previousStatus: prevStatus,
        newStatus,
        price: currentPrice,
        message: notificationMsg,
        recoveryAnalysis: recoveryMsg,
      };
    }

    return null;
  }
}
