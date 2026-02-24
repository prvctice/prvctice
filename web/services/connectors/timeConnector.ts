/**
 * Time Connector
 *
 * Returns current time and timezone.
 * Respects user's saved timezone from Settings > System (weatherWidgetPrefs).
 * Falls back to browser's local timezone.
 */

import type { ConnectorHandler } from './types';
import { storage } from '@web/storage/storage.js';

function getUserTimezone(): string {
  const prefs = storage.mirror.getJSON('weatherWidgetPrefs', null) as { timezone?: string } | null;
  return prefs?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function handle(method: string): Promise<unknown> {
  switch (method) {
    case 'now': {
      const tz = getUserTimezone();
      // Return ISO string along with the user's configured timezone
      return {
        iso: new Date().toISOString(),
        timezone: tz,
        local: new Date().toLocaleString('en-US', { timeZone: tz }),
      };
    }

    case 'timezone':
      return getUserTimezone();

    default:
      throw new Error(`Unknown time method: ${method}`);
  }
}

export const timeConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
