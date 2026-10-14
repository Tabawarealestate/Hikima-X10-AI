import crypto from 'crypto';
import { prisma } from '../../database';

export interface FingerprintParams {
  symbol: string;
  strategyCode: string;
  direction: string;
  timeframe: string;
  entryMin?: number;
  entryMax?: number;
}

export class SignalDeduplicationService {
  generateFingerprint(params: FingerprintParams & { timestamp?: Date }): string {
    const timeKey = params.timestamp
      ? new Date(params.timestamp).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16);
    const entryKey = `${params.entryMin || 0}:${params.entryMax || 0}`;
    const rawKey = `${params.symbol.toUpperCase()}:${params.strategyCode.toUpperCase()}:${params.direction.toUpperCase()}:${params.timeframe}:${timeKey}:${entryKey}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  async isDatabaseDuplicate(symbolId: string, direction: string, cooldownHours = 4): Promise<boolean> {
    // 1. Check if an active unclosed signal is ALREADY open for this symbol in PostgreSQL
    const openActiveSignal = await prisma.signal.findFirst({
      where: {
        symbolId,
        status: {
          in: ['GENERATED', 'SENT', 'ACTIVE', 'ENTRY_REACHED', 'TP1_HIT', 'TP2_HIT', 'SL_MOVED_TO_ENTRY', 'BREAKEVEN'],
        },
      },
    });

    if (openActiveSignal) {
      return true;
    }

    // 2. Check symbol cooldown in PostgreSQL (default 4 hours)
    const cooldownTime = new Date(Date.now() - cooldownHours * 3600 * 1000);
    const recentSignal = await prisma.signal.findFirst({
      where: {
        symbolId,
        createdAt: { gte: cooldownTime },
      },
    });

    if (recentSignal) {
      return true;
    }

    return false;
  }

  private activeFingerprints: Map<string, number> = new Map();

  isDuplicate(fingerprint: string): boolean {
    const lastSeen = this.activeFingerprints.get(fingerprint);
    if (!lastSeen) return false;
    return Date.now() - lastSeen < 3600 * 1000;
  }

  recordSignal(fingerprint: string): void {
    this.activeFingerprints.set(fingerprint, Date.now());
  }
}
