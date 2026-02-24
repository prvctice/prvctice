// src/server.ts
import { port } from './config/index.js';
import app from './app.js';
import http from 'http';
import { io, setupEngineMiddleware } from './socket.js';
import { setupMcpWebSocket } from './mcp/transports.js';

const server = http.createServer(app);
import logger from './utils/logger.js';
const MCP_ENABLED = process.env.MCP_ENABLED === 'true';

// Attach Socket.io to the HTTP server
// (this step might already be done inside socket.js if you configure it there)
io.attach(server);

// Setup session middleware on engine (must be after attach)
setupEngineMiddleware();

// Expose a Model Context Protocol server over WebSocket at /mcp
if (MCP_ENABLED) {
  setupMcpWebSocket(server);
}

// Listen on localhost only to avoid sandbox permission errors
// Start server on default host (0.0.0.0)
server.listen(port, () => {
  try {
    logger.info('listen', { port });
  } catch (_) {
    /* noop */
  }
});

export { server, io };

// CommonJS compatibility
module.exports = { server, io };
