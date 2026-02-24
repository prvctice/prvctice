/**
 * Chat Store
 * Main Pinia store for chat functionality
 *
 * This store has been modularized. Functionality is split across:
 * - ./chat/provider.ts - Provider/model/API key utilities
 * - ./chat/images.ts - Image processing utilities
 * - ./chat/utils.ts - Common helpers (uuid, notifications, etc.)
 * - ./chat/transport.ts - Socket/fetch handling
 * - ./chat/conversation.ts - Conversation CRUD operations
 * - ./chat/streaming.ts - Stream response processing
 * - ./chat/gameLauncher.ts - Game detection and launch
 * - ./chat/imageProcessing.ts - Image conversion for send
 * - ./chat/dispatchers/ - Provider-specific request builders
 */
import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { showThinking, hideThinking, resetThinkingOverlay } from '@web/utils/visuals.js';
import { normaliseImageList } from '@web/stores/imageModal.js';
import { getConfig } from '@web/stores/config.js';
import { storage } from '@web/storage/storage.js';
import { debugLog, debugWarn, logError } from '@web/utils/debugLog.js';
import { useEventBus } from '@web/services/eventBus';
import { useSessionGate } from '@web/composables/useSessionGate.js';
import { useOnboarding } from '@web/composables/useOnboarding';

// Import from split modules
import { pickApiKey, pickProvider, pickModel } from '@web/stores/chat/provider.js';
import { useFileAttachments } from '@web/composables/useFileAttachments';
import { uuid, normalizeCitations, notify } from '@web/stores/chat/utils.js';

// Import from transport module
import {
  apiResolve,
  getFetchAbort,
  createRequestAbortController,
  clearFetchAbort,
  withApiHeaders,
} from '@web/stores/chat/transport.js';

// Import from conversation module
import {
  activeConversationId,
  conversationTitle,
  ensureConversation as ensureConversationBase,
  maybeUpdateConversationTitle,
  persistMessageToStorage,
  resetConversationState as resetConversationStateBase,
  listConversations,
  loadConversation as loadConversationBase,
  loadMostRecentConversation as loadMostRecentConversationBase,
} from '@web/stores/chat/conversation.js';

// Import from streaming module
import { handleStreamingResponse, processImageResponse } from '@web/stores/chat/streaming.js';

// Import from new refactored modules
import { checkGameLaunchRequest } from '@web/stores/chat/gameLauncher.js';
import {
  processAttachedImages,
  updateMessagesWithBase64,
  getSourceFiles,
} from '@web/stores/chat/imageProcessing.js';
import {
  buildNonOpenAIRequest,
  handleNudgeResponse,
  type ConversationMessage,
} from '@web/stores/chat/dispatchers/index.js';

import type {
  AssistantImageEntry,
  BookResultItem,
  EssayResultItem,
  FilmResultItem,
  ChatMessage,
  ImageEntry,
  StreamingState,
  Nudge,
  LastImageState,
  Provider,
  MessageSender,
  LoadConversationOptions,
} from '@web/types/chat.js';
import { classifyError, formatErrorForChat, parseResponseError } from '@web/utils/chatErrors.js';

// Re-export utilities for external consumers
export { pickApiKey, pickProvider, pickModel } from '@web/stores/chat/provider.js';
export { uuid, notify } from '@web/stores/chat/utils.js';

/**
 * Aggregate skill usage history from message loadedSkills arrays.
 * Returns one entry per skill with total count and most recent timestamp.
 */
function buildSkillUsageHistory(
  msgs: ReadonlyArray<{ loadedSkills?: string[]; createdAt?: number }>
): Array<{ skillName: string; count: number; lastUsed: number }> {
  const usage = new Map<string, { count: number; lastUsed: number }>();
  for (const msg of msgs) {
    if (!msg.loadedSkills) continue;
    const ts = msg.createdAt ?? Date.now();
    for (const name of msg.loadedSkills) {
      const existing = usage.get(name);
      if (existing) {
        usage.set(name, {
          count: existing.count + 1,
          lastUsed: Math.max(existing.lastUsed, ts),
        });
      } else {
        usage.set(name, { count: 1, lastUsed: ts });
      }
    }
  }
  return Array.from(usage.entries()).map(([skillName, data]) => ({ skillName, ...data }));
}

interface ImagePayloadItem {
  src?: string;
  kind?: string;
  mimeType?: string;
  downloadName?: string;
  source?: string;
  base64?: string;
}

/**
 * Build conversation history with images for multi-turn image conversations.
 */
function buildConversationWithImages(
  messageList: ChatMessage[],
  currentText: string,
  limit: number = 10
): { messages: ConversationMessage[]; hasImages: boolean } {
  const result: ConversationMessage[] = [];
  let hasImages = false;
  const recentMessages = messageList.slice(-limit);

  for (const msg of recentMessages) {
    const role = msg.sender === 'user' ? 'user' : 'assistant';
    const msgImages = (msg.images || []).filter((img) => img.base64 && img.mimeType);

    if (msgImages.length > 0 && role === 'user') {
      hasImages = true;
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

      if (msg.text && msg.text.trim()) {
        content.push({ type: 'text', text: msg.text.trim() });
      }

      for (const img of msgImages) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        });
      }

      result.push({ role, content });
    } else {
      result.push({ role, content: msg.text || '' });
    }
  }

  result.push({ role: 'user', content: currentText });
  return { messages: result, hasImages };
}

export const useChatStore = defineStore('chat', () => {
  // Messages and streaming buffer
  const messages: Ref<ChatMessage[]> = ref([]);
  const streaming: Ref<StreamingState> = ref({ active: false, buffer: '' });
  const sending: Ref<boolean> = ref(false);
  const nudge: Ref<Nudge | null> = ref(null);
  const lastPrompt: Ref<string> = ref('');
  const workingImage: Ref<ImageEntry | null> = ref(null);
  const lastImageTimestamp: Ref<number> = ref(0);

  // Skills loaded for current streaming response
  const pendingSkills: Ref<{ loaded: string[]; condensed: string[] }> = ref({
    loaded: [],
    condensed: [],
  });

  // Image state - source of truth for last images (synced to window for legacy)
  const lastAssistantImage: Ref<LastImageState> = ref({ base64: null, mimeType: null, url: null });
  const lastSourceImage: Ref<LastImageState> = ref({ base64: null, mimeType: null, url: null });

  // File attachments are now managed by useFileAttachments composable
  const fileAttachments = useFileAttachments();

  function revealChatSurface(): void {
    try {
      resetThinkingOverlay();
    } catch (e) {
      debugWarn('chat', 'revealChatSurface:resetThinking', e as Error);
    }
    try {
      hideThinking();
    } catch (e) {
      debugWarn('chat', 'revealChatSurface:hideThinking', e as Error);
    }
    try {
      if (typeof window.setDotMatrixOverlaySuppressed === 'function') {
        window.setDotMatrixOverlaySuppressed(false);
      }
    } catch (e) {
      debugWarn('chat', 'revealChatSurface:dotmatrixOverlay', e as Error);
    }
    try {
      if (typeof window.setDotMatrixInteractive === 'function') {
        window.setDotMatrixInteractive(false);
      }
    } catch (e) {
      debugWarn('chat', 'revealChatSurface:dotmatrixInteractive', e as Error);
    }
    try {
      if (typeof window.setDotMatrixSpheresVisible === 'function') {
        window.setDotMatrixSpheresVisible(false);
      }
    } catch (e) {
      debugWarn('chat', 'revealChatSurface:dotmatrixSpheres', e as Error);
    }
  }

  // Wrap conversation functions to use local pickModel
  async function ensureConversation(
    seedText: string = '',
    providerHint?: Provider,
    modelHint?: string
  ): Promise<string> {
    return ensureConversationBase(seedText, providerHint, modelHint, pickModel);
  }

  function resetConversationState(): void {
    messages.value = [];
    streaming.value.active = false;
    streaming.value.buffer = '';
    resetConversationStateBase();
  }

  async function loadConversation(
    conversationId: string,
    options: LoadConversationOptions = {}
  ): Promise<boolean> {
    const result = await loadConversationBase(conversationId, options, revealChatSurface);
    if (result && result.messages) {
      messages.value = result.messages;
      streaming.value.active = false;
      streaming.value.buffer = '';
      return true;
    }
    return false;
  }

  async function loadMostRecentConversation(
    options: LoadConversationOptions = {}
  ): Promise<boolean> {
    const result = await loadMostRecentConversationBase(options, revealChatSurface);
    if (result && result.messages) {
      messages.value = result.messages;
      streaming.value.active = false;
      streaming.value.buffer = '';
      return true;
    }
    if (!result) {
      resetConversationState();
    }
    return false;
  }

  function updateLastImageTimestamp(ts: number = Date.now()): void {
    lastImageTimestamp.value = ts;
    try {
      window.lastImageAt = ts;
    } catch (err) {
      if (import.meta.env.DEV) {
        debugWarn('chat', 'updateLastImageTimestamp:window.lastImageAt', err as Error);
      }
    }
    try {
      if (typeof window.markRecentImage === 'function') window.markRecentImage();
    } catch (err) {
      if (import.meta.env.DEV) {
        debugWarn('chat', 'updateLastImageTimestamp:markRecentImage', err as Error);
      }
    }
  }

  function rememberAssistantImage(image: ImageEntry): void {
    if (!image || !image.src) return;
    lastAssistantImage.value = {
      base64: image.base64 || null,
      mimeType: image.mimeType || null,
      url: image.src,
    };
    try {
      if (image.base64) {
        window.lastAssistantImageBase64 = image.base64;
      }
      if (image.mimeType) window.lastAssistantImageMime = image.mimeType;
      window.lastAssistantImageUrl = image.src;
    } catch (err) {
      if (import.meta.env.DEV) debugWarn('chat', 'rememberAssistantImage:windowSync', err as Error);
    }
    updateLastImageTimestamp();
    workingImage.value = image;
  }

  interface SourceImageInput {
    base64?: string | null;
    mimeType?: string | null;
    src?: string | null;
    kind?: string;
  }

  function rememberSourceImage(image: SourceImageInput): void {
    if (!image) return;
    lastSourceImage.value = {
      base64: image.base64 || null,
      mimeType: image.mimeType || null,
      url: image.src || null,
    };
    try {
      if (image.base64) {
        window.lastSourceImageBase64 = image.base64;
      }
      if (image.mimeType) window.lastSourceImageMime = image.mimeType;
      window.lastSourceImageUrl = image.src || null;
    } catch (_) {
      // Intentional: window property sync is optional, don't break on SSR or restricted contexts
    }
    updateLastImageTimestamp();
    const next: ImageEntry = {
      ...(workingImage.value || {}),
      src: image.src || '',
      kind: (image.kind as ImageEntry['kind']) || 'user',
      base64: image.base64 || undefined,
      mimeType: image.mimeType || undefined,
    };
    workingImage.value = next;
  }

  function appendMessage(
    sender: MessageSender,
    text: string | null | undefined,
    imagePayload?: ImagePayloadItem | ImagePayloadItem[] | string | string[]
  ): string {
    const id = uuid();
    const hasExisting = messages.value.length > 0;
    const rawText = typeof text === 'string' ? text : text ? String(text) : '';
    const textValue = sender === 'assistant' ? normalizeCitations(rawText) : rawText;
    const trimmed = textValue.trim();
    const normalisedImages: ImageEntry[] = (() => {
      if (!imagePayload) return [];
      const list = Array.isArray(imagePayload) ? imagePayload : [imagePayload];
      return normaliseImageList(
        list.map((item) => {
          if (typeof item === 'string') {
            return {
              src: item,
              kind: sender === 'assistant' ? 'assistant' : 'user',
            };
          }
          const kind =
            typeof item.kind === 'string'
              ? item.kind
              : sender === 'assistant'
                ? 'assistant'
                : 'user';
          return { kind, ...item };
        })
      ) as ImageEntry[];
    })();

    const isImageOnly = !trimmed && normalisedImages.length > 0;
    if (isImageOnly && hasExisting) {
      const last = messages.value[messages.value.length - 1];
      if (last && last.sender === sender) {
        const updatedLast: ChatMessage = {
          ...last,
          images: [...(last.images || []), ...normalisedImages],
        };
        messages.value = messages.value.map((m, i) =>
          i === messages.value.length - 1 ? updatedLast : m
        );
        persistMessageToStorage(updatedLast);
        return updatedLast.id || id;
      }
    }

    const entry: ChatMessage = {
      id,
      sender,
      text: textValue,
      createdAt: Date.now(),
      ...(normalisedImages.length ? { images: normalisedImages } : {}),
    };
    messages.value = [...messages.value, entry];
    if (sender === 'user') {
      maybeUpdateConversationTitle(textValue);
    }
    persistMessageToStorage(entry);
    if (sender === 'assistant' && normalisedImages.length) {
      normalisedImages.forEach(rememberAssistantImage);
    } else if (sender === 'user' && normalisedImages.length) {
      const primary = normalisedImages[0];
      if (primary) rememberSourceImage(primary);
    }
    return id;
  }

  function updateAssistantStreamingMessage(chunk: string): void {
    if (!streaming.value.active) {
      streaming.value.active = true;
      streaming.value.buffer = '';
    }
    streaming.value.buffer += chunk;
    streaming.value.buffer = normalizeCitations(streaming.value.buffer);
  }

  interface FinalizePayload {
    text?: string;
    imageUrl?: string;
  }

  function finalizeAssistantStreamingMessage(payload: FinalizePayload = {}): void {
    if (!streaming.value.active && !payload?.text && !payload?.imageUrl) return;
    const text = (payload && payload.text) || streaming.value.buffer || '';
    const imageUrl = payload?.imageUrl;
    appendMessage('assistant', text, imageUrl);

    // Attach pending skills to the just-appended assistant message
    const skills = pendingSkills.value;
    if (skills.loaded.length > 0 || skills.condensed.length > 0) {
      const lastIdx = messages.value.length - 1;
      const lastMsg = messages.value[lastIdx];
      if (lastMsg && lastMsg.sender === 'assistant') {
        messages.value = messages.value.map((m, i) =>
          i === lastIdx
            ? {
                ...m,
                loadedSkills: [...skills.loaded],
                condensedSkills: [...skills.condensed],
              }
            : m
        );
      }
      pendingSkills.value = { loaded: [], condensed: [] };
    }

    streaming.value.active = false;
    streaming.value.buffer = '';
    useEventBus().emit('skill:response-complete');
  }

  // Install a global nudge click handler once to support inline action links
  if (typeof window !== 'undefined' && !window.__nudgeClickInstalled) {
    window.__nudgeClickInstalled = true;
    document.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const a = target?.closest?.('a[data-nudge-action]');
        if (!a) return;
        const act = a.getAttribute('data-nudge-action');
        if (act === 'switch-provider') {
          storage.mirror.set('llmProvider', 'gemini');
          window.__nudge_accept = true;
          if (typeof window.__chatStoreResubmit === 'function' && window.__lastTextNonOpenAI) {
            window.__chatStoreResubmit(window.__lastTextNonOpenAI);
          }
          e.preventDefault();
        } else if (act === 'keep-provider') {
          e.preventDefault();
        }
      },
      true
    );
  }

  /**
   * Create streaming response handler with common callbacks
   */
  function createStreamingHandler(text: string, model: string) {
    return async (resp: Response): Promise<void> => {
      try {
        window.onDotMatrixAIResponseStart?.();
      } catch (_) {
        // Intentional: particle animation hook is optional
      }

      const handlers = {
        onChunk: (chunk: string) => updateAssistantStreamingMessage(chunk),
        onDone: () => {
          finalizeAssistantStreamingMessage();
          useSessionGate().consumeMessage();
          useOnboarding().incrementMessageCount();
          sending.value = false;
          try {
            window.onDotMatrixAIResponseEnd?.();
          } catch (_) {
            // Intentional: particle animation hook is optional
          }
          try {
            hideThinking();
          } catch (_) {
            // Intentional: visual overlay is optional
          }
        },
        onImage: (entry: AssistantImageEntry) => appendMessage('assistant', '', entry),
        onMoodboard: ({
          images,
        }: {
          images: Array<{
            url: string;
            thumbnailUrl?: string;
            title?: string;
            source?: string;
            sourceUrl?: string;
            artist?: string;
            date?: string;
          }>;
        }) => {
          const moodboardImages = images.map((img) => ({
            src: img.url,
            thumbnailUrl: img.thumbnailUrl || img.url,
            kind: 'moodboard' as const,
            prompt: img.title || '',
            mimeType: 'image/jpeg',
            source: img.source || 'moodboard',
            sourceUrl: img.sourceUrl || '',
            artist: img.artist || '',
            date: img.date || '',
          }));
          if (moodboardImages.length) {
            appendMessage('assistant', '', moodboardImages);
          }
        },
        onBookResults: ({ books }: { books: BookResultItem[] }) => {
          if (books.length) {
            appendMessage('assistant', `<!--book_results:${JSON.stringify(books)}-->`);
          }
        },
        onEssayResults: ({ essays }: { essays: EssayResultItem[] }) => {
          if (essays.length) {
            appendMessage('assistant', `<!--essay_results:${JSON.stringify(essays)}-->`);
          }
        },
        onFilmResults: ({ films }: { films: FilmResultItem[] }) => {
          if (films.length) {
            appendMessage('assistant', `<!--film_results:${JSON.stringify(films)}-->`);
          }
        },
        onSkillsLoaded: (payload: { skills: string[]; condensed: string[] }) => {
          pendingSkills.value = {
            loaded: payload.skills,
            condensed: payload.condensed,
          };
        },
        onError: (error: string) => {
          appendMessage('assistant', error);
          sending.value = false;
          try {
            window.onDotMatrixAIResponseEnd?.();
          } catch (_) {
            // Intentional: particle animation hook is optional
          }
          try {
            hideThinking();
          } catch (_) {
            // Intentional: visual overlay is optional
          }
        },
        notify,
      };

      try {
        await handleStreamingResponse(resp, handlers, { text, model });
      } catch (streamError) {
        // Stream read error (connection drop, abort after response started)
        logError('chat', 'stream:interrupted', streamError as Error);

        // Preserve partial content if any was received
        if (streaming.value.buffer.trim()) {
          finalizeAssistantStreamingMessage({
            text: streaming.value.buffer + '\n\n*[Response interrupted]*',
          });
        } else {
          // No content received - show classified error message
          const classified = classifyError(streamError as Error);
          appendMessage('assistant', formatErrorForChat(classified));
          if (classified.action) {
            notify(
              classified.category === 'config' ? 'warning' : 'error',
              classified.title,
              classified.action
            );
          }
        }

        sending.value = false;
        try {
          window.onDotMatrixAIResponseEnd?.();
        } catch (_) {
          // Intentional: particle animation hook is optional
        }
        try {
          hideThinking();
        } catch (_) {
          // Intentional: visual overlay is optional
        }
      }
    };
  }

  /**
   * Handle non-OpenAI provider request
   */
  async function handleNonOpenAIRequest(
    text: string,
    provider: Provider,
    model: string,
    apiKey: string,
    images: Array<{ data: string; mimeType: string }> | undefined,
    useFullConversation: boolean,
    conversationMessages: ConversationMessage[] | null,
    onStreamingResponse: (resp: Response) => Promise<void>,
    usageHistory?: Array<{ skillName: string; count: number; lastUsed: number }>
  ): Promise<void> {
    const body = buildNonOpenAIRequest(text, provider, model, apiKey, {
      useFullConversation,
      conversationMessages,
      images,
      usageHistory,
    });

    const signal = createRequestAbortController();
    try {
      window.__lastTextNonOpenAI = text;
      window.__chatStoreResubmit = (t: string) => send(t);
    } catch (_) {
      // Intentional: nudge resubmit state is optional
    }
    const cfg = getConfig();
    const f = (cfg && cfg.fetchImpl) || fetch;

    try {
      window.onDotMatrixAIResponseStart?.();
    } catch (_) {
      // Intentional: particle animation hook is optional
    }

    try {
      const r = await f(
        apiResolve('/api/v1/dispatch'),
        withApiHeaders({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        })
      );
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      handleNudgeFromHeaders(r);

      if (ct.includes('ndjson')) {
        await onStreamingResponse(r);
        return;
      }

      if (!r.ok || !ct.includes('application/json')) {
        const errorData = await parseResponseError(r);
        const classified = classifyError(errorData);
        appendMessage('assistant', formatErrorForChat(classified));
      } else {
        const j = (await r.json()) as {
          ok?: boolean;
          images?: Array<{ data: string; mimeType: string }>;
          text?: string;
          nudge?: Nudge;
          decision?: { task?: string; model?: string; provider?: string };
        };

        // Intercept app_generate dispatch decisions
        if (j.decision?.task === 'app_generate') {
          const { useAppGenerator } = await import(
            /* @vite-ignore */ '@web/composables/useAppGenerator.js'
          );
          const generator = useAppGenerator();

          try {
            await generator.generateApp(text, { provider, apiKey, model });

            if (generator.lastExplanation.value) {
              appendMessage('assistant', generator.lastExplanation.value);
            }
          } finally {
            sending.value = false;
            try {
              hideThinking();
            } catch (_) {
              // Intentional: visual overlay is optional
            }
          }

          useSessionGate().consumeMessage();
          useOnboarding().incrementMessageCount();
          return;
        }

        processNonOpenAIResponse(j, text, body.model, provider);
      }
    } finally {
      clearFetchAbort();
      try {
        window.onDotMatrixAIResponseEnd?.();
      } catch (_) {
        // Intentional: particle animation hook is optional
      }
      useEventBus().emit('skill:response-complete');
    }
    sending.value = false;
    try {
      hideThinking();
    } catch (_) {
      // Intentional: visual overlay is optional
    }
  }

  /**
   * Handle nudge from response headers
   */
  function handleNudgeFromHeaders(r: Response): void {
    try {
      const nv = (r.headers.get('x-verify-nudge') || '').toLowerCase();
      if (nv === 'ocr_provider') {
        const msg =
          r.headers.get('x-verify-message') ||
          'Your model may struggle with tiny text. Switch to Google?';
        nudge.value = {
          type: 'ocr_provider',
          message: msg,
          suggested_provider: r.headers.get('x-verify-suggested-provider') || 'gemini',
        };
      }
    } catch (_) {
      // Intentional: nudge header parsing is non-critical
    }
  }

  /**
   * Process dispatch response and append messages
   */
  function processDispatchResponse(
    j: {
      images?: Array<{ data: string; mimeType: string }>;
      text?: string;
      nudge?: Nudge;
      decision?: { model?: string; provider?: string };
    },
    text: string,
    model: string,
    provider: string
  ): void {
    if (Array.isArray(j.images) && j.images.length) {
      const decision = j.decision || {};
      for (const im of j.images) {
        const entry = processImageResponse(im, {
          prompt: text,
          model: decision.model || model,
          provider: decision.provider || provider || 'gemini',
          source: 'dispatch',
        });
        if (entry) appendMessage('assistant', null, entry);
      }
    }
    if (j.text) appendMessage('assistant', j.text);
    if (!j.text && (!j.images || !j.images.length) && !j.nudge) {
      appendMessage('assistant', 'No output received.');
    }
    useSessionGate().consumeMessage();
    useOnboarding().incrementMessageCount();
  }

  /**
   * Process non-OpenAI response with nudge handling
   */
  function processNonOpenAIResponse(
    j: {
      images?: Array<{ data: string; mimeType: string }>;
      text?: string;
      nudge?: Nudge;
      decision?: { model?: string; provider?: string };
    },
    text: string,
    model: string,
    provider: Provider
  ): void {
    let issuedNudge = false;
    if (j && j.nudge && j.nudge.type === 'ocr_provider') {
      issuedNudge = true;
      const html = handleNudgeResponse(j.nudge);
      if (html) {
        try {
          if (typeof window.appendNotifs === 'function') window.appendNotifs('info', html);
        } catch (_) {
          // Intentional: notification system is optional
        }
      }
      try {
        nudge.value = j.nudge;
      } catch (_) {
        // Intentional: Vue ref assignment may fail in edge cases
      }
    }

    processDispatchResponse(j, text, model, provider);

    try {
      window.__nudge_accept = false;
    } catch (_) {
      // Intentional: nudge state cleanup is optional
    }
    if (issuedNudge) {
      try {
        window.__holdAttachmentsForNudge = true;
      } catch (_) {
        // Intentional: attachment hold state is optional
      }
    }
  }

  /**
   * Echo user's attachments as messages
   */
  function echoUserAttachments(attachedFiles: Array<File | Blob>): void {
    try {
      if (attachedFiles.length) {
        for (const file of attachedFiles) {
          try {
            if (file && file.type && file.type.startsWith('image/')) {
              const u = URL.createObjectURL(file);
              if (!window.pinnedObjectUrls) window.pinnedObjectUrls = new Set();
              window.pinnedObjectUrls.add(u);
              appendMessage('user', null, {
                src: u,
                kind: 'user',
                mimeType: file.type,
                downloadName: (file as File).name || undefined,
                source: 'user-attachment',
              });
            }
          } catch (err) {
            logError('chat', 'echoUserAttachments:file', err as Error);
          }
        }
      }
    } catch (err) {
      logError('chat', 'echoUserAttachments', err as Error);
    }
  }

  /**
   * Main send function - orchestrates message sending
   */
  async function send(rawText: string): Promise<void> {
    const text = String(rawText || '').trim();
    const attachedFiles = fileAttachments.getFilesForSubmit();
    if (!text && !attachedFiles.length) return;
    if (sending.value) return;
    lastPrompt.value = text;

    // Check for game launch requests first
    const gameResult = checkGameLaunchRequest(text);
    if (gameResult.isGame) return;

    const provider = pickProvider();
    const model = pickModel(provider);
    const apiKey = pickApiKey(provider).trim();
    const hasAttachments = attachedFiles.length > 0;

    sending.value = true;
    try {
      showThinking();
    } catch (_) {
      // Intentional: visual overlay is optional
    }

    try {
      await ensureConversation(text, provider, model);
    } catch (err) {
      logError('chat', 'send:ensureConversation', err as Error);
    }

    // Echo user message in UI immediately
    appendMessage('user', text || '');
    echoUserAttachments(attachedFiles);

    if (hasAttachments && !text) {
      appendMessage(
        'assistant',
        'Add a question or instruction about the image (e.g., "describe this image").'
      );
      sending.value = false;
      try {
        hideThinking();
      } catch (_) {
        // Intentional: visual overlay is optional
      }
      return;
    }

    const onStreamingResponse = createStreamingHandler(text, model);

    try {
      await handleNonOpenAIProvider(
        text,
        provider,
        model,
        apiKey,
        hasAttachments,
        attachedFiles,
        onStreamingResponse
      );
    } catch (err) {
      const classified = classifyError(err as Error);
      appendMessage('assistant', formatErrorForChat(classified));
      sending.value = false;
      try {
        window.onDotMatrixAIResponseEnd?.();
      } catch (_) {
        // Intentional: particle animation hook is optional
      }
      try {
        hideThinking();
      } catch (_) {
        // Intentional: visual overlay is optional
      }
    } finally {
      streaming.value.active = false;
      try {
        if (!(typeof window !== 'undefined' && window.__holdAttachmentsForNudge)) {
          fileAttachments.clearAttachments();
        }
      } finally {
        try {
          window.__holdAttachmentsForNudge = false;
        } catch (_) {
          // Intentional: attachment hold state cleanup is optional
        }
      }
    }
  }

  /**
   * Handle provider send logic
   */
  async function handleNonOpenAIProvider(
    text: string,
    provider: Provider,
    model: string,
    apiKey: string,
    hasAttachments: boolean,
    attachedFiles: Array<File | Blob>,
    onStreamingResponse: (resp: Response) => Promise<void>
  ): Promise<void> {
    const sourceFiles = getSourceFiles(attachedFiles);
    let images: Array<{ data: string; mimeType: string }> | undefined = undefined;
    let skipped = 0;
    let useFullConversation = false;
    let conversationMessages: ConversationMessage[] | null = null;

    if (sourceFiles.length > 0) {
      const result = await processAttachedImages(sourceFiles, {
        onConverted: (img) => rememberSourceImage({ base64: img.data, mimeType: img.mimeType }),
      });
      images = result.images.length > 0 ? result.images : undefined;
      skipped = result.skipped;

      if (result.images.length > 0) {
        messages.value = updateMessagesWithBase64(messages.value, result.images);
      }
    } else {
      const { messages: convMsgs, hasImages } = buildConversationWithImages(
        messages.value,
        text,
        10
      );
      if (hasImages && convMsgs.length > 1) {
        debugLog('chat', 'conversation:multiTurn', {
          messageCount: convMsgs.length,
          hasImages,
        });
        useFullConversation = true;
        conversationMessages = convMsgs;
      }
    }

    if (skipped > 0) {
      appendMessage(
        'assistant',
        'Some attached images are not supported (use PNG, JPEG, or WEBP). Skipping unsupported ones.'
      );
    }

    const usageHistory = buildSkillUsageHistory(messages.value);

    await handleNonOpenAIRequest(
      text,
      provider,
      model,
      apiKey,
      images,
      useFullConversation,
      conversationMessages,
      onStreamingResponse,
      usageHistory.length > 0 ? usageHistory : undefined
    );
  }

  function stop(): void {
    try {
      getFetchAbort()?.abort?.();
      clearFetchAbort();
    } catch (_) {
      // Intentional: abort controller cleanup may fail if already aborted
    }
    streaming.value.active = false;
  }

  async function acceptNudge(): Promise<void> {
    await storage.mirror.set('llmProvider', 'gemini');
    try {
      window.__nudge_accept = true;
    } catch (_) {
      // Intentional: nudge accept state is optional
    }
    const prompt = lastPrompt.value || '';
    nudge.value = null;
    if (prompt) await send(prompt);
  }

  function keepNudge(): void {
    nudge.value = null;
    try {
      window.__holdAttachmentsForNudge = false;
    } catch (_) {
      // Intentional: attachment hold state cleanup is optional
    }
  }

  async function editMessage(messageId: string, newText: string): Promise<void> {
    if (!messageId || typeof newText !== 'string') return;
    const trimmed = newText.trim();
    if (!trimmed) return;

    const idx = messages.value.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const msg = messages.value[idx];
    if (!msg || msg.sender !== 'user') return;

    messages.value = messages.value.map((m, i) =>
      i === idx
        ? {
            id: msg.id,
            sender: msg.sender,
            createdAt: msg.createdAt,
            text: trimmed,
            editedAt: Date.now(),
            images: msg.images,
          }
        : m
    );

    const conversationId = activeConversationId.value;
    if (conversationId) {
      try {
        await storage.messages.put({
          id: messageId,
          conversationId,
          sender: msg.sender,
          text: trimmed,
          createdAt: msg.createdAt ?? Date.now(),
          editedAt: Date.now(),
        });
      } catch (err) {
        logError('chat', 'message:editPersist', err as Error);
      }
    }

    notify('success', 'Message updated');
  }

  return {
    messages,
    streaming,
    sending,
    nudge,
    workingImage,
    lastAssistantImage,
    lastSourceImage,
    activeConversationId,
    conversationTitle,
    appendMessage,
    updateAssistantStreamingMessage,
    finalizeAssistantStreamingMessage,
    listConversations,
    loadConversation,
    loadMostRecentConversation,
    resetConversationState,
    send,
    stop,
    acceptNudge,
    keepNudge,
    editMessage,
  };
});
