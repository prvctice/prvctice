/**
 * Trigger Registry
 *
 * In-memory store for trigger definitions and runtime state.
 * Provides CRUD operations, state tracking, and firing history
 * with a ring buffer (max 50 entries per trigger).
 */

import type { TriggerDefinition, TriggerState, TriggerFiring } from '@web/types/triggers';
import { debugLog } from '@web/utils/debugLog';

// ==================== CONSTANTS ====================

const MAX_FIRINGS_HISTORY = 50;

// ==================== MODULE STATE ====================

const triggers = new Map<string, TriggerDefinition>();
const states = new Map<string, TriggerState>();
const firingHistories = new Map<string, TriggerFiring[]>();

// ==================== TRIGGER CRUD ====================

/**
 * Register a trigger definition.
 */
export function registerTrigger(def: TriggerDefinition): void {
  triggers.set(def.id, def);

  // Initialize state if not already tracked
  if (!states.has(def.id)) {
    states.set(def.id, {
      triggerId: def.id,
      firingCount: 0,
      lastFired: 0,
      enabled: def.enabled,
    });
  }

  if (!firingHistories.has(def.id)) {
    firingHistories.set(def.id, []);
  }

  debugLog('triggers', 'registry:register', { id: def.id, name: def.name });
}

/**
 * Unregister a trigger and clean up its state and history.
 */
export function unregisterTrigger(id: string): void {
  triggers.delete(id);
  states.delete(id);
  firingHistories.delete(id);

  debugLog('triggers', 'registry:unregister', { id });
}

/**
 * Get a trigger definition by ID.
 */
export function getTrigger(id: string): TriggerDefinition | undefined {
  return triggers.get(id);
}

/**
 * Get all registered trigger definitions.
 */
export function getAllTriggers(): ReadonlyArray<TriggerDefinition> {
  return [...triggers.values()];
}

// ==================== STATE TRACKING ====================

/**
 * Get runtime state for a trigger.
 * Returns default state if the trigger has no recorded state.
 */
export function getTriggerState(id: string): TriggerState {
  const existing = states.get(id);
  if (existing) return existing;

  // Return default state
  return {
    triggerId: id,
    firingCount: 0,
    lastFired: 0,
    enabled: true,
  };
}

/**
 * Immutably update trigger state. Returns the new state.
 */
export function updateTriggerState(id: string, partial: Partial<TriggerState>): TriggerState {
  const current = getTriggerState(id);
  const updated: TriggerState = {
    ...current,
    ...partial,
    triggerId: id, // Never allow triggerId to be overwritten
  };
  states.set(id, updated);

  debugLog('triggers', 'registry:stateUpdate', { id, firingCount: updated.firingCount });

  return updated;
}

// ==================== FIRING HISTORY ====================

/**
 * Record a firing event. Ring buffer capped at MAX_FIRINGS_HISTORY per trigger.
 */
export function recordFiring(firing: TriggerFiring): void {
  let history = firingHistories.get(firing.triggerId);
  if (!history) {
    history = [];
    firingHistories.set(firing.triggerId, history);
  }

  history.push(firing);

  // Ring buffer: trim oldest entries beyond max
  if (history.length > MAX_FIRINGS_HISTORY) {
    const excess = history.length - MAX_FIRINGS_HISTORY;
    history.splice(0, excess);
  }
}

/**
 * Get recent firing history for a trigger.
 */
export function getRecentFirings(
  id: string,
  limit = MAX_FIRINGS_HISTORY
): ReadonlyArray<TriggerFiring> {
  const history = firingHistories.get(id);
  if (!history || history.length === 0) return [];

  if (limit >= history.length) return [...history];
  return history.slice(-limit);
}

// ==================== TESTING ====================

/**
 * Reset all registry state. For testing only.
 */
export function resetRegistry(): void {
  triggers.clear();
  states.clear();
  firingHistories.clear();
}
