/**
 * Context Connector
 *
 * Provides apps with platform awareness: what apps are open,
 * which is focused, workspace info, and user preferences.
 * Low-sensitivity data — implicit permission.
 */

import { useWindowManager } from '@web/composables/useWindowManager';
import { pickProvider } from '@web/stores/chat/provider.js';
import { storage } from '@web/storage/storage.js';
import type { ConnectorHandler } from './types';

// ==================== HELPERS ====================

interface WeatherWidgetPrefs {
  name?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

interface SystemPreferences {
  temperatureUnit: 'fahrenheit' | 'celsius';
  measurementSystem: 'imperial' | 'metric';
}

function getUserPrefs(): WeatherWidgetPrefs | null {
  return storage.mirror.getJSON('weatherWidgetPrefs', null) as WeatherWidgetPrefs | null;
}

function getSystemPreferences(): SystemPreferences {
  const prefs = storage.mirror.getJSON(
    'systemPreferences',
    null
  ) as Partial<SystemPreferences> | null;
  const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
  const isUS =
    resolvedOptions.locale?.startsWith('en-US') || resolvedOptions.timeZone?.startsWith('America/');
  return {
    temperatureUnit: prefs?.temperatureUnit || (isUS ? 'fahrenheit' : 'celsius'),
    measurementSystem: prefs?.measurementSystem || (isUS ? 'imperial' : 'metric'),
  };
}

function getAvailableServices(): string[] {
  const keys = (storage.mirror.getJSON('apiKeys', {}) || {}) as Record<string, string>;
  const available: string[] = [
    // Always available (no key required)
    'weather',
    'news',
    'wikipedia',
    'sports',
    'books',
    'academic',
    'art',
  ];
  if (keys.youtube) available.push('youtube');
  if (keys.tmdb) available.push('movies');
  if (keys.discogs) available.push('music');
  return available;
}

// ==================== HANDLER ====================

async function handle(
  method: string,
  params: Record<string, unknown>,
  appId: string
): Promise<unknown> {
  void params;
  void appId;
  const wm = useWindowManager();

  switch (method) {
    case 'getOpenApps': {
      return wm.windowList.value.map((w) => ({
        id: w.appId,
        instanceId: w.instanceId,
        name: w.definition.name,
        type: w.definition.type,
      }));
    }

    case 'getActiveApp': {
      const active = wm.getActiveWindow();
      if (!active) return null;
      return {
        id: active.appId,
        instanceId: active.instanceId,
        name: active.definition.name,
        type: active.definition.type,
      };
    }

    case 'getWorkspace': {
      return {
        openAppCount: wm.windowCount.value,
      };
    }

    case 'getUser': {
      // Theme from body class
      const bodyClasses = document.body.className.split(/\s+/);
      const themeClass = bodyClasses.find((c) => c.endsWith('-theme')) ?? '';
      const theme = themeClass.replace('-theme', '') || 'night';

      // Provider from chat store utility
      const provider = pickProvider();

      // Location and timezone from settings
      const prefs = getUserPrefs();
      const timezone = prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const location = prefs?.name || null;

      // Available services (so apps know what connectors will work)
      const services = getAvailableServices();

      // System preferences (temperature, measurement)
      const systemPrefs = getSystemPreferences();

      return { theme, provider, timezone, location, services, ...systemPrefs };
    }

    default:
      throw new Error(`Unknown context method: ${method}`);
  }
}

export const contextConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
