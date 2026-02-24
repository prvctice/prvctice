/**
 * App iteration route -- modifies an existing HTML app based on edit instructions.
 *
 * POST /api/v1/iterate-app
 *   - Always single Assembler call (1 LLM call)
 *   - Quality gate validates output, 1 repair retry on failure
 *   - Streams NDJSON: status steps + delta (explanation) + app_generated + done
 *
 * Max LLM calls: 3 (1 gen + 1 parse retry + 1 repair). Expected: 1.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as crypto from 'crypto';
import logger from '../utils/logger.js';
import {
  startSession,
  logSection,
  logSummary,
  logRaw,
  logError as logDebugError,
  logResult,
} from '../utils/appGenDebugLog.js';
import {
  buildAssemblerPrompt,
  buildIterationAssemblerUserMessage,
  buildIterationAssemblerUserMessageWithHistory,
  parseGenerationResponse,
} from '../services/appGenerator.js';
import type { ConversationMessage, GenerationResult } from '../services/appGenerator.js';
import { scoreCompliance } from '../services/appReviewer.js';
import { transpileAppCode } from '../services/appTranspiler.js';
import {
  callProvider,
  resolveProvider,
  resolveApiKey,
  DEFAULT_MODELS as SHARED_DEFAULT_MODELS,
  type ProviderName,
} from '../services/providerCaller.js';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const ThemeSchema = z.object({
  background: z.string(),
  surface: z.string(),
  text: z.string(),
  textSecondary: z.string(),
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  border: z.string(),
});

const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const IterateRequestSchema = z.object({
  currentCode: z.string().min(1),
  editInstruction: z.string().min(1).max(5000),
  provider: z.string().min(1),
  apiKey: z.string().optional().default(''),
  model: z.string().optional(),
  theme: ThemeSchema,
  availableConnectors: z.array(z.string()).optional().default([]),
  conversationHistory: z.array(ConversationMessageSchema).optional().default([]),
});

type IterateRequest = z.infer<typeof IterateRequestSchema>;

// ---------------------------------------------------------------------------
// NDJSON helper
// ---------------------------------------------------------------------------

function writeChunk(res: Response, chunk: Record<string, unknown>): void {
  res.write(JSON.stringify(chunk) + '\n');
}

// ---------------------------------------------------------------------------
// LLM call with retry
// ---------------------------------------------------------------------------

async function callWithRetry<T>(
  provider: ProviderName,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  parser: (raw: string) => T | null,
  agentName: string
): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt =
      attempt === 1
        ? userMessage
        : userMessage +
          '\n\nYour previous response was not valid JSON. Return ONLY valid JSON matching the output format.';

    logSection(
      `LLM CALL: ${agentName} (attempt ${attempt})`,
      `Model: ${model}\nPrompt length: ${prompt.length} chars`
    );

    const callResult = await callProvider(provider, apiKey, model, prompt, {
      systemPrompt,
      maxTokens: 16384,
      timeoutMs: 120000,
    });
    const rawText = callResult.text;

    if (callResult.usage) {
      logger.info('iterate_app_llm_usage', {
        agent: agentName,
        attempt,
        inputTokens: callResult.usage.inputTokens,
        outputTokens: callResult.usage.outputTokens,
        totalTokens: callResult.usage.inputTokens + callResult.usage.outputTokens,
      });
    }

    logRaw(`RAW LLM RESPONSE: ${agentName} (attempt ${attempt}, ${rawText.length} chars)`, rawText);

    const result = parser(rawText);

    if (result) {
      logSummary(`PARSE SUCCESS: ${agentName}`, {
        attempt,
        resultKeys: Object.keys(result as Record<string, unknown>),
      });
      return result;
    }

    logSection(
      `PARSE FAILED: ${agentName} (attempt ${attempt})`,
      `Raw text length: ${rawText.length}\nCould not extract valid result from LLM response.`
    );

    logger.warn('iterate_app_agent_parse_failed', {
      agent: agentName,
      attempt,
      rawTextLength: rawText.length,
    });
  }

  throw new Error(`${agentName} did not return valid JSON after 2 attempts`);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

router.post('/', async (req: Request<object, unknown, unknown>, res: Response): Promise<void> => {
  try {
    const parsed = IterateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      res.status(400).json({ ok: false, error: `invalid_request: ${errorMessage}` });
      return;
    }

    const body: IterateRequest = parsed.data;
    const provider = resolveProvider(body.provider);
    if (!provider) {
      res.status(400).json({ ok: false, error: `unsupported_provider: ${body.provider}` });
      return;
    }

    const apiKey = resolveApiKey(provider, body.apiKey, req as Request);
    if (!apiKey) {
      res
        .status(400)
        .json({ ok: false, error: 'No API key available for this provider. Check Settings.' });
      return;
    }

    logger.info('iterate_app_request', {
      provider,
      instructionLength: body.editInstruction.length,
      codeLength: body.currentCode.length,
      connectors: body.availableConnectors.length,
    });

    startSession(`iterate — "${body.editInstruction.slice(0, 80)}"`);
    logSummary('REQUEST', {
      provider,
      model: body.model || SHARED_DEFAULT_MODELS[provider],
      instructionLength: body.editInstruction.length,
      currentCodeLength: body.currentCode.length,
      connectors: body.availableConnectors.join(', ') || 'none',
      historyMessages: body.conversationHistory.length,
    });

    // Set NDJSON streaming headers
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const model = body.model || SHARED_DEFAULT_MODELS[provider];
    const history: readonly ConversationMessage[] = body.conversationHistory;
    const hasHistory = history.length > 0;

    try {
      // Assembler call
      writeChunk(res, { type: 'status', step: 'assembling' });

      let generationResult: GenerationResult;
      try {
        const assemblerSystemPrompt = buildAssemblerPrompt(body.theme);
        const assemblerUserMsg = hasHistory
          ? buildIterationAssemblerUserMessageWithHistory(
              body.currentCode,
              body.editInstruction,
              history
            )
          : buildIterationAssemblerUserMessage(body.currentCode, body.editInstruction);

        logRaw('SYSTEM PROMPT (sent to LLM)', assemblerSystemPrompt);
        logRaw('USER MESSAGE (sent to LLM)', assemblerUserMsg);

        generationResult = await callWithRetry(
          provider,
          apiKey,
          model,
          assemblerSystemPrompt,
          assemblerUserMsg,
          parseGenerationResponse,
          'Assembler'
        );
      } catch (err) {
        const asmMsg = err instanceof Error ? err.message : String(err);
        logger.error('iterate_app_assembler_failed', { error: asmMsg });
        logDebugError('ASSEMBLER FAILED', err);
        logResult(false, 'Assembler failed: ' + asmMsg);
        writeChunk(res, { type: 'error', message: `Edit failed: ${asmMsg}` });
        writeChunk(res, { type: 'done' });
        res.end();
        return;
      }

      logSummary('PARSED GENERATION RESULT', {
        name: generationResult.name,
        description: generationResult.description,
        htmlLength: generationResult.html.length,
        permissions: generationResult.permissions,
        window: generationResult.window,
      });
      logRaw('GENERATED HTML', generationResult.html);

      // Quality Gate (scored)
      writeChunk(res, { type: 'status', step: 'reviewing' });
      let compliance = scoreCompliance(generationResult.html);

      logSummary('COMPLIANCE SCORE', {
        score: compliance.score,
        pass: compliance.pass,
        breakdown: compliance.breakdown,
      });
      if (compliance.errors.length > 0) {
        logSection(
          'COMPLIANCE ERRORS',
          compliance.errors
            .map(function (e, i) {
              return i + 1 + '. ' + e;
            })
            .join('\n')
        );
      }
      if (compliance.warnings.length > 0) {
        logSection(
          'COMPLIANCE WARNINGS',
          compliance.warnings
            .map(function (w, i) {
              return i + 1 + '. ' + w;
            })
            .join('\n')
        );
      }

      if (compliance.warnings.length > 0) {
        logger.info('iterate_app_review_warnings', { warnings: compliance.warnings });
      }

      // One repair attempt on failure
      if (!compliance.pass) {
        logger.warn('iterate_app_review_failed', {
          score: compliance.score,
          errors: compliance.errors,
        });
        logSection(
          'REPAIR ATTEMPT',
          'Quality gate failed (score ' + compliance.score + '/100). Attempting repair...'
        );
        writeChunk(res, { type: 'status', step: 'refining' });

        try {
          const allIssues = [...compliance.errors, ...compliance.warnings];
          const repairMsg =
            buildIterationAssemblerUserMessage(body.currentCode, body.editInstruction) +
            '\n\nIMPORTANT — Your previous output had these errors. Fix them:\n' +
            allIssues
              .map(function (e) {
                return '- ' + e;
              })
              .join('\n');

          logRaw('REPAIR MESSAGE (sent to LLM)', repairMsg);

          generationResult = await callWithRetry(
            provider,
            apiKey,
            model,
            buildAssemblerPrompt(body.theme),
            repairMsg,
            parseGenerationResponse,
            'Assembler (repair)'
          );

          // Re-validate repaired output
          compliance = scoreCompliance(generationResult.html);

          logSummary('REPAIR COMPLIANCE', {
            score: compliance.score,
            pass: compliance.pass,
          });

          if (!compliance.pass) {
            logger.warn('iterate_app_repair_still_failing', {
              score: compliance.score,
              errors: compliance.errors,
            });
            logSection('REPAIR STILL FAILING', compliance.errors.join('\n'));
          }
        } catch (err) {
          const repairErr = err instanceof Error ? err.message : String(err);
          logger.warn('iterate_app_repair_failed', { error: repairErr });
          logDebugError('REPAIR FAILED', err);
          // Continue with pre-repair result
        }
      }

      // Transpile inline scripts through esbuild es2016
      const transpiledHtml = await transpileAppCode(generationResult.html);
      logSummary('TRANSPILE', {
        inputLength: generationResult.html.length,
        outputLength: transpiledHtml.length,
        changed: transpiledHtml !== generationResult.html,
      });

      // Stream result
      if (generationResult.explanation) {
        writeChunk(res, { type: 'delta', content: generationResult.explanation });
      }

      const appId = crypto.randomUUID();
      writeChunk(res, {
        type: 'app_generated',
        definition: {
          id: appId,
          name: generationResult.name,
          type: 'html',
          html: transpiledHtml,
          description: generationResult.description,
          permissions: generationResult.permissions,
          source: 'generated',
          window: generationResult.window,
        },
      });

      logResult(
        compliance.pass,
        [
          'App: ' + generationResult.name,
          'Score: ' + compliance.score + '/100 (' + (compliance.pass ? 'PASS' : 'FAIL') + ')',
          'HTML size: ' + transpiledHtml.length + ' chars',
        ].join('\n')
      );

      writeChunk(res, { type: 'done' });
    } catch (err) {
      const pipelineMsg = err instanceof Error ? err.message : String(err);
      logger.error('iterate_app_pipeline_error', { error: pipelineMsg });
      logDebugError('PIPELINE ERROR', err);
      logResult(false, 'Pipeline error: ' + pipelineMsg);
      writeChunk(res, { type: 'error', message: `Edit failed: ${pipelineMsg}` });
      writeChunk(res, { type: 'done' });
    }

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('iterate_app_error', { error: message });

    if (res.headersSent) {
      writeChunk(res, { type: 'error', message: 'Internal error during iteration' });
      writeChunk(res, { type: 'done' });
      res.end();
    } else {
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }
});

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
