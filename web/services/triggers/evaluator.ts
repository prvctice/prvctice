/**
 * Trigger Evaluator
 *
 * Safety gate and condition evaluation for the trigger system.
 * Provides:
 * - canFire() — checks enabled, cooldown, and max firings
 * - evaluateConditions() — evaluates all/any condition modes
 * - evaluateCondition() — handles each condition type
 * - executeTriggerAction() — dispatches trigger actions with recursion tracking
 * - fireTrigger() — public entry point wrapping registry + evaluation
 */

import type { TriggerCondition } from '@web/types/skills';
import type { TriggerState, TriggerDefinition } from '@web/types/triggers';
import type { AppEvents } from '@web/types/events';
import {
  getTrigger,
  getTriggerState,
  updateTriggerState,
  recordFiring,
  getRecentFirings,
} from '@web/services/triggers/registry';
import { saveTriggerState, saveFiringHistory } from '@web/services/triggers/storage';
import { useEventBus } from '@web/services/eventBus';
import { debugLog, debugWarn, logError } from '@web/utils/debugLog';

// ==================== CONSTANTS ====================

/**
 * Maximum recursion depth for trigger chains.
 * Prevents infinite loops when trigger A fires trigger B fires trigger A.
 */
export const RECURSION_LIMIT = 3;

// ==================== RECURSION TRACKING ====================

/**
 * Active firing stack: triggerId -> current depth.
 * Used to track nested trigger executions and prevent infinite loops.
 */
const firingStack = new Map<string, number>();

/**
 * Get the current recursion depth for a trigger.
 * Returns 0 if the trigger is not currently in the firing stack.
 */
export function getCurrentDepth(triggerId: string): number {
  return firingStack.get(triggerId) ?? 0;
}

// ==================== SAFETY GATE ====================

/**
 * Check whether a trigger is allowed to fire.
 * Validates enabled state, cooldown period, and max firings limit.
 */
export function canFire(
  state: TriggerState,
  cooldownMs: number,
  maxFirings?: number,
  now: number = Date.now()
): { ok: boolean; reason?: 'cooldown' | 'max_firings' | 'disabled' } {
  if (!state.enabled) {
    return { ok: false, reason: 'disabled' };
  }

  if (maxFirings !== undefined && state.firingCount >= maxFirings) {
    return { ok: false, reason: 'max_firings' };
  }

  if (state.lastFired > 0 && now - state.lastFired < cooldownMs) {
    return { ok: false, reason: 'cooldown' };
  }

  return { ok: true };
}

// ==================== CONDITION EVALUATION ====================

/**
 * Evaluate an array of conditions with 'all' or 'any' mode.
 */
export function evaluateConditions(
  conditions: ReadonlyArray<TriggerCondition>,
  mode: 'all' | 'any',
  ctx: Record<string, unknown>
): boolean {
  if (conditions.length === 0) return true;

  if (mode === 'all') {
    return conditions.every((c) => evaluateCondition(c, ctx));
  }
  return conditions.some((c) => evaluateCondition(c, ctx));
}

/**
 * Evaluate a single trigger condition against a context object.
 *
 * - time: checks hour/minute/day against current time in ctx
 * - event: returns true (already matched by event handler)
 * - context: dot-path resolution with operator comparison
 * - interval: returns true (already matched by worker)
 */
export function evaluateCondition(
  condition: TriggerCondition,
  ctx: Record<string, unknown>
): boolean {
  switch (condition.type) {
    case 'time': {
      const time = ctx.time as { hour?: number; minute?: number; dayOfWeek?: number } | undefined;
      if (!time) return false;

      const hourMatch = time.hour === condition.hour;
      const minuteMatch = time.minute === condition.minute;

      if (!hourMatch || !minuteMatch) return false;

      // Day check is optional
      if (condition.days && condition.days.length > 0 && time.dayOfWeek !== undefined) {
        return condition.days.includes(time.dayOfWeek);
      }

      return true;
    }

    case 'event':
      // Event conditions are already matched by the event handler subscription.
      // If we reach evaluation, the event has fired.
      return true;

    case 'context': {
      const value = getPathValue(ctx, condition.path);

      switch (condition.operator) {
        case 'exists':
          return value !== undefined && value !== null;
        case 'equals':
          return value === condition.value;
        case 'contains':
          return typeof value === 'string' && typeof condition.value === 'string'
            ? value.includes(condition.value)
            : false;
        case 'gt':
          return typeof value === 'number' && typeof condition.value === 'number'
            ? value > condition.value
            : false;
        case 'lt':
          return typeof value === 'number' && typeof condition.value === 'number'
            ? value < condition.value
            : false;
        default:
          return false;
      }
    }

    case 'interval':
      // Interval conditions are already matched by the worker timer.
      // If we reach evaluation, the interval has elapsed.
      return true;

    default:
      return false;
  }
}

/**
 * Resolve a dot-separated path against a nested object.
 * e.g., getPathValue({ a: { b: 42 } }, 'a.b') returns 42.
 */
export function getPathValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

// ==================== ACTION EXECUTION ====================

/**
 * Execute the action associated with a trigger.
 * Tracks recursion depth and enforces RECURSION_LIMIT.
 */
export async function executeTriggerAction(trigger: TriggerDefinition, depth = 0): Promise<void> {
  if (depth >= RECURSION_LIMIT) {
    debugWarn('triggers', 'recursion:limit', `Trigger ${trigger.id} blocked at depth ${depth}`);
    recordFiring({
      triggerId: trigger.id,
      timestamp: Date.now(),
      success: false,
      reason: 'recursion_limit',
    });
    return;
  }

  firingStack.set(trigger.id, depth);

  try {
    const { action } = trigger;

    switch (action.type) {
      case 'launch-app': {
        // Dynamic import to avoid circular dependency
        const { useWindowManager } = await import('@web/composables/useWindowManager');
        const { createAppRegistry } = await import('@web/services/apps/appRegistry');

        const registry = createAppRegistry();
        const definition = await registry.get(action.appId);

        if (definition) {
          const wm = useWindowManager();
          wm.openWindow(definition);
          debugLog('triggers', 'action:launch-app', { appId: action.appId, triggerId: trigger.id });
        } else {
          debugWarn('triggers', 'action:launch-app', `App not found: ${action.appId}`);
        }
        break;
      }

      case 'execute-skill': {
        // Dynamic import to avoid circular dependency
        const { useSkillCoordinator } = await import('@web/composables/useSkillCoordinator');
        const coordinator = useSkillCoordinator();
        await coordinator.execute(action.skillId);
        debugLog('triggers', 'action:execute-skill', {
          skillId: action.skillId,
          triggerId: trigger.id,
        });
        break;
      }

      case 'emit-event': {
        const bus = useEventBus();
        // Cast to keyof AppEvents since the event name is user-configured
        bus.emit(action.event as keyof AppEvents, action.payload as AppEvents[keyof AppEvents]);
        debugLog('triggers', 'action:emit-event', { event: action.event, triggerId: trigger.id });
        break;
      }

      default:
        debugWarn('triggers', 'action:unknown', `Unknown action type on trigger ${trigger.id}`);
    }
  } catch (err) {
    logError(
      'triggers',
      `action:${trigger.id}`,
      err instanceof Error ? err : new Error(String(err))
    );
  } finally {
    firingStack.delete(trigger.id);
  }
}

// ==================== PUBLIC ENTRY POINT ====================

/**
 * Fire a trigger by ID. Performs registry lookup, safety checks, state
 * updates, history recording, and action execution.
 *
 * @param triggerId - The trigger to fire
 * @param depth - Current recursion depth (0 for top-level fires)
 */
export async function fireTrigger(triggerId: string, depth = 0): Promise<void> {
  const trigger = getTrigger(triggerId);
  if (!trigger) {
    debugWarn('triggers', 'fire:notFound', `Trigger not found: ${triggerId}`);
    return;
  }

  const state = getTriggerState(triggerId);
  const now = Date.now();

  // Safety gate
  const check = canFire(state, trigger.cooldownMs, trigger.maxFirings, now);
  if (!check.ok) {
    debugLog('triggers', 'fire:blocked', { triggerId, reason: check.reason });
    recordFiring({
      triggerId,
      timestamp: now,
      success: false,
      reason: check.reason,
    });
    // Persist firing history (blocked firings are still recorded)
    void persistFiringData(triggerId);
    return;
  }

  // Update state before execution (prevents double-firing during async action)
  const updatedState = updateTriggerState(triggerId, {
    firingCount: state.firingCount + 1,
    lastFired: now,
  });

  // Record successful firing
  recordFiring({
    triggerId,
    timestamp: now,
    success: true,
  });

  debugLog('triggers', 'fire:execute', { triggerId, depth, firingCount: state.firingCount + 1 });

  // Execute the action
  await executeTriggerAction(trigger, depth);

  // Disable trigger if max firings reached after this fire
  if (trigger.maxFirings !== undefined && state.firingCount + 1 >= trigger.maxFirings) {
    const disabledState = updateTriggerState(triggerId, { enabled: false });
    debugLog('triggers', 'fire:maxReached', { triggerId, maxFirings: trigger.maxFirings });
    void saveTriggerState(triggerId, disabledState);
  } else {
    void saveTriggerState(triggerId, updatedState);
  }

  // Persist firing history to IndexedDB
  void persistFiringData(triggerId);
}

/**
 * Persist current firing history for a trigger to IndexedDB.
 */
async function persistFiringData(triggerId: string): Promise<void> {
  try {
    const firings = getRecentFirings(triggerId);
    await saveFiringHistory(triggerId, firings);
  } catch (err) {
    logError(
      'triggers',
      'persist:firingHistory',
      err instanceof Error ? err : new Error(String(err))
    );
  }
}
