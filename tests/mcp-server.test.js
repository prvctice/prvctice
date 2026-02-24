const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const WebSocket = require('ws');

const { setupMcpServer } = require('../src/mcp');
const { PROTOCOL_VERSION } = require('../src/mcp/session');

function parseMessage(eventData) {
  const raw = Array.isArray(eventData) ? eventData[0] : eventData;
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  return JSON.parse(text);
}

test('MCP server initializes, lists tools, and executes save_note', async (t) => {
  const server = http.createServer((req, res) => {
    res.statusCode = 404;
    res.end();
  });

  setupMcpServer(server, { path: '/mcp-test' });

  try {
    await new Promise((resolve, reject) => {
      const handler = (err) => {
        server.off('error', handler);
        reject(err);
      };
      server.once('error', handler);
      server.listen(0, () => {
        server.off('error', handler);
        resolve();
      });
    });
  } catch (err) {
    if (err && err.code === 'EPERM') {
      server.close();
      t.skip('Socket listen not permitted in this environment');
      return;
    }
    throw err;
  }

  const addressInfo = server.address();
  const port = addressInfo.port;
  let host = addressInfo.address;
  if (!host || host === '::' || host === '::1' || host === '0.0.0.0') {
    host = '127.0.0.1';
  }
  const wsHost = host.includes(':') ? `[${host}]` : host;
  const client = new WebSocket(`ws://${wsHost}:${port}/mcp-test`);

  await once(client, 'open');

  client.send(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })
  );

  const initResp = parseMessage(await once(client, 'message'));
  assert.equal(initResp.id, 1);
  assert.equal(initResp.result.protocolVersion, PROTOCOL_VERSION);
  assert.ok(initResp.result.capabilities.tools, 'tools capability advertised');

  client.send(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })
  );

  const listResp = parseMessage(await once(client, 'message'));
  assert.equal(listResp.id, 2);
  assert.ok(Array.isArray(listResp.result.tools));
  assert.ok(
    listResp.result.tools.some((tool) => tool && tool.name === 'save_note'),
    'tool list includes save_note'
  );
  assert.ok(
    listResp.result.tools.some((tool) => tool && tool.name === 'youtube_search'),
    'tool list includes youtube_search'
  );

  client.send(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'save_note',
        arguments: { text: 'hello world' },
      },
    })
  );

  const callResp = parseMessage(await once(client, 'message'));
  assert.equal(callResp.id, 3);
  assert.equal(callResp.result.isError, false);
  const firstContent = callResp.result.content && callResp.result.content[0];
  assert.ok(firstContent && firstContent.type === 'text', 'response contains text content');
  assert.ok(firstContent.text.includes('hello world'), 'tool output mentions provided text');

  client.close();
  await once(client, 'close');
  await new Promise((resolve) => server.close(resolve));
});
