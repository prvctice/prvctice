/**
 * Unified LLM provider caller -- single entry point for non-streaming AI calls.
 *
 * Replaces duplicated callAnthropic/callGemini/callOpenRouter/callLmstudio
 * functions across suggest.ts, suggest-app.ts, and generate-app.ts.
 *
 * Each provider's HTTP shape is handled internally. Callers only need:
 *   callProvider(provider, apiKey, model, userMessage, options?)
 */

import type { Request } from 'express';
import { fetchWithTimeout } from '../utils/timeout.js';
import { normaliseError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderName = 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio';

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmCallResult {
  readonly text: string;
  readonly usage: LlmUsage | null;
}

export interface CallProviderOptions {
  /** Max output tokens (default: 4096) */
  readonly maxTokens?: number;
  /** Request timeout in ms (default: 60000) */
  readonly timeoutMs?: number;
  /** System prompt -- sent as a system message/instruction */
  readonly systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Default models per provider
// ---------------------------------------------------------------------------

export const DEFAULT_MODELS: Readonly<Record<ProviderName, string>> = {
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
  openrouter: 'minimax/minimax-m2.5',
  lmstudio: 'local-model',
};

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

export function resolveProvider(providerName: string): ProviderName | null {
  const normalized = providerName.toLowerCase().trim();
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  if (normalized === 'gemini' || normalized === 'google') return 'gemini';
  if (normalized === 'openrouter') return 'openrouter';
  if (normalized === 'lmstudio' || normalized === 'local') return 'lmstudio';
  return null;
}

// ---------------------------------------------------------------------------
// API key resolution (client > session > env, with optional trial fallback)
// ---------------------------------------------------------------------------

export function resolveApiKey(
  provider: ProviderName,
  clientKey: string,
  req: Request,
  trialActive: boolean = false
): string {
  if (provider === 'lmstudio') return 'not-required';

  if (clientKey) return clientKey;

  const session = req.session as unknown as Record<string, string | undefined> | undefined;
  if (session) {
    if (provider === 'anthropic' && session.anthropicApiKey) return session.anthropicApiKey;
    if (provider === 'gemini' && (session.googleApiKey || session.geminiApiKey))
      return (session.googleApiKey || session.geminiApiKey)!;
    if (provider === 'openrouter' && session.openrouterApiKey) return session.openrouterApiKey;
  }

  // Fall back to server env keys (always for suggest, or for trial users on generate)
  if (trialActive) {
    if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
    if (provider === 'gemini')
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || '';
  }

  return '';
}

// ---------------------------------------------------------------------------
// Provider-specific HTTP calls
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  model: string,
  userMessage: string,
  options: CallProviderOptions
): Promise<LlmCallResult> {
  const maxTokens = options.maxTokens ?? 4096;
  const timeoutMs = options.timeoutMs ?? 60000;
  const systemPrompt = options.systemPrompt;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw normaliseError(
      'anthropic',
      Object.assign(new Error(`Anthropic API error ${response.status}: ${errorText}`), {
        status: response.status,
      })
    );
  }

  const data = (await response.json()) as {
    content?: ReadonlyArray<{ type?: string; text?: string }>;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  if (data.stop_reason === 'max_tokens') {
    logger.warn('provider_caller_anthropic_truncated', { model, stop_reason: data.stop_reason });
  }

  const firstBlock = data.content?.[0];
  const text = firstBlock && firstBlock.type === 'text' ? (firstBlock.text ?? '') : '';
  const usage = data.usage
    ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
    : null;

  return { text, usage };
}

async function callGemini(
  apiKey: string,
  model: string,
  userMessage: string,
  options: CallProviderOptions
): Promise<LlmCallResult> {
  const maxTokens = options.maxTokens ?? 4096;
  const timeoutMs = options.timeoutMs ?? 60000;
  const systemPrompt = options.systemPrompt;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: userMessage }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw normaliseError(
      'gemini',
      Object.assign(new Error(`Gemini API error ${response.status}: ${errorText}`), {
        status: response.status,
      })
    );
  }

  const data = (await response.json()) as {
    candidates?: ReadonlyArray<{
      content?: { parts?: ReadonlyArray<{ text?: string }> };
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const usage = data.usageMetadata
    ? {
        inputTokens: data.usageMetadata.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
      }
    : null;

  return { text, usage };
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  userMessage: string,
  options: CallProviderOptions
): Promise<LlmCallResult> {
  const maxTokens = options.maxTokens ?? 4096;
  const timeoutMs = options.timeoutMs ?? 60000;
  const systemPrompt = options.systemPrompt;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userMessage });

  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
        response_format: { type: 'json_object' },
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw normaliseError(
      'openrouter',
      Object.assign(new Error(`OpenRouter API error ${response.status}: ${errorText}`), {
        status: response.status,
      })
    );
  }

  const data = (await response.json()) as {
    choices?: ReadonlyArray<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      }
    : null;

  return { text, usage };
}

async function callLmstudio(
  _apiKey: string,
  model: string,
  userMessage: string,
  options: CallProviderOptions
): Promise<LlmCallResult> {
  const maxTokens = options.maxTokens ?? 4096;
  const timeoutMs = options.timeoutMs ?? 60000;
  const systemPrompt = options.systemPrompt;

  const baseUrl = process.env.LMSTUDIO_URL || 'http://localhost:1234';

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userMessage });

  const response = await fetchWithTimeout(
    `${baseUrl}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
        response_format: { type: 'json_object' },
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw normaliseError(
      'lmstudio',
      Object.assign(new Error(`LM Studio API error ${response.status}: ${errorText}`), {
        status: response.status,
      })
    );
  }

  const data = (await response.json()) as {
    choices?: ReadonlyArray<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      }
    : null;

  return { text, usage };
}

// ---------------------------------------------------------------------------
// Dispatch map
// ---------------------------------------------------------------------------

type ProviderCallFn = (
  apiKey: string,
  model: string,
  userMessage: string,
  options: CallProviderOptions
) => Promise<LlmCallResult>;

const providerCallFns: Readonly<Record<ProviderName, ProviderCallFn>> = {
  anthropic: callAnthropic,
  gemini: callGemini,
  openrouter: callOpenRouter,
  lmstudio: callLmstudio,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call an LLM provider with a single user message and optional system prompt.
 * Returns the text response and optional usage data.
 */
export async function callProvider(
  provider: ProviderName,
  apiKey: string,
  model: string,
  userMessage: string,
  options: CallProviderOptions = {}
): Promise<LlmCallResult> {
  const callFn = providerCallFns[provider];
  return callFn(apiKey, model, userMessage, options);
}
