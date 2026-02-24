/**
 * Conversation Module
 * Conversation CRUD operations and persistence
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { storage, blobGetByHash } from '@web/storage/storage.js';
import { debugLog, logError } from '@web/utils/debugLog.js';
import {
  uuid,
  MAX_CONVERSATIONS,
  MAX_SYNC_MESSAGES,
  TITLE_FALLBACK,
  deriveConversationTitle,
} from './utils.js';
import { useEventBus } from '@web/services/eventBus';
import { pickProvider } from './provider.js';
import { apiResolve, withApiHeaders } from './transport.js';
import { revokeConversationUrls } from './streaming.js';
import type {
  Conversation,
  StoredMessage,
  StoredImageRef,
  Provider,
  MessageSender,
  LoadConversationOptions,
  ChatMessage,
  ImageEntry,
} from '@web/types/chat.js';

/**
 * Fire-and-forget: sync a message to the backend search index.
 * Non-critical -- if it fails, chat still works; search is just incomplete.
 */
function syncMessageToSearch(
  messageId: string,
  conversationId: string,
  text: string,
  role: string,
  conversationTitle?: string
): void {
  if (!text.trim()) return;

  try {
    fetch(
      apiResolve('/api/v1/search/index'),
      withApiHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: messageId,
          conversationId,
          text,
          role,
          conversationTitle: conversationTitle || undefined,
        }),
      })
    ).catch(() => {
      // Intentional: search index sync is non-critical
    });
  } catch (_) {
    // Intentional: search index sync is non-critical
  }
}

/**
 * Convert a Blob to base64 string (without data: prefix)
 */
async function blobToBase64(blob: Blob): Promise<string | null> {
  try {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  } catch (err) {
    logError('chat', 'conversation:blobToBase64', err as Error);
    return null;
  }
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch (err) {
    logError('chat', 'conversation:base64ToBlob', err as Error);
    return null;
  }
}

// Conversation state
export const activeConversationId: Ref<string | null> = ref(null);
export const activeConversation: Ref<Conversation | null> = ref(null);

// Computed title
export const conversationTitle: ComputedRef<string> = computed(
  () => activeConversation.value?.title || TITLE_FALLBACK
);

/**
 * Prune old conversations beyond the maximum limit
 */
export async function pruneOldConversations(max: number = MAX_CONVERSATIONS): Promise<void> {
  try {
    const list = await storage.conversations.list({ index: 'updatedAt', limit: max + 5 });
    if (!Array.isArray(list) || list.length <= max) return;
    const stale = list.slice(max) as unknown as Conversation[];
    for (const convo of stale) {
      if (!convo || !convo.id) continue;
      try {
        await storage.conversations.delete(convo.id);
        useEventBus().emit('conversation:deleted', { id: convo.id });
        const batch = await storage.messages.list({
          index: { conversationId: convo.id },
          limit: 5000,
        });
        if (Array.isArray(batch)) {
          for (const msg of batch as unknown as StoredMessage[]) {
            if (msg && msg.id) {
              await storage.messages.delete(msg.id);
            }
          }
        }
      } catch (err) {
        logError('chat', 'conversation:pruneOne', err as Error);
      }
    }
  } catch (err) {
    logError('chat', 'conversation:pruneAll', err as Error);
  }
}

/**
 * Ensure a conversation exists, creating one if necessary
 */
export async function ensureConversation(
  seedText: string = '',
  providerHint?: Provider,
  modelHint?: string,
  pickModelFn?: (provider: Provider) => string
): Promise<string> {
  const provider = providerHint || pickProvider();
  const model = modelHint || (pickModelFn ? pickModelFn(provider) : provider);

  if (activeConversationId.value) {
    const id = activeConversationId.value;
    let current = activeConversation.value;
    if (!current || current.id !== id) {
      try {
        current = (await storage.conversations.get(id)) as unknown as Conversation | null;
      } catch (err) {
        logError('chat', 'conversation:loadForSync', err as Error);
      }
    }
    if (current && (current.provider !== provider || current.model !== model)) {
      await touchConversation({ provider, model });
    }
    return id;
  }

  const record: Conversation = {
    id: uuid(),
    title: deriveConversationTitle(seedText),
    provider,
    model,
    createdAt: Date.now(),
  };

  try {
    const saved = (await storage.conversations.put(
      record as unknown as Record<string, unknown>
    )) as unknown as Conversation;
    activeConversationId.value = saved.id;
    activeConversation.value = saved;
    useEventBus().emit('conversation:created', { id: saved.id, title: saved.title });
    await pruneOldConversations();
    return saved.id;
  } catch (err) {
    logError('chat', 'conversation:create', err as Error);
    activeConversationId.value = record.id;
    activeConversation.value = record;
    return record.id;
  }
}

/**
 * Update conversation with partial data
 */
export async function touchConversation(
  partial: Partial<Conversation> = {}
): Promise<Conversation | null> {
  const id = activeConversationId.value;
  if (!id) return null;

  const current =
    activeConversation.value ||
    ((await storage.conversations.get(id)) as unknown as Conversation | null);
  if (!current) return null;

  const next: Conversation = {
    ...current,
    ...partial,
    id,
  };

  activeConversation.value = next;

  try {
    const saved = (await storage.conversations.put(
      next as unknown as Record<string, unknown>
    )) as unknown as Conversation;
    activeConversation.value = saved;
    if (partial.title) {
      useEventBus().emit('conversation:updated', { id, title: partial.title });
    }
    return saved;
  } catch (err) {
    logError('chat', 'conversation:update', err as Error);
    return next;
  }
}

/**
 * Maybe update conversation title from message text
 */
export function maybeUpdateConversationTitle(text: string): void {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return;
  if (!activeConversationId.value) return;

  const currentTitle = activeConversation.value && activeConversation.value.title;
  if (currentTitle && currentTitle !== TITLE_FALLBACK) return;

  touchConversation({ title: clean.slice(0, 80) }).catch(() => {
    // Best effort
  });
}

/**
 * Persist a message entry to storage, including image blob refs
 */
export async function persistMessageToStorage(entry: ChatMessage): Promise<void> {
  if (!entry || !entry.id) return;
  const conversationId = activeConversationId.value;
  if (!conversationId) return;

  try {
    // Process images to blob refs
    const imageRefs: StoredImageRef[] = [];
    if (entry.images && entry.images.length > 0) {
      for (const img of entry.images) {
        try {
          let blob: Blob | null = null;
          const mimeType = img.mimeType || 'image/png';

          if (img.base64) {
            // Convert base64 to blob
            blob = base64ToBlob(img.base64, mimeType);
          } else if (img.src && img.src.startsWith('blob:')) {
            // Fetch blob from object URL
            const resp = await fetch(img.src);
            blob = await resp.blob();
          } else if (img.src && img.src.startsWith('data:')) {
            // Extract base64 from data URL
            const match = img.src.match(/^data:([^;]+);base64,(.+)$/);
            if (match && match[1] && match[2]) {
              blob = base64ToBlob(match[2], match[1]);
            }
          }

          if (blob) {
            const record = await storage.blobs.put(blob, mimeType);
            imageRefs.push({
              blobHash: record.hash,
              mimeType,
              kind: img.kind,
            });
          }
        } catch (imgErr) {
          logError('chat', 'message:persistImage', imgErr as Error);
        }
      }
    }

    await storage.messages.put({
      id: entry.id,
      conversationId,
      sender: entry.sender,
      text: typeof entry.text === 'string' ? entry.text : '',
      createdAt: entry.createdAt || Date.now(),
      imageRefs: imageRefs.length > 0 ? imageRefs : undefined,
    });
    await touchConversation();

    // Sync to backend search index (fire-and-forget)
    syncMessageToSearch(
      entry.id,
      conversationId,
      typeof entry.text === 'string' ? entry.text : '',
      entry.sender === 'assistant' ? 'assistant' : 'user',
      activeConversation.value?.title || undefined
    );
  } catch (err) {
    logError('chat', 'message:persist', err as Error);
  }
}

/**
 * Reset conversation state
 */
export function resetConversationState(): void {
  // Revoke object URLs to prevent memory leaks
  revokeConversationUrls();

  activeConversationId.value = null;
  activeConversation.value = null;
}

/**
 * List conversations ordered by update time
 */
export async function listConversations(
  limit: number = MAX_CONVERSATIONS
): Promise<Conversation[]> {
  try {
    return (
      ((await storage.conversations.list({
        index: 'updatedAt',
        limit,
      })) as unknown as Conversation[]) || []
    );
  } catch (err) {
    logError('chat', 'conversation:list', err as Error);
    return [];
  }
}

interface MessageRow {
  id?: string;
  sender?: MessageSender;
  text?: string;
  createdAt?: number;
}

/**
 * Sync message history to server
 * @param rows - Message rows to sync
 * @param targetProvider - Optional provider to sync to (defaults to current provider)
 */
export async function syncServerHistoryFromRows(
  rows: MessageRow[] = [],
  targetProvider?: Provider
): Promise<void> {
  if (typeof fetch !== 'function') return;

  // Use provided target provider or pick current
  const provider = targetProvider || pickProvider();
  const trimmed = rows
    .filter((row) => row && typeof row.text === 'string' && row.text.trim())
    .map((row) => ({
      role: row.sender === 'assistant' ? 'assistant' : 'user',
      content: row.text,
    }));

  try {
    if (!trimmed.length) {
      await fetch(
        apiResolve('/api/thread/clear'),
        withApiHeaders({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        })
      );
      return;
    }
    const payload = trimmed.slice(-MAX_SYNC_MESSAGES);
    const resp = await fetch(
      apiResolve('/api/thread/restore'),
      withApiHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, provider }),
      })
    );
    if (!resp.ok) {
      debugLog('chat', 'history:syncFailed', await resp.text());
    }
  } catch (err) {
    logError('chat', 'history:sync', err as Error);
  }
}

interface LoadConversationResult {
  messages: ChatMessage[];
  conversation: Conversation;
}

/**
 * Load a conversation by ID, restoring images from blob storage
 */
export async function loadConversation(
  conversationId: string,
  options: LoadConversationOptions = {},
  revealChatSurfaceFn?: () => void
): Promise<LoadConversationResult | false> {
  if (!conversationId) return false;

  // Revoke previous conversation's object URLs before loading new one
  revokeConversationUrls();

  try {
    const convo = (await storage.conversations.get(
      conversationId
    )) as unknown as Conversation | null;
    if (!convo) return false;

    const limit = options.limit || 2000;
    const rows = (await storage.messages.list({
      index: { conversationId },
      limit,
    })) as unknown as StoredMessage[];

    const ordered = Array.isArray(rows)
      ? [...rows].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      : [];

    // Map rows to ChatMessages, restoring images from blobs
    const mapped: ChatMessage[] = await Promise.all(
      ordered.map(async (row) => {
        const msg: ChatMessage = {
          id: row.id || uuid(),
          sender: row.sender || 'assistant',
          text: typeof row.text === 'string' ? row.text : '',
          createdAt: row.createdAt || Date.now(),
        };

        // Restore images from blob refs
        if (row.imageRefs && row.imageRefs.length > 0) {
          const images: ImageEntry[] = [];
          for (const ref of row.imageRefs) {
            try {
              const blob = await blobGetByHash(ref.blobHash);
              if (blob) {
                const url = URL.createObjectURL(blob);
                // Pin the URL for cleanup when conversation changes
                try {
                  if (!window.pinnedObjectUrls) window.pinnedObjectUrls = new Set();
                  window.pinnedObjectUrls.add(url);
                } catch (_) {
                  // Intentional: object URL tracking is optional
                }
                const base64 = await blobToBase64(blob);
                images.push({
                  src: url,
                  kind: ref.kind,
                  mimeType: ref.mimeType,
                  base64: base64 || undefined,
                });
              }
            } catch (_) {
              // Intentional: skip missing blobs, don't fail entire message load
            }
          }
          if (images.length > 0) {
            msg.images = images;
          }
        }

        return msg;
      })
    );

    activeConversationId.value = convo.id;
    activeConversation.value = convo;

    if (revealChatSurfaceFn) {
      revealChatSurfaceFn();
    }

    if (options.syncServer !== false) {
      await syncServerHistoryFromRows(ordered);
    }

    return { messages: mapped, conversation: convo };
  } catch (err) {
    logError('chat', 'conversation:load', err as Error);
    return false;
  }
}

/**
 * Load the most recent conversation
 */
export async function loadMostRecentConversation(
  options: LoadConversationOptions = {},
  revealChatSurfaceFn?: () => void
): Promise<LoadConversationResult | false> {
  const [latest] = await listConversations(1);
  if (!latest) {
    resetConversationState();
    if (options.syncServer !== false) {
      await syncServerHistoryFromRows([]);
    }
    return false;
  }
  return loadConversation(latest.id, options, revealChatSurfaceFn);
}

/** Content part type for multi-modal messages */
interface SyncContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

/** Sync message format (OpenAI-style canonical format) */
interface SyncMessage {
  role: string;
  content: string | SyncContentPart[];
}

/**
 * Prepare messages for server sync, including image content
 * Uses canonical OpenAI-style format for portability across providers
 */
export function prepareMessagesForSync(messages: ChatMessage[]): SyncMessage[] {
  return messages
    .filter((m) => m && (m.text?.trim() || (m.images && m.images.length > 0)))
    .map((m) => {
      const role = m.sender === 'assistant' ? 'assistant' : 'user';

      // Simple text-only message
      if (!m.images || m.images.length === 0) {
        return { role, content: m.text || '' };
      }

      // Multi-modal message with images
      const content: SyncContentPart[] = [];

      // Add text part if present
      if (m.text?.trim()) {
        content.push({ type: 'text', text: m.text });
      }

      // Add image parts
      for (const img of m.images) {
        if (img.base64 && img.mimeType) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          });
        } else if (img.src && img.src.startsWith('data:')) {
          // Already a data URL
          content.push({
            type: 'image_url',
            image_url: { url: img.src },
          });
        }
      }

      return { role, content };
    });
}
