/**
 * Ripple Effect Composable
 *
 * Manages ripple effects triggered by physics bounces or other events.
 * Provides a reactive list of active ripples and an event system for consumers.
 *
 * Usage:
 * - Provider (App.vue): const ctx = useRippleEffect(); provide(RippleEffectKey, ctx)
 * - Consumer: const { triggerRipple, onRipple } = useRippleConsumer()
 */
import { ref, onBeforeUnmount, inject, type Ref, type InjectionKey } from 'vue';
import { prefersReducedMotion } from './useMotion';
import { logError } from '@web/utils/debugLog.js';

// ==================== TYPES ====================

export interface RippleEvent {
  /** Unique identifier for this ripple */
  id: string;
  /** X position in screen coordinates */
  x: number;
  /** Y position in screen coordinates */
  y: number;
  /** Intensity of the ripple (0-1) */
  intensity: number;
  /** Timestamp when ripple was created */
  timestamp: number;
  /** Current radius (grows over time) */
  radius: number;
  /** Current opacity (decays over time) */
  opacity: number;
}

export interface RippleEffectContext {
  /** Reactive array of active ripples */
  ripples: Ref<RippleEvent[]>;
  /** Trigger a new ripple at position */
  triggerRipple: (x: number, y: number, intensity?: number) => void;
  /** Subscribe to ripple events, returns unsubscribe function */
  onRipple: (callback: (event: RippleEvent) => void) => () => void;
}

// ==================== CONFIG ====================

const RIPPLE_CONFIG = {
  /** Maximum expansion radius (px) */
  maxRadius: 400,
  /** Expansion speed (px per second) */
  speed: 200,
  /** Total animation duration (ms) */
  duration: 1200,
  /** Starting opacity (scaled by intensity) */
  initialOpacity: 0.8,
  /** Minimum opacity before removal */
  minOpacity: 0.01,
};

// ==================== INJECTION KEY ====================

export const RippleEffectKey: InjectionKey<RippleEffectContext> = Symbol('ripple-effect');

// ==================== IMPLEMENTATION ====================

let rippleIdCounter = 0;

function generateRippleId(): string {
  rippleIdCounter += 1;
  return `ripple-${rippleIdCounter}-${Date.now()}`;
}

/**
 * Creates a ripple effect context.
 * Call this once at the root and provide it to child components.
 */
export function useRippleEffect(): RippleEffectContext {
  const ripples: Ref<RippleEvent[]> = ref([]);
  const listeners: Set<(event: RippleEvent) => void> = new Set();
  let animationFrameId: number | null = null;
  let lastFrameTime = 0;

  /**
   * Animation loop - expands radius and decays opacity
   * Optimized: mutates ripple objects in-place to avoid GC pressure
   */
  function animate(currentTime: number): void {
    if (ripples.value.length === 0) {
      animationFrameId = null;
      return;
    }

    const deltaTime = lastFrameTime > 0 ? currentTime - lastFrameTime : 16;
    lastFrameTime = currentTime;
    const deltaSeconds = deltaTime / 1000;

    // Update each ripple in-place, track how many to keep
    let keepCount = 0;
    const arr = ripples.value;
    for (let i = 0; i < arr.length; i++) {
      const ripple = arr[i];
      if (!ripple) continue;

      const elapsed = currentTime - ripple.timestamp;
      const progress = Math.min(1, elapsed / RIPPLE_CONFIG.duration);

      // Expand radius linearly (mutate in place)
      ripple.radius = Math.min(
        RIPPLE_CONFIG.maxRadius * ripple.intensity,
        ripple.radius + RIPPLE_CONFIG.speed * deltaSeconds * ripple.intensity
      );

      // Decay opacity with easing (ease-out)
      const easedProgress = 1 - Math.pow(1 - progress, 2);
      ripple.opacity = RIPPLE_CONFIG.initialOpacity * ripple.intensity * (1 - easedProgress);

      // Keep ripple if still visible (compact array in-place)
      if (ripple.opacity >= RIPPLE_CONFIG.minOpacity) {
        arr[keepCount++] = ripple;
      }
    }
    arr.length = keepCount;

    // Trigger reactivity since we mutated in place
    ripples.value = arr;

    // Continue animation if ripples remain
    if (keepCount > 0) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = null;
      lastFrameTime = 0;
    }
  }

  /**
   * Start animation loop if not already running
   */
  function startAnimation(): void {
    if (animationFrameId === null) {
      lastFrameTime = 0;
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  /**
   * Trigger a new ripple at the specified position
   */
  function triggerRipple(x: number, y: number, intensity = 1): void {
    // Skip animation if user prefers reduced motion
    if (prefersReducedMotion()) {
      return;
    }

    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    const now = performance.now();

    const ripple: RippleEvent = {
      id: generateRippleId(),
      x,
      y,
      intensity: clampedIntensity,
      timestamp: now,
      radius: 0,
      opacity: RIPPLE_CONFIG.initialOpacity * clampedIntensity,
    };

    // Add to reactive list (push instead of spread to avoid allocation)
    ripples.value.push(ripple);

    // Notify listeners
    listeners.forEach((listener) => {
      try {
        listener(ripple);
      } catch (err) {
        logError('graphics', 'ripple:listener', err as Error);
      }
    });

    // Start animation loop
    startAnimation();
  }

  /**
   * Subscribe to ripple events
   * Returns an unsubscribe function
   */
  function onRipple(callback: (event: RippleEvent) => void): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  /**
   * Cleanup on unmount
   */
  onBeforeUnmount(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    listeners.clear();
    ripples.value = [];
  });

  return {
    ripples,
    triggerRipple,
    onRipple,
  };
}

/**
 * Consume the ripple effect context from a parent provider.
 * Throws if used outside a provider.
 */
export function useRippleConsumer(): RippleEffectContext {
  const context = inject(RippleEffectKey);
  if (!context) {
    throw new Error(
      '[useRippleConsumer] Must be used within a component that provides RippleEffectKey. ' +
        'Ensure a parent component calls useRippleEffect() and provides the context.'
    );
  }
  return context;
}

/**
 * Optional: Try to consume ripple context, returns null if not provided.
 * Useful for optional integration.
 */
export function useRippleConsumerOptional(): RippleEffectContext | null {
  return inject(RippleEffectKey, null);
}

export default useRippleEffect;
