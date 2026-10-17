export class MarketCalendarService {
  /**
   * Evaluates if a given financial instrument is currently tradable based on UTC market hours,
   * weekend closures, exchange schedules, and daily maintenance breaks.
   */
  public isMarketTradableNow(symbol: string): boolean {
    const cleanSym = symbol.trim().toUpperCase().replace('/', '');
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;

    // 1. CRYPTO MARKETS (BTCUSD, ETHUSD, SOLUSD, BNBUSD, XRPUSD) - 24/7 Always Open
    if (['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD'].includes(cleanSym)) {
      return true;
    }

    // 2. FOREX MARKETS (EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD, EURGBP, EURJPY, GBPJPY)
    // Forex closes Friday 21:00 UTC and reopens Sunday 21:00 UTC
    const isForex = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY'].includes(cleanSym);
    if (isForex) {
      if (day === 6) return false; // Saturday -> CLOSED
      if (day === 5 && hour >= 21) return false; // Friday after 21:00 UTC -> CLOSED
      if (day === 0 && hour < 21) return false; // Sunday before 21:00 UTC -> CLOSED
      return true;
    }

    // 3. PRECIOUS METALS (XAUUSD, XAGUSD)
    // Metals close Friday 21:00 UTC until Sunday 22:00 UTC. Daily break 21:00-22:00 UTC Mon-Thu.
    const isMetal = ['XAUUSD', 'XAGUSD'].includes(cleanSym);
    if (isMetal) {
      if (day === 6) return false; // Saturday -> CLOSED
      if (day === 5 && hour >= 21) return false; // Friday after 21:00 UTC -> CLOSED
      if (day === 0 && hour < 22) return false; // Sunday before 22:00 UTC -> CLOSED
      if (day >= 1 && day <= 4 && hour === 21) return false; // Daily maintenance 21:00-22:00 UTC
      return true;
    }

    // 4. INDICES & COMMODITIES (US30, NAS100, SPX500, GER40, UK100, JP225, USOIL, BRENT, NGAS)
    // Close Friday 21:00 UTC until Sunday 22:00 UTC.
    const isIndexOrCommodity = ['US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'JP225', 'USOIL', 'BRENT', 'NGAS'].includes(cleanSym);
    if (isIndexOrCommodity) {
      if (day === 6) return false; // Saturday -> CLOSED
      if (day === 5 && hour >= 21) return false; // Friday after 21:00 UTC -> CLOSED
      if (day === 0 && hour < 22) return false; // Sunday before 22:00 UTC -> CLOSED
      if (day >= 1 && day <= 4 && hour === 21) return false; // Daily maintenance 21:00-22:00 UTC
      return true;
    }

    // 5. STOCKS (AAPL, TSLA, NVDA, MSFT)
    // US Market Hours: Monday-Friday 13:30 to 20:00 UTC. Closed on Weekends.
    const isStock = ['AAPL', 'TSLA', 'NVDA', 'MSFT'].includes(cleanSym);
    if (isStock) {
      if (day === 0 || day === 6) return false; // Weekend -> CLOSED
      if (timeInMinutes < 13 * 60 + 30 || timeInMinutes >= 20 * 60) return false; // Outside 13:30-20:00 UTC
      return true;
    }

    // Default Fallback: Assume closed on Saturdays, open Mon-Fri
    if (day === 6) return false;
    return true;
  }
}
