// A tiny, deterministic request router to decide which pipeline/modal to use.
// Keeps the logic centralized and testable.

import type { ChatMessage } from '../../types/chat.js';
import { loadDefaults } from '../config/defaults.js';

export type TaskType = 'chat_text' | 'chat_vision' | 'app_generate';
export type UIModal = 'text';

export interface Attachment {
  mimeType?: string;
  path?: string;
  kind?: string;
}

export interface ImageData {
  mimeType?: string;
  data?: unknown;
  path?: string;
}

export interface RouteDecision {
  task: TaskType;
  uiModal: UIModal;
  reason: string;
  provider?: string;
  model?: string;
  warnings?: string[];
}

export type ExplicitMode = 'auto' | TaskType | 'image_generate' | 'image_edit';

export interface RouteInput {
  provider?: string;
  model?: string;
  messages?: ChatMessage[];
  text?: string;
  attachments?: Attachment[];
  images?: ImageData[];
  explicitMode?: ExplicitMode;
  apiKeys?: Record<string, string>;
}

interface FinaliseContext {
  providerSuggestion?: string;
  hasImages: boolean;
  warnings: string[];
}

/**
 * Decide how to handle a user request.
 *
 * Inputs are intentionally flexible so both client and server can call it.
 */
export function routeRequest(input: RouteInput = {}): RouteDecision {
  const warnings: string[] = [];
  const provider = String(input.provider || '').toLowerCase();

  const hasImages = ((): boolean => {
    const imgs = Array.isArray(input.images) ? input.images : [];
    const atts = Array.isArray(input.attachments) ? input.attachments : [];
    const anyImageAtt = atts.some(
      (a) => typeof a?.mimeType === 'string' && a.mimeType.toLowerCase().startsWith('image/')
    );
    const anyImg = imgs.length > 0 || anyImageAtt;
    return Boolean(anyImg);
  })();

  // User override wins
  const mode = input.explicitMode && input.explicitMode !== 'auto' ? input.explicitMode : null;
  if (mode) {
    // Map any legacy image modes to chat
    const effectiveMode: TaskType =
      mode === 'image_generate' || mode === 'image_edit'
        ? hasImages
          ? 'chat_vision'
          : 'chat_text'
        : (mode as TaskType);
    return finalise(effectiveMode, {
      providerSuggestion: provider,
      hasImages,
      warnings,
    });
  }

  // Simple routing: if images present -> chat_vision, else chat_text
  const task: TaskType = hasImages ? 'chat_vision' : 'chat_text';

  return finalise(task, {
    providerSuggestion: provider,
    hasImages,
    warnings,
  });
}

function finalise(task: TaskType, ctx: FinaliseContext): RouteDecision {
  const out: RouteDecision = {
    task,
    uiModal: 'text',
    reason: reasonFor(task, { hasImages: ctx.hasImages }),
    provider: ctx.providerSuggestion,
  };

  if (ctx.warnings.length) out.warnings = ctx.warnings;

  // Suggest default models
  if (out.task === 'chat_vision') {
    out.model = loadDefaults().models.gemini;
  }

  return out;
}

function reasonFor(task: TaskType, { hasImages }: { hasImages: boolean }): string {
  switch (task) {
    case 'chat_vision':
      return hasImages ? 'Images attached; treating as vision chat' : 'Vision chat';
    case 'chat_text':
    default:
      return 'Default text chat';
  }
}

export default { routeRequest };
