/**
 * LM Studio routes for model discovery and status checking.
 * Communicates with local LM Studio server.
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';

const router = Router();

const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234';

interface LMStudioStatus {
  available: boolean;
  error: string | null;
}

interface LMStudioModel {
  id: string;
  name: string;
  owned_by: string;
}

/**
 * Validate that a URL uses http/https and points to a localhost address only.
 * Prevents SSRF by rejecting any non-local base URLs.
 */
function isLocalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Get LM Studio base URL from request or environment.
 * Returns the URL string or null if the provided URL is invalid.
 * Only localhost URLs with http/https protocol are accepted to prevent SSRF.
 */
function getBaseUrl(req: Request): { url: string; valid: true } | { url: string; valid: false } {
  const candidates = [
    req.query.baseUrl as string | undefined,
    req.headers['x-lmstudio-url'] as string | undefined,
    process.env.LMSTUDIO_URL,
  ].filter(Boolean) as string[];

  // No user-supplied URL -- use the safe default
  if (candidates.length === 0) {
    return { url: DEFAULT_LMSTUDIO_URL, valid: true };
  }

  // Validate the first candidate (highest priority)
  const candidate = candidates[0] ?? DEFAULT_LMSTUDIO_URL;
  if (isLocalUrl(candidate)) {
    return { url: candidate, valid: true };
  }

  return { url: candidate, valid: false };
}

/**
 * Check if LM Studio server is reachable.
 */
async function checkLMStudioStatus(baseUrl: string): Promise<LMStudioStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { available: response.ok, error: null };
  } catch (err) {
    const error = err as Error & { code?: string; cause?: { code?: string }; name?: string };
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      return {
        available: false,
        error: 'LM Studio is not running. Start LM Studio and load a model.',
      };
    }
    if (error.name === 'AbortError') {
      return { available: false, error: 'LM Studio server timed out' };
    }
    return { available: false, error: error.message };
  }
}

interface RawModel {
  id: string;
  owned_by?: string;
}

/**
 * Fetch loaded models from LM Studio.
 */
async function fetchModels(baseUrl: string): Promise<RawModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.status}`);
    }

    const data = (await response.json()) as { data?: RawModel[] };
    return data.data || [];
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Format model data for the UI.
 */
function formatModels(models: RawModel[]): LMStudioModel[] {
  return models
    .map((m) => ({
      id: m.id,
      name: m.id,
      owned_by: m.owned_by || 'local',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * GET /api/v1/lmstudio/status
 * Check if LM Studio server is running.
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const result = getBaseUrl(req);
  if (!result.valid) {
    res.status(400).json({ error: 'LM Studio URL must point to localhost' });
    return;
  }
  const baseUrl = result.url;

  try {
    const status = await checkLMStudioStatus(baseUrl);
    res.json({ ok: true, ...status, baseUrl });
  } catch (err) {
    res.json({ ok: true, available: false, error: (err as Error).message, baseUrl });
  }
});

/**
 * GET /api/v1/lmstudio/models
 * Returns list of loaded LM Studio models.
 */
router.get('/models', async (req: Request, res: Response): Promise<void> => {
  const result = getBaseUrl(req);
  if (!result.valid) {
    res.status(400).json({ error: 'LM Studio URL must point to localhost' });
    return;
  }
  const baseUrl = result.url;

  try {
    // First check if LM Studio is available
    const status = await checkLMStudioStatus(baseUrl);
    if (!status.available) {
      res.json({
        ok: true,
        available: false,
        models: [],
        error: status.error,
        baseUrl,
      });
      return;
    }

    // Fetch models
    const rawModels = await fetchModels(baseUrl);
    const models = formatModels(rawModels);

    res.json({
      ok: true,
      available: true,
      models,
      baseUrl,
    });
  } catch (err) {
    logger.error('lmstudio_fetch_models_failed', { error: (err as Error).message });

    // Provide helpful error messages
    const error = err as Error & { code?: string; cause?: { code?: string } };
    let errorMsg = error.message;
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      errorMsg = 'LM Studio is not running. Start LM Studio and load a model.';
    }

    res.json({
      ok: true,
      available: false,
      models: [],
      error: errorMsg,
      baseUrl,
    });
  }
});

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
