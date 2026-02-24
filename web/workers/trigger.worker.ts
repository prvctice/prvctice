/**
 * Trigger Scheduler Worker
 *
 * Runs a 1-second interval loop to check schedule-based triggers.
 * Posts 'fire' messages to the main thread when triggers are due.
 *
 * Web Workers are NOT throttled in background tabs (unlike main thread
 * setInterval which Chrome throttles to once per minute), making them
 * reliable for time-based scheduling.
 *
 * This worker does ONLY timing — no Vue imports, no state management,
 * no execution logic. All of that stays on the main thread.
 */

// ==================== TYPES (redeclared, no path alias imports in workers) ====================

interface WorkerRegisterMsg {
  readonly type: 'register';
  readonly id: string;
  readonly intervalMs: number;
}

interface WorkerUnregisterMsg {
  readonly type: 'unregister';
  readonly id: string;
}

type WorkerInbound = WorkerRegisterMsg | WorkerUnregisterMsg;

interface WorkerFireMsg {
  readonly type: 'fire';
  readonly id: string;
  readonly timestamp: number;
}

// ==================== STATE ====================

interface ScheduleEntry {
  id: string;
  intervalMs: number;
  lastFired: number;
}

const activeTriggers = new Map<string, ScheduleEntry>();

// ==================== MESSAGE HANDLER ====================

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'register': {
      activeTriggers.set(msg.id, {
        id: msg.id,
        intervalMs: msg.intervalMs,
        lastFired: Date.now(),
      });
      break;
    }

    case 'unregister': {
      activeTriggers.delete(msg.id);
      break;
    }
  }
};

// ==================== TIMER LOOP ====================

/**
 * Check every second whether any registered trigger intervals have elapsed.
 * When due, post a fire message to the main thread and update lastFired.
 */
setInterval(() => {
  const now = Date.now();

  for (const [, entry] of activeTriggers) {
    if (now - entry.lastFired >= entry.intervalMs) {
      const fireMsg: WorkerFireMsg = {
        type: 'fire',
        id: entry.id,
        timestamp: now,
      };
      self.postMessage(fireMsg);
      entry.lastFired = now;
    }
  }
}, 1000);
