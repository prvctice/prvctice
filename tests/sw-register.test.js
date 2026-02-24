import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(path.resolve(__dirname, '../web/sw/register.js')).href;

function resetEnv() {
  delete global.window;
  delete global.navigator;
}

test('registerServiceWorker attaches load listener and registers', async () => {
  resetEnv();
  let loadHandler = null;
  const registerCalls = [];
  global.window = {
    addEventListener(event, handler) {
      if (event === 'load') loadHandler = handler;
    },
  };
  global.navigator = {
    serviceWorker: {
      register(path, options) {
        registerCalls.push({ path, options });
        return Promise.resolve();
      },
    },
  };

  const { registerServiceWorker } = await import(`${moduleUrl}?${Date.now()}`);
  const result = registerServiceWorker('/sw-test.js', { scope: '/app' });
  assert.equal(result, true);
  assert.ok(loadHandler, 'load handler registered');
  await loadHandler();
  assert.deepEqual(registerCalls, [{ path: '/sw-test.js', options: { scope: '/app' } }]);

  resetEnv();
});

test('registerServiceWorker returns false when unsupported', async () => {
  resetEnv();
  const { registerServiceWorker } = await import(`${moduleUrl}?unsupported`);
  assert.equal(registerServiceWorker('/sw.js'), false);
});
