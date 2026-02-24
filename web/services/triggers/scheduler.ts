/**
 * Trigger Scheduler
 *
 * Main thread coordinator that orchestrates all trigger sources:
 * - Schedule/interval triggers via Web Worker (not throttled in background tabs)
 * - Event-based triggers via event bus subscriptions
 * - Time and data (context) conditions via 5-second polling
 * - App lifecycle triggers via app:launched/closed/focused events
 *
 * Safety enforcement is delegated to the evaluator's fireTrigger().
 */

import type { TriggerDefinition, WorkerInbound, WorkerOutbound } from '@web/types/triggers';
import type { AppEvents } from '@web/types/events';
import {
  registerTrigger,
  unregisterTrigger,
  getAllTriggers,
} from '@web/services/triggers/registry';
import { fireTrigger, evaluateConditions } from '@web/services/triggers/evaluator';
import { useEventBus } from '@web/services/eventBus';
import { debugLog, logError } from '@web/utils/debugLog';

// ==================== TYPES ====================

export interface TriggerScheduler {
  readonly start: () => void;
  readonly stop: () => void;
  readonly register: (trigger: TriggerDefinition) => void;
  readonly unregister: (triggerId: string) => void;
  readonly isRunning: () => boolean;
}

// ==================== CONSTANTS ====================

const DATA_POLL_INTERVAL_MS = 5_000;

/** App lifecycle events that can activate triggers */
const APP_LIFECYCLE_EVENTS: ReadonlyArray<keyof AppEvents> = [
  'app:launched',
  'app:closed',
  'app:focused',
];

// ==================== FACTORY ====================

export function createTriggerScheduler(): TriggerScheduler {
  let worker: Worker | null = null;
  let running = false;
  let dataPollTimer: ReturnType<typeof setInterval> | null = null;

  /** Cleanup functions for event bus subscriptions, keyed by triggerId */
  const cleanupHandlers = new Map<string, Array<() => void>>();

  /** Cleanup functions for app lifecycle subscriptions (shared across all triggers) */
  let lifecycleCleanups: Array<() => void> = [];

  const bus = useEventBus();

  // ==================== WORKER MANAGEMENT ====================

  function createWorker(): Worker {
    const w = new Worker(new URL('../../workers/trigger.worker.ts', import.meta.url), {
      type: 'module',
    });

    w.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;
      if (msg.type === 'fire') {
        debugLog('triggers', 'worker:fire', { id: msg.id, timestamp: msg.timestamp });
        void fireTrigger(msg.id, 0);
      }
    };

    w.onerror = (e) => {
      logError('triggers', 'worker:error', e.message || 'Unknown worker error');
    };

    return w;
  }

  function postToWorker(msg: WorkerInbound): void {
    if (worker) {
      worker.postMessage(msg);
    }
  }

  // ==================== EVENT SUBSCRIPTIONS ====================

  function subscribeEventTrigger(trigger: TriggerDefinition): void {
    const cleanups: Array<() => void> = cleanupHandlers.get(trigger.id) ?? [];

    for (const condition of trigger.conditions) {
      if (condition.type === 'event') {
        const eventName = condition.event as keyof AppEvents;
        const handler = () => {
          void fireTrigger(trigger.id, 0);
        };

        bus.on(eventName, handler);
        cleanups.push(() => bus.off(eventName, handler));

        debugLog('triggers', 'subscribe:event', { triggerId: trigger.id, event: condition.event });
      }
    }

    if (cleanups.length > 0) {
      cleanupHandlers.set(trigger.id, cleanups);
    }
  }

  function unsubscribeEventTrigger(triggerId: string): void {
    const cleanups = cleanupHandlers.get(triggerId);
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanupHandlers.delete(triggerId);
    }
  }

  // ==================== APP LIFECYCLE ====================

  function subscribeAppLifecycle(): void {
    for (const eventName of APP_LIFECYCLE_EVENTS) {
      const handler = () => {
        // Check all triggers for event conditions matching this lifecycle event
        const allTriggers = getAllTriggers();
        for (const trigger of allTriggers) {
          if (!trigger.enabled) continue;

          const hasMatchingEvent = trigger.conditions.some(
            (c) => c.type === 'event' && c.event === eventName
          );

          if (hasMatchingEvent) {
            void fireTrigger(trigger.id, 0);
          }
        }
      };

      bus.on(eventName, handler);
      lifecycleCleanups.push(() => bus.off(eventName, handler));
    }

    debugLog('triggers', 'subscribe:lifecycle', { events: APP_LIFECYCLE_EVENTS });
  }

  function unsubscribeAppLifecycle(): void {
    for (const cleanup of lifecycleCleanups) {
      cleanup();
    }
    lifecycleCleanups = [];
  }

  // ==================== DATA CONDITION POLLING ====================

  function startDataPoll(): void {
    dataPollTimer = setInterval(() => {
      pollDataConditions();
    }, DATA_POLL_INTERVAL_MS);
  }

  function stopDataPoll(): void {
    if (dataPollTimer !== null) {
      clearInterval(dataPollTimer);
      dataPollTimer = null;
    }
  }

  function pollDataConditions(): void {
    const now = new Date();
    const ctx: Record<string, unknown> = {
      time: {
        hour: now.getHours(),
        minute: now.getMinutes(),
        dayOfWeek: now.getDay(),
      },
    };

    const allTriggers = getAllTriggers();

    for (const trigger of allTriggers) {
      if (!trigger.enabled) continue;

      // Only poll triggers that have time or context conditions
      const hasTimeOrContext = trigger.conditions.some(
        (c) => c.type === 'time' || c.type === 'context'
      );

      if (!hasTimeOrContext) continue;

      // Filter to only time and context conditions for evaluation
      const pollableConditions = trigger.conditions.filter(
        (c) => c.type === 'time' || c.type === 'context'
      );

      if (pollableConditions.length === 0) continue;

      const shouldFire = evaluateConditions(pollableConditions, trigger.conditionMode, ctx);
      if (shouldFire) {
        debugLog('triggers', 'poll:fire', { triggerId: trigger.id });
        void fireTrigger(trigger.id, 0);
      }
    }
  }

  // ==================== REGISTER / UNREGISTER ====================

  function register(trigger: TriggerDefinition): void {
    // Store in registry
    registerTrigger(trigger);

    // Set up interval conditions in worker
    for (const condition of trigger.conditions) {
      if (condition.type === 'interval') {
        postToWorker({ type: 'register', id: trigger.id, intervalMs: condition.ms });
        debugLog('triggers', 'register:interval', { triggerId: trigger.id, ms: condition.ms });
      }
    }

    // Set up event conditions via bus
    subscribeEventTrigger(trigger);

    // Time and context conditions handled by data poll — no per-trigger setup needed

    debugLog('triggers', 'scheduler:register', { id: trigger.id, name: trigger.name });
  }

  function unregister(triggerId: string): void {
    // Remove from worker
    postToWorker({ type: 'unregister', id: triggerId });

    // Clean up event bus subscriptions
    unsubscribeEventTrigger(triggerId);

    // Remove from registry
    unregisterTrigger(triggerId);

    debugLog('triggers', 'scheduler:unregister', { id: triggerId });
  }

  // ==================== START / STOP ====================

  function start(): void {
    if (running) return;
    running = true;

    // Create Web Worker for interval/schedule triggers
    worker = createWorker();

    // Subscribe to app lifecycle events
    subscribeAppLifecycle();

    // Start data condition polling
    startDataPoll();

    debugLog('triggers', 'scheduler:started');
  }

  function stop(): void {
    if (!running) return;
    running = false;

    // Terminate worker
    if (worker) {
      worker.terminate();
      worker = null;
    }

    // Clean up all event bus subscriptions
    for (const [triggerId] of cleanupHandlers) {
      unsubscribeEventTrigger(triggerId);
    }
    cleanupHandlers.clear();

    // Unsubscribe from app lifecycle events
    unsubscribeAppLifecycle();

    // Stop data polling
    stopDataPoll();

    debugLog('triggers', 'scheduler:stopped');
  }

  function isRunning(): boolean {
    return running;
  }

  return {
    start,
    stop,
    register,
    unregister,
    isRunning,
  };
}

// ==================== SINGLETON ====================

let instance: TriggerScheduler | null = null;

/**
 * Get or create the singleton trigger scheduler.
 */
export function useTriggerScheduler(): TriggerScheduler {
  if (!instance) {
    instance = createTriggerScheduler();
  }
  return instance;
}
