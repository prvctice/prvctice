// Global Window interface extensions for prvctice
// Centralized to avoid duplicate declaration conflicts

import type { Ref, ShallowRef, ComputedRef } from 'vue';

// Intent Coordinator types
interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ZoneDefinition = ZoneRect | string | (() => ZoneRect | null) | null;

interface Position {
  x: number;
  y: number;
}

interface Intent {
  source: string;
  action: string;
  target?: string;
  position?: Position;
  value?: unknown;
  timestamp?: number;
}

interface IntentWithTimestamp extends Intent {
  timestamp: number;
  resolvedTarget?: string | null;
}

interface Target {
  id: string;
  zone: ZoneDefinition;
  actions: string[];
  priority: number;
  enabled: boolean;
  handler: (intent: IntentWithTimestamp) => void;
}

interface ZoneRectInfo {
  id: string;
  rect: ZoneRect;
  actions: string[];
}

// Middleware callback types
type BeforeEmitCallback = (intent: Intent) => Intent | null;
type AfterEmitCallback = (intent: IntentWithTimestamp, target: Target | null) => void;

// State subscription types
interface IntentState {
  activeTarget: string | null;
  lastIntent: IntentWithTimestamp | null;
  isDragging: boolean;
  dragSource: string | null;
}

type StateCallback = (state: IntentState) => void;

// Runtime subset exposed on window in all modes
interface IntentCoordinatorRuntime {
  registerTarget: (
    id: string,
    options: {
      zone?: ZoneDefinition;
      actions?: string[];
      priority?: number;
      handler: (intent: IntentWithTimestamp) => void;
    }
  ) => void;
  unregisterTarget: (id: string) => void;
  enableTarget: (id: string) => void;
  disableTarget: (id: string) => void;
  emit: (intent: Intent) => { intent: IntentWithTimestamp; target: Target | null } | null;
}

// Full coordinator with debug/introspection (composable export + DEV window)
interface IntentCoordinator extends IntentCoordinatorRuntime {
  targets: ShallowRef<Map<string, Target>>;
  history: Ref<IntentWithTimestamp[]>;
  debugVisible: Ref<boolean>;
  activeTargetId: ComputedRef<string | null>;
  state: Ref<IntentState>;
  showDebug: (show?: boolean) => void;
  toggleDebug: () => void;
  getHistory: () => IntentWithTimestamp[];
  getTargets: () => Map<string, Target>;
  getActiveTarget: (position: Position | null) => Target | null;
  getAllZoneRects: () => ZoneRectInfo[];
  isInsideZone: (px: number, py: number, zone: ZoneDefinition) => boolean;
  distanceToZone: (px: number, py: number, zone: ZoneDefinition) => number;
  getZoneRect: (zone: ZoneDefinition) => ZoneRect | null;
  onBeforeEmit: (cb: BeforeEmitCallback) => () => void;
  onAfterEmit: (cb: AfterEmitCallback) => () => void;
  subscribe: (cb: StateCallback) => () => void;
}

// App Settings types
interface AppSettingsType {
  magnetThreshold?: number;
  notifDismissAnimationMs?: number;
  notifDismissDelay?: number;
  themeDisplayNames?: Record<string, string>;
  [key: string]: unknown;
}

// Feature flags
interface FeatureFlags {
  __VUE_CHAT_ACTIVE?: boolean;
  __VUE_WEATHER_ENABLED?: boolean;
  [key: string]: unknown;
}

// DotMatrix motion controller
interface DotMatrixMotion {
  isReduced?: () => boolean;
  isStarting?: () => boolean;
  isActive?: () => boolean;
  hasExplicitPreference?: () => boolean;
  [key: string]: (() => boolean) | undefined;
}

// DotMatrix Landmark type (for hand tracking)
interface DotMatrixLandmark {
  x: number;
  y: number;
  z?: number;
}

// FrameCoordinator types (matches web/utils/frameCoordinator.ts)
type FramePriorityLevel = 0 | 1 | 2;
interface FrameInfo {
  now: number;
  deltaMs: number;
  deltaFactor: number;
}
type FrameCallback = (frameInfo: FrameInfo) => void;

interface FrameCoordinatorType {
  subscribe: (id: string, callback: FrameCallback, priority?: FramePriorityLevel) => () => void;
  unsubscribe: (id: string) => void;
}

// prvStorage interface
interface PrvStorage {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

// AtmosphereStrength options
interface AtmosphereOptions {
  immediate?: boolean;
  asOverride?: boolean;
}

// Ripples options
interface RipplesOptions {
  reset?: boolean;
}

declare global {
  // Vite environment types
  interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
    readonly BASE_URL: string;
    readonly SSR: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    // Intent system (runtime subset; full IntentCoordinator available via composable import)
    intentCoordinator?: IntentCoordinatorRuntime;

    // App settings
    AppSettings?: AppSettingsType;

    // Feature flags
    __flags?: FeatureFlags;

    // Dotmatrix controls
    __disableDotmatrix?: boolean;
    __prvChatStarted?: boolean;
    __debugPointer?: boolean;
    __debugThinking?: boolean;
    __dotmatrixThinkingActive?: boolean;
    __dotmatrixSuppressAutoStart?: boolean;
    startDotMatrix?: (force?: boolean) => void;
    stopDotMatrix?: () => void;
    setDotMatrixOverlaySuppressed?: (suppressed: boolean) => void;
    setDotMatrixInteractive?: (interactive: boolean) => void;
    setDotMatrixSpheresVisible?: (visible: boolean) => void;
    setDotMatrixHeadPosition?: (x: number, y: number) => void;
    setDotMatrixCursorActive?: (active: boolean) => void;
    getDotMatrixCursorActive?: () => boolean;
    getDotMatrixFocusPosition?: () => { x: number; y: number };
    setDotMatrixDepth?: (depth: number) => void;
    getDotMatrixDepth?: () => number;
    setDotMatrixRotation?: (rotation: number) => void;
    getDotMatrixRotation?: () => number;
    setDotMatrixHandLandmarks?: (landmarks: DotMatrixLandmark[] | null) => void;
    getDotMatrixHandLandmarks?: () => DotMatrixLandmark[] | null;
    getDotMatrixHandLandmarksActive?: () => boolean;
    setDotMatrixAtmosphereStrength?: (strength: number, options?: AtmosphereOptions) => void;
    getDotMatrixSpheresVisible?: () => boolean;
    setDotMatrixRipplesEnabled?: (enabled: boolean, options?: RipplesOptions) => void;
    getDotMatrixRipplesEnabled?: () => boolean;
    spawnDotMatrixRipple?: (x: number, y: number) => void;
    setDotMatrixGameModeOpacity?: (opacity: number) => void;
    getDotMatrixGameModeOpacity?: () => number;
    setDotMatrixSize?: (size: 'normal' | 'large') => void;
    getDotMatrixSize?: () => 'normal' | 'large';
    setDotMatrixTheme?: (theme: string) => void;
    setDotMatrixReadingOpen?: (open: boolean) => void;
    dotMatrixMotion?: DotMatrixMotion;

    // FrameCoordinator
    frameCoordinator?: FrameCoordinatorType;
    FramePriority?: {
      TRACKING: 0;
      PHYSICS: 1;
      RENDER: 2;
    };

    // prvStorage for localStorage wrapper
    prvStorage?: PrvStorage;

    // Dotmatrix awareness API (particle system responds to user activity)
    onDotMatrixKeystroke?: () => void;
    onDotMatrixUserSubmit?: () => void;
    onDotMatrixAIResponseStart?: () => void;
    onDotMatrixAIResponseEnd?: () => void;
    onDotMatrixHandPresent?: () => void;
    onDotMatrixHandLost?: () => void;
    getDotMatrixHandPresent?: () => boolean;
    setDotMatrixAwarenessState?: (state: 'idle' | 'typing' | 'waiting' | 'responding') => void;
    getDotMatrixAwarenessState?: () => string;

    // Quality tier API
    setDotMatrixQualityTier?: (tier: 'ultra' | 'high' | 'medium' | 'low') => void;
    getDotMatrixQualityTier?: () => 'ultra' | 'high' | 'medium' | 'low';

    __dotMatrixInstance?: {
      setQualityTier: (tier: 'ultra' | 'high' | 'medium' | 'low') => void;
      getQualityTier: () => 'ultra' | 'high' | 'medium' | 'low';
    };

    // Theme controls
    currentTheme?: string;
    baseCircleColor?: string;
    baseCircleRGB?: { r: number; g: number; b: number } | null;

    // Weather/time controls
    updateFragileThemeGradient?: (hourOrDate: number | Date) => void;
    updateDuskThemeGradient?: (hourOrDate: number | Date) => void;
    toggleWeatherTimeWidget?: () => void;
    _duskSunrise?: string;
    _duskSunset?: string;

    // Menu controls
    handleMenuAction?: (action: string) => void;
    electronMenu?: {
      on: (event: string, callback: (...args: unknown[]) => void) => void;
    };

    // Input bar controls
    setHasMovedBarToBottom?: (moved: boolean) => void;

    // API configuration
    API_BASE_URL?: string;
    prvctice?: {
      apiBaseUrl?: string;
    };

    // Notifications
    appendNotifs?: (kind: string, text: string) => void;
    appendNotifsWithAction?: (
      kind: string,
      text: string,
      action: { label: string; handler: () => void }
    ) => void;

    // Settings modals
    openApiKeysModal?: () => void;
    openModelModal?: () => void;
    openModelSelector?: () => void;
    openThemeModal?: () => void;
    openSettingsModal?: () => void;
    openBugReport?: (errorText?: string) => void;

    // Help pane controls
    closeHelpPane?: (options?: {
      force?: boolean;
      skipAnimation?: boolean;
      keepSplitMode?: boolean;
    }) => Promise<void>;
    openHelpPane?: (force?: boolean, options?: { skipAnimation?: boolean }) => Promise<void>;
    toggleHelpPane?: (options?: {
      force?: boolean;
      skipAnimation?: boolean;
      keepSplitMode?: boolean;
    }) => Promise<void>;
    showHelpTip?: (id: string) => void;

    // About pane controls
    closeAboutPane?: (options?: {
      force?: boolean;
      skipAnimation?: boolean;
      keepSplitMode?: boolean;
    }) => Promise<void>;
    openAboutPane?: (force?: boolean, options?: { skipAnimation?: boolean }) => Promise<void>;
    toggleAboutPane?: (options?: {
      force?: boolean;
      skipAnimation?: boolean;
      keepSplitMode?: boolean;
    }) => Promise<void>;

    // Voice commands pane controls
    closeVoiceCommandsPane?: (options?: {
      force?: boolean;
      skipAnimation?: boolean;
      keepSplitMode?: boolean;
    }) => Promise<void>;
    openVoiceCommandsPane?: (
      force?: boolean,
      options?: { skipAnimation?: boolean }
    ) => Promise<void>;
    toggleVoiceCommandsPane?: (options?: {
      force?: boolean;
      skipAnimation?: boolean;
      keepSplitMode?: boolean;
    }) => Promise<void>;

    // Theme cycling
    cycleTheme?: () => void;
    setTheme?: (theme: string) => string;

    // Hand tracking controls
    toggleDotMatrixHandTracking?: () => Promise<void>;
    getDotMatrixHandTracking?: () => boolean;

    // Input bar controls (additional)
    lowerBarToBottom?: () => void;

    // Chat scroller refresh (for mobile panel transitions)
    refreshChatScroller?: () => void;

    // Chat controls
    startNewChat?: () => void | Promise<void>;
    sendMessage?: (options?: { isVoice?: boolean; content?: string }) => Promise<void>;
    appendMessage?: (sender: string, text: string, imageUrl?: string) => void;

    // Debug HUD
    __pointerDebugHudInstalled?: {
      hud: HTMLDivElement;
      observers: (MutationObserver | null)[];
      interval: number;
    } | null;

    // YouTube player controls
    openYouTubeViaVue?: ((id: string) => void) | null;
    minimizeYouTubeViaVue?: (() => void) | null;
    closeYouTubeViaVue?: (() => void) | null;

    // Global double tap flag
    __disableGlobalDoubleTap?: boolean;

    // Nudge system
    __nudge_accept?: boolean;
    __lastTextNonOpenAI?: string;
    __chatStoreResubmit?: (text: string) => void;
    __holdAttachmentsForNudge?: boolean;
    __nudgeClickInstalled?: boolean;

    // File preview globals
    localPreviewBlobs?: (File | Blob)[];
    localPreviewBlob?: File | Blob | null;
    localPreviewUrl?: string | null;
    localPreviewUrls?: string[];

    // Image state globals
    lastImageAt?: number;
    markRecentImage?: () => void;
    lastAssistantImageBase64?: string;
    lastAssistantImageMime?: string;
    lastAssistantImageUrl?: string;
    lastSourceImageBase64?: string;
    lastSourceImageMime?: string;
    lastSourceImageUrl?: string | null;

    // Game controls
    startBlockBreakingGame?: () => void;
    // Model viewer controls
    setModelViewerPanelOpen?: (open: boolean) => void;

    // PDF widget controls
    openPdfWidget?: () => void;
    closePdfWidget?: () => void;
    togglePdfWidget?: () => void;
    loadPdfFile?: (file: File) => void;
    openFileLibrary?: () => void;

    // Debug flags
    __debugStream?: boolean;

    // Provider/model defaults
    getDefaultProvider?: () => string;
    getDefaultModel?: (provider: string) => string;

    // Pinned object URLs for blob management
    pinnedObjectUrls?: Set<string>;

    // Electron grid controls
    electronGrid?: {
      setGridState?: (visible: boolean) => void;
    };
  }
}

export type {
  IntentCoordinator,
  Intent,
  IntentWithTimestamp,
  Target,
  ZoneRect,
  ZoneDefinition,
  ZoneRectInfo,
  Position,
  AppSettingsType,
  FeatureFlags,
  DotMatrixMotion,
  DotMatrixLandmark,
  FramePriorityLevel,
  FrameInfo,
  FrameCallback,
  FrameCoordinatorType,
  PrvStorage,
  AtmosphereOptions,
  RipplesOptions,
};
