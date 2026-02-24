import path from 'path';
import fs from 'fs';

export interface DefaultModels {
  openai: string;
  anthropic: string;
  gemini: string;
  google: string;
  openrouter: string;
  [key: string]: string;
}

export interface DefaultFeatures {
  toolsEnabled: boolean;
}

export interface Defaults {
  providerDefault?: string;
  models: DefaultModels;
  reasoningDefault: string;
  features?: DefaultFeatures;
  _error?: string;
}

let cached: Defaults | null = null;

function validate(obj: unknown): obj is Defaults {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (!o.models || typeof o.models !== 'object') return false;
  if (!o.reasoningDefault || typeof o.reasoningDefault !== 'string') return false;
  return true;
}

function loadDefaults(): Defaults {
  if (cached) return cached;
  const file = path.join(__dirname, '../../config/defaults.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw) as unknown;
    if (!validate(json)) throw new Error('Invalid defaults schema');
    cached = json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Safe fallback in case file is missing or invalid
    cached = {
      providerDefault: 'anthropic',
      models: {
        openai: 'gpt-5.2',
        anthropic: 'claude-sonnet-4-6',
        gemini: 'gemini-3-flash-preview',
        google: 'gemini-3-flash-preview',
        openrouter: 'minimax/minimax-m2.5',
      },
      reasoningDefault: 'low',
      features: { toolsEnabled: true },
      _error: message,
    };
  }
  return cached;
}

export { loadDefaults };

// CommonJS compatibility
module.exports = { loadDefaults };
