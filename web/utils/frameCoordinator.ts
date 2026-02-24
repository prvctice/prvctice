// web/utils/frameCoordinator.ts
// FrameCoordinator - Central animation loop manager
// Consolidates multiple RAF loops into a single coordinated tick

const FRAME_BASELINE_MS = 1000 / 60; // 16.67ms for 60fps
const MAX_DELTA_MULTIPLIER = 5; // Clamp to prevent huge jumps

// Priority levels (lower = earlier in tick order)
export const Priority = {
  TRACKING: 0, // Input processing (hand tracking, etc)
  PHYSICS: 1, // Physics updates (springs, collisions)
  RENDER: 2, // Visual updates (particles, effects)
} as const;

export type PriorityLevel = (typeof Priority)[keyof typeof Priority];

export interface FrameInfo {
  now: number;
  deltaMs: number;
  deltaFactor: number;
}

export type FrameCallback = (frameInfo: FrameInfo) => void;

interface Subscriber {
  callback: FrameCallback;
  priority: PriorityLevel;
  enabled: boolean;
}

class FrameCoordinator {
  private subscribers: Map<string, Subscriber> = new Map();
  private running = false;
  private lastTime: number | null = null;
  private rafId: number | null = null;
  private sortedSubscribers: Array<[string, Subscriber]> = [];
  private needsSort = false;

  /**
   * Subscribe to frame updates
   * @param id - Unique identifier
   * @param callback - Called with {now, deltaMs, deltaFactor}
   * @param priority - Lower = earlier (use Priority constants)
   * @returns Unsubscribe function
   */
  subscribe(
    id: string,
    callback: FrameCallback,
    priority: PriorityLevel = Priority.RENDER
  ): () => void {
    this.subscribers.set(id, { callback, priority, enabled: true });
    this.needsSort = true;

    // Auto-start if first subscriber
    if (this.subscribers.size === 1 && !this.running) {
      this.start();
    }

    return () => this.unsubscribe(id);
  }

  /**
   * Remove a subscriber
   */
  unsubscribe(id: string): void {
    this.subscribers.delete(id);
    this.needsSort = true;

    // Auto-stop if no subscribers
    if (this.subscribers.size === 0 && this.running) {
      this.stop();
    }
  }

  /**
   * Enable a subscriber without re-subscribing
   */
  enable(id: string): void {
    const sub = this.subscribers.get(id);
    if (sub) sub.enabled = true;
  }

  /**
   * Disable a subscriber without unsubscribing
   */
  disable(id: string): void {
    const sub = this.subscribers.get(id);
    if (sub) sub.enabled = false;
  }

  /**
   * Check if a subscriber is enabled
   */
  isEnabled(id: string): boolean {
    const sub = this.subscribers.get(id);
    return sub?.enabled ?? false;
  }

  /**
   * Start the animation loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = null;
    this.rafId = requestAnimationFrame((now) => this.tick(now));
  }

  /**
   * Stop the animation loop
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Internal tick - calls all subscribers in priority order
   */
  private tick(now: number): void {
    if (!this.running) return;

    // Calculate delta
    const stamp = typeof now === 'number' ? now : performance.now();
    if (this.lastTime === null) this.lastTime = stamp;
    const deltaMs = stamp - this.lastTime;
    this.lastTime = stamp;

    // Normalized delta factor (1.0 = 60fps)
    const deltaFactor = Math.min(Math.max(deltaMs / FRAME_BASELINE_MS, 0), MAX_DELTA_MULTIPLIER);

    // Sort subscribers by priority if needed
    if (this.needsSort) {
      this.sortedSubscribers = Array.from(this.subscribers.entries()).sort(
        (a, b) => a[1].priority - b[1].priority
      );
      this.needsSort = false;
    }

    // Frame info passed to callbacks
    const frameInfo: FrameInfo = { now: stamp, deltaMs, deltaFactor };

    // Call enabled subscribers in priority order
    for (const [id, sub] of this.sortedSubscribers) {
      if (sub.enabled) {
        try {
          sub.callback(frameInfo);
        } catch (err) {
          console.error(`[FrameCoordinator] Error in subscriber "${id}":`, err);
        }
      }
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }
}

// Singleton instance
const frameCoordinator = new FrameCoordinator();

// Expose globally for legacy script files
if (typeof window !== 'undefined') {
  window.frameCoordinator = frameCoordinator;
  window.FramePriority = Priority;
}

export { frameCoordinator, Priority as FramePriority };
export default frameCoordinator;
