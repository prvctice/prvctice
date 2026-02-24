/*
 * Factory responsible for returning the correct provider adapter instance
 * based on the `provider` string from the request body.
 */

import type { LLMAdapter } from '../../types/adapters.js';

import AnthropicAdapter from '../adapters/anthropicAdapter.js';
import GeminiAdapter from '../adapters/geminiAdapter.js';
import OpenRouterAdapter from '../adapters/openrouterAdapter.js';
import LMStudioAdapter from '../adapters/lmstudioAdapter.js';

interface AdapterOptions {
  baseUrl?: string;
}

/**
 * Create an adapter for the specified provider.
 * @param provider - Provider name
 * @param apiKey - API key (not needed for LM Studio)
 * @param options - Additional options (e.g., baseUrl for LM Studio)
 */
export function createAdapter(
  provider: string,
  apiKey?: string,
  options: AdapterOptions = {}
): LLMAdapter {
  const providerLower = (provider || '').toLowerCase();

  // LM Studio doesn't require an API key
  if (providerLower === 'lmstudio') {
    return new LMStudioAdapter({ baseUrl: options.baseUrl });
  }

  // All other providers require an API key
  if (!apiKey) {
    throw new Error(`API key required for provider: ${provider}`);
  }

  switch (providerLower) {
    case 'anthropic':
      return new AnthropicAdapter({ apiKey });
    case 'gemini':
    case 'google':
      return new GeminiAdapter({ apiKey });
    case 'openrouter':
      return new OpenRouterAdapter({ apiKey });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export default { createAdapter };
