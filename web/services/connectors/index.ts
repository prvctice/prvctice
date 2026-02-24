/**
 * Connector Registry
 *
 * Central dispatch for connector:request bridge messages.
 * Frontend-tier connectors are called directly.
 * Backend-tier connectors are proxied to POST /api/v1/connectors/:id/:method.
 *
 * Returns ConnectorResult { data, meta? } where meta includes freshness indicators.
 * Emits connector:status events on the event bus for cross-widget awareness.
 */

import type { ConnectorHandler } from './types';
import type { AppEvents } from '@web/types/events';
import { useEventBus } from '@web/services/eventBus.js';
import { storage } from '@web/storage/storage.js';
import { resolve as apiResolve } from '@web/services/api.js';

// ==================== TYPES ====================

export interface ConnectorResponseMeta {
  readonly fresh: boolean;
  readonly cachedAt: number | null;
  readonly ageMs: number;
  readonly connectorId: string;
  readonly method: string;
}

export interface ConnectorResult {
  readonly data: unknown;
  readonly meta?: ConnectorResponseMeta;
}

// ==================== SERVICE KEYS ====================

/** Read user-provided service API keys from localStorage (set in Settings > Services). */
function getServiceKeys(): Record<string, string> {
  const stored = (storage.mirror.getJSON('apiKeys', {}) || {}) as Record<string, string>;
  const keys: Record<string, string> = {};
  // Only include non-empty service keys (not LLM provider keys)
  const serviceKeyNames = ['youtube', 'wikipedia', 'tmdb', 'discogs', 'smithsonian'] as const;
  for (const k of serviceKeyNames) {
    if (stored[k]) keys[k] = stored[k];
  }
  return keys;
}

// ==================== REGISTRY ====================

const registry = new Map<string, ConnectorHandler>();

export function registerConnector(id: string, handler: ConnectorHandler): void {
  registry.set(id, handler);
}

/**
 * Emit connector usage event for recursive learning observation (Phase 6).
 * The action observer records only the event type string (e.g. 'connector:weather:used'),
 * never the payload — so appId and method are metadata only.
 */
function emitConnectorUsed(connectorId: string, appId: string, method: string): void {
  const bus = useEventBus();
  const eventKey = `connector:${connectorId}:used` as keyof AppEvents;
  bus.emit(eventKey, { appId, method });
}

/**
 * Emit connector status event for cross-widget awareness (CONN-07).
 * Widgets can listen for connector:status to react to stale data or errors.
 */
function emitConnectorStatus(
  connectorId: string,
  status: 'healthy' | 'stale' | 'error',
  detail?: { ageMs?: number; error?: string }
): void {
  const bus = useEventBus();
  const eventKey = `connector:status` as keyof AppEvents;
  bus.emit(eventKey, { connectorId, status, ...detail });
}

export async function dispatchConnector(
  connectorId: string,
  method: string,
  params: Record<string, unknown>,
  appId: string
): Promise<ConnectorResult> {
  const handler = registry.get(connectorId);
  if (!handler) {
    throw new Error(`Unknown connector: ${connectorId}`);
  }

  if (handler.tier === 'backend') {
    const serviceKeys = getServiceKeys();
    const res = await fetch(apiResolve(`/api/v1/connectors/${connectorId}/${method}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params, appId, serviceKeys }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `Connector error: ${res.status}` }));
      const errMsg = (body as Record<string, string>).error ?? `Connector error: ${res.status}`;
      emitConnectorStatus(connectorId, 'error', { error: errMsg });
      throw new Error(errMsg);
    }
    const result = (await res.json()) as Record<string, unknown>;
    const data = result.data !== undefined ? result.data : result;
    const meta = result.meta as ConnectorResponseMeta | undefined;

    emitConnectorUsed(connectorId, appId, method);

    // Emit status event based on freshness
    if (meta && meta.fresh === false) {
      emitConnectorStatus(connectorId, 'stale', { ageMs: meta.ageMs });
    } else {
      emitConnectorStatus(connectorId, 'healthy');
    }

    return { data, meta };
  }

  const frontendResult = await handler.handle(method, params, appId);

  emitConnectorUsed(connectorId, appId, method);

  // Frontend connectors are always fresh — no meta
  return { data: frontendResult };
}

// ==================== HEALTH CHECK ====================

/**
 * Check connector health via the backend health endpoint.
 * If connectorId is provided, returns status for just that connector.
 */
export async function checkConnectorHealth(connectorId?: string): Promise<Record<string, unknown>> {
  const res = await fetch(apiResolve('/api/v1/connectors/health'));
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  const body = (await res.json()) as { connectors: Record<string, unknown> };
  if (connectorId) {
    const status = body.connectors[connectorId];
    return status ? { [connectorId]: status } : {};
  }
  return body.connectors;
}

// ==================== INITIALIZATION ====================

function initializeConnectors(): void {
  // Frontend connectors
  // Lazy imports avoid circular dependencies -- each module registers itself
  import('./storageConnector').then(({ storageConnector }) =>
    registerConnector('storage', storageConnector)
  );
  import('./timeConnector').then(({ timeConnector }) => registerConnector('time', timeConnector));
  import('./locationConnector').then(({ locationConnector }) =>
    registerConnector('location', locationConnector)
  );
  import('./skillConnector').then(({ skillConnector }) =>
    registerConnector('skills', skillConnector)
  );
  import('./calendarConnector').then(({ calendarConnector }) =>
    registerConnector('calendar', calendarConnector)
  );
  import('./clipboardConnector').then(({ clipboardConnector }) =>
    registerConnector('clipboard', clipboardConnector)
  );
  import('./filesConnector').then(({ filesConnector }) =>
    registerConnector('files', filesConnector)
  );
  import('./chatConnector').then(({ chatConnector }) => registerConnector('chat', chatConnector));
  import('./contextConnector').then(({ contextConnector }) =>
    registerConnector('context', contextConnector)
  );
  import('./broadcastConnector').then(({ broadcastConnector }) =>
    registerConnector('broadcast', broadcastConnector)
  );
  import('./vfsConnector').then(({ vfsConnector }) => registerConnector('vfs', vfsConnector));

  // Backend connectors (proxied to Express routes -- handle is never called)
  const backendStub: ConnectorHandler = {
    tier: 'backend',
    handle: () => Promise.reject(new Error('Backend connector — should be proxied')),
  };
  registerConnector('weather', backendStub);
  registerConnector('news', backendStub);
  registerConnector('web-fetch', backendStub);
  registerConnector('ai', backendStub);
  registerConnector('wikipedia', backendStub);
  registerConnector('movies', backendStub);
  registerConnector('books', backendStub);
  registerConnector('academic', backendStub);
  registerConnector('art', backendStub);
  registerConnector('music', backendStub);
  registerConnector('sports', backendStub);
  registerConnector('youtube', backendStub);
  registerConnector('markets', backendStub);
  registerConnector('geocoding', backendStub);
  registerConnector('europeana', backendStub);
  registerConnector('smithsonian', backendStub);
  registerConnector('loc', backendStub);
  registerConnector('google-books', backendStub);
  registerConnector('films', backendStub);
  registerConnector('vision', backendStub);
  registerConnector('media-tools', backendStub);
}

initializeConnectors();
