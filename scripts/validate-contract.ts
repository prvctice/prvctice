#!/usr/bin/env tsx
/**
 * Contract validation script — verifies the SDK surface schema is self-consistent.
 *
 * Checks:
 * 1. No duplicate method paths in SDK_METHODS
 * 2. Every connector method references a connector in SDK_CONNECTORS
 * 3. Every SDK_CONNECTOR has at least one method in SDK_METHODS
 * 4. connectorSdkNamespace returns correct mapping for all connectors
 * 5. getValidNamespaces, getBaseConnectors, getKeyGatedConnectors produce non-empty results
 *
 * Run: npx tsx scripts/validate-contract.ts
 * Or:  npm run contract:validate
 */

import {
  SDK_METHODS,
  SDK_CONNECTORS,
  getValidNamespaces,
  getBaseConnectors,
  getKeyGatedConnectors,
  connectorSdkNamespace,
} from '../src/contracts/sdk-surface.js';

let errors = 0;

function fail(msg: string): void {
  console.error(`  FAIL: ${msg}`);
  errors++;
}

function pass(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`  OK: ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. No duplicate method paths
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log('\n1. Checking for duplicate method paths...');
const paths = SDK_METHODS.map((m) =>
  m.namespace ? `prvctice.${m.namespace}.${m.method}` : `prvctice.${m.method}`
);
const seen = new Set<string>();
for (const p of paths) {
  if (seen.has(p)) {
    fail(`Duplicate method path: ${p}`);
  }
  seen.add(p);
}
if (errors === 0) pass(`${paths.length} methods, all unique`);

// ---------------------------------------------------------------------------
// 2. Every connector method references a known connector
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log('\n2. Checking connector references...');
const connectorIds = new Set(SDK_CONNECTORS.map((c) => c.id));
const connectorMethods = SDK_METHODS.filter((m) => m.transport === 'connector');
for (const m of connectorMethods) {
  if (!m.connector) {
    fail(`Connector method ${m.namespace}.${m.method} missing connector field`);
  } else if (!connectorIds.has(m.connector)) {
    fail(
      `Connector method ${m.namespace}.${m.method} references unknown connector: ${m.connector}`
    );
  }
}
if (connectorMethods.length > 0) pass(`${connectorMethods.length} connector methods validated`);

// ---------------------------------------------------------------------------
// 3. Every connector has at least one method
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log('\n3. Checking connector coverage...');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _usedConnectors = new Set(connectorMethods.map((m) => m.connector));
for (const c of SDK_CONNECTORS) {
  // Some connectors are frontend-only (storage, clipboard, files, etc.)
  // and their methods may use 'bridge' transport, not 'connector'
  const hasMethod = SDK_METHODS.some(
    (m) => m.connector === c.id || (m.namespace === c.sdkNamespace && m.transport !== 'local')
  );
  if (!hasMethod) {
    fail(`Connector ${c.id} (namespace: ${c.sdkNamespace}) has no methods in SDK_METHODS`);
  }
}
pass(`${SDK_CONNECTORS.length} connectors checked`);

// ---------------------------------------------------------------------------
// 4. connectorSdkNamespace mapping
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log('\n4. Checking namespace mapping...');
for (const c of SDK_CONNECTORS) {
  const mapped = connectorSdkNamespace(c.id);
  if (mapped !== c.sdkNamespace) {
    fail(`connectorSdkNamespace('${c.id}') returned '${mapped}', expected '${c.sdkNamespace}'`);
  }
}
pass(`${SDK_CONNECTORS.length} namespace mappings correct`);

// ---------------------------------------------------------------------------
// 5. Derived helper outputs
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log('\n5. Checking derived helpers...');
const validNs = getValidNamespaces();
if (validNs.size === 0) {
  fail('getValidNamespaces() returned empty set');
} else {
  pass(`getValidNamespaces(): ${validNs.size} entries`);
}

const base = getBaseConnectors();
if (base.length === 0) {
  fail('getBaseConnectors() returned empty array');
} else {
  pass(`getBaseConnectors(): ${base.length} connectors`);
}

const keyGated = getKeyGatedConnectors();
if (keyGated.length === 0) {
  fail('getKeyGatedConnectors() returned empty array');
} else {
  pass(`getKeyGatedConnectors(): ${keyGated.length} connectors`);
}

// Verify no overlap between base and key-gated
const baseIds = new Set(base);
for (const kg of keyGated) {
  if (baseIds.has(kg.connector)) {
    fail(`Connector ${kg.connector} appears in both base and key-gated lists`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log('\n' + '='.repeat(50));
if (errors > 0) {
  // eslint-disable-next-line no-console
  console.error(`FAILED: ${errors} error(s) found`);
  process.exit(1);
} else {
  // eslint-disable-next-line no-console
  console.log(`PASSED: SDK surface schema is self-consistent`);
  // eslint-disable-next-line no-console
  console.log(
    `  ${SDK_METHODS.length} methods across ${new Set(SDK_METHODS.map((m) => m.namespace || '(top-level)')).size} namespaces`
  );
  // eslint-disable-next-line no-console
  console.log(
    `  ${SDK_CONNECTORS.length} connectors (${base.length} base + ${keyGated.length} key-gated)`
  );
  process.exit(0);
}
