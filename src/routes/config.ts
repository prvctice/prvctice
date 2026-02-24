import { Router, Request, Response } from 'express';
import { loadDefaults } from '../config/defaults.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
};

const router = Router();

interface KeysResponse {
  ok: boolean;
  has?: {
    openai: boolean;
    anthropic: boolean;
    google: boolean;
    openrouter: boolean;
    lmstudio: boolean;
    freeTier: boolean;
  };
}

interface DefaultsResponse {
  ok: boolean;
  defaults?: ReturnType<typeof loadDefaults>;
}

interface RuntimeResponse {
  ok: boolean;
  runtime?: {
    version: string;
    staticRoot: string;
  };
}

interface FlagsResponse {
  ok: boolean;
  flags?: {
    MODEL_FIRST_ROUTER: boolean;
    MODEL_ROUTER_DRY_RUN: boolean;
    SMART_SWITCHES: boolean;
    RECENT_IMAGE_TTL_MIN: number;
    schema_version: string;
  };
}

/**
 * Simple config router to expose limited, non-sensitive booleans
 * indicating which provider API keys are present via environment.
 * This allows the renderer to decide which model fields should be editable.
 */

router.get('/keys', (_req: Request, res: Response<KeysResponse>): void => {
  try {
    const has = {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      google: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      lmstudio: Boolean(process.env.LMSTUDIO_URL), // LM Studio doesn't need a key, just a URL
      freeTier: Boolean(process.env.FREE_TIER_API_KEY),
    };
    res.json({ ok: true, has });
  } catch (_err) {
    res.status(500).json({ ok: false });
  }
});

// Expose non-sensitive app defaults (provider/models/reasoning)
router.get('/defaults', (_req: Request, res: Response<DefaultsResponse>): void => {
  try {
    const d = loadDefaults();
    // No secrets in defaults.json; return as-is
    res.json({ ok: true, defaults: d });
  } catch (_err) {
    res.status(500).json({ ok: false });
  }
});

// Expose runtime info useful for diagnostics (non-sensitive)
router.get('/runtime', (req: Request, res: Response<RuntimeResponse>): void => {
  try {
    const staticRoot = (req.app.get('staticRoot') as string) || 'public';
    res.json({ ok: true, runtime: { version: pkg.version, staticRoot } });
  } catch (_err) {
    res.status(500).json({ ok: false });
  }
});

// Expose non-sensitive feature flags/state for UI hints
router.get('/flags', (_req: Request, res: Response<FlagsResponse>): void => {
  try {
    const flags = {
      MODEL_FIRST_ROUTER: (process.env.MODEL_FIRST_ROUTER ?? 'true') !== 'false',
      MODEL_ROUTER_DRY_RUN: (process.env.MODEL_ROUTER_DRY_RUN || 'false') === 'true',
      SMART_SWITCHES: (process.env.SMART_SWITCHES || 'false') === 'true',
      RECENT_IMAGE_TTL_MIN: Number(process.env.RECENT_IMAGE_TTL_MIN || 20),
      schema_version: 'v2',
    };
    res.json({ ok: true, flags });
  } catch (_err) {
    res.status(500).json({ ok: false });
  }
});

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
