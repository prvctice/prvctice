/* eslint-disable import/extensions */
const assert = require('assert');
const { test, beforeEach } = require('node:test');
// Use Module._load to stub out 'electron' imports
const Module = require('module');
const originalLoad = Module._load;

let stubIpcMain;
let register;

beforeEach(() => {
  // Stub ipcMain methods
  stubIpcMain = {
    eventNames: () => [],
    removed: false,
    removeHandler: function () {
      this.removed = true;
    },
    lastChannel: null,
    lastHandler: null,
    handle: function (channel, handler) {
      this.lastChannel = channel;
      this.lastHandler = handler;
    },
  };
  // Intercept 'electron' module to return stubbed ipcMain
  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return { ipcMain: stubIpcMain };
    }
    return originalLoad(request, parent, isMain);
  };
  // Clear cached electron module so intercept takes effect
  delete require.cache[require.resolve('electron')];
  // Clear and re-require ipc module
  delete require.cache[require.resolve('../src/ipc.js')];
  ({ register } = require('../src/ipc.js'));
});

test('register throws TypeError on invalid arguments', () => {
  assert.throws(() => register(123, () => {}), TypeError);
  assert.throws(() => register('channel', 'notFn'), TypeError);
});

test('register calls ipcMain.handle with correct channel and wraps fn', async () => {
  // Setup a simple fn that doubles input
  const fn = async (event, x) => x * 2;
  register('test-channel', fn);
  // Verify handle registered
  assert.strictEqual(stubIpcMain.lastChannel, 'test-channel');
  assert.strictEqual(typeof stubIpcMain.lastHandler, 'function');
  // Invoke the handler wrapper
  const result = await stubIpcMain.lastHandler(null, 5);
  assert.strictEqual(result, 10);
});

test('handler returns __error object when fn throws', async () => {
  const errFn = async () => {
    throw new Error('BOOM');
  };
  register('err-channel', errFn);
  const handler = stubIpcMain.lastHandler;
  const result = await handler(null);
  assert.deepStrictEqual(result, { __error: true, message: 'BOOM' });
});

test('register removes existing handler when channel already registered', () => {
  // Simulate existing registration
  stubIpcMain.eventNames = () => ['dup-channel'];
  const fn = async () => {};
  register('dup-channel', fn);
  assert.strictEqual(stubIpcMain.removed, true);
  assert.strictEqual(stubIpcMain.lastChannel, 'dup-channel');
});
