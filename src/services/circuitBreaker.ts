/**
 * Circuit Breaker Utility
 * Tracks consecutive failures per source and blocks sources that fail repeatedly.
 * Auto-recovers after a cooldown period.
 *
 * Also provides:
 * - withRetry: exponential-backoff retry wrapper with circuit breaker integration
 * - isNonRetriable: detects 4xx errors that should not be retried
 * - getCircuitState / getCircuits: state introspection for health endpoints
 */

export const MAX_FAILURES = 3;
export const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/** Base delay for exponential backoff (ms). Attempt 0 = 500ms, attempt 1 = 1000ms. */
const RETRY_BASE_DELAY_MS = 500;

/** HTTP status codes that should never be retried. */
const NON_RETRIABLE_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422]);

export interface CircuitState {
  failures: number;
  blockedUntil: number;
}

const circuits = new Map<string, CircuitState>();

/**
 * Check if a source's circuit is open (should be skipped).
 * Returns true if failures >= MAX_FAILURES AND still within block period.
 * Auto-recovers by deleting entry once block period has passed.
 */
export function isCircuitOpen(sourceName: string): boolean {
  const state = circuits.get(sourceName);
  if (!state) return false;

  if (state.failures >= MAX_FAILURES && Date.now() < state.blockedUntil) {
    return true;
  }

  // Block period passed -- auto-recover
  if (state.failures >= MAX_FAILURES && Date.now() >= state.blockedUntil) {
    circuits.delete(sourceName);
  }

  return false;
}

/**
 * Record a failure for a source.
 * After MAX_FAILURES consecutive failures, the circuit opens for BLOCK_DURATION_MS.
 */
export function recordFailure(sourceName: string): void {
  const current = circuits.get(sourceName) || { failures: 0, blockedUntil: 0 };
  const updated: CircuitState = {
    failures: current.failures + 1,
    blockedUntil: current.blockedUntil,
  };

  if (updated.failures >= MAX_FAILURES) {
    updated.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }

  circuits.set(sourceName, updated);
}

/**
 * Record a success for a source. Resets the circuit (clears failure count).
 */
export function recordSuccess(sourceName: string): void {
  circuits.delete(sourceName);
}

/**
 * Reset all circuits. Primarily for testing.
 */
export function resetAllCircuits(): void {
  circuits.clear();
}

// ==================== Non-Retriable Detection ====================

/**
 * Determine if an error represents a non-retriable HTTP status (4xx client errors).
 * These should not trigger retries or circuit breaker failure recording.
 * Checks both axios-style (err.response.status) and fetch-style (err.status) patterns.
 */
export function isNonRetriable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  // Fetch-style: err.status
  const fetchErr = err as { status?: unknown };
  if (typeof fetchErr.status === 'number' && NON_RETRIABLE_STATUSES.has(fetchErr.status)) {
    return true;
  }

  // Axios-style: err.response.status
  const axiosErr = err as { response?: { status?: unknown } };
  if (
    axiosErr.response &&
    typeof axiosErr.response.status === 'number' &&
    NON_RETRIABLE_STATUSES.has(axiosErr.response.status)
  ) {
    return true;
  }

  return false;
}

// ==================== Retry Wrapper ====================

/**
 * Execute `fn` with exponential backoff retry and circuit breaker integration.
 *
 * Flow:
 * 1. If circuit is open, throw immediately
 * 2. Call fn(), on success record success and return
 * 3. On failure: if non-retriable (4xx), re-throw without retry or circuit recording
 * 4. If retries remain, wait with exponential backoff (500ms, 1000ms) and retry
 * 5. If all retries exhausted, record circuit failure and re-throw
 *
 * @param name - Circuit breaker name (e.g., connector ID)
 * @param fn - Async function to execute
 * @param maxRetries - Maximum retry attempts (default: 2)
 */
export async function withRetry<T>(
  name: string,
  fn: () => Promise<T>,
  maxRetries: number = 2
): Promise<T> {
  if (isCircuitOpen(name)) {
    throw new Error(`Circuit open for ${name}: too many consecutive failures`);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      recordSuccess(name);
      return result;
    } catch (err) {
      lastError = err;

      // 4xx errors: fail immediately, no retry, no circuit recording
      if (isNonRetriable(err)) {
        throw err;
      }

      // If we have retries left, wait with exponential backoff
      if (attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted -- record failure and re-throw
  recordFailure(name);
  throw lastError;
}

// ==================== State Introspection ====================

/**
 * Get the circuit state for a specific source.
 * Returns undefined if the source has no recorded failures (healthy).
 */
export function getCircuitState(name: string): CircuitState | undefined {
  return circuits.get(name);
}

/**
 * Get a read-only snapshot of all circuit states.
 * Returns a new Map so callers cannot mutate the internal state.
 */
export function getCircuits(): ReadonlyMap<string, CircuitState> {
  return new Map(circuits);
}

export default {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  resetAllCircuits,
  isNonRetriable,
  withRetry,
  getCircuitState,
  getCircuits,
};
