import axios from 'axios';

export interface EconomicNewsEvent {
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  time: Date;
}

export class EconomicNewsService {
  private newsCache: { events: EconomicNewsEvent[]; cachedAt: number } | null = null;
  private cacheTtlMs = 10 * 60 * 1000; // 10 minutes cache

  async fetchHighImpactNews(): Promise<EconomicNewsEvent[]> {
    if (this.newsCache && Date.now() - this.newsCache.cachedAt < this.cacheTtlMs) {
      return this.newsCache.events;
    }
    try {
      // Fetch economic calendar from ForexFactory XML feed
      const res = await axios.get('https://www.forexfactory.com/ff_calendar_thisweek.xml', {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const xml = res.data;
      if (typeof xml === 'string' && xml.includes('<event>')) {
        const events: EconomicNewsEvent[] = [];
        const eventRegex = /<event>([\s\S]*?)<\/event>/gi;
        let match;

        while ((match = eventRegex.exec(xml)) !== null) {
          const content = match[1];
          const impactMatch = content.match(/<impact>([^<]+)<\/impact>/i);
          const impact = impactMatch ? impactMatch[1].trim() : '';

          if (impact.toLowerCase() === 'high') {
            const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
            const countryMatch = content.match(/<country>([^<]+)<\/country>/i);
            const dateMatch = content.match(/<date>([^<]+)<\/date>/i);
            const timeMatch = content.match(/<time>([^<]+)<\/time>/i);

            const title = titleMatch ? titleMatch[1].trim() : 'High Impact Event';
            const currency = countryMatch ? countryMatch[1].trim() : 'USD';
            const dateStr = dateMatch ? dateMatch[1].trim() : '';
            const timeStr = timeMatch ? timeMatch[1].trim() : '';

            let eventTime = new Date();
            if (dateStr && timeStr) {
              const parsed = new Date(`${dateStr} ${timeStr} UTC`);
              if (!isNaN(parsed.getTime())) {
                eventTime = parsed;
              }
            }

            events.push({
              title,
              currency,
              impact: 'HIGH',
              time: eventTime,
            });
          }
        }

        if (events.length > 0) {
          this.newsCache = { events, cachedAt: Date.now() };
          return events;
        }
      }

      return this.getFallbackNewsEvents();
    } catch {
      return this.getFallbackNewsEvents();
    }
  }

  private getFallbackNewsEvents(): EconomicNewsEvent[] {
    // Return empty array when live news calendar feed is unavailable (NO FAKE NEWS EVENTS)
    return [];
  }
}
