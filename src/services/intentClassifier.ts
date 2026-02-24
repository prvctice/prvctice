'use strict';

/**
 * Intent classifier v2 - multi-provider model-first router contract.
 * Labels: chat_vision | chat_text
 *
 * Supports: OpenAI, Anthropic, Gemini, OpenRouter
 * Returns null if no provider is available (NO heuristic fallback).
 */

import logger from '../utils/logger.js';
import { fetchWithTimeout } from '../utils/timeout.js';
import type { SessionWithKeys } from '../utils/sessionKeys.js';

export type TaskType = 'chat_vision' | 'chat_text' | 'app_generate';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ClassifierProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

const VALID_TASKS: TaskType[] = ['chat_vision', 'chat_text', 'app_generate'];

const SYSTEM_PROMPT = [
  'You are a strict request classifier for a router. Choose exactly one of: chat_vision, chat_text, app_generate.',
  'Return only compact JSON with keys: task, confidence, top (<=2 items with rationale), schema_version="v2". No extra prose.',
  'Guidelines:',
  '- app_generate: ONLY when the user wants an interactive UI component — an app, widget, tool, dashboard, calculator, timer, game, synthesizer, drum pad, visualizer, etc. The request must clearly describe a functional interface, not just content.',
  '- NOT app_generate: Requests for textual content like lists, summaries, plans, rankings, recommendations, comparisons, outlines, stories, poems, essays, analyses, or any information/knowledge response. These are chat_text even if they use words like "make", "create", "build", or "generate".',
  '- If has_images_attached=true: use chat_vision to analyze/describe the images.',
  '- If no images attached and not app_generate: use chat_text.',
  'When in doubt between app_generate and chat_text, prefer chat_text.',
  'Confidence must be one of: high, medium, low. Keep rationale short.',
].join(' ');

export interface ClassifierInput {
  text: string;
  has_images_attached: boolean;
  recent_image_available: boolean;
  last_task: string;
  last_asset_kind: string;
  provider_selected: string;
  user_overrides: unknown;
  schema_version: string;
}

export interface TopItem {
  task: TaskType;
  rationale: string;
}

export interface ClassifierResult {
  task: TaskType | null;
  confidence?: ConfidenceLevel;
  top?: TopItem[];
  schema_version?: string;
  error?: string;
}

interface ClassifierContext {
  client?: unknown;
  apiKey?: string;
  input: ClassifierInput;
}

interface ResolvedProvider {
  provider: ClassifierProvider;
  client?: unknown;
  apiKey?: string;
}

/**
 * Provider-specific classifiers
 */
const classifiers: Record<ClassifierProvider, (ctx: ClassifierContext) => Promise<string>> = {
  async openai({ client, input }) {
    const resp = await (
      client as { responses: { create: (opts: unknown) => Promise<unknown> } }
    ).responses.create({
      model: process.env.CLASSIFIER_MODEL_OPENAI || 'gpt-4.1-nano',
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
      text: { format: { type: 'json_object' } },
    });
    const response = resp as { output?: Array<{ content?: Array<{ text?: string }> }> };
    return response?.output?.[0]?.content?.[0]?.text || '{}';
  },

  async anthropic({ apiKey, input }) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: process.env.CLASSIFIER_MODEL_ANTHROPIC || 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    });
    const firstBlock = resp.content?.[0];
    return (firstBlock && 'text' in firstBlock ? firstBlock.text : null) || '{}';
  },

  async gemini({ apiKey, input }) {
    if (!apiKey) throw new Error('Gemini API key required');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.CLASSIFIER_MODEL_GEMINI || 'gemini-2.0-flash-lite',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent([
      { text: SYSTEM_PROMPT + '\n\n' + JSON.stringify(input) },
    ]);
    return result.response?.text() || '{}';
  },

  async openrouter({ apiKey, input }) {
    const timeoutMs = parseInt(process.env.CLASSIFIER_TIMEOUT_MS || '15000', 10);
    const response = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.CLASSIFIER_MODEL_OPENROUTER || 'openai/gpt-4.1-nano',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(input) },
          ],
          response_format: { type: 'json_object' },
        }),
      },
      timeoutMs
    );
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '{}';
  },
};

export interface ClassifyIntentOptions {
  trialActive?: boolean;
  apiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  googleApiKey?: string;
  openrouterApiKey?: string;
  session?:
    | (SessionWithKeys & {
        openaiApiKey?: string;
        anthropicApiKey?: string;
        googleApiKey?: string;
        geminiApiKey?: string;
        openrouterApiKey?: string;
      })
    | null;
  text?: string;
  has_images_attached?: boolean;
  hasImages?: boolean;
  recent_image_available?: boolean;
  recentImageAvailable?: boolean;
  last_task?: string;
  last_asset_kind?: string;
  provider_selected?: string;
  provider?: string;
  user_overrides?: unknown;
}

/**
 * Resolve which provider and credentials to use for classification.
 * IMPORTANT: Respects user's provider_selected choice first!
 * Only falls back to cascade if no provider is explicitly selected.
 */
export function resolveClassifierProvider(
  opts: ClassifyIntentOptions = {}
): ResolvedProvider | null {
  const debug = process.env.DEBUG_CLASSIFIER;
  const trialActive = opts.trialActive === true;
  const session = opts.session || null;
  const selectedProvider = (opts.provider_selected || opts.provider || '').toLowerCase();

  if (debug) {
    logger.debug('classifier_provider_selected', { selectedProvider, trialActive });
  }

  // Helper to get provider-specific key
  const getAnthropicKey = () =>
    opts.anthropicApiKey ||
    session?.anthropicApiKey ||
    (trialActive ? process.env.ANTHROPIC_API_KEY : null);
  const getGeminiKey = () =>
    opts.geminiApiKey ||
    opts.googleApiKey ||
    session?.googleApiKey ||
    session?.geminiApiKey ||
    (trialActive ? process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY : null);
  const getOpenRouterKey = () =>
    opts.openrouterApiKey ||
    session?.openrouterApiKey ||
    (trialActive ? process.env.OPENROUTER_API_KEY : null);

  // If user explicitly selected a provider, use ONLY that provider
  if (selectedProvider) {
    if (debug) {
      logger.debug('classifier_using_selected_provider', { selectedProvider });
    }

    switch (selectedProvider) {
      case 'openai': {
        // OpenAI provider is no longer supported for classification
        if (debug) logger.debug('classifier_selected_openai_unavailable');
        return null;
      }

      case 'anthropic':
      case 'claude': {
        const key = getAnthropicKey();
        if (key) {
          return { provider: 'anthropic', apiKey: key };
        }
        if (debug) logger.debug('classifier_selected_anthropic_unavailable');
        return null;
      }

      case 'gemini':
      case 'google': {
        const key = getGeminiKey();
        if (key) {
          return { provider: 'gemini', apiKey: key };
        }
        if (debug) logger.debug('classifier_selected_gemini_unavailable');
        return null;
      }

      case 'openrouter': {
        const key = getOpenRouterKey();
        if (key) {
          return { provider: 'openrouter', apiKey: key };
        }
        if (debug) logger.debug('classifier_selected_openrouter_unavailable');
        return null;
      }

      case 'lmstudio':
      case 'local': {
        // LM Studio doesn't support classification - skip it and let caller handle
        if (debug) logger.debug('classifier_lmstudio_not_supported');
        return null;
      }

      default:
        if (debug) logger.debug('classifier_unknown_provider', { selectedProvider });
        // Unknown provider - fall through to cascade
        break;
    }
  }

  // No provider explicitly selected - use cascade fallback
  if (debug) {
    logger.debug('classifier_using_cascade_fallback');
  }

  // 1. Try Anthropic
  const anthropicKey = getAnthropicKey();
  if (debug) {
    logger.debug('classifier_anthropic_check', { hasKey: !!anthropicKey });
  }
  if (anthropicKey) {
    return { provider: 'anthropic', apiKey: anthropicKey };
  }

  // 2. Try Gemini
  const geminiKey = getGeminiKey();
  if (debug) {
    logger.debug('classifier_gemini_check', { hasKey: !!geminiKey });
  }
  if (geminiKey) {
    return { provider: 'gemini', apiKey: geminiKey };
  }

  // 3. Try OpenRouter
  const openrouterKey = getOpenRouterKey();
  if (debug) {
    logger.debug('classifier_openrouter_check', { hasKey: !!openrouterKey });
  }
  if (openrouterKey) {
    return { provider: 'openrouter', apiKey: openrouterKey };
  }

  // No provider available
  if (debug) logger.debug('classifier_no_provider');
  return null;
}

/**
 * Parse and validate classifier output
 */
function parseClassifierOutput(outText: string): ClassifierResult | null {
  let parsed: {
    task?: string;
    confidence?: string;
    top?: Array<{ task?: string; rationale?: string }>;
  };
  try {
    parsed = JSON.parse(outText || '{}');
  } catch {
    return null;
  }
  const task = parsed?.task;
  if (!task || !VALID_TASKS.includes(task as TaskType)) return null;

  const confidence: ConfidenceLevel =
    parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low';

  let top: TopItem[] | undefined = Array.isArray(parsed.top)
    ? (parsed.top.slice(0, 2) as TopItem[])
    : undefined;
  if (top) {
    top = top
      .filter((t) => t && VALID_TASKS.includes(t.task as TaskType))
      .slice(0, 2)
      .map((t) => ({ task: t.task as TaskType, rationale: String(t.rationale || '') }));
  }

  return { task: task as TaskType, confidence, top, schema_version: 'v2' };
}

/**
 * Classify user intent using any available AI provider.
 * Returns null if no provider is configured (NO heuristic fallback).
 */
export async function classifyIntent(
  opts: ClassifyIntentOptions = {}
): Promise<ClassifierResult | null> {
  try {
    const resolved = resolveClassifierProvider(opts);

    // No provider available - return null with reason (caller should handle this)
    if (!resolved) {
      if (process.env.DEBUG_CLASSIFIER) {
        logger.debug('classifier_no_provider_opts', {
          hasAnthropic: !!opts.anthropicApiKey,
          hasGemini: !!(opts.geminiApiKey || opts.googleApiKey),
          hasOpenRouter: !!opts.openrouterApiKey,
        });
      }
      return null;
    }

    const input: ClassifierInput = {
      text: String(opts.text || '').slice(0, 2000),
      has_images_attached: !!opts.has_images_attached || !!opts.hasImages,
      recent_image_available: !!opts.recent_image_available || !!opts.recentImageAvailable,
      last_task: opts.last_task || 'none',
      last_asset_kind: opts.last_asset_kind || 'none',
      provider_selected: opts.provider_selected || opts.provider || '',
      user_overrides: opts.user_overrides ?? null,
      schema_version: 'v2',
    };

    if (process.env.DEBUG_CLASSIFIER) {
      logger.debug('classifier_using', { provider: resolved.provider });
    }

    const classifier = classifiers[resolved.provider];
    const outText = await classifier({
      client: resolved.client,
      apiKey: resolved.apiKey,
      input,
    });

    return parseClassifierOutput(outText);
  } catch (err) {
    // Classification error - log it for debugging but return null (no heuristic fallback)
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.DEBUG_CLASSIFIER) {
      logger.error('classifier_error', { error: message });
    }
    // Return error info so dispatch.js can show a better message
    return { error: message || 'Classification failed', task: null };
  }
}

export default { classifyIntent, resolveClassifierProvider };
