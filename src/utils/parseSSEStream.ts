/**
 * Shared SSE (Server-Sent Events) stream parser.
 *
 * Extracts JSON objects from an SSE response body. Used by adapters that
 * consume OpenAI-compatible streaming endpoints (LM Studio, OpenRouter).
 *
 * @example
 *   for await (const data of parseSSEStream(response.body!)) {
 *     // data is a parsed JSON object from a `data:` line
 *   }
 */

'use strict';

export interface ParseSSEOptions {
  /**
   * When true, yields `{ type: 'done' }` upon receiving `data: [DONE]`
   * before returning. When false (default), silently returns.
   */
  yieldDoneMarker?: boolean;
}

/**
 * Parse an SSE stream from a ReadableStream<Uint8Array>.
 *
 * Handles:
 * - Standard `data:` fields (with or without a space after the colon)
 * - The `[DONE]` sentinel
 * - SSE comment lines (`:` prefix) — skipped
 * - Empty keep-alive lines — skipped
 * - Remaining data in the buffer after the stream closes
 * - Malformed JSON — silently skipped
 */
export async function* parseSSEStream<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  options: ParseSSEOptions = {}
): AsyncGenerator<T, void, unknown> {
  const { yieldDoneMarker = false } = options;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (!trimmed.startsWith('data:')) continue;

        // Extract payload after `data:` — handle both `data: {...}` and `data:{...}`
        const payload = trimmed.slice(5).trimStart();

        if (payload === '[DONE]') {
          if (yieldDoneMarker) {
            yield { type: 'done' } as T;
          }
          return;
        }

        try {
          yield JSON.parse(payload) as T;
        } catch (_) {
          // Skip malformed JSON
        }
      }
    }

    // Process remaining buffer
    const remaining = buffer.trim();
    if (remaining && remaining.startsWith('data:')) {
      const payload = remaining.slice(5).trimStart();
      if (payload !== '[DONE]') {
        try {
          yield JSON.parse(payload) as T;
        } catch (_) {
          // Skip malformed JSON
        }
      } else if (yieldDoneMarker) {
        yield { type: 'done' } as T;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
