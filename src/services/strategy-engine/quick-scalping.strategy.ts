import { StrategyEngine, StrategyResult } from './strategy.interface';
import { Candle, calculateATR, calculateEMA, calculateRSI } from '../../packages/indicators/indicators';
import { analyzeMarketStructure } from '../../packages/indicators/market-structure';

export class QuickScalpingStrategy implements StrategyEngine {
  name = 'Quick Scalping';
  requiresPremium = true;

  async analyze(symbol: string, timeframe: string, candles: Candle[]): Promise<StrategyResult> {
    const timestamp = new Date();
    if (candles.length < 20) {
      return this.noTrade(symbol, timeframe, 'Insufficient candle data for Quick Scalping', timestamp);
    }

    const structure = analyzeMarketStructure(candles);
    const lastIdx = candles.length - 1;
    const currentCandle = candles[lastIdx];
    const prevCandle = candles[lastIdx - 1];
    const price = currentCandle.close;
    const atr = calculateATR(candles, 10) || price * 0.002;
    const ema9 = calculateEMA(candles, 9);
    const ema21 = calculateEMA(candles, 21);
    const rsi = calculateRSI(candles, 9) || 50;

    if (!ema9 || !ema21) {
      return this.noTrade(symbol, timeframe, 'Micro EMA calculation unavailable', timestamp);
    }

    const pipSize = symbol.includes('JPY') ? 0.01 : symbol.includes('XAU') ? 0.1 : symbol.includes('BTC') || symbol.includes('ETH') ? 1.0 : 0.0001;

    // Fast Bullish Micro Scalp: Micro EMA crossover + RSI momentum (> 52) + Bullish displacement candle
    if (ema9 > ema21 && currentCandle.close > currentCandle.open && rsi > 52 && rsi < 75) {
      const entryMin = parseFloat((price - pipSize * 2).toFixed(5));
      const entryMax = parseFloat((price + pipSize * 2).toFixed(5));
      const stopLoss = parseFloat((Math.min(currentCandle.low, prevCandle.low) - pipSize * 5).toFixed(5));
      const risk = entryMax - stopLoss;

      if (risk <= 0) return this.noTrade(symbol, timeframe, 'Invalid risk distance', timestamp);

      const tp1 = parseFloat((entryMax + risk * 1.25).toFixed(5));
      const tp2 = parseFloat((entryMax + risk * 2.0).toFixed(5));
      const tp3 = parseFloat((entryMax + risk * 3.0).toFixed(5));

      return {
        strategyName: this.name,
        symbol,
        timeframe,
        direction: 'BUY',
        confidence: 86,
        entryZone: { min: entryMin, max: entryMax },
        stopLoss,
        takeProfitLevels: { tp1, tp2, tp3 },
        riskRewardRatio: '1:1.25 / 1:2.0 / 1:3.0',
        reasoning: [
          `Micro EMA9/21 bullish momentum crossover on ${timeframe}`,
          `RSI short-term expansion at ${rsi.toFixed(1)}`,
          `Micro swing support holding at ${stopLoss.toFixed(5)}`,
          `Fast scalping continuation target identified`,
        ],
        supportingFactors: ['Micro EMA Crossover', 'RSI Expansion', 'Micro Structure Support'],
        opposingFactors: [],
        marketRegime: structure.marketRegime,
        timestamp,
      };
    }

    // Fast Bearish Micro Scalp
    if (ema9 < ema21 && currentCandle.close < currentCandle.open && rsi < 48 && rsi > 25) {
      const entryMax = parseFloat((price + pipSize * 2).toFixed(5));
      const entryMin = parseFloat((price - pipSize * 2).toFixed(5));
      const stopLoss = parseFloat((Math.max(currentCandle.high, prevCandle.high) + pipSize * 5).toFixed(5));
      const risk = stopLoss - entryMin;

      if (risk <= 0) return this.noTrade(symbol, timeframe, 'Invalid risk distance', timestamp);

      const tp1 = parseFloat((entryMin - risk * 1.25).toFixed(5));
      const tp2 = parseFloat((entryMin - risk * 2.0).toFixed(5));
      const tp3 = parseFloat((entryMin - risk * 3.0).toFixed(5));

      return {
        strategyName: this.name,
        symbol,
        timeframe,
        direction: 'SELL',
        confidence: 86,
        entryZone: { min: entryMin, max: entryMax },
        stopLoss,
        takeProfitLevels: { tp1, tp2, tp3 },
        riskRewardRatio: '1:1.25 / 1:2.0 / 1:3.0',
        reasoning: [
          `Micro EMA9/21 bearish momentum crossover on ${timeframe}`,
          `RSI short-term sell expansion at ${rsi.toFixed(1)}`,
          `Micro swing resistance holding at ${stopLoss.toFixed(5)}`,
          `Fast scalping continuation target identified`,
        ],
        supportingFactors: ['Micro EMA Bearish Crossover', 'RSI Sell Expansion', 'Micro Structure Resistance'],
        opposingFactors: [],
        marketRegime: structure.marketRegime,
        timestamp,
      };
    }

    return this.noTrade(symbol, timeframe, 'No active micro scalping momentum confluence', timestamp);
  }

  private noTrade(symbol: string, timeframe: string, reason: string, timestamp: Date): StrategyResult {
    return {
      strategyName: this.name,
      symbol,
      timeframe,
      direction: 'NO_TRADE',
      confidence: 0,
      entryZone: { min: 0, max: 0 },
      stopLoss: 0,
      takeProfitLevels: { tp1: 0, tp2: 0, tp3: 0 },
      riskRewardRatio: 'N/A',
      reasoning: [reason],
      supportingFactors: [],
      opposingFactors: [reason],
      marketRegime: 'UNCLEAR',
      timestamp,
    };
  }
}
