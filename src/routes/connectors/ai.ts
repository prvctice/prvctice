/**
 * AI inference connector handler.
 * Routes LLM requests through the existing provider adapter system.
 * API keys sourced from server environment only -- never from app params.
 * Output capped at 2000 tokens (complete) / 4000 tokens (stream).
 */

import { Router, json } from 'express';
import { createAdapter } from '../../services/llmProviderFactory.js';
import type { ChatRequest } from '../../../types/chat.js';

/** Default and maximum output tokens for app AI requests. */
const DEFAULT_MAX_TOKENS = 2000;

/** Maximum output tokens for streaming AI requests (double the complete cap). */
const STREAM_MAX_TOKENS = 4000;

/** Map of provider names to their environment variable key names. */
const PROVIDER_ENV_KEYS: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  google: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/** Default model per provider when none is specified by the app. */
const DEFAULT_MODELS: Readonly<Record<string, string>> = {
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.0-flash',
  google: 'gemini-2.0-flash',
  openrouter: 'anthropic/claude-haiku-4-5-20251001',
};

/**
 * Resolve API key from server environment only.
 * App params are never trusted with API keys (CONB-06).
 */
function resolveApiKey(provider: string): string {
  const envVar = PROVIDER_ENV_KEYS[provider.toLowerCase()];
  if (envVar) {
    const key = process.env[envVar];
    if (key && key.trim().length > 0) {
      return key.trim();
    }
  }
  // Generic fallback: try PROVIDER_API_KEY pattern
  const genericKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (genericKey && genericKey.trim().length > 0) {
    return genericKey.trim();
  }
  throw new Error(`No API key configured for provider: ${provider}`);
}

/**
 * AI completion handler.
 * Accepts a prompt and optional provider/model preferences.
 * Streams the full response internally and returns the assembled text.
 */
/**
 * Unwrap options from the SDK's nested format.
 * The SDK sends { prompt, options: { provider, model, maxTokens } }
 * but callers may also pass flat params { prompt, provider, model, maxTokens }.
 * This function normalizes both forms.
 */
function unwrapOptions(params: Record<string, unknown>): Record<string, unknown> {
  const opts =
    typeof params.options === 'object' && params.options !== null
      ? (params.options as Record<string, unknown>)
      : {};
  return {
    ...opts,
    ...params,
  };
}

async function complete(params: Record<string, unknown>): Promise<unknown> {
  const merged = unwrapOptions(params);

  const prompt = merged.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('prompt is required and must be a non-empty string');
  }

  const provider = typeof merged.provider === 'string' ? merged.provider : 'anthropic';
  const apiKey = resolveApiKey(provider);
  const adapter = createAdapter(provider, apiKey);

  const requestedTokens =
    typeof merged.maxTokens === 'number' ? merged.maxTokens : DEFAULT_MAX_TOKENS;
  const maxTokens = Math.min(requestedTokens, DEFAULT_MAX_TOKENS);

  const model =
    typeof merged.model === 'string'
      ? merged.model
      : (DEFAULT_MODELS[provider.toLowerCase()] ?? 'claude-haiku-4-5-20251001');

  const request: ChatRequest = {
    provider,
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    stream: true,
  };

  let text = '';
  for await (const chunk of adapter.streamChat(request)) {
    if (chunk.type === 'delta') {
      text += chunk.content;
    }
  }

  // CONB-06: API key never appears in response
  return { text, provider, model };
}

export const aiHandler: Readonly<
  Record<string, (params: Record<string, unknown>) => Promise<unknown>>
> = { complete };

// ==================== Streaming ====================

/**
 * Streaming AI generator.
 * Yields NDJSON-compatible chunks: delta (text), done (metadata), error.
 */
async function* streamChunks(params: Record<string, unknown>): AsyncGenerator<{
  type: string;
  text?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}> {
  const merged = unwrapOptions(params);

  const prompt = merged.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    yield { type: 'error', error: 'prompt is required and must be a non-empty string' };
    return;
  }

  const provider = typeof merged.provider === 'string' ? merged.provider : 'anthropic';

  try {
    const apiKey = resolveApiKey(provider);
    const adapter = createAdapter(provider, apiKey);

    const requestedTokens =
      typeof merged.maxTokens === 'number' ? merged.maxTokens : STREAM_MAX_TOKENS;
    const maxTokens = Math.min(requestedTokens, STREAM_MAX_TOKENS);
    const model =
      typeof merged.model === 'string'
        ? merged.model
        : (DEFAULT_MODELS[provider.toLowerCase()] ?? 'claude-haiku-4-5-20251001');

    const request: ChatRequest = {
      provider,
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      stream: true,
    };

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of adapter.streamChat(request)) {
      if (chunk.type === 'delta') {
        yield { type: 'delta', text: chunk.content };
      }
      if (chunk.type === 'usage') {
        promptTokens = chunk.prompt_tokens;
        completionTokens = chunk.completion_tokens;
      }
    }

    yield {
      type: 'done',
      metadata: {
        model,
        tokens: { prompt: promptTokens, completion: completionTokens },
      },
    };
  } catch (err) {
    yield { type: 'error', error: (err as Error).message || 'Stream failed' };
  }
}

/**
 * Express router for streaming AI endpoint.
 * Returns NDJSON: one JSON line per chunk (delta, done, error).
 */
export const aiStreamRoute = Router();

aiStreamRoute.post('/', json(), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const params = (body.params as Record<string, unknown>) ?? {};

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    for await (const chunk of streamChunks(params)) {
      res.write(JSON.stringify(chunk) + '\n');
    }
    res.end();
  } catch (err) {
    res.write(
      JSON.stringify({ type: 'error', error: (err as Error).message || 'Stream failed' }) + '\n'
    );
    res.end();
  }
});
