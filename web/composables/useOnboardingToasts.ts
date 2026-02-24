/**
 * Onboarding Toasts System
 * Provides contextual, non-intrusive tips during first-time use.
 *
 * Triggers show hints based on user actions without being annoying.
 * Respects session limits and user dismissals.
 * All toasts render through the unified sileo notification system.
 */

import { useOnboarding, ONBOARDING_TIMING } from './useOnboarding';
import { useNotifs } from '@web/composables/useNotifs';
import { useEventBus } from '@web/services/eventBus';

// ==================== TYPES ====================

export interface OnboardingToastTrigger {
  id: string;
  /** Event name to listen for */
  event: string;
  /** Message to display */
  message: string;
  /** Optional icon (phosphor icon name) */
  icon?: string;
  /** Optional CTA button */
  cta?: {
    label: string;
    action: () => void;
  };
  /** Key in OnboardingSeen to mark as shown */
  seenKey:
    | 'toastVoice'
    | 'toastImage'
    | 'toastSkill'
    | 'toastNotes'
    | 'toastDoubletap'
    | 'toastProvider'
    | 'toastSkillDiscovery';
}

// ==================== TRIGGER DEFINITIONS ====================

function openHelpPane(): void {
  const win = window as unknown as { openHelpPane?: () => void };
  if (typeof win.openHelpPane === 'function') {
    win.openHelpPane();
  }
}

function openSkillsDock(): void {
  useEventBus().emit('panel:toggle', { panel: 'skills' });
}

export const ONBOARDING_TOASTS: OnboardingToastTrigger[] = [
  {
    id: 'first-voice',
    event: 'prv:voice-input-complete',
    message: "Voice commands unlocked. Try saying 'help' anytime.",
    icon: 'ph:microphone-stage',
    cta: {
      label: 'See commands',
      action: openHelpPane,
    },
    seenKey: 'toastVoice',
  },
  {
    id: 'first-image',
    event: 'prv:image-attached',
    message: 'Drop more images to compare, or ask about details.',
    icon: 'ph:image',
    seenKey: 'toastImage',
  },
  {
    id: 'first-skill',
    event: 'skill:executed',
    message: 'Skills adapt to your context. Check the dock for more.',
    icon: 'ph:sparkle',
    cta: {
      label: 'Open dock',
      action: openSkillsDock,
    },
    seenKey: 'toastSkill',
  },
  {
    id: 'first-notes',
    event: 'notes:opened',
    message: 'Notes sync across sessions. Try sending text to chat.',
    icon: 'ph:note',
    seenKey: 'toastNotes',
  },
  {
    id: 'doubletap-hint',
    event: 'prv:conversation-count-milestone', // Fired when conversation count hits 5
    message: 'Pro tip: Double-tap anywhere to move the input bar.',
    icon: 'ph:hand-tap',
    seenKey: 'toastDoubletap',
  },
  {
    id: 'provider-switch',
    event: 'prv:provider-changed',
    message: 'Each provider has different strengths. Claude excels at reasoning.',
    icon: 'ph:swap',
    cta: {
      label: 'Compare',
      action: () => {
        useEventBus().emit('panel:open', { panel: 'settings', pane: 'ai' });
      },
    },
    seenKey: 'toastProvider',
  },
  {
    id: 'skill-discovery',
    event: 'prv:message-count-milestone',
    message:
      'Skill Discovery: Prvctice will routinely review tool usage and patterns to suggest new skills to adapt tools to your workflow.',
    seenKey: 'toastSkillDiscovery',
  },
];

// ==================== STATE ====================

const toastQueue: OnboardingToastTrigger[] = [];
let toastShowing = false;
let listenersAttached = false;

// ==================== COMPOSABLE ====================

interface OnboardingToastsState {
  init: () => void;
  cleanup: () => void;
}

export function useOnboardingToasts(): OnboardingToastsState {
  const onboarding = useOnboarding();

  function processQueue(): void {
    if (toastQueue.length > 0 && !toastShowing) {
      const next = toastQueue.shift();
      if (next) {
        showToast(next);
      }
    }
  }

  function showToast(trigger: OnboardingToastTrigger): void {
    // Check if we can show toasts
    if (!onboarding.canShowToast.value) return;

    // Check if already seen
    if (onboarding.seen[trigger.seenKey]) return;

    // Mark as seen
    onboarding.markSeen(trigger.seenKey);
    onboarding.recordToastShown();

    toastShowing = true;

    const autoExpireMs = trigger.cta
      ? ONBOARDING_TIMING.TOAST_WITH_CTA_DURATION_MS
      : ONBOARDING_TIMING.TOAST_DURATION_MS;

    const notifs = useNotifs();
    notifs.push('onboarding', trigger.message, {
      action: trigger.cta ? { label: trigger.cta.label, handler: trigger.cta.action } : undefined,
      autoExpireMs,
      onRemove: (reason) => {
        toastShowing = false;
        if (reason === 'dismiss') {
          onboarding.recordToastDismissed();
          // Don't process queue immediately after dismiss
        } else {
          processQueue();
        }
      },
    });
  }

  function queueToast(trigger: OnboardingToastTrigger): void {
    // Don't queue if already seen
    if (onboarding.seen[trigger.seenKey]) return;

    // Don't queue duplicates
    if (toastQueue.some((t) => t.id === trigger.id)) return;

    if (toastShowing) {
      toastQueue.push(trigger);
    } else {
      showToast(trigger);
    }
  }

  function handleEvent(event: Event): void {
    const eventName = event.type;
    const trigger = ONBOARDING_TOASTS.find((t) => t.event === eventName);
    if (trigger) {
      queueToast(trigger);
    }
  }

  function init(): void {
    if (listenersAttached || typeof window === 'undefined') return;
    listenersAttached = true;

    // Attach listeners for all trigger events
    for (const trigger of ONBOARDING_TOASTS) {
      window.addEventListener(trigger.event, handleEvent);
    }
  }

  function cleanup(): void {
    if (!listenersAttached || typeof window === 'undefined') return;

    for (const trigger of ONBOARDING_TOASTS) {
      window.removeEventListener(trigger.event, handleEvent);
    }

    listenersAttached = false;
    toastShowing = false;
    toastQueue.length = 0;
  }

  return {
    init,
    cleanup,
  };
}

export default useOnboardingToasts;
