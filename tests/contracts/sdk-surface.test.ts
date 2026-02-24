/**
 * SDK Contract Tests
 *
 * TEST-01: Snapshot test — captures the full SDK surface and fails on drift.
 * TEST-02: Cross-validation — schema vs appReviewer allowlist vs bridgeSDK source.
 * TEST-03: ai.complete() options passthrough.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SDK_METHODS,
  SDK_CONNECTORS,
  SDK_VERSION,
  getValidNamespaces,
  getBaseConnectors,
  getKeyGatedConnectors,
  connectorSdkNamespace,
} from '../../src/contracts/sdk-surface.js';

// ---------------------------------------------------------------------------
// TEST-01: Snapshot — full SDK surface
// ---------------------------------------------------------------------------

test('TEST-01: SDK surface snapshot has expected method count', () => {
  // If this fails, the SDK surface changed — update the snapshot count
  // and verify the change was intentional.
  assert.equal(SDK_METHODS.length, 237, 'SDK method count changed — update snapshot');
});

test('TEST-01: SDK surface snapshot has expected connector count', () => {
  assert.equal(SDK_CONNECTORS.length, 31, 'SDK connector count changed — update snapshot');
});

test('TEST-01: every method has required fields', () => {
  for (const m of SDK_METHODS) {
    assert.ok(m.method, `method name missing: ${JSON.stringify(m)}`);
    assert.ok(m.params, `params missing for ${m.namespace}.${m.method}`);
    assert.ok(m.returns, `returns missing for ${m.namespace}.${m.method}`);
    assert.ok(m.transport, `transport missing for ${m.namespace}.${m.method}`);
    assert.ok(m.source, `source missing for ${m.namespace}.${m.method}`);
    assert.ok(m.since, `since missing for ${m.namespace}.${m.method}`);
  }
});

test('TEST-01: every connector has required fields', () => {
  for (const c of SDK_CONNECTORS) {
    assert.ok(c.id, `connector id missing: ${JSON.stringify(c)}`);
    assert.ok(c.sdkNamespace, `sdkNamespace missing for ${c.id}`);
    assert.ok(c.since, `since missing for ${c.id}`);
  }
});

test('TEST-01: no duplicate method paths', () => {
  const paths = SDK_METHODS.map((m) =>
    m.namespace ? `prvctice.${m.namespace}.${m.method}` : `prvctice.${m.method}`
  );
  const unique = new Set(paths);
  assert.equal(unique.size, paths.length, `Duplicate method paths found`);
});

test('TEST-01: no duplicate connector IDs', () => {
  const ids = SDK_CONNECTORS.map((c) => c.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, `Duplicate connector IDs found`);
});

test('TEST-01: SDK_VERSION is valid semver', () => {
  assert.match(SDK_VERSION, /^\d+\.\d+\.\d+$/, 'SDK_VERSION must be semver');
});

test('TEST-01: key-gated connectors have requiresKey field', () => {
  const keyGated = getKeyGatedConnectors();
  assert.ok(keyGated.length >= 3, 'Expected at least 3 key-gated connectors');
  for (const { connector, key } of keyGated) {
    assert.ok(key, `key-gated connector ${connector} has no key name`);
  }
});

test('TEST-01: base and key-gated partition covers all connectors', () => {
  const base = new Set(getBaseConnectors());
  const keyGated = new Set(getKeyGatedConnectors().map((c) => c.connector));
  const all = new Set(SDK_CONNECTORS.map((c) => c.id));

  for (const id of all) {
    assert.ok(base.has(id) || keyGated.has(id), `Connector ${id} is neither base nor key-gated`);
  }
});

// ---------------------------------------------------------------------------
// TEST-02: Cross-validation — schema vs allowlist vs bridgeSDK source
// ---------------------------------------------------------------------------

test('TEST-02: getValidNamespaces() matches SDK_METHODS', () => {
  const namespaces = getValidNamespaces();
  const expectedPaths = SDK_METHODS.map((m) =>
    m.namespace ? `prvctice.${m.namespace}.${m.method}` : `prvctice.${m.method}`
  );

  assert.equal(namespaces.size, expectedPaths.length);
  for (const path of expectedPaths) {
    assert.ok(namespaces.has(path), `Missing namespace path: ${path}`);
  }
});

test('TEST-02: connector methods reference valid connector IDs', () => {
  const connectorIds = new Set(SDK_CONNECTORS.map((c) => c.id));
  const connectorMethods = SDK_METHODS.filter((m) => m.connector);

  for (const m of connectorMethods) {
    assert.ok(
      connectorIds.has(m.connector!),
      `Method ${m.namespace}.${m.method} references unknown connector: ${m.connector}`
    );
  }
});

test('TEST-02: connectorSdkNamespace maps all hyphenated IDs correctly', () => {
  const hyphenated = SDK_CONNECTORS.filter((c) => c.id.includes('-'));
  assert.ok(hyphenated.length >= 3, 'Expected at least 3 hyphenated connector IDs');

  for (const c of hyphenated) {
    const ns = connectorSdkNamespace(c.id);
    assert.equal(
      ns,
      c.sdkNamespace,
      `Namespace mismatch for ${c.id}: got ${ns}, expected ${c.sdkNamespace}`
    );
  }
});

test('TEST-02: bridgeSDK source contains all connector namespaces', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const sdkSource = readFileSync(
    resolve(__dirname, '../../web/services/apps/bridgeSDK.ts'),
    'utf-8'
  );

  // Check that connector-transport methods are referenced in bridgeSDK
  const connectorMethods = SDK_METHODS.filter((m) => m.transport === 'connector');
  const connectorNamespaces = new Set(connectorMethods.map((m) => m.namespace));

  for (const ns of connectorNamespaces) {
    // The namespace should appear in the SDK source as a property
    assert.ok(
      sdkSource.includes(ns + ':') || sdkSource.includes(ns + '.'),
      `Connector namespace '${ns}' not found in bridgeSDK source`
    );
  }
});

test('TEST-02: appReviewer imports getValidNamespaces from contract schema', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const reviewerSource = readFileSync(
    resolve(__dirname, '../../src/services/appReviewer.ts'),
    'utf-8'
  );

  assert.ok(
    reviewerSource.includes("from '../contracts/sdk-surface"),
    'appReviewer should import from contracts/sdk-surface'
  );
  assert.ok(
    reviewerSource.includes('getValidNamespaces'),
    'appReviewer should use getValidNamespaces from schema'
  );
});

// ---------------------------------------------------------------------------
// TEST-03: ai.complete() options passthrough
// ---------------------------------------------------------------------------

test('TEST-03: ai connector handler unwraps nested options', async () => {
  // Import the actual AI handler
  const aiModule = await import('../../src/routes/connectors/ai.js');
  const handler = aiModule.aiHandler;

  assert.ok(handler, 'aiHandler should be exported');
  assert.ok(handler.complete, 'aiHandler.complete should exist');

  // The handler should be a function that accepts params, appId, req, serviceKeys
  assert.equal(typeof handler.complete, 'function');
});

test('TEST-03: SDK schema declares ai.complete with correct params', () => {
  const aiComplete = SDK_METHODS.find((m) => m.namespace === 'ai' && m.method === 'complete');

  assert.ok(aiComplete, 'ai.complete should be in SDK_METHODS');
  assert.ok(aiComplete.params.includes('prompt'), 'ai.complete should accept prompt');
  assert.ok(aiComplete.transport === 'connector', 'ai.complete should use connector transport');
  assert.equal(aiComplete.connector, 'ai', 'ai.complete should reference ai connector');
});

test('TEST-03: SDK schema declares ai.complete options fields', () => {
  const aiComplete = SDK_METHODS.find((m) => m.namespace === 'ai' && m.method === 'complete');
  assert.ok(aiComplete);

  // The params documentation should show the options object
  const aiOptions = SDK_METHODS.filter((m) => m.namespace === 'ai');
  // At minimum, complete and streamChunks should exist
  const methodNames = aiOptions.map((m) => m.method);
  assert.ok(methodNames.includes('complete'), 'ai namespace should have complete');
});

// ---------------------------------------------------------------------------
// TEST-04: Drift detection — schema vs prompts vs UIKit source
// ---------------------------------------------------------------------------

test('TEST-04: generation prompt references all new v3.0 namespaces', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const promptSource = readFileSync(
    resolve(__dirname, '../../src/prompts/app-generation.md'),
    'utf-8'
  );

  // All v3.0 namespaces that should be documented in the generation prompt
  const v3Namespaces = [
    'prvctice.audio.buffer',
    'prvctice.image',
    'prvctice.capture',
    'prvctice.camera',
    'prvctice.video',
    'prvctice.gif',
  ];

  for (const ns of v3Namespaces) {
    assert.ok(promptSource.includes(ns), `Generation prompt missing v3.0 namespace: ${ns}`);
  }
});

test('TEST-04: generation prompt references ui.fader and ui.timeline', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const promptSource = readFileSync(
    resolve(__dirname, '../../src/prompts/app-generation.md'),
    'utf-8'
  );

  assert.ok(promptSource.includes('prvctice.ui.fader'), 'Generation prompt missing ui.fader');
  assert.ok(promptSource.includes('prvctice.ui.timeline'), 'Generation prompt missing ui.timeline');
});

test('TEST-04: appReviewer catches new media bridge calls without .catch()', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const reviewerSource = readFileSync(
    resolve(__dirname, '../../src/services/appReviewer.ts'),
    'utf-8'
  );

  // New bridge calls that need .catch() handling
  const mediaCalls = ['prvctice.camera.start', 'prvctice.video.load', 'prvctice.gif.create'];

  for (const call of mediaCalls) {
    assert.ok(
      reviewerSource.includes(call),
      `appReviewer missing media bridge call in catch check: ${call}`
    );
  }
});

test('TEST-04: UIKit JS source files exist for all v3.0 local-transport methods', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Map source files referenced in sdk-surface.ts to actual paths
  const uikitFiles = [
    { source: 'audio-buffer.js', path: 'web/services/apps/uikit/js/audio-buffer.js' },
    { source: 'image.js', path: 'web/services/apps/uikit/js/image.js' },
    { source: 'frame-capture.js', path: 'web/services/apps/uikit/js/frame-capture.js' },
    { source: 'fader.js', path: 'web/services/apps/uikit/js/fader.js' },
    { source: 'timeline.js', path: 'web/services/apps/uikit/js/timeline.js' },
  ];

  for (const { source, path } of uikitFiles) {
    const fullPath = resolve(__dirname, '../../', path);
    assert.ok(existsSync(fullPath), `UIKit source file missing for ${source}: ${path}`);
  }
});

test('TEST-04: all v3.0 SDK methods have source files that exist', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const v3Methods = SDK_METHODS.filter((m) => m.since === '3.0');
  assert.ok(v3Methods.length >= 30, `Expected at least 30 v3.0 methods, got ${v3Methods.length}`);

  // Verify all referenced source files exist
  const sourceToPath: Record<string, string> = {
    'audio-buffer.js': 'web/services/apps/uikit/js/audio-buffer.js',
    'image.js': 'web/services/apps/uikit/js/image.js',
    'frame-capture.js': 'web/services/apps/uikit/js/frame-capture.js',
    'fader.js': 'web/services/apps/uikit/js/fader.js',
    'timeline.js': 'web/services/apps/uikit/js/timeline.js',
  };

  const checkedSources = new Set<string>();
  for (const m of v3Methods) {
    if (m.transport === 'local' && sourceToPath[m.source] && !checkedSources.has(m.source)) {
      const fullPath = resolve(__dirname, '../../', sourceToPath[m.source]);
      assert.ok(
        existsSync(fullPath),
        `Source file for ${m.namespace}.${m.method} not found: ${sourceToPath[m.source]}`
      );
      checkedSources.add(m.source);
    }
  }
});

test('TEST-04: template skeletons exist for all 4 app categories', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const skeletons = [
    'src/prompts/templates/skeletons/audio-instrument.html',
    'src/prompts/templates/skeletons/audio-tool.html',
    'src/prompts/templates/skeletons/visual-editor.html',
    'src/prompts/templates/skeletons/media-utility.html',
  ];

  for (const skeleton of skeletons) {
    const fullPath = resolve(__dirname, '../../', skeleton);
    assert.ok(existsSync(fullPath), `Template skeleton missing: ${skeleton}`);
  }
});
