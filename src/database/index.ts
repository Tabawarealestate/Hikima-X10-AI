import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function seedInitialData() {
  // 1. Seed Plans
  const plans = [
    { code: 'MONTHLY', name: 'Monthly Plan', priceUsd: 15.0, billingPeriod: '30d', dailySignalLimit: 5 },
    { code: 'YEARLY', name: 'Yearly Plan', priceUsd: 500.0, billingPeriod: '365d', dailySignalLimit: 5 },
    { code: 'ELITE', name: 'Elite Plan', priceUsd: 1000.0, billingPeriod: '365d', dailySignalLimit: 10 },
  ];

  for (const p of plans) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: { priceUsd: p.priceUsd, name: p.name, dailySignalLimit: p.dailySignalLimit },
      create: p,
    });
  }

  // 2. Seed Strategies
  const strategies = [
    { code: 'SMC', name: 'Smart Money Concepts', description: 'BOS, CHoCH, MSS, Order Blocks, FVGs, Sweeps', requiresPremium: false },
    { code: 'ALCHEMIST', name: 'Alchemist', description: 'Multi-timeframe structure, liquidity, momentum, volatility', requiresPremium: true },
    { code: 'TREND', name: 'Trend Following', description: 'Moving averages, HH/HL, ADX momentum alignment', requiresPremium: false },
    { code: 'BREAKOUT', name: 'Breakout Engine', description: 'Support/Resistance & Range expansion with volume confirmation', requiresPremium: false },
    { code: 'REVERSAL', name: 'Mean Reversion & Reversal', description: 'Statistical overextension, RSI divergence, rejection candles', requiresPremium: true },
    { code: 'SD', name: 'Supply & Demand', description: 'Fresh zone identification and displacement origin', requiresPremium: false },
    { code: 'MARTINGALE', name: 'Martingale (Controlled)', description: 'Hard risk-bounded position escalation (Disabled by default)', requiresPremium: true },
    { code: 'ANTI_MARTINGALE', name: 'Anti-Martingale', description: 'Position scaling only after winning trades', requiresPremium: true },
    { code: 'GRID', name: 'Grid Trading', description: 'Configurable grid spacing with strict volatility filter', requiresPremium: true },
    { code: 'HEDGING', name: 'Hedging Engine', description: 'Correlated position detection and risk offset', requiresPremium: true },
    { code: 'AI_CONSENSUS', name: 'AI Consensus Ensemble', description: 'Multi-strategy voting & regime-weighted setup scoring', requiresPremium: true },
  ];

  for (const s of strategies) {
    await prisma.strategy.upsert({
      where: { code: s.code },
      update: { name: s.name, description: s.description, requiresPremium: s.requiresPremium },
      create: s,
    });
  }

  // 3. Seed Market Symbols across Categories
  const symbols = [
    // Metals
    { symbol: 'XAUUSD', name: 'Gold vs US Dollar', category: 'METALS', pipSize: 0.1, digits: 2 },
    { symbol: 'XAGUSD', name: 'Silver vs US Dollar', category: 'METALS', pipSize: 0.01, digits: 2 },
    // Forex
    { symbol: 'EURUSD', name: 'Euro vs US Dollar', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'GBPUSD', name: 'Great Britain Pound vs US Dollar', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'USDJPY', name: 'US Dollar vs Japanese Yen', category: 'FOREX', pipSize: 0.01, digits: 3 },
    { symbol: 'USDCHF', name: 'US Dollar vs Swiss Franc', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'USDCAD', name: 'US Dollar vs Canadian Dollar', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'AUDUSD', name: 'Australian Dollar vs US Dollar', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'NZDUSD', name: 'New Zealand Dollar vs US Dollar', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'EURGBP', name: 'Euro vs Great Britain Pound', category: 'FOREX', pipSize: 0.0001, digits: 5 },
    { symbol: 'EURJPY', name: 'Euro vs Japanese Yen', category: 'FOREX', pipSize: 0.01, digits: 3 },
    { symbol: 'GBPJPY', name: 'Great Britain Pound vs Japanese Yen', category: 'FOREX', pipSize: 0.01, digits: 3 },
    // Crypto
    { symbol: 'BTCUSD', name: 'Bitcoin vs US Dollar', category: 'CRYPTO', pipSize: 1.0, digits: 2 },
    { symbol: 'ETHUSD', name: 'Ethereum vs US Dollar', category: 'CRYPTO', pipSize: 0.1, digits: 2 },
    { symbol: 'SOLUSD', name: 'Solana vs US Dollar', category: 'CRYPTO', pipSize: 0.01, digits: 2 },
    { symbol: 'BNBUSD', name: 'Binance Coin vs US Dollar', category: 'CRYPTO', pipSize: 0.1, digits: 2 },
    { symbol: 'XRPUSD', name: 'Ripple vs US Dollar', category: 'CRYPTO', pipSize: 0.0001, digits: 4 },
    // Commodities
    { symbol: 'USOIL', name: 'WTI Crude Oil', category: 'COMMODITIES', pipSize: 0.01, digits: 2 },
    { symbol: 'BRENT', name: 'Brent Crude Oil', category: 'COMMODITIES', pipSize: 0.01, digits: 2 },
    { symbol: 'NGAS', name: 'Natural Gas', category: 'COMMODITIES', pipSize: 0.001, digits: 3 },
    // Indices
    { symbol: 'NAS100', name: 'US Tech 100 Index', category: 'INDICES', pipSize: 1.0, digits: 2 },
    { symbol: 'US30', name: 'Dow Jones Industrial Average', category: 'INDICES', pipSize: 1.0, digits: 2 },
    { symbol: 'SPX500', name: 'S&P 500 Index', category: 'INDICES', pipSize: 0.1, digits: 2 },
    { symbol: 'GER40', name: 'German DAX 40 Index', category: 'INDICES', pipSize: 1.0, digits: 2 },
    { symbol: 'UK100', name: 'FTSE 100 Index', category: 'INDICES', pipSize: 1.0, digits: 2 },
    { symbol: 'JP225', name: 'Nikkei 225 Index', category: 'INDICES', pipSize: 1.0, digits: 2 },
    // Stocks
    { symbol: 'AAPL', name: 'Apple Inc.', category: 'STOCKS', pipSize: 0.01, digits: 2 },
    { symbol: 'TSLA', name: 'Tesla Inc.', category: 'STOCKS', pipSize: 0.01, digits: 2 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', category: 'STOCKS', pipSize: 0.01, digits: 2 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', category: 'STOCKS', pipSize: 0.01, digits: 2 },
  ];

  for (const sym of symbols) {
    await prisma.marketSymbol.upsert({
      where: { symbol: sym.symbol },
      update: { name: sym.name, category: sym.category as any, pipSize: sym.pipSize, digits: sym.digits },
      create: { ...sym, category: sym.category as any },
    });
  }

  // 4. Seed Sessions
  const sessions = [
    { sessionName: 'Asian Session', utcOpenHour: 0, utcCloseHour: 8 },
    { sessionName: 'London Session', utcOpenHour: 7, utcCloseHour: 16 },
    { sessionName: 'New York Session', utcOpenHour: 12, utcCloseHour: 21 },
    { sessionName: 'London/New York Overlap', utcOpenHour: 12, utcCloseHour: 16 },
  ];

  for (const sess of sessions) {
    const existing = await prisma.marketSession.findFirst({ where: { sessionName: sess.sessionName } });
    if (!existing) {
      await prisma.marketSession.create({ data: sess });
    }
  }

  // 5. Seed System Settings
  const defaultSettings = [
    { key: 'FREE_ACCESS_CODE', value: { code: 'X10H', trialDays: 30 }, description: 'Default registration code and trial length' },
    { key: 'RISK_LIMITS', value: { maxDailySignals: 5, maxConsecutiveMartingale: 3, defaultRiskReward: 2.0 }, description: 'Central safety thresholds' },
  ];

  for (const set of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: set.key },
      update: { value: set.value },
      create: set,
    });
  }

  // 6. Clean up legacy unclosed test signals created > 12h ago
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000);
    await prisma.signal.updateMany({
      where: {
        createdAt: { lt: twelveHoursAgo },
        closedAt: null,
      },
      data: {
        status: 'EXPIRED',
        closedAt: new Date(),
        result: 'EXPIRED',
      },
    });
  } catch (err) {
    console.error('⚠️ Legacy signal cleanup warning:', err);
  }
}
