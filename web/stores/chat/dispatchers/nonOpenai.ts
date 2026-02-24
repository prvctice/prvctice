/**
 * Non-OpenAI provider dispatch logic
 * Handles building requests for Anthropic, Gemini, OpenRouter, LMStudio, etc.
 */

import { useSessionGate } from '@web/composables/useSessionGate.js';
import { pickApiKey } from '../provider.js';
import { storage } from '@web/storage/storage.js';
import type { Provider, Nudge } from '@web/types/chat.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface NonOpenAIRequest {
  provider: Provider;
  model: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  stream: boolean;
  includeSystem: boolean;
  skipHistory?: boolean;
  tools: string[];
  apiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openrouterApiKey?: string;
  lmstudioBaseUrl?: string;
  discogsToken?: string;
  youtubeApiKey?: string;
  user_overrides?: string;
  nudge_accept?: boolean;
  images?: Array<{ data: string; mimeType: string }>;
  trialMessagesRemaining: number;
  usageHistory?: Array<{ skillName: string; count: number; lastUsed: number }>;
}

export interface NonOpenAIDispatchOptions {
  useFullConversation: boolean;
  conversationMessages?: ConversationMessage[] | null;
  images?: Array<{ data: string; mimeType: string }>;
  usageHistory?: Array<{ skillName: string; count: number; lastUsed: number }>;
}

/**
 * Build request body for non-OpenAI providers
 */
export function buildNonOpenAIRequest(
  text: string,
  provider: Provider,
  model: string,
  apiKey: string,
  options: NonOpenAIDispatchOptions
): NonOpenAIRequest {
  const { useFullConversation, conversationMessages, images, usageHistory } = options;

  // Use streaming for text-only requests, non-streaming for image requests
  const wantsStreaming = !useFullConversation && !(images && images.length);

  const session = useSessionGate();
  return {
    provider,
    model,
    messages:
      useFullConversation && conversationMessages
        ? conversationMessages
        : [{ role: 'user', content: text }],
    stream: wantsStreaming,
    includeSystem: !useFullConversation, // Skip system prompt merge when we provide full history
    skipHistory: useFullConversation, // Tell backend not to use session history
    tools: [],
    apiKey: apiKey || undefined,
    // Only send the key for the active provider
    anthropicApiKey:
      provider === 'anthropic'
        ? (apiKey || pickApiKey('anthropic') || '').trim() || undefined
        : undefined,
    geminiApiKey:
      provider === 'gemini' || provider === 'google'
        ? (apiKey || pickApiKey('gemini') || '').trim() || undefined
        : undefined,
    openrouterApiKey:
      provider === 'openrouter'
        ? (apiKey || pickApiKey('openrouter') || '').trim() || undefined
        : undefined,
    lmstudioBaseUrl:
      provider === 'lmstudio'
        ? storage.mirror.get('lmstudio:baseUrl') || 'http://localhost:1234'
        : undefined,
    discogsToken: pickApiKey('discogs') || undefined,
    youtubeApiKey: pickApiKey('youtube') || undefined,
    user_overrides: typeof window !== 'undefined' && window.__nudge_accept ? '/gemini' : undefined,
    nudge_accept: typeof window !== 'undefined' && window.__nudge_accept ? true : undefined,
    images,
    trialMessagesRemaining: session.messagesRemaining.value,
    usageHistory,
  };
}

/**
 * Handle nudge response from server
 */
export function handleNudgeResponse(nudge: Nudge | undefined): string | null {
  if (!nudge || nudge.type !== 'ocr_provider') return null;

  const rawMsg = nudge.message || 'Consider switching provider for better OCR.';
  // Escape server message to prevent XSS before interpolation
  const safeMsg = String(rawMsg).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] || c
  );
  return `${safeMsg} <a href="#" data-nudge-action="switch-provider">Switch</a> · <a href="#" data-nudge-action="keep-provider">Keep</a>`;
}
