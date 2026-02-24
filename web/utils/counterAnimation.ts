/**
 * Spring-based counter animation utility
 *
 * Animates numeric values with spring physics -- overshoots then settles.
 * Uses a self-contained spring solver with stiffness/damping/mass parameters.
 */

import { prefersReducedMotion } from '@web/composables/useMotion.js';

/** Active animation tracking for cancellation */
const activeAnimations = new Map<HTMLElement, { cancel: () => void }>();

export interface CounterAnimationOptions {
  /** Number formatter (default: Math.round + toLocaleString) */
  format?: (value: number) => string;
  /** Spring stiffness (default: 180) */
  stiffness?: number;
  /** Spring damping (default: 24) */
  damping?: number;
  /** Spring mass (default: 1) */
  mass?: number;
}

/**
 * Animate a numeric value change on an element with spring physics.
 *
 * The element's textContent will be updated each frame with the interpolated value.
 * Uses font-variant-numeric: tabular-nums internally to prevent width oscillation.
 *
 * @param element - The DOM element to update
 * @param from - Starting value
 * @param to - Target value
 * @param options - Animation configuration
 */
export function animateCounter(
  element: HTMLElement,
  from: number,
  to: number,
  options: CounterAnimationOptions = {}
): void {
  if (!element) return;

  // Cancel any existing animation on this element
  animateCounterCancel(element);

  const { format = defaultFormat, stiffness = 180, damping = 24, mass = 1 } = options;

  // Ensure tabular-nums for stable width
  element.style.fontVariantNumeric = 'tabular-nums';

  // Reduced motion: instant display
  if (prefersReducedMotion()) {
    element.textContent = format(to);
    return;
  }

  // If from === to, no animation needed
  if (from === to) {
    element.textContent = format(to);
    return;
  }

  let cancelled = false;
  let rafId: number | null = null;

  // Spring solver parameters
  const omega0 = Math.sqrt(stiffness / mass); // natural frequency
  const zeta = damping / (2 * Math.sqrt(stiffness * mass)); // damping ratio
  const range = to - from;

  // Spring response function: returns value at time t (seconds)
  function springValue(t: number): number {
    if (zeta < 1) {
      // Underdamped -- oscillates then settles
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      const envelope = Math.exp(-zeta * omega0 * t);
      const displacement =
        envelope * (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t));
      return to - range * displacement;
    }
    // Critically damped or overdamped -- exponential approach
    const envelope = Math.exp(-omega0 * t);
    return to - range * envelope * (1 + omega0 * t);
  }

  // Estimate animation duration (when displacement < 0.5 of a unit)
  function estimateDuration(): number {
    const threshold = 0.5 / Math.abs(range || 1);
    for (let t = 0; t < 3; t += 0.016) {
      const displacement = Math.abs((springValue(t) - to) / range);
      if (displacement < threshold) return t;
    }
    return 2; // fallback: 2 seconds
  }

  const duration = estimateDuration();
  const startTime = performance.now();

  function tick(): void {
    if (cancelled) return;
    const elapsed = (performance.now() - startTime) / 1000;

    if (elapsed >= duration) {
      element.textContent = format(to);
      activeAnimations.delete(element);
      rafId = null;
      return;
    }

    const currentValue = springValue(elapsed);
    element.textContent = format(currentValue);
    rafId = requestAnimationFrame(tick);
  }

  activeAnimations.set(element, {
    cancel: () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  });

  rafId = requestAnimationFrame(tick);
}

/**
 * Cancel any active counter animation on an element.
 */
export function animateCounterCancel(element: HTMLElement): void {
  const active = activeAnimations.get(element);
  if (active) {
    active.cancel();
    activeAnimations.delete(element);
  }
}

function defaultFormat(value: number): string {
  return Math.round(value).toLocaleString();
}
