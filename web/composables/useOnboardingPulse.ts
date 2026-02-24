/**
 * Onboarding Pulse Hints System
 * Provides subtle visual cues to help users discover key features.
 *
 * Pulses are one-time animations on specific UI elements that draw attention
 * without being disruptive. Once seen, they don't repeat.
 */

import { useOnboarding, ONBOARDING_TIMING } from './useOnboarding';
import { prefersReducedMotion } from './useMotion';

// ==================== TYPES ====================

export interface PulseTarget {
  id: string;
  /** CSS selector for the element to pulse */
  selector: string;
  /** Key in OnboardingSeen to check/mark */
  seenKey: 'helpPulse' | 'micPulse' | 'skillsPulse' | 'themePulse';
  /** Delay before showing pulse (ms from trigger) */
  delay: number;
  /** Condition that must be true to show */
  condition?: () => boolean;
  /** Event that triggers this pulse (alternative to delay) */
  triggerEvent?: string;
}

// ==================== PULSE TARGETS ====================

export const PULSE_TARGETS: PulseTarget[] = [
  {
    id: 'help',
    selector: '#help-toggle-button',
    seenKey: 'helpPulse',
    delay: ONBOARDING_TIMING.HELP_PULSE_DELAY_MS,
  },
  {
    id: 'mic',
    selector: '#mic-button',
    seenKey: 'micPulse',
    delay: ONBOARDING_TIMING.MIC_PULSE_DELAY_MS,
    triggerEvent: 'prv:first-message-sent',
  },
  {
    id: 'skills',
    selector: '#skills-toggle',
    seenKey: 'skillsPulse',
    delay: 2000,
    triggerEvent: 'prv:conversation-count-3',
  },
  {
    id: 'theme',
    selector: '.theme-switcher, #theme-button',
    seenKey: 'themePulse',
    delay: 2000,
    triggerEvent: 'prv:session-10-minutes',
  },
];

// ==================== STATE ====================

const pulseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const eventListeners: Map<string, () => void> = new Map();
let lastPulseTime = 0;
let initialized = false;

// ==================== HELPERS ====================

function applyPulse(selector: string): void {
  const el = document.querySelector(selector);
  if (!el) return;

  if (prefersReducedMotion()) {
    // Static highlight for reduced motion
    el.classList.add('onboarding-highlight');
    setTimeout(() => {
      el.classList.remove('onboarding-highlight');
    }, 4000);
  } else {
    // Animated pulse
    el.classList.add('onboarding-pulse');
    el.addEventListener(
      'animationend',
      () => {
        el.classList.remove('onboarding-pulse');
      },
      { once: true }
    );

    // Fallback removal after animation should be done
    setTimeout(() => {
      el.classList.remove('onboarding-pulse');
    }, 6500); // 3 cycles * 2s + buffer
  }
}

function canShowPulse(): boolean {
  const now = Date.now();
  if (now - lastPulseTime < ONBOARDING_TIMING.PULSE_COOLDOWN_MS) {
    return false;
  }
  return true;
}

// ==================== COMPOSABLE ====================

interface OnboardingPulseState {
  init: () => void;
  cleanup: () => void;
  triggerPulse: (targetId: string) => void;
}

export function useOnboardingPulse(): OnboardingPulseState {
  const onboarding = useOnboarding();

  function schedulePulse(target: PulseTarget): void {
    // Already seen
    if (onboarding.seen[target.seenKey]) return;

    // Already scheduled
    if (pulseTimers.has(target.id)) return;

    const timer = setTimeout(() => {
      pulseTimers.delete(target.id);

      // Double-check conditions
      if (onboarding.seen[target.seenKey]) return;
      if (!canShowPulse()) return;
      if (target.condition && !target.condition()) return;

      // Apply pulse
      applyPulse(target.selector);
      onboarding.markSeen(target.seenKey);
      lastPulseTime = Date.now();
    }, target.delay);

    pulseTimers.set(target.id, timer);
  }

  function triggerPulse(targetId: string): void {
    const target = PULSE_TARGETS.find((t) => t.id === targetId);
    if (!target) return;

    // Clear any existing timer
    const existingTimer = pulseTimers.get(targetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pulseTimers.delete(targetId);
    }

    // Schedule with the target's delay
    schedulePulse(target);
  }

  function handleTriggerEvent(targetId: string): void {
    triggerPulse(targetId);
  }

  function init(): void {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    // Refresh onboarding state
    onboarding.refresh();

    // Schedule initial pulses (no trigger event needed)
    for (const target of PULSE_TARGETS) {
      if (!target.triggerEvent && !onboarding.seen[target.seenKey]) {
        schedulePulse(target);
      }
    }

    // Set up event listeners for triggered pulses
    for (const target of PULSE_TARGETS) {
      if (target.triggerEvent && !onboarding.seen[target.seenKey]) {
        const handler = () => handleTriggerEvent(target.id);
        window.addEventListener(target.triggerEvent, handler);
        eventListeners.set(target.id, handler);
      }
    }
  }

  function cleanup(): void {
    if (!initialized) return;

    // Clear all timers
    for (const timer of pulseTimers.values()) {
      clearTimeout(timer);
    }
    pulseTimers.clear();

    // Remove all event listeners
    for (const target of PULSE_TARGETS) {
      if (target.triggerEvent) {
        const handler = eventListeners.get(target.id);
        if (handler) {
          window.removeEventListener(target.triggerEvent, handler);
        }
      }
    }
    eventListeners.clear();

    initialized = false;
  }

  return {
    init,
    cleanup,
    triggerPulse,
  };
}

export default useOnboardingPulse;
