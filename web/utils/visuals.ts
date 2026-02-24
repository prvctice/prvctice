// web/utils/visuals.ts
// Centralized helpers for toggling the glass overlay and dot-matrix animation.
// These calls are idempotent and avoid event dispatch to prevent feedback loops.

import { storage } from '../storage/storage.js';
import { STORAGE_KEYS } from '../constants/storageKeys.js';
import { debugLog } from './debugLog.js';

// Window types imported from global.d.ts

interface VisualRefs {
  overlay: HTMLElement | null;
  thinkingShell: HTMLElement | null;
}

function refs(): VisualRefs {
  try {
    return {
      overlay: document.getElementById('glass-overlay'),
      thinkingShell: document.querySelector('#app-shell .thinking'),
    };
  } catch (_) {
    return { overlay: null, thinkingShell: null };
  }
}

function logThinking(action: string): void {
  try {
    if (typeof window === 'undefined') return;
    const shouldLog = window.__debugPointer === true || window.__debugThinking === true;
    if (!shouldLog || typeof console === 'undefined') return;
    const { overlay, thinkingShell } = refs();
    const payload = {
      overlayVisible: Boolean(overlay && overlay.classList.contains('visible')),
      overlayPointer: overlay ? getComputedStyle(overlay).pointerEvents : 'n/a',
      thinkingSending: Boolean(thinkingShell && thinkingShell.classList.contains('sending')),
    };
    debugLog('graphics', `thinking:${action}`, payload);
  } catch (_) {
    // Silent
  }
}

function prefersReducedMotion(): boolean {
  try {
    if (window.dotMatrixMotion && typeof window.dotMatrixMotion.isReduced === 'function') {
      return window.dotMatrixMotion.isReduced();
    }
    if (typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      return !!(mq && mq.matches);
    }
  } catch (_) {
    // Silent
  }
  return false;
}

export function canStartDotMatrix(): boolean {
  return !prefersReducedMotion();
}

function readKeepGlowPreference(): boolean {
  try {
    const stored = storage.mirror.get(STORAGE_KEYS.DOTMATRIX_KEEP_GLOW);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch (_) {
    // Silent
  }
  return true;
}

let keepGlowPreference = readKeepGlowPreference();

function shouldKeepGlow(): boolean {
  return keepGlowPreference;
}

interface KeepAtmosphereEventDetail {
  keep?: boolean;
}

try {
  document.addEventListener('dotmatrixKeepAtmosphereChange', ((
    event: CustomEvent<KeepAtmosphereEventDetail>
  ) => {
    try {
      const keep =
        event && event.detail && typeof event.detail.keep === 'boolean'
          ? event.detail.keep
          : !(event && event.detail && event.detail.keep === false);
      keepGlowPreference = keep;
      if (!keep) {
        try {
          if (typeof window.setDotMatrixSpheresVisible === 'function') {
            window.setDotMatrixSpheresVisible(true);
          }
        } catch (_) {
          // Silent
        }
      }
    } catch (_) {
      keepGlowPreference = readKeepGlowPreference();
    }
  }) as EventListener);
} catch (_) {
  // Silent
}

export function showThinking(): void {
  try {
    const { overlay, thinkingShell } = refs();
    if (overlay) overlay.classList.add('visible');
    if (thinkingShell) thinkingShell.classList.add('sending');
    try {
      if (typeof window !== 'undefined') window.__dotmatrixThinkingActive = true;
    } catch (_) {
      // Silent
    }
    // Do not show animation while reading panes are open
    const notesContainer = document.getElementById('notes-container');
    const helpContainer = document.getElementById('help-container');
    const notesOpen = !!notesContainer && !notesContainer.classList.contains('hidden');
    const helpOpen = !!helpContainer && !helpContainer.classList.contains('hidden');
    if (!notesOpen && !helpOpen && canStartDotMatrix()) {
      // Force start so it restarts after any prior stop suppression.
      try {
        if (typeof window.setDotMatrixSpheresVisible === 'function')
          window.setDotMatrixSpheresVisible(true);
      } catch (_) {
        // Silent
      }
      if (typeof window.startDotMatrix === 'function') window.startDotMatrix(true);
    } else {
      if (shouldKeepGlow()) {
        try {
          if (typeof window.setDotMatrixSpheresVisible === 'function') {
            window.setDotMatrixSpheresVisible(false);
          }
        } catch (_) {
          // Silent
        }
      } else {
        try {
          if (typeof window.stopDotMatrix === 'function') window.stopDotMatrix();
        } catch (_) {
          // Silent
        }
      }
    }
    logThinking('show');
  } catch (_) {
    // Silent
  }
}

export function hideThinking(): void {
  try {
    const { overlay, thinkingShell } = refs();
    if (overlay) overlay.classList.remove('visible');
    if (thinkingShell) thinkingShell.classList.remove('sending');
    try {
      if (typeof window !== 'undefined') window.__dotmatrixThinkingActive = false;
    } catch (_) {
      // Silent
    }
    if (shouldKeepGlow()) {
      if (typeof window.setDotMatrixSpheresVisible === 'function') {
        window.setDotMatrixSpheresVisible(false);
      }
    } else if (typeof window.stopDotMatrix === 'function') {
      window.stopDotMatrix();
    }
    logThinking('hide');
  } catch (_) {
    // Silent
  }
}

export function resetThinkingOverlay(): void {
  const doReset = (): void => {
    try {
      const { overlay, thinkingShell } = refs();
      if (overlay) overlay.classList.remove('visible');
      if (thinkingShell) thinkingShell.classList.remove('sending');
      try {
        if (typeof window !== 'undefined') window.__dotmatrixThinkingActive = false;
      } catch (_) {
        // Silent
      }
      logThinking('reset');
    } catch (_) {
      // Silent
    }
    // Fallback: directly query the element in case refs() failed or element was added later
    // This handles race conditions in Electron where DOM may not be ready
    try {
      const fallbackOverlay = document.getElementById('glass-overlay');
      if (fallbackOverlay && fallbackOverlay.classList.contains('visible')) {
        fallbackOverlay.classList.remove('visible');
      }
    } catch (_) {
      // Silent
    }
  };

  // Execute immediately
  doReset();

  // Also schedule a deferred reset to handle race conditions with Vue watchers
  // that may re-add the visible class during the same tick
  try {
    setTimeout(doReset, 0);
    // Extra safety: also clear after a short delay in case of async state updates
    setTimeout(doReset, 50);
  } catch (_) {
    // Silent
  }
}

export default { showThinking, hideThinking, resetThinkingOverlay };
