/**
 * Dotmatrix Init Composable
 * Handles initialization of the dotmatrix animation
 */
import { canStartDotMatrix } from '@web/utils/visuals.js';
import { useEventBus } from '@web/services/eventBus';
// Window types imported from global.d.ts

interface DotmatrixInitAPI {
  isDotmatrixDisabled: () => boolean;
  startDotMatrixSafely: (force?: boolean) => void;
  primeDotmatrixInteractivity: () => void;
  initDotmatrix: () => (() => void) | null;
  resetDotmatrixForNewChat: () => void;
}

/**
 * Check if dotmatrix is disabled globally
 */
function isDotmatrixDisabled(): boolean {
  try {
    return window.__disableDotmatrix === true;
  } catch (_) {
    return false;
  }
}

/**
 * Safely start the dotmatrix animation
 */
export function startDotMatrixSafely(force: boolean = false): void {
  try {
    if (!canStartDotMatrix()) return;
    if (typeof window.startDotMatrix === 'function') window.startDotMatrix(force);
  } catch (_) {}
}

/**
 * Check if a chat session has already started
 */
function hasChatStarted(): boolean {
  try {
    // Check the global flag set by firstPromptSent handler
    if (window.__prvChatStarted === true) return true;
    // Fallback: check if there are any messages in the chat
    if (window.__flags && window.__flags.__VUE_CHAT_ACTIVE) {
      // Try to detect if messages exist via DOM
      const chatWin = document.getElementById('chat-window');
      if (chatWin) {
        const hasMessages = chatWin.querySelector('.message, [data-index]');
        if (hasMessages) return true;
      }
    }
  } catch (_) {}
  return false;
}

/**
 * Prime dotmatrix interactivity settings
 * Only enables interactive mode if chat has not started yet
 */
export function primeDotmatrixInteractivity(): void {
  try {
    // Don't re-enable interactive mode if chat has already started
    if (hasChatStarted()) {
      return;
    }
    if (typeof window.setDotMatrixOverlaySuppressed === 'function') {
      window.setDotMatrixOverlaySuppressed(false);
    }
    if (typeof window.setDotMatrixInteractive === 'function') {
      window.setDotMatrixInteractive(true);
    }
  } catch (_) {}
}

/**
 * Initialize dotmatrix animation on mount
 * Includes retry logic to handle race conditions with DOM
 */
export function initDotmatrix(): (() => void) | null {
  if (isDotmatrixDisabled()) {
    return null;
  }

  // Remove glass overlay visibility
  const overlay = document.getElementById('glass-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
  }

  // Try to start immediately if available
  const kick = (): void => startDotMatrixSafely();
  if (typeof window.startDotMatrix === 'function') {
    startDotMatrixSafely();
  } else {
    useEventBus().once('dotmatrix:ready', kick);
  }

  // Track pending timeout for cleanup
  let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  // Retry logic to ensure canvas is visible
  let tries = 12; // ~1.2s
  const retryStart = (): void => {
    if (cancelled) return;

    try {
      const cc = document.getElementById('canvas-container');
      if (cc && typeof window.startDotMatrix === 'function') {
        // Check if already starting
        if (
          window.dotMatrixMotion &&
          typeof window.dotMatrixMotion.isStarting === 'function' &&
          window.dotMatrixMotion.isStarting()
        ) {
          return;
        }

        if (!canStartDotMatrix()) return;
        startDotMatrixSafely(true);

        // If canvas is visible, stop retrying
        const c = cc.querySelector('canvas');
        const visible =
          c &&
          window.getComputedStyle(c).display !== 'none' &&
          window.getComputedStyle(cc).display !== 'none';
        if (visible) return;

        // Check if already active
        if (
          window.dotMatrixMotion &&
          typeof window.dotMatrixMotion.isActive === 'function' &&
          window.dotMatrixMotion.isActive()
        ) {
          return;
        }
      }
    } catch (_) {}

    if (--tries > 0 && !cancelled) {
      retryTimeoutId = setTimeout(retryStart, 100);
    }
  };

  retryStart();

  // Return cleanup function
  return () => {
    cancelled = true;
    if (retryTimeoutId !== null) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
    window.removeEventListener('dotmatrixReady', kick);
  };
}

/**
 * Reset dotmatrix to ready state (e.g., after new chat)
 */
export function resetDotmatrixForNewChat(): void {
  try {
    // Reset the chat started flag so interactivity can be re-enabled
    window.__prvChatStarted = false;
    if (typeof window.setDotMatrixOverlaySuppressed === 'function') {
      window.setDotMatrixOverlaySuppressed(false);
    }
    if (typeof window.setDotMatrixInteractive === 'function') {
      window.setDotMatrixInteractive(true);
    }
    // Defer spheres visibility and animation start to run after Vue watchers.
    // The sending watcher calls hideThinking() which sets spheresVisible=false,
    // so we must restore visibility after that watcher processes.
    setTimeout(() => {
      try {
        if (typeof window.setDotMatrixSpheresVisible === 'function') {
          window.setDotMatrixSpheresVisible(true);
        }
        startDotMatrixSafely(true);
      } catch (_) {}
    }, 0);
  } catch (_) {}
}

/**
 * Composable for dotmatrix initialization
 */
export function useDotmatrixInit(): DotmatrixInitAPI {
  return {
    isDotmatrixDisabled,
    startDotMatrixSafely,
    primeDotmatrixInteractivity,
    initDotmatrix,
    resetDotmatrixForNewChat,
  };
}
