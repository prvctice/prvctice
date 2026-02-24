/**
 * Trigger Persistence
 *
 * IndexedDB storage for trigger definitions, state, and firing history
 * using the existing kv store with a triggers/ key prefix.
 *
 * Storage layout:
 * - triggers/index        -> string[] (list of trigger IDs)
 * - triggers/defs/{id}    -> TriggerDefinition
 * - triggers/state/{id}   -> TriggerState
 * - triggers/history/{id} -> TriggerFiring[]
 */

import type { TriggerDefinition, TriggerState, TriggerFiring } from '@web/types/triggers';
import { kvGet, kvSet, kvRemove } from '@web/storage/storage';

// ==================== KEY HELPERS ====================

const KEY_INDEX = 'triggers/index';
const keyDef = (id: string): string => `triggers/defs/${id}`;
const keyState = (id: string): string => `triggers/state/${id}`;
const keyHistory = (id: string): string => `triggers/history/${id}`;

// ==================== INDEX MANAGEMENT ====================

async function getIndex(): Promise<string[]> {
  const ids = await kvGet<string[]>(KEY_INDEX);
  return ids ?? [];
}

async function setIndex(ids: ReadonlyArray<string>): Promise<void> {
  await kvSet(KEY_INDEX, [...ids]);
}

// ==================== TRIGGER DEFINITIONS ====================

/**
 * Save a trigger definition to IndexedDB.
 * Also updates the trigger index.
 */
export async function saveTriggerDefinition(trigger: TriggerDefinition): Promise<void> {
  await kvSet(keyDef(trigger.id), trigger);

  const ids = await getIndex();
  if (!ids.includes(trigger.id)) {
    await setIndex([...ids, trigger.id]);
  }
}

/**
 * Delete a trigger definition from IndexedDB.
 * Removes definition, state, history, and index entry.
 */
export async function deleteTriggerDefinition(id: string): Promise<void> {
  await kvRemove(keyDef(id));
  await kvRemove(keyState(id));
  await kvRemove(keyHistory(id));

  const ids = await getIndex();
  const updated = ids.filter((existing) => existing !== id);
  await setIndex(updated);
}

/**
 * Load all persisted trigger definitions.
 * Reads the index, then loads each definition by ID.
 */
export async function loadAllTriggerDefinitions(): Promise<TriggerDefinition[]> {
  const ids = await getIndex();
  if (ids.length === 0) return [];

  const definitions: TriggerDefinition[] = [];
  for (const id of ids) {
    const def = await kvGet<TriggerDefinition>(keyDef(id));
    if (def) {
      definitions.push(def);
    }
  }
  return definitions;
}

// ==================== TRIGGER STATE ====================

/**
 * Save runtime state for a trigger.
 */
export async function saveTriggerState(triggerId: string, state: TriggerState): Promise<void> {
  await kvSet(keyState(triggerId), state);
}

/**
 * Load runtime state for a trigger.
 * Returns null if no state is persisted.
 */
export async function loadTriggerState(triggerId: string): Promise<TriggerState | null> {
  const state = await kvGet<TriggerState>(keyState(triggerId));
  return state ?? null;
}

// ==================== FIRING HISTORY ====================

/**
 * Save firing history for a trigger.
 */
export async function saveFiringHistory(
  triggerId: string,
  firings: ReadonlyArray<TriggerFiring>
): Promise<void> {
  await kvSet(keyHistory(triggerId), [...firings]);
}

/**
 * Load firing history for a trigger.
 * Returns empty array if no history is persisted.
 */
export async function loadFiringHistory(triggerId: string): Promise<TriggerFiring[]> {
  const firings = await kvGet<TriggerFiring[]>(keyHistory(triggerId));
  return firings ?? [];
}
