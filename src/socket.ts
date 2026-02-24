// src/socket.ts
import { Server, Socket } from 'socket.io';
import type { IncomingMessage } from 'http';
import type { NextFunction } from 'express';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket-events.js';
import logger from './utils/logger.js';
import sessionMiddleware from './middleware/sessionConfig.js';
import { corsAllowlist } from './middleware/corsAllowlist.js';

// Extend Socket.IO types to include session on request
interface SessionData {
  id?: string;
}

interface SocketRequest extends IncomingMessage {
  session?: SessionData;
}

interface AuthenticatedSocket extends Socket {
  request: SocketRequest;
}

// Thread ID validation: alphanumeric, hyphens, underscores, max 64 chars
const THREAD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidThreadId(threadId: unknown): threadId is string {
  return typeof threadId === 'string' && THREAD_ID_PATTERN.test(threadId);
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>({
  cors: {
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allowed?: boolean) => void
    ): void {
      // Allow requests with no origin (server-to-server, Electron)
      if (!origin) {
        callback(null, true);
        return;
      }
      // Check allowlist or localhost pattern
      if (corsAllowlist.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      logger.warn('socket_cors_rejected', { origin });
      callback(new Error(`Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Setup session middleware on the engine
// Must be called after io.attach(server) since engine is only available then
function setupEngineMiddleware(): void {
  if (!io.engine) {
    logger.warn('socket_engine_not_available', {
      message: 'io.engine not available, skipping session middleware',
    });
    return;
  }
  io.engine.use((req: SocketRequest, res: unknown, next: (err?: unknown) => void) => {
    // Cast to Express-compatible types for the session middleware
    // The session middleware will populate req.session
    const expressNext: NextFunction = (err?: unknown) => next(err);
    sessionMiddleware(
      req as Parameters<typeof sessionMiddleware>[0],
      res as Parameters<typeof sessionMiddleware>[1],
      expressNext
    );
  });
}

// Authentication middleware for Socket.IO connections
io.use((socket: Socket, next: (err?: Error) => void) => {
  const sock = socket as AuthenticatedSocket;
  const session = sock.request?.session;

  // Skip auth in development mode
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Check if session exists (indicates authenticated request)
  // Trial state is client-managed (localStorage) — no server session fields to check
  const hasSession = session?.id !== undefined;

  if (hasSession) {
    return next();
  }

  logger.warn('socket_auth_rejected', {
    socketId: socket.id,
    hasSession: !!session,
  });
  return next(new Error('Authentication required'));
});

io.on('connection', (socket: Socket) => {
  try {
    logger.info('socket_connected', { id: socket.id });
  } catch (_) {
    /* noop */
  }

  // Listen for join requests from clients with input validation
  socket.on('join-thread', (threadId: unknown) => {
    // Validate threadId format
    if (!isValidThreadId(threadId)) {
      logger.warn('socket_invalid_thread_id', {
        socketId: socket.id,
        threadId: typeof threadId === 'string' ? threadId.slice(0, 100) : typeof threadId,
      });
      socket.emit('error', { message: 'Invalid thread ID format' });
      return;
    }

    socket.join(threadId);
    try {
      logger.debug('socket_join', { id: socket.id, room: threadId });
    } catch (_) {
      /* noop */
    }
  });

  socket.on('disconnect', () => {
    try {
      logger.info('socket_disconnected', { id: socket.id });
    } catch (_) {
      /* noop */
    }
  });
});

export { io, setupEngineMiddleware };

// CommonJS compatibility
module.exports = { io, setupEngineMiddleware };
