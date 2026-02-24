/*
 * Lightweight access helpers for the provider capability matrix.
 *
 * The matrix itself lives in `config/capabilities.json` so non-code users can
 * tweak limits or add new providers without touching JS source.
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';

interface ProviderCapabilities {
  streaming?: boolean;
  tools?: string | boolean;
  [key: string]: unknown;
}

type CapabilityMatrix = Record<string, ProviderCapabilities>;

// Load once at module import – reading a tiny JSON file on boot is fine and
// avoids disk IO during hot paths.
let matrix: CapabilityMatrix = {};
try {
  const file = path.join(__dirname, '../../config/capabilities.json');
  matrix = JSON.parse(fs.readFileSync(file, 'utf8')) as CapabilityMatrix;
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[capabilities] Failed to load matrix – falling back to empty', err);
}

function getCapabilities(provider: string | undefined | null): ProviderCapabilities {
  if (!provider) return {};
  return matrix[provider.toLowerCase()] || {};
}

function supportsStreaming(provider: string | undefined | null): boolean {
  return !!getCapabilities(provider).streaming;
}

function supportsTools(provider: string | undefined | null): boolean {
  const t = getCapabilities(provider).tools;
  return t != null && t !== 'none' && t !== false;
}

module.exports = {
  getCapabilities,
  supportsStreaming,
  supportsTools,
};

export { getCapabilities, supportsStreaming, supportsTools };
