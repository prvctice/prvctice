/**
 * First-Run State Composable
 * Manages the "screensaver" state on app launch and transitions out of it
 * on first meaningful user interaction.
 *
 * Initial state:
 * - Input bar floats at center (`.initial-position`)
 * - Dotmatrix animation is active
 *
 * Exit triggers:
 * - Header button clicks (not hamburger menu)
 * - Skill pill clicks
 * - Skill pill drag start
 * - First prompt sent
 *
 * Migrated from public/scripts/ui/theme-and-ui.js
 */

import { ref } from 'vue';
import { useEventBus } from '@web/services/eventBus';
import { getAppSettings } from '@web/config/appSettings.js';

interface UseFirstRunReturn {
  isFirstRunState: () => boolean;
  exitFirstRunState: (lowerBar?: boolean) => void;
  initFirstRunListeners: () => () => void;
}

// Track whether first interaction has been processed
const firstInteractionProcessed = ref(false);

/**
 * Check if the app is still in the first-run (screensaver) state
 */
function isFirstRunState(): boolean {
  try {
    const settings = getAppSettings();
    if (settings?.centerInputBarOnStart === false) {
      return false;
    }
    const bar = document.getElementById('bar');
    return !!bar && bar.classList.contains('initial-position');
  } catch (_) {
    return false;
  }
}

/**
 * Exit the first-run state
 * @param lowerBar - Whether to lower the input bar to bottom (default: true)
 */
function exitFirstRunState(lowerBar = true): void {
  if (firstInteractionProcessed.value) return;
  if (!isFirstRunState()) return;

  firstInteractionProcessed.value = true;

  if (lowerBar && typeof window.lowerBarToBottom === 'function') {
    try {
      window.lowerBarToBottom();
    } catch (_) {}
  }
}

/**
 * Initialize first-run event listeners
 * @returns Cleanup function to remove listeners
 */
function initFirstRunListeners(): () => void {
  const bus = useEventBus();
  const cleanupFns: (() => void)[] = [];

  // Listen for first prompt event via event bus
  const onFirstPrompt = (): void => {
    exitFirstRunState(true);
  };
  bus.on('chat:first-prompt', onFirstPrompt);
  cleanupFns.push(() => bus.off('chat:first-prompt', onFirstPrompt));

  // Global click handler (capture phase) for header buttons and skill pills
  const globalClickHandler = (ev: MouseEvent | TouchEvent): void => {
    if (firstInteractionProcessed.value) return;
    if (!isFirstRunState()) return;

    const path = ev.composedPath ? ev.composedPath() : [ev.target];

    // Ignore hamburger menu
    if (path.some((el) => el && (el as Element).id === 'menu-button')) {
      return;
    }

    // Header nav tools (any button inside <header> except hamburger)
    const isHeaderButton = path.some((el) => {
      if (!el || typeof (el as Element).closest !== 'function') return false;
      const btn = (el as Element).closest('button');
      return btn && btn.id !== 'menu-button' && !!btn.closest('header');
    });

    // Skill pill click (exclude overflow/collapse buttons which are UI-only)
    const isSkillPill = path.some(
      (el) =>
        el &&
        (el as Element).classList &&
        (el as Element).classList.contains('skill-pill') &&
        !(el as Element).classList.contains('skill-overflow-btn')
    );

    if (isHeaderButton || isSkillPill) {
      exitFirstRunState(true);
    }
  };

  // Drag start handler for skill pills
  const globalDragHandler = (ev: DragEvent): void => {
    if (firstInteractionProcessed.value) return;
    if (!isFirstRunState()) return;

    const path = ev.composedPath ? ev.composedPath() : [ev.target];
    const isSkillPill = path.some(
      (el) => el && (el as Element).classList && (el as Element).classList.contains('skill-pill')
    );

    if (isSkillPill) {
      // Exit first-run but don't move bar when dragging pill
      exitFirstRunState(false);
    }
  };

  // Attach listeners (capture phase to catch events early)
  document.addEventListener('click', globalClickHandler, true);
  document.addEventListener('touchstart', globalClickHandler as EventListener, true);
  document.addEventListener('dragstart', globalDragHandler, true);

  cleanupFns.push(() => {
    document.removeEventListener('click', globalClickHandler, true);
    document.removeEventListener('touchstart', globalClickHandler as EventListener, true);
    document.removeEventListener('dragstart', globalDragHandler, true);
  });

  // Also listen for legacy firstPromptSent event during transition period
  const legacyHandler = (): void => {
    exitFirstRunState(true);
  };
  window.addEventListener('firstPromptSent', legacyHandler, true);
  cleanupFns.push(() => {
    window.removeEventListener('firstPromptSent', legacyHandler, true);
  });

  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}

/**
 * Composable for first-run state management
 */
export function useFirstRun(): UseFirstRunReturn {
  return {
    isFirstRunState,
    exitFirstRunState,
    initFirstRunListeners,
  };
}
