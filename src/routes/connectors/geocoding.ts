/**
 * Geocoding connector handler.
 * Forward geocoding via Open-Meteo (place name -> coordinates).
 * Reverse geocoding via Nominatim/OpenStreetMap (coordinates -> place name).
 * Both methods use an in-memory LRU cache with 24h TTL.
 * Nominatim calls are serialized with a 1 req/s throttle.
 * No API keys required for either service.
 */

import axios from 'axios';

const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

// ==================== LRU CACHE ====================

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 200;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// ==================== NOMINATIM THROTTLE ====================

let _lastNominatimCall = 0;
let _nominatimQueue: Promise<void> = Promise.resolve();

function throttledNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const task = _nominatimQueue.then(async () => {
    const elapsed = Date.now() - _lastNominatimCall;
    if (elapsed < 1000) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    const result = await fn();
    _lastNominatimCall = Date.now();
    return result;
  });

  // Chain future calls after this one
  _nominatimQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

// ==================== FORWARD GEOCODE ====================

async function geocode(params: Record<string, unknown>): Promise<unknown> {
  const name = params.name as string;
  if (!name || typeof name !== 'string') {
    throw new Error('name parameter required');
  }

  const cacheKey = `geo:${name.toLowerCase().trim()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await axios.get(OPEN_METEO_GEOCODE, {
    params: { name: name.trim(), count: 5, language: 'en' },
  });

  const results = (res.data?.results || []).map((r: Record<string, unknown>) => ({
    lat: r.latitude,
    lon: r.longitude,
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    timezone: r.timezone,
  }));

  const data = { results };
  setCache(cacheKey, data);
  return data;
}

// ==================== REVERSE GEOCODE ====================

async function reverseGeocode(params: Record<string, unknown>): Promise<unknown> {
  const lat = Number(params.lat);
  const lon = Number(params.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('lat and lon parameters required');
  }

  // Round to 4 decimal places for cache key (~11m precision)
  const cacheKey = `rgeo:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await throttledNominatim(async () => {
    const res = await axios.get(NOMINATIM_REVERSE, {
      params: {
        lat,
        lon,
        format: 'json',
        zoom: 14, // city-level detail
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'prvctice-app/1.0', // Nominatim requires User-Agent
      },
    });

    return {
      name: res.data.display_name,
      lat: parseFloat(res.data.lat),
      lon: parseFloat(res.data.lon),
      address: res.data.address,
    };
  });

  setCache(cacheKey, data);
  return data;
}

// ==================== HANDLER EXPORT ====================

export const geocodingHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = {
  geocode: async (params) => geocode(params),
  reverseGeocode: async (params) => reverseGeocode(params),
};
