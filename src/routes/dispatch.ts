import { Router, Request, Response } from 'express';
import { routeRequest, type RouteInput } from '../services/requestRouter.js';
import { classifyIntent } from '../services/intentClassifier.js';
import { type SessionWithKeys } from '../utils/sessionKeys.js';
import logger from '../utils/logger.js';
import { getCapabilities } from '../utils/capabilities.js';
import * as crypto from 'crypto';

// Nouns that signal an interactive app/widget (shared by heuristic + classifier gate)
const APP_NOUNS =
  /\b(app|application|widget|tool|dashboard|calculator|timer|clock|counter|game|tracker|converter|chart|calendar|planner|stopwatch|countdown|todo|checklist|notepad|pomodoro|sampler|mpc|drum\s*pad|drum\s*machine|keyboard|synthesizer|synth|sequencer|player|recorder|editor|viewer|monitor|meter|mixer|browser|explorer|organizer|manager|picker|generator|visualizer|display|controller|remote|launcher)\b/;

/**
 * Keyword heuristic for detecting app generation intent.
 * Returns a reason string if matched, null otherwise.
 * Patterns: "build/create/make [me] a/an <app-like noun>"
 */
function detectAppGenerateIntent(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Action verbs that signal creation intent
  const verbs = /\b(build|create|make|generate|design|code)\b/;
  const nouns = APP_NOUNS;

  if (verbs.test(lower) && nouns.test(lower)) {
    return 'keyword match: creation verb + app noun';
  }

  // "I want/need a <noun>" or "can you build/make me a <noun>" pattern
  const wantPattern =
    /\b(i\s+(?:want|need)|give\s+me|show\s+me|can\s+you\s+(?:build|create|make|generate))\b/;
  if (wantPattern.test(lower) && nouns.test(lower)) {
    return 'keyword match: request pattern + app noun';
  }

  return null;
}

/**
 * Detect when a creation verb is clearly targeting textual content, not an app.
 * "make a list", "create a summary", "build an argument" → chat, not app.
 * Returns a reason string if matched, null otherwise.
 */
function detectChatTextOverride(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Pattern: creation verb + optional "me" + article + TEXTUAL content noun
  const match = lower.match(
    /\b(?:build|create|make|generate|design|write|draft|compose|give\s+me|show\s+me)\b\s+(?:me\s+)?(?:a|an|the|some|my)?\s*\b(list|summary|plan|comparison|outline|essay|poem|story|report|analysis|review|answer|explanation|recommendation|description|table|breakdown|overview|paragraph|email|letter|guide|tutorial|article|note|notes|ranking|rankings|schedule|recipe|menu|itinerary|playlist|timeline|roadmap|pitch|presentation|speech|joke|song|lyric|lyrics|haiku|quote|bio|biography|resume|cv|profile|bullet\s*points?)\b/
  );

  if (match) {
    return `chat override: creation verb + textual noun "${match[1]}"`;
  }

  return null;
}

const router = Router();

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    openaiApiKey?: string;
    anthropicApiKey?: string;
    googleApiKey?: string;
    geminiApiKey?: string;
    openrouterApiKey?: string;
    lastDecisionTask?: string;
  }
}

interface DispatchBody {
  prompt?: string;
  text?: string;
  messages?: Array<{ role: string; content: string }>;
  images?: Array<{ data?: string; [key: string]: unknown }>;
  attachments?: Array<{ mimeType?: string; [key: string]: unknown }>;
  provider?: string;
  trialActive?: boolean;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  googleApiKey?: string;
  openrouterApiKey?: string;
  user_overrides?: unknown;
  explicitMode?: unknown;
  operation_id?: string;
  stream?: boolean | string;
  planOnly?: boolean;
  nudge_accept?: boolean;
  [key: string]: unknown;
}

interface Nudge {
  type: string;
  message: string;
  suggested_provider: string;
}

interface Decision {
  task: string;
  uiModal: string;
  reason: string;
  provider?: string;
}

interface DispatchResponse {
  ok: boolean;
  schema_version?: string;
  request_id?: string;
  operation_id?: string;
  decision?: Decision;
  nudge?: Nudge;
  error?: string;
  code?: string;
}

function lastUserText(body: DispatchBody = {}): string {
  if (typeof body.prompt === 'string' && body.prompt.trim()) return body.prompt.trim();
  if (typeof body.text === 'string' && body.text.trim()) return body.text.trim();
  if (Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i];
      if (m && m.role === 'user' && typeof m.content === 'string') return m.content.trim();
    }
  }
  return '';
}

// Check if input has valid image attachments
function hasImages(input: DispatchBody): boolean {
  const imgs = Array.isArray(input.images) ? input.images : [];
  const atts = Array.isArray(input.attachments) ? input.attachments : [];

  // Check for valid images in images array (must have data property with content)
  const validImages = imgs.filter(
    (img) => img && typeof img === 'object' && typeof img.data === 'string' && img.data.length > 0
  );

  // Check attachments for image types
  const anyImageAtt = atts.some(
    (a) => typeof a?.mimeType === 'string' && a.mimeType.toLowerCase().startsWith('image/')
  );

  return validImages.length > 0 || anyImageAtt;
}

router.post(
  '/',
  async (
    req: Request<object, DispatchResponse, DispatchBody>,
    res: Response<DispatchResponse>
  ): Promise<void> => {
    try {
      const input = req.body || {};
      const trialActive = input.trialActive === true;

      // Helper to normalize key values
      const normalizeKey = (val: unknown): string | null =>
        typeof val === 'string' && val.trim() ? val.trim() : null;

      // Read all provider keys from body
      const openaiKeyFromBody = normalizeKey(input.openaiApiKey);
      const anthropicKeyFromBody = normalizeKey(input.anthropicApiKey);
      const geminiKeyFromBody =
        normalizeKey(input.geminiApiKey) || normalizeKey(input.googleApiKey);
      const openrouterKeyFromBody = normalizeKey(input.openrouterApiKey);

      if (process.env.DEBUG_CLASSIFIER) {
        logger.debug('dispatch_keys_from_body', {
          hasOpenai: !!openaiKeyFromBody,
          hasAnthropic: !!anthropicKeyFromBody,
          hasGemini: !!geminiKeyFromBody,
          hasOpenrouter: !!openrouterKeyFromBody,
        });
      }

      // Store keys in session if provided
      if (req.session) {
        if (openaiKeyFromBody) req.session.openaiApiKey = openaiKeyFromBody;
        if (anthropicKeyFromBody) req.session.anthropicApiKey = anthropicKeyFromBody;
        if (geminiKeyFromBody) req.session.googleApiKey = geminiKeyFromBody;
        if (openrouterKeyFromBody) req.session.openrouterApiKey = openrouterKeyFromBody;
      }

      // Get keys from session as fallback
      const sessionOpenAIKey = normalizeKey(req.session?.openaiApiKey);
      const sessionAnthropicKey = normalizeKey(req.session?.anthropicApiKey);
      const sessionGeminiKey =
        normalizeKey(req.session?.googleApiKey) || normalizeKey(req.session?.geminiApiKey);
      const sessionOpenrouterKey = normalizeKey(req.session?.openrouterApiKey);
      const REQUEST_ID = crypto.randomUUID();
      const OPERATION_ID = String(input.operation_id || req.get?.('X-Operation-Id') || REQUEST_ID);
      const IDEMPOTENCY_KEY = req.get?.('Idempotency-Key') || req.headers['idempotency-key'] || '';
      res.setHeader('X-Request-Id', REQUEST_ID);
      res.setHeader('X-Operation-Id', OPERATION_ID);
      res.setHeader('X-Schema-Version', 'v2');

      const inputHasImages = hasImages(input);

      // Debug: log image detection
      const imgs = Array.isArray(input.images) ? input.images : [];
      const validImageCount = imgs.filter(
        (img) =>
          img && typeof img === 'object' && typeof img.data === 'string' && img.data.length > 0
      ).length;
      if (process.env.DEBUG_CLASSIFIER || process.env.DEBUG_ROUTER) {
        logger.debug('dispatch_image_detection', {
          inputHasImages,
          imagesArrayLength: imgs.length,
          validImageCount,
          attachmentsArrayLength: Array.isArray(input.attachments) ? input.attachments.length : 0,
          hasImagesKey: 'images' in input,
          hasAttachmentsKey: 'attachments' in input,
          firstImageDataLength: imgs[0]?.data?.length || 0,
        });
      }

      // Feature flags
      const MODEL_FIRST = (process.env.MODEL_FIRST_ROUTER ?? 'true') !== 'false';
      const DRY_RUN = (process.env.MODEL_ROUTER_DRY_RUN || 'false') === 'true';

      const prompt = lastUserText(input);
      let decision: Decision;
      let classifierTask: string | null = null;
      let classifierConfidence: string | null = null;
      let classifierError: string | null = null;

      // DETERMINISTIC RULE: Keyword heuristic for app generation.
      // Catches obvious "build me a...", "create an app...", "make a widget..." patterns
      // without needing the LLM classifier. This ensures app_generate works regardless
      // of provider (including LM Studio which has no classifier support).
      const appGenMatch = detectAppGenerateIntent(prompt);

      // DETERMINISTIC RULE: Chat text override for textual content requests.
      // "make a list", "create a summary" etc. use creation verbs but are clearly
      // asking for text, not an app. Prevents LLM classifier from over-triggering.
      const chatOverride = detectChatTextOverride(prompt);

      if (appGenMatch) {
        classifierTask = 'app_generate';
        classifierConfidence = 'high';
        decision = {
          task: 'app_generate',
          uiModal: 'text',
          reason: `Deterministic: ${appGenMatch}`,
          provider: String(input.provider || '').toLowerCase() || undefined,
        };
      } else if (chatOverride) {
        classifierTask = 'chat_text';
        classifierConfidence = 'high';
        decision = {
          task: 'chat_text',
          uiModal: 'text',
          reason: `Deterministic: ${chatOverride}`,
          provider: String(input.provider || '').toLowerCase() || undefined,
        };
      } else if (inputHasImages) {
        classifierTask = 'chat_vision';
        classifierConfidence = 'high';
        decision = {
          task: 'chat_vision',
          uiModal: 'text',
          reason: 'Deterministic: images attached',
          provider: String(input.provider || '').toLowerCase() || undefined,
        };
      } else {
        // No images - use classifier for text-only requests
        let classified:
          | { task?: string | null; confidence?: string; error?: string }
          | string
          | null = null;
        try {
          if (MODEL_FIRST || DRY_RUN) {
            const selectedProvider = String(input.provider || '').toLowerCase();
            const lastTask = (req.session && req.session.lastDecisionTask) || 'none';
            classified = await classifyIntent({
              text: prompt,
              has_images_attached: false,
              recent_image_available: false,
              last_task: lastTask,
              last_asset_kind: 'none',
              provider_selected: selectedProvider,
              user_overrides: input.user_overrides || input.explicitMode || null,
              // Pass all provider keys
              apiKey: openaiKeyFromBody ?? sessionOpenAIKey ?? undefined,
              openaiApiKey: openaiKeyFromBody ?? sessionOpenAIKey ?? undefined,
              anthropicApiKey: anthropicKeyFromBody ?? sessionAnthropicKey ?? undefined,
              geminiApiKey: geminiKeyFromBody ?? sessionGeminiKey ?? undefined,
              googleApiKey: geminiKeyFromBody ?? sessionGeminiKey ?? undefined,
              openrouterApiKey: openrouterKeyFromBody ?? sessionOpenrouterKey ?? undefined,
              session: req.session as unknown as SessionWithKeys,
              trialActive,
            });
          }
        } catch (err) {
          logger.debug('classifier_failed', { error: (err as Error).message });
          classified = null;
        }

        if (classified && typeof classified === 'object') {
          if (classified.task) {
            classifierTask = classified.task;
            classifierConfidence = classified.confidence || null;
          } else if (classified.error) {
            classifierError = classified.error;
          }
        } else if (typeof classified === 'string') {
          classifierTask = classified;
        }

        // Map any image generation/editing tasks to chat_text since no images attached
        if (classifierTask === 'image_generate' || classifierTask === 'image_edit') {
          classifierTask = 'chat_text';
        }

        if (DRY_RUN) {
          // Ignore classifier; use deterministic routing but log both
          const routeInput: RouteInput = {
            provider: input.provider,
            images: input.images as RouteInput['images'],
          };
          const routeDecision = routeRequest(routeInput);
          decision = {
            task: routeDecision.task,
            uiModal: routeDecision.uiModal,
            reason: `Heuristic (dry-run): ${routeDecision.reason}`,
            provider: routeDecision.provider,
          };
        } else if (MODEL_FIRST && classifierTask) {
          // Gate: if classifier says app_generate but prompt has no app-like noun,
          // downgrade to chat_text. Prevents "make me a moodboard" from building an app.
          const gatedTask =
            classifierTask === 'app_generate' && !APP_NOUNS.test(prompt.toLowerCase())
              ? 'chat_text'
              : classifierTask;
          decision = {
            task: gatedTask,
            uiModal: 'text',
            reason:
              gatedTask !== classifierTask
                ? `Classifier gated: ${classifierTask} → ${gatedTask} (no app noun)`
                : `Classifier: ${classifierTask}`,
            provider: String(input.provider || '').toLowerCase() || undefined,
          };
        } else if (!MODEL_FIRST) {
          // MODEL_FIRST disabled - use heuristic routing
          const routeInput: RouteInput = {
            provider: input.provider,
            images: input.images as RouteInput['images'],
          };
          const routeDecision = routeRequest(routeInput);
          decision = {
            task: routeDecision.task,
            uiModal: routeDecision.uiModal,
            reason: `Heuristic: ${routeDecision.reason}`,
            provider: routeDecision.provider,
          };
        } else {
          // Classifier unavailable or errored — fall back to chat_text
          if (classifierError) {
            logger.debug('classifier_error_fallback', { error: classifierError });
          }
          decision = {
            task: 'chat_text',
            uiModal: 'text',
            reason: classifierError
              ? `Fallback: classifier error — ${classifierError}`
              : 'Fallback: no classifier available',
            provider: String(input.provider || '').toLowerCase() || undefined,
          };
        }
      }

      // Force any image tasks to chat_vision since we no longer support generation/editing
      if (decision.task === 'image_generate' || decision.task === 'image_edit') {
        decision.task = inputHasImages ? 'chat_vision' : 'chat_text';
        decision.uiModal = 'text';
      }

      try {
        if (process.env.DEBUG_ROUTER) logger.debug('dispatch_decision', { decision });
      } catch (_) {
        // Ignore logging errors
      }

      // Observability fields
      const asset_origin = inputHasImages ? 'user' : 'none';
      let verify_prompt_shown = false;
      let nudge: Nudge | null = null;
      const promptLC = String(prompt || '').toLowerCase();

      // Verify layer: capability nudge for chat_vision when provider is weak at OCR/small text
      if (decision.task === 'chat_vision') {
        const provider = String(input.provider || decision.provider || '').toLowerCase();
        const cap = getCapabilities(provider);
        const needsOcr =
          /\b(ocr|tiny\s+text|small\s+text)\b/.test(promptLC) ||
          /\bread\b[\s\S]*?\btext\b/.test(promptLC) ||
          inputHasImages;
        const weakOcr = cap.ocr_quality === 'low' || cap.small_text_reading === 'low';
        if (needsOcr && weakOcr) {
          verify_prompt_shown = true;
          nudge = {
            type: 'ocr_provider',
            message: 'Your model may struggle with tiny text. Switch to Google?',
            suggested_provider: 'gemini',
          };
          // If the client asked for non-streaming (JSON) we can return the nudge immediately
          const wantsJson =
            String(input.stream) === 'false' || input.stream === false || !!input.planOnly;
          if (wantsJson) {
            try {
              if (req.session) {
                req.session.lastDecisionTask = decision.task;
              }
            } catch (err) {
              logger.debug('session_update_failed', { error: (err as Error).message });
            }
            logger.info('router', {
              request_id: REQUEST_ID,
              operation_id: OPERATION_ID,
              idempotency_key: (IDEMPOTENCY_KEY as string) || undefined,
              task: decision.task,
              confidence: classifierConfidence || undefined,
              provider: provider || undefined,
              asset_origin,
              verify_prompt_shown: true,
              user_correction: false,
              nudge_accept: Boolean(input.nudge_accept) || undefined,
              dry_run: DRY_RUN || undefined,
              classifier_task: classifierTask || undefined,
            });
            res.json({
              ok: true,
              schema_version: 'v2',
              request_id: REQUEST_ID,
              operation_id: OPERATION_ID,
              decision,
              nudge,
            });
            return;
          }
          // Otherwise, set hint headers for UI to pick up later (non-breaking)
          try {
            res.setHeader('X-Verify-Nudge', 'ocr_provider');
            res.setHeader('X-Verify-Message', nudge.message);
            res.setHeader('X-Verify-Suggested-Provider', 'gemini');
          } catch (_) {
            // Ignore header errors
          }
        }
      }

      // Chat/text/vision → forward to unified chat endpoint preserving method and body.
      try {
        if (req.session) {
          req.session.lastDecisionTask = decision.task;
        }
      } catch (err) {
        logger.debug('session_update_failed', { error: (err as Error).message });
      }
      logger.info('router', {
        request_id: REQUEST_ID,
        operation_id: OPERATION_ID,
        idempotency_key: (IDEMPOTENCY_KEY as string) || undefined,
        task: decision.task,
        confidence: classifierConfidence || undefined,
        provider: String(input.provider || decision.provider || '').toLowerCase() || undefined,
        asset_origin,
        verify_prompt_shown,
        user_correction: false,
        nudge_accept: Boolean(input.nudge_accept) || undefined,
        dry_run: DRY_RUN || undefined,
        classifier_task: classifierTask || undefined,
      });

      // App generation: return JSON decision instead of redirecting.
      // The frontend detects this and calls /api/v1/generate-app directly.
      if (decision.task === 'app_generate') {
        res.json({
          ok: true,
          schema_version: 'v2',
          request_id: REQUEST_ID,
          operation_id: OPERATION_ID,
          decision,
        });
        return;
      }

      res.redirect(307, '/api/v1/chat');
    } catch (err) {
      const msg: string = (err instanceof Error ? err.message : String(err)) || 'dispatch error';
      res.status(400).json({ ok: false, error: msg });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
