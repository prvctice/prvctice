import test from 'node:test';
import assert from 'node:assert/strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { ConversationUrlTracker } = require('../../src/services/urlValidator');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { UrlStreamAccumulator } = require('../../src/routes/chat/urlStreamAccumulator');

/** Helper: push all chunks through accumulator and collect output */
function pushAll(
  accumulator: { push: (s: string) => string[]; flush: () => string[] },
  chunks: string[]
): string {
  const segments: string[] = [];
  for (const chunk of chunks) {
    segments.push(...accumulator.push(chunk));
  }
  segments.push(...accumulator.flush());
  return segments.join('');
}

test('UrlStreamAccumulator', async (t) => {
  await t.test('non-URL text passes through immediately (PASSTHROUGH mode)', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    const result = acc.push('Hello, this is plain text without links.');
    assert.deepEqual(result, ['Hello, this is plain text without links.']);
  });

  await t.test('URL split across 3 chunks is buffered and validated as one unit', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    // Unknown URL split across chunks
    const output = pushAll(acc, ['Visit ', 'https://hallucinated', '-site.com/page', ' for more']);
    assert.equal(output, 'Visit [link removed: unverified source] for more');
  });

  await t.test('markdown link [Title](url) is buffered and validated', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, [
      'Check out ',
      '[Great Art](https://fake-gallery.com/art/1)',
      ' today',
    ]);
    assert.equal(output, 'Check out Great Art _(link removed: unverified source)_ today');
  });

  await t.test('valid URL (from tracker) passes through unchanged', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addToolResultUrls('search', '{"url":"https://metmuseum.org/art/123"}');
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, ['See ', 'https://metmuseum.org/art/123', ' for details']);
    assert.equal(output, 'See https://metmuseum.org/art/123 for details');
  });

  await t.test('unknown URL is stripped, link text preserved for markdown', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, ['[Museum Piece](https://made-up.com/item/99)']);
    assert.equal(output, 'Museum Piece _(link removed: unverified source)_');
  });

  await t.test('buffer exceeding 500 chars emits raw (safety valve)', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    // Start with http to trigger buffering, then send lots of non-URL text
    const longText = 'http' + 'x'.repeat(600);
    const output = pushAll(acc, [longText]);
    // Safety valve should emit the raw buffer
    assert.equal(output, longText);
  });

  await t.test('flush() handles remaining buffered URL', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    // Start buffering a URL but never send boundary
    acc.push('Here is ');
    const mid = acc.push('https://fake.com/page');
    // Mid should be empty (still buffering)
    assert.deepEqual(mid, []);

    // Flush should validate and emit
    const flushed = acc.flush();
    const output = flushed.join('');
    assert.equal(output, '[link removed: unverified source]');
  });

  await t.test('mixed content: URL portion validated, surrounding text emitted promptly', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addWebSearchUrls(['https://youtube.com/watch?v=abc']);
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, [
      'Here is a link: ',
      'https://youtube.com/watch?v=abc',
      ' and more text',
    ]);
    assert.equal(output, 'Here is a link: https://youtube.com/watch?v=abc and more text');
  });

  await t.test('safe domain URL passes through without being in tracker', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, [
      'Read more at ',
      'https://en.wikipedia.org/wiki/Jazz',
      ' on Wikipedia',
    ]);
    assert.equal(output, 'Read more at https://en.wikipedia.org/wiki/Jazz on Wikipedia');
  });

  await t.test('multiple URLs in same stream, mixed valid and invalid', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addToolResultUrls('search', '{"url":"https://real-source.gov/data"}');
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, [
      'Valid: https://real-source.gov/data and fake: https://hallucinated.com/fake end',
    ]);
    assert.equal(
      output,
      'Valid: https://real-source.gov/data and fake: [link removed: unverified source] end'
    );
  });

  await t.test('empty chunks produce no output', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    const result1 = acc.push('');
    assert.deepEqual(result1, []);
    const result2 = acc.flush();
    assert.deepEqual(result2, []);
  });

  await t.test('bracket that is not a markdown link passes through', () => {
    const tracker = new ConversationUrlTracker();
    const acc = new UrlStreamAccumulator(tracker);

    const output = pushAll(acc, ['This is [not a link] and more text']);
    assert.equal(output, 'This is [not a link] and more text');
  });
});
