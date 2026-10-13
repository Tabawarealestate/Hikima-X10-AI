import { SignalDeduplicationService } from '../src/services/signal-engine/deduplication.service';
import { SignalMonitoringWorker } from '../src/services/monitoring/signal-monitor.worker';
import { MarketDataProvider } from '../src/services/market-data/provider.interface';
import { prisma } from '../src/database';

describe('Signal Deduplication & Lifecycle Monitoring Tests', () => {
  it('should generate deterministic fingerprints and enforce cooldown', () => {
    const dedup = new SignalDeduplicationService();

    const fp1 = dedup.generateFingerprint({
      symbol: 'XAUUSD',
      strategyCode: 'SMC',
      direction: 'BUY',
      timeframe: 'M15',
      entryMin: 2645.2,
      entryMax: 2647.0,
    });

    const fp2 = dedup.generateFingerprint({
      symbol: 'XAUUSD',
      strategyCode: 'SMC',
      direction: 'BUY',
      timeframe: 'M15',
      entryMin: 2645.2,
      entryMax: 2647.0,
    });

    expect(fp1).toBe(fp2);
    expect(dedup.isDuplicate(fp1)).toBe(false);

    dedup.recordSignal(fp1);
    expect(dedup.isDuplicate(fp1)).toBe(true);
  });

  it('should instantiate SignalMonitoringWorker with mock provider', async () => {
    const mockProvider: MarketDataProvider = {
      name: 'MockProvider',
      isAvailable: async () => true,
      fetchCandles: async () => [],
      fetchQuote: async (symbol: string) => ({
        symbol,
        bid: 2650.0,
        ask: 2650.2,
        spread: 0.2,
        timestamp: new Date(),
        provider: 'Mock',
      }),
    };

    jest.spyOn(prisma.signal, 'findMany').mockResolvedValue([] as any);

    const worker = new SignalMonitoringWorker(mockProvider);
    expect(worker).toBeDefined();
    const events = await worker.checkActiveSignals();
    expect(Array.isArray(events)).toBe(true);
  });
});
