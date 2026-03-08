/**
 * OpenWeatherMap API client — free tier (1000 calls/day).
 * Sign up at https://openweathermap.org/api to get an API key.
 * Set REACT_APP_OPENWEATHER_API_KEY in your .env file.
 */

const API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY ?? '';
const BASE = 'https://api.openweathermap.org/data/2.5';

export interface WeatherData {
  city: string;
  temp: number;          // Celsius
  feelsLike: number;     // Celsius
  humidity: number;      // %
  windSpeed: number;     // m/s
  description: string;
  icon: string;          // OpenWeatherMap icon code
  iconUrl: string;
  sunrise: number;       // Unix timestamp
  sunset: number;        // Unix timestamp
}

export interface ForecastDay {
  date: string;          // e.g. "Mon, Mar 10"
  tempMin: number;
  tempMax: number;
  description: string;
  icon: string;
  iconUrl: string;
  rain: number;          // mm
}

function iconUrl(code: string): string {
  return `https://openweathermap.org/img/wn/${code}@2x.png`;
}

export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherData> {
  if (!API_KEY) throw new Error('OpenWeatherMap API key not configured');
  const res = await fetch(
    `${BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
  );
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const d = await res.json();
  return {
    city: d.name,
    temp: Math.round(d.main.temp),
    feelsLike: Math.round(d.main.feels_like),
    humidity: d.main.humidity,
    windSpeed: d.wind.speed,
    description: d.weather[0].description,
    icon: d.weather[0].icon,
    iconUrl: iconUrl(d.weather[0].icon),
    sunrise: d.sys.sunrise,
    sunset: d.sys.sunset,
  };
}

export async function get5DayForecast(lat: number, lon: number): Promise<ForecastDay[]> {
  if (!API_KEY) throw new Error('OpenWeatherMap API key not configured');
  const res = await fetch(
    `${BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
  );
  if (!res.ok) throw new Error(`Forecast API error: ${res.status}`);
  const d = await res.json();

  // Group by day, pick noon reading
  const byDay: Record<string, typeof d.list[0]> = {};
  for (const item of d.list) {
    const day = item.dt_txt.split(' ')[0];
    if (!byDay[day] || item.dt_txt.includes('12:00')) {
      byDay[day] = item;
    }
  }

  return Object.values(byDay).slice(0, 5).map((item) => ({
    date: new Date(item.dt * 1000).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
    tempMin: Math.round(item.main.temp_min),
    tempMax: Math.round(item.main.temp_max),
    description: item.weather[0].description,
    icon: item.weather[0].icon,
    iconUrl: iconUrl(item.weather[0].icon),
    rain: item.rain?.['3h'] ?? 0,
  }));
}
