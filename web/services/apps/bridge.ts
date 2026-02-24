/**
 * Parent-side Bridge Handler
 *
 * Manages postMessage communication between the host and sandboxed iframes.
 * Validates every message with event.source + nonce authentication.
 * Dispatches requests through a permission checking pipeline.
 *
 * Messages from unknown sources or with wrong nonces are silently dropped.
 */

import type { AppInstance, AppPermission, BridgeResponse } from '@web/types/apps';
import { SDK_VERSION } from '@/contracts/sdk-surface.js';

// ==================== PERMISSION MAPPING ====================

const PERMISSION_MAP: Readonly<Record<string, AppPermission>> = {
  'storage:get': 'connector:storage',
  'storage:set': 'connector:storage',
  'storage:delete': 'connector:storage',
  'storage:usage': 'connector:storage',
  'theme:get': 'theme:read',
  'theme:subscribe': 'theme:subscribe',
  'media:microphone:start': 'media:microphone',
  'media:microphone:stop': 'media:microphone',
  'media:microphone:params': 'media:microphone',
  'chat:subscribe:messages': 'connector:chat:read',
  'chat:subscribe:streaming': 'connector:chat:read',
  'chat:subscribe:conversation': 'connector:chat:read',
  'broadcast:subscribe': 'connector:broadcast',
  'broadcast:unsubscribe': 'connector:broadcast',
  'context:subscribe:lifecycle': 'connector:context',
  'media:audio:load': 'media:playback',
  'media:image:load': 'media:playback',
  'media:download': 'media:playback',
  'media:saveUrl': 'media:playback',
  'media:camera:start': 'media:camera',
  'media:camera:capture': 'media:camera',
  'media:camera:stop': 'media:camera',
  'media:video:load': 'media:playback',
  'media:video:play': 'media:playback',
  'media:video:pause': 'media:playback',
  'media:video:seek': 'media:playback',
  'media:video:seekAndCapture': 'media:playback',
  'media:video:unload': 'media:playback',
  'media:gif:create': 'media:playback',
  'media:gif:addFrame': 'media:playback',
  'media:gif:finish': 'media:playback',
  'media:gif:cancel': 'media:playback',
  'ai:stream': 'connector:ai',
  'ai:stream_cancel': 'connector:ai',
  'enrich:request': 'connector:ai',
  'mixer:connect': 'media:mixer',
  'mixer:disconnect': 'media:mixer',
  'mixer:noteOn': 'media:mixer',
  'mixer:noteOff': 'media:mixer',
  'mixer:tone': 'media:mixer',
  'mixer:allNotesOff': 'media:mixer',
  'mixer:getState': 'media:mixer',
  'mixer:setGain': 'media:mixer',
  'mixer:setPan': 'media:mixer',
  'mixer:setMute': 'media:mixer',
  'mixer:setSolo': 'media:mixer',
  'mixer:setMasterGain': 'media:mixer',
  'mixer:setMasterMute': 'media:mixer',
  'mixer:startRecording': 'media:mixer',
  'mixer:stopRecording': 'media:mixer',
  'mixer:subscribeState': 'media:mixer',
  'mixer:setReverbSend': 'media:mixer',
  'mixer:setRecordArm': 'media:mixer',
  'mixer:setBpm': 'media:mixer',
  'mixer:setMetronome': 'media:mixer',
  'mixer:transportPlay': 'media:mixer',
  'mixer:transportStop': 'media:mixer',
  'mixer:getAnalyserData': 'media:mixer',
  'mixer:setVoiceFrequency': 'media:mixer',
  'mixer:setVoiceGain': 'media:mixer',
  'mixer:synthDrumVoice': 'media:mixer',
  'mixer:playRecording': 'media:mixer',
  'mixer:pauseRecording': 'media:mixer',
  'mixer:stopPlayback': 'media:mixer',
  'mixer:seekRecording': 'media:mixer',
  'mixer:clearRecording': 'media:mixer',
  'mixer:removeTrack': 'media:mixer',
  'mixer:setTrackMute': 'media:mixer',
  'mixer:getPeakLevels': 'media:mixer',
  'mixer:setLoop': 'media:mixer',
  'mixer:clearAllTracks': 'media:mixer',
  'mixer:seekTransport': 'media:mixer',
  'mixer:exportTrack': 'media:mixer',
};

// ==================== TYPES ====================

export interface BridgeHandlerOptions {
  readonly onHandshakeComplete?: (instance: AppInstance) => void;
  readonly onRequest?: (
    instance: AppInstance,
    type: string,
    data: Record<string, unknown>,
    respond: (response: BridgeResponse) => void
  ) => void;
  readonly checkPermission?: (
    appId: string,
    permission: string
  ) => Promise<'granted' | 'denied' | 'prompt'>;
  readonly onPermissionPrompt?: (
    appId: string,
    permission: string,
    onResult: (granted: boolean) => void
  ) => void;
  readonly onPong?: (instance: AppInstance) => void;
}

export interface BridgeHandler {
  readonly register: (instance: AppInstance) => void;
  readonly unregister: (instanceId: string) => void;
  readonly start: () => void;
  readonly stop: () => void;
  readonly sendToApp: (instance: AppInstance, message: Record<string, unknown>) => void;
}

// ==================== BRIDGE HANDLER ====================

/**
 * Create a parent-side bridge handler that authenticates and dispatches
 * messages from sandboxed iframes.
 *
 * The handler validates event.source and nonce on every message.
 * Unknown sources and nonce mismatches are silently dropped.
 */
export function createBridgeHandler(options: BridgeHandlerOptions = {}): BridgeHandler {
  const instances = new Map<string, AppInstance>();
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  let running = false;

  function getInstanceBySource(source: MessageEventSource | null): AppInstance | undefined {
    if (source === null) return undefined;
    for (const instance of instances.values()) {
      if (instance.iframe.contentWindow === source) {
        return instance;
      }
    }
    return undefined;
  }

  function sendToApp(instance: AppInstance, message: Record<string, unknown>): void {
    const contentWindow = instance.iframe.contentWindow;
    if (contentWindow === null) {
      // iframe removed from DOM but instance not yet cleaned up (Pitfall 5)
      return;
    }
    // Target origin '*' because sandboxed iframes have "null" origin
    contentWindow.postMessage(message, '*');
  }

  function handlePermissionAndDispatch(
    instance: AppInstance,
    type: string,
    data: Record<string, unknown>,
    requestId: string
  ): void {
    // connector:request messages derive permission from the connector field
    let permission: AppPermission | undefined;
    if (type === 'connector:request' && typeof data.connector === 'string') {
      // Chat connector: split read/send permissions based on method
      if (data.connector === 'chat') {
        permission =
          data.method === 'sendMessage'
            ? ('connector:chat:send' as AppPermission)
            : ('connector:chat:read' as AppPermission);
      } else {
        permission = `connector:${data.connector}` as AppPermission;
      }
    } else {
      permission = PERMISSION_MAP[type];
    }

    const respond = (response: BridgeResponse): void => {
      if (!running) return;
      sendToApp(instance, { ...response, requestId });
    };

    // If no permission mapping exists, dispatch directly (future connectors
    // handle their own permissions through the permission manager)
    if (!permission) {
      if (options.onRequest) {
        options.onRequest(instance, type, data, respond);
      }
      return;
    }

    if (!options.checkPermission) {
      // No permission checker provided -- dispatch directly
      if (options.onRequest) {
        options.onRequest(instance, type, data, respond);
      }
      return;
    }

    void options.checkPermission(instance.appId, permission).then((result) => {
      if (!running) return;

      if (result === 'granted') {
        if (options.onRequest) {
          options.onRequest(instance, type, data, respond);
        }
        return;
      }

      if (result === 'denied') {
        respond({
          requestId,
          error: 'Permission denied',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      if (result === 'prompt') {
        if (options.onPermissionPrompt) {
          // Hold the request pending while permission prompt is shown (Pitfall 6)
          // The 30s SDK timeout provides a natural upper bound
          options.onPermissionPrompt(instance.appId, permission, (granted: boolean) => {
            if (!running) return;

            if (granted) {
              if (options.onRequest) {
                options.onRequest(instance, type, data, respond);
              }
            } else {
              respond({
                requestId,
                error: 'Permission denied',
                code: 'PERMISSION_DENIED',
              });
            }
          });
        } else {
          // No prompt handler, deny by default
          respond({
            requestId,
            error: 'Permission denied',
            code: 'PERMISSION_DENIED',
          });
        }
      }
    });
  }

  function onMessage(event: MessageEvent): void {
    if (!running) return;

    // 1. Source validation: find instance by event.source
    const instance = getInstanceBySource(event.source);
    if (!instance) return; // Unknown source, drop silently (BRDG-06)

    // 2. Data validation: must be a non-null object with a nonce string
    const data = event.data;
    if (data === null || typeof data !== 'object') return;
    if (typeof data.nonce !== 'string') return;

    // 3. Nonce validation: must match instance nonce
    if (data.nonce !== instance.nonce) return; // Wrong nonce, drop silently (BRDG-06)

    const type: string = data.type;

    // 4. Pre-handshake gate: only accept bridge:hello before handshake
    if (!instance.handshakeComplete && type !== 'bridge:hello') return;

    // 5. Dispatch by type
    switch (type) {
      case 'bridge:hello': {
        instance.handshakeComplete = true;
        sendToApp(instance, { type: 'bridge:ready', sdkVersion: SDK_VERSION });
        if (options.onHandshakeComplete) {
          options.onHandshakeComplete(instance);
        }
        break;
      }

      case 'pong': {
        if (options.onPong) {
          options.onPong(instance);
        }
        break;
      }

      case 'theme:subscribe': {
        instance.themeSubscribed = true;
        break;
      }

      case 'app:resize':
      case 'app:title':
      case 'app:openUrl':
      case 'app:requestRefresh':
      case 'app:requestNow':
      case 'app:stopRefresh':
      case 'input:subscribe:keyboard':
      case 'media-tools:download': {
        // Fire-and-forget messages from app, forwarded for window manager
        if (options.onRequest) {
          const messageData = { ...data } as Record<string, unknown>;
          options.onRequest(instance, type, messageData, () => {
            // No response needed for fire-and-forget messages
          });
        }
        break;
      }

      // Subscription messages — routed through handlePermissionAndDispatch
      // so the permission system checks access (chat:read, broadcast, context)
      // before appManager registers the subscription.
      case 'chat:subscribe:messages':
      case 'chat:subscribe:streaming':
      case 'chat:subscribe:conversation':
      case 'broadcast:subscribe':
      case 'broadcast:unsubscribe':
      case 'context:subscribe:lifecycle': {
        if (typeof data.requestId === 'string') {
          const messageData = { ...data } as Record<string, unknown>;
          handlePermissionAndDispatch(instance, type, messageData, data.requestId);
        }
        break;
      }

      default: {
        // Any message with a requestId is a bridge request expecting a response
        if (typeof data.requestId === 'string') {
          const messageData = { ...data } as Record<string, unknown>;
          handlePermissionAndDispatch(instance, type, messageData, data.requestId);
        }
        // Messages without requestId that aren't handled above are dropped
        break;
      }
    }
  }

  function register(instance: AppInstance): void {
    instances.set(instance.instanceId, instance);
  }

  function unregister(instanceId: string): void {
    const instance = instances.get(instanceId);
    if (instance) {
      // Reject all pending requests for this instance
      for (const [requestId, pending] of instance.pending) {
        clearTimeout(pending.timeoutId);
        pending.reject({ code: 'TIMEOUT', message: 'App closed' });
        instance.pending.delete(requestId);
      }
      instances.delete(instanceId);
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    messageHandler = onMessage;
    window.addEventListener('message', messageHandler);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (messageHandler) {
      window.removeEventListener('message', messageHandler);
      messageHandler = null;
    }
  }

  return {
    register,
    unregister,
    start,
    stop,
    sendToApp,
  };
}
