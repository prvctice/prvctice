// web/utils/iosViewport.ts
// iOS Safari keyboard + visualViewport adjustments (mobile only)
// - Tracks visual viewport changes to compute keyboard height
// - Sets CSS var `--kb` and toggles `kb-open` class on <html>
// - No-ops on non-iOS browsers

let initialized = false;
let prevKb = -1;
let rafId: number | null = null;

/**
 * Basic iOS detection, including iPadOS that reports as Mac
 */
function isIOS(): boolean {
  try {
    const ua = navigator.userAgent || '';
    const plat = navigator.platform || '';
    const maxTP = navigator.maxTouchPoints || 0;
    const isIThing = /iP(hone|od|ad)/.test(ua);
    const isAppleTouchMac = plat === 'MacIntel' && maxTP > 1; // iPadOS
    // Exclude iOS Chrome/Firefox quirks - we only need WebKit visualViewport behaviour
    const isWebKit = /WebKit/.test(ua) && !/Edge|EdgiOS|OPiOS|CriOS|FxiOS/.test(ua);
    return (isIThing || isAppleTouchMac) && isWebKit;
  } catch (_) {
    return false;
  }
}

/**
 * Update keyboard height CSS variable and class
 */
function update(): void {
  rafId = null;
  const vv = window.visualViewport;
  if (!vv) return;

  // Keyboard height approximation: layout viewport minus visual viewport
  const kb = Math.max(0, (window.innerHeight || 0) - vv.height - vv.offsetTop);
  if (kb !== prevKb) {
    prevKb = kb;
    try {
      const root = document.documentElement;
      root.style.setProperty('--kb', kb + 'px');
      root.classList.toggle('kb-open', kb > 0);
    } catch (_) {
      // best-effort only
    }
  }
}

/**
 * Schedule an update on next animation frame
 */
function schedule(): void {
  if (rafId) return;
  rafId = window.requestAnimationFrame(update);
}

/**
 * Attach all event listeners for viewport tracking
 */
function attach(): void {
  try {
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', schedule);
      vv.addEventListener('scroll', schedule);
    }
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener(
      'orientationchange',
      () => {
        // Allow viewport to settle
        setTimeout(update, 60);
      },
      { passive: true }
    );
    window.addEventListener('focusin', schedule, { passive: true });
    update();
  } catch (_) {
    // best-effort only
  }
}

/**
 * Initialize iOS viewport fixes
 * Safe to call multiple times - will only initialize once
 */
export function initIOSViewport(): void {
  if (initialized) return;
  initialized = true;

  const root = document.documentElement;

  // Ensure the CSS var exists even if we bail
  try {
    root.style.setProperty('--kb', '0px');
  } catch (_) {
    // ignore
  }

  if (!isIOS() || !window.visualViewport) {
    return; // non-iOS or no visualViewport support
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }
}

/**
 * Check if running on iOS
 */
export function checkIsIOS(): boolean {
  return isIOS();
}

export default initIOSViewport;
