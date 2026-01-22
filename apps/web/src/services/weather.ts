/**
 * Weather Service
 *
 * Fetches weather data from Open-Meteo API (free, no API key required).
 * Provides current weather conditions and dress recommendations.
 */

/**
 * Weather data returned by the service
 */
export interface WeatherData {
  /** Temperature in Fahrenheit */
  temperature: number;
  /** Temperature in Celsius */
  temperatureCelsius: number;
  /** Weather condition description */
  condition: string;
  /** Weather condition code from Open-Meteo */
  conditionCode: number;
  /** Feels like temperature in Fahrenheit */
  feelsLike?: number;
  /** Humidity percentage */
  humidity?: number;
  /** Wind speed in mph */
  windSpeed?: number;
  /** UV index (if available) */
  uvIndex?: number;
  /** Precipitation probability percentage */
  precipitationProbability?: number;
  /** Dress recommendation based on conditions */
  recommendation: string;
  /** Location name that was resolved */
  locationName: string;
  /** Timestamp when weather was fetched */
  fetchedAt: Date;
}

/**
 * Geocoding result from Open-Meteo
 */
interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string; // State/region
}

/**
 * Open-Meteo weather API response
 */
interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    uv_index_max?: number[];
    precipitation_probability_max?: number[];
  };
}

/**
 * Weather condition codes from Open-Meteo (WMO codes)
 * https://open-meteo.com/en/docs
 */
const WEATHER_CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/**
 * Geocode a location string to coordinates using Open-Meteo's geocoding API.
 *
 * @param location City name or "lat,lon" format
 * @returns Geocoding result with coordinates
 */
async function geocodeLocation(
  location: string
): Promise<{ latitude: number; longitude: number; name: string }> {
  // Check if location is already in "lat,lon" format
  const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    return {
      latitude: parseFloat(coordMatch[1]),
      longitude: parseFloat(coordMatch[2]),
      name: location,
    };
  }

  // Geocode the city name
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.statusText}`);
  }

  const data = (await response.json()) as { results?: GeocodingResult[] };

  if (!data.results || data.results.length === 0) {
    throw new Error(`Location not found: ${location}`);
  }

  const result = data.results[0];
  const locationName = result.admin1
    ? `${result.name}, ${result.admin1}`
    : `${result.name}, ${result.country}`;

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: locationName,
  };
}

/**
 * Generate a dress recommendation based on weather conditions.
 *
 * @param temp Temperature in Fahrenheit
 * @param conditionCode Weather condition code
 * @param precipProb Precipitation probability (0-100)
 * @param uvIndex UV index
 * @returns Dress recommendation string
 */
function generateDressRecommendation(
  temp: number,
  conditionCode: number,
  precipProb?: number,
  uvIndex?: number
): string {
  const recommendations: string[] = [];

  // Temperature-based clothing
  if (temp < 32) {
    recommendations.push('Heavy winter coat, layers, gloves, and hat');
  } else if (temp < 45) {
    recommendations.push('Warm jacket and layers');
  } else if (temp < 55) {
    recommendations.push('Light jacket or sweater');
  } else if (temp < 65) {
    recommendations.push('Light layers, maybe a cardigan');
  } else if (temp < 75) {
    recommendations.push('Comfortable casual wear');
  } else if (temp < 85) {
    recommendations.push('Light, breathable clothing');
  } else {
    recommendations.push('Light, loose clothing - stay cool');
  }

  // Rain/precipitation
  const isRainy = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(conditionCode);
  const isSnowy = [71, 73, 75, 77, 85, 86].includes(conditionCode);
  const isStormy = [95, 96, 99].includes(conditionCode);

  if (isRainy || isStormy || (precipProb && precipProb > 50)) {
    recommendations.push('bring an umbrella');
  }

  if (isSnowy) {
    recommendations.push('waterproof boots recommended');
  }

  // UV protection
  if (uvIndex && uvIndex >= 6) {
    recommendations.push('sunscreen and sunglasses advised');
  } else if (uvIndex && uvIndex >= 3 && conditionCode <= 2) {
    recommendations.push('consider sunglasses');
  }

  // Join recommendations
  if (recommendations.length === 1) {
    return recommendations[0];
  }

  // Capitalize first letter and join with proper punctuation
  const main = recommendations[0];
  const extras = recommendations.slice(1).join(', ');
  return `${main} - ${extras}`;
}

/**
 * Fetch current weather for a location.
 *
 * @param location City name or "lat,lon" format
 * @returns Weather data with conditions and recommendations
 */
export async function fetchWeather(location: string): Promise<WeatherData> {
  // Geocode the location
  const { latitude, longitude, name } = await geocodeLocation(location);

  // Fetch weather data
  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', latitude.toString());
  weatherUrl.searchParams.set('longitude', longitude.toString());
  weatherUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
  );
  weatherUrl.searchParams.set('daily', 'uv_index_max,precipitation_probability_max');
  weatherUrl.searchParams.set('temperature_unit', 'fahrenheit');
  weatherUrl.searchParams.set('wind_speed_unit', 'mph');
  weatherUrl.searchParams.set('timezone', 'auto');
  weatherUrl.searchParams.set('forecast_days', '1');

  const response = await fetch(weatherUrl.toString());
  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.statusText}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const current = data.current;

  const conditionCode = current.weather_code;
  const condition = WEATHER_CONDITIONS[conditionCode] || 'Unknown';
  const tempF = Math.round(current.temperature_2m);
  const tempC = Math.round(((current.temperature_2m - 32) * 5) / 9);
  const feelsLikeF = Math.round(current.apparent_temperature);
  const humidity = Math.round(current.relative_humidity_2m);
  const windSpeed = Math.round(current.wind_speed_10m);
  const uvIndex = data.daily?.uv_index_max?.[0];
  const precipProb = data.daily?.precipitation_probability_max?.[0];

  const recommendation = generateDressRecommendation(tempF, conditionCode, precipProb, uvIndex);

  return {
    temperature: tempF,
    temperatureCelsius: tempC,
    condition,
    conditionCode,
    feelsLike: feelsLikeF,
    humidity,
    windSpeed,
    uvIndex,
    precipitationProbability: precipProb,
    recommendation,
    locationName: name,
    fetchedAt: new Date(),
  };
}

/**
 * Fetch weather for a user, with fallback to a default location.
 *
 * @param userLocation User's configured location (may be null/undefined)
 * @param defaultLocation Fallback location if user hasn't configured one
 * @returns Weather data or null if fetch fails
 */
export async function fetchWeatherForUser(
  userLocation: string | null | undefined,
  defaultLocation = 'New York'
): Promise<WeatherData | null> {
  const location = userLocation || defaultLocation;

  try {
    return await fetchWeather(location);
  } catch (error) {
    console.error(
      `Failed to fetch weather for "${location}":`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Format weather for display in a brief.
 *
 * @param weather Weather data
 * @returns Formatted weather string
 */
export function formatWeatherForBrief(weather: WeatherData): string {
  const feelsLike =
    weather.feelsLike && Math.abs(weather.feelsLike - weather.temperature) >= 3
      ? ` (feels like ${weather.feelsLike}°F)`
      : '';

  return `${weather.temperature}°F${feelsLike}, ${weather.condition.toLowerCase()}`;
}
