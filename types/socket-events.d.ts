/**
 * Socket.IO typed event maps for type-safe communication between client and server.
 *
 * Usage:
 *   Server: import { Server } from 'socket.io';
 *           const io = new Server<ClientToServerEvents, ServerToClientEvents>();
 *   Client: import { Socket } from 'socket.io-client';
 *           const socket: Socket<ServerToClientEvents, ClientToServerEvents>;
 */

// -----------------------------------------------------------------------------
// Server-to-Client Events (emitted by server, received by client)
// -----------------------------------------------------------------------------

/**
 * Payload for assistant streaming chunks
 */
export interface AssistantUpdatePayload {
  chunk: string;
}

/**
 * Payload for final assistant response
 */
export interface AssistantFinalPayload {
  text: string;
}

/**
 * Payload for assistant errors
 */
export interface AssistantErrorPayload {
  error: string;
}

/**
 * Payload for generic socket errors
 */
export interface SocketErrorPayload {
  message: string;
}

/**
 * Events emitted by the server to clients
 */
export interface ServerToClientEvents {
  /** Streaming chunk from assistant */
  assistant_update: (payload: AssistantUpdatePayload) => void;
  /** Final complete response from assistant */
  assistant_final: (payload: AssistantFinalPayload) => void;
  /** Error during assistant processing */
  assistant_error: (payload: AssistantErrorPayload) => void;
  /** Generic socket error (e.g., invalid thread ID) */
  error: (payload: SocketErrorPayload) => void;
}

// -----------------------------------------------------------------------------
// Client-to-Server Events (emitted by client, received by server)
// -----------------------------------------------------------------------------

/**
 * Events emitted by the client to the server
 */
export interface ClientToServerEvents {
  /** Join a thread room to receive updates */
  'join-thread': (threadId: string) => void;
}

// -----------------------------------------------------------------------------
// Inter-server Events (for multi-server setups with Socket.IO adapters)
// -----------------------------------------------------------------------------

/**
 * Events for server-to-server communication (unused in current setup)
 */
export interface InterServerEvents {
  // Reserved for future multi-server support
}

// -----------------------------------------------------------------------------
// Socket Data (custom data attached to each socket)
// -----------------------------------------------------------------------------

/**
 * Custom data attached to each socket connection
 */
export interface SocketData {
  /** Session information from Express session middleware */
  session?: {
    id?: string;
    isTrialMode?: boolean;
    trialExpiresAt?: number;
  };
}
