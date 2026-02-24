// web/composables/useBarGestures.ts
// Global double-tap / double-click: move the input bar (#bar) to the tap/click Y.
//
// This is a tiny, framework-agnostic helper restored from the legacy UX:
//   - Double-tap anywhere in the app window moves the bar near your finger
//   - Double-click with a mouse/trackpad does the same
//   - Double-tap/click ON the bar is reserved for theme cycling
//
// It attaches in the capture phase to avoid being blocked by deep widgets that
// call stopPropagation/stopImmediatePropagation on their own handlers.
//
// Integration: Emits intents via gestureAdapter.

import { gestureAdapter } from '@web/adapters/createInputAdapter';
import { debugLog } from '@web/utils/debugLog.js';

interface AppSettings {
  doubleTapDelay?: number;
}

let initialized = false;

// Configuration
const TAP_SLOP = 80; // px - spatial tolerance for pairing taps

// Touch tracking state
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;

// Pointer tracking state (for pen/stylus)
let lastPtrAt = 0;
let lastPtrX = 0;
let lastPtrY = 0;

/**
 * Get the double-tap delay from settings
 */
function getDoubleTapDelay(): number {
  const settings = (window as { AppSettings?: AppSettings }).AppSettings || {};
  return settings.doubleTapDelay || 300;
}

/**
 * Get the bar element
 */
function getBar(): HTMLElement | null {
  return document.getElementById('bar');
}

/**
 * Check if element is within footer buttons area (should be excluded from double-tap)
 */
function isWithinFooterButtons(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  try {
    const footerActions = el.closest('.header-actions, .footer-bottom-row, .skills-toggle');
    return !!footerActions;
  } catch (_) {
    return false;
  }
}

/**
 * Check if element is within a dialog/modal (should be excluded from double-tap gestures)
 */
function isWithinDialog(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  try {
    return !!el.closest('dialog');
  } catch (_) {
    return false;
  }
}

/**
 * Emit intent to move bar to absolute Y position
 */
function emitMoveIntent(clientY: number): void {
  if (!Number.isFinite(clientY)) return;
  gestureAdapter().emit('move', {
    target: 'inputBar',
    value: { y: clientY },
  });
}

/**
 * Emit intent to cycle theme (double-tap on bar)
 */
function emitThemeCycleIntent(): void {
  gestureAdapter().emit('cycle', {
    target: 'theme',
  });
}

/**
 * Mouse/trackpad: double-click handler
 */
function onDocDblClick(e: MouseEvent): void {
  try {
    // Ignore double-clicks on footer buttons or within dialogs
    if (isWithinFooterButtons(e.target) || isWithinDialog(e.target)) return;

    const bar = getBar();
    const onBar =
      bar && e.target && typeof bar.contains === 'function' && bar.contains(e.target as Node);

    if (onBar) {
      // Double-click on bar = cycle theme
      emitThemeCycleIntent();
      e.stopPropagation();
      return;
    }

    // If user is double-clicking to select text in an actual text element, don't move the bar.
    // Only check this if the click target is a text-containing element (not body/canvas/overlays).
    // This prevents false positives where browser selects whitespace/distant text on body clicks.
    const target = e.target as Element;
    const isTextElement =
      target &&
      target.tagName !== 'BODY' &&
      target.tagName !== 'CANVAS' &&
      !target.id?.includes('overlay') &&
      !target.id?.includes('container');

    if (isTextElement) {
      const sel = window.getSelection && window.getSelection();
      const selText = sel ? String(sel).trim() : '';
      if (sel && !sel.isCollapsed && selText.length > 0) return;
    }

    emitMoveIntent(e.clientY);
  } catch (_) {
    // best-effort only
  }
}

/**
 * Touch: detect double-tap anywhere
 */
function onDocTouchEnd(e: TouchEvent): void {
  try {
    // Ignore double-taps on footer buttons or within dialogs
    if (isWithinFooterButtons(e.target) || isWithinDialog(e.target)) {
      // Reset tap tracking so next tap elsewhere doesn't pair with this one
      lastTapAt = 0;
      lastTapX = 0;
      lastTapY = 0;
      return;
    }

    const bar = getBar();
    const onBar =
      bar && e.target && typeof bar.contains === 'function' && bar.contains(e.target as Node);
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return;

    const DOUBLE_TAP_DELAY = getDoubleTapDelay();
    const now = Date.now();
    const x = t.clientX;
    const y = t.clientY;
    const dt = now - lastTapAt;
    const dx = Math.abs(x - lastTapX);
    const dy = Math.abs(y - lastTapY);

    if (dt > 0 && dt < DOUBLE_TAP_DELAY && dx + dy < TAP_SLOP) {
      try {
        e.preventDefault();
      } catch (_) {
        // ignore
      }

      if (onBar) {
        emitThemeCycleIntent();
      } else {
        emitMoveIntent(y);
      }

      lastTapAt = 0;
      lastTapX = 0;
      lastTapY = 0;
      return;
    }

    lastTapAt = now;
    lastTapX = x;
    lastTapY = y;
  } catch (_) {
    // best-effort only
  }
}

/**
 * Pointer fallback: pair two pointerup events for devices routing touch via Pointer Events
 * Skip touch pointerType since touchend already handles those (avoids double-firing)
 */
function onDocPointerUp(e: PointerEvent): void {
  try {
    // Skip touch (handled by touchend) and mouse (handled by dblclick)
    // Only process pen/stylus which may not fire those events reliably
    if (e.pointerType === 'touch' || e.pointerType === 'mouse') return;

    // Ignore double-taps on footer buttons or within dialogs
    if (isWithinFooterButtons(e.target) || isWithinDialog(e.target)) {
      lastPtrAt = 0;
      lastPtrX = 0;
      lastPtrY = 0;
      return;
    }

    const bar = getBar();
    const onBar =
      bar && e.target && typeof bar.contains === 'function' && bar.contains(e.target as Node);
    const DOUBLE_TAP_DELAY = getDoubleTapDelay();
    const now = Date.now();
    const x = e.clientX;
    const y = e.clientY;
    const dt = now - lastPtrAt;
    const dx = Math.abs(x - lastPtrX);
    const dy = Math.abs(y - lastPtrY);

    if (dt > 0 && dt < DOUBLE_TAP_DELAY && dx + dy < TAP_SLOP) {
      if (onBar) {
        emitThemeCycleIntent();
      } else {
        emitMoveIntent(y);
      }

      lastPtrAt = 0;
      lastPtrX = 0;
      lastPtrY = 0;
      return;
    }

    lastPtrAt = now;
    lastPtrX = x;
    lastPtrY = y;
  } catch (_) {
    // best-effort only
  }
}

/**
 * Initialize bar gesture handlers
 * Safe to call multiple times - will only initialize once
 */
export function initBarGestures(): void {
  if (initialized) return;
  initialized = true;

  // Attach in capture phase so we see events even if inner widgets stop propagation.
  // Note: We only use dblclick (not click with detail>=2) because the click fallback
  // was calling stopPropagation() which interfered with Chrome's event timing.
  document.addEventListener('dblclick', onDocDblClick, true);
  document.addEventListener('touchend', onDocTouchEnd, { passive: false, capture: true });
  // Pointer fallback (capture phase)
  document.addEventListener('pointerup', onDocPointerUp, true);

  debugLog('skills', 'barGestures:init', {});
}

/**
 * Composable hook for bar gestures
 * Returns initialization function for manual control
 */
export function useBarGestures(): { init: () => void; isInitialized: () => boolean } {
  return {
    init: initBarGestures,
    isInitialized: () => initialized,
  };
}

export default useBarGestures;
