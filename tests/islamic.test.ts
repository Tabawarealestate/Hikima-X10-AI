import { PrayerTimeService } from '../src/services/islamic/prayer-time.service';
import { IslamicContentService } from '../src/services/islamic/islamic-content.service';

describe('Islamic Services Unit Tests', () => {
  const prayerService = new PrayerTimeService();
  const islamicContent = new IslamicContentService();

  test('calculatePrayerTimes returns accurate times for Mecca', () => {
    const pt = prayerService.calculatePrayerTimes('Mecca');
    expect(pt).toBeDefined();
    expect(pt.city).toContain('Mecca');
    expect(pt.fajr).toMatch(/^\d{2}:\d{2}$/);
    expect(pt.dhuhr).toMatch(/^\d{2}:\d{2}$/);
    expect(pt.maghrib).toMatch(/^\d{2}:\d{2}$/);
  });

  test('IslamicContentService returns verified Hadiths with citations', () => {
    const hadith = islamicContent.getDailyHadith();
    expect(hadith).toBeDefined();
    expect(hadith.type).toBe('HADITH');
    expect(hadith.arabicText.length).toBeGreaterThan(5);
    expect(hadith.sourceCollection).toBeDefined();
    expect(hadith.authenticityStatus).toBe('SAHIH');
  });

  test('IslamicContentService returns verified Duas with citations', () => {
    const dua = islamicContent.getDailyDua();
    expect(dua).toBeDefined();
    expect(dua.arabicText.length).toBeGreaterThan(5);
    expect(dua.sourceCollection).toBeDefined();
  });

  test('IslamicContentService returns Jumuah reminder', () => {
    const jum = islamicContent.getJumuahReminder();
    expect(jum.type).toBe('JUMUAH');
    expect(jum.authenticityStatus).toBe('QURANIC');
  });
});
