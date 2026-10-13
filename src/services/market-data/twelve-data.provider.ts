import axios from 'axios';
import { MarketDataProvider, Quote } from './provider.interface';
import { Candle } from '../../packages/indicators/indicators';
import { config } from '../../config';

export class TwelveDataProvider implements MarketDataProvider {
  name = 'TwelveData';
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';

  constructor(apiKey = config.TWELVE_DATA_API_KEY) {
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.apiKey || this.apiKey.includes('demo') || this.apiKey.length < 5) {
        return false;
      }
      const res = await axios.get(`${this.baseUrl}/api_usage`, {
        params: { apikey: this.apiKey },
        timeout: 4000,
      });
      return res.status === 200 && !res.data.code;
    } catch {
      return false;
    }
  }

  private rateLimitCooldownUntil = 0;

  private formatSymbol(symbol: string): string {
    const clean = symbol.trim().toUpperCase().replace('/', '');
    const nonSlashSymbols = ['NAS100', 'SPX500', 'GER40', 'US30', 'UK100', 'JP225', 'USOIL', 'BRENT'];
    if (nonSlashSymbols.includes(clean)) {
      return clean;
    }
    if (clean.length === 6) {
      return `${clean.slice(0, 3)}/${clean.slice(3)}`;
    }
    return symbol;
  }

  async fetchCandles(symbol: string, timeframe: string, limit = 100): Promise<Candle[]> {
    if (Date.now() < this.rateLimitCooldownUntil) {
      return [];
    }
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const interval = this.mapTimeframe(timeframe);
      const res = await axios.get(`${this.baseUrl}/time_series`, {
        params: {
          symbol: formattedSymbol,
          interval,
          outputsize: limit,
          apikey: this.apiKey,
        },
        timeout: 6000,
      });

      if (res.data?.code === 429) {
        console.warn('⚠️ TwelveData API credit limit reached (8 credits/min). Activating 60s cooldown.');
        this.rateLimitCooldownUntil = Date.now() + 60 * 1000;
        return [];
      }

      if (!res.data || !res.data.values || !Array.isArray(res.data.values)) {
        return [];
      }

      const candles: Candle[] = res.data.values.map((v: any) => ({
        timestamp: new Date(v.datetime),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume || '0'),
      }));

      // Return chronological order (oldest to newest)
      return candles.reverse();
    } catch (err) {
      return [];
    }
  }

  async fetchQuote(symbol: string): Promise<Quote | null> {
    if (Date.now() < this.rateLimitCooldownUntil) {
      return null;
    }
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const res = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          symbol: formattedSymbol,
          apikey: this.apiKey,
        },
        timeout: 5000,
      });

      if (res.data?.code === 429) {
        console.warn('⚠️ TwelveData API credit limit reached (8 credits/min). Activating 60s cooldown.');
        this.rateLimitCooldownUntil = Date.now() + 60 * 1000;
        return null;
      }

      if (!res.data || !res.data.close) return null;

      const price = parseFloat(res.data.close);
      const bid = parseFloat(res.data.bid || price.toString());
      const ask = parseFloat(res.data.ask || price.toString());

      return {
        symbol,
        bid,
        ask,
        spread: Math.abs(ask - bid),
        timestamp: new Date(),
        provider: this.name,
      };
    } catch {
      return null;
    }
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      M1: '1min',
      M5: '5min',
      M15: '15min',
      M30: '30min',
      H1: '1h',
      H4: '4h',
      D1: '1day',
    };
    return map[tf] || '15min';
  }
}
