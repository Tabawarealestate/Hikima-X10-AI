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

    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    // Day of Year
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const N = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Solar Declination (degrees) & Equation of Time (minutes)
    const B = (360 * (N - 81)) / 365;
    const declination = 23.45 * Math.sin(toRad(B));
    const EoT = 9.87 * Math.sin(toRad(2 * B)) - 7.53 * Math.cos(toRad(B)) - 1.5 * Math.sin(toRad(B));

    // Solar Noon (Local Standard Time)
    // Estimate UTC Offset from city longitude
    const utcOffset = Math.round(city.lng / 15);
    const solarNoonHours = 12 + (utcOffset * 15 - city.lng) / 15 - EoT / 60;

    // Sun Hour Angle Function for Zenith Angle alpha (degrees)
    const calculateHourAngle = (angleDeg: number): number => {
      const latRad = toRad(city.lat);
      const decRad = toRad(declination);
      const cosH = (Math.cos(toRad(angleDeg)) - Math.sin(latRad) * Math.sin(decRad)) / (Math.cos(latRad) * Math.cos(decRad));
      
      if (cosH > 1) return 0; // Sun never reaches angle (polar night)
      if (cosH < -1) return 180; // Sun never goes below angle (polar day)
      return toDeg(Math.acos(cosH));
    };

    // 1. Fajr: Sun 18 degrees below horizon (Zenith 108 deg)
    const fajrH = calculateHourAngle(108);
    const fajrHour = solarNoonHours - fajrH / 15;

    // 2. Sunrise: Sun 0.833 degrees below horizon (Zenith 90.833 deg)
    const sunriseH = calculateHourAngle(90.833);
    const sunriseHour = solarNoonHours - sunriseH / 15;

    // 3. Dhuhr: Solar Noon
    const dhuhrHour = solarNoonHours + 2 / 60;

    // 4. Asr: Shadow Factor 1 (Shafi'i/Hanbali/Maliki standard)
    const phi = Math.abs(city.lat - declination);
    const asrAngleDeg = 90 - toDeg(Math.atan(1 + Math.tan(toRad(phi))));
    const asrH = calculateHourAngle(asrAngleDeg);
    const asrHour = solarNoonHours + asrH / 15;

    // 5. Maghrib: Sunset (Zenith 90.833 deg)
    const maghribHour = solarNoonHours + sunriseH / 15 + 2 / 60;

    // 6. Isha: Sun 17 degrees below horizon (Zenith 107 deg)
    const ishaH = calculateHourAngle(107);
    const ishaHour = solarNoonHours + ishaH / 15;

    const formatTime = (h: number) => {
      const posH = (h + 24) % 24;
      const hours = Math.floor(posH);
      const mins = Math.floor((posH - hours) * 60);
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    return {
      date: dateStr,
      city: `${city.name}, ${city.country}`,
      fajr: formatTime(fajrHour),
      sunrise: formatTime(sunriseHour),
      dhuhr: formatTime(dhuhrHour),
      asr: formatTime(asrHour),
      maghrib: formatTime(maghribHour),
      isha: formatTime(ishaHour),
    };
  }
}
