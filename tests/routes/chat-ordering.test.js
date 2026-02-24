const test = require('node:test');
const assert = require('node:assert/strict');

class InspectingAdapter {
  constructor(collected) {
    this.collected = collected;
  }
  async *streamChat(params) {
    // capture first call's messages ordering
    if (!this.collected.first) this.collected.first = params;
    // No tool call; just emit a tiny text then done
    yield { type: 'delta', content: 'ok' };
    yield { type: 'done' };
  }
}

test('system prompt is first, then history, then current messages', async () => {
  const router = require('../../src/routes/chat');
  const layer = router.stack.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
  const handler = layer.route.stack.at(-1).handle;

  const collected = {};
  const req = {
    body: {
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'current' }],
      stream: true,
      includeSystem: true,
    },
    session: { mcpHistory: [{ role: 'user', content: 'old' }] },
    app: {
      get: (k) =>
        k === 'createAdapterOverride' ? () => new InspectingAdapter(collected) : undefined,
    },
  };
  let out = '';
  const res = {
    setHeader: () => {},
    write: (c) => {
      out += String(c);
    },
    end: () => {},
    status: (c) => ({
      json: (o) => {
        throw new Error(`Unexpected ${c}: ${JSON.stringify(o)}`);
      },
    }),
  };

  await handler(req, res);
  assert.ok(out.includes('done'));
  const msgs = collected.first.messages;
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.equal(msgs[1].content, 'old');
  assert.equal(msgs[2].role, 'user');
  assert.equal(msgs[2].content, 'current');
});
