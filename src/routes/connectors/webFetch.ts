/**
 * Web-fetch connector handler with SSRF protection.
 * Validates all URLs (including redirect targets) against SSRF blocklist,
 * pins DNS resolution to prevent rebinding attacks, enforces size limits,
 * and sanitizes response headers.
 */

import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import * as ipaddr from 'ipaddr.js';
import { validateUrl } from '../../utils/ssrfGuard.js';

/** Maximum response body size: 5 MB. */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/** Maximum number of redirects to follow. */
const MAX_REDIRECTS = 5;

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT = 30_000;

/** HTTP methods allowed for web-fetch requests. */
const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
]);

/** Response headers safe to expose (no server internals, no cookies). */
const SAFE_HEADERS: ReadonlySet<string> = new Set([
  'content-type',
  'content-length',
  'last-modified',
  'etag',
  'cache-control',
]);

/**
 * Strip response headers down to the safe allowlist.
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SAFE_HEADERS.has(key.toLowerCase()) && typeof value === 'string') {
      result[key.toLowerCase()] = value;
    }
  }
  return result;
}

/**
 * Build an HTTP(S) Agent that pins DNS resolution to a specific IP.
 * This prevents DNS rebinding attacks where the hostname resolves to
 * a different (internal) IP on the actual connection.
 */
function createPinnedAgent(protocol: string, resolvedIp: string): http.Agent | https.Agent {
  const family = ipaddr.isValid(resolvedIp) && ipaddr.parse(resolvedIp).kind() === 'ipv6' ? 6 : 4;
  const AgentClass = protocol === 'https:' ? https.Agent : http.Agent;
  return new AgentClass({
    lookup: (
      _hostname: string,
      _options: unknown,
      cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) => {
      cb(null, resolvedIp, family);
    },
  });
}

/** Redirect status codes that trigger following. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch a URL with SSRF protection, redirect following, and size limits.
 */
async function fetch(params: Record<string, unknown>): Promise<unknown> {
  const rawUrl = params.url;
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new Error('url is required and must be a non-empty string');
  }

  const options = (params.options as Record<string, unknown>) ?? {};
  const method = (typeof options.method === 'string' ? options.method : 'GET').toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`HTTP method not allowed: ${method}`);
  }

  const userHeaders = (
    typeof options.headers === 'object' && options.headers !== null ? options.headers : {}
  ) as Record<string, string>;

  const body = options.body !== undefined ? options.body : undefined;

  // Initial SSRF validation
  let validated = await validateUrl(rawUrl);
  let currentUrl = validated.url;
  let currentIp = validated.resolvedIp;
  let redirectsRemaining = MAX_REDIRECTS;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const agent = createPinnedAgent(currentUrl.protocol, currentIp);
    const requestHeaders = { ...userHeaders, Host: currentUrl.host };

    const response = await axios({
      method,
      url: currentUrl.toString(),
      headers: requestHeaders,
      data: body,
      timeout: REQUEST_TIMEOUT,
      maxContentLength: MAX_RESPONSE_SIZE,
      maxBodyLength: MAX_RESPONSE_SIZE,
      maxRedirects: 0, // Handle redirects manually for SSRF re-validation
      validateStatus: () => true, // Don't throw on non-2xx
      httpAgent: currentUrl.protocol === 'http:' ? agent : undefined,
      httpsAgent: currentUrl.protocol === 'https:' ? agent : undefined,
      responseType: 'text',
    });

    // Check for redirect
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectsRemaining <= 0) {
        throw new Error('Too many redirects');
      }
      redirectsRemaining -= 1;

      const location = response.headers['location'] as string | undefined;
      if (!location) {
        throw new Error('Redirect response missing Location header');
      }

      // Resolve relative redirect URLs against the current request URL
      const redirectTarget = new URL(location, currentUrl.toString()).toString();

      // SSRF re-validation on the redirect target
      validated = await validateUrl(redirectTarget);
      currentUrl = validated.url;
      currentIp = validated.resolvedIp;
      continue;
    }

    return {
      status: response.status,
      headers: sanitizeHeaders(response.headers as Record<string, unknown>),
      data: response.data,
    };
  }
}

export const webFetchHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { fetch };
