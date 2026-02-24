/**
 * Provider configuration utilities
 * Handles LLM provider selection, model selection, and API key management
 */
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS, getModelKey } from '@web/constants/storageKeys.js';
import { debugLog, logError } from '@web/utils/debugLog.js';
import { apiResolve, withApiHeaders } from './transport.js';
import { prepareMessagesForSync } from './conversation.js';
import type { Provider, ApiProvider, ChatMessage } from '@web/types/chat.js';

export const GEMINI_KEY_REGEX = /^AIza[0-9A-Za-z_-]{20,}$/;

interface ApiKeysObject {
  anthropic?: string;
  google?: string;
  openrouter?: string;
  discogs?: string;
  youtube?: string;
}

/**
 * Get API key for a provider from storage
 */
export function pickApiKey(provider: ApiProvider): string {
  const obj = (storage.mirror.getJSON(STORAGE_KEYS.API_KEYS, {}) as ApiKeysObject) || {};

  // Debug logging when enabled via localStorage flag
  const debug =
    typeof window !== 'undefined' && window.localStorage?.getItem('DEBUG_KEYS') === 'true';

  let result = '';
  if (provider === 'anthropic') {
    result = obj.anthropic || storage.mirror.get(STORAGE_KEYS.ANTHROPIC_API_KEY) || '';
  } else if (provider === 'gemini' || provider === 'google') {
    result = obj.google || storage.mirror.get(STORAGE_KEYS.GEMINI_API_KEY) || '';
  } else if (provider === 'openrouter') {
    result = obj.openrouter || storage.mirror.get('openrouterApiKey') || '';
  } else if (provider === 'discogs') {
    result = obj.discogs || storage.mirror.get('discogsToken') || '';
  } else if (provider === 'youtube') {
    result = obj.youtube || storage.mirror.get('youtubeApiKey') || '';
  }

  if (debug) {
    debugLog('keys', 'pickApiKey', { provider, hasKey: !!result });
  }

  return result;
}

/**
 * Get current LLM provider from storage
 */
export function pickProvider(): Provider {
  let p = (
    storage.mirror.get(STORAGE_KEYS.LLM_PROVIDER) ||
    window.getDefaultProvider?.() ||
    'anthropic'
  ).toLowerCase();
  if (p === 'google') p = 'gemini';
  return p as Provider;
}

/**
 * Get model for a provider from storage or defaults
 */
export function pickModel(provider: Provider): string {
  const stored = storage.mirror.get(getModelKey(provider));
  if (stored && stored.trim()) return stored.trim();
  try {
    if (typeof window.getDefaultModel === 'function') return window.getDefaultModel(provider);
  } catch (_) {
    // Intentional: fallback to hardcoded defaults if window function unavailable
  }
  // Fallbacks
  if (provider === 'anthropic') return 'claude-sonnet-4-6';
  if (provider === 'gemini') return 'gemini-3-flash-preview';
  if (provider === 'lmstudio') return 'local-model';
  if (provider === 'openrouter') return 'minimax/minimax-m2.5';
  return 'claude-sonnet-4-6';
}

/**
 * Set the LLM provider in storage
 */
export async function setProvider(provider: Provider): Promise<void> {
  await storage.mirror.set(STORAGE_KEYS.LLM_PROVIDER, provider);
}

/**
 * Check if a Gemini key is valid format
 */
export function isValidGeminiKey(key: string | undefined | null): boolean {
  return GEMINI_KEY_REGEX.test((key || '').trim());
}

/**
 * Switch provider with history sync to preserve conversation context
 * @param newProvider - The provider to switch to
 * @param currentMessages - Current conversation messages to sync
 * @returns Promise that resolves when sync is complete
 */
export async function setProviderWithSync(
  newProvider: Provider,
  currentMessages: ChatMessage[] = []
): Promise<{ ok: boolean; synced: number }> {
  const oldProvider = pickProvider();

  // No need to sync if switching to same provider
  if (oldProvider === newProvider) {
    return { ok: true, synced: 0 };
  }

  // Transform messages for sync using shared utility (includes image base64)
  const syncMessages = prepareMessagesForSync(currentMessages);

  // Sync history to server
  try {
    const resp = await fetch(
      apiResolve('/api/thread/sync-provider'),
      withApiHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromProvider: oldProvider,
          toProvider: newProvider,
          messages: syncMessages,
        }),
      })
    );

    if (!resp.ok) {
      debugLog('chat', 'provider:syncFailed', await resp.text());
    }

    const result = (await resp.json()) as { ok?: boolean; count?: number };

    // Update local storage after successful sync
    await storage.mirror.set(STORAGE_KEYS.LLM_PROVIDER, newProvider);

    return { ok: result.ok ?? false, synced: result.count ?? 0 };
  } catch (err) {
    logError('chat', 'provider:sync', err as Error);
    // Still update provider even if sync fails
    await storage.mirror.set(STORAGE_KEYS.LLM_PROVIDER, newProvider);
    return { ok: false, synced: 0 };
  }
}
