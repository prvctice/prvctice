/**
 * OpenRouter route for model discovery.
 * Fetches available models from OpenRouter API with caching.
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';

const router = Router();

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing: { prompt: number; completion: number } | null;
  description?: string;
}

interface ModelsResponse {
  ok: boolean;
  models?: OpenRouterModel[];
  error?: string;
}

interface OpenRouterQuery {
  [key: string]: unknown;
}

// Cache models for 15 minutes
let modelsCache: OpenRouterModel[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
  description?: string;
  architecture?: {
    modality?: string;
  };
}

/**
 * Fetch models from OpenRouter API.
 */
async function fetchModels(apiKey: string): Promise<RawModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { data?: RawModel[] };
  return data.data || [];
}

/**
 * Check if a model is usable for text chat.
 * Filters out image-only models and other non-text-output models.
 */
function isTextChatModel(model: RawModel): boolean {
  const modality = model.architecture?.modality || '';
  // Keep models that output text (e.g., "text->text", "text+image->text")
  // Filter out models that only output images (e.g., "text->image")
  if (modality.endsWith('->image')) return false;
  // Filter out audio-only outputs
  if (modality.endsWith('->audio')) return false;
  return true;
}

/**
 * Format model data for the UI.
 */
function formatModels(models: RawModel[]): OpenRouterModel[] {
  return models
    .filter(isTextChatModel)
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length,
      pricing: m.pricing
        ? {
            prompt: m.pricing.prompt ?? 0,
            completion: m.pricing.completion ?? 0,
          }
        : null,
      description: m.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * GET /api/v1/openrouter/models
 * Returns list of available OpenRouter models.
 * Requires API key in Authorization header.
 */
router.get(
  '/models',
  async (
    req: Request<object, ModelsResponse, object, OpenRouterQuery>,
    res: Response<ModelsResponse>
  ): Promise<void> => {
    try {
      // Get API key from Authorization header only (never query string — keys in
      // query params leak into logs, referer headers, and browser history).
      const authHeader = req.headers.authorization;
      const apiKey =
        authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

      if (!apiKey) {
        res.status(401).json({
          ok: false,
          error: 'OpenRouter API key required',
        });
        return;
      }

      // Check cache
      const now = Date.now();
      if (modelsCache && now - cacheTimestamp < CACHE_TTL_MS) {
        res.json({ ok: true, models: modelsCache });
        return;
      }

      // Fetch fresh models
      const rawModels = await fetchModels(apiKey);
      const models = formatModels(rawModels);

      // Update cache
      modelsCache = models;
      cacheTimestamp = now;

      res.json({ ok: true, models });
    } catch (err) {
      logger.error('openrouter_fetch_models_failed', { error: (err as Error).message });
      res.status(500).json({
        ok: false,
        error: (err as Error).message || 'Failed to fetch OpenRouter models',
      });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
