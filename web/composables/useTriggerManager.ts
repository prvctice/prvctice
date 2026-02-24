/**
 * Trigger Manager Composable
 *
 * Bridges the trigger scheduler, registry, and IndexedDB persistence
 * for UI consumption. Provides reactive refs for trigger definitions,
 * states, and firing histories that update on a 3-second interval.
 *
 * Two exports:
 * - initTriggers() — called once at app startup from AppShell.vue
 * - useTriggerManager() — composable for UI components
 */

import { ref, type Ref } from 'vue';
import type { TriggerDefinition, TriggerState, TriggerFiring } from '@web/types/triggers';
import {
  registerTrigger,
  getAllTriggers,
  getTriggerState,
  updateTriggerState,
  getRecentFirings,
} from '@web/services/triggers/registry';
import { useTriggerScheduler } from '@web/services/triggers/scheduler';
import {
  saveTriggerDefinition,
  deleteTriggerDefinition,
  loadAllTriggerDefinitions,
  saveTriggerState,
  loadTriggerState,
  loadFiringHistory,
} from '@web/services/triggers/storage';
import { debugLog, logError } from '@web/utils/debugLog';

// ==================== CONSTANTS ====================

const REFRESH_INTERVAL_MS = 3_000;

// ==================== MODULE-SCOPED REACTIVE STATE ====================

const triggers: Ref<ReadonlyArray<TriggerDefinition>> = ref([]);
const triggerStates: Ref<Map<string, TriggerState>> = ref(new Map());
const firingHistories: Ref<Map<string, ReadonlyArray<TriggerFiring>>> = ref(new Map());
const initialized: Ref<boolean> = ref(false);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

// ==================== REFRESH ====================

/**
 * Re-read registry into reactive refs so UI stays current
 * as triggers fire in the background.
 */
function refreshTriggers(): void {
  const allDefs = getAllTriggers();
  triggers.value = allDefs;

  const statesMap = new Map<string, TriggerState>();
  const historiesMap = new Map<string, ReadonlyArray<TriggerFiring>>();

  for (const def of allDefs) {
    statesMap.set(def.id, getTriggerState(def.id));
    historiesMap.set(def.id, getRecentFirings(def.id));
  }

  triggerStates.value = statesMap;
  firingHistories.value = historiesMap;
}

// ==================== INIT (called once at startup) ====================

/**
 * Load all persisted triggers from IndexedDB, restore their state
 * and history into the in-memory registry, register enabled triggers
 * with the scheduler, and start the scheduler.
 *
 * Called once from AppShell.vue during onMounted.
 */
export async function initTriggers(): Promise<void> {
  if (initialized.value) return;

  try {
    const scheduler = useTriggerScheduler();
    const definitions = await loadAllTriggerDefinitions();

    for (const def of definitions) {
      // Register in in-memory registry
      registerTrigger(def);

      // Restore persisted state
      const state = await loadTriggerState(def.id);
      if (state) {
        updateTriggerState(def.id, state);
      }

      // Restore persisted firing history
      const history = await loadFiringHistory(def.id);
      if (history.length > 0) {
        // Re-import into registry by recording each firing
        // (the registry's recordFiring handles ring buffer)
        const { recordFiring } = await import('@web/services/triggers/registry');
        for (const firing of history) {
          recordFiring(firing);
        }
      }

      // Register enabled triggers with scheduler
      const currentState = getTriggerState(def.id);
      if (currentState.enabled) {
        scheduler.register(def);
      }
    }

    // Start the scheduler
    scheduler.start();

    // Populate reactive refs
    refreshTriggers();

    // Start periodic refresh for UI updates
    refreshTimer = setInterval(refreshTriggers, REFRESH_INTERVAL_MS);

    initialized.value = true;
    debugLog('triggers', 'manager:initialized', { count: definitions.length });
  } catch (err) {
    logError('triggers', 'manager:initFailed', err instanceof Error ? err : new Error(String(err)));
  }
}

// ==================== COMPOSABLE ====================

export interface TriggerManager {
  readonly triggers: Ref<ReadonlyArray<TriggerDefinition>>;
  readonly triggerStates: Ref<Map<string, TriggerState>>;
  readonly firingHistories: Ref<Map<string, ReadonlyArray<TriggerFiring>>>;
  readonly initialized: Ref<boolean>;
  readonly addTrigger: (trigger: TriggerDefinition) => Promise<void>;
  readonly removeTrigger: (id: string) => Promise<void>;
  readonly toggleTrigger: (id: string) => Promise<void>;
  readonly refreshTriggers: () => void;
  readonly cleanup: () => void;
}

/**
 * Composable for trigger management UI.
 * Returns reactive refs and mutation methods.
 */
export function useTriggerManager(): TriggerManager {
  async function addTrigger(trigger: TriggerDefinition): Promise<void> {
    try {
      // Persist to IndexedDB
      await saveTriggerDefinition(trigger);

      // Register in in-memory registry
      registerTrigger(trigger);

      // Register with scheduler if enabled
      if (trigger.enabled) {
        const scheduler = useTriggerScheduler();
        scheduler.register(trigger);
      }

      // Update reactive refs
      refreshTriggers();

      debugLog('triggers', 'manager:added', { id: trigger.id, name: trigger.name });
    } catch (err) {
      logError(
        'triggers',
        'manager:addFailed',
        err instanceof Error ? err : new Error(String(err))
      );
      throw err;
    }
  }

  async function removeTrigger(id: string): Promise<void> {
    try {
      // Unregister from scheduler
      const scheduler = useTriggerScheduler();
      scheduler.unregister(id);

      // Delete from IndexedDB (handles def, state, history, and index)
      await deleteTriggerDefinition(id);

      // Update reactive refs
      refreshTriggers();

      debugLog('triggers', 'manager:removed', { id });
    } catch (err) {
      logError(
        'triggers',
        'manager:removeFailed',
        err instanceof Error ? err : new Error(String(err))
      );
      throw err;
    }
  }

  async function toggleTrigger(id: string): Promise<void> {
    try {
      const state = getTriggerState(id);
      const newEnabled = !state.enabled;

      // Update in-memory registry state
      const updated = updateTriggerState(id, { enabled: newEnabled });

      // Persist state change
      await saveTriggerState(id, updated);

      // Register/unregister with scheduler
      const scheduler = useTriggerScheduler();
      if (newEnabled) {
        // Need the full definition to re-register
        const allDefs = getAllTriggers();
        const def = allDefs.find((d) => d.id === id);
        if (def) {
          scheduler.register(def);
        }
      } else {
        scheduler.unregister(id);
        // Re-register in registry only (scheduler.unregister removes from both)
        const allDefs = getAllTriggers();
        const def = allDefs.find((d) => d.id === id);
        if (def) {
          registerTrigger(def);
          updateTriggerState(id, { enabled: false });
        }
      }

      // Update reactive refs
      refreshTriggers();

      debugLog('triggers', 'manager:toggled', { id, enabled: newEnabled });
    } catch (err) {
      logError(
        'triggers',
        'manager:toggleFailed',
        err instanceof Error ? err : new Error(String(err))
      );
      throw err;
    }
  }

  function cleanup(): void {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  return {
    triggers,
    triggerStates,
    firingHistories,
    initialized,
    addTrigger,
    removeTrigger,
    toggleTrigger,
    refreshTriggers,
    cleanup,
  };
}
