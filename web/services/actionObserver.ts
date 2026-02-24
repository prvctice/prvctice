/**
 * Action Observer Service
 * Passively records structural action signals from the event bus.
 *
 * Privacy boundary: only event type strings are recorded, never payloads.
 * The onAll handler receives (type, event) but only uses `type`.
 *
 * Debug channel: 'observation' (#8BC34A light green)
 */

import { useEventBus } from '@web/services/eventBus.js';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { debugLog } from '@web/utils/debugLog.js';
import { logError } from '@web/utils/debugLog.js';
import { detectSequences } from '@web/services/patternDetector.js';
import type { ActionRecord, ObservationConfig, SequencePattern } from '@web/types/observation.js';
import {
  ACTION_ALLOWLIST,
  CONTENT_EVENTS,
  DEFAULT_OBSERVATION_CONFIG,
} from '@web/types/observation.js';

// =============================================================================
// Factory
// =============================================================================

export function createActionObserver(configOverrides?: Partial<ObservationConfig>) {
  const config: ObservationConfig = {
    ...DEFAULT_OBSERVATION_CONFIG,
    ...configOverrides,
  };

  const sessionId = Date.now().toString(36);
  let actions: ReadonlyArray<ActionRecord> = [];
  let patterns: ReadonlyArray<SequencePattern> = [];
  let cleanup: (() => void) | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  function schedulePersist(): void {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      flushPersist();
    }, config.persistDebounceMs);
  }

  function flushPersist(): void {
    storage.kv.set(STORAGE_KEYS.OBSERVATION_ACTIONS, [...actions]).catch((err: unknown) => {
      logError('observation', 'persist', err instanceof Error ? err : new Error(String(err)));
    });
  }

  async function loadPersistedData(): Promise<void> {
    try {
      const [storedActions, storedPatterns] = await Promise.all([
        storage.kv.get<ActionRecord[]>(STORAGE_KEYS.OBSERVATION_ACTIONS),
        storage.kv.get<SequencePattern[]>(STORAGE_KEYS.OBSERVATION_PATTERNS),
      ]);
      if (Array.isArray(storedActions)) {
        actions = storedActions.slice(-config.maxActions);
      }
      if (Array.isArray(storedPatterns)) {
        patterns = storedPatterns;
      }
    } catch (err: unknown) {
      logError('observation', 'load', err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  function recordAction(eventType: string): void {
    if (!config.enabled) return;
    if (!ACTION_ALLOWLIST.has(eventType)) return;
    if (CONTENT_EVENTS.has(eventType)) return;

    // Deduplicate consecutive identical events
    const lastAction = actions.length > 0 ? actions[actions.length - 1] : undefined;
    if (lastAction && lastAction.code === eventType) return;

    const record: ActionRecord = {
      code: eventType,
      ts: Date.now(),
      sessionId,
    };

    // Immutable append with ring buffer cap
    actions = [...actions.slice(-(config.maxActions - 1)), record];

    debugLog('observation', 'record', record.code);
    schedulePersist();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  function initialize(): () => void {
    loadPersistedData().then(() => {
      debugLog('observation', 'init', 'Action observer started', {
        sessionId,
        allowlistSize: ACTION_ALLOWLIST.size,
        loadedActions: actions.length,
      });
    });

    const bus = useEventBus();
    // Privacy boundary: handler receives (type, event) but ignores event entirely
    const handler = (type: string | symbol): void => {
      recordAction(type as string);
    };

    bus.onAll(handler as Parameters<typeof bus.onAll>[0]);
    cleanup = () => {
      bus.offAll(handler as Parameters<typeof bus.offAll>[0]);
    };

    return cleanup;
  }

  function destroy(): void {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }

    // Flush pending persist immediately
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
      flushPersist();
    }

    actions = [];
    patterns = [];
  }

  // ---------------------------------------------------------------------------
  // Pattern Detection
  // ---------------------------------------------------------------------------

  async function detectPatterns(): Promise<ReadonlyArray<SequencePattern>> {
    const detected = detectSequences(actions);
    patterns = detected;
    try {
      await storage.kv.set(STORAGE_KEYS.OBSERVATION_PATTERNS, [...detected]);
    } catch (err: unknown) {
      logError(
        'observation',
        'persist-patterns',
        err instanceof Error ? err : new Error(String(err))
      );
    }
    debugLog('observation', 'detectPatterns', `Found ${detected.length} patterns`);
    return patterns;
  }

  function getPatterns(): ReadonlyArray<SequencePattern> {
    return patterns;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  function getActions(): ReadonlyArray<ActionRecord> {
    return actions;
  }

  function getSessionId(): string {
    return sessionId;
  }

  function isEnabled(): boolean {
    return config.enabled;
  }

  return { initialize, destroy, getActions, getSessionId, isEnabled, detectPatterns, getPatterns };
}

// =============================================================================
// Singleton
// =============================================================================

export type ActionObserver = ReturnType<typeof createActionObserver>;

let instance: ActionObserver | null = null;

export function getActionObserver(): ActionObserver {
  if (!instance) {
    instance = createActionObserver();
  }
  return instance;
}

export function resetActionObserver(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
