/**
 * Streaming Module
 * Stream response processing for chat
 */
import { buildAssistantImageEntry } from './images.js';
import { prettyToolName } from './utils.js';
import { classifyError, parseResponseError, formatErrorForChat } from '@web/utils/chatErrors.js';
import { debugLog, logError } from '@web/utils/debugLog.js';
import type {
  StreamHandlers,
  StreamContext,
  StreamEvent,
  ToolProgressEvent,
  NotificationKind,
  AssistantImageEntry,
  MoodboardImage,
  BookResultItem,
  EssayResultItem,
  FilmResultItem,
} from '@web/types/chat.js';

// Tool progress tracking
const toolProgressMap = new Map<string, string>();

/**
 * Revoke all pinned object URLs to prevent memory leaks
 * Call this when switching conversations or resetting state
 */
export function revokeConversationUrls(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.pinnedObjectUrls && window.pinnedObjectUrls.size > 0) {
      window.pinnedObjectUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          // Intentional: URL may already be revoked
        }
      });
      window.pinnedObjectUrls.clear();
    }
  } catch (_) {
    // Intentional: window properties may not be available in SSR
  }
}

/**
 * Check if stream debugging is enabled
 */
function isStreamDebugEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.__debugStream === true;
  } catch (_) {
    // Intentional: debug flag check should never break
    return false;
  }
}

/**
 * Debug log for streaming
 */
function debugStream(...args: unknown[]): void {
  if (!isStreamDebugEnabled()) return;
  debugLog('stream', 'event', ...args);
}

/**
 * Handle tool progress events
 */
export function handleToolProgress(
  evt: ToolProgressEvent = {},
  notifyFn?: (kind: NotificationKind, message: string) => void
): void {
  const toolId = evt.id;
  const phase = evt.phase;
  const name = prettyToolName(evt.name || 'tool');

  if (!toolId || !phase) return;

  if (phase === 'started') {
    toolProgressMap.set(toolId, name);
    if (notifyFn) notifyFn('info', `${name} started...`);
  } else if (phase === 'completed') {
    const stored = toolProgressMap.get(toolId) || name;
    toolProgressMap.delete(toolId);
    if (notifyFn) notifyFn('success', `${stored} finished.`);
  }
}

interface NotifAction {
  label: string;
  handler: () => void;
}

/**
 * Push notification via legacy bridge
 */
function pushNotif(kind: NotificationKind, text: string): void {
  try {
    if (typeof window.appendNotifs === 'function') {
      window.appendNotifs(kind || 'info', text || '');
    }
  } catch (_) {
    // Intentional: notification system is optional
  }
}

/**
 * Push notification with actionable button
 */
function pushNotifWithAction(kind: NotificationKind, text: string, action: NotifAction): void {
  try {
    if (typeof window.appendNotifsWithAction === 'function') {
      window.appendNotifsWithAction(kind || 'info', text || '', action);
    } else if (typeof window.appendNotifs === 'function') {
      // Fallback: show notification without action
      window.appendNotifs(kind || 'info', text || '');
    }
  } catch (_) {
    // Intentional: notification system is optional
  }
}

/**
 * Handle a streaming response from the server.
 *
 * Error handling contract:
 * - HTTP errors (non-2xx responses): Handled internally via error classification.
 *   Calls onError with formatted message and shows actionable notification if available.
 * - Stream read errors (connection drops, aborts): Thrown to the caller.
 *   The caller is responsible for preserving partial content from the streaming buffer
 *   before showing an error. Check streaming.value.buffer for any received content.
 *
 * @param resp - The fetch Response object
 * @param handlers - Callbacks for stream events (onChunk, onDone, onImage, etc.)
 * @param context - Additional context (text prompt, model name)
 */
export async function handleStreamingResponse(
  resp: Response,
  handlers: StreamHandlers = {},
  context: StreamContext = {}
): Promise<void> {
  const {
    onChunk,
    onDone,
    onImage,
    onMoodboard,
    onBookResults,
    onEssayResults,
    onFilmResults,
    onSkillsLoaded,
    onError,
    notify,
  } = handlers;
  const { text = '', model = '' } = context;

  // Clear stale tool progress from previous response
  toolProgressMap.clear();

  // Track whether onDone has been called to prevent double-invocation
  let doneCalled = false;
  // Track if we've seen tool activity - if so, don't finalize on first 'done'
  let hasToolActivity = false;
  // Track if we've received any content deltas
  let hasContent = false;

  // Handle HTTP errors up-front with error classification
  if (!resp.ok || !resp.body) {
    const errorData = await parseResponseError(resp);
    const classified = classifyError(errorData);
    if (onError) {
      onError(formatErrorForChat(classified));
    }
    // Show actionable notification if available
    if (classified.action) {
      pushNotifWithAction(
        classified.category === 'config' ? 'warning' : 'error',
        classified.title,
        classified.action
      );
    }
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let shouldStop = false;

  const pump = async (): Promise<void> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      let idx: number;

      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;

        debugStream('raw', line);

        try {
          const evt = JSON.parse(line) as StreamEvent;
          debugStream('event', evt.type, evt);

          if (evt.type === 'delta' && evt.content) {
            // Signal particle awareness on first content (AI is responding)
            if (!hasContent) {
              try {
                window.onDotMatrixAIResponseStart?.();
              } catch (_) {
                // Intentional: particle animation hook is optional
              }
            }
            hasContent = true;
            if (onChunk) {
              onChunk(evt.content);
            }
          } else if (evt.type === 'done') {
            // Don't stop on 'done' if we have tool activity but no content yet.
            // The backend sends 'done' after tool_call, then continues streaming
            // the actual response after tool execution completes.
            if (hasToolActivity && !hasContent) {
              // Keep reading - more content is coming after tool execution
              debugStream('ignoring intermediate done, waiting for tool results');
              continue;
            }
            if (onDone && !doneCalled) {
              doneCalled = true;
              onDone();
              // Signal particle awareness that AI response ended
              try {
                window.onDotMatrixAIResponseEnd?.();
              } catch (_) {
                // Intentional: particle animation hook is optional
              }
            }
            shouldStop = true;
            break;
          } else if (evt.type === 'tool_call') {
            hasToolActivity = true;
            // Tool calls are handled by the backend, just track that we saw one
          } else if (evt.type === 'tool_progress') {
            hasToolActivity = true;
            handleToolProgress(evt as ToolProgressEvent, notify);
          } else if (evt.type === 'tool_result') {
            const status = String(evt?.status || '').toLowerCase();
            const summary = typeof evt?.summary === 'string' ? evt.summary.trim() : '';
            const action = typeof evt?.action === 'string' ? evt.action : null;
            const code = typeof evt?.code === 'string' ? evt.code : null;
            const toolName = prettyToolName(String(evt?.name || 'Tool'));

            if (status === 'error') {
              // Check for actionable errors based on action or code
              if (action === 'open_settings' || code === 'missing_api_key') {
                pushNotifWithAction('error', summary || `${toolName} requires an API key.`, {
                  label: 'Open Settings',
                  handler: () => {
                    if (typeof window.openApiKeysModal === 'function') {
                      window.openApiKeysModal();
                    }
                  },
                });
              } else if (code === 'timeout') {
                pushNotifWithAction('warning', summary || `${toolName} timed out.`, {
                  label: 'Try Simpler Query',
                  handler: () => {
                    // Focus the input for user to retry
                    const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
                    if (input) input.focus();
                  },
                });
              } else if (code === 'rate_limit') {
                pushNotif(
                  'warning',
                  summary || `${toolName} hit rate limits. Wait a moment and try again.`
                );
              } else {
                // Generic tool error with tool name
                pushNotif('error', summary || `${toolName} reported an error.`);
              }
            } else if (status === 'note') {
              if (summary) pushNotif('info', summary);
            }
          } else if (evt.type === 'image' && evt.data) {
            try {
              const base64 = String(evt.data || '').replace(/\s+/g, '');
              if (!base64) throw new Error('empty image payload');

              const bin = atob(base64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);

              const blob = new Blob([bytes], {
                type: evt.mimeType || 'image/png',
              });
              const url = URL.createObjectURL(blob);

              const entry = buildAssistantImageEntry(url, {
                mimeType: evt.mimeType || 'image/png',
                prompt: text,
                model,
                source: 'stream',
                downloadName: evt.filename || undefined,
                base64,
              });

              if (onImage && entry) {
                onImage(entry);
              }

              try {
                if (!window.pinnedObjectUrls) window.pinnedObjectUrls = new Set();
                window.pinnedObjectUrls.add(url);
              } catch (_) {
                // Intentional: object URL tracking is optional
              }
            } catch (err) {
              logError('chat', 'streaming:imagePayload', err as Error);
            }
          } else if (evt.type === 'web_search_status') {
            // Web search in progress — show notification
            hasToolActivity = true;
            if (notify) {
              notify('info', 'Searching the web...');
            }
          } else if (evt.type === 'web_search_error') {
            // Web search error — show inline
            hasToolActivity = true;
            if (notify) {
              const errorMsg = evt.message || 'Web search encountered an error.';
              notify('warning', errorMsg);
            }
          } else if (evt.type === 'book_results' && Array.isArray(evt.books)) {
            hasToolActivity = true;
            if (onBookResults) {
              try {
                onBookResults({
                  books: evt.books as BookResultItem[],
                  sources: evt.sources || [],
                });
              } catch (err) {
                logError('chat', 'streaming:book_results', err as Error);
              }
            }
          } else if (evt.type === 'essay_results' && Array.isArray(evt.essays)) {
            hasToolActivity = true;
            if (onEssayResults) {
              try {
                onEssayResults({
                  essays: evt.essays as EssayResultItem[],
                });
              } catch (err) {
                logError('chat', 'streaming:essay_results', err as Error);
              }
            }
          } else if (evt.type === 'film_results' && Array.isArray(evt.films)) {
            hasToolActivity = true;
            if (onFilmResults) {
              try {
                onFilmResults({
                  films: evt.films as FilmResultItem[],
                  matchNotes: evt.matchNotes || [],
                });
              } catch (err) {
                logError('chat', 'streaming:film_results', err as Error);
              }
            }
          } else if (evt.type === 'moodboard' && Array.isArray(evt.images)) {
            // Handle moodboard images (URL-based, not base64)
            hasToolActivity = true;
            if (onMoodboard) {
              try {
                onMoodboard({
                  images: evt.images as MoodboardImage[],
                  sources: evt.sources || [],
                  intent: evt.intent || 'general',
                });
              } catch (err) {
                logError('chat', 'streaming:moodboard', err as Error);
              }
            }
          } else if (evt.type === 'skills_loaded') {
            if (onSkillsLoaded && Array.isArray(evt.skills)) {
              try {
                onSkillsLoaded({
                  skills: evt.skills as string[],
                  condensed: (evt.condensed as string[]) || [],
                });
              } catch (err) {
                logError('chat', 'streaming:skills_loaded', err as Error);
              }
            }
          } else if (evt.type === 'error') {
            if (onError) {
              onError(evt.message || 'Request failed.');
            }
            shouldStop = true;
            break;
          }
        } catch (_) {
          // Intentional: malformed JSON chunks are skipped silently (common in streaming)
        }
      }

      if (shouldStop) break;
    }
  };

  // Note: HTTP errors are handled above. The pump() function may throw
  // if the stream is interrupted (connection drop, abort). Callers should
  // check streaming.value.buffer for partial content before showing errors.
  try {
    await pump();
  } finally {
    // Only call onDone if it hasn't been called yet (e.g., stream aborted early)
    if (onDone && !doneCalled) {
      doneCalled = true;
      try {
        onDone();
      } catch (err) {
        logError('chat', 'streaming:onDone', err as Error);
      }
    }
    // Always signal response end when stream completes/aborts
    try {
      window.onDotMatrixAIResponseEnd?.();
    } catch (_) {
      // Intentional: particle animation hook is optional
    }
  }
}

interface ImageData {
  data?: string;
  mimeType?: string;
}

interface ProcessImageContext {
  prompt?: string;
  model?: string;
  provider?: string;
  source?: string;
}

/**
 * Process base64 image data into a displayable entry
 */
export function processImageResponse(
  imageData: ImageData,
  context: ProcessImageContext = {}
): AssistantImageEntry | null {
  if (!imageData || !imageData.data) return null;

  try {
    const bin = atob(imageData.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const blob = new Blob([bytes], { type: imageData.mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);

    const entry = buildAssistantImageEntry(url, {
      mimeType: imageData.mimeType || 'image/png',
      prompt: context.prompt || '',
      model: context.model || undefined,
      provider: context.provider || 'gemini',
      source: context.source || 'dispatch',
      base64: imageData.data,
    });

    return entry;
  } catch (err) {
    logError('stream', 'image:process', err as Error);
    return null;
  }
}
