/**
 * Hash Worker
 * Performs SHA-256 hashing off the main thread for large files.
 */

interface HashRequest {
  id: number;
  buffer: ArrayBuffer;
}

interface HashResponse {
  id: number;
  hash: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<HashRequest>) => {
  const { id, buffer } = e.data;

  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const response: HashResponse = { id, hash };
    self.postMessage(response);
  } catch (err) {
    const response: HashResponse = {
      id,
      hash: '',
      error: err instanceof Error ? err.message : 'Hash computation failed',
    };
    self.postMessage(response);
  }
};
