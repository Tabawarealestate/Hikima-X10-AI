export interface CityLocation {
  name: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
}

export interface DailyPrayerTimes {
  date: string;
  city: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export class PrayerTimeService {
  public supportedCities: CityLocation[] = [
    { name: 'Mecca', country: 'Saudi Arabia', lat: 21.4225, lng: 39.8262, timezone: 'Asia/Riyadh' },
    { name: 'Medina', country: 'Saudi Arabia', lat: 24.4672, lng: 39.6112, timezone: 'Asia/Riyadh' },
    { name: 'Cairo', country: 'Egypt', lat: 30.0444, lng: 31.2357, timezone: 'Africa/Cairo' },
    { name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' },
    { name: 'New York', country: 'USA', lat: 40.7128, lng: -74.006, timezone: 'America/New_York' },
    { name: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792, timezone: 'Africa/Lagos' },
    { name: 'Kano', country: 'Nigeria', lat: 12.0022, lng: 8.592, timezone: 'Africa/Lagos' },
    { name: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708, timezone: 'Asia/Dubai' },
    { name: 'Karachi', country: 'Pakistan', lat: 24.8607, lng: 67.0011, timezone: 'Asia/Karachi' },
    { name: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lng: 101.6869, timezone: 'Asia/Kuala_Lumpur' },
    { name: 'Jakarta', country: 'Indonesia', lat: -6.2088, lng: 106.8456, timezone: 'Asia/Jakarta' },
    { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784, timezone: 'Europe/Istanbul' },
  ];

  public getCity(cityName: string): CityLocation {
    const found = this.supportedCities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
    return found || this.supportedCities[0]; // Default to Mecca
  }

  public calculatePrayerTimes(cityName = 'Mecca', date = new Date()): DailyPrayerTimes {
    const city = this.getCity(cityName);
    const dateStr = date.toISOString().split('T')[0];

    // Astronomical Solar Declination & Solar Noon Equations
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    const declination = 23.45 * Math.sin(((284 + dayOfYear) * Math.PI) / 180);
    
    // Standard Noon Calculation (UTC offset approximation)
    const solarNoonHour = 12 - city.lng / 15;
    const noonLocal = (solarNoonHour + 3) % 24; // Standardized Saudi/East GMT+3 reference

    const formatHour = (h: number) => {
      const hours = Math.floor(h) % 24;
      const mins = Math.floor((h - Math.floor(h)) * 60);
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    return {
      date: dateStr,
      city: `${city.name}, ${city.country}`,
      fajr: formatHour(noonLocal - 6.8),
      sunrise: formatHour(noonLocal - 5.5),
      dhuhr: formatHour(noonLocal + 0.2),
      asr: formatHour(noonLocal + 3.4),
      maghrib: formatHour(noonLocal + 5.8),
      isha: formatHour(noonLocal + 7.2),
    };
  }
}
