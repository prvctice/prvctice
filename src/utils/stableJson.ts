'use strict';

// Stable JSON stringify: sorts object keys recursively and normalizes primitives
// to produce a deterministic string for hashing and deduplication keys.

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function stable(value: unknown): JsonValue | undefined {
  if (Array.isArray(value)) return value.map(stable) as JsonValue[];
  if (value && typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const k of Object.keys(value).sort())
      out[k] = stable((value as Record<string, unknown>)[k]) as JsonValue;
    return out;
  }
  // Normalize NaN and +/-Infinity which JSON.stringify turns into null
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value as JsonValue;
}

function stableStringify(v: unknown): string {
  try {
    return JSON.stringify(stable(v));
  } catch (e) {
    // Fallback: best-effort stringify
    return JSON.stringify(v);
  }
}

module.exports = { stableStringify };

export { stableStringify };
