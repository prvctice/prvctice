/**
 * Hash Worker Utility
 * Manages a web worker for SHA-256 hashing with proper lifecycle cleanup.
 */

interface PendingHash {
  resolve: (hash: string) => void;
  reject: (error: Error) => void;
}

interface HashResponse {
  id: number;
  hash: string;
  error?: string;
}

let worker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<number, PendingHash>();

/**
 * Initialize the hash worker lazily
 */
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/hash.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<HashResponse>) => {
      const { id, hash, error } = e.data;
      const pending = pendingRequests.get(id);

      if (pending) {
        pendingRequests.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(hash);
        }
      }
    };

    worker.onerror = (e) => {
      console.error('[hashWorker] Worker error:', e.message);
      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error('Worker error: ' + e.message));
        pendingRequests.delete(id);
      }
    };
  }

  return worker;
}

/**
 * Compute SHA-256 hash of an ArrayBuffer using a web worker.
 * Transfers buffer ownership to worker for performance.
 *
 * @param buffer - The data to hash (will be transferred, not copied)
 * @returns Promise resolving to hex-encoded hash string
 */
export function hashInWorker(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    try {
      const w = getWorker();
      // Transfer ownership of buffer to worker (zero-copy)
      w.postMessage({ id, buffer }, [buffer]);
    } catch (err) {
      pendingRequests.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Terminate the hash worker and clean up resources.
 * Call this when the app is shutting down or the worker is no longer needed.
 */
export function terminateHashWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }

  // Reject any pending requests
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error('Worker terminated'));
    pendingRequests.delete(id);
  }
}

/**
 * Check if the hash worker is currently active
 */
export function isHashWorkerActive(): boolean {
  return worker !== null;
}

/**
 * Get count of pending hash requests
 */
export function getPendingHashCount(): number {
  return pendingRequests.size;
}
