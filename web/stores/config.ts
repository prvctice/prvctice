// Runtime configuration store for the Prvctice frontend.
// Used by stores/composables outside of setup() via direct import.

import type { Socket } from 'socket.io-client';
import { logError } from '@web/utils/debugLog.js';

export interface StoreConfig {
  apiBase: string;
  features: {
    domHooks: boolean;
  };
  socketFactory: (() => Socket) | undefined;
  fetchImpl: typeof fetch | undefined;
  markdownRenderer: ((text: string) => string) | undefined;
  sanitizeHtml: ((html: string) => string) | undefined;
}

let _config: Readonly<StoreConfig> = Object.freeze({
  apiBase: '',
  features: { domHooks: true },
  socketFactory: undefined,
  fetchImpl: undefined,
  markdownRenderer: undefined,
  sanitizeHtml: undefined,
});

export interface ConfigInput {
  apiBase?: string;
  features?: {
    domHooks?: boolean;
  };
  socketFactory?: () => Socket;
  fetchImpl?: typeof fetch;
  markdownRenderer?: (text: string) => string;
  sanitizeHtml?: (html: string) => string;
}

export function setConfig(cfg: ConfigInput = {}): void {
  try {
    const next: StoreConfig = {
      apiBase: typeof cfg.apiBase === 'string' ? cfg.apiBase : '',
      features: {
        domHooks:
          cfg.features && typeof cfg.features.domHooks === 'boolean' ? cfg.features.domHooks : true,
      },
      socketFactory: typeof cfg.socketFactory === 'function' ? cfg.socketFactory : undefined,
      fetchImpl: typeof cfg.fetchImpl === 'function' ? cfg.fetchImpl : undefined,
      markdownRenderer:
        typeof cfg.markdownRenderer === 'function' ? cfg.markdownRenderer : undefined,
      sanitizeHtml: typeof cfg.sanitizeHtml === 'function' ? cfg.sanitizeHtml : undefined,
    };
    _config = Object.freeze(next);
  } catch (e) {
    // Keep prior config on failure
    logError('config', 'setConfig', e as Error);
  }
}

export function getConfig(): Readonly<StoreConfig> {
  return _config;
}

export default { setConfig, getConfig };
