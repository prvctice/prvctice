import test from 'node:test';
import assert from 'node:assert/strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const {
  isDomainSafe,
  extractUrlsFromText,
  ConversationUrlTracker,
} = require('../../src/services/urlValidator');

test('isDomainSafe', async (t) => {
  await t.test('returns true for wikipedia.org (exact match)', () => {
    assert.equal(isDomainSafe('wikipedia.org'), true);
  });

  await t.test('returns true for en.wikipedia.org (exact match)', () => {
    assert.equal(isDomainSafe('en.wikipedia.org'), true);
  });

  await t.test('returns true for tile.loc.gov (parent domain check + .gov suffix)', () => {
    assert.equal(isDomainSafe('tile.loc.gov'), true);
  });

  await t.test('returns true for example.edu (.edu suffix)', () => {
    assert.equal(isDomainSafe('example.edu'), true);
  });

  await t.test('returns true for any .gov domain', () => {
    assert.equal(isDomainSafe('data.census.gov'), true);
  });

  await t.test('returns false for evil.com (unknown domain)', () => {
    assert.equal(isDomainSafe('evil.com'), false);
  });

  await t.test('returns false for fake-museum.org (not in safe list)', () => {
    assert.equal(isDomainSafe('fake-museum.org'), false);
  });

  await t.test('is case-insensitive', () => {
    assert.equal(isDomainSafe('Wikipedia.Org'), true);
  });
});

test('extractUrlsFromText', async (t) => {
  await t.test('extracts URL from text with surrounding words', () => {
    const result = extractUrlsFromText('Check out https://youtube.com/watch?v=abc for more');
    assert.deepEqual(result, ['https://youtube.com/watch?v=abc']);
  });

  await t.test('strips trailing period from URL', () => {
    const result = extractUrlsFromText('Visit https://example.com.');
    assert.deepEqual(result, ['https://example.com']);
  });

  await t.test('strips trailing comma and other punctuation', () => {
    const result = extractUrlsFromText('See https://example.com, and https://test.com!');
    assert.deepEqual(result, ['https://example.com', 'https://test.com']);
  });

  await t.test('handles multiple URLs in one string', () => {
    const result = extractUrlsFromText(
      'Links: https://a.com/page and http://b.com/other plus https://c.com'
    );
    assert.deepEqual(result, ['https://a.com/page', 'http://b.com/other', 'https://c.com']);
  });

  await t.test('returns empty array for text without URLs', () => {
    const result = extractUrlsFromText('Just a regular sentence with no links.');
    assert.deepEqual(result, []);
  });

  await t.test('deduplicates repeated URLs', () => {
    const result = extractUrlsFromText('https://a.com and again https://a.com');
    assert.deepEqual(result, ['https://a.com']);
  });
});

test('ConversationUrlTracker', async (t) => {
  await t.test('constructor extracts URLs from history messages with role tool', () => {
    const history = [
      { role: 'user', content: 'search for art' },
      { role: 'tool', content: '{"url":"https://metmuseum.org/art/123","title":"Painting"}' },
      { role: 'assistant', content: 'Here is some art...' },
    ];
    const tracker = new ConversationUrlTracker(history);
    assert.equal(tracker.isUrlValid('https://metmuseum.org/art/123'), 'tool_result');
  });

  await t.test('addToolResultUrls adds URLs that are then valid', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addToolResultUrls('youtube_search', '{"url":"https://youtube.com/watch?v=xyz"}');
    assert.equal(tracker.isUrlValid('https://youtube.com/watch?v=xyz'), 'tool_result');
  });

  await t.test('addWebSearchUrls adds URLs that are then valid', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addWebSearchUrls(['https://example.com/article', 'https://news.com/story']);
    assert.equal(tracker.isUrlValid('https://example.com/article'), 'web_search');
    assert.equal(tracker.isUrlValid('https://news.com/story'), 'web_search');
  });

  await t.test('isUrlValid returns correct category for each source', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addToolResultUrls('search', '{"url":"https://tool.example.com/page"}');
    tracker.addWebSearchUrls(['https://web.example.com/page']);

    assert.equal(tracker.isUrlValid('https://tool.example.com/page'), 'tool_result');
    assert.equal(tracker.isUrlValid('https://web.example.com/page'), 'web_search');
    assert.equal(tracker.isUrlValid('https://wikipedia.org/wiki/Test'), 'safe_domain');
    assert.equal(tracker.isUrlValid('https://unknown-site.com/page'), 'unknown');
  });

  await t.test('isUrlValid returns safe_domain for wikipedia URLs not from tools', () => {
    const tracker = new ConversationUrlTracker();
    assert.equal(tracker.isUrlValid('https://en.wikipedia.org/wiki/Jazz'), 'safe_domain');
  });

  await t.test('isUrlValid returns unknown for hallucinated museum URL', () => {
    const tracker = new ConversationUrlTracker();
    assert.equal(tracker.isUrlValid('https://fake-museum.com/object/123'), 'unknown');
  });

  await t.test('isUrlValid returns unknown for malformed URL', () => {
    const tracker = new ConversationUrlTracker();
    assert.equal(tracker.isUrlValid('not-a-url'), 'unknown');
  });

  await t.test('stripOrFlagUrl preserves valid URLs', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addToolResultUrls('search', '{"url":"https://metmuseum.org/art/123"}');

    const result = tracker.stripOrFlagUrl(
      '[Painting](https://metmuseum.org/art/123)',
      'https://metmuseum.org/art/123'
    );
    assert.equal(result, '[Painting](https://metmuseum.org/art/123)');
  });

  await t.test('stripOrFlagUrl strips unknown markdown link, keeps link text', () => {
    const tracker = new ConversationUrlTracker();
    const result = tracker.stripOrFlagUrl(
      '[Amazing Art](https://hallucinated-site.com/fake)',
      'https://hallucinated-site.com/fake'
    );
    assert.equal(result, 'Amazing Art _(link removed: unverified source)_');
  });

  await t.test('stripOrFlagUrl strips unknown bare URL', () => {
    const tracker = new ConversationUrlTracker();
    const result = tracker.stripOrFlagUrl(
      'https://hallucinated-site.com/fake',
      'https://hallucinated-site.com/fake'
    );
    assert.equal(result, '[link removed: unverified source]');
  });

  await t.test('stripOrFlagUrl preserves safe domain URLs', () => {
    const tracker = new ConversationUrlTracker();
    const result = tracker.stripOrFlagUrl(
      'https://en.wikipedia.org/wiki/Jazz',
      'https://en.wikipedia.org/wiki/Jazz'
    );
    assert.equal(result, 'https://en.wikipedia.org/wiki/Jazz');
  });

  await t.test('tool result URLs take priority over safe domain', () => {
    const tracker = new ConversationUrlTracker();
    tracker.addToolResultUrls('wiki', '{"url":"https://en.wikipedia.org/wiki/Jazz"}');
    // Should return tool_result, not safe_domain
    assert.equal(tracker.isUrlValid('https://en.wikipedia.org/wiki/Jazz'), 'tool_result');
  });

  await t.test('constructor handles non-string tool content gracefully', () => {
    const history = [
      { role: 'tool', content: 42 },
      { role: 'tool', content: null },
      { role: 'tool', content: { nested: true } },
    ];
    // Should not throw
    const tracker = new ConversationUrlTracker(history);
    assert.equal(tracker.isUrlValid('https://example.com'), 'unknown');
  });

  await t.test('constructor handles undefined history', () => {
    const tracker = new ConversationUrlTracker(undefined);
    assert.equal(tracker.isUrlValid('https://example.com'), 'unknown');
  });
});
