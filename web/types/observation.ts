/**
 * Action Observation Types
 * Privacy-first design: only event type strings are recorded, never payloads.
 *
 * The ACTION_ALLOWLIST defines the exact boundary of observable events.
 * CONTENT_EVENTS is a blocklist for double-safety against content leakage.
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * A single observed action -- stores only the event type code, never content.
 */
export interface ActionRecord {
  readonly code: string;
  readonly ts: number;
  readonly sessionId: string;
}

/**
 * A detected sequence of actions that recurs.
 */
export interface SequencePattern {
  readonly actions: ReadonlyArray<string>;
  readonly count: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

/**
 * Configuration for the observation system.
 */
export interface ObservationConfig {
  readonly maxActions: number;
  readonly persistDebounceMs: number;
  readonly enabled: boolean;
}

/**
 * Options for the n-gram sequence detection algorithm.
 */
export interface DetectionOptions {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minCount?: number;
  readonly maxAgeMs?: number;
  readonly inactivityGapMs?: number;
}

// =============================================================================
// Privacy Allowlist
// =============================================================================

/**
 * Exhaustive allowlist of event types that may be recorded.
 * Only structural/navigational signals -- no content, no user input.
 */
export const ACTION_ALLOWLIST: ReadonlySet<string> = new Set([
  // Skill usage
  'skill:prompt',
  'skill:send-to-ai',
  'skill:save-to-notes',
  'skill:combine',
  'skill:response-complete',

  // Navigation / panels
  'panel:open',
  'panel:close',
  'panel:toggle',

  // Chat lifecycle
  'chat:new',
  'chat:save-pdf',
  'chat:email',

  // Notes lifecycle
  'notes:email',
  'notes:send-to-chat',

  // Tool toggles
  'voice:toggle',
  'handtracking:toggle',
  'gamepad:toggle',
  'modelviewer:toggle',
  'timewidget:toggle',

  // Theme
  'theme:change',
  'theme:cycle',

  // Workspace
  'workspace:save',
  'workspace:load',

  // App lifecycle (Phase 6)
  'app:launched',
  'app:closed',
  'app:focused',
  'app:minimized',

  // Connector usage (Phase 6)
  'connector:weather:used',
  'connector:news:used',
  'connector:location:used',
  'connector:web-fetch:used',
  'connector:ai:used',
  'connector:calendar:used',
  'connector:storage:used',
  'connector:time:used',
  'connector:skills:used',
  'connector:clipboard:used',
  'connector:files:used',
  'connector:wikipedia:used',
  'connector:movies:used',
  'connector:books:used',
  'connector:academic:used',
  'connector:art:used',
  'connector:music:used',
  'connector:sports:used',
  'connector:markets:used',
  'connector:youtube:used',
]);

/**
 * Content-bearing events that must NEVER be recorded.
 * Double-safety blocklist in case an allowlist update accidentally includes one.
 */
export const CONTENT_EVENTS: ReadonlySet<string> = new Set([
  'speech:transcript',
  'skill:insert-text',
  'voice:input-lock',
  'attachment:image',
  'file:attached',
  'pdf:drop',
  'pdf:load',
]);

// =============================================================================
// Defaults
// =============================================================================

/**
 * Default observation configuration.
 * Ring buffer at 500, persist every 5 seconds.
 */
export const DEFAULT_OBSERVATION_CONFIG: Readonly<ObservationConfig> = Object.freeze({
  maxActions: 500,
  persistDebounceMs: 5000,
  enabled: true,
});
