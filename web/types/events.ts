/**
 * Application Event Types
 * Central type definitions for the event bus system.
 * Replaces window.dispatchEvent(new CustomEvent(...)) pattern.
 */

// ==================== PANEL EVENTS ====================

export interface PanelOpenEvent {
  panel: 'settings' | 'help' | 'notes' | 'chathistory';
  pane?: 'keys' | 'ai' | 'themes' | 'effects' | 'system' | 'appearance';
}

export interface PanelCloseEvent {
  panel: string;
}

export interface PanelToggleEvent {
  panel: 'sidemenu' | 'notes' | 'skills';
}

// ==================== THEME EVENTS ====================

export interface ThemeChangeEvent {
  theme: string;
}

export interface ThemeCycleEvent {
  direction: 'forward' | 'backward';
}

// ==================== SKILL EVENTS ====================

export interface SkillPromptEvent {
  text: string;
  appendToInput?: boolean;
  autoSubmit?: boolean;
  skillId?: string;
}

export interface SkillSendToAiEvent {
  text: string;
  source: string;
}

export interface SkillSaveToNotesEvent {
  text: string;
  source: string;
}

export interface SkillCombineEvent {
  sourceId: string;
  targetId: string;
  mode: string;
  midpoint: { x: number; y: number };
  sourceSkill?: unknown;
  targetSkill?: unknown;
  sourceRect?: { x: number; y: number; width: number; height: number };
  targetRect?: { x: number; y: number; width: number; height: number };
}

export interface SkillInsertTextEvent {
  text: string;
  autoSubmit?: boolean;
}

// ==================== CHAT EVENTS ====================

export interface ReminderScheduledEvent {
  text: string;
  triggerAt: number;
  delay: string;
}

// ==================== HARDWARE TOGGLE EVENTS ====================

export interface GridToggledEvent {
  visible: boolean;
}

export interface GestureBindEvent {
  gesture: string;
  skillId: string;
}

// ==================== DOTMATRIX EVENTS ====================

export interface DotmatrixSizeChangeEvent {
  size: 'large' | 'normal';
}

export interface DotmatrixKeepAtmosphereChangeEvent {
  keep: boolean;
}

export interface DotmatrixEffectsChangeEvent {
  reduce: boolean;
}

// ==================== STORAGE EVENTS ====================

export interface StorageInitializedEvent {
  // Empty - just signals storage is ready
}

// ==================== INPUT EVENTS ====================

export interface VoiceInputLockEvent {
  locked: boolean;
}

export interface SpeechTranscriptEvent {
  text: string;
  isFinal: boolean;
}

export interface ApiKeysUpdatedEvent {
  source: string;
}

// ==================== FILE ATTACHMENT EVENTS ====================

export interface FileAttachedEvent {
  file?: File;
  index?: number;
  count?: number;
}

export interface FileRemovedEvent {
  index: number;
}

// ==================== MAGNETIC SYSTEM EVENTS ====================

export interface MagneticMoveFollowerEvent {
  id: string;
  delta: { x: number; y: number };
}

// ==================== PHYSICS EVENTS ====================

export interface PhysicsSnapEvent {
  target: string | HTMLElement | undefined;
  edge: 'top' | 'bottom';
}

// ==================== ACCESSIBILITY EVENTS ====================

export interface GamepadEnabledChangeEvent {
  enabled: boolean;
}

export interface HandTrackButtonChangeEvent {
  visible: boolean;
}

// ==================== SEARCH INDEX EVENTS ====================

export interface ConversationCreatedEvent {
  id: string;
  title: string;
}

export interface ConversationUpdatedEvent {
  id: string;
  title?: string;
}

export interface ConversationDeletedEvent {
  id: string;
}

export interface NoteCreatedEvent {
  id: string;
  title: string;
}

export interface NoteUpdatedEvent {
  id: string;
  title: string;
}

export interface NoteDeletedEvent {
  id: string;
}

export interface SkillCreatedEvent {
  id: string;
  title: string;
}

export interface SkillDeletedEvent {
  id: string;
}

// ==================== LIBRARY EVENTS ====================

export interface LibraryFileAddedEvent {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface LibraryFileRemovedEvent {
  id: string;
}

// ==================== EVENT MAP ====================

/**
 * Complete map of all application events.
 * Use with EventBus for type-safe emit/on.
 */
export interface AppEvents {
  // Panels
  'panel:open': PanelOpenEvent;
  'panel:close': PanelCloseEvent;
  'panel:toggle': PanelToggleEvent;

  // Theme
  'theme:change': ThemeChangeEvent;
  'theme:cycle': ThemeCycleEvent;

  // Skills
  'skill:prompt': SkillPromptEvent;
  'skill:send-to-ai': SkillSendToAiEvent;
  'skill:save-to-notes': SkillSaveToNotesEvent;
  'skill:response-complete': void;
  'skill:combine': SkillCombineEvent;
  'skill:insert-text': SkillInsertTextEvent;

  // Chat
  'chat:new': void;
  'chat:save-pdf': void;
  'chat:email': void;
  'chat:first-prompt': void;
  'reminder:scheduled': ReminderScheduledEvent;

  // Notes
  'notes:email': void;
  'notes:send-to-chat': void;

  // Hardware toggles
  'gamepad:toggle': void;
  'voice:toggle': void;
  'handtracking:toggle': void;
  'modelviewer:toggle': void;
  'timewidget:toggle': void;
  'grid:toggled': GridToggledEvent;
  'gesture:bind': GestureBindEvent;

  // Input bar
  'inputbar:center': void;
  'attachment:image': void;
  'voice:input-lock': VoiceInputLockEvent;
  'speech:transcript': SpeechTranscriptEvent;

  // Workspace
  'workspace:save': void;
  'workspace:load': void;

  // Dotmatrix
  'dotmatrix:ready': void;
  'dotmatrix:size-change': DotmatrixSizeChangeEvent;
  'dotmatrix:atmosphere-change': DotmatrixKeepAtmosphereChangeEvent;
  'dotmatrix:effects-change': DotmatrixEffectsChangeEvent;

  // Thinking status
  'thinking:start': void;
  'thinking:stop': void;

  // API/Settings
  'api-keys:updated': ApiKeysUpdatedEvent;

  // Accessibility
  'gamepad:enabled-change': GamepadEnabledChangeEvent;
  'handtrack:button-change': HandTrackButtonChangeEvent;

  // Weather
  'weather:location-changed': void;

  // Handtrack grab (from legacy)
  'handtrack:grab-end': void;

  // Workspace
  'workspace:restored': void;

  // File attachments
  'file:attached': FileAttachedEvent;
  'file:removed': FileRemovedEvent;
  'file:cleared': void;

  // Magnetic system
  'magnetic:move-follower': MagneticMoveFollowerEvent;

  // Physics system
  'physics:snap': PhysicsSnapEvent;

  // Widget focus (MOTN-08 — focus/defocus spring scale)
  'widget:focus': { id: string };

  // Storage
  'storage:initialized': StorageInitializedEvent;

  // PDF
  'pdf:drop': { file: File };
  'pdf:load': { file: File };
  'pdf:highlight-created': { highlightId: string; text: string; pageNumber: number };
  'pdf:highlight-removed': { highlightId: string };

  // App lifecycle
  'app:launched': { appId: string; instanceId: string; appName: string };
  'app:closed': {
    appId: string;
    instanceId: string;
    appName: string;
    reason: 'user' | 'crash' | 'timeout' | 'security';
  };
  'app:crashed': { appId: string; instanceId: string; appName: string; error: string };
  'app:focused': { appId: string; instanceId: string; appName: string };
  'app:minimized': { appId: string; instanceId: string; appName: string };

  // App bridge messages (forwarded from iframe)
  'app:resize': { instanceId: string; width: number; height: number };
  'app:title': { instanceId: string; title: string };
  'app:nav': { instanceId: string; viewName: string; stackDepth: number; title: string | null };

  // Library lifecycle
  'library:file-added': LibraryFileAddedEvent;
  'library:file-removed': LibraryFileRemovedEvent;

  // Search index lifecycle
  'conversation:created': ConversationCreatedEvent;
  'conversation:updated': ConversationUpdatedEvent;
  'conversation:deleted': ConversationDeletedEvent;
  'note:created': NoteCreatedEvent;
  'note:updated': NoteUpdatedEvent;
  'note:deleted': NoteDeletedEvent;
  'skill:created': SkillCreatedEvent;
  'skill:deleted': SkillDeletedEvent;

  // Character model
  'character:change': { id: string; path: string };

  // Connector status (Phase 19 — cross-widget awareness)
  'connector:status': {
    connectorId: string;
    status: 'healthy' | 'stale' | 'error';
    ageMs?: number;
    error?: string;
  };

  // Connector usage (Phase 6 observation)
  'connector:weather:used': { appId: string; method: string };
  'connector:news:used': { appId: string; method: string };
  'connector:location:used': { appId: string; method: string };
  'connector:web-fetch:used': { appId: string; method: string };
  'connector:ai:used': { appId: string; method: string };
  'connector:calendar:used': { appId: string; method: string };
  'connector:storage:used': { appId: string; method: string };
  'connector:time:used': { appId: string; method: string };
  'connector:skills:used': { appId: string; method: string };
  'connector:clipboard:used': { appId: string; method: string };
  'connector:files:used': { appId: string; method: string };
  'connector:wikipedia:used': { appId: string; method: string };
  'connector:movies:used': { appId: string; method: string };
  'connector:books:used': { appId: string; method: string };
  'connector:academic:used': { appId: string; method: string };
  'connector:art:used': { appId: string; method: string };
  'connector:music:used': { appId: string; method: string };
  'connector:sports:used': { appId: string; method: string };
  'connector:markets:used': { appId: string; method: string };
  'connector:youtube:used': { appId: string; method: string };
  'connector:chat:used': { appId: string; method: string };
  'connector:context:used': { appId: string; method: string };
  'connector:broadcast:used': { appId: string; method: string };
  'connector:geocoding:used': { appId: string; method: string };
}

/**
 * Helper type to get event detail type
 */
export type EventDetail<K extends keyof AppEvents> = AppEvents[K];
