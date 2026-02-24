'use strict';

import crypto, { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Express, Request, Response, NextFunction } from 'express';
import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { authenticateRequest, checkOrigin } from './auth.js';
import { createPrvcticeMcpServer } from './server.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Session map for Streamable HTTP transport instances
// ---------------------------------------------------------------------------

interface TransportEntry {
  transport: StreamableHTTPServerTransport;
  createdAt: number;
}

const mcpTransports = new Map<string, TransportEntry>();

const TRANSPORT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of mcpTransports) {
    if (now - entry.createdAt > TRANSPORT_TTL_MS) {
      try {
        entry.transport.close?.();
      } catch {
        /* ignore */
      }
      mcpTransports.delete(sid);
      logger.info('mcp_transport_expired', { sessionId: sid });
    }
  }
}, SWEEP_INTERVAL_MS).unref();

// ---------------------------------------------------------------------------
// Auth middleware for Express routes
// ---------------------------------------------------------------------------

function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!checkOrigin(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (!authenticateRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Streamable HTTP transport (POST/GET/DELETE /mcp)
// ---------------------------------------------------------------------------

/**
 * Mounts MCP Streamable HTTP transport routes on the Express app.
 *
 * - POST /mcp  -- Handle JSON-RPC requests (initialize, tools/call, etc.)
 * - GET  /mcp  -- SSE stream for server-initiated notifications
 * - DELETE /mcp -- Session cleanup
 */
function mountMcpTransports(app: Express): void {
  // POST /mcp -- handle JSON-RPC requests
  app.post('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const entry = sessionId ? mcpTransports.get(sessionId) : undefined;
      let transport = entry?.transport;

      if (!transport) {
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No active session' },
            id: null,
          });
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            mcpTransports.set(sid, { transport: transport!, createdAt: Date.now() });
          },
        });

        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) mcpTransports.delete(sid);
        };

        const mcpServer = createPrvcticeMcpServer();
        await mcpServer.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.warn('mcp_http_post_error', { error: (err as Error).message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error' });
      }
    }
  });

  // GET /mcp -- SSE stream for server-initiated notifications
  app.get('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? mcpTransports.get(sessionId)?.transport : undefined;

    if (!transport) {
      res.status(400).json({ error: 'No active session' });
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      logger.warn('mcp_http_get_error', { error: (err as Error).message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error' });
      }
    }
  });

  // DELETE /mcp -- session cleanup
  app.delete('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? mcpTransports.get(sessionId)?.transport : undefined;

    if (!transport) {
      res.status(400).json({ error: 'No active session' });
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      logger.warn('mcp_http_delete_error', { error: (err as Error).message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error' });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// WebSocket Server Transport (custom Transport implementation for ws)
// ---------------------------------------------------------------------------

/**
 * Minimal MCP Transport adapter for a ws WebSocket connection.
 *
 * Bridges the ws WebSocket messages to the SDK's Transport interface,
 * allowing McpServer.connect() to work over WebSocket.
 */
class WebSocketServerTransport implements Transport {
  private ws: WebSocket;
  sessionId: string;

  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.sessionId = randomUUID();

    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(
          typeof data === 'string' ? data : data.toString('utf8')
        ) as JSONRPCMessage;
        this.onmessage?.(msg);
      } catch (err) {
        this.onerror?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    ws.on('close', () => {
      this.onclose?.();
    });

    ws.on('error', (err: Error) => {
      this.onerror?.(err);
    });
  }

  async start(): Promise<void> {
    // No-op: WebSocket is already connected when this transport is created
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async close(): Promise<void> {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------
// WebSocket transport setup (upgrade at /mcp)
// ---------------------------------------------------------------------------

/**
 * Sets up MCP WebSocket transport on the HTTP server.
 *
 * Handles upgrade requests to /mcp, applies auth (Bearer token + origin),
 * creates a WebSocketServerTransport per connection, and connects an
 * McpServer instance to each.
 */
function setupMcpWebSocket(server: HttpServer): void {
  const ALLOWED_PROTOCOLS = ['mcp', 'json', 'jsonrpc'];

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols: Set<string>): string | false {
      for (const allowed of ALLOWED_PROTOCOLS) {
        for (const p of protocols) {
          if (typeof p === 'string' && p.toLowerCase() === allowed) {
            return allowed;
          }
        }
      }
      return false;
    },
  });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname: string | null = null;
    try {
      const base = `http://${req.headers.host || 'localhost'}`;
      const url = new URL(req.url || '/', base);
      pathname = url.pathname;
    } catch {
      pathname = null;
    }

    if (pathname !== '/mcp') {
      // Not for us -- let other upgrade handlers (Socket.IO) handle it
      return;
    }

    // Auth: Bearer token
    if (!authenticateRequest(req)) {
      // Also check query param token fallback for WebSocket clients
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const queryToken = url.searchParams.get('token');

      if (!queryToken || !authenticateQueryToken(queryToken)) {
        logger.warn('mcp_ws_auth_rejected');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    // Auth: Origin validation
    if (!checkOrigin(req)) {
      logger.warn('mcp_ws_origin_rejected', { origin: req.headers.origin });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const transport = new WebSocketServerTransport(ws);
    const mcpServer = createPrvcticeMcpServer();

    mcpServer.connect(transport).catch((err: Error) => {
      logger.warn('mcp_ws_connect_error', { error: err.message });
      ws.close();
    });

    ws.on('error', (err: Error) => {
      logger.warn('mcp_ws_error', { error: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Query token auth helper for WebSocket upgrade fallback
// ---------------------------------------------------------------------------

/**
 * Validates a query parameter token against MCP_AUTH_TOKEN.
 * Used for WebSocket clients that cannot set Authorization headers on upgrade.
 */
function authenticateQueryToken(token: string): boolean {
  const authToken = process.env.MCP_AUTH_TOKEN || '';
  if (!authToken) return true; // No auth configured

  const tokenBuf = Buffer.from(authToken, 'utf8');
  const providedBuf = Buffer.from(token, 'utf8');
  return tokenBuf.length === providedBuf.length && crypto.timingSafeEqual(tokenBuf, providedBuf);
}

export { mountMcpTransports, setupMcpWebSocket };
