const test = require('node:test');
const assert = require('node:assert/strict');

// Fake adapter that simulates a function call followed by a chained follow-up
class InspectingAdapter {
  constructor() {
    this.invocations = 0;
  }
  async *streamChat(params) {
    this.invocations += 1;
    if (this.invocations === 1) {
      // First pass: model emits a tool call and provides a response id
      yield { type: 'delta', content: 'Thinking…' };
      yield { type: 'response_id', id: 'resp_123' };
      yield { type: 'tool_call', id: 'call_abc', name: 'save_note', arguments: { text: 'hello' } };
      yield { type: 'done' };
    } else {
      // Follow-up: ensure only the tool output is sent and chaining is used
      const msgs = Array.isArray(params.messages) ? params.messages : [];
      const toolMsgs = msgs.filter((m) => m && (m.role === 'tool' || m.role === 'function'));
      assert.ok(toolMsgs.length >= 1, 'at least one tool result message is sent');
      // Produce the final assistant text
      yield { type: 'delta', content: 'Saved: hello' };
      yield { type: 'done' };
    }
  }
}

test('tool chaining sends tool results and gets follow-up response', async () => {
  // Build router and extract the POST handler
  const router = require('../../src/routes/chat');
  const layer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
  const handler = layer.route.stack.at(-1).handle;

  // Minimal req/res mocks
  const req = {
    body: {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'save "hello" to notes' }],
      stream: true,
      includeSystem: false,
    },
    session: {},
    app: {
      get: (k) => (k === 'createAdapterOverride' ? () => new InspectingAdapter() : undefined),
    },
  };

  let written = '';
  const res = {
    setHeader: () => {},
    write: (chunk) => {
      written += String(chunk);
    },
    end: () => {},
    status: (code) => ({
      json: (obj) => {
        throw new Error(`Unexpected ${code}: ${JSON.stringify(obj)}`);
      },
    }),
  };

  await handler(req, res);
  assert.ok(written.includes('Saved: hello'));
  assert.ok(written.includes('done'));
});

test('tool summariser returns markdown for wikipedia results', async () => {
  class SingleCallAdapter {
    constructor() {
      this.invocations = 0;
    }
    async *streamChat() {
      this.invocations += 1;
      if (this.invocations === 1) {
        yield { type: 'delta', content: '' };
        yield {
          type: 'tool_call',
          id: 'call_wiki',
          name: 'wikipedia_search',
          arguments: { query: 'test' },
        };
        yield { type: 'done' };
      } else {
        yield { type: 'done' }; // force summariser fallback
      }
    }
  }

  const router = require('../../src/routes/chat');
  const layer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
  const handler = layer.route.stack.at(-1).handle;

  const overrides = {
    createAdapterOverride: () => new SingleCallAdapter(),
    createToolsOverride: () => [
      {
        name: 'wikipedia_search',
        description: 'stub',
        parameters: {},
        execute: async () => ({
          results: [
            { title: 'Article One', url: 'https://example.com/one' },
            { title: 'Article Two', url: 'https://example.com/two' },
          ],
        }),
      },
    ],
    getToolMetadataOverride: () => [
      { name: 'wikipedia_search', description: 'stub', parameters: {} },
    ],
  };

  const req = {
    body: {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'search wikipedia' }],
      stream: true,
      includeSystem: false,
    },
    session: {},
    app: {
      get: (k) => overrides[k],
    },
  };

  let written = '';
  const res = {
    setHeader: () => {},
    write: (chunk) => {
      written += String(chunk);
    },
    end: () => {},
    status: (code) => ({
      json: (obj) => {
        throw new Error(`Unexpected ${code}: ${JSON.stringify(obj)}`);
      },
    }),
  };

  await handler(req, res);
  assert.ok(written.includes("Here's what the tools reported"));
  assert.ok(written.includes('**Wikipedia Search:** top results'));
  assert.ok(written.includes('[Article One](https://example.com/one)'));
});

test('tool chaining guard stops infinite loops', async () => {
  const previousMax = process.env.TOOL_CHAIN_MAX_ROUNDS;
  process.env.TOOL_CHAIN_MAX_ROUNDS = '1';

  class LoopingAdapter {
    constructor() {
      this.invocations = 0;
    }
    async *streamChat(params) {
      this.invocations += 1;
      yield {
        type: 'tool_call',
        id: `call_${this.invocations}`,
        name: 'save_note',
        arguments: { text: 'loop' },
      };
      yield { type: 'done' };
    }
  }

  const router = require('../../src/routes/chat');
  const layer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
  const handler = layer.route.stack.at(-1).handle;

  const overrides = {
    createAdapterOverride: () => new LoopingAdapter(),
    createToolsOverride: () => [
      {
        name: 'save_note',
        description: 'stub',
        parameters: {},
        execute: async () => ({ savedText: 'loop' }),
      },
    ],
    getToolMetadataOverride: () => [{ name: 'save_note', description: 'stub', parameters: {} }],
  };

  const req = {
    body: {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'loop please' }],
      stream: true,
      includeSystem: false,
    },
    session: {},
    app: {
      get: (k) => overrides[k],
    },
  };

  let written = '';
  const res = {
    setHeader: () => {},
    write: (chunk) => {
      written += String(chunk);
    },
    end: () => {},
    status: (code) => ({
      json: (obj) => {
        throw new Error(`Unexpected ${code}: ${JSON.stringify(obj)}`);
      },
    }),
  };

  try {
    await handler(req, res);
    assert.match(written, /interrupted/);
  } finally {
    if (previousMax === undefined) delete process.env.TOOL_CHAIN_MAX_ROUNDS;
    else process.env.TOOL_CHAIN_MAX_ROUNDS = previousMax;
  }
});
