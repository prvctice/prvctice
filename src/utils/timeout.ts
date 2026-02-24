/**
 * Request timeout utilities using AbortController
 */

import logger from './logger.js';

// Default timeout in milliseconds (configurable via env)
export const DEFAULT_TIMEOUT_MS = parseInt(process.env.API_REQUEST_TIMEOUT_MS || '30000', 10);

export interface TimeoutController {
  controller: AbortController;
  signal: AbortSignal;
  cleanup: () => void;
}

/**
 * Create an AbortController with automatic timeout
 */
export function createTimeoutController(ms: number = DEFAULT_TIMEOUT_MS): TimeoutController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn('request_timeout', { timeoutMs: ms });
    controller.abort(new Error(`Request timed out after ${ms}ms`));
  }, ms);

  return {
    controller,
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Wrap a promise with timeout using AbortController
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  operationName: string = 'operation'
): Promise<T> {
  const { cleanup } = createTimeoutController(ms);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${ms}ms`));
      }, ms);
    });

    return await Promise.race([promise, timeoutPromise]);
  } finally {
    cleanup();
  }
}

/**
 * Wrap a fetch call with timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const { signal, cleanup } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    return response;
  } finally {
    cleanup();
  }
}

/**
 * Create a timeout wrapper for async generators (streaming responses)
 */
export async function* withStreamTimeout<T>(
  generator: AsyncGenerator<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  operationName: string = 'stream'
): AsyncGenerator<T> {
  let lastActivity = Date.now();

  const checkTimeout = (): void => {
    const elapsed = Date.now() - lastActivity;
    if (elapsed > ms) {
      throw new Error(`${operationName} timed out after ${ms}ms of inactivity`);
    }
  };

  const intervalId = setInterval(checkTimeout, 1000);

  try {
    for await (const chunk of generator) {
      lastActivity = Date.now();
      yield chunk;
    }
  } finally {
    clearInterval(intervalId);
  }
}

export default {
  DEFAULT_TIMEOUT_MS,
  createTimeoutController,
  withTimeout,
  fetchWithTimeout,
  withStreamTimeout,
};
