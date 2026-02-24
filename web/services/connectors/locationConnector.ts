/**
 * Location Connector
 *
 * Returns user location. Tries browser Geolocation API first,
 * falls back to saved location from Settings > System (weatherWidgetPrefs).
 */

import type { ConnectorHandler } from './types';
import { storage } from '@web/storage/storage.js';

// ==================== CONSTANTS ====================

const GEOLOCATION_TIMEOUT_MS = 10_000;
const GEOLOCATION_MAX_AGE_MS = 300_000; // 5 minutes

// ==================== SAVED LOCATION ====================

interface WeatherWidgetPrefs {
  name?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

function getSavedLocation(): { lat: number; lon: number; name: string; source: string } | null {
  const prefs = storage.mirror.getJSON('weatherWidgetPrefs', null) as WeatherWidgetPrefs | null;
  if (prefs?.latitude != null && prefs?.longitude != null) {
    return {
      lat: prefs.latitude,
      lon: prefs.longitude,
      name: prefs.name || '',
      source: 'settings',
    };
  }
  return null;
}

// ==================== HANDLER ====================

async function handle(method: string): Promise<unknown> {
  switch (method) {
    case 'current':
      return getCurrentPosition();

    default:
      throw new Error(`Unknown location method: ${method}`);
  }
}

async function getCurrentPosition(): Promise<{
  lat: number;
  lon: number;
  accuracy?: number;
  name?: string;
  source: string;
}> {
  // Try browser geolocation first
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      return await getBrowserPosition();
    } catch {
      // Fall through to saved location
    }
  }

  // Fall back to saved location from Settings > System
  const saved = getSavedLocation();
  if (saved) return saved;

  throw new Error(
    'No location available. Set your location in Settings → System, or allow browser location access.'
  );
}

function getBrowserPosition(): Promise<{
  lat: number;
  lon: number;
  accuracy: number;
  source: string;
}> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: 'browser',
        }),
      (err) => reject(new Error(`Geolocation error: ${err.message}`)),
      {
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
      }
    );
  });
}

export const locationConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
