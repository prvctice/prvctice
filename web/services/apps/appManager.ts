/**
 * App Manager Orchestrator
 *
 * Top-level entry point for launching and managing sandboxed apps.
 * Wires together sandbox, bridge, permissions, watchdog, event bus,
 * and crash/timeout notifications into a cohesive system.
 *
 * Phase 3 (window manager) and Phase 4 (AI generator) will use this
 * as their public API for app lifecycle management.
 */

import { watch, type WatchStopHandle } from 'vue';
import { createSandbox, destroySandbox } from '@web/services/apps/sandbox';
import { getSDKSource } from '@web/services/apps/bridgeSDK';
import { createBridgeHandler, type BridgeHandler } from '@web/services/apps/bridge';
import { validateAppCode } from '@web/services/apps/validator';
import {
  createPermissionManager,
  type PermissionManager,
} from '@web/services/apps/permissionManager';
import { createWatchdog, type Watchdog } from '@web/services/apps/watchdog';
import {
  usePermissionBanner,
  type PermissionBannerState,
} from '@web/composables/usePermissionBanner';
import { useEventBus } from '@web/services/eventBus';
import { dispatchConnector, checkConnectorHealth } from '@web/services/connectors/index';
import { resolve as apiResolve } from '@web/services/api.js';
import type {
  AppDefinition,
  AppInstance,
  AppPermission,
  BridgeResponse,
  ThemeColors,
} from '@web/types/apps';
import { IMPLICIT_PERMISSIONS } from '@web/types/apps';
import { getHandTrackingSystem, type HandMoveEvent } from '@web/graphics/dotmatrix/handtrack';
import { useChatStore } from '@web/stores/chat.js';
import {
  activeConversationId as chatActiveConversationId,
  conversationTitle as chatConversationTitle,
} from '@web/stores/chat/conversation.js';
import { useNotifs } from '@web/composables/useNotifs';
import { createAppDialogManager, type AppDialogManager } from '@web/services/apps/appDialogManager';
import {
  dispatchMediaMessage,
  isMediaMessage,
  dispatchMixerMessage,
  isMixerMessage,
  cleanupMediaForInstance,
  type MediaState,
  type CameraState,
  type VideoPlayerState,
  type GifEncoderState,
  type HandlerContext,
} from '@web/services/apps/handlers/index';
import { createAudioEngine, type AudioEngine } from '@web/services/apps/audioEngine';
import { debugLog, logError } from '@web/utils/debugLog.js';

// ==================== TYPES ====================

export interface AppManager {
  readonly launch: (
    definition: AppDefinition,
    container: HTMLElement
  ) => Promise<AppInstance | null>;
  readonly close: (instanceId: string, reason?: 'user' | 'crash' | 'timeout' | 'security') => void;
  readonly getInstance: (instanceId: string) => AppInstance | undefined;
  readonly getRunningInstances: () => ReadonlyArray<AppInstance>;
  readonly getPermissionManager: () => PermissionManager;
  readonly getPermissionBanner: () => PermissionBannerState;
  readonly getDialogManager: () => AppDialogManager;
  readonly sendMessage: (instanceId: string, message: Record<string, unknown>) => void;
  readonly start: () => void;
  readonly stop: () => void;
}

// ==================== CONSTANTS ====================

const HANDSHAKE_TIMEOUT_MS = 30_000;
const GRACEFUL_CLOSE_MS = 500;

// ==================== HELPERS ====================

function extractThemeColors(): ThemeColors {
  // Widgets are ALWAYS dark (#1e1e1e) with light text, regardless of host theme.
  return {
    background: '#1e1e1e',
    surface: '#2a2a2a',
    text: '#e0e0e0',
    textSecondary: '#888',
    primary: 'rgba(255,255,255,0.85)',
    secondary: 'rgba(255,255,255,0.6)',
    accent: 'rgba(255,255,255,0.5)',
    border: 'rgba(255,255,255,0.12)',
  };
}

// ==================== FACTORY ====================

export function createAppManager(): AppManager {
  const instances = new Map<string, AppInstance>();
  const instanceContainers = new Map<string, HTMLElement>();
  const handshakeResolvers = new Map<
    string,
    {
      resolve: (instance: AppInstance) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  const inputRelayCleanups = new Map<string, () => void>();

  // Refresh timer state per instance: parent-managed polling timers
  interface RefreshTimer {
    intervalMs: number;
    timerId: ReturnType<typeof setInterval> | null;
    paused: boolean;
  }
  const refreshTimers = new Map<string, RefreshTimer>();

  // Media state per instance: active mic streams, recorders, analyser loops
  const mediaStates = new Map<string, MediaState>();

  // Camera state per instance
  const cameraStates = new Map<string, CameraState>();

  // Video player state per instance + playerId
  const videoStates = new Map<string, Map<string, VideoPlayerState>>();

  // GIF encoder state per instance + encoderId
  const gifStates = new Map<string, Map<string, GifEncoderState>>();

  // Active AI streaming sessions per streamId
  const activeStreams = new Map<string, { instanceId: string; controller: AbortController }>();

  // Audio engine singleton (lazy)
  let audioEngine: AudioEngine | null = null;

  // Mixer subscriber: instanceId of the mixer app receiving push state updates
  let mixerSubscriberId: string | null = null;

  // ==================== SUBSCRIPTION TRACKING ====================

  const chatMessageSubscribers = new Set<string>();
  const chatStreamingSubscribers = new Set<string>();
  const chatConversationSubscribers = new Set<string>();
  const contextLifecycleSubscribers = new Set<string>();
  const keyboardSubscribers = new Set<string>();
  const broadcastSubscriptions = new Map<string, Set<string>>(); // channel -> instanceIds

  let bridge: BridgeHandler | null = null;
  let watchdog: Watchdog | null = null;
  let permissionManager: PermissionManager | null = null;
  let banner: PermissionBannerState | null = null;
  let themeUnsubscribe: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;
  let keyboardDownHandler: ((e: KeyboardEvent) => void) | null = null;
  let keyboardUpHandler: ((e: KeyboardEvent) => void) | null = null;
  let chatWatchers: WatchStopHandle[] = [];
  let streamingTimerId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const bus = useEventBus();
  const notifs = useNotifs();
  const dialogManager = createAppDialogManager();

  // Toast rate limiting: track timestamps per instance (max 5 per 10 seconds)
  const toastTimestamps = new Map<string, number[]>();

  function isToastRateLimited(instanceId: string): boolean {
    const now = Date.now();
    const timestamps = toastTimestamps.get(instanceId) ?? [];
    // Remove timestamps older than 10 seconds
    const recent = timestamps.filter((t) => now - t < 10_000);
    toastTimestamps.set(instanceId, recent);
    return recent.length >= 5;
  }

  function recordToast(instanceId: string): void {
    const timestamps = toastTimestamps.get(instanceId) ?? [];
    timestamps.push(Date.now());
    toastTimestamps.set(instanceId, timestamps);
  }

  // ==================== REQUEST HANDLER ====================

  function handleRequest(
    instance: AppInstance,
    type: string,
    data: Record<string, unknown>,
    respond: (response: BridgeResponse) => void
  ): void {
    const appId = instance.appId;
    // The bridge handler wraps respond() and injects the real requestId.
    // We pass requestId: '' as a placeholder that gets overwritten.
    const rid = (data.requestId as string) ?? '';

    // Build handler context shared by media and mixer dispatchers
    function buildHandlerCtx(): HandlerContext {
      return {
        instance,
        respond,
        requestId: rid,
        data,
        getMediaState: (id) => mediaStates.get(id),
        setMediaState: (id, state) => mediaStates.set(id, state),
        deleteMediaState: (id) => mediaStates.delete(id),
        sendToApp: (inst, msg) => {
          if (bridge) bridge.sendToApp(inst, msg);
        },
        apiResolve,
        getCameraState: (id) => cameraStates.get(id),
        setCameraState: (id, state) => cameraStates.set(id, state),
        deleteCameraState: (id) => {
          cameraStates.delete(id);
        },
        getVideoState: (instId, playerId) => videoStates.get(instId)?.get(playerId),
        setVideoState: (instId, playerId, state) => {
          let playerMap = videoStates.get(instId);
          if (!playerMap) {
            playerMap = new Map();
            videoStates.set(instId, playerMap);
          }
          playerMap.set(playerId, state);
        },
        deleteVideoState: (instId, playerId) => {
          const playerMap = videoStates.get(instId);
          if (playerMap) {
            playerMap.delete(playerId);
            if (playerMap.size === 0) videoStates.delete(instId);
          }
        },
        deleteAllVideoStates: (instId) => {
          videoStates.delete(instId);
        },
        forEachVideoState: (instId, fn) => {
          const playerMap = videoStates.get(instId);
          if (playerMap) {
            playerMap.forEach(fn);
          }
        },
        getGifState: (instId, encoderId) => gifStates.get(instId)?.get(encoderId),
        setGifState: (instId, encoderId, state) => {
          let encoderMap = gifStates.get(instId);
          if (!encoderMap) {
            encoderMap = new Map();
            gifStates.set(instId, encoderMap);
          }
          encoderMap.set(encoderId, state);
        },
        deleteGifState: (instId, encoderId) => {
          const encoderMap = gifStates.get(instId);
          if (encoderMap) {
            encoderMap.delete(encoderId);
            if (encoderMap.size === 0) gifStates.delete(instId);
          }
        },
        deleteAllGifStates: (instId) => {
          gifStates.delete(instId);
        },
        forEachGifState: (instId, fn) => {
          const encoderMap = gifStates.get(instId);
          if (encoderMap) {
            encoderMap.forEach(fn);
          }
        },
        getAudioEngine: () => ensureAudioEngine(),
        getMixerSubscriber: () => mixerSubscriberId,
        setMixerSubscriber: (id) => {
          mixerSubscriberId = id;
        },
        getAppInstance: (id) => instances.get(id),
      };
    }

    // Delegate mixer messages to mixer handlers
    if (isMixerMessage(type)) {
      dispatchMixerMessage(type, buildHandlerCtx());
      return;
    }

    // Delegate media messages to extracted handlers
    if (isMediaMessage(type)) {
      dispatchMediaMessage(type, buildHandlerCtx());
      return;
    }

    switch (type) {
      case 'storage:usage': {
        void dispatchConnector('storage', 'usage', {}, appId)
          .then((result) => {
            respond({ requestId: rid, data: result.data ?? null, meta: result.meta });
          })
          .catch((err: unknown) => {
            logError('bridge', 'storage:usage', err as Error);
            respond({
              requestId: rid,
              error: (err as Error).message || 'Storage usage query failed',
              code: 'CONNECTOR_ERROR',
            });
          });
        break;
      }

      case 'storage:get':
      case 'storage:set':
      case 'storage:delete': {
        // Route through storageConnector for 50MB quota enforcement
        const storageMethod = type.split(':')[1] as string;
        const storageParams: Record<string, unknown> = { key: data.key };
        if (type === 'storage:set') storageParams.value = data.value;
        void dispatchConnector('storage', storageMethod, storageParams, appId)
          .then((result) => {
            respond({ requestId: rid, data: result.data ?? null, meta: result.meta });
          })
          .catch((err: unknown) => {
            logError('bridge', `${type}:${data.key as string}`, err as Error);
            respond({
              requestId: rid,
              error: (err as Error).message || 'Storage operation failed',
              code: 'CONNECTOR_ERROR',
            });
          });
        break;
      }

      case 'theme:get': {
        respond({ requestId: rid, data: extractThemeColors() });
        break;
      }

      case 'app:resize': {
        bus.emit('app:resize', {
          instanceId: instance.instanceId,
          width: data.width as number,
          height: data.height as number,
        });
        break;
      }

      case 'app:title': {
        bus.emit('app:title', {
          instanceId: instance.instanceId,
          title: data.title as string,
        });
        break;
      }

      case 'app:openUrl': {
        const url = data.url as string;
        if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        break;
      }

      case 'nav:state': {
        bus.emit('app:nav', {
          instanceId: instance.instanceId,
          viewName: data.viewName as string,
          stackDepth: data.stackDepth as number,
          title: data.title as string | null,
        });
        respond({ requestId: rid, data: { ok: true } });
        break;
      }

      case 'connector:request': {
        const connector = data.connector as string;
        const method = data.method as string;
        const params = (data.params ?? {}) as Record<string, unknown>;
        void dispatchConnector(connector, method, params, appId)
          .then((result) => {
            respond({ requestId: rid, data: result.data, meta: result.meta });

            // Broadcast fan-out: after successful publish, relay to all subscribers (skip sender)
            if (connector === 'broadcast' && method === 'publish') {
              const bChannel = params.channel as string;
              const bData = params.data;
              const subs = broadcastSubscriptions.get(bChannel);
              if (subs && bridge) {
                for (const subId of subs) {
                  if (subId === instance.instanceId) continue; // Skip sender
                  const subInst = instances.get(subId);
                  if (subInst) {
                    bridge.sendToApp(subInst, {
                      type: 'broadcast:message',
                      channel: bChannel,
                      data: bData,
                      fromAppId: appId,
                    });
                  }
                }
              }
            }
          })
          .catch((err: unknown) => {
            logError('bridge', `connector:${connector}:${method}`, err as Error);
            respond({ requestId: rid, error: (err as Error).message, code: 'CONNECTOR_ERROR' });
          });
        break;
      }

      case 'input:subscribe:keyboard': {
        keyboardSubscribers.add(instance.instanceId);
        break;
      }

      case 'app:requestRefresh': {
        const intervalMs = Math.max(5000, (data.interval as number) || 60000);
        // Stop existing timer if any
        stopRefreshForInstance(instance.instanceId);
        const timer: RefreshTimer = { intervalMs, timerId: null, paused: false };
        refreshTimers.set(instance.instanceId, timer);
        startRefreshTimer(instance.instanceId);
        // Send an immediate first refresh tick
        if (bridge) {
          bridge.sendToApp(instance, { type: 'refresh' });
        }
        break;
      }

      case 'app:requestNow': {
        if (bridge) {
          bridge.sendToApp(instance, { type: 'refresh' });
        }
        break;
      }

      case 'app:stopRefresh': {
        stopRefreshForInstance(instance.instanceId);
        break;
      }

      case 'action:result': {
        // Response from app's exported action handler -- resolve the pending promise
        const pending = instance.pending.get(rid);
        if (pending) {
          instance.pending.delete(rid);
          clearTimeout(pending.timeoutId);
          if (data.error) {
            pending.reject(new Error(data.error as string));
          } else {
            pending.resolve(data.data);
          }
        }
        break;
      }

      // ==================== SUBSCRIPTION HANDLERS ====================

      case 'chat:subscribe:messages': {
        chatMessageSubscribers.add(instance.instanceId);
        respond({ requestId: rid, data: { subscribed: true } });
        break;
      }

      case 'chat:subscribe:streaming': {
        chatStreamingSubscribers.add(instance.instanceId);
        respond({ requestId: rid, data: { subscribed: true } });
        break;
      }

      case 'chat:subscribe:conversation': {
        chatConversationSubscribers.add(instance.instanceId);
        respond({ requestId: rid, data: { subscribed: true } });
        break;
      }

      case 'context:subscribe:lifecycle': {
        contextLifecycleSubscribers.add(instance.instanceId);
        respond({ requestId: rid, data: { subscribed: true } });
        break;
      }

      case 'broadcast:subscribe': {
        const channel = data.channel as string;
        if (!channel) {
          respond({ requestId: rid, error: 'Channel required', code: 'INVALID_REQUEST' });
          break;
        }
        let subs = broadcastSubscriptions.get(channel);
        if (!subs) {
          subs = new Set();
          broadcastSubscriptions.set(channel, subs);
        }
        subs.add(instance.instanceId);
        respond({ requestId: rid, data: { subscribed: true, channel } });
        break;
      }

      case 'broadcast:unsubscribe': {
        const unsChannel = data.channel as string;
        if (!unsChannel) {
          respond({ requestId: rid, error: 'Channel required', code: 'INVALID_REQUEST' });
          break;
        }
        const unsubs = broadcastSubscriptions.get(unsChannel);
        if (unsubs) {
          unsubs.delete(instance.instanceId);
          if (unsubs.size === 0) broadcastSubscriptions.delete(unsChannel);
        }
        respond({ requestId: rid, data: { unsubscribed: true, channel: unsChannel } });
        break;
      }

      // ==================== CONNECTOR HEALTH ====================

      case 'connector:health': {
        const healthConnectorId = data.connector as string | null;
        void checkConnectorHealth(healthConnectorId ?? undefined)
          .then((result) => {
            respond({ requestId: rid, data: result });
          })
          .catch((err: unknown) => {
            logError('bridge', 'connector:health', err as Error);
            respond({ requestId: rid, error: (err as Error).message, code: 'CONNECTOR_ERROR' });
          });
        break;
      }

      // ==================== UI NOTIFICATION HANDLERS ====================

      case 'ui:toast': {
        if (isToastRateLimited(instance.instanceId)) {
          respond({ requestId: rid, data: { shown: false, reason: 'rate_limited' } });
          break;
        }
        const toastKind = (data.kind as string) || 'info';
        const toastMessage = data.message as string;
        if (!toastMessage || typeof toastMessage !== 'string') {
          respond({ requestId: rid, error: 'Missing message', code: 'INVALID_REQUEST' });
          break;
        }
        recordToast(instance.instanceId);
        notifs.push(toastKind, toastMessage);
        respond({ requestId: rid, data: { shown: true } });
        break;
      }

      case 'ui:confirm': {
        // Cap concurrent dialogs per instance (max 3)
        const confirmDialogCount = dialogManager.activeDialogs.value.filter(
          (d) => d.instanceId === instance.instanceId
        ).length;
        if (confirmDialogCount >= 3) {
          respond({ requestId: rid, error: 'Too many open dialogs', code: 'INVALID_REQUEST' });
          break;
        }
        const confirmTitle = (data.title as string) || 'Confirm';
        const confirmMessage = data.message as string;
        if (!confirmMessage || typeof confirmMessage !== 'string') {
          respond({ requestId: rid, error: 'Missing message', code: 'INVALID_REQUEST' });
          break;
        }
        const confirmButtons = (
          Array.isArray(data.buttons) ? data.buttons : ['Cancel', 'OK']
        ) as string[];
        const confirmDialogId = dialogManager.show({
          instanceId: instance.instanceId,
          type: 'confirm',
          title: confirmTitle,
          message: confirmMessage,
          buttons: confirmButtons,
          onResult: (choice: string) => {
            if (bridge) {
              bridge.sendToApp(instance, {
                type: 'ui:confirm_result',
                dialogId: confirmDialogId,
                data: { button: choice },
              });
            }
          },
        });
        // Immediately respond with dialogId (first phase of two-phase pattern)
        respond({ requestId: rid, data: { dialogId: confirmDialogId } });
        break;
      }

      case 'ui:alert': {
        // Cap concurrent dialogs per instance (max 3)
        const alertDialogCount = dialogManager.activeDialogs.value.filter(
          (d) => d.instanceId === instance.instanceId
        ).length;
        if (alertDialogCount >= 3) {
          respond({ requestId: rid, error: 'Too many open dialogs', code: 'INVALID_REQUEST' });
          break;
        }
        const alertTitle = (data.title as string) || 'Alert';
        const alertMessage = data.message as string;
        if (!alertMessage || typeof alertMessage !== 'string') {
          respond({ requestId: rid, error: 'Missing message', code: 'INVALID_REQUEST' });
          break;
        }
        const alertDialogId = dialogManager.show({
          instanceId: instance.instanceId,
          type: 'alert',
          title: alertTitle,
          message: alertMessage,
          buttons: ['OK'],
          onResult: (choice: string) => {
            if (bridge) {
              bridge.sendToApp(instance, {
                type: 'ui:alert_result',
                dialogId: alertDialogId,
                data: { dismissed: true, button: choice },
              });
            }
          },
        });
        // Immediately respond with dialogId (first phase of two-phase pattern)
        respond({ requestId: rid, data: { dialogId: alertDialogId } });
        break;
      }

      // ==================== AI STREAMING HANDLERS ====================

      case 'ai:stream': {
        const prompt = data.prompt as string;
        if (!prompt || typeof prompt !== 'string') {
          respond({ requestId: rid, error: 'Prompt required', code: 'INVALID_REQUEST' });
          break;
        }

        // Cap concurrent streams per instance (max 3)
        const MAX_STREAMS_PER_INSTANCE = 3;
        let instanceStreamCount = 0;
        for (const [, entry] of activeStreams) {
          if (entry.instanceId === instance.instanceId) instanceStreamCount++;
        }
        if (instanceStreamCount >= MAX_STREAMS_PER_INSTANCE) {
          respond({
            requestId: rid,
            error: 'Too many concurrent streams',
            code: 'INVALID_REQUEST',
          });
          break;
        }

        const streamId = crypto.randomUUID();
        const controller = new AbortController();
        activeStreams.set(streamId, { instanceId: instance.instanceId, controller });

        // Respond immediately with streamId (resolves the bridge _request, avoids 30s timeout)
        respond({ requestId: rid, data: { streamId } });

        // Start streaming in background (don't await)
        void (async () => {
          try {
            const res = await fetch(apiResolve('/api/v1/connectors/ai/stream'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                params: {
                  prompt,
                  maxTokens: data.maxTokens,
                  provider: data.provider,
                  model: data.model,
                },
                appId: instance.appId,
              }),
              signal: controller.signal,
            });

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let reading = true;

            while (reading) {
              const { done, value } = await reader.read();
              if (done) {
                reading = false;
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                const chunk = JSON.parse(line) as Record<string, unknown>;
                if (chunk.type === 'delta' && bridge) {
                  bridge.sendToApp(instance, {
                    type: 'ai:stream_chunk',
                    streamId,
                    text: chunk.text,
                  });
                }
                if (chunk.type === 'done' && bridge) {
                  bridge.sendToApp(instance, {
                    type: 'ai:stream_done',
                    streamId,
                    metadata: chunk.metadata,
                  });
                }
                if (chunk.type === 'error' && bridge) {
                  bridge.sendToApp(instance, {
                    type: 'ai:stream_error',
                    streamId,
                    error: chunk.error,
                  });
                }
              }
            }
          } catch (err) {
            if (!controller.signal.aborted && bridge) {
              bridge.sendToApp(instance, {
                type: 'ai:stream_error',
                streamId,
                error: (err as Error).message || 'Stream failed',
              });
            }
          } finally {
            activeStreams.delete(streamId);
          }
        })();
        break;
      }

      case 'ai:stream_cancel': {
        const cancelStreamId = data.streamId as string;
        const streamEntry = activeStreams.get(cancelStreamId);
        if (streamEntry && streamEntry.instanceId === instance.instanceId) {
          streamEntry.controller.abort();
          activeStreams.delete(cancelStreamId);
        }
        respond({ requestId: rid, data: { cancelled: true } });
        break;
      }

      case 'enrich:request': {
        const enrichQuestion = data.question as string;
        if (!enrichQuestion || typeof enrichQuestion !== 'string') {
          respond({
            requestId: rid,
            error: 'question must be a non-empty string',
            code: 'INVALID_REQUEST',
          });
          break;
        }

        const enrichData = data.data;
        const enrichOptions = (data.options ?? {}) as Record<string, unknown>;

        // Serialize data with 50KB cap
        let serialized: string;
        try {
          serialized = JSON.stringify(enrichData);
          if (serialized.length > 50_000) {
            serialized = serialized.slice(0, 50_000) + '... [truncated]';
          }
        } catch {
          respond({
            requestId: rid,
            error: 'Data is not JSON-serializable',
            code: 'INVALID_REQUEST',
          });
          break;
        }

        const enrichPrompt = `You are a data analyst. The user has structured data and a question about it.\n\nDATA:\n${serialized}\n\nQUESTION: ${enrichQuestion}\n\nProvide concise, actionable insights that answer the question. Do NOT reproduce or reformat the original data — only provide your analysis and recommendations.`;

        void dispatchConnector('ai', 'complete', { prompt: enrichPrompt, ...enrichOptions }, appId)
          .then((result) => {
            const text = (result.data as { text?: string })?.text ?? '';
            respond({ requestId: rid, data: { insights: text, data: enrichData } });
          })
          .catch((err: unknown) => {
            logError('bridge', 'enrich:request', err as Error);
            respond({
              requestId: rid,
              error: (err as Error).message || 'Enrich failed',
              code: 'CONNECTOR_ERROR',
            });
          });
        break;
      }

      default: {
        debugLog('bridge', `unhandled request type: ${type}`);
        respond({
          requestId: rid,
          error: `Unknown request type: ${type}`,
          code: 'INVALID_REQUEST',
        });
        break;
      }
    }
  }

  // ==================== AI STREAM CLEANUP ====================

  function stopStreamsForInstance(instanceId: string): void {
    for (const [streamId, entry] of activeStreams) {
      if (entry.instanceId === instanceId) {
        entry.controller.abort();
        activeStreams.delete(streamId);
      }
    }
  }

  // ==================== AUDIO ENGINE ====================

  function ensureAudioEngine(): AudioEngine {
    if (!audioEngine) {
      audioEngine = createAudioEngine();
    }
    return audioEngine;
  }

  // ==================== MEDIA CLEANUP ====================

  /** Build a HandlerContext for cleanup operations (no respond/requestId/data needed) */
  function makeCleanupContext(): HandlerContext {
    return {
      instance: {
        instanceId: '',
        appId: '',
        nonce: '',
        iframe: null as unknown as HTMLIFrameElement,
        handshakeComplete: false,
        pending: new Map(),
        createdAt: 0,
        grantedPermissions: new Set(),
        themeSubscribed: false,
        exportedActionIds: [],
      },
      respond: () => {},
      requestId: '',
      data: {},
      getMediaState: (id) => mediaStates.get(id),
      setMediaState: (id, state) => mediaStates.set(id, state),
      deleteMediaState: (id) => mediaStates.delete(id),
      sendToApp: (inst, msg) => {
        if (bridge) bridge.sendToApp(inst, msg);
      },
      apiResolve,
      getCameraState: (id) => cameraStates.get(id),
      setCameraState: (id, state) => cameraStates.set(id, state),
      deleteCameraState: (id) => {
        cameraStates.delete(id);
      },
      getVideoState: (instId, playerId) => videoStates.get(instId)?.get(playerId),
      setVideoState: (instId, playerId, state) => {
        let playerMap = videoStates.get(instId);
        if (!playerMap) {
          playerMap = new Map();
          videoStates.set(instId, playerMap);
        }
        playerMap.set(playerId, state);
      },
      deleteVideoState: (instId, playerId) => {
        const playerMap = videoStates.get(instId);
        if (playerMap) {
          playerMap.delete(playerId);
          if (playerMap.size === 0) videoStates.delete(instId);
        }
      },
      deleteAllVideoStates: (instId) => {
        videoStates.delete(instId);
      },
      forEachVideoState: (instId, fn) => {
        const playerMap = videoStates.get(instId);
        if (playerMap) {
          playerMap.forEach(fn);
        }
      },
      getGifState: (instId, encoderId) => gifStates.get(instId)?.get(encoderId),
      setGifState: (instId, encoderId, state) => {
        let encoderMap = gifStates.get(instId);
        if (!encoderMap) {
          encoderMap = new Map();
          gifStates.set(instId, encoderMap);
        }
        encoderMap.set(encoderId, state);
      },
      deleteGifState: (instId, encoderId) => {
        const encoderMap = gifStates.get(instId);
        if (encoderMap) {
          encoderMap.delete(encoderId);
          if (encoderMap.size === 0) gifStates.delete(instId);
        }
      },
      deleteAllGifStates: (instId) => {
        gifStates.delete(instId);
      },
      forEachGifState: (instId, fn) => {
        const encoderMap = gifStates.get(instId);
        if (encoderMap) {
          encoderMap.forEach(fn);
        }
      },
      getAudioEngine: () => ensureAudioEngine(),
      getMixerSubscriber: () => mixerSubscriberId,
      setMixerSubscriber: (id) => {
        mixerSubscriberId = id;
      },
      getAppInstance: (id) => instances.get(id),
    };
  }

  function stopMediaForInstance(instanceId: string): void {
    cleanupMediaForInstance(makeCleanupContext(), instanceId);
  }

  // ==================== REFRESH TIMER MANAGEMENT ====================

  function startRefreshTimer(instanceId: string): void {
    const timer = refreshTimers.get(instanceId);
    if (!timer || timer.paused) return;
    // Clear existing interval before creating new one
    if (timer.timerId !== null) {
      clearInterval(timer.timerId);
    }
    timer.timerId = setInterval(() => {
      const inst = instances.get(instanceId);
      if (inst && bridge) {
        bridge.sendToApp(inst, { type: 'refresh' });
      }
    }, timer.intervalMs);
  }

  function stopRefreshForInstance(instanceId: string): void {
    const timer = refreshTimers.get(instanceId);
    if (!timer) return;
    if (timer.timerId !== null) {
      clearInterval(timer.timerId);
      timer.timerId = null;
    }
    refreshTimers.delete(instanceId);
  }

  function pauseAllRefreshTimers(): void {
    for (const [instanceId, timer] of refreshTimers) {
      if (timer.timerId !== null) {
        clearInterval(timer.timerId);
        timer.timerId = null;
      }
      timer.paused = true;
      debugLog('bridge', 'refresh:paused', { instanceId });
    }
  }

  function resumeAllRefreshTimers(): void {
    for (const [instanceId, timer] of refreshTimers) {
      timer.paused = false;
      startRefreshTimer(instanceId);
      // Send immediate refresh on resume so data is up-to-date
      const inst = instances.get(instanceId);
      if (inst && bridge) {
        bridge.sendToApp(inst, { type: 'refresh' });
      }
      debugLog('bridge', 'refresh:resumed', { instanceId });
    }
  }

  // ==================== THEME RELAY ====================

  function relayThemeToSubscribers(): void {
    if (!bridge) return;

    const theme = extractThemeColors();
    for (const instance of instances.values()) {
      if (instance.themeSubscribed && instance.handshakeComplete) {
        bridge.sendToApp(instance, { type: 'theme:update', theme });
      }
    }
  }

  // ==================== LIFECYCLE ====================

  async function launch(
    definition: AppDefinition,
    container: HTMLElement
  ): Promise<AppInstance | null> {
    if (!running) return null;

    // 1. Validate HTML apps
    if (definition.type === 'html' && definition.html) {
      const result = validateAppCode(definition.html);
      if (!result.valid) {
        // Security violations are silent + logged (per user decision)
        logError(
          'bridge',
          `validate:${definition.id}`,
          `Security violations: ${result.violations.join(', ')}`
        );
        return null;
      }
    }

    // 2. Create sandbox with SDK injection (inject user timezone from settings)
    const nonce = crypto.randomUUID();
    const weatherPrefs = (
      typeof localStorage !== 'undefined'
        ? (() => {
            try {
              return JSON.parse(localStorage.getItem('weatherWidgetPrefs') || 'null');
            } catch {
              return null;
            }
          })()
        : null
    ) as { timezone?: string } | null;
    const sdkSource = getSDKSource({ nonce, timezone: weatherPrefs?.timezone });
    const instance = createSandbox({
      appId: definition.id,
      html: definition.html ?? '<div></div>',
      sdkSource,
      nonce,
      permissions: definition.permissions,
    });

    instances.set(instance.instanceId, instance);

    // 2b. Auto-grant permissions before bridge registration
    //     Trusted sources (builtin, generated): all declared permissions auto-granted
    //     Untrusted sources (sideloaded, discovered): only implicit permissions auto-granted
    if (definition.permissions && definition.permissions.length > 0 && permissionManager) {
      const autoGrant = definition.source === 'builtin' || definition.source === 'generated';
      for (const perm of definition.permissions) {
        if (autoGrant || IMPLICIT_PERMISSIONS.has(perm as AppPermission)) {
          await permissionManager.grant(definition.id, perm as AppPermission);
        }
      }
    }

    // 3. Set up container layout
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';

    // Banner mount point (Phase 3 will mount PermissionBanner.vue here)
    const bannerMount = document.createElement('div');
    bannerMount.dataset.permissionBanner = instance.instanceId;
    wrapper.appendChild(bannerMount);

    // Iframe below the banner
    instance.iframe.style.flex = '1';
    wrapper.appendChild(instance.iframe);
    container.appendChild(wrapper);
    instanceContainers.set(instance.instanceId, wrapper);

    // 4. Register with bridge
    if (bridge) {
      bridge.register(instance);
    }

    // 5. Wait for handshake
    try {
      await new Promise<AppInstance>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          handshakeResolvers.delete(instance.instanceId);
          reject(new Error('Handshake timeout'));
        }, HANDSHAKE_TIMEOUT_MS);

        handshakeResolvers.set(instance.instanceId, { resolve, reject, timeoutId });
      });
    } catch {
      // Handshake failed -- clean up
      notifs.push('error', 'Launch Failed', {
        description: `${definition.name} could not start. Try closing other apps and relaunching.`,
      });
      cleanupInstance(instance.instanceId);
      return null;
    }

    // 6. Start watchdog tracking
    if (watchdog) {
      watchdog.track(instance);
    }

    // 7. Register exported actions with skill coordinator
    if (definition.exportedActions && definition.exportedActions.length > 0) {
      try {
        const { useSkillCoordinator } = await import(
          /* @vite-ignore */ '@web/composables/useSkillCoordinator'
        );
        const coordinator = useSkillCoordinator();

        for (const exportedAction of definition.exportedActions) {
          const actionId = `app:${instance.instanceId}:${exportedAction.id}`;

          coordinator.registerAction({
            id: actionId,
            label: `${definition.name}: ${exportedAction.label}`,
            description: exportedAction.description,
            icon: exportedAction.icon,
            accepts: [...exportedAction.accepts],
            produces: exportedAction.produces,
            parameters: exportedAction.parameters ? [...exportedAction.parameters] : undefined,
            handler: async (payload, params) => {
              const startTime = Date.now();

              if (!instances.has(instance.instanceId)) {
                return {
                  success: false,
                  error: 'App is no longer running',
                  duration: Date.now() - startTime,
                };
              }

              if (!bridge) {
                return {
                  success: false,
                  error: 'Bridge not available',
                  duration: Date.now() - startTime,
                };
              }

              try {
                const requestId = crypto.randomUUID();
                await new Promise<unknown>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    instance.pending.delete(requestId);
                    reject(new Error('Action execution timeout'));
                  }, 30000);

                  instance.pending.set(requestId, {
                    resolve: (value: unknown) => {
                      clearTimeout(timeout);
                      resolve(value);
                    },
                    reject: (error: unknown) => {
                      clearTimeout(timeout);
                      reject(error);
                    },
                    timeoutId: timeout,
                  });

                  bridge!.sendToApp(instance, {
                    type: 'action:execute',
                    requestId,
                    actionId: exportedAction.id,
                    payload: payload.data,
                    params,
                  });
                });

                return { success: true, duration: Date.now() - startTime };
              } catch (err) {
                return {
                  success: false,
                  error: err instanceof Error ? err.message : 'Action execution failed',
                  duration: Date.now() - startTime,
                };
              }
            },
            onUnregister: () => {
              debugLog('bridge', 'unregister-exported-action', {
                instanceId: instance.instanceId,
                actionId,
              });
            },
          });

          instance.exportedActionIds.push(actionId);
        }

        debugLog('bridge', 'registered-exported-actions', {
          instanceId: instance.instanceId,
          count: instance.exportedActionIds.length,
        });
      } catch (err) {
        logError(
          'bridge',
          'register-exported-actions',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    // 8. Emit lifecycle event
    bus.emit('app:launched', {
      appId: definition.id,
      instanceId: instance.instanceId,
      appName: definition.name,
    });

    debugLog('bridge', 'app:launched', { appId: definition.id, instanceId: instance.instanceId });

    return instance;
  }

  function close(
    instanceId: string,
    reason: 'user' | 'crash' | 'timeout' | 'security' = 'user'
  ): void {
    const instance = instances.get(instanceId);
    if (!instance) return;

    const appName = instance.appId;

    // For user-initiated close, give app a chance to save state
    if (reason === 'user' && bridge) {
      bridge.sendToApp(instance, { type: 'app:close' });
      setTimeout(() => {
        void finalizeClose(instanceId, appName, reason);
      }, GRACEFUL_CLOSE_MS);
    } else {
      // Crash, timeout, security -- close immediately
      void finalizeClose(instanceId, appName, reason);
    }
  }

  async function finalizeClose(
    instanceId: string,
    appName: string,
    reason: 'user' | 'crash' | 'timeout' | 'security'
  ): Promise<void> {
    const instance = instances.get(instanceId);
    if (!instance) return;

    // Remove from all subscription Sets
    chatMessageSubscribers.delete(instanceId);
    chatStreamingSubscribers.delete(instanceId);
    chatConversationSubscribers.delete(instanceId);
    contextLifecycleSubscribers.delete(instanceId);
    keyboardSubscribers.delete(instanceId);
    for (const [channel, subs] of broadcastSubscriptions) {
      subs.delete(instanceId);
      if (subs.size === 0) broadcastSubscriptions.delete(channel);
    }

    // Unregister exported actions before cleanup
    if (instance.exportedActionIds.length > 0) {
      try {
        const { useSkillCoordinator } = await import(
          /* @vite-ignore */ '@web/composables/useSkillCoordinator'
        );
        const coordinator = useSkillCoordinator();

        for (const actionId of instance.exportedActionIds) {
          coordinator.unregisterAction(actionId);
        }

        debugLog('bridge', 'unregistered-exported-actions', {
          instanceId,
          count: instance.exportedActionIds.length,
        });
      } catch (err) {
        logError(
          'bridge',
          'unregister-exported-actions',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }

    // Dismiss any active dialogs for this instance
    dialogManager.dismissForInstance(instanceId);

    // Clean up toast rate limiting state
    toastTimestamps.delete(instanceId);

    // Clean up refresh timers
    stopRefreshForInstance(instanceId);

    // Clean up media streams
    stopMediaForInstance(instanceId);

    // Clean up active AI streams
    stopStreamsForInstance(instanceId);

    // Clean up hand tracking relay
    const relayCleanup = inputRelayCleanups.get(instanceId);
    if (relayCleanup) {
      relayCleanup();
      inputRelayCleanups.delete(instanceId);
    }

    // Untrack from watchdog
    if (watchdog) {
      watchdog.untrack(instanceId);
    }

    // Unregister from bridge (rejects pending requests)
    if (bridge) {
      bridge.unregister(instanceId);
    }

    // Destroy sandbox (removes iframe from DOM)
    destroySandbox(instance);

    // Remove wrapper from container
    const wrapper = instanceContainers.get(instanceId);
    if (wrapper?.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
    instanceContainers.delete(instanceId);
    instances.delete(instanceId);

    // Clear handshake resolver if still pending
    const resolver = handshakeResolvers.get(instanceId);
    if (resolver) {
      clearTimeout(resolver.timeoutId);
      resolver.reject(new Error('App closed'));
      handshakeResolvers.delete(instanceId);
    }

    // Toast based on reason
    switch (reason) {
      case 'crash':
        notifs.push('error', 'App Crashed', {
          description: `${appName} stopped unexpectedly and was closed.`,
        });
        break;
      case 'timeout':
        notifs.push('error', 'App Timed Out', {
          description: `${appName} stopped responding and was closed.`,
        });
        break;
      case 'security':
        // Silent per user decision, but log
        logError('bridge', `security:close:${instanceId}`, 'App closed due to security violation');
        break;
      case 'user':
        // No toast for user-initiated close
        break;
    }

    // Emit lifecycle event
    bus.emit('app:closed', {
      appId: instance.appId,
      instanceId,
      appName,
      reason,
    });

    debugLog('bridge', 'app:closed', { instanceId, reason });
  }

  function cleanupInstance(instanceId: string): void {
    const instance = instances.get(instanceId);
    if (!instance) return;

    // Clean up hand tracking relay if set up
    const relayCleanup = inputRelayCleanups.get(instanceId);
    if (relayCleanup) {
      relayCleanup();
      inputRelayCleanups.delete(instanceId);
    }

    if (bridge) {
      bridge.unregister(instanceId);
    }

    destroySandbox(instance);

    const wrapper = instanceContainers.get(instanceId);
    if (wrapper?.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
    instanceContainers.delete(instanceId);
    instances.delete(instanceId);
  }

  function getInstance(instanceId: string): AppInstance | undefined {
    return instances.get(instanceId);
  }

  function getRunningInstances(): ReadonlyArray<AppInstance> {
    return Array.from(instances.values());
  }

  function getPermissionManagerInstance(): PermissionManager {
    if (!permissionManager) {
      throw new Error('App manager not started');
    }
    return permissionManager;
  }

  function getPermissionBanner(): PermissionBannerState {
    if (!banner) {
      throw new Error('App manager not started');
    }
    return banner;
  }

  // ==================== PUSH SUBSCRIPTION HELPERS ====================

  function pushToSubscribers(subscriberSet: Set<string>, message: Record<string, unknown>): void {
    if (!bridge) return;
    for (const subId of subscriberSet) {
      const inst = instances.get(subId);
      if (inst) {
        bridge.sendToApp(inst, message);
      }
    }
  }

  function pushContextLifecycle(
    type: 'context:app_opened' | 'context:app_closed',
    ev: { appId: string; instanceId: string; appName: string }
  ): void {
    pushToSubscribers(contextLifecycleSubscribers, {
      type,
      app: { appId: ev.appId, instanceId: ev.instanceId, name: ev.appName },
    });
  }

  function setupChatWatchers(): void {
    const store = useChatStore();

    // Watch messages.length — push new messages to subscribers
    // Pinia unwraps refs, so store.messages is ChatMessage[] directly
    let lastMessageCount = store.messages.length;
    const messagesWatcher = watch(
      () => store.messages.length,
      (newLen) => {
        if (newLen > lastMessageCount && chatMessageSubscribers.size > 0) {
          // Push all new messages since last check
          const newMessages = store.messages.slice(lastMessageCount);
          for (const msg of newMessages) {
            pushToSubscribers(chatMessageSubscribers, {
              type: 'chat:message',
              message: {
                id: msg.id,
                sender: msg.sender,
                text: msg.text,
                createdAt: msg.createdAt,
              },
            });
          }
        }
        lastMessageCount = newLen;
      }
    );
    chatWatchers.push(messagesWatcher);

    // Streaming buffer — throttled 100ms interval timer during active streaming
    const streamingActiveWatcher = watch(
      () => store.streaming.active,
      (active) => {
        if (active && chatStreamingSubscribers.size > 0) {
          // Start throttled push timer
          if (streamingTimerId === null) {
            streamingTimerId = setInterval(() => {
              if (!store.streaming.active) {
                // Streaming ended — send final update and stop timer
                pushToSubscribers(chatStreamingSubscribers, {
                  type: 'chat:streaming',
                  buffer: store.streaming.buffer,
                  active: false,
                });
                if (streamingTimerId !== null) {
                  clearInterval(streamingTimerId);
                  streamingTimerId = null;
                }
                return;
              }
              pushToSubscribers(chatStreamingSubscribers, {
                type: 'chat:streaming',
                buffer: store.streaming.buffer,
                active: true,
              });
            }, 100);
          }
        } else if (!active && streamingTimerId !== null) {
          // Streaming ended while timer running — send final + stop
          pushToSubscribers(chatStreamingSubscribers, {
            type: 'chat:streaming',
            buffer: store.streaming.buffer,
            active: false,
          });
          clearInterval(streamingTimerId);
          streamingTimerId = null;
        }
      }
    );
    chatWatchers.push(streamingActiveWatcher);

    // Watch activeConversationId — push conversation changes
    const convWatcher = watch(
      () => chatActiveConversationId.value,
      (newId) => {
        if (chatConversationSubscribers.size > 0) {
          pushToSubscribers(chatConversationSubscribers, {
            type: 'chat:conversation_changed',
            conversationId: newId,
            title: chatConversationTitle.value,
          });
        }
      }
    );
    chatWatchers.push(convWatcher);
  }

  function teardownChatWatchers(): void {
    for (const stopWatch of chatWatchers) {
      stopWatch();
    }
    chatWatchers = [];
    if (streamingTimerId !== null) {
      clearInterval(streamingTimerId);
      streamingTimerId = null;
    }
  }

  // ==================== START / STOP ====================

  function start(): void {
    if (running) return;
    running = true;

    // 1. Create permission banner
    banner = usePermissionBanner();

    // 2. Create permission manager
    permissionManager = createPermissionManager();

    // 3. Create bridge handler with callbacks
    bridge = createBridgeHandler({
      onHandshakeComplete: (instance: AppInstance) => {
        // Push initial theme colors so --prvctice-* CSS vars exist inside the iframe
        bridge!.sendToApp(instance, {
          type: 'theme:update',
          theme: extractThemeColors(),
        });
        // Auto-subscribe the instance so future theme changes are relayed
        instance.themeSubscribed = true;

        // Trigger iframe content entrance animation
        bridge!.sendToApp(instance, { type: 'animate:entrance' });

        // Set up hand tracking relay for this instance
        const handTracking = getHandTrackingSystem();
        const handMoveHandler = (event: HandMoveEvent) => {
          bridge!.sendToApp(instance, {
            type: 'input:move',
            x: event.x,
            y: event.y,
            rawX: event.rawX,
            rawY: event.rawY,
            source: 'hand',
          });
        };
        handTracking.subscribe('hand:move', handMoveHandler);
        inputRelayCleanups.set(instance.instanceId, () => {
          handTracking.unsubscribe('hand:move', handMoveHandler);
        });

        const resolver = handshakeResolvers.get(instance.instanceId);
        if (resolver) {
          clearTimeout(resolver.timeoutId);
          handshakeResolvers.delete(instance.instanceId);
          resolver.resolve(instance);
        }
      },

      onRequest: handleRequest,

      checkPermission: (appId: string, permission: string) => {
        return permissionManager!.check(appId, permission as AppPermission);
      },

      onPermissionPrompt: (
        appId: string,
        permission: string,
        onResult: (granted: boolean) => void
      ) => {
        const appName = getAppNameFromId(appId);
        void banner!.requestPermission(appName, permission as AppPermission).then((granted) => {
          if (granted) {
            void permissionManager!.grant(appId, permission as AppPermission);
          }
          onResult(granted);
        });
      },

      onPong: (instance: AppInstance) => {
        if (watchdog) {
          watchdog.recordPong(instance.instanceId);
        }
      },
    });

    // 4. Create watchdog
    watchdog = createWatchdog({
      sendPing: (instance: AppInstance) => {
        if (bridge) {
          bridge.sendToApp(instance, { type: 'ping', nonce: instance.nonce });
        }
      },
      onTimeout: (instance: AppInstance) => {
        close(instance.instanceId, 'timeout');
      },
      onMemoryWarning: (usedBytes: number, thresholdBytes: number) => {
        const usedMB = Math.round(usedBytes / 1024 / 1024);
        const thresholdMB = Math.round(thresholdBytes / 1024 / 1024);
        debugLog('bridge', 'memory:warning', `JS heap: ${usedMB}MB (threshold: ${thresholdMB}MB)`);
      },
    });

    // 5. Subscribe to theme changes for relay
    const themeHandler = () => {
      relayThemeToSubscribers();
    };
    bus.on('theme:change', themeHandler);
    themeUnsubscribe = () => {
      bus.off('theme:change', themeHandler);
    };

    // 6. Chat store watchers for push subscriptions
    setupChatWatchers();

    // 7. App lifecycle events for context subscribers
    const launchHandler = (ev: { appId: string; instanceId: string; appName: string }) => {
      pushContextLifecycle('context:app_opened', ev);
    };
    const closeHandler = (ev: { appId: string; instanceId: string; appName: string }) => {
      pushContextLifecycle('context:app_closed', ev);
    };
    bus.on('app:launched', launchHandler);
    bus.on('app:closed', closeHandler);

    // Extend themeUnsubscribe to also clean up lifecycle listeners
    const baseThemeUnsub = themeUnsubscribe;
    themeUnsubscribe = () => {
      if (baseThemeUnsub) baseThemeUnsub();
      bus.off('app:launched', launchHandler);
      bus.off('app:closed', closeHandler);
    };

    // 8. Page Visibility API — pause/resume refresh timers when tab is hidden
    visibilityHandler = () => {
      if (document.hidden) {
        pauseAllRefreshTimers();
      } else {
        resumeAllRefreshTimers();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    // 9. App focus tracking + keyboard relay
    //    Listen for app:focused events from window manager to track which
    //    appManager instance is active and relay app:focus / app:blur messages.
    let focusedAppInstanceId: string | null = null;

    const focusHandler = (ev: { appId: string; instanceId: string; appName: string }) => {
      if (!bridge) return;

      // The instanceId from app:focused is the windowManager's ID.
      // Find the matching appManager instance by appId.
      let newFocused: string | null = null;
      for (const inst of instances.values()) {
        if (inst.appId === ev.appId) {
          newFocused = inst.instanceId;
          break;
        }
      }

      if (newFocused === focusedAppInstanceId) return;

      // Blur previous
      if (focusedAppInstanceId) {
        const prevInst = instances.get(focusedAppInstanceId);
        if (prevInst) {
          bridge.sendToApp(prevInst, { type: 'app:blur' });
        }
      }

      // Focus new
      focusedAppInstanceId = newFocused;
      if (focusedAppInstanceId) {
        const newInst = instances.get(focusedAppInstanceId);
        if (newInst) {
          bridge.sendToApp(newInst, { type: 'app:focus' });
        }
      }
    };
    bus.on('app:focused', focusHandler);

    // Keyboard event relay: forward keydown/keyup to the focused app
    // if it has subscribed to keyboard events. Skip when user is typing
    // in an input/textarea/contenteditable element.
    function isTypingInInput(): boolean {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if ((active as HTMLElement).isContentEditable) return true;
      return false;
    }

    function extractKeyEvent(e: KeyboardEvent): Record<string, unknown> {
      return {
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
      };
    }

    keyboardDownHandler = (e: KeyboardEvent) => {
      if (!bridge || !focusedAppInstanceId) return;
      if (!keyboardSubscribers.has(focusedAppInstanceId)) return;
      if (isTypingInInput()) return;
      const inst = instances.get(focusedAppInstanceId);
      if (inst) {
        bridge.sendToApp(inst, { type: 'input:keydown', event: extractKeyEvent(e) });
      }
    };

    keyboardUpHandler = (e: KeyboardEvent) => {
      if (!bridge || !focusedAppInstanceId) return;
      if (!keyboardSubscribers.has(focusedAppInstanceId)) return;
      if (isTypingInInput()) return;
      const inst = instances.get(focusedAppInstanceId);
      if (inst) {
        bridge.sendToApp(inst, { type: 'input:keyup', event: extractKeyEvent(e) });
      }
    };

    document.addEventListener('keydown', keyboardDownHandler);
    document.addEventListener('keyup', keyboardUpHandler);

    // Extend themeUnsubscribe to also clean up focus + keyboard listeners
    const baseFocusUnsub = themeUnsubscribe;
    themeUnsubscribe = () => {
      if (baseFocusUnsub) baseFocusUnsub();
      bus.off('app:focused', focusHandler);
    };

    // 10. Start bridge and watchdog
    bridge.start();
    watchdog.start();

    debugLog('bridge', 'appManager:started');
  }

  function stop(): void {
    if (!running) return;
    running = false;

    // Close all running instances
    for (const instanceId of Array.from(instances.keys())) {
      finalizeClose(instanceId, instances.get(instanceId)?.appId ?? 'App', 'user');
    }

    // Stop bridge
    if (bridge) {
      bridge.stop();
      bridge = null;
    }

    // Stop watchdog
    if (watchdog) {
      watchdog.stop();
      watchdog = null;
    }

    // Unsubscribe from events
    if (themeUnsubscribe) {
      themeUnsubscribe();
      themeUnsubscribe = null;
    }

    // Tear down chat watchers and streaming timer
    teardownChatWatchers();

    // Clear subscription tracking
    chatMessageSubscribers.clear();
    chatStreamingSubscribers.clear();
    chatConversationSubscribers.clear();
    contextLifecycleSubscribers.clear();
    keyboardSubscribers.clear();
    broadcastSubscriptions.clear();

    // Remove visibility listener
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }

    // Remove keyboard listeners
    if (keyboardDownHandler) {
      document.removeEventListener('keydown', keyboardDownHandler);
      keyboardDownHandler = null;
    }
    if (keyboardUpHandler) {
      document.removeEventListener('keyup', keyboardUpHandler);
      keyboardUpHandler = null;
    }

    // Clear handshake resolvers
    for (const [id, resolver] of handshakeResolvers) {
      clearTimeout(resolver.timeoutId);
      resolver.reject(new Error('App manager stopped'));
      handshakeResolvers.delete(id);
    }

    // Dispose audio engine
    if (audioEngine) {
      audioEngine.dispose();
      audioEngine = null;
    }
    mixerSubscriberId = null;

    permissionManager = null;
    banner = null;

    debugLog('bridge', 'appManager:stopped');
  }

  function sendMessage(instanceId: string, message: Record<string, unknown>): void {
    const instance = instances.get(instanceId);
    if (instance && bridge) {
      bridge.sendToApp(instance, message);
    }
  }

  function getAppNameFromId(appId: string): string {
    for (const instance of instances.values()) {
      if (instance.appId === appId) {
        return appId; // Phase 3 will map appId to definition.name
      }
    }
    return appId;
  }

  return {
    launch,
    close,
    getInstance,
    getRunningInstances,
    getPermissionManager: getPermissionManagerInstance,
    getPermissionBanner,
    getDialogManager: () => dialogManager,
    sendMessage,
    start,
    stop,
  };
}
