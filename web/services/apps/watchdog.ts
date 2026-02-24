/**
 * Watchdog Health Monitor
 *
 * Pings all running app iframes on a single interval (10s default).
 * Tracks consecutive missed pongs per instance. After 3 misses (30s),
 * the timeout callback fires and the instance is untracked.
 *
 * Memory monitoring is best-effort using Chrome's performance.memory API.
 * Fires onMemoryWarning when total JS heap exceeds threshold (50MB default).
 */

import type { AppInstance } from '@web/types/apps';

// ==================== TYPES ====================

export interface WatchdogOptions {
  readonly pingIntervalMs?: number;
  readonly maxMissedPongs?: number;
  readonly memoryThresholdBytes?: number;
  readonly sendPing: (instance: AppInstance) => void;
  readonly onTimeout: (instance: AppInstance) => void;
  readonly onMemoryWarning?: (usedBytes: number, thresholdBytes: number) => void;
}

export interface Watchdog {
  readonly track: (instance: AppInstance) => void;
  readonly untrack: (instanceId: string) => void;
  readonly recordPong: (instanceId: string) => void;
  readonly start: () => void;
  readonly stop: () => void;
  readonly getTrackedCount: () => number;
}

// ==================== CONSTANTS ====================

const DEFAULT_PING_INTERVAL_MS = 10_000;
const DEFAULT_MAX_MISSED_PONGS = 3;
const DEFAULT_MEMORY_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB

// ==================== FACTORY ====================

export function createWatchdog(options: WatchdogOptions): Watchdog {
  const pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
  const maxMissedPongs = options.maxMissedPongs ?? DEFAULT_MAX_MISSED_PONGS;
  const memoryThresholdBytes = options.memoryThresholdBytes ?? DEFAULT_MEMORY_THRESHOLD_BYTES;

  const trackedInstances = new Map<string, AppInstance>();
  const missedPongs = new Map<string, number>();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let memoryWarningFired = false;

  function checkMemory(): void {
    if (!options.onMemoryWarning) return;

    // Feature detection: Chrome-only performance.memory API
    if (typeof performance === 'undefined' || !('memory' in performance)) return;

    const memory = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
    const used = memory.usedJSHeapSize;

    if (used > memoryThresholdBytes) {
      if (!memoryWarningFired) {
        memoryWarningFired = true;
        options.onMemoryWarning(used, memoryThresholdBytes);
      }
    } else {
      // Reset flag when memory drops below threshold
      memoryWarningFired = false;
    }
  }

  function tick(): void {
    // Collect IDs to timeout to avoid mutating map during iteration
    const timeoutIds: string[] = [];

    for (const [id, instance] of trackedInstances) {
      const missed = (missedPongs.get(id) ?? 0) + 1;
      missedPongs.set(id, missed);

      if (missed >= maxMissedPongs) {
        timeoutIds.push(id);
      } else {
        // Null-check contentWindow before sending ping (Pitfall 5)
        if (instance.iframe.contentWindow === null) {
          // iframe removed from DOM but cleanup hasn't fired -- treat as missed
          missedPongs.set(id, missed);
        } else {
          options.sendPing(instance);
        }
      }
    }

    // Process timeouts after iteration
    for (const id of timeoutIds) {
      const instance = trackedInstances.get(id);
      if (instance) {
        untrack(id);
        options.onTimeout(instance);
      }
    }

    // Memory check once per tick (whole-page heap, not per-iframe)
    checkMemory();
  }

  function track(instance: AppInstance): void {
    // Only track instances that have completed handshake
    if (!instance.handshakeComplete) return;

    trackedInstances.set(instance.instanceId, instance);
    missedPongs.set(instance.instanceId, 0);
  }

  function untrack(instanceId: string): void {
    trackedInstances.delete(instanceId);
    missedPongs.delete(instanceId);
  }

  function recordPong(instanceId: string): void {
    if (trackedInstances.has(instanceId)) {
      missedPongs.set(instanceId, 0);
    }
  }

  function start(): void {
    if (intervalId !== null) return;
    intervalId = setInterval(tick, pingIntervalMs);
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    trackedInstances.clear();
    missedPongs.clear();
    memoryWarningFired = false;
  }

  function getTrackedCount(): number {
    return trackedInstances.size;
  }

  return {
    track,
    untrack,
    recordPong,
    start,
    stop,
    getTrackedCount,
  };
}
