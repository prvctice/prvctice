/**
 * URL Stream Accumulator
 *
 * Buffers streaming output at URL boundaries to validate complete URLs
 * before emitting them to the client. Non-URL text passes through immediately
 * for zero-latency display.
 *
 * States:
 * - PASSTHROUGH: Emit text immediately, watch for URL start markers
 * - BUFFERING: Accumulate text until a complete URL boundary is found
 */

import type { ConversationUrlTracker } from '../../services/urlValidator';

/** Accumulator state */
type AccumulatorState = 'PASSTHROUGH' | 'BUFFERING';

/** Maximum buffer size before safety-valve emit */
const MAX_BUFFER_SIZE = 500;

/** Regex for a complete URL (must start with http:// or https://) */
const URL_PATTERN = /https?:\/\/[^\s)\]>,"']+/;

/** Markdown link pattern: [text](url) */
const MARKDOWN_LINK_PATTERN = /^\[([^\]]*)\]\((https?:\/\/[^\s)\]>,"']+)\)/;

/** Characters that signal the end of a URL */
const URL_BOUNDARY_CHARS = new Set([' ', '\t', '\n', '\r', ')', ']', '>', '"', "'"]);

/**
 * Accumulates streaming text chunks and validates URLs before emitting.
 * Non-URL text passes through with zero latency.
 */
export class UrlStreamAccumulator {
  private readonly tracker: ConversationUrlTracker;
  private buffer: string = '';
  private state: AccumulatorState = 'PASSTHROUGH';

  constructor(tracker: ConversationUrlTracker) {
    this.tracker = tracker;
  }

  /**
   * Push a chunk of text. Returns array of validated segments to emit.
   * May return empty array if text is being buffered.
   */
  push(chunk: string): string[] {
    if (this.state === 'PASSTHROUGH') {
      return this.handlePassthrough(chunk);
    }
    return this.handleBuffering(chunk);
  }

  /**
   * Flush remaining buffer (call on stream end).
   * Validates any buffered URL before emitting.
   */
  flush(): string[] {
    if (!this.buffer) return [];

    const result = this.validateAndEmitBuffer();
    this.buffer = '';
    this.state = 'PASSTHROUGH';
    return result;
  }

  private handlePassthrough(chunk: string): string[] {
    // Look for URL start markers or markdown link start
    const httpIdx = chunk.indexOf('http');
    const bracketIdx = chunk.indexOf('[');

    // Find earliest potential URL start
    let triggerIdx = -1;
    if (httpIdx >= 0 && bracketIdx >= 0) {
      triggerIdx = Math.min(httpIdx, bracketIdx);
    } else if (httpIdx >= 0) {
      triggerIdx = httpIdx;
    } else if (bracketIdx >= 0) {
      // Only trigger on [ if it could be a markdown link (followed by text and ](http...)
      // We buffer to check, but only if there's reason to suspect a link
      triggerIdx = bracketIdx;
    }

    if (triggerIdx < 0) {
      // No potential URL markers -- emit entire chunk immediately
      return chunk ? [chunk] : [];
    }

    const segments: string[] = [];

    // Emit text before the trigger
    if (triggerIdx > 0) {
      segments.push(chunk.slice(0, triggerIdx));
    }

    // Start buffering from the trigger point
    this.buffer = chunk.slice(triggerIdx);
    this.state = 'BUFFERING';

    // Try to resolve the buffer immediately (URL might be complete in this chunk)
    const resolved = this.tryResolveBuffer();
    if (resolved.length > 0) {
      segments.push(...resolved);
    }

    return segments;
  }

  private handleBuffering(chunk: string): string[] {
    this.buffer += chunk;

    // Safety valve: if buffer gets too large, emit raw
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      const raw = this.buffer;
      this.buffer = '';
      this.state = 'PASSTHROUGH';
      return [raw];
    }

    return this.tryResolveBuffer();
  }

  /**
   * Try to find a complete URL in the buffer and validate it.
   * Returns segments to emit, or empty array if still buffering.
   */
  private tryResolveBuffer(): string[] {
    // Check for markdown link first: [text](url)
    const mdMatch = this.buffer.match(MARKDOWN_LINK_PATTERN);
    if (mdMatch) {
      const fullMatch = mdMatch[0]!;
      const url = mdMatch[2]!;
      const validated = this.tracker.stripOrFlagUrl(fullMatch, url);
      const remainder = this.buffer.slice(fullMatch.length);

      this.buffer = '';
      this.state = 'PASSTHROUGH';

      const segments = [validated];
      // Process remainder (may contain more URLs)
      if (remainder) {
        segments.push(...this.handlePassthrough(remainder));
      }
      return segments;
    }

    // Check for bare URL
    const urlMatch = this.buffer.match(URL_PATTERN);
    if (urlMatch && urlMatch.index !== undefined) {
      const matchStart = urlMatch.index;
      const matchEnd = matchStart + urlMatch[0]!.length;

      // Check if we've reached a boundary after the URL
      if (matchEnd < this.buffer.length) {
        const charAfter = this.buffer[matchEnd]!;
        if (URL_BOUNDARY_CHARS.has(charAfter)) {
          // Complete URL found -- validate it
          const beforeUrl = this.buffer.slice(0, matchStart);
          const rawUrl = urlMatch[0]!.replace(/[.,;:!?]+$/, '');
          const validated = this.tracker.stripOrFlagUrl(rawUrl, rawUrl);
          // Keep any trailing punctuation that was stripped from the URL
          const strippedSuffix = urlMatch[0]!.slice(rawUrl.length);
          const remainder = this.buffer.slice(matchEnd);

          this.buffer = '';
          this.state = 'PASSTHROUGH';

          const segments: string[] = [];
          if (beforeUrl) segments.push(beforeUrl);
          segments.push(validated + strippedSuffix);
          if (remainder) {
            segments.push(...this.handlePassthrough(remainder));
          }
          return segments;
        }
      }

      // URL might still be accumulating (no boundary yet)
      return [];
    }

    // Buffer starts with [ but no markdown link pattern yet
    if (this.buffer.startsWith('[')) {
      // Check if we have a complete [...] section with no ( after it
      const closeBracket = this.buffer.indexOf(']');
      if (closeBracket >= 0 && closeBracket + 1 < this.buffer.length) {
        const charAfterBracket = this.buffer[closeBracket + 1];
        if (charAfterBracket !== '(') {
          // Not a markdown link -- emit as passthrough
          const text = this.buffer;
          this.buffer = '';
          this.state = 'PASSTHROUGH';
          return [text];
        }
        // Has ](  -- continue buffering for URL completion
        return [];
      }
      // Still accumulating bracket content
      return [];
    }

    // Buffer doesn't contain a recognizable URL pattern yet
    // Check if it could still become one (starts with 'h', 'ht', 'htt', 'http')
    if ('https://'.startsWith(this.buffer) || 'http://'.startsWith(this.buffer)) {
      return []; // Still accumulating
    }

    // False alarm -- emit buffer as-is
    const text = this.buffer;
    this.buffer = '';
    this.state = 'PASSTHROUGH';
    return [text];
  }

  /**
   * Validate and emit everything in the buffer (used by flush).
   */
  private validateAndEmitBuffer(): string[] {
    // Check for markdown link
    const mdMatch = this.buffer.match(MARKDOWN_LINK_PATTERN);
    if (mdMatch) {
      const fullMatch = mdMatch[0]!;
      const url = mdMatch[2]!;
      const validated = this.tracker.stripOrFlagUrl(fullMatch, url);
      const remainder = this.buffer.slice(fullMatch.length);
      return remainder ? [validated, remainder] : [validated];
    }

    // Check for bare URL
    const urlMatch = this.buffer.match(URL_PATTERN);
    if (urlMatch && urlMatch.index !== undefined) {
      const matchStart = urlMatch.index;
      const rawUrl = urlMatch[0]!.replace(/[.,;:!?]+$/, '');
      const validated = this.tracker.stripOrFlagUrl(rawUrl, rawUrl);
      const strippedSuffix = urlMatch[0]!.slice(rawUrl.length);
      const beforeUrl = this.buffer.slice(0, matchStart);
      const afterUrl = this.buffer.slice(matchStart + urlMatch[0]!.length);

      const segments: string[] = [];
      if (beforeUrl) segments.push(beforeUrl);
      segments.push(validated + strippedSuffix);
      if (afterUrl) segments.push(afterUrl);
      return segments;
    }

    // No URL -- emit raw
    return [this.buffer];
  }
}
