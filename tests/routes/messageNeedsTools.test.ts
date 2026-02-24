import test from 'node:test';
import assert from 'node:assert/strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { messageNeedsTools, detectFollowUp } = require('../../src/routes/chat/helpers');

/** Minimal message structure matching ChatMessage */
interface TestMessage {
  role: string;
  content: string | Array<{ type: string; id?: string; name?: string; input?: unknown }>;
  tool_use_id?: string;
}

// Messages with recent tool context (tool_use in assistant + tool result)
const messagesWithToolContext: TestMessage[] = [
  { role: 'user', content: 'find jazz videos' },
  {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 't1', name: 'youtube_search', input: {} }],
  },
  { role: 'tool', tool_use_id: 't1', content: '{"results":[]}' },
  { role: 'assistant', content: 'Here are some jazz videos...' },
  { role: 'user', content: 'add 5 more' },
];

// Messages without tool context (plain conversation)
const messagesWithoutToolContext: TestMessage[] = [
  { role: 'user', content: 'tell me about jazz' },
  { role: 'assistant', content: 'Jazz is a music genre...' },
  { role: 'user', content: 'add some more details' },
];

test('messageNeedsTools', async (t) => {
  await t.test(
    'returns true for "find me some jazz videos" (existing behavior, tool keyword)',
    () => {
      const messages: TestMessage[] = [{ role: 'user', content: 'find me some jazz videos' }];
      assert.equal(messageNeedsTools(messages), true);
    }
  );

  await t.test('returns false for "thanks!" (existing behavior, greeting)', () => {
    const messages: TestMessage[] = [{ role: 'user', content: 'thanks!' }];
    assert.equal(messageNeedsTools(messages), false);
  });

  await t.test('returns true for "add 5 more" when recent messages include tool results', () => {
    assert.equal(messageNeedsTools(messagesWithToolContext), true);
  });

  await t.test('returns true for "show me more" when recent messages include tool results', () => {
    const messages: TestMessage[] = [
      { role: 'user', content: 'find videos about cooking' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'youtube_search', input: {} }],
      },
      { role: 'tool', tool_use_id: 't1', content: '{"videos":[]}' },
      { role: 'assistant', content: 'Here are some cooking videos...' },
      { role: 'user', content: 'show me more' },
    ];
    assert.equal(messageNeedsTools(messages), true);
  });

  await t.test('returns true for "can you find similar ones" with tool context', () => {
    const messages: TestMessage[] = [
      { role: 'user', content: 'search for art' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'moodboard_search', input: {} }],
      },
      { role: 'tool', tool_use_id: 't1', content: '{"images":[]}' },
      { role: 'assistant', content: 'Here are some artworks...' },
      { role: 'user', content: 'can you find similar ones' },
    ];
    assert.equal(messageNeedsTools(messages), true);
  });

  await t.test('returns false for "cool" even with recent tool results (acknowledgment)', () => {
    const messages: TestMessage[] = [
      { role: 'user', content: 'find jazz videos' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'youtube_search', input: {} }],
      },
      { role: 'tool', tool_use_id: 't1', content: '{"results":[]}' },
      { role: 'assistant', content: 'Here are some jazz videos...' },
      { role: 'user', content: 'cool' },
    ];
    assert.equal(messageNeedsTools(messages), false);
  });

  await t.test(
    'returns false for "ok thanks" even with recent tool results (acknowledgment)',
    () => {
      const messages: TestMessage[] = [
        { role: 'user', content: 'find jazz videos' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'youtube_search', input: {} }],
        },
        { role: 'tool', tool_use_id: 't1', content: '{"results":[]}' },
        { role: 'assistant', content: 'Here are some jazz videos...' },
        { role: 'user', content: 'ok thanks' },
      ];
      assert.equal(messageNeedsTools(messages), false);
    }
  );

  await t.test(
    'returns true for long message (>100 chars) without tool keywords (existing behavior)',
    () => {
      const longMessage =
        'I was thinking about the relationship between color theory and emotional response ' +
        'in abstract expressionism, particularly how Rothko achieved such depth with layered washes.';
      const messages: TestMessage[] = [{ role: 'user', content: longMessage }];
      assert.equal(messageNeedsTools(messages), true);
    }
  );

  await t.test('returns false for empty messages array', () => {
    assert.equal(messageNeedsTools([]), false);
  });

  await t.test(
    'returns true for "add some more" even without explicit tool keyword when tool context exists',
    () => {
      const messages: TestMessage[] = [
        { role: 'user', content: 'look up wikipedia for jazz' },
        { role: 'tool', tool_use_id: 't1', content: '{"extract":"Jazz is..."}' },
        { role: 'assistant', content: 'Jazz is a music genre...' },
        { role: 'user', content: 'add some more' },
      ];
      assert.equal(messageNeedsTools(messages), true);
    }
  );
});

test('detectFollowUp', async (t) => {
  await t.test('returns needsToolReInvocation: true for "add some more" with tool context', () => {
    const result = detectFollowUp(messagesWithToolContext);
    assert.deepEqual(result, { needsToolReInvocation: true });
  });

  await t.test(
    'returns needsToolReInvocation: false for "add some more" WITHOUT tool context',
    () => {
      const result = detectFollowUp(messagesWithoutToolContext);
      assert.deepEqual(result, { needsToolReInvocation: false });
    }
  );

  await t.test(
    'returns needsToolReInvocation: false for "hello" with tool context (greeting, not follow-up)',
    () => {
      const messages: TestMessage[] = [
        { role: 'user', content: 'find jazz videos' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'youtube_search', input: {} }],
        },
        { role: 'tool', tool_use_id: 't1', content: '{"results":[]}' },
        { role: 'assistant', content: 'Here are some jazz videos...' },
        { role: 'user', content: 'hello' },
      ];
      const result = detectFollowUp(messages);
      assert.deepEqual(result, { needsToolReInvocation: false });
    }
  );

  await t.test('returns needsToolReInvocation: false for empty messages', () => {
    const result = detectFollowUp([]);
    assert.deepEqual(result, { needsToolReInvocation: false });
  });

  await t.test(
    'returns needsToolReInvocation: true for "keep going" with tool_result in content parts',
    () => {
      const messages: TestMessage[] = [
        { role: 'user', content: 'search for something' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'web_search', input: {} }],
        },
        { role: 'tool', tool_use_id: 't1', content: '{"results":[]}' },
        { role: 'assistant', content: 'Here are some results...' },
        { role: 'user', content: 'keep going' },
      ];
      const result = detectFollowUp(messages);
      assert.deepEqual(result, { needsToolReInvocation: true });
    }
  );
});
