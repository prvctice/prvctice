/**
 * App suggestion route -- generates HTML app proposals from observed usage patterns.
 *
 * POST /api/v1/suggest-app
 *   - Accepts detected app-usage patterns + connector list + provider credentials
 *   - Calls AI with app-discovery prompt template
 *   - Parses and validates the JSON response
 *   - Retries once with corrective guidance on parse failure
 *   - Returns a structured proposal or error
 *
 * Privacy: Only action codes and connector names are sent to the AI.
 * No conversation content is ever included.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import logger from '../utils/logger.js';
import {
  callProvider,
  resolveProvider,
  resolveApiKey,
  DEFAULT_MODELS,
} from '../services/providerCaller.js';

// ---------------------------------------------------------------------------
// Request / Response schemas
// ---------------------------------------------------------------------------

const PatternSchema = z.object({
  actions: z.array(z.string()).min(1),
  count: z.number().int().positive(),
  reasoning: z.string(),
});

const AppProposalRequestSchema = z.object({
  patterns: z.array(PatternSchema).min(1),
  usedConnectors: z.array(z.string()),
  existingAppNames: z.array(z.string()),
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

const AppProposalResponseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  html: z.string().min(1),
  permissions: z.array(z.string()),
  window: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  reasoning: z.string(),
  impact: z.string(),
});

type AppProposalRequest = z.infer<typeof AppProposalRequestSchema>;

interface AppProposal {
  readonly name: string;
  readonly description: string;
  readonly html: string;
  readonly permissions: readonly string[];
  readonly window: { readonly width: number; readonly height: number };
  readonly reasoning: string;
  readonly impact: string;
}

interface SuggestAppResponse {
  readonly ok: boolean;
  readonly proposal?: AppProposal;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

let cachedPromptTemplate: string | null = null;
let cachedComponentsGuide: string | null = null;

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) return cachedPromptTemplate;
  const promptPath = resolvePath(process.cwd(), 'src/prompts/app-discovery.md');
  cachedPromptTemplate = readFileSync(promptPath, 'utf-8');
  return cachedPromptTemplate;
}

function loadComponentsGuide(): string {
  if (cachedComponentsGuide) return cachedComponentsGuide;
  const guidePath = resolvePath(process.cwd(), 'src/prompts/components-guide.md');
  cachedComponentsGuide = readFileSync(guidePath, 'utf-8');
  return cachedComponentsGuide;
}

function buildPrompt(req: AppProposalRequest): string {
  let template = loadPromptTemplate();

  const patternsText = req.patterns
    .map(
      (p) =>
        `- Actions: [${p.actions.join(', ')}] (occurred ${p.count} times)\n  Reasoning: ${p.reasoning}`
    )
    .join('\n');

  template = template.replace('{{COMPONENTS_GUIDE}}', loadComponentsGuide());
  template = template.replace('{{PATTERNS}}', patternsText);
  template = template.replace(
    '{{USED_CONNECTORS}}',
    req.usedConnectors.length > 0 ? req.usedConnectors.join(', ') : '(none)'
  );
  template = template.replace(
    '{{EXISTING_APP_NAMES}}',
    req.existingAppNames.length > 0 ? req.existingAppNames.join(', ') : '(none)'
  );

  return template;
}

// ---------------------------------------------------------------------------
// Parse AI response
// ---------------------------------------------------------------------------

function parseAIResponse(raw: string): AppProposal | null {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const validated = AppProposalResponseSchema.safeParse(parsed);
    if (validated.success) return validated.data;

    return null;
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        const validated = AppProposalResponseSchema.safeParse(parsed);
        if (validated.success) return validated.data;
      } catch {
        // Fall through
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generate proposal (with optional retry hint)
// ---------------------------------------------------------------------------

async function generateProposal(
  req: AppProposalRequest,
  correctionHint?: string
): Promise<{ proposal?: AppProposal; error?: string }> {
  const provider = resolveProvider(req.provider);
  if (!provider) {
    return { error: `unsupported_provider: ${req.provider}` };
  }

  const model = req.model || DEFAULT_MODELS[provider];

  let prompt = buildPrompt(req);
  if (correctionHint) {
    prompt = `${prompt}\n\n## CORRECTION REQUIRED\n${correctionHint}`;
  }

  const result = await callProvider(provider, req.apiKey, model, prompt, {
    maxTokens: 8192,
    timeoutMs: 60000,
  });
  const proposal = parseAIResponse(result.text);

  if (!proposal) {
    return { error: 'parse_failed' };
  }

  return { proposal };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

router.post(
  '/',
  async (
    req: Request<object, SuggestAppResponse, unknown>,
    res: Response<SuggestAppResponse>
  ): Promise<void> => {
    try {
      const parsed = AppProposalRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const errorMessage = parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        res.status(400).json({ ok: false, error: `invalid_request: ${errorMessage}` });
        return;
      }

      const suggestReq = parsed.data;

      // Resolve API key: client-provided > session > server env var
      const provider = resolveProvider(suggestReq.provider);
      if (!provider) {
        res.status(400).json({ ok: false, error: `unsupported_provider: ${suggestReq.provider}` });
        return;
      }

      const apiKey = resolveApiKey(provider, suggestReq.apiKey, req as Request, true);
      if (!apiKey) {
        res
          .status(400)
          .json({ ok: false, error: 'No API key available for this provider. Check Settings.' });
        return;
      }

      // Use resolved key
      const resolvedReq: AppProposalRequest = { ...suggestReq, apiKey };

      logger.info('suggest_app_request', {
        provider: resolvedReq.provider,
        patternCount: resolvedReq.patterns.length,
        connectors: resolvedReq.usedConnectors,
        existingApps: resolvedReq.existingAppNames.length,
      });

      // First attempt
      const firstAttempt = await generateProposal(resolvedReq);

      if (firstAttempt.proposal) {
        logger.info('suggest_app_success', { name: firstAttempt.proposal.name });
        res.json({ ok: true, proposal: firstAttempt.proposal });
        return;
      }

      // Retry once with corrective guidance if parse failed
      if (firstAttempt.error === 'parse_failed') {
        logger.info('suggest_app_retry', { firstError: firstAttempt.error });

        const correctionHint = [
          'Your previous output could not be parsed as valid JSON.',
          'Please return ONLY a JSON object (no markdown fences) matching this format:',
          '{ "name": "...", "description": "...", "html": "...", "permissions": [...],',
          '  "window": { "width": N, "height": N }, "reasoning": "...", "impact": "..." }',
        ].join('\n');

        const retryAttempt = await generateProposal(resolvedReq, correctionHint);

        if (retryAttempt.proposal) {
          logger.info('suggest_app_retry_success', { name: retryAttempt.proposal.name });
          res.json({ ok: true, proposal: retryAttempt.proposal });
          return;
        }

        logger.warn('suggest_app_retry_failed', { error: retryAttempt.error });
        res.json({ ok: false, error: 'parse_failed' });
        return;
      }

      logger.warn('suggest_app_failed', { error: firstAttempt.error });
      res.json({ ok: false, error: firstAttempt.error ?? 'generation_failed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('suggest_app_error', { error: message });
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
