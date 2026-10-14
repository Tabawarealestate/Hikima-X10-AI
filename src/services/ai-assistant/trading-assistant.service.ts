export class TradingAIAssistantService {
  public answerTradingQuestion(question: string): string {
    const qLower = question.toLowerCase();

    // Strict Security Guard: Block requests for access codes, admin keys, tokens, or illegal activities
    if (
      qLower.includes('access code') ||
      qLower.includes('code') ||
      qLower.includes('token') ||
      qLower.includes('key') ||
      qLower.includes('free access') ||
      qLower.includes('password') ||
      qLower.includes('hack') ||
      qLower.includes('leak')
    ) {
      return '⛔ SECURITY NOTICE: I am an AI Trading Assistant. I cannot reveal or distribute private access codes, passwords, or tokens. For subscription access, please use the /subscribe menu or contact official support @Hikimawebdev.';
    }

    if (qLower.includes('smc') || qLower.includes('smart money') || qLower.includes('fvg') || qLower.includes('order block')) {
      return '⚡ SMART MONEY CONCEPTS (SMC):\n\n• Liquidity Sweep: Price takes out key swing highs/lows to collect resting stop orders.\n• MSS / CHoCH: Market Structure Shift / Change of Character confirms institutional reversal.\n• Fair Value Gap (FVG): Imbalance created by strong 3-candle displacement.\n• Order Block (OB): The last opposing candle before displacement where institutional orders reside.\n\nHikima X10 AI scans SMC setups automatically on your selected symbols!';
    }

    if (qLower.includes('alchemist')) {
      return '🧪 ALCHEMIST STRATEGY:\n\n• Multi-Timeframe Alignment: Correlates H4 trend bias with H1 structure and M15 entry confirmation.\n• Volatility Expansion: Uses ATR and momentum filters to capture high-probability continuation setups.\n• Dynamic Invalidation: Places stop losses at structural invalidation points for optimum Risk/Reward.';
    }

    if (qLower.includes('risk') || qLower.includes('stop loss') || qLower.includes('take profit') || qLower.includes('lot')) {
      return '🛡 RISK MANAGEMENT PRINCIPLES:\n\n1. Always risk 1% - 2% maximum per trade.\n2. Never enter a trade without an explicit Stop Loss (SL).\n3. Aim for a Minimum Risk/Reward (R/R) ratio of 1:1.5 or higher.\n4. Protect capital first — Survive First, Trade Second, Profit Third.';
    }

    if (qLower.includes('trend') || qLower.includes('moving average')) {
      return '📈 TREND FOLLOWING STRATEGY:\n\n• Identifies established market direction using Higher Highs / Higher Lows (Bullish) or Lower Highs / Lower Lows (Bearish).\n• Waits for pullbacks into key support/resistance or moving average confluence before seeking continuation entries.';
    }

    if (qLower.includes('breakout') || qLower.includes('news')) {
      return '💥 BREAKOUT & NEWS STRADDLE:\n\n• Identifies 30-minute pre-news consolidation ranges before high-impact economic events (NFP, CPI, FOMC, GDP).\n• Places dual pending orders (BUY STOP +12 pips above high, SELL STOP -12 pips below low) with 25 pip SL and 50 pip TP to capture news spike momentum.';
    }

    return `🤖 HIKIMA TRADING AI ASSISTANT:

I am your 24/7 Trading & Market Intelligence Assistant. You can ask me questions about:

• Trading Strategies (SMC, Alchemist, Trend, Breakout)
• Technical Indicators & Market Structure (BOS, CHoCH, FVG, OB, ATR, VWAP)
• Risk Management & Position Sizing
• How to configure your Watchlist & Settings

To ask a question, type:
/ask <your question>

Example:
/ask How does SMC liquidity sweep work?`;
  }
}
