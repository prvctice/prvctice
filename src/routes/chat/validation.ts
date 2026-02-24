/**
 * Validation and setup utilities for chat route
 * - API key resolution
 * - Vision model selection
 * - Message preparation
 */

import type { Request, Response } from 'express';
import type { CustomSession, ChatMessage, ContentPart } from './types';
import logger from '../../utils/logger.js';
import { getCapabilities } from '../../utils/capabilities.js';

/** Image data for embedding */
interface ImageData {
  data?: string;
  mimeType?: string;
}

/** Reasoning config */
interface ReasoningConfig {
  effort?: string;
}

/** Free tier fallback result */
interface FreeTierResult {
  key: string | null;
  isFreeTier: boolean;
}

/** LM Studio options */
interface LmStudioOptions {
  baseUrl: string;
}

/**
 * Resolve effective API key for provider
 * Only falls back to env keys if trialActive is true
 */
function resolveApiKey(
  provider: string | undefined,
  req: Request,
  apiKey: string | undefined,
  trialActive: boolean = false
): string | null {
  const provLC = (provider || '').toLowerCase();
  let effectiveKey: string | null = null;
  const session = req.session as CustomSession | undefined;
  const body = req.body as Record<string, unknown>;

  if (provLC === 'anthropic') {
    effectiveKey = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null;
    if (!effectiveKey && trialActive) {
      effectiveKey = process.env.ANTHROPIC_API_KEY || null;
    }
  } else if (provLC === 'gemini' || provLC === 'google') {
    const sessionKey = (session && session.googleApiKey) || '';
    const bodyGoogle =
      typeof body.geminiApiKey === 'string' && (body.geminiApiKey as string).trim()
        ? (body.geminiApiKey as string).trim()
        : '';
    effectiveKey =
      typeof apiKey === 'string' && apiKey.trim()
        ? apiKey.trim()
        : bodyGoogle || sessionKey || null;
    if (!effectiveKey && trialActive) {
      effectiveKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null;
    }
  } else if (provLC === 'openrouter') {
    const bodyOpenRouter =
      typeof body.openrouterApiKey === 'string' && (body.openrouterApiKey as string).trim()
        ? (body.openrouterApiKey as string).trim()
        : '';
    const sessionOpenRouter = (session && session.openrouterApiKey) || '';
    effectiveKey =
      typeof apiKey === 'string' && apiKey.trim()
        ? apiKey.trim()
        : bodyOpenRouter || sessionOpenRouter || null;
    if (!effectiveKey && trialActive) {
      effectiveKey = process.env.OPENROUTER_API_KEY || null;
    }
  } else if (provLC === 'lmstudio') {
    effectiveKey = null;
  }

  return effectiveKey;
}

/**
 * Get LM Studio adapter options
 */
function getLmStudioOptions(req: Request): LmStudioOptions {
  const body = req.body as Record<string, unknown>;
  const session = req.session as CustomSession | undefined;
  const bodyBaseUrl =
    typeof body.lmstudioBaseUrl === 'string' && (body.lmstudioBaseUrl as string).trim()
      ? (body.lmstudioBaseUrl as string).trim()
      : '';
  const sessionBaseUrl = (session && session.lmstudioBaseUrl) || '';
  return {
    baseUrl: bodyBaseUrl || sessionBaseUrl || process.env.LMSTUDIO_URL || 'http://localhost:1234',
  };
}

/**
 * Apply free tier fallback if no key available
 * Only applies if trial is active (trialActive === true)
 * After trial expires, users must provide their own API keys
 */
function applyFreeTierFallback(
  effectiveKey: string | null,
  provider: string | undefined,
  trialActive: boolean = false
): FreeTierResult {
  const provLC = (provider || '').toLowerCase();
  if (provLC === 'lmstudio') {
    return { key: effectiveKey, isFreeTier: false };
  }

  if (!effectiveKey || typeof effectiveKey !== 'string' || effectiveKey.trim() === '') {
    // Only allow free tier fallback if trial is active
    if (!trialActive) {
      logger.info('free_tier_blocked', { provider: provLC, reason: 'trial_not_active' });
      return { key: null, isFreeTier: false };
    }

    const freeTierKey = process.env.FREE_TIER_API_KEY;
    const freeTierProvider = process.env.FREE_TIER_PROVIDER || 'anthropic';

    if (freeTierKey && freeTierProvider.toLowerCase() === provLC) {
      logger.info('using_free_tier', { provider: provLC });
      return { key: freeTierKey, isFreeTier: true };
    } else if (freeTierKey && provLC === 'openrouter') {
      logger.info('using_free_tier_fallback', { provider: provLC });
      return { key: freeTierKey, isFreeTier: true };
    }
  }

  return { key: effectiveKey, isFreeTier: false };
}

/**
 * Override model for vision if needed
 */
function overrideModelForVision(
  model: string | undefined,
  providerKey: string,
  hasImages: boolean,
  res: Response
): string | undefined {
  if (!hasImages) return model;

  const lowerModel = String(model || '').toLowerCase();

  if (providerKey === 'anthropic') {
    const looksVisionCapable = /claude-(3|sonnet|opus|haiku|4|5)/.test(lowerModel);
    if (!looksVisionCapable) {
      const override = 'claude-sonnet-4-6';
      try {
        res.setHeader('X-Model-Override', override);
      } catch (_) {}
      return override;
    }
  } else if (providerKey === 'gemini' || providerKey === 'google') {
    const looksVisionCapable = /gemini|vision/.test(lowerModel);
    if (!looksVisionCapable) {
      const override = 'gemini-3-flash-preview';
      try {
        res.setHeader('X-Model-Override', override);
      } catch (_) {}
      return override;
    }
  } else if (providerKey === 'openrouter') {
    const looksVisionCapable =
      /\b(gpt-4|4\.1|4o|claude-3|claude-sonnet|claude-opus|gemini|vision)\b/.test(lowerModel);
    if (!looksVisionCapable) {
      const override = 'minimax/minimax-m2.5';
      try {
        res.setHeader('X-Model-Override', override);
      } catch (_) {}
      return override;
    }
  }

  return model;
}

/**
 * Prepare messages with system prompt and history
 */
function prepareMessages(
  messages: ChatMessage[],
  historySlice: ChatMessage[],
  systemPrompt: string | null,
  includeSystem: boolean,
  provider: string
): ChatMessage[] {
  let finalMessages: ChatMessage[];

  if (includeSystem && systemPrompt) {
    if (provider !== 'gemini' && provider !== 'google') {
      finalMessages = [{ role: 'system', content: systemPrompt }, ...historySlice, ...messages];
    } else {
      finalMessages = [...historySlice, ...messages];
    }
  } else {
    finalMessages = [...historySlice, ...messages];
  }

  return finalMessages;
}

/**
 * Embed images into the last user message
 */
function embedImagesInMessages(
  finalMessages: ChatMessage[],
  images: ImageData[] | undefined
): ChatMessage[] {
  if (!Array.isArray(images) || images.length === 0) {
    return finalMessages;
  }

  let lastUserIdx = -1;
  for (let i = finalMessages.length - 1; i >= 0; i--) {
    const msg = finalMessages[i];
    if (msg && msg.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx < 0) {
    return finalMessages;
  }

  const userMsg = finalMessages[lastUserIdx];
  if (!userMsg) {
    return finalMessages;
  }
  const textContent = typeof userMsg.content === 'string' ? userMsg.content : '';
  const contentParts: ContentPart[] = [];

  if (textContent) {
    contentParts.push({ type: 'text', text: textContent });
  }

  for (const img of images) {
    if (img && img.data) {
      const mimeType = img.mimeType || 'image/png';
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${img.data}`,
        },
      });
    }
  }

  finalMessages[lastUserIdx] = {
    role: userMsg.role,
    content: contentParts,
  };

  return finalMessages;
}

/**
 * Set verify nudge headers for weak OCR providers
 */
function setVerifyNudgeHeaders(
  res: Response,
  provider: string | undefined,
  messages: ChatMessage[]
): void {
  try {
    const providerLC = String(provider || '').toLowerCase();
    const caps2 = getCapabilities(providerLC);
    const lastUser = Array.isArray(messages)
      ? [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string')
      : null;
    const promptLC = String((lastUser && lastUser.content) || '').toLowerCase();
    const needsOcr = /\b(ocr|read\s+text|tiny\s+text|small\s+text)\b/.test(promptLC);
    const weakOcr = caps2 && (caps2.ocr_quality === 'low' || caps2.small_text_reading === 'low');
    if (needsOcr && weakOcr) {
      res.setHeader('X-Verify-Nudge', 'ocr_provider');
      res.setHeader(
        'X-Verify-Message',
        'Your model may struggle with tiny text. Switch to Google?'
      );
      res.setHeader('X-Verify-Suggested-Provider', 'gemini');
    }
  } catch (_) {}
}

/**
 * Get effective reasoning config
 */
function getEffectiveReasoning(
  reasoning: ReasoningConfig | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provider: string
): ReasoningConfig | null {
  if (reasoning && typeof reasoning === 'object') {
    return reasoning;
  }

  return null;
}

export {
  resolveApiKey,
  getLmStudioOptions,
  applyFreeTierFallback,
  overrideModelForVision,
  prepareMessages,
  embedImagesInMessages,
  setVerifyNudgeHeaders,
  getEffectiveReasoning,
};
