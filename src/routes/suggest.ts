/**
 * Skill suggestion route -- generates SKILL.md proposals from usage patterns.
 *
 * POST /api/v1/suggest
 *   - Accepts detected action patterns + provider credentials
 *   - Calls AI to generate a SKILL.md document
 *   - Validates the result through the Zod-based skill parser
 *   - Retries once with corrective guidance on validation failure
 *   - Returns a structured proposal or error
 *
 * Privacy: Only action codes and existing skill names are sent to the AI.
 * No conversation content is ever included.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import logger from '../utils/logger.js';
import { callProvider, resolveProvider, DEFAULT_MODELS } from '../services/providerCaller.js';

// Lazy-load the skill parser — lives in web/ which may not be deployed to the server.
// If unavailable, the suggest endpoint returns an error instead of crashing the process.
type ParseResult =
  | { success: true; data: { frontmatter: { name: string; description?: string } } }
  | { success: false; error: string };
type ParseFn = (content: string, fileName: string) => ParseResult;
let _parseSkillDocument: ParseFn | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../web/services/skills/skillParser.js');
  _parseSkillDocument = mod.parseSkillDocument ?? mod.default?.parseSkillDocument ?? null;
} catch {
  logger.warn('suggest_init', {
    message: 'skillParser not available — suggest endpoint will be disabled',
  });
}

// ---------------------------------------------------------------------------
// Request / Response schemas
// ---------------------------------------------------------------------------

const PatternSchema = z.object({
  actions: z.array(z.string()).min(1),
  count: z.number().int().positive(),
  reasoning: z.string(),
});

const DismissedSchema = z.object({
  name: z.string().min(1),
  summary: z.string(),
});

const SuggestRequestSchema = z.object({
  patterns: z.array(PatternSchema).min(1),
  existingSkills: z.array(z.string()),
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  previouslyDismissed: z.array(DismissedSchema).optional(),
});

type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

interface SuggestProposal {
  readonly skillMd: string;
  readonly name: string;
  readonly summary: string;
  readonly reasoning: string;
  readonly impact: string;
}

interface SuggestResponse {
  readonly ok: boolean;
  readonly proposal?: SuggestProposal;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// AI generation prompt
// ---------------------------------------------------------------------------

const GENERATION_PROMPT = `You are a skill document generator for a productivity app. Given detected usage patterns (action codes + counts), generate ONE valid SKILL.md document.

## SKILL.md Format

A SKILL.md file has YAML frontmatter between --- delimiters, followed by a markdown body:

\`\`\`
---
name: Skill Name Here
version: "1.0.0"
category: workflow
description: One-line description of what this skill does
triggers:
  keywords:
    - keyword1
    - keyword2
    - keyword3
---

## Purpose

What this skill does and when it activates.

## Instructions

Step-by-step guidance for the AI assistant when this skill is active.
\`\`\`

## Rules

1. category MUST be one of: research, curation, workflow, tool, behavioral
2. version MUST be "1.0.0"
3. name MUST be unique and descriptive
4. triggers.keywords MUST contain 3-6 relevant keywords
5. The markdown body MUST have at least a Purpose section and Instructions section
6. Do NOT duplicate any existing skill names

## Example

\`\`\`
---
name: Research Synthesis
version: "1.0.0"
category: research
description: Combines multiple sources into a structured synthesis
triggers:
  keywords:
    - research
    - synthesize
    - combine sources
    - analysis
---

## Purpose

Activates when the user is working with multiple research sources and needs them combined into a coherent analysis.

## Instructions

1. Identify the key themes across all provided sources
2. Note areas of agreement and disagreement
3. Synthesize findings into a structured summary with citations
4. Highlight gaps in the research that may need additional sources
\`\`\`

## Output Format

Return your response as a JSON object with these fields:
- skillMd: The complete SKILL.md content (YAML frontmatter + markdown body)
- reasoning: Why this skill would help based on the detected patterns (1-2 sentences)
- impact: Expected productivity improvement (1 sentence)

Return ONLY the JSON object, no other text.`;

// ---------------------------------------------------------------------------
// Build user message from patterns (no conversation content)
// ---------------------------------------------------------------------------

function buildUserMessage(req: SuggestRequest): string {
  const parts: string[] = [];

  parts.push('## Detected Patterns\n');
  for (const pattern of req.patterns) {
    parts.push(`- Actions: [${pattern.actions.join(', ')}] (occurred ${pattern.count} times)`);
    parts.push(`  Reasoning: ${pattern.reasoning}`);
  }

  parts.push(`\n## Existing Skills (avoid duplicating)\n`);
  if (req.existingSkills.length > 0) {
    for (const name of req.existingSkills) {
      parts.push(`- ${name}`);
    }
  } else {
    parts.push('(none)');
  }

  if (req.previouslyDismissed && req.previouslyDismissed.length > 0) {
    parts.push(`\n## Previously Dismissed (suggest something DIFFERENT)\n`);
    for (const dismissed of req.previouslyDismissed) {
      parts.push(`- "${dismissed.name}": ${dismissed.summary}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Parse AI response into proposal
// ---------------------------------------------------------------------------

interface RawAIResponse {
  readonly skillMd?: string;
  readonly reasoning?: string;
  readonly impact?: string;
}

function parseAIResponse(raw: string): RawAIResponse | null {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.skillMd === 'string') {
      return {
        skillMd: parsed.skillMd,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
        impact: typeof parsed.impact === 'string' ? parsed.impact : '',
      };
    }
    return null;
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        if (typeof parsed.skillMd === 'string') {
          return {
            skillMd: parsed.skillMd,
            reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
            impact: typeof parsed.impact === 'string' ? parsed.impact : '',
          };
        }
      } catch {
        // Fall through
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generate and validate a skill proposal
// ---------------------------------------------------------------------------

async function generateProposal(
  req: SuggestRequest,
  correctionHint?: string
): Promise<{ proposal?: SuggestProposal; error?: string }> {
  const provider = resolveProvider(req.provider);
  if (!provider) {
    return { error: `unsupported_provider: ${req.provider}` };
  }

  const model = req.model || DEFAULT_MODELS[provider];
  const userMessage = correctionHint
    ? `${buildUserMessage(req)}\n\n## CORRECTION REQUIRED\n${correctionHint}`
    : buildUserMessage(req);

  const result = await callProvider(provider, req.apiKey, model, userMessage, {
    systemPrompt: GENERATION_PROMPT,
    maxTokens: 2048,
    timeoutMs: 30000,
  });
  const rawText = result.text;

  const aiResponse = parseAIResponse(rawText);
  if (!aiResponse?.skillMd) {
    return { error: 'parse_failed' };
  }

  // Validate through the Zod-based SKILL.md parser
  if (!_parseSkillDocument) {
    return { error: 'skill_parser_unavailable' };
  }
  const validation = _parseSkillDocument(aiResponse.skillMd, 'generated-skill.md');

  if (!validation.success) {
    return { error: `validation_failed: ${validation.error}` };
  }

  return {
    proposal: {
      skillMd: aiResponse.skillMd,
      name: validation.data.frontmatter.name,
      summary: validation.data.frontmatter.description ?? '',
      reasoning: aiResponse.reasoning ?? '',
      impact: aiResponse.impact ?? '',
    },
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

router.post(
  '/',
  async (
    req: Request<object, SuggestResponse, unknown>,
    res: Response<SuggestResponse>
  ): Promise<void> => {
    try {
      // Validate request body
      const parsed = SuggestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const errorMessage = parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        res.status(400).json({ ok: false, error: `invalid_request: ${errorMessage}` });
        return;
      }

      const suggestReq = parsed.data;

      logger.info('suggest_request', {
        provider: suggestReq.provider,
        patternCount: suggestReq.patterns.length,
        existingSkillCount: suggestReq.existingSkills.length,
        hasDismissed: !!(
          suggestReq.previouslyDismissed && suggestReq.previouslyDismissed.length > 0
        ),
      });

      // First attempt
      const firstAttempt = await generateProposal(suggestReq);

      if (firstAttempt.proposal) {
        logger.info('suggest_success', { name: firstAttempt.proposal.name });
        res.json({ ok: true, proposal: firstAttempt.proposal });
        return;
      }

      // Retry once with corrective guidance if validation failed
      if (firstAttempt.error?.startsWith('validation_failed:')) {
        logger.info('suggest_retry', { firstError: firstAttempt.error });

        const correctionHint = [
          'Your previous output failed SKILL.md validation.',
          `Error: ${firstAttempt.error.replace('validation_failed: ', '')}`,
          'Please fix the YAML frontmatter and try again. Ensure:',
          '- name is a non-empty string',
          '- version is exactly "1.0.0"',
          '- category is one of: research, curation, workflow, tool, behavioral',
          '- The document starts with --- and has valid YAML frontmatter',
        ].join('\n');

        const retryAttempt = await generateProposal(suggestReq, correctionHint);

        if (retryAttempt.proposal) {
          logger.info('suggest_retry_success', { name: retryAttempt.proposal.name });
          res.json({ ok: true, proposal: retryAttempt.proposal });
          return;
        }

        logger.warn('suggest_retry_failed', { error: retryAttempt.error });
        res.json({ ok: false, error: 'validation_failed' });
        return;
      }

      // Non-validation error (parse_failed, unsupported_provider, etc.)
      logger.warn('suggest_failed', { error: firstAttempt.error });
      res.json({ ok: false, error: firstAttempt.error ?? 'generation_failed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('suggest_error', { error: message });
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
