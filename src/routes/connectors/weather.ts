/**
 * Weather connector handler using Open-Meteo API.
 * Supports geocoding (city name -> coordinates) and both current weather
 * and multi-day forecast endpoints. No API key required.
 */

import axios from 'axios';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

interface GeoResult {
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
  readonly country: string;
}

async function geocode(city: string): Promise<GeoResult> {
  const res = await axios.get(GEOCODING_BASE, {
    params: { name: city, count: 1, language: 'en' },
  });
  const result = res.data?.results?.[0];
  if (!result) {
    throw new Error(`City not found: ${city}`);
  }
  return {
    lat: result.latitude,
    lon: result.longitude,
    name: result.name,
    country: result.country,
  };
}

function resolveLocation(location: unknown): { lat: number; lon: number } | Promise<GeoResult> {
  if (typeof location === 'string' && location.trim()) {
    return geocode(location.trim());
  }
  if (Array.isArray(location) && location.length >= 2) {
    const lat = Number(location[0]);
    const lon = Number(location[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
  }
  if (typeof location === 'object' && location !== null) {
    const loc = location as Record<string, unknown>;
    // Accept { lat, lon }, { latitude, longitude }
    const rawLat = loc.lat ?? loc.latitude;
    const rawLon = loc.lon ?? loc.longitude ?? loc.lng;
    if (rawLat != null && rawLon != null) {
      const lat = Number(rawLat);
      const lon = Number(rawLon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon };
      }
    }
    // Accept { name: 'City' } or { city: 'City' } — geocode the string
    const nameStr = loc.name ?? loc.city ?? loc.location;
    if (typeof nameStr === 'string' && nameStr.trim()) {
      return geocode(nameStr.trim());
    }
  }
  throw new Error(
    'Invalid location: provide a city name string, { lat, lon } object, or { city: "Name" }'
  );
}

async function current(params: Record<string, unknown>): Promise<unknown> {
  const resolved = await resolveLocation(params.location);
  const { lat, lon } = resolved;
  const units = params.units === 'imperial' ? 'fahrenheit' : 'celsius';
  const windUnit = params.units === 'imperial' ? 'mph' : 'kmh';

  const res = await axios.get(OPEN_METEO_BASE, {
    params: {
      latitude: lat,
      longitude: lon,
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
      temperature_unit: units,
      wind_speed_unit: windUnit,
      timezone: 'auto',
    },
  });

  return {
    current: res.data.current,
    units: res.data.current_units,
    location: resolved,
  };
}

async function forecast(params: Record<string, unknown>): Promise<unknown> {
  const resolved = await resolveLocation(params.location);
  const { lat, lon } = resolved;
  const days = typeof params.days === 'number' ? params.days : 7;
  const units = params.units === 'imperial' ? 'fahrenheit' : 'celsius';
  const windUnit = params.units === 'imperial' ? 'mph' : 'kmh';

  const res = await axios.get(OPEN_METEO_BASE, {
    params: {
      latitude: lat,
      longitude: lon,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      temperature_unit: units,
      wind_speed_unit: windUnit,
      timezone: 'auto',
      forecast_days: days,
    },
  });

  return {
    daily: res.data.daily,
    units: res.data.daily_units,
    location: resolved,
  };
}

export const weatherHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { current, forecast };
