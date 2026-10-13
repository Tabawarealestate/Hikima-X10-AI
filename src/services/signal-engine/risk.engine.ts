export interface RiskCheckResult {
  isApproved: boolean;
  rejectionReason?: string;
  riskScore: number;
}

export interface RiskCheckInput {
  symbol: string;
  direction: 'BUY' | 'SELL';
  qualityScore: number;
  spread: number;
  pipSize: number;
  dailySignalsSent: number;
  maxDailyQuota: number;
  isHighImpactNewsImminent?: boolean;
  entryMin?: number;
  entryMax?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
}

export class RiskEngine {
  private minQualityThreshold = 75;
  private maxSpreadPips = 5.0;

  validateCandidateSetup(setup: {
    symbol: string;
    direction: 'BUY' | 'SELL';
    entryMin?: number;
    entryMax?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
  }): { isValid: boolean; reason?: string } {
    // If trade parameters are provided, perform strict parameter & R/R validation
    if (setup.entryMin === undefined && setup.entryMax === undefined && setup.stopLoss === undefined) {
      return { isValid: true };
    }

    if (!setup.entryMin || !setup.entryMax || setup.entryMin <= 0 || setup.entryMax <= 0) {
      return { isValid: false, reason: 'INVALID_ENTRY_ZONE: Missing or non-positive entry boundaries.' };
    }
    if (!setup.stopLoss || setup.stopLoss <= 0) {
      return { isValid: false, reason: 'INVALID_STOP_LOSS: Missing or non-positive stop loss price.' };
    }
    if (!setup.tp1 || !setup.tp2 || setup.tp1 <= 0 || setup.tp2 <= 0) {
      return { isValid: false, reason: 'INVALID_TAKE_PROFIT: Missing or non-positive take profit levels.' };
    }

    const avgEntry = (setup.entryMin + setup.entryMax) / 2;
    const isBuy = setup.direction === 'BUY';
    const risk = isBuy ? avgEntry - setup.stopLoss : setup.stopLoss - avgEntry;
    const reward = isBuy ? setup.tp1 - avgEntry : avgEntry - setup.tp1;

    if (risk <= 0) {
      return { isValid: false, reason: 'INVALID_STOP_LOSS_DIRECTION: Stop loss on wrong side of entry zone.' };
    }
    if (reward <= 0) {
      return { isValid: false, reason: 'INVALID_TAKE_PROFIT_DIRECTION: Take profit on wrong side of entry zone.' };
    }

    const rrRatio = reward / risk;
    if (rrRatio < 1.0) {
      return { isValid: false, reason: `INSUFFICIENT_RISK_REWARD: R/R ratio (${rrRatio.toFixed(2)}) is below minimum required 1:1.0.` };
    }

    return { isValid: true };
  }

  evaluateRisk(input: RiskCheckInput): RiskCheckResult {
    // 0. Complete Parameters & R/R Check
    const paramValidation = this.validateCandidateSetup(input);
    if (!paramValidation.isValid) {
      return {
        isApproved: false,
        rejectionReason: paramValidation.reason,
        riskScore: 0,
      };
    }
    // 1. Daily Quota Check
    if (input.dailySignalsSent >= input.maxDailyQuota) {
      return {
        isApproved: false,
        rejectionReason: `Daily signal quota reached (${input.dailySignalsSent}/${input.maxDailyQuota}). No further trade generation today.`,
        riskScore: 0,
      };
    }

    // 2. Minimum Signal Quality Score
    if (input.qualityScore < this.minQualityThreshold) {
      return {
        isApproved: false,
        rejectionReason: `Signal quality score (${input.qualityScore}/100) below minimum required threshold (${this.minQualityThreshold}/100).`,
        riskScore: input.qualityScore,
      };
    }

    // 3. Spread Filter Check
    const spreadInPips = input.spread / input.pipSize;
    if (spreadInPips > this.maxSpreadPips) {
      return {
        isApproved: false,
        rejectionReason: `Excessive spread detected: ${spreadInPips.toFixed(1)} pips exceeds maximum allowed limit (${this.maxSpreadPips} pips).`,
        riskScore: 0,
      };
    }

    // 4. High Impact News Event Filter
    if (input.isHighImpactNewsImminent) {
      return {
        isApproved: false,
        rejectionReason: `High-impact economic news event imminent within 15 minutes. Trade rejected by Risk Engine.`,
        riskScore: 0,
      };
    }

    return {
      isApproved: true,
      riskScore: input.qualityScore,
    };
  }
}
