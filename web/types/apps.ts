/**
 * App Sandbox System Types
 *
 * Type definitions for the sandboxed app runtime: app definitions,
 * running instances, bridge protocol messages, permissions, and validation.
 */

import type { PayloadType, ParameterDefinition } from '@web/types/skills';

// ==================== APP DEFINITION ====================

export type AppType = 'html' | 'vue-internal';

export type AppSource = 'builtin' | 'generated' | 'discovered' | 'sideloaded';

export type SizePreset = 'square' | 'wide' | 'tall' | 'large';

export const SIZE_PRESETS: Readonly<
  Record<
    SizePreset,
    {
      readonly default: { readonly w: number; readonly h: number };
      readonly min: { readonly w: number; readonly h: number };
      readonly max: { readonly w: number; readonly h: number };
      readonly aspect: readonly [number, number];
    }
  >
> = {
  square: {
    default: { w: 200, h: 200 },
    min: { w: 200, h: 200 },
    max: { w: 200, h: 200 },
    aspect: [1, 1],
  },
  wide: {
    default: { w: 400, h: 200 },
    min: { w: 400, h: 200 },
    max: { w: 400, h: 200 },
    aspect: [2, 1],
  },
  tall: {
    default: { w: 200, h: 400 },
    min: { w: 200, h: 400 },
    max: { w: 200, h: 400 },
    aspect: [1, 2],
  },
  large: {
    default: { w: 400, h: 400 },
    min: { w: 400, h: 400 },
    max: { w: 400, h: 400 },
    aspect: [1, 1],
  },
};

/** Content category for gallery grouping */
export type AppCategory = 'apps' | 'games' | 'creative' | 'utilities';

/** Ordered list of categories for consistent display across launcher and gallery */
export const CATEGORY_ORDER: readonly { readonly key: AppCategory; readonly label: string }[] = [
  { key: 'apps', label: 'Apps' },
  { key: 'games', label: 'Games' },
  { key: 'creative', label: 'Creative' },
  { key: 'utilities', label: 'Utilities' },
] as const;

/** Infer a category for apps that lack an explicit one */
export function inferAppCategory(app: AppDefinition): AppCategory {
  if (app.category) return app.category;

  const perms = app.permissions ?? [];
  const permStr = perms.join(',');

  const text = ((app.name ?? '') + ' ' + (app.description ?? '')).toLowerCase();
  if (/\b(game|pong|snake|tetris|arcade|puzzle|solitaire|brick)\b/.test(text)) return 'games';
  if (
    permStr.includes('media:mixer') ||
    permStr.includes('media:microphone') ||
    permStr.includes('media:camera')
  )
    return 'creative';
  if (
    /\b(synth|audio|sampl|drum|piano|metronom|music|tone|beat|photo|camera|canvas|editor)\b/.test(
      text
    )
  )
    return 'creative';
  if (/\b(download|timer|file|pdf|convert)\b/.test(text)) return 'utilities';

  return 'apps';
}

export interface AppDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: AppType;
  readonly description?: string;
  readonly permissions: readonly AppPermission[];
  readonly html?: string;
  readonly component?: string;
  readonly icon?: string;
  readonly defaultSize?: { readonly w: number; readonly h: number };
  readonly minSize?: { readonly w: number; readonly h: number };
  readonly maxSize?: { readonly w: number; readonly h: number };
  readonly sizePreset?: SizePreset;
  /** Hide the titlebar entirely — content fills edge-to-edge. Close button floats as overlay. */
  readonly chromeless?: boolean;
  /** Enable magnetic snap to input bar (default: false) */
  readonly magnetic?: boolean;
  /** Human-readable explanation of why this app was suggested (populated by recursive learning) */
  readonly observationContext?: string;
  readonly source: AppSource;
  readonly exportedActions?: readonly ExportedAction[];
  /** Content category for gallery grouping */
  readonly category?: AppCategory;
  /** Timestamp of last launch (Date.now()) */
  readonly lastOpened?: number;
  /** Total number of times this app has been opened */
  readonly openCount?: number;
  /** Whether this app is pinned to the home screen */
  readonly pinned?: boolean;
  /** App ID of a companion app to auto-open alongside this one */
  readonly companion?: string;
}

export interface ExportedAction {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly accepts: readonly PayloadType[];
  readonly produces: PayloadType;
  readonly parameters?: readonly ParameterDefinition[];
}

// ==================== APP INSTANCE ====================

export interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

export interface AppInstance {
  readonly instanceId: string;
  readonly appId: string;
  readonly nonce: string;
  readonly iframe: HTMLIFrameElement;
  handshakeComplete: boolean;
  readonly pending: Map<string, PendingRequest>;
  readonly createdAt: number;
  readonly grantedPermissions: Set<string>;
  themeSubscribed: boolean;
  exportedActionIds: string[];
}

// ==================== WINDOW ENTRY ====================

export interface WindowEntry {
  readonly instanceId: string;
  readonly appId: string;
  readonly definition: AppDefinition;
  /** appManager's internal instanceId (may differ from windowManager's) */
  readonly appInstanceId?: string;
}

// ==================== BRIDGE MESSAGES ====================

export interface BridgeMessageBase {
  readonly nonce: string;
  readonly type: string;
}

export interface BridgeHello extends BridgeMessageBase {
  readonly type: 'bridge:hello';
}

export interface BridgeStorageGet extends BridgeMessageBase {
  readonly type: 'storage:get';
  readonly requestId: string;
  readonly key: string;
}

export interface BridgeStorageSet extends BridgeMessageBase {
  readonly type: 'storage:set';
  readonly requestId: string;
  readonly key: string;
  readonly value: unknown;
}

export interface BridgeStorageDelete extends BridgeMessageBase {
  readonly type: 'storage:delete';
  readonly requestId: string;
  readonly key: string;
}

export interface BridgeThemeGet extends BridgeMessageBase {
  readonly type: 'theme:get';
  readonly requestId: string;
}

export interface BridgeThemeSubscribe extends BridgeMessageBase {
  readonly type: 'theme:subscribe';
}

export interface BridgeAppResize extends BridgeMessageBase {
  readonly type: 'app:resize';
  readonly width: number;
  readonly height: number;
}

export interface BridgeAppTitle extends BridgeMessageBase {
  readonly type: 'app:title';
  readonly title: string;
}

export interface BridgePong extends BridgeMessageBase {
  readonly type: 'pong';
}

export interface BridgeConnectorRequest extends BridgeMessageBase {
  readonly type: 'connector:request';
  readonly requestId: string;
  readonly connector: string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface BridgeMediaMicStart extends BridgeMessageBase {
  readonly type: 'media:microphone:start';
  readonly requestId: string;
  readonly mode: 'record' | 'visualize' | 'both';
}

export interface BridgeMediaMicStop extends BridgeMessageBase {
  readonly type: 'media:microphone:stop';
  readonly requestId: string;
}

export interface BridgeActionExecute extends BridgeMessageBase {
  readonly type: 'action:execute';
  readonly requestId: string;
  readonly actionId: string;
  readonly payload: unknown;
  readonly params: Record<string, unknown>;
}

// ==================== SUBSCRIPTION MESSAGES ====================

export interface BridgeChatSubscribeMessages extends BridgeMessageBase {
  readonly type: 'chat:subscribe:messages';
  readonly requestId: string;
}

export interface BridgeChatSubscribeStreaming extends BridgeMessageBase {
  readonly type: 'chat:subscribe:streaming';
  readonly requestId: string;
}

export interface BridgeChatSubscribeConversation extends BridgeMessageBase {
  readonly type: 'chat:subscribe:conversation';
  readonly requestId: string;
}

export interface BridgeBroadcastSubscribe extends BridgeMessageBase {
  readonly type: 'broadcast:subscribe';
  readonly requestId: string;
  readonly channel: string;
}

export interface BridgeBroadcastUnsubscribe extends BridgeMessageBase {
  readonly type: 'broadcast:unsubscribe';
  readonly requestId: string;
  readonly channel: string;
}

export interface BridgeContextSubscribeLifecycle extends BridgeMessageBase {
  readonly type: 'context:subscribe:lifecycle';
  readonly requestId: string;
}

export type BridgeRequest =
  | BridgeHello
  | BridgeStorageGet
  | BridgeStorageSet
  | BridgeStorageDelete
  | BridgeThemeGet
  | BridgeThemeSubscribe
  | BridgeAppResize
  | BridgeAppTitle
  | BridgeConnectorRequest
  | BridgePong
  | BridgeActionExecute
  | BridgeMediaMicStart
  | BridgeMediaMicStop
  | BridgeChatSubscribeMessages
  | BridgeChatSubscribeStreaming
  | BridgeChatSubscribeConversation
  | BridgeBroadcastSubscribe
  | BridgeBroadcastUnsubscribe
  | BridgeContextSubscribeLifecycle;

// ==================== BRIDGE RESPONSE ====================

export type BridgeErrorCode =
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'INVALID_REQUEST'
  | 'CONNECTOR_ERROR'
  | 'PLATFORM_UNSUPPORTED';

export interface BridgeResponse {
  readonly requestId: string;
  readonly data?: unknown;
  readonly meta?: unknown;
  readonly error?: string;
  readonly code?: BridgeErrorCode;
}

// ==================== PERMISSIONS ====================

export type AppPermission =
  | 'connector:storage'
  | 'connector:time'
  | 'theme:read'
  | 'theme:subscribe'
  | 'connector:weather'
  | 'connector:news'
  | 'connector:location'
  | 'connector:web-fetch'
  | 'connector:ai'
  | 'connector:skills'
  | 'connector:calendar'
  | 'connector:clipboard'
  | 'connector:files'
  | 'connector:wikipedia'
  | 'connector:movies'
  | 'connector:books'
  | 'connector:academic'
  | 'connector:art'
  | 'connector:music'
  | 'connector:sports'
  | 'connector:markets'
  | 'connector:youtube'
  | 'connector:chat:read'
  | 'connector:chat:send'
  | 'connector:context'
  | 'connector:broadcast'
  | 'connector:vfs'
  | 'connector:geocoding'
  | 'connector:europeana'
  | 'connector:smithsonian'
  | 'connector:loc'
  | 'connector:google-books'
  | 'connector:films'
  | 'connector:vision'
  | 'connector:media-tools'
  | 'media:microphone'
  | 'media:mixer'
  | 'media:camera'
  | 'media:playback'
  | 'fs:conversations:read'
  | 'fs:notes:read'
  | 'fs:blobs:read'
  | 'fs:skills:read'
  | 'fs:appdata:read';

export interface PermissionGroup {
  readonly name: string;
  readonly permissions: readonly AppPermission[];
  readonly description: string;
}

export interface PermissionGrant {
  readonly permission: AppPermission;
  readonly grantedAt: number;
}

export interface PermissionStore {
  readonly grants: Readonly<Record<string, readonly PermissionGrant[]>>;
}

export const IMPLICIT_PERMISSIONS: ReadonlySet<AppPermission> = new Set<AppPermission>([
  'connector:storage',
  'connector:time',
  'theme:read',
  'theme:subscribe',
  'connector:weather',
  'connector:news',
  'connector:location',
  'connector:wikipedia',
  'connector:movies',
  'connector:books',
  'connector:academic',
  'connector:art',
  'connector:music',
  'connector:sports',
  'connector:markets',
  'connector:youtube',
  'connector:context',
  'connector:broadcast',
  'connector:geocoding',
  'connector:europeana',
  'connector:smithsonian',
  'connector:loc',
  'connector:google-books',
  'connector:films',
  'media:playback',
  'media:mixer',
  'fs:skills:read',
  'fs:blobs:read',
  'fs:appdata:read',
] as const);

export const PLATFORM_GATED_PERMISSIONS: ReadonlySet<AppPermission> = new Set<AppPermission>([
  'connector:clipboard',
  'connector:files',
] as const);

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    name: 'Data Access',
    permissions: ['connector:weather', 'connector:news', 'connector:location'],
    description: 'Access weather, news, and location data',
  },
  {
    name: 'Research',
    permissions: [
      'connector:wikipedia',
      'connector:books',
      'connector:academic',
      'connector:art',
      'connector:europeana',
      'connector:smithsonian',
      'connector:loc',
      'connector:google-books',
    ],
    description: 'Search Wikipedia, books, academic papers, art collections, and cultural archives',
  },
  {
    name: 'Entertainment',
    permissions: ['connector:movies', 'connector:music', 'connector:youtube', 'connector:films'],
    description: 'Search movies, films, music, and YouTube videos',
  },
  {
    name: 'Live Data',
    permissions: ['connector:sports', 'connector:markets'],
    description: 'Live sports scores and financial market data',
  },
  {
    name: 'Network',
    permissions: ['connector:web-fetch'],
    description: 'Fetch data from external URLs',
  },
  {
    name: 'AI',
    permissions: ['connector:ai', 'connector:vision'],
    description: 'Use AI inference and vision capabilities',
  },
  {
    name: 'System',
    permissions: ['connector:skills'],
    description: 'Access the skill system',
  },
  {
    name: 'Chat',
    permissions: ['connector:chat:read', 'connector:chat:send'],
    description: 'Read and send messages',
  },
  {
    name: 'Media Processing',
    permissions: ['connector:media-tools'],
    description: 'Download, convert, and process media files with ffmpeg/yt-dlp',
  },
  {
    name: 'Host Data',
    permissions: ['fs:conversations:read', 'fs:notes:read'],
    description: 'Read conversations and notes from the host',
  },
  {
    name: 'Camera',
    permissions: ['media:camera'],
    description: 'Access the device camera for photos and video',
  },
] as const;

// ==================== VALIDATION ====================

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
}

// ==================== HOST EVENTS (BRIDGE RELAY) ====================

export interface ThemeColors {
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly border: string;
}

export interface ThemeUpdateEvent {
  readonly type: 'theme:update';
  readonly theme: ThemeColors;
}

export interface AppFocusEvent {
  readonly type: 'app:focus';
}

export interface AppBlurEvent {
  readonly type: 'app:blur';
}

export interface AppCloseEvent {
  readonly type: 'app:close';
}

export interface PingEvent {
  readonly type: 'ping';
  readonly nonce: string;
}

export interface InputMoveEvent {
  readonly type: 'input:move';
  readonly x: number;
  readonly y: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly source: 'hand';
}

// ==================== PUSH EVENTS (HOST -> APP) ====================

export interface ChatMessagePushEvent {
  readonly type: 'chat:message';
  readonly message: {
    readonly id: string;
    readonly sender: string;
    readonly text: string;
    readonly createdAt: number;
  };
}

export interface ChatStreamingPushEvent {
  readonly type: 'chat:streaming';
  readonly buffer: string;
  readonly active: boolean;
}

export interface ChatConversationChangedEvent {
  readonly type: 'chat:conversation_changed';
  readonly conversationId: string | null;
  readonly title: string;
}

export interface BroadcastMessagePushEvent {
  readonly type: 'broadcast:message';
  readonly channel: string;
  readonly data: unknown;
  readonly fromAppId: string;
}

export interface ContextAppLifecycleEvent {
  readonly type: 'context:app_opened' | 'context:app_closed';
  readonly app: {
    readonly appId: string;
    readonly instanceId: string;
    readonly name: string;
  };
}

export type BridgeEvent =
  | ThemeUpdateEvent
  | AppFocusEvent
  | AppBlurEvent
  | AppCloseEvent
  | PingEvent
  | InputMoveEvent
  | ChatMessagePushEvent
  | ChatStreamingPushEvent
  | ChatConversationChangedEvent
  | BroadcastMessagePushEvent
  | ContextAppLifecycleEvent;
