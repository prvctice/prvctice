'use strict';

import crypto from 'crypto';
import type { IncomingMessage } from 'http';

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const MCP_ALLOWED_ORIGINS: readonly string[] = (process.env.MCP_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Validates a Bearer token from the Authorization header using timing-safe comparison.
 * Returns true if no MCP_AUTH_TOKEN is configured (open access) or if the token matches.
 */
function authenticateRequest(req: IncomingMessage): boolean {
  if (!MCP_AUTH_TOKEN) return true;

  const authHeader = req.headers['authorization'];
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

  if (!bearerToken) return false;

  const tokenBuf = Buffer.from(MCP_AUTH_TOKEN, 'utf8');
  const providedBuf = Buffer.from(bearerToken, 'utf8');
  return tokenBuf.length === providedBuf.length && crypto.timingSafeEqual(tokenBuf, providedBuf);
}

/**
 * Validates the request Origin header against MCP_ALLOWED_ORIGINS whitelist.
 * Returns true if no origins are configured, if no Origin header is present
 * (server-to-server / CLI), or if the origin is in the whitelist.
 */
function checkOrigin(req: IncomingMessage): boolean {
  if (MCP_ALLOWED_ORIGINS.length === 0) return true;
  const origin = req.headers.origin;
  if (!origin) return true; // server-to-server, no origin header
  return MCP_ALLOWED_ORIGINS.includes(origin);
}

export { authenticateRequest, checkOrigin };
