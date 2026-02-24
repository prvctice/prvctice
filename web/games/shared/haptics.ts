/**
 * Haptic feedback utility with iOS visual fallback
 *
 * navigator.vibrate() is not supported on iOS Safari.
 * This module provides a unified API that:
 * - Uses native vibration on Android/supported browsers
 * - Falls back to a visual flash effect on iOS
 */

const supportsVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

// Cache for overlay elements per canvas
const overlayCache = new WeakMap<HTMLCanvasElement, HTMLDivElement>();

function getOrCreateOverlay(canvas: HTMLCanvasElement): HTMLDivElement | null {
  let overlay = overlayCache.get(canvas);
  if (!overlay) {
    const parent = canvas.parentElement;
    if (!parent) return null;

    overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background: rgba(255, 255, 255, 0);
      transition: background 50ms ease-out;
      z-index: 1000;
      border-radius: inherit;
    `;

    // Ensure parent has relative positioning for overlay
    const parentPosition = getComputedStyle(parent).position;
    if (parentPosition === 'static') {
      parent.style.position = 'relative';
    }

    parent.appendChild(overlay);
    overlayCache.set(canvas, overlay);
  }
  return overlay;
}

/**
 * Trigger haptic feedback with automatic iOS fallback
 *
 * @param canvas - The game canvas element (used for visual fallback positioning)
 * @param duration - Base duration in milliseconds
 * @param intensity - Intensity multiplier (0-2, default 1)
 */
export function triggerHaptic(
  canvas: HTMLCanvasElement,
  duration: number,
  intensity: number = 1
): void {
  if (intensity <= 0) return;

  const adjustedDuration = Math.round(duration * intensity);
  if (adjustedDuration <= 0) return;

  // Try native vibration first (works on Android Chrome, Firefox, etc.)
  if (supportsVibration) {
    navigator.vibrate(adjustedDuration);
    return;
  }

  // Visual fallback for iOS Safari and other non-supporting browsers
  triggerVisualFeedback(canvas, adjustedDuration, intensity);
}

/**
 * Trigger only visual feedback (screen flash)
 * Useful when you want visual feedback regardless of vibration support
 */
export function triggerVisualFeedback(
  canvas: HTMLCanvasElement,
  duration: number,
  intensity: number = 1
): void {
  const overlay = getOrCreateOverlay(canvas);
  if (!overlay) return;

  // Map duration to flash opacity (10ms = subtle, 100ms = strong)
  // Cap at 0.25 to avoid being too jarring
  const flashOpacity = Math.min(0.25, (duration / 400) * intensity);

  // Reset and flash
  overlay.style.transition = 'none';
  overlay.style.background = `rgba(255, 255, 255, ${flashOpacity})`;

  // Force reflow to ensure the flash is visible
  void overlay.offsetHeight;

  // Fade out smoothly
  const fadeTime = Math.min(duration * 2, 150);
  overlay.style.transition = `background ${fadeTime}ms ease-out`;
  overlay.style.background = 'rgba(255, 255, 255, 0)';
}

/**
 * Check if native vibration is supported
 */
export function hasNativeVibration(): boolean {
  return supportsVibration;
}

/**
 * Clean up overlay for a canvas (call when unmounting)
 */
export function cleanupHapticOverlay(canvas: HTMLCanvasElement): void {
  const overlay = overlayCache.get(canvas);
  if (overlay) {
    overlay.remove();
    overlayCache.delete(canvas);
  }
}
