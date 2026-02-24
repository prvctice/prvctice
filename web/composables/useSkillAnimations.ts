/**
 * Skill pill animation utilities
 *
 * Provides consistent animations for pill lifecycle events.
 * Extracted from SkillsDock.vue for reusability.
 */

import { animate } from '@motionone/dom';
import type { AnimateFunction } from '@web/types/motion.js';
import {
  prefersReducedMotion,
  motionDurations,
  motionEasings,
} from '@web/composables/useMotion.js';

// Cast animate to properly typed function that includes 'fill' option
// The motion library accepts more options than its types indicate (like 'fill')
const typedAnimate = animate as unknown as AnimateFunction;

export interface PillAnimationOptions {
  /** Stagger delay for entrance (default: 0.05) */
  staggerDelay?: number;
  /** Maximum total stagger (default: 0.25) */
  maxStagger?: number;
}

export interface Position {
  x: number;
  y: number;
}

/**
 * Animate a pill entering the carousel
 */
export function animatePillEnter(
  pill: HTMLElement,
  order = 0,
  options: PillAnimationOptions = {}
): void {
  if (!pill || prefersReducedMotion()) return;

  const { staggerDelay = 0.05, maxStagger = 0.25 } = options;
  const delay = Math.min(Math.max(order, 0) * staggerDelay, maxStagger);
  const previousTransition = pill.style.transition;

  pill.style.transition = 'none';
  const durations = motionDurations();
  const easings = motionEasings();

  pill.style.opacity = '0';
  pill.style.transform = 'translateY(12px)';

  typedAnimate(
    pill,
    {
      opacity: [0, 1],
      transform: ['translateY(12px)', 'translateY(0)'],
    },
    {
      duration: durations.medium,
      delay,
      easing: easings.emphasis,
      fill: 'forwards',
    }
  )
    .finished.catch(() => {})
    .finally(() => {
      pill.style.removeProperty('opacity');
      pill.style.removeProperty('transform');
      pill.style.transition = previousTransition;
    });
}

/**
 * Animate a pill being dropped back to the tray
 */
export function animatePillDrop(pill: HTMLElement): void {
  if (!pill || prefersReducedMotion()) return;

  const previousTransition = pill.style.transition;
  pill.style.transition = 'none';
  const durations = motionDurations();
  const easings = motionEasings();

  typedAnimate(
    pill,
    {
      opacity: [0.85, 1],
      transform: ['translateY(-6px)', 'translateY(0)'],
    },
    {
      duration: durations.short,
      easing: easings.snap,
      fill: 'forwards',
    }
  )
    .finished.catch(() => {})
    .finally(() => {
      pill.style.removeProperty('transform');
      pill.style.removeProperty('opacity');
      pill.style.transition = previousTransition;
    });
}

/**
 * Animate a pill being removed (scale down and fade)
 * Returns a promise that resolves when animation completes
 */
export function animatePillRemove(pill: HTMLElement): Promise<void> {
  if (!pill) return Promise.resolve();

  if (prefersReducedMotion()) {
    pill.remove();
    return Promise.resolve();
  }

  const durations = motionDurations();
  const easings = motionEasings();

  return typedAnimate(
    pill,
    {
      opacity: [1, 0],
      transform: ['scale(1)', 'scale(0.5)'],
    },
    {
      duration: durations.short,
      easing: easings.standard,
    }
  )
    .finished.catch(() => {})
    .then(() => {
      pill.remove();
    });
}

/**
 * Animate a combined pill appearing at midpoint with pop effect
 */
export function animateCombinedPillEnter(
  pill: HTMLElement,
  midpoint: Position,
  onPositioned?: () => void
): void {
  if (!pill) return;

  // Initial state
  Object.assign(pill.style, {
    opacity: '0',
    transform: 'scale(0.8)',
  });

  // Recenter based on actual dimensions after render
  requestAnimationFrame(() => {
    const actualWidth = pill.offsetWidth;
    const actualHeight = pill.offsetHeight;
    pill.style.left = midpoint.x - actualWidth / 2 + 'px';
    pill.style.top = midpoint.y - actualHeight / 2 + 'px';
    pill.style.width = actualWidth + 'px';

    // Callback for additional setup (like adding magnetic behavior)
    if (onPositioned) {
      onPositioned();
    }

    if (prefersReducedMotion()) {
      pill.style.opacity = '1';
      pill.style.transform = 'scale(1)';
      return;
    }

    const durations = motionDurations();
    const easings = motionEasings();

    typedAnimate(
      pill,
      {
        opacity: [0, 1],
        transform: ['scale(0.8)', 'scale(1.05)', 'scale(1)'],
      },
      {
        duration: durations.medium,
        easing: easings.emphasis,
      }
    )
      .finished.catch(() => {})
      .finally(() => {
        pill.style.removeProperty('opacity');
        pill.style.removeProperty('transform');
      });
  });
}

/**
 * Animate a highlight flash on an element
 * Used when trying to combine pills that already exist
 */
export function animateHighlightFlash(element: HTMLElement, duration = 800): void {
  if (!element) return;

  element.classList.add('skill-pill--highlight');
  setTimeout(() => {
    element.classList.remove('skill-pill--highlight');
  }, duration);
}

// ==================== MICRO-INTERACTIONS ====================

/**
 * Animate drag start - anticipation squash then lift
 * Disney principle: brief preparation before action
 */
export function animateDragStart(pill: HTMLElement): void {
  if (!pill || prefersReducedMotion()) return;

  const durations = motionDurations();

  // Anticipation: slight squash down, then spring up
  typedAnimate(
    pill,
    {
      transform: [
        'scale(1)', // Start
        'scale(1.02, 0.97) translateY(1px)', // Anticipation squash
        'scale(1.04)', // Lift with slight overshoot
      ],
      boxShadow: [
        '0 4px 16px rgba(0,0,0,0.25)',
        '0 6px 20px rgba(0,0,0,0.28)',
        '0 12px 32px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.08)',
      ],
    },
    {
      duration: durations.short,
      easing: [0.34, 1.56, 0.64, 1],
      fill: 'forwards',
    }
  );
}

/**
 * Animate drag end - soft droplet landing
 */
export function animateDragEnd(pill: HTMLElement): void {
  if (!pill || prefersReducedMotion()) return;

  const durations = motionDurations();

  // Soft droplet: gentle squash then slow ease back (no bounce)
  typedAnimate(
    pill,
    {
      transform: [
        'scale(1.03, 0.97)', // Soft squash on landing
        'scale(1)',
      ],
      boxShadow: ['0 12px 32px rgba(0,0,0,0.35)', '0 4px 16px rgba(0,0,0,0.25)'],
    },
    {
      duration: durations.medium,
      easing: [0.4, 0, 0.2, 1], // Slow ease-out, no overshoot
    }
  )
    .finished.catch(() => {})
    .finally(() => {
      pill.style.removeProperty('transform');
      pill.style.removeProperty('box-shadow');
    });
}

/**
 * Animate near-combine preview glow
 * Shows visual feedback when pills are close enough to merge
 */
export function animateCombinePreviewGlow(pill: HTMLElement, intensity: number): void {
  if (!pill) return;

  if (intensity <= 0) {
    pill.style.removeProperty('--combine-glow-opacity');
    pill.classList.remove('skill-pill--combine-preview');
    return;
  }

  pill.classList.add('skill-pill--combine-preview');
  pill.style.setProperty('--combine-glow-opacity', String(Math.min(1, intensity)));
}

/**
 * Animate settle after dropping on zone - soft droplet
 */
export function animateZoneSettle(pill: HTMLElement): void {
  if (!pill || prefersReducedMotion()) return;

  const durations = motionDurations();

  typedAnimate(
    pill,
    {
      transform: ['scale(1.04, 0.96)', 'scale(1)'],
    },
    {
      duration: durations.medium,
      easing: [0.4, 0, 0.2, 1], // Gentle ease-out
    }
  );
}

/**
 * Composable hook for skill animations
 */
export function useSkillAnimations() {
  return {
    animatePillEnter,
    animatePillDrop,
    animatePillRemove,
    animateCombinedPillEnter,
    animateHighlightFlash,
    animateDragStart,
    animateDragEnd,
    animateCombinePreviewGlow,
    animateZoneSettle,
    prefersReducedMotion,
  };
}

export default useSkillAnimations;
