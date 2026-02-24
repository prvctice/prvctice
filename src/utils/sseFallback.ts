/*
 * Lightweight Server-Sent Events (SSE) line parser used by the Gemini and
 * Anthropic adapters whenever the official provider SDKs are not available at
 * runtime.  Extracted into a shared helper so the near-identical logic lives
 * in one place.
 *
 * The helper consumes a Node.js readable stream and yields individual *data:*
 * payload objects once they can be parsed as complete JSON lines.  A
 * `normalise` callback is invoked for each parsed payload so the caller can
 * convert the provider-specific delta into an array of ChatChunk objects
 * ({type:'delta'|'tool_call'|'done', …}).
 */

'use strict';

import type { Readable } from 'stream';
import type { ChatChunk } from '../../types/adapters.js';

type NormaliseFn = (obj: unknown) => ChatChunk | ChatChunk[] | null | undefined;

/**
 * Iterate over a text/event-stream response and yield ChatChunk[] items using
 * the supplied provider-specific normaliser.
 */
async function* parseSSE(readable: Readable, normalise: NormaliseFn): AsyncGenerator<ChatChunk> {
  let buffer = '';

  for await (const chunk of readable) {
    // Normalise CRLF (\r\n) to LF so the loop below works regardless of the
    // provider's newline style.
    buffer += (chunk as Buffer).toString('utf8').replace(/\r/g, '');

    let nlIdx: number;
    // eslint-disable-next-line no-cond-assign
    while ((nlIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);

      // Only interested in `data:` lines – ignore comments & other SSE fields.
      if (!line.startsWith('data:')) continue;

      const payloadStr = line.slice(5).trim();

      if (payloadStr === '[DONE]') {
        yield { type: 'done' };
        return;
      }

      try {
        const parsed: unknown = JSON.parse(payloadStr);

        // The normaliser may return a single ChatChunk or an array.
        const out = normalise(parsed);
        if (Array.isArray(out)) {
          for (const c of out) {
            yield c;
          }
        } else if (out) {
          yield out;
        }
      } catch (_) {
        // Ignore JSON parse errors on incomplete fragments – once the next
        // chunk arrives the line will be re-parsed.
      }
    }
  }
}

module.exports = {
  parseSSE,
};

export { parseSSE };
