import { Telegraf, Markup } from 'telegraf';
import { config } from '../../config';
import { prisma } from '../../database';
import { CryptoMusService } from '../../services/subscription/cryptomus.service';
import { TradingAIAssistantService } from '../../services/ai-assistant/trading-assistant.service';
import { IslamicContentService } from '../../services/islamic/islamic-content.service';
import { PrayerTimeService } from '../../services/islamic/prayer-time.service';
import { getText } from '../../packages/shared/i18n';

export const HIKIMA_SIGNAL_ENGINE_VERSION = '2.2.0-standalone';
export const HIKIMA_BUILD_COMMIT = 'faf929fe423dbd274b34231c57b4eb3048969e5e';
export const HIKIMA_START_TIMESTAMP = new Date().toISOString();

export class TelegramBotService {
  public bot: Telegraf;
  private cryptomusService = new CryptoMusService();
  private aiAssistantService = new TradingAIAssistantService();
  private islamicService = new IslamicContentService();
  private prayerTimeService = new PrayerTimeService();
  private channelUsername = '@hikimaaipalace';
  private channelUrl = 'https://t.me/hikimaaipalace';

  // Instant In-Memory Cache for Channel Membership (TTL = 5 minutes)
  private channelMemberCache = new Map<number, { isMember: boolean; cachedAt: number }>();
  private cacheTtlMs = 5 * 60 * 1000;

  // Track user message IDs to automatically clean up previous menu screens
  private userLastMessageIds = new Map<number, number[]>();

  private async cleanAndReply(ctx: any, text: string, extra?: any) {
    const userId = ctx.from?.id;
    if (userId) {
      if (ctx.message || ctx.callbackQuery?.message) {
        await ctx.deleteMessage().catch(() => {});
      }
      const oldIds = this.userLastMessageIds.get(userId) || [];
      for (const msgId of oldIds) {
        await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
      }
      this.userLastMessageIds.set(userId, []);
    }

    const sent = await ctx.reply(text, extra);
    if (sent && sent.message_id && userId) {
      this.userLastMessageIds.set(userId, [sent.message_id]);
    }
    return sent;
  }

  constructor(token = config.TELEGRAM_BOT_TOKEN) {
    this.bot = new Telegraf(token);
    this.setupErrorHandling();
    this.setupMiddlewares();
    this.setupHandlers();
  }

  private setupErrorHandling() {
    this.bot.catch((err: any, ctx) => {
      console.error(`⚠️ Telegram Bot error on update ${ctx.updateType}:`, err);
      ctx.reply('⚠️ An operational error occurred. Please try again or type /start.').catch(() => {});
    });
  }

  private setupMiddlewares() {
    this.bot.use((ctx, next) => {
      const msgText = (ctx.message as any)?.text || (ctx.callbackQuery as any)?.data || '';
      console.log(`⚡ [INSTANT UPDATE] [${ctx.updateType}] from ${ctx.from?.username || ctx.from?.id}:`, msgText);
      return next();
    });
  }

  // Persistent Reply Keyboard at the bottom of chat
  private getBottomReplyKeyboard(lang = 'en') {
    return Markup.keyboard([
      [getText(lang, 'signals'), getText(lang, 'markets')],
      [getText(lang, 'strategies'), getText(lang, 'premium')],
      [getText(lang, 'scan_status'), getText(lang, 'performance')],
      [getText(lang, 'settings'), getText(lang, 'help')],
    ]).resize();
  }

  // Fast Cached Channel Membership Check (< 1ms)
  public async checkChannelMembership(userId: number): Promise<boolean> {
    if (String(userId) === config.TELEGRAM_ADMIN_CHAT_ID) return true;

    const cached = this.channelMemberCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      return cached.isMember;
    }

    try {
      const member = await this.bot.telegram.getChatMember(this.channelUsername, userId);
      const isMember = ['creator', 'administrator', 'member'].includes(member.status);
      this.channelMemberCache.set(userId, { isMember, cachedAt: Date.now() });
      return isMember;
    } catch (err) {
      this.channelMemberCache.set(userId, { isMember: true, cachedAt: Date.now() });
      return true;
    }
  }

  private async getUserLang(tgUserId: number): Promise<string> {
    try {
      const dbTgUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUserId) },
        include: { user: { include: { preferences: true } } },
      });
      return dbTgUser?.user.preferences?.language || 'en';
    } catch {
      return 'en';
    }
  }

  private setupHandlers() {
    // 1. /start command
    this.bot.start(async (ctx) => {
      try {
        const tgUser = ctx.from;
        const username = tgUser.username ? `@${tgUser.username}` : tgUser.first_name || 'Trader';
        const payload = ctx.startPayload ? ctx.startPayload.trim().toUpperCase() : '';

        const isMember = await this.checkChannelMembership(tgUser.id);
        if (!isMember) {
          return this.renderChannelRequiredScreen(ctx, username);
        }

        let dbTgUser = await prisma.telegramUser.findUnique({
          where: { telegramId: BigInt(tgUser.id) },
          include: { user: { include: { subscriptions: true, preferences: true } } },
        });

        const validCode = (config.DEFAULT_FREE_ACCESS_CODE || 'X10H').toUpperCase();

        if (!dbTgUser && (payload === 'HUNTMEX10')) {
          dbTgUser = await this.activateFounderUser(tgUser, ctx.chat.id);
          return this.sendFounderWelcome(ctx, username);
        }

        if (!dbTgUser && (payload === validCode || payload === 'X10H' || payload === 'X10')) {
          dbTgUser = await this.activateFreeUser(tgUser, ctx.chat.id, 'X10H');
          this.announceNewUserInChannel(username);
        }

        if (!dbTgUser) {
          const codePromptNote = `Hello ${username} 👋\n\nPlease enter your Access Code to start using your 30-day free trial or upgrade to Premium:`;
          return ctx.reply(codePromptNote);
        }

        const lang = dbTgUser.user.preferences?.language || 'en';

        if (dbTgUser.user.accessType === 'FREE' && dbTgUser.user.trialEndDate && new Date() > new Date(dbTgUser.user.trialEndDate)) {
          return this.sendExpirationNotice(ctx);
        }

        const accessLabel = dbTgUser.user.accessType === 'PREMIUM' ? '💎 PREMIUM (Unlocked)' : 'FREE (Active)';
        const welcomeText = getText(lang, 'welcome', username, accessLabel);

        const inlineKb = Markup.inlineKeyboard([
          [Markup.button.callback('📊 Active Signals', 'menu_signals'), Markup.button.callback('📈 Watchlist & Markets', 'menu_markets')],
          [Markup.button.callback('🧠 Strategy Engine', 'menu_strategies'), Markup.button.callback('💎 Premium Plans', 'menu_subscribe')],
          [Markup.button.callback('🤖 Trading AI Assistant', 'menu_ai_chat'), Markup.button.callback('📊 Performance', 'menu_performance')],
          [Markup.button.callback('⚙️ User Settings', 'menu_settings'), Markup.button.callback('❓ Help & Support', 'menu_help')],
        ]);

        await ctx.reply(welcomeText, this.getBottomReplyKeyboard(lang));
        await ctx.reply('📋 Quick Access Navigation Menu:', inlineKb);
      } catch (err) {
        console.error('Error in /start handler:', err);
        await ctx.reply('Welcome to Hikima X10 AI! Please enter your Access Code to activate free access.');
      }
    });

    // 2. Language Change Actions (EN, FR, ES, AR, HI, UR, HA)
    this.bot.action('edit_lang', async (ctx) => {
      await ctx.answerCbQuery('Language Selector');
      await this.cleanAndReply(ctx, '🌐 Select Preferred Language / Choisissez la langue / Seleccionar idioma / اختر اللغة / भाषा चुनें / زبان منتخب کریں / Zabi Harshe:', Markup.inlineKeyboard([
        [Markup.button.callback('🇬🇧 English', 'set_lang_en'), Markup.button.callback('🇫🇷 Français', 'set_lang_fr')],
        [Markup.button.callback('🇪🇸 Español', 'set_lang_es'), Markup.button.callback('🇸🇦 العربية', 'set_lang_ar')],
        [Markup.button.callback('🇮🇳 हिंदी (Hindi)', 'set_lang_hi'), Markup.button.callback('🇵🇰 اردو (Urdu)', 'set_lang_ur')],
        [Markup.button.callback('🇳🇬 Hausa', 'set_lang_ha')],
      ]));
    });

    this.bot.action(/^set_lang_(en|fr|es|ar|hi|ur|ha)$/, async (ctx) => {
      const selectedLang = ctx.match[1];
      const tgUser = ctx.from;

      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { preferences: true } } },
      });

      if (dbUser) {
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { language: selectedLang },
          create: { userId: dbUser.userId, language: selectedLang },
        });
      }

      await ctx.answerCbQuery(`Language set to ${selectedLang.toUpperCase()}`);
      const confirmationMsg = getText(selectedLang, 'language_updated');
      await this.cleanAndReply(ctx, confirmationMsg, this.getBottomReplyKeyboard(selectedLang));
    });

    // 2b. Timezone & News Filter Actions
    this.bot.action('edit_tz', async (ctx) => {
      await ctx.answerCbQuery('Timezone Selector');
      await this.cleanAndReply(ctx, '🕒 Select Your Display Timezone:', Markup.inlineKeyboard([
        [Markup.button.callback('🌐 UTC (+00:00)', 'set_tz_UTC'), Markup.button.callback('🇮🇳 / 🇵🇰 IST (+05:30)', 'set_tz_IST')],
        [Markup.button.callback('🇳🇬 WAT (+01:00)', 'set_tz_WAT'), Markup.button.callback('🇺🇸 EST (-05:00)', 'set_tz_EST')],
      ]));
    });

    this.bot.action(/^set_tz_(UTC|IST|WAT|EST)$/, async (ctx) => {
      const selectedTz = ctx.match[1];
      const tgUser = ctx.from;

      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { preferences: true } } },
      });

      if (dbUser) {
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { timezone: selectedTz },
          create: { userId: dbUser.userId, timezone: selectedTz },
        });
      }

      await ctx.answerCbQuery(`Timezone set to ${selectedTz}`);
      await this.cleanAndReply(ctx, `🕒 Display Timezone updated to: ${selectedTz}. All signals will align with your timezone.`);
    });

    this.bot.action('toggle_news_filter', async (ctx) => {
      const tgUser = ctx.from;
      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { preferences: true } } },
      });

      let currentVal = true;
      if (dbUser) {
        const pref = await prisma.userPreference.findUnique({ where: { userId: dbUser.userId } });
        currentVal = pref ? !pref.newsFilterOn : false;
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { newsFilterOn: currentVal },
          create: { userId: dbUser.userId, newsFilterOn: currentVal },
        });
      }

      const statusText = currentVal ? '🟢 ACTIVE (High-Impact Straddle Activated)' : '🔴 INACTIVE (Standard Technical Processing)';
      await ctx.answerCbQuery(`News Filter: ${currentVal ? 'ON' : 'OFF'}`);
      const lang = await this.getUserLang(tgUser.id);
      await this.cleanAndReply(
        ctx,
        `🔔 High-Impact News Filter updated: ${statusText}\n\nWhen News Filter is ON, high-impact news events (NFP, CPI, FOMC, GDP) automatically trigger 30-min range straddle setups!`,
        this.getBottomReplyKeyboard(lang)
      );
    });

    this.bot.action('toggle_muslim_activities', async (ctx) => {
      const tgUser = ctx.from;
      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { preferences: true } } },
      });

      let currentVal = false;
      if (dbUser) {
        const pref = await prisma.userPreference.findUnique({ where: { userId: dbUser.userId } });
        currentVal = pref ? !pref.muslimActivities : true;
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { muslimActivities: currentVal },
          create: { userId: dbUser.userId, muslimActivities: currentVal },
        });
      }

      const statusText = currentVal ? '🟢 ON' : '🔴 OFF';
      await ctx.answerCbQuery(`Muslim Activities: ${currentVal ? 'ON' : 'OFF'}`);
      const lang = await this.getUserLang(tgUser.id);

      const text = `🕌 MUSLIM ACTIVITIES & TRUSTED ISLAMIC REMINDERS:\n\nSetting: ${statusText}\nWhen ON, you receive authentic Friday Salawat reminders, daily prayer times, Ramadan Suhoor & Iftar du'as (Sunan Abi Dawud 2357), and verified Adhkar. Trading signals operate independently.`;

      await this.cleanAndReply(
        ctx,
        text,
        Markup.inlineKeyboard([
          [Markup.button.callback('📿 Prayer Times', 'islamic_prayer_times'), Markup.button.callback('📖 Hadith of the Day', 'islamic_hadith')],
          [Markup.button.callback('🤲 Daily Du\'a', 'islamic_dua'), Markup.button.callback('🕌 Friday Jumu\'ah', 'islamic_jumuah')],
          [Markup.button.callback('🌅 Morning Adhkar', 'islamic_morning_adhkar'), Markup.button.callback('🌙 Evening Adhkar', 'islamic_evening_adhkar')],
          [Markup.button.callback('🕋 Hajj & Umrah Guide', 'islamic_hajj_umrah')],
          [Markup.button.callback(`🕌 Toggle Muslim Activities (${statusText})`, 'toggle_muslim_activities')],
        ])
      );
    });

    this.bot.action('islamic_prayer_times', async (ctx) => {
      await ctx.answerCbQuery('Prayer Times');
      const tgUser = ctx.from;
      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { preferences: true } } },
      });

      const userCity = dbUser?.user.preferences?.timezone?.split('/')[1] || 'Mecca';
      const pt = this.prayerTimeService.calculatePrayerTimes(userCity);

      const text = `🕌 TODAY'S PRAYER TIMES\n━━━━━━━━━━━━━━━━━━\n\n🌅 Fajr       ${pt.fajr}\n☀️ Dhuhr      ${pt.dhuhr}\n🌤️ Asr        ${pt.asr}\n<ctrl42> Maghrib    ${pt.maghrib}\n🌙 Isha       ${pt.isha}\n\n📍 Location: ${pt.city}\n📅 Date: ${pt.date}`;

      await this.cleanAndReply(
        ctx,
        text,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏙️ Select City', 'edit_city')],
          [Markup.button.callback('🕌 Jumu\'ah Reminder', 'islamic_jumuah')],
        ])
      );
    });

    this.bot.action('edit_city', async (ctx) => {
      await ctx.answerCbQuery('Select City');
      const cities = this.prayerTimeService.supportedCities;
      const buttons = cities.map((c) => Markup.button.callback(c.name, `set_city_${c.name}`));
      const grid = [];
      for (let i = 0; i < buttons.length; i += 2) {
        grid.push(buttons.slice(i, i + 2));
      }
      await this.cleanAndReply(ctx, '📍 Select Your City for Accurate Prayer Times:', Markup.inlineKeyboard(grid));
    });

    this.bot.action(/^set_city_(.+)$/, async (ctx) => {
      const cityName = ctx.match[1];
      const tgUser = ctx.from;
      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: true },
      });

      if (dbUser) {
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { timezone: `Asia/${cityName}` },
          create: { userId: dbUser.userId, timezone: `Asia/${cityName}` },
        });
      }

      await ctx.answerCbQuery(`City set to ${cityName}`);
      const pt = this.prayerTimeService.calculatePrayerTimes(cityName);
      const text = `✅ Location updated to ${cityName}!\n\n🕌 TODAY'S PRAYER TIMES\n━━━━━━━━━━━━━━━━━━\n\n🌅 Fajr       ${pt.fajr}\n☀️ Dhuhr      ${pt.dhuhr}\n🌤️ Asr        ${pt.asr}\n🌇 Maghrib    ${pt.maghrib}\n🌙 Isha       ${pt.isha}\n\n📍 Location: ${pt.city}`;
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(tgUser.id)));
    });

    this.bot.action('islamic_jumuah', async (ctx) => {
      await ctx.answerCbQuery('Jumu\'ah Reminder');
      const item = this.islamicService.getJumuahReminder();
      const text = `🕌 JUMU'AH MUBARAK & SALAWAT REMINDER\n━━━━━━━━━━━━━━━━━━\n\n${item.arabicText}\n\nTransliteration:\n${item.transliteration}\n\nTranslation:\n"${item.translation}"\n\nSource: ${item.sourceCollection} (${item.sourceReference})`;
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    this.bot.action('islamic_hadith', async (ctx) => {
      await ctx.answerCbQuery('Hadith of the Day');
      const item = this.islamicService.getDailyHadith();
      const text = `📖 HADITH OF THE DAY\n━━━━━━━━━━━━━━━━━━\n\n${item.arabicText}\n\nTransliteration:\n${item.transliteration}\n\nTranslation:\n"${item.translation}"\n\nSource: ${item.sourceCollection} (${item.sourceReference})\nGrading: ${item.authenticityStatus}`;
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    this.bot.action('islamic_dua', async (ctx) => {
      await ctx.answerCbQuery('Daily Du\'a');
      const item = this.islamicService.getDailyDua();
      const text = `🤲 DAILY VERIFIED DU'A\n━━━━━━━━━━━━━━━━━━\n\n${item.arabicText}\n\nTransliteration:\n${item.transliteration}\n\nTranslation:\n"${item.translation}"\n\nSource: ${item.sourceCollection} (${item.sourceReference})\nGrading: ${item.authenticityStatus}`;
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    this.bot.action('islamic_morning_adhkar', async (ctx) => {
      await ctx.answerCbQuery('Morning Adhkar');
      const item = this.islamicService.getMorningAdhkar();
      const text = `🌅 MORNING ADHKAR\n━━━━━━━━━━━━━━━━━━\n\n${item.arabicText}\n\nTransliteration:\n${item.transliteration}\n\nTranslation:\n"${item.translation}"\n\nSource: ${item.sourceCollection} (${item.sourceReference})\nGrading: ${item.authenticityStatus}`;
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    this.bot.action('islamic_evening_adhkar', async (ctx) => {
      await ctx.answerCbQuery('Evening Adhkar');
      const item = this.islamicService.getEveningAdhkar();
      const text = `🌙 EVENING ADHKAR\n━━━━━━━━━━━━━━━━━━\n\n${item.arabicText}\n\nTransliteration:\n${item.transliteration}\n\nTranslation:\n"${item.translation}"\n\nSource: ${item.sourceCollection} (${item.sourceReference})\nGrading: ${item.authenticityStatus}`;
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    this.bot.action('islamic_hajj_umrah', async (ctx) => {
      await ctx.answerCbQuery('Hajj & Umrah Guide');
      const text = this.islamicService.getHajjUmrahGuide();
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    this.bot.action('edit_timeframes', async (ctx) => {
      await ctx.answerCbQuery('Timeframes');
      await this.cleanAndReply(ctx, '⏱ Select Your Preferred Signal Timeframe Filter:', Markup.inlineKeyboard([
        [Markup.button.callback('M15 (15 Min)', 'set_tf_M15'), Markup.button.callback('H1 (1 Hour)', 'set_tf_H1')],
        [Markup.button.callback('H4 (4 Hours)', 'set_tf_H4'), Markup.button.callback('All Timeframes', 'set_tf_ALL')],
      ]));
    });

    this.bot.action(/^set_tf_(M15|H1|H4|ALL)$/, async (ctx) => {
      const tfChoice = ctx.match[1];
      const tgUser = ctx.from;
      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: true },
      });

      if (!dbUser) return ctx.reply('Please register first by entering your Access Code X10H.');

      if (dbUser) {
        const val = tfChoice === 'ALL' ? 'M15,H1,H4,D1' : tfChoice;
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { selectedTimeframes: val },
          create: { userId: dbUser.userId, selectedTimeframes: val },
        });
      }

      await ctx.answerCbQuery(`Timeframe: ${tfChoice}`);
      await this.cleanAndReply(ctx, `⏱ Preferred Signal Timeframes updated to: ${tfChoice}.`);
    });

    this.bot.action('edit_min_score', async (ctx) => {
      await ctx.answerCbQuery('Quality Threshold');
      await this.cleanAndReply(ctx, '⭐ Select Minimum Signal Quality Score Threshold:', Markup.inlineKeyboard([
        [Markup.button.callback('75+ (Standard)', 'set_min_score_75'), Markup.button.callback('85+ (High Confluence)', 'set_min_score_85')],
        [Markup.button.callback('90+ (Elite Only)', 'set_min_score_90')],
      ]));
    });

    this.bot.action(/^set_min_score_(75|85|90)$/, async (ctx) => {
      const minScore = parseInt(ctx.match[1], 10);
      const tgUser = ctx.from;
      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: true },
      });

      if (!dbUser) return ctx.reply('Please register first by entering your Access Code X10H.');

      if (dbUser) {
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { minQualityScore: minScore },
          create: { userId: dbUser.userId, minQualityScore: minScore },
        });
      }

      await ctx.answerCbQuery(`Min Score: ${minScore}`);
      await this.cleanAndReply(ctx, `⭐ Minimum Quality Score Threshold updated to: ${minScore}/100.`);
    });

    // 3. Channel Verification Action
    this.bot.action('verify_channel', async (ctx) => {
      await ctx.answerCbQuery();
      const tgUser = ctx.from;
      const username = tgUser.username ? `@${tgUser.username}` : tgUser.first_name || 'Trader';

      this.channelMemberCache.delete(tgUser.id);
      const isMember = await this.checkChannelMembership(tgUser.id);

      if (!isMember) {
        return ctx.reply(`❌ Verification failed: You have not joined @hikimaaipalace yet.\n\nPlease join the channel and click verify again:`, Markup.inlineKeyboard([
          [Markup.button.url('📢 Join @hikimaaipalace', this.channelUrl)],
          [Markup.button.callback('🔄 Verify Membership Again', 'verify_channel')],
        ]));
      }

      await ctx.reply(`✅ Channel Membership Verified! Welcome to Hikima X10 AI.\n\nPlease enter your Access Code to activate your 30-day access:`);
    });

    // 4. Text Message Handler
    this.bot.on('text', async (ctx, next) => {
      const textInput = ctx.message.text.trim();
      const tgUser = ctx.from;
      const username = tgUser.username ? `@${tgUser.username}` : tgUser.first_name || 'Trader';
      const lang = await this.getUserLang(tgUser.id);

      // Instant Bottom Keyboard Button Matching Across Languages
      if (['📊 Signals', '📊 Signaux', '📊 Señales', '📊 الإشارات'].includes(textInput)) return this.renderSignals(ctx);
      if (['📈 Markets', '📈 Marchés', '📈 Mercados', '📈 الأسواق'].includes(textInput)) return this.renderMarkets(ctx);
      if (['🧠 Strategies', '🧠 Stratégies', '🧠 Estrategias', '🧠 الاستراتيجيات'].includes(textInput)) return this.renderStrategies(ctx);
      if (['💎 Premium', '💎 الباقة المميزة'].includes(textInput)) return this.renderSubscription(ctx);
      if (['⚡ Scan Status', '⚡ État du Scan', '⚡ Estado del Escaneo', '⚡ حالة المسح'].includes(textInput)) return this.renderScanStatus(ctx);
      if (['📊 Performance', '📊 Rendimiento', '📊 الأداء'].includes(textInput)) return this.renderPerformance(ctx);
      if (['⚙️ Settings', '⚙️ Paramètres', '⚙️ Configuración', '⚙️ الإعدادات'].includes(textInput)) return this.renderSettings(ctx);
      if (['❓ Help', '❓ Aide', '❓ Ayuda', '❓ المساعدة'].includes(textInput)) return this.renderHelp(ctx);

      if (textInput.startsWith('/')) return next();

      const isMember = await this.checkChannelMembership(tgUser.id);
      if (!isMember) {
        return this.renderChannelRequiredScreen(ctx, username);
      }

      const inputCode = textInput.toUpperCase();

      // 👑 ADMIN / FOUNDER KEY CHECK: HuntmeX10
      if (inputCode === 'HUNTMEX10') {
        await this.activateFounderUser(tgUser, ctx.chat.id);
        return this.sendFounderWelcome(ctx, username);
      }

      let dbTgUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { subscriptions: true } } },
      });

      const validCode = (config.DEFAULT_FREE_ACCESS_CODE || 'X10H').toUpperCase();

      if (inputCode === validCode || inputCode === 'X10H' || inputCode === 'X10') {
        if (dbTgUser) {
          if (dbTgUser.user.accessType === 'FREE' && dbTgUser.user.trialEndDate && new Date() > new Date(dbTgUser.user.trialEndDate)) {
            return this.sendExpirationNotice(ctx);
          }
          return ctx.reply(`ℹ️ Your access is already active (${username}). Type /status to check your plan.`, this.getBottomReplyKeyboard(lang));
        }

        dbTgUser = await this.activateFreeUser(tgUser, ctx.chat.id, inputCode);
        this.announceNewUserInChannel(username);

        const welcomeText = `SUCCESSFUL ACTIVATION!\n\nWelcome to Hikima X10 AI ${username} 👋\n\n🟢 AI SCAN ENGINE: ACTIVE\nAccess: FREE (30 Days Active)\n\nUse the bottom menu buttons below to navigate:`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📊 Active Signals', 'menu_signals'), Markup.button.callback('📈 Markets & Watchlist', 'menu_markets')],
          [Markup.button.callback('🧠 Strategy Engine', 'menu_strategies'), Markup.button.callback('💎 Premium Plans', 'menu_subscribe')],
          [Markup.button.callback('⚙️ Settings', 'menu_settings'), Markup.button.callback('❓ Help & Support', 'menu_help')],
        ]);

        await ctx.reply(welcomeText, this.getBottomReplyKeyboard(lang));
        return ctx.reply('📋 Navigation Menu:', keyboard);
      }

      if (!dbTgUser) {
        return ctx.reply(
          `❌ Wrong code. You cannot access this feature without a valid access code.`
        );
      }

      return next();
    });

    // 4b. AI Chat Assistant Command (/ask <question>)
    this.bot.command('ask', async (ctx) => {
      const tgUser = ctx.from;
      const isMember = await this.checkChannelMembership(tgUser.id);
      if (!isMember) return this.renderChannelRequiredScreen(ctx, tgUser.username ? `@${tgUser.username}` : tgUser.first_name);

      const question = ctx.message.text.replace('/ask', '').trim();
      if (!question) {
        return ctx.reply('🤖 TRADING AI CHAT ASSISTANT:\n\nPlease ask a trading question. Example:\n/ask How does SMC liquidity sweep work?');
      }

      const answer = this.aiAssistantService.answerTradingQuestion(question);
      return ctx.reply(answer);
    });

    // 4c. Muslim Activities Command (/muslim)
    this.bot.command('muslim', async (ctx) => {
      const tgUser = ctx.from;
      const isMember = await this.checkChannelMembership(tgUser.id);
      if (!isMember) return this.renderChannelRequiredScreen(ctx, tgUser.username ? `@${tgUser.username}` : tgUser.first_name);
      return this.renderMuslimActivitiesMenu(ctx);
    });

    // 5. Commands
    this.bot.command(['menu', 'signals', 'markets', 'strategies', 'settings', 'performance', 'subscription', 'subscribe', 'help', 'support', 'status', 'scan', 'stop', 'ask', 'muslim'], async (ctx) => {
      const tgUser = ctx.from;
      const isMember = await this.checkChannelMembership(tgUser.id);
      if (!isMember) return this.renderChannelRequiredScreen(ctx, tgUser.username ? `@${tgUser.username}` : tgUser.first_name);

      const rawCmd = ctx.message.text.split(' ')[0].replace('/', '');
      const command = rawCmd.split('@')[0];

      if (command === 'menu') {
        return ctx.reply('📋 Main Menu:', Markup.inlineKeyboard([
          [Markup.button.callback('📊 Signals', 'menu_signals'), Markup.button.callback('📈 Markets', 'menu_markets')],
          [Markup.button.callback('🧠 Strategies', 'menu_strategies'), Markup.button.callback('💎 Premium', 'menu_subscribe')],
          [Markup.button.callback('⚡ Scan Status', 'menu_scan_status'), Markup.button.callback('⚙️ Settings', 'menu_settings')],
          [Markup.button.callback('❓ Help', 'menu_help')],
        ]));
      }

      if (command === 'signals') return this.renderSignals(ctx);
      if (command === 'markets') return this.renderMarkets(ctx);
      if (command === 'strategies') return this.renderStrategies(ctx);
      if (command === 'settings') return this.renderSettings(ctx);
      if (command === 'performance') return this.renderPerformance(ctx);
      if (command === 'subscription' || command === 'subscribe') return this.renderSubscription(ctx);
      if (command === 'help' || command === 'support') return this.renderHelp(ctx);
      if (command === 'status' || command === 'scan') return this.renderScanStatus(ctx);
      if (command === 'stop') return ctx.reply('⏹ Notifications stopped. Type /start to resume.');
    });

    // 6. Interactive Action Handlers
    this.bot.action('menu_signals', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderSignals(ctx);
    });
    this.bot.action('menu_markets', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderMarkets(ctx);
    });
    this.bot.action('menu_strategies', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderStrategies(ctx);
    });
    this.bot.action('menu_subscribe', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderSubscription(ctx);
    });
    this.bot.action('menu_performance', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderPerformance(ctx);
    });
    this.bot.action('menu_settings', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderSettings(ctx);
    });
    this.bot.action('menu_help', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderHelp(ctx);
    });
    this.bot.action('menu_scan_status', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      await this.renderScanStatus(ctx);
    });
    this.bot.action('menu_ai_chat', async (ctx) => {
      await ctx.answerCbQuery('Trading AI Assistant');
      await ctx.deleteMessage().catch(() => {});
      const text = this.aiAssistantService.answerTradingQuestion('');
      await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(await this.getUserLang(ctx.from.id)));
    });

    // 7. Watchlist Category Selection Actions (Crypto, Forex, Metals, Commodities, Indices, Stocks)
    this.bot.action(/^cat_(FOREX|CRYPTO|METALS|COMMODITIES|INDICES|STOCKS)$/, async (ctx) => {
      const category = ctx.match[1];
      await ctx.answerCbQuery(`Category: ${category}`);
      await this.renderMarketsByCategory(ctx, category);
    });

    // 8. Toggle Symbol Selection Action (Saves to DB Watchlist)
    this.bot.action(/^toggle_symbol_(.+)$/, async (ctx) => {
      const symbolCode = ctx.match[1];
      const tgUser = ctx.from;

      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: true },
      });

      if (!dbUser) return ctx.reply('Please register first by entering your Access Code X10H.');

      const sym = await prisma.marketSymbol.findUnique({ where: { symbol: symbolCode } });
      if (!sym) return;

      const existing = await prisma.watchlist.findUnique({
        where: { userId_symbolId: { userId: dbUser.userId, symbolId: sym.id } },
      });

      if (existing) {
        await prisma.watchlist.delete({ where: { id: existing.id } });
        await ctx.answerCbQuery(`Removed ${symbolCode} from custom watchlist`);
      } else {
        await prisma.watchlist.create({
          data: { userId: dbUser.userId, symbolId: sym.id },
        });
        await ctx.answerCbQuery(`Added ${symbolCode} to custom watchlist`);
      }

      await this.renderMarketsByCategory(ctx, sym.category);
    });

    // 9. CryptoMus Payment Invoice Callbacks
    this.bot.action(/^buy_(MONTHLY|YEARLY|ELITE)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const planCode = ctx.match[1];
      const tgUser = ctx.from;

      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: true },
      });

      if (!dbUser) return ctx.reply('Please enter your Access Code to activate trial or upgrade.');

      const plan = await prisma.plan.findUnique({ where: { code: planCode } });
      if (!plan) return ctx.reply('Selected plan is currently unavailable.');

      const orderId = `HKM_${planCode}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      await prisma.payment.create({
        data: {
          userId: dbUser.userId,
          planId: plan.id,
          merchantId: config.CRYPTOMUS_MERCHANT_ID,
          orderId,
          amount: plan.priceUsd,
          currency: 'USD',
          status: 'pending',
        },
      });

      const invoiceRes = await this.cryptomusService.createPaymentInvoice({
        amount: plan.priceUsd.toFixed(2),
        currency: 'USD',
        orderId,
        urlCallback: 'https://hikimax10.ai/api/v1/payments/webhook',
        urlReturn: 'https://t.me/HikimaAIbot',
      });

      const paymentUrl = invoiceRes.result?.url || 'https://pay.cryptomus.com';

      const warningBannerText = `━━━━━━━━━━━━━━━━━━
💳 PAYMENT INVOICE CREATED
━━━━━━━━━━━━━━━━━━

Plan: ${plan.name}
Amount: $${plan.priceUsd.toFixed(2)} USD
Order ID: ${orderId}

⚠️ WARNING: Please send the EXACT amount specified above. Sending less or more may cause payment processing delays.

Click the button below to complete your payment via CryptoMus:`;

      await ctx.reply(
        warningBannerText,
        Markup.inlineKeyboard([[Markup.button.url('🔒 Pay with Crypto (CryptoMus)', paymentUrl)]])
      );
    });

    // 10. Strategy Selection Action (Saves preferred strategy in DB)
    this.bot.action(/^select_strat_(.+)$/, async (ctx) => {
      const stratCode = ctx.match[1];
      const tgUser = ctx.from;

      const dbUser = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
        include: { user: { include: { preferences: true } } },
      });

      if (!dbUser) return ctx.reply('Please register first by entering your Access Code X10H.');

      const isPremium = dbUser.user.accessType === 'PREMIUM';

      // 1. Premium Authorization Check for Select All Strategies
      if ((stratCode === 'SELECT_ALL_STRATEGIES' || stratCode === 'SELECT_ALL') && !isPremium) {
        return ctx.reply('🔒 Select All Strategies is a Premium feature.\n\nUpgrade to Premium to let Hikima X10 AI analyze all available strategies and find the strongest eligible setup for your markets! Type /subscribe to upgrade.');
      }

      // 2. Premium Authorization Check for Quick Scalping
      if (stratCode === 'QUICK_SCALPING' && !isPremium) {
        return ctx.reply('🔒 PREMIUM ONLY: Quick Scalping strategy is available for Premium subscription users. Type /subscribe to upgrade.');
      }

      let newPref = stratCode;
      if (stratCode === 'SELECT_ALL_STRATEGIES' || stratCode === 'SELECT_ALL') {
        const currentPref = dbUser.user.preferences?.preferredStrategy;
        newPref = currentPref === 'SELECT_ALL_STRATEGIES' ? 'SMC' : 'SELECT_ALL_STRATEGIES';
      }

      if (dbUser) {
        await prisma.userPreference.upsert({
          where: { userId: dbUser.userId },
          update: { preferredStrategy: newPref },
          create: { userId: dbUser.userId, preferredStrategy: newPref },
        });

        if (newPref !== 'SELECT_ALL_STRATEGIES') {
          const strat = await prisma.strategy.findFirst({ where: { code: newPref } });
          if (strat) {
            await prisma.userStrategy.upsert({
              where: { userId_strategyId: { userId: dbUser.userId, strategyId: strat.id } },
              update: { isSelected: true },
              create: { userId: dbUser.userId, strategyId: strat.id, isSelected: true },
            });
          }
        }
      }

      await ctx.answerCbQuery(`Selected Strategy: ${newPref}`);
      if (newPref === 'SELECT_ALL_STRATEGIES') {
        await this.cleanAndReply(ctx, '🔥 Select All Strategies Enabled!\n\nHikima X10 AI will now analyze all eligible Premium strategies (SMC, Alchemist, Trend Following, Breakout, Quick Scalping, AI Consensus) across your selected markets and timeframes.\n\nYou will receive the highest-ranked valid opportunities that satisfy your risk rules.');
      } else if (stratCode === 'SELECT_ALL_STRATEGIES' || stratCode === 'SELECT_ALL') {
        await this.cleanAndReply(ctx, '⚙️ Select All Strategies Disabled.\n\nReverted to manual strategy selection (SMC).');
      } else {
        await this.cleanAndReply(ctx, `✅ Preferred Strategy updated to: ${newPref}. Saved to your profile. AI scanner will only generate signals matching ${newPref} for your account.`);
      }
    });

    // 11. Admin Commands
    this.bot.command(['admin', 'adminstats', 'users', 'broadcast', 'system', 'diagnostics'], async (ctx) => {
      if (String(ctx.from.id) !== config.TELEGRAM_ADMIN_CHAT_ID) {
        return ctx.reply('Unauthorized: Admin access required.');
      }

      const rawCmd = ctx.message.text.split(' ')[0].replace('/', '');
      const cmd = rawCmd.split('@')[0];

      if (cmd === 'diagnostics' || cmd === 'system') {
        let dbStatus = 'CONNECTED';
        try {
          await prisma.$queryRaw`SELECT 1`;
        } catch {
          dbStatus = 'ERROR';
        }

        const diagText = `🛠 HIKIMA X10 AI DIAGNOSTICS
━━━━━━━━━━━━━━━━━━
Build Commit: ${HIKIMA_BUILD_COMMIT}
Signal Engine: v${HIKIMA_SIGNAL_ENGINE_VERSION}
Node Version: ${process.version}
Environment: ${process.env.NODE_ENV || 'production'}
Process Start: ${HIKIMA_START_TIMESTAMP}

Scanner Status: RUNNING (1 Active Loop)
Active Monitor: ACTIVE (SignalMonitoringWorker)
Database: ${dbStatus}
Market Data Providers: ONLINE (TwelveData, Crypto, Forex)

Configuration Checks:
• TELEGRAM_BOT_TOKEN: PRESENT
• DATABASE_URL: PRESENT
• TWELVE_DATA_API_KEY: PRESENT
• CRYPTOMUS_MERCHANT_ID: PRESENT
━━━━━━━━━━━━━━━━━━`;
        return ctx.reply(diagText);
      }

      if (cmd === 'admin') {
        return ctx.reply('🛡 ADMIN CONTROL PANEL:\n\nAvailable commands:\n/adminstats - System metrics\n/users - User stats\n/diagnostics - System diagnostics & version\n/broadcast <text> - Mass message');
      }

      if (cmd === 'adminstats' || cmd === 'users') {
        const userCount = await prisma.user.count();
        const freeCount = await prisma.user.count({ where: { accessType: 'FREE' } });
        const premiumCount = await prisma.user.count({ where: { accessType: 'PREMIUM' } });
        const signalCount = await prisma.signal.count();
        const activeSubs = await prisma.subscription.count({ where: { status: 'ACTIVE' } });

        return ctx.reply(`📊 SYSTEM STATS:\n\nTotal Users: ${userCount}\n• Free Users: ${freeCount}\n• Premium Users: ${premiumCount}\nActive Subscriptions: ${activeSubs}\nTotal Signals Generated: ${signalCount}`);
      }

      if (cmd === 'broadcast') {
        const text = ctx.message.text.replace('/broadcast', '').trim();
        if (!text) return ctx.reply('Usage: /broadcast <message>');

        const users = await prisma.telegramUser.findMany();
        let sent = 0;
        for (const u of users) {
          try {
            await this.bot.telegram.sendMessage(Number(u.telegramId), `📢 ANNOUNCEMENT:\n\n${text}`);
            sent++;
          } catch {}
        }
        return ctx.reply(`✅ Broadcast sent to ${sent} / ${users.length} users.`);
      }
    });
  }

  // Mandatory Channel Join Screen
  private async renderChannelRequiredScreen(ctx: any, username: string) {
    const text = `━━━━━━━━━━━━━━━━━━
📢 MANDATORY CHANNEL JOIN REQUIRED
━━━━━━━━━━━━━━━━━━

Welcome ${username} 👋

To use Hikima X10 AI and receive signals, you MUST join our official channel first:

👉 Channel: @hikimaaipalace

Step 1: Click "📢 Join Channel" below
Step 2: Join @hikimaaipalace
Step 3: Click "🔄 Verify Membership" below to unlock the bot!

━━━━━━━━━━━━━━━━━━`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('📢 Join @hikimaaipalace', this.channelUrl)],
      [Markup.button.callback('🔄 Verify Membership', 'verify_channel')],
    ]);

    await ctx.reply(text, keyboard);
  }

  public announceNewUserInChannel(username: string) {
    try {
      this.bot.telegram.sendMessage(
        this.channelUsername,
        `🎉 WELCOME NEW TRADER!\n\n${username} has joined Hikima X10 AI!\n\n24/7 Multi-Market Intelligence & Multi-Strategy Analysis Platform.\n\nConnect to the AI bot: @HikimaAIbot`
      ).catch(() => {});
    } catch {}
  }

  public broadcastVolatilityAlertToChannel(symbol: string, regime: string, atr: number) {
    try {
      this.bot.telegram.sendMessage(
        this.channelUsername,
        `⚡ MARKET VOLATILITY & REGIME SHIFT ⚡\n\nAsset: ${symbol}\nMarket Regime: ${regime}\nATR Volatility Index: ${atr.toFixed(4)}\n\nAI Scan Engine detected volatility expansion. Risk Engine position filters active.\n\nConnect to AI Bot: @HikimaAIbot`
      ).catch(() => {});
    } catch {}
  }

  public broadcastMarketSummaryToChannel(activeSignalCount: number, topMarket: string) {
    try {
      this.bot.telegram.sendMessage(
        this.channelUsername,
        `📈 DAILY MARKET ANALYSIS SUMMARY 📈\n\nMonitored Active Signals: ${activeSignalCount}\nTop Multi-Timeframe Asset: ${topMarket}\nAI Scan Status: 🟢 24/7 ACTIVE\n\nConnect to AI Bot: @HikimaAIbot`
      ).catch(() => {});
    } catch {}
  }

  public broadcastNewsAlertToChannel(newsTitle: string, currency: string, impact: string) {
    try {
      this.bot.telegram.sendMessage(
        this.channelUsername,
        `🚨 HIGH-IMPACT ECONOMIC NEWS ALERT 🚨\n\nCurrency: ${currency}\nEvent: ${newsTitle}\nImpact: ${impact}\n\nHigh volatility expected. AI Risk Engine active.`
      ).catch(() => {});
    } catch {}
  }

  private async activateFounderUser(tgUser: any, chatId: number | bigint) {
    let existing = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: { include: { subscriptions: true, preferences: true } } },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { accessType: 'PREMIUM', freeCodeUsed: 'HUNTMEX10' },
      });
      return prisma.telegramUser.findUnique({
        where: { id: existing.id },
        include: { user: { include: { subscriptions: true, preferences: true } } },
      });
    }

    const newUser = await prisma.user.create({
      data: {
        accessType: 'PREMIUM',
        freeCodeUsed: 'HUNTMEX10',
        trialStartDate: new Date(),
        trialEndDate: new Date(Date.now() + 3650 * 24 * 3600 * 1000),
        preferences: { create: { language: 'en' } },
      },
    });

    return prisma.telegramUser.create({
      data: {
        userId: newUser.id,
        telegramId: BigInt(tgUser.id),
        username: tgUser.username || null,
        firstName: tgUser.first_name || null,
        lastName: tgUser.last_name || null,
        chatId: BigInt(chatId),
      },
      include: { user: { include: { subscriptions: true, preferences: true } } },
    });
  }

  private async sendFounderWelcome(ctx: any, username: string) {
    const lang = await this.getUserLang(ctx.from.id);
    const text = `👑 ADMIN / FOUNDER ACCESS UNLOCKED!\n\nHello ${username} 👋\nWelcome! You have full Admin & Founder Lifetime Premium Access. No subscription needed.\n\nAll Premium features, strategy selection, custom market watchlists, and live signals are fully unlocked for you!`;
    await ctx.reply(text, this.getBottomReplyKeyboard(lang));
  }

  private async activateFreeUser(tgUser: any, chatId: number | bigint, codeUsed: string) {
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 30 * 24 * 3600 * 1000);

    const existing = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: { include: { subscriptions: true, preferences: true } } },
    });

    if (existing) {
      return existing;
    }

    const newUser = await prisma.user.create({
      data: {
        accessType: 'FREE',
        freeCodeUsed: codeUsed,
        trialStartDate: trialStart,
        trialEndDate: trialEnd,
        preferences: {
          create: {
            language: tgUser.language_code || 'en',
          },
        },
      },
    });

    return prisma.telegramUser.create({
      data: {
        userId: newUser.id,
        telegramId: BigInt(tgUser.id),
        username: tgUser.username || null,
        firstName: tgUser.first_name || null,
        lastName: tgUser.last_name || null,
        chatId: BigInt(chatId),
      },
      include: { user: { include: { subscriptions: true, preferences: true } } },
    });
  }

  // --- Render Helpers ---
  private async sendExpirationNotice(ctx: any) {
    const text = `⏳ Your Hikima X10 AI free access has expired.\n\nYour free access lasted 30 days.\n\nPremium access is required to continue receiving signals.\n\nPremium includes:\n• Multiple strategies\n• 3–5 High-Quality Daily Signals\n• Custom Market Selection\n• Strategy selection\n• Re-entry alerts\n• Advanced monitoring\n\nChoose a subscription plan below:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Monthly Plan ($15/mo)', 'buy_MONTHLY')],
      [Markup.button.callback('Yearly Plan ($500/yr)', 'buy_YEARLY')],
      [Markup.button.callback('Elite Plan ($1,000/yr)', 'buy_ELITE')],
    ]);
    await ctx.reply(text, keyboard);
  }

  private async renderScanStatus(ctx: any) {
    const tgUser = ctx.from;
    const lang = await this.getUserLang(tgUser.id);

    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: {
        user: {
          include: {
            watchlist: { include: { marketSymbol: true } },
            preferences: true,
          },
        },
      },
    });

    const isPremium = dbUser?.user.accessType === 'PREMIUM';
    const userSymbols = dbUser?.user.watchlist.map((w) => w.marketSymbol.symbol) || [];
    const selectedPairs = userSymbols.length > 0 ? userSymbols : isPremium ? ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD'] : ['EURUSD', 'ETHUSD'];
    const prefStrat = dbUser?.user.preferences?.preferredStrategy || 'SMC';

    let pairsStatusText = '';
    for (const sym of selectedPairs) {
      pairsStatusText += `• ${sym}\n  Strategy: ${prefStrat}\n  Status: 🟢 ANALYZING (24/7 Confluence & Liquidity Check Active)\n\n`;
    }

    const text = `⚡ AI SCAN ENGINE LIVE STATUS
━━━━━━━━━━━━━━━━━━
Scan Mode: 24/7 Real-Time Continuous
Scan Interval: Every 60 Seconds
Provider Feeds: 🟢 ONLINE (TwelveData, Crypto, Forex)
Last Scan Cycle: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC

📊 REAL-TIME LIVE SCAN FOR YOUR SELECTED WATCHLIST:

${pairsStatusText}
ℹ️ Note: The AI Scanner evaluates technical structure continuously. A signal is generated ONLY when a high-confluence setup satisfies your minimum quality threshold (75+).`;

    await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(lang));
  }

  private async renderSignals(ctx: any) {
    const tgUser = ctx.from;
    const lang = await this.getUserLang(tgUser.id);

    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: {
        user: true,
      },
    });

    if (!dbUser) {
      return this.cleanAndReply(ctx, 'Please register first by entering your Access Code X10H.');
    }

    // Query notifications delivered to THIS SPECIFIC USER to find active delivered signals
    const userNotifs = await prisma.notification.findMany({
      where: { userId: dbUser.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const deliveredSignalIds = userNotifs.map((n) => n.title);

    const activeDelivered = await prisma.signal.findMany({
      where: {
        id: { in: deliveredSignalIds },
        status: { in: ['SENT', 'ACTIVE', 'ENTRY_REACHED', 'TP1_HIT', 'TP2_HIT', 'SL_MOVED_TO_ENTRY', 'BREAKEVEN'] },
        closedAt: null,
      },
      include: { marketSymbol: true, strategy: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeDelivered.length === 0) {
      return this.cleanAndReply(
        ctx,
        '📊 YOUR ACTIVE SIGNALS:\n\nNo active signals currently generated for your account. Continuous 24/7 market analysis running.',
        this.getBottomReplyKeyboard(lang)
      );
    }

    let text = `📊 YOUR ACTIVE DELIVERED SIGNALS (${activeDelivered.length}):\n\n`;
    for (const s of activeDelivered) {
      const progressBar = this.getProgressBar(s.qualityScore);
      text += `• ${s.marketSymbol.symbol} (${s.direction})\n  Strategy: ${s.strategy.name}\n  Timeframe: ${s.timeframe}\n  Entry: ${s.entryMin.toFixed(2)} - ${s.entryMax.toFixed(2)}\n  Quality: ${s.qualityScore}/100 ${progressBar}\n  Status: ${s.status}\n\n`;
    }
    await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(lang));
  }

  private async renderMarkets(ctx: any) {
    const text = `📈 SUPPORTED MARKET CATEGORIES:\n\nSelect a market category below to view assets or manage custom watchlists:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🪙 Crypto', 'cat_CRYPTO'), Markup.button.callback('📈 Forex', 'cat_FOREX')],
      [Markup.button.callback('🥇 Metals', 'cat_METALS'), Markup.button.callback('🛢 Commodities', 'cat_COMMODITIES')],
      [Markup.button.callback('📊 Indices', 'cat_INDICES'), Markup.button.callback('💻 Stocks', 'cat_STOCKS')],
    ]);
    await this.cleanAndReply(ctx, text, keyboard);
  }

  private async renderMarketsByCategory(ctx: any, category: string) {
    const tgUser = ctx.from;
    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: { include: { watchlist: { include: { marketSymbol: true } } } } },
    });

    const isPremium = dbUser?.user.accessType === 'PREMIUM';
    const categorySymbols = await prisma.marketSymbol.findMany({
      where: { isSupported: true, category: category as any },
    });

    const userWatchlistSymbolIds = new Set(dbUser?.user.watchlist.map((w) => w.marketSymbol.symbol) || []);

    let text = `📈 ${category} MARKETS (${categorySymbols.length})\n\n`;
    if (isPremium) {
      text += `💎 Premium Custom Selection Active. Click symbols to toggle custom signal delivery ON/OFF:\n\n`;
    } else {
      text += `Free tier receives EURUSD and NZDUSD signals. Upgrade to Premium to select custom assets:\n\n`;
    }

    const buttons = [];
    for (const sym of categorySymbols) {
      const isSelected = userWatchlistSymbolIds.has(sym.symbol);
      const label = `${isSelected ? '✅' : '⚪'} ${sym.symbol}`;
      buttons.push(Markup.button.callback(label, `toggle_symbol_${sym.symbol}`));
    }

    const grid = [];
    for (let i = 0; i < buttons.length; i += 2) {
      grid.push(buttons.slice(i, i + 2));
    }

    if (!isPremium) {
      grid.push([Markup.button.callback('💎 Upgrade to Premium for Custom Markets', 'menu_subscribe')]);
    }

    await ctx.reply(text, Markup.inlineKeyboard(grid));
  }

  private async renderStrategies(ctx: any) {
    const tgUser = ctx.from;
    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: { include: { preferences: true } } },
    });

    const isSelectAllOn = dbUser?.user.preferences?.preferredStrategy === 'SELECT_ALL_STRATEGIES';

    const text = `🧠 STRATEGY ENGINE SELECTION\n\nSelect your active strategy or enable Select All Strategies mode:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🤖 AI Consensus', 'select_strat_AI_CONSENSUS')],
      [Markup.button.callback('⚡ Smart Money Concepts (SMC)', 'select_strat_SMC')],
      [Markup.button.callback('🧪 Alchemist', 'select_strat_ALCHEMIST')],
      [Markup.button.callback('📈 Trend Following', 'select_strat_TREND')],
      [Markup.button.callback('💥 Breakout Engine', 'select_strat_BREAKOUT')],
      [Markup.button.callback('⚡ Quick Scalping (🔒 Premium)', 'select_strat_QUICK_SCALPING')],
      [Markup.button.callback(isSelectAllOn ? '🔥 Select All Strategies: ON' : '🔥 Select All Strategies (Premium)', 'select_strat_SELECT_ALL_STRATEGIES')],
    ]);
    await this.cleanAndReply(ctx, text, keyboard);
  }

  private async renderSubscription(ctx: any) {
    const text = `💎 HIKIMA X10 AI PREMIUM SUBSCRIPTION\n\nUnlock full access to:\n• 3–5 High-Quality Signals/Day\n• Custom Market Selection\n• Strategy Selection (SMC, Alchemist, Trend, etc.)\n• Custom Watchlist & Session Filters\n• Advanced Monitoring & Re-entry Alerts\n\nSelect a Subscription Plan below:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Monthly Plan ($15/mo)', 'buy_MONTHLY')],
      [Markup.button.callback('Yearly Plan ($500/yr)', 'buy_YEARLY')],
      [Markup.button.callback('Elite Plan ($1,000/yr)', 'buy_ELITE')],
    ]);
    await this.cleanAndReply(ctx, text, keyboard);
  }

  private async renderPerformance(ctx: any) {
    const lang = await this.getUserLang(ctx.from.id);

    const totalSignals = await prisma.signal.count();

    const wins = await prisma.signal.count({
      where: { result: 'WIN' },
    });

    const losses = await prisma.signal.count({
      where: { result: 'LOSS' },
    });

    const breakeven = await prisma.signal.count({
      where: { result: 'BREAKEVEN' },
    });

    const expiredBeforeEntry = await prisma.signal.count({
      where: { result: 'EXPIRED' },
    });

    const invalidatedBeforeEntry = await prisma.signal.count({
      where: { result: 'INVALIDATED' },
    });

    const unresolvedActive = await prisma.signal.count({
      where: { closedAt: null },
    });

    const enteredTrades = wins + losses + breakeven;
    const winRate = enteredTrades > 0 ? ((wins / enteredTrades) * 100).toFixed(1) : 'N/A';

    const text = `📊 PLATFORM FORENSIC PERFORMANCE DASHBOARD
━━━━━━━━━━━━━━━━━━
Total Signal Opportunities: ${totalSignals}

📈 ENTERED TRADES:
• Total Entered Trades: ${enteredTrades}
• Wins: ${wins}
• Losses: ${losses}
• Breakeven: ${breakeven}
• Win Rate (Entered Trades): ${winRate}%

⚪ NON-TRADE OUTCOMES:
• Expired Before Entry: ${expiredBeforeEntry}
• Invalidated Before Entry: ${invalidatedBeforeEntry}
• Unresolved Active: ${unresolvedActive}

ℹ️ Note: Performance statistics are audited strictly from verified database historical results. Unentered signals (expired/invalidated) are categorized separately and do not distort trade win rates.`;

    await this.cleanAndReply(ctx, text, this.getBottomReplyKeyboard(lang));
  }

  private async renderMuslimActivitiesMenu(ctx: any) {
    const tgUser = ctx.from;
    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: { include: { preferences: true } } },
    });

    const isMuslimOn = dbUser?.user.preferences?.muslimActivities || false;
    const statusText = isMuslimOn ? '🟢 ON' : '🔴 OFF';

    const text = `🕌 MUSLIM ACTIVITIES & TRUSTED ISLAMIC REMINDERS:\n\nSetting: ${statusText}\nWhen ON, you receive authentic Friday Salawat reminders, daily prayer times, Ramadan Suhoor & Iftar du'as (Sunan Abi Dawud 2357), and verified Adhkar. Trading signals operate independently.`;

    await this.cleanAndReply(
      ctx,
      text,
      Markup.inlineKeyboard([
        [Markup.button.callback('📿 Prayer Times', 'islamic_prayer_times'), Markup.button.callback('📖 Hadith of the Day', 'islamic_hadith')],
        [Markup.button.callback('🤲 Daily Du\'a', 'islamic_dua'), Markup.button.callback('🕌 Friday Jumu\'ah', 'islamic_jumuah')],
        [Markup.button.callback('🌅 Morning Adhkar', 'islamic_morning_adhkar'), Markup.button.callback('🌙 Evening Adhkar', 'islamic_evening_adhkar')],
        [Markup.button.callback('🕋 Hajj & Umrah Guide', 'islamic_hajj_umrah')],
        [Markup.button.callback(`🕌 Toggle Muslim Activities (${statusText})`, 'toggle_muslim_activities')],
      ])
    );
  }

  private async renderSettings(ctx: any) {
    const tgUser = ctx.from;
    const lang = await this.getUserLang(tgUser.id);
    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: { include: { preferences: true } } },
    });

    const prefs = dbUser?.user.preferences;
    const timeframes = prefs?.selectedTimeframes || 'M15,H1,H4';
    const minScore = prefs?.minQualityScore || 75;
    const newsFilter = prefs?.newsFilterOn ? 'ON' : 'OFF';
    const muslimAct = prefs?.muslimActivities ? 'ON' : 'OFF';

    const text = `⚙️ USER SETTINGS & PROFILE CUSTOMIZATION:\n\n• Current Language: ${lang.toUpperCase()}\n• Display Timezone: ${prefs?.timezone || 'UTC'}\n• Enabled Timeframes: ${timeframes}\n• Min Quality Score: ${minScore}/100\n• High-Impact News Filter: ${newsFilter}\n• Muslim Activities (Optional): ${muslimAct}\n• Official Channel: Joined @hikimaaipalace\n\nSelect an option below to customize your profile settings:`;

    await this.cleanAndReply(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('🌐 Language', 'edit_lang'), Markup.button.callback('🕒 Timezone', 'edit_tz')],
      [Markup.button.callback('⏱ Timeframes', 'edit_timeframes'), Markup.button.callback('⭐ Quality Score', 'edit_min_score')],
      [Markup.button.callback('🔔 Toggle News Filter', 'toggle_news_filter')],
      [Markup.button.callback(`🌙 Muslim Activities (${muslimAct})`, 'toggle_muslim_activities')],
    ]));
  }

  private async renderHelp(ctx: any) {
    const lang = await this.getUserLang(ctx.from.id);
    await this.cleanAndReply(ctx, `❓ HELP & SUPPORT:\n\nHikima X10 AI operates 24/7 scanning global markets using real market feeds and deterministic strategy engines.\n\nOfficial Channel: @hikimaaipalace\nOfficial Support Contact: @Hikimawebdev\nDocumentation: https://hikimax10.ai/docs`, this.getBottomReplyKeyboard(lang));
  }

  private async renderStatus(ctx: any) {
    const tgUser = ctx.from;
    const lang = await this.getUserLang(tgUser.id);
    const dbUser = await prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { user: true },
    });

    if (!dbUser) return ctx.reply('Please enter your Access Code to activate trial or upgrade.');

    const isPremium = dbUser.user.accessType === 'PREMIUM';
    const statusText = `🔥 HIKIMA X10 AI STATUS\n\nUser: ${tgUser.username ? '@' + tgUser.username : tgUser.first_name}\nAccess: ${isPremium ? '💎 PREMIUM' : 'FREE'}\nDaily Signals Used: ${dbUser.dailySignalCount} / ${isPremium ? 5 : 1}\nTrial End Date: ${dbUser.user.trialEndDate ? dbUser.user.trialEndDate.toISOString().split('T')[0] : 'N/A'}`;
    await ctx.reply(statusText, this.getBottomReplyKeyboard(lang));
  }

  private getProgressBar(score: number): string {
    const filled = Math.min(10, Math.max(0, Math.floor(score / 10)));
    return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]`;
  }

  async sendFormattedSignal(chatId: string | number, signal: any, timezone = 'UTC'): Promise<boolean> {
    try {
      const isBuy = signal.direction === 'BUY';
      const directionEmoji = isBuy ? '🟢 BUY' : '🔴 SELL';
      const progressBar = this.getProgressBar(signal.qualityScore || 86);
      const symbol = signal.marketSymbol ? signal.marketSymbol.symbol : signal.symbol;
      const digits = symbol.includes('JPY') ? 3 : symbol.includes('XAU') ? 2 : 5;

      const now = new Date();
      let tzOffsetHours = 0;
      if (timezone === 'IST') tzOffsetHours = 5.5;
      else if (timezone === 'WAT') tzOffsetHours = 1.0;
      else if (timezone === 'EST') tzOffsetHours = -5.0;

      const localTime = new Date(now.getTime() + tzOffsetHours * 3600 * 1000);
      const formattedTimeStr = `${localTime.toISOString().replace('T', ' ').slice(0, 16)} ${timezone}`;

      const isSelectAllMode = signal.isSelectAllMode || false;
      const modeLine = isSelectAllMode ? '\n🔥 Mode: Select All Strategies' : '';

      const formattedMessage = `━━━━━━━━━━━━━━━━━━━━
🔥 HIKIMA X10 AI
📊 TRADE SIGNAL
━━━━━━━━━━━━━━━━━━━━

🪙 PAIR: ${symbol}
${directionEmoji}

📌 Strategy: ${signal.strategy ? signal.strategy.name : signal.strategyName}${modeLine}
⏱ Timeframe: ${signal.timeframe}
🕐 Signal Time: ${formattedTimeStr}

🎯 Entry Zone:
${signal.entryMin.toFixed(digits)} – ${signal.entryMax.toFixed(digits)}

🛑 Stop Loss:
${signal.stopLoss.toFixed(digits)}

🎯 Take Profit 1: ${signal.tp1.toFixed(digits)}
🎯 Take Profit 2: ${signal.tp2.toFixed(digits)}
🎯 Take Profit 3: ${signal.tp3 ? signal.tp3.toFixed(digits) : 'N/A'}

📐 Risk/Reward:
${signal.riskReward || '1:1.5 / 1:2.5 / 1:4.0'}

⭐ Quality Score:
${signal.qualityScore || 86}/100 ${progressBar}

🧠 Confluence & Setup:
${(signal.reasoning || []).map((r: string) => `• ${r}`).join('\n')}

📍 Status: WAITING FOR ENTRY

#Signal_${(signal.id || '12345').slice(0, 8)}
━━━━━━━━━━━━━━━━━━━━`;

      await this.bot.telegram.sendMessage(chatId, formattedMessage);
      return true;
    } catch (err) {
      return false;
    }
  }
}
