/**
 * Transport Module
 * Socket.io and fetch handling for chat communication
 */
import { ref, type Ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { getConfig } from '@web/stores/config.js';
import { getApiHeaders } from '@web/services/api.js';
import { logError } from '@web/utils/debugLog.js';
import type { SocketHandlers } from '@web/types/chat.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  AssistantUpdatePayload,
  AssistantFinalPayload,
  AssistantErrorPayload,
} from '../../../types/socket-events.js';

/** Typed Socket.IO client socket */
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Transport state
export const socket: Ref<TypedSocket | null> = ref(null);
export const socketReady: Ref<boolean> = ref(false);
export const threadId: Ref<string | null> = ref(null);

// Use a ref for the abort controller to ensure Vue reactivity doesn't interfere
// and to allow proper cleanup between requests
const fetchAbortRef: Ref<AbortController | null> = ref(null);

/**
 * Set the fetch abort controller (for external management)
 */
export function setFetchAbort(controller: AbortController | null): void {
  fetchAbortRef.value = controller;
}

/**
 * Get the current fetch abort controller
 */
export function getFetchAbort(): AbortController | null {
  return fetchAbortRef.value;
}

/**
 * Create a new AbortController for a request, safely aborting any previous one.
 * Returns the new controller's signal for use in fetch.
 */
export function createRequestAbortController(): AbortSignal {
  // Safely abort previous controller if it exists and hasn't been aborted
  const prev = fetchAbortRef.value;
  if (prev && typeof prev.abort === 'function') {
    try {
      // Only abort if the signal isn't already aborted
      if (!prev.signal?.aborted) {
        prev.abort();
      }
    } catch (_) {
      // Intentional: abort errors on previous controller are expected
    }
  }

  // Create and store new controller
  const controller = new AbortController();
  fetchAbortRef.value = controller;
  return controller.signal;
}

/**
 * Clear the current abort controller (call after request completes)
 */
export function clearFetchAbort(): void {
  fetchAbortRef.value = null;
}

/**
 * Merge API headers (including API key for remote servers) with existing headers
 */
export function withApiHeaders(options: RequestInit = {}): RequestInit {
  const headers = getApiHeaders(options.headers);
  const cfg = getConfig();
  const isCrossOrigin = !!(cfg.apiBase && /^https?:\/\//i.test(cfg.apiBase));
  return {
    ...options,
    headers,
    ...(isCrossOrigin ? { credentials: 'include' as RequestCredentials } : {}),
  };
}

/**
 * Resolve relative API paths against configured base
 */
export function apiResolve(path: string): string {
  try {
    const cfg = getConfig();
    let b = (cfg && typeof cfg.apiBase === 'string' && cfg.apiBase) || '';
    if (!b && typeof window !== 'undefined') {
      try {
        b = window.API_BASE_URL || (window.prvctice && window.prvctice.apiBaseUrl) || '';
      } catch (_) {
        // Intentional: window property access may fail in SSR
      }
    }
    if (!b) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${b}${path.startsWith('/') ? path : `/${path}`}`;
  } catch (_) {
    // Intentional: fallback to raw path if resolution fails
    return path;
  }
}

interface ThreadResponse {
  threadId?: string | null;
}

/**
 * Ensure a thread ID exists, creating one if necessary
 */
export async function ensureThread(): Promise<string | null> {
  if (threadId.value) return threadId.value;
  const cfg = getConfig();
  const f = (cfg && cfg.fetchImpl) || fetch;
  const r = await f(apiResolve('/api/thread'), withApiHeaders());
  const j = (await r.json()) as ThreadResponse;
  threadId.value = j.threadId || null;
  return threadId.value;
}

// Using typed payloads from socket-events.d.ts instead of local interfaces

/**
 * Ensure socket connection exists, creating one if necessary
 */
export function ensureSocket(handlers: SocketHandlers = {}): TypedSocket {
  if (socket.value) return socket.value;

  const cfg = getConfig();
  let base: string | undefined =
    cfg && typeof cfg.apiBase === 'string' && cfg.apiBase ? cfg.apiBase : undefined;
  if (!base && typeof window !== 'undefined') {
    try {
      base = window.API_BASE_URL || (window.prvctice && window.prvctice.apiBaseUrl) || undefined;
    } catch (_) {
      // Intentional: window property access may fail in SSR
    }
  }

  const factory = cfg && typeof cfg.socketFactory === 'function' ? cfg.socketFactory : null;
  socket.value = factory
    ? factory()
    : base
      ? io(base, { transports: ['websocket'], withCredentials: true })
      : io({ transports: ['websocket'] });

  socket.value.on('connect', () => {
    socketReady.value = true;
    // Join thread room if available
    if (threadId.value && socket.value) socket.value.emit('join-thread', threadId.value);
  });

  socket.value.on('assistant_update', (data: AssistantUpdatePayload) => {
    try {
      if (handlers.onUpdate) {
        handlers.onUpdate(data.chunk);
      }
    } catch (err) {
      logError('chat', 'transport:socketUpdate', err as Error);
    }
  });

  socket.value.on('assistant_final', (data: AssistantFinalPayload) => {
    try {
      if (handlers.onFinal) {
        handlers.onFinal({ text: data.text });
      }
    } finally {
      if (handlers.onHideThinking) {
        try {
          handlers.onHideThinking();
        } catch (_) {
          // Intentional: visual overlay callback is optional
        }
      }
    }
  });

  socket.value.on('assistant_error', (data: AssistantErrorPayload) => {
    if (handlers.onError) {
      handlers.onError(data.error || 'There was an error streaming the message.');
    }
    if (handlers.onHideThinking) {
      try {
        handlers.onHideThinking();
      } catch (_) {
        // Intentional: visual overlay callback is optional
      }
    }
  });

  return socket.value;
}

/**
 * Reset transport state (for new chat sessions)
 */
export function resetTransport(): void {
  threadId.value = null;
  // Don't disconnect socket, just clear thread
}

/**
 * Disconnect and cleanup socket
 */
export function disconnectSocket(): void {
  if (socket.value) {
    try {
      socket.value.disconnect();
    } catch (_) {
      // Intentional: socket may already be disconnected
    }
    socket.value = null;
    socketReady.value = false;
  }
}
