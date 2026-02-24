/**
 * Calendar Connector
 *
 * Parses iCal (.ics) content strings into structured event arrays.
 * Uses ical.js (Mozilla-maintained, RFC 5545 compliant).
 *
 * Note: ical.js will be installed in Plan 02-02. This module is structured
 * so it works once the dependency is available.
 */

import type { ConnectorHandler } from './types';

// ==================== TYPES ====================

interface CalendarEvent {
  readonly summary: string;
  readonly description: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly location: string;
}

// ==================== HANDLER ====================

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case 'parse': {
      const content = params.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('Invalid iCal content');
      }
      return parseICalEvents(content);
    }

    default:
      throw new Error(`Unknown calendar method: ${method}`);
  }
}

async function parseICalEvents(icsContent: string): Promise<readonly CalendarEvent[]> {
  // Dynamic import -- ical.js may not be installed yet (Plan 02-02).
  // Use string variable to avoid compile-time module resolution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ICAL: any;
  try {
    const moduleName = 'ical.js';
    const mod = await import(/* @vite-ignore */ moduleName);
    // Handle both default and namespace exports
    ICAL = mod.default ?? mod;
  } catch {
    throw new Error('Calendar parsing not available: ical.js not installed');
  }

  const jcalData = ICAL.parse(icsContent);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent') as unknown[];

  return vevents.map((vevent: unknown) => {
    const event = new ICAL.Event(vevent);
    return {
      summary: (event.summary as string) ?? '',
      description: (event.description as string) ?? '',
      startDate: event.startDate?.toJSDate()?.toISOString() ?? '',
      endDate: event.endDate?.toJSDate()?.toISOString() ?? '',
      location: (event.location as string) ?? '',
    };
  });
}

export const calendarConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
