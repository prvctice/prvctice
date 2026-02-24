/**
 * Vision connector handler.
 * Wraps visionService for AI-powered image description.
 * Requires LLM provider API key — throws explicit error when not configured.
 */

import { runVision } from '../../services/visionService.js';
import type { ServiceKeys } from './index.js';

/** Map provider names to their service key field names. */
const PROVIDER_KEY_MAP: Readonly<Record<string, string>> = {
  anthropic: 'anthropic',
  gemini: 'gemini',
  openrouter: 'openrouter',
};

async function describe(
  params: Record<string, unknown>,
  _appId: string,
  _req: unknown,
  serviceKeys: ServiceKeys
): Promise<unknown> {
  const imageData = String(params.imageData || '').trim();
  if (!imageData) throw new Error('imageData is required');

  const prompt = typeof params.prompt === 'string' ? params.prompt : 'Describe this image';
  const provider = typeof params.provider === 'string' ? params.provider : 'anthropic';

  const keyField = PROVIDER_KEY_MAP[provider] || provider;
  const apiKey = serviceKeys[keyField] || process.env[`${provider.toUpperCase()}_API_KEY`];

  if (!apiKey) {
    throw new Error('LLM provider API key not configured. Add your key in Settings > AI.');
  }

  const result = await runVision({
    provider,
    apiKey,
    message: prompt,
    images: [imageData],
  });

  return { text: result.text };
}

export const visionHandler: Readonly<
  Record<
    string,
    (
      params: Record<string, unknown>,
      appId: string,
      req: unknown,
      serviceKeys: ServiceKeys
    ) => Promise<unknown>
  >
> = { describe };
