/**
 * Shared connector types.
 *
 * Each connector is either 'frontend' (runs in the renderer process)
 * or 'backend' (proxied to POST /api/v1/connectors/:id/:method).
 */

export type ConnectorTier = 'frontend' | 'backend';

export interface ConnectorHandler {
  readonly tier: ConnectorTier;
  readonly handle: (
    method: string,
    params: Record<string, unknown>,
    appId: string
  ) => Promise<unknown>;
}
