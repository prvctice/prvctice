// Small helpers to resolve URLs and use injected fetch implementation.
import { getConfig } from '@web/stores/config.js';

// Extended Response type with data property
interface FetchResponse extends Response {
  data?: unknown;
}

/**
 * Get headers for API requests.
 */
export function getApiHeaders(existingHeaders: HeadersInit = {}): HeadersInit {
  return new Headers(existingHeaders);
}

export function resolve(path: string): string {
  try {
    const cfg = getConfig();
    let b = (cfg && typeof cfg.apiBase === 'string' && cfg.apiBase) || '';
    if (!b && typeof window !== 'undefined') {
      try {
        b = window.API_BASE_URL || (window.prvctice && window.prvctice.apiBaseUrl) || '';
      } catch (_) {
        // window property access may fail in SSR
      }
    }
    if (!b) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${b}${path.startsWith('/') ? path : `/${path}`}`;
  } catch (_) {
    return path;
  }
}

export async function fetchJson(url: string, options: RequestInit = {}): Promise<FetchResponse> {
  const cfg = getConfig();
  const f = (cfg && cfg.fetchImpl) || fetch;
  const isCrossOrigin = !!(cfg.apiBase && /^https?:\/\//i.test(cfg.apiBase));

  const headers = getApiHeaders(options.headers);
  const mergedOptions = {
    ...options,
    headers,
    ...(isCrossOrigin ? { credentials: 'include' as RequestCredentials } : {}),
  };

  const r = (await f(url, mergedOptions)) as FetchResponse;
  const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
  if (!ct.toLowerCase().includes('application/json')) return r;
  r.data = await r.json();
  return r;
}

export default { resolve, fetchJson };
