import { StrategyEngine, StrategyResult } from './strategy.interface';
import { SMCStrategy } from './smc.strategy';
import { AlchemistStrategy } from './alchemist.strategy';
import { TrendFollowingStrategy } from './trend.strategy';
import { BreakoutStrategy } from './breakout.strategy';
import { ReversalStrategy } from './reversal.strategy';
import { SupplyDemandStrategy } from './supply-demand.strategy';
import { QuickScalpingStrategy } from './quick-scalping.strategy';
import { Candle } from '../../packages/indicators/indicators';

export interface ConsensusResult {
  symbol: string;
  timeframe: string;
  finalDirection: 'BUY' | 'SELL' | 'NO_TRADE';
  consensusScore: number; // 0 - 100
  buyVotes: number;
  sellVotes: number;
  noTradeVotes: number;
  participatingStrategies: string[];
  chosenSetup: StrategyResult | null;
  summaryReasoning: string[];
}

export class EnsembleEngine {
  private strategies: StrategyEngine[];

  constructor() {
    this.strategies = [
      new SMCStrategy(),
      new AlchemistStrategy(),
      new TrendFollowingStrategy(),
      new BreakoutStrategy(),
      new ReversalStrategy(),
      new SupplyDemandStrategy(),
      new QuickScalpingStrategy(),
    ];
  }

  async evaluateConsensus(symbol: string, timeframe: string, candles: Candle[]): Promise<ConsensusResult> {
    const results: StrategyResult[] = [];

    for (const strat of this.strategies) {
      try {
        const res = await strat.analyze(symbol, timeframe, candles);
        results.push(res);
      } catch (err) {
        // Log & skip failed strategy evaluation
      }
    }

    let buyCount = 0;
    let sellCount = 0;
    let noTradeCount = 0;

    let bestBuySetup: StrategyResult | null = null;
    let bestSellSetup: StrategyResult | null = null;

    for (const r of results) {
      if (r.direction === 'BUY') {
        buyCount++;
        if (!bestBuySetup || r.confidence > bestBuySetup.confidence) bestBuySetup = r;
      } else if (r.direction === 'SELL') {
        sellCount++;
        if (!bestSellSetup || r.confidence > bestSellSetup.confidence) bestSellSetup = r;
      } else {
        noTradeCount++;
      }
    }

    const totalStrats = results.length;
    const buyRatio = buyCount / totalStrats;
    const sellRatio = sellCount / totalStrats;

    // Minimum consensus requirement: At least 2 active strategy votes without major opposing conflict
    if (buyCount >= 2 && sellCount === 0 && bestBuySetup) {
      const consensusScore = Math.min(98, Math.round(bestBuySetup.confidence * (1 + buyRatio * 0.2)));
      return {
        symbol,
        timeframe,
        finalDirection: 'BUY',
        consensusScore,
        buyVotes: buyCount,
        sellVotes: sellCount,
        noTradeVotes: noTradeCount,
        participatingStrategies: results.map((r) => `${r.strategyName}: ${r.direction}`),
        chosenSetup: bestBuySetup,
        summaryReasoning: [
          `AI Consensus reached: ${buyCount}/${totalStrats} strategies voted BUY`,
          ...bestBuySetup.reasoning,
        ],
      };
    }

    if (sellCount >= 2 && buyCount === 0 && bestSellSetup) {
      const consensusScore = Math.min(98, Math.round(bestSellSetup.confidence * (1 + sellRatio * 0.2)));
      return {
        symbol,
        timeframe,
        finalDirection: 'SELL',
        consensusScore,
        buyVotes: buyCount,
        sellVotes: sellCount,
        noTradeVotes: noTradeCount,
        participatingStrategies: results.map((r) => `${r.strategyName}: ${r.direction}`),
        chosenSetup: bestSellSetup,
        summaryReasoning: [
          `AI Consensus reached: ${sellCount}/${totalStrats} strategies voted SELL`,
          ...bestSellSetup.reasoning,
        ],
      };
    }

    // High Quality Single Strategy Match (e.g. SMC or Alchemist high-confidence setup >= 85)
    if (buyCount === 1 && sellCount === 0 && bestBuySetup && bestBuySetup.confidence >= 85) {
      return {
        symbol,
        timeframe,
        finalDirection: 'BUY',
        consensusScore: bestBuySetup.confidence,
        buyVotes: buyCount,
        sellVotes: sellCount,
        noTradeVotes: noTradeCount,
        participatingStrategies: results.map((r) => `${r.strategyName}: ${r.direction}`),
        chosenSetup: bestBuySetup,
        summaryReasoning: [
          `High-Quality Single Strategy Setup: ${bestBuySetup.strategyName}`,
          ...bestBuySetup.reasoning,
        ],
      };
    }

    if (sellCount === 1 && buyCount === 0 && bestSellSetup && bestSellSetup.confidence >= 85) {
      return {
        symbol,
        timeframe,
        finalDirection: 'SELL',
        consensusScore: bestSellSetup.confidence,
        buyVotes: buyCount,
        sellVotes: sellCount,
        noTradeVotes: noTradeCount,
        participatingStrategies: results.map((r) => `${r.strategyName}: ${r.direction}`),
        chosenSetup: bestSellSetup,
        summaryReasoning: [
          `High-Quality Single Strategy Setup: ${bestSellSetup.strategyName}`,
          ...bestSellSetup.reasoning,
        ],
      };
    }

    // Output explicit NO TRADE if conflicting or insufficient consensus
    return {
      symbol,
      timeframe,
      finalDirection: 'NO_TRADE',
      consensusScore: 0,
      buyVotes: buyCount,
      sellVotes: sellCount,
      noTradeVotes: noTradeCount,
      participatingStrategies: results.map((r) => `${r.strategyName}: ${r.direction}`),
      chosenSetup: null,
      summaryReasoning: [
        buyCount > 0 && sellCount > 0
          ? `Strategy Conflict Detected: ${buyCount} BUY vs ${sellCount} SELL votes. AI Consensus prefers NO TRADE.`
          : `No strategy satisfied minimum entry confidence threshold.`,
      ],
    };
  }
}
