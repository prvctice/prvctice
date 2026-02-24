/**
 * App generation route -- compiled template pipeline for generating widgets.
 *
 * POST /api/v1/generate-app
 *   - Deterministic archetype selection (keyword matching)
 *   - Single LLM call: slot filler fills template slots + writes JS
 *   - Deterministic template assembly (server owns HTML structure)
 *   - Compliance-scored quality gate with 1 repair attempt
 *   - Streams NDJSON: status steps + delta (explanation) + app_generated + done
 *
 * Max LLM calls: 5 (1 gen + 1 parse retry + 2 repairs with error feedback). Expected: 1.
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
import { selectArchetype } from '../services/archetypeSelector.js';
import { getTemplate } from '../templates/index.js';
import { assembleWidget } from '../services/templateAssembler.js';
import {
  buildSlotFillerPrompt,
  buildSlotFillerUserMessage,
  parseSlotFillResponse,
} from '../services/appGenerator.js';
import { scoreCompliance } from '../services/appReviewer.js';
import { transpileAppCode } from '../services/appTranspiler.js';
import {
  callProvider,
  resolveProvider as resolveProviderShared,
  resolveApiKey as resolveApiKeyShared,
  DEFAULT_MODELS as DEFAULT_MODELS_SHARED,
  type ProviderName as ProviderNameShared,
  type LlmCallResult,
  type LlmUsage,
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

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  provider: z.string().min(1),
  apiKey: z.string().optional().default(''),
  model: z.string().optional(),
  trialActive: z.boolean().optional().default(false),
  theme: ThemeSchema,
  existingAppNames: z.array(z.string()).optional().default([]),
  availableConnectors: z.array(z.string()).optional().default([]),
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility (iterate-app.ts imports these)
// ---------------------------------------------------------------------------

export type ProviderName = ProviderNameShared;
export { LlmCallResult, LlmUsage };
export const resolveProvider = resolveProviderShared;
export const resolveApiKey = resolveApiKeyShared;
export const DEFAULT_MODELS = DEFAULT_MODELS_SHARED;

/**
 * Compatibility shim for callWithRetry which expects a 4-arg provider function.
 * Maps (apiKey, model, system, user) => callProvider(provider, apiKey, model, user, { systemPrompt, ... }).
 */
export function makeProviderCallFn(
  provider: ProviderName,
  options: { maxTokens?: number; timeoutMs?: number } = {}
): (apiKey: string, model: string, system: string, user: string) => Promise<LlmCallResult> {
  return (apiKey: string, model: string, system: string, user: string) =>
    callProvider(provider, apiKey, model, user, {
      systemPrompt: system,
      maxTokens: options.maxTokens ?? 16384,
      timeoutMs: options.timeoutMs ?? 120000,
    });
}

/**
 * @deprecated Use makeProviderCallFn() instead. Kept for iterate-app.ts compatibility.
 */
export const providerCallMap: Record<
  ProviderName,
  (apiKey: string, model: string, system: string, user: string) => Promise<LlmCallResult>
> = {
  anthropic: makeProviderCallFn('anthropic'),
  gemini: makeProviderCallFn('gemini'),
  openrouter: makeProviderCallFn('openrouter'),
  lmstudio: makeProviderCallFn('lmstudio'),
};

// ---------------------------------------------------------------------------
// NDJSON helper
// ---------------------------------------------------------------------------

function writeChunk(res: Response, chunk: Record<string, unknown>): void {
  res.write(JSON.stringify(chunk) + '\n');
}

// ---------------------------------------------------------------------------
// LLM call with retry on parse failure
// ---------------------------------------------------------------------------

async function callWithRetry<T>(
  callProvider: (
    apiKey: string,
    model: string,
    system: string,
    user: string
  ) => Promise<LlmCallResult>,
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

    const callResult = await callProvider(apiKey, model, systemPrompt, prompt);
    const rawText = callResult.text;

    if (callResult.usage) {
      logger.info('generate_app_llm_usage', {
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

    logger.warn('generate_app_agent_parse_failed', {
      agent: agentName,
      attempt,
      rawTextLength: rawText.length,
      rawTextStart: rawText.slice(0, 300),
    });
  }

  throw new Error(`${agentName} did not return valid JSON after 2 attempts`);
}

// ---------------------------------------------------------------------------
// Compiled template pipeline
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  readonly userPrompt: string;
  readonly provider: ProviderName;
  readonly model: string;
  readonly apiKey: string;
  readonly theme: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    primary: string;
    secondary: string;
    accent: string;
    border: string;
  };
  readonly connectors: readonly string[];
  readonly existingNames: readonly string[];
}

export async function generateAndStream(res: Response, options: GenerateOptions): Promise<void> {
  const { userPrompt, provider, model, apiKey, theme, connectors, existingNames } = options;
  const callProviderFn = makeProviderCallFn(provider);

  startSession(`generate — "${userPrompt.slice(0, 80)}"`);
  logSummary('REQUEST', {
    provider,
    model,
    promptLength: userPrompt.length,
    connectors: connectors.join(', ') || 'none',
    existingNames: existingNames.join(', ') || 'none',
    theme: JSON.stringify(theme),
  });

  try {
    // Step 1: Deterministic archetype selection (instant)
    writeChunk(res, { type: 'status', step: 'generating' });

    const archetype = selectArchetype(userPrompt);
    const template = getTemplate(archetype);

    if (!template) {
      logDebugError('ARCHETYPE SELECTION', `Unknown archetype: ${archetype}`);
      writeChunk(res, { type: 'error', message: `Unknown archetype: ${archetype}` });
      writeChunk(res, { type: 'done' });
      return;
    }

    logSummary('STEP 1: ARCHETYPE SELECTION', {
      archetype,
      templateSlots: template.slots
        .map(function (s) {
          return s.name;
        })
        .join(', '),
      sizePreset: template.sizePreset,
      skeletonLength: template.skeleton.length,
    });

    logger.info('generate_app_archetype', { archetype, prompt: userPrompt.slice(0, 100) });

    // Step 2: Single LLM call — slot filler
    const systemPrompt = buildSlotFillerPrompt(archetype, theme, connectors, userPrompt);
    const userMsg = buildSlotFillerUserMessage(userPrompt, existingNames);

    logRaw('STEP 2: SYSTEM PROMPT (sent to LLM)', systemPrompt);
    logRaw('STEP 2: USER MESSAGE (sent to LLM)', userMsg);

    let slotFill;
    try {
      slotFill = await callWithRetry(
        callProviderFn,
        apiKey,
        model,
        systemPrompt,
        userMsg,
        parseSlotFillResponse,
        'Slot Filler'
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('generate_app_slot_filler_failed', { error: errMsg });
      logDebugError('SLOT FILLER FAILED', err);
      logResult(false, 'Slot filler failed: ' + errMsg);
      writeChunk(res, { type: 'error', message: `Generation failed: ${errMsg}` });
      writeChunk(res, { type: 'done' });
      return;
    }

    logSummary('STEP 2: PARSED SLOT FILL', {
      name: slotFill.name,
      description: slotFill.description,
      slotKeys: Object.keys(slotFill.slots).join(', '),
      scriptLength: slotFill.script.length,
      styleLength: slotFill.style.length,
      permissions: slotFill.permissions,
      window: slotFill.window,
    });
    logRaw('STEP 2: SLOT VALUES', JSON.stringify(slotFill.slots, null, 2));
    logRaw('STEP 2: SCRIPT CONTENT', slotFill.script);
    if (slotFill.style) {
      logRaw('STEP 2: STYLE CONTENT', slotFill.style);
    }

    // Step 3: Deterministic template assembly (instant)
    writeChunk(res, { type: 'status', step: 'assembling' });

    const assembled = assembleWidget({
      template,
      slots: slotFill.slots,
      script: slotFill.script,
      style: slotFill.style,
    });

    logRaw('STEP 3: ASSEMBLED HTML (' + assembled.html.length + ' chars)', assembled.html);

    // Use LLM-provided window size if given, otherwise template preset
    const windowSize = slotFill.window
      ? {
          width: Math.max(200, Math.min(800, Math.round(slotFill.window.width))),
          height: Math.max(150, Math.min(600, Math.round(slotFill.window.height))),
        }
      : assembled.window;

    // Step 4: Quality gate
    writeChunk(res, { type: 'status', step: 'reviewing' });
    let compliance = scoreCompliance(assembled.html, archetype);
    let finalHtml = assembled.html;

    logSummary('STEP 4: COMPLIANCE SCORE', {
      score: compliance.score,
      pass: compliance.pass,
      threshold: 80,
      breakdown: compliance.breakdown,
    });
    if (compliance.errors.length > 0) {
      logSection(
        'STEP 4: COMPLIANCE ERRORS',
        compliance.errors
          .map(function (e, i) {
            return i + 1 + '. ' + e;
          })
          .join('\n')
      );
    }
    if (compliance.warnings.length > 0) {
      logSection(
        'STEP 4: COMPLIANCE WARNINGS',
        compliance.warnings
          .map(function (w, i) {
            return i + 1 + '. ' + w;
          })
          .join('\n')
      );
    }

    logger.info('generate_app_compliance_score', {
      score: compliance.score,
      pass: compliance.pass,
      errors: compliance.errors.length,
      warnings: compliance.warnings.length,
      breakdown: compliance.breakdown,
    });

    // Step 5: Up to 2 repair attempts if quality gate fails
    const MAX_REPAIRS = 2;
    for (let repairAttempt = 1; repairAttempt <= MAX_REPAIRS && !compliance.pass; repairAttempt++) {
      logSection(
        `STEP 5: REPAIR ATTEMPT ${repairAttempt}/${MAX_REPAIRS}`,
        'Quality gate failed (score ' + compliance.score + '/100). Attempting repair...'
      );

      writeChunk(res, { type: 'status', step: 'refining' });

      const allIssues = [...compliance.errors, ...compliance.warnings];
      const repairMsg =
        userMsg +
        '\n\nIMPORTANT — Your previous output had these errors (attempt ' +
        repairAttempt +
        '). Fix ALL of them:\n' +
        allIssues
          .map(function (e) {
            return '- ' + e;
          })
          .join('\n');

      logRaw(`STEP 5: REPAIR MESSAGE (attempt ${repairAttempt})`, repairMsg);

      try {
        const repaired = await callWithRetry(
          callProviderFn,
          apiKey,
          model,
          systemPrompt,
          repairMsg,
          parseSlotFillResponse,
          `Slot Filler (repair ${repairAttempt})`
        );

        const repairedAssembly = assembleWidget({
          template,
          slots: repaired.slots,
          script: repaired.script,
          style: repaired.style,
        });

        const repairedCompliance = scoreCompliance(repairedAssembly.html, archetype);

        logSummary(`STEP 5: REPAIR ${repairAttempt} COMPLIANCE`, {
          score: repairedCompliance.score,
          pass: repairedCompliance.pass,
          improved: repairedCompliance.score > compliance.score,
          originalScore: compliance.score,
        });
        if (repairedCompliance.errors.length > 0) {
          logSection(
            `STEP 5: REPAIR ${repairAttempt} ERRORS`,
            repairedCompliance.errors.join('\n')
          );
        }

        if (repairedCompliance.score > compliance.score) {
          finalHtml = repairedAssembly.html;
          compliance = repairedCompliance;
          // Update slotFill metadata for the repaired version
          Object.assign(slotFill, {
            name: repaired.name,
            description: repaired.description,
            permissions: repaired.permissions,
            explanation: repaired.explanation,
          });
          logSection(
            `STEP 5: USING REPAIR ${repairAttempt}`,
            'Repair improved score to ' + repairedCompliance.score
          );
        } else {
          logSection(
            `STEP 5: REPAIR ${repairAttempt} NO IMPROVEMENT`,
            'Score ' + repairedCompliance.score + ' vs best ' + compliance.score
          );
        }

        logger.info('generate_app_repair_result', {
          attempt: repairAttempt,
          score: repairedCompliance.score,
          pass: repairedCompliance.pass,
          improved: repairedCompliance.score > compliance.score,
        });
      } catch (err) {
        const repairErr = err instanceof Error ? err.message : String(err);
        logger.warn('generate_app_repair_failed', { attempt: repairAttempt, error: repairErr });
        logDebugError(`STEP 5: REPAIR ${repairAttempt} FAILED`, err);
        break; // Stop repair loop on LLM failure
      }
    }

    if (compliance.pass) {
      logSection('STEP 5: QUALITY GATE', 'PASSED (score ' + compliance.score + '/100)');
    } else {
      logSection(
        'STEP 5: QUALITY GATE',
        'FAILED after ' + MAX_REPAIRS + ' repair attempts (best score ' + compliance.score + '/100)'
      );
    }

    if (compliance.warnings.length > 0) {
      logger.info('generate_app_compliance_warnings', { warnings: compliance.warnings });
    }
    if (!compliance.pass) {
      logger.warn('generate_app_below_threshold', {
        bestScore: compliance.score,
      });
    }

    // Step 6: Transpile
    const transpiledHtml = await transpileAppCode(finalHtml);
    const transpileChanged = transpiledHtml !== finalHtml;
    logSummary('STEP 6: TRANSPILE', {
      inputLength: finalHtml.length,
      outputLength: transpiledHtml.length,
      changed: transpileChanged,
    });
    if (transpileChanged) {
      logRaw('STEP 6: TRANSPILED HTML', transpiledHtml);
    }

    // Stream explanation
    if (slotFill.explanation) {
      writeChunk(res, { type: 'delta', content: slotFill.explanation });
    }

    // Stream the full app definition
    const appId = crypto.randomUUID();
    writeChunk(res, {
      type: 'app_generated',
      definition: {
        id: appId,
        name: slotFill.name,
        type: 'html',
        html: transpiledHtml,
        description: slotFill.description,
        permissions: slotFill.permissions,
        source: 'generated',
        window: windowSize,
      },
    });

    logResult(
      compliance.pass,
      [
        'App: ' + slotFill.name,
        'ID: ' + appId,
        'Score: ' + compliance.score + '/100 (' + (compliance.pass ? 'PASS' : 'FAIL') + ')',
        'Window: ' + windowSize.width + 'x' + windowSize.height,
        'HTML size: ' + transpiledHtml.length + ' chars',
        'Errors: ' + compliance.errors.length,
        'Warnings: ' + compliance.warnings.length,
      ].join('\n')
    );

    writeChunk(res, { type: 'done' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('generate_app_pipeline_error', { error: message });
    logDebugError('PIPELINE ERROR', err);
    logResult(false, 'Pipeline error: ' + message);
    writeChunk(res, { type: 'error', message: `Generation failed: ${message}` });
    writeChunk(res, { type: 'done' });
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

router.post('/', async (req: Request<object, unknown, unknown>, res: Response): Promise<void> => {
  try {
    const parsed = GenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      res.status(400).json({ ok: false, error: `invalid_request: ${errorMessage}` });
      return;
    }

    const body: GenerateRequest = parsed.data;
    const provider = resolveProvider(body.provider);
    if (!provider) {
      res.status(400).json({ ok: false, error: `unsupported_provider: ${body.provider}` });
      return;
    }

    const apiKey = resolveApiKey(provider, body.apiKey, req as Request, body.trialActive);
    if (!apiKey) {
      res
        .status(400)
        .json({ ok: false, error: 'No API key available for this provider. Check Settings.' });
      return;
    }

    logger.info('generate_app_request', {
      provider,
      promptLength: body.prompt.length,
      existingApps: body.existingAppNames.length,
      connectors: body.availableConnectors.length,
    });

    // Set NDJSON streaming headers
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const model = body.model || DEFAULT_MODELS[provider];

    await generateAndStream(res, {
      userPrompt: body.prompt,
      provider,
      model,
      apiKey,
      theme: body.theme,
      connectors: body.availableConnectors,
      existingNames: body.existingAppNames,
    });

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('generate_app_error', { error: message });

    if (res.headersSent) {
      writeChunk(res, { type: 'error', message: 'Internal error during generation' });
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
module.exports.generateAndStream = generateAndStream;
module.exports.providerCallMap = providerCallMap;
module.exports.resolveProvider = resolveProvider;
module.exports.resolveApiKey = resolveApiKey;
