/**
 * Input Bar Clamp Composable
 * Handles positioning and clamping of the input bar within the viewport
 */
// Window types imported from global.d.ts

interface InputBarClampAPI {
  moveBarToViewportY: (clientY: number) => void;
  clampBarInView: () => void;
  initInputBarClamp: () => void;
}

/**
 * Move the input bar to a specific Y position in the viewport
 */
export function moveBarToViewportY(clientY: number): void {
  const bar = document.getElementById('bar') as HTMLElement | null;
  if (!bar || !Number.isFinite(clientY)) return;

  bar.classList.remove('initial-position');
  bar.style.transform = 'none';

  const h = bar.offsetHeight || 0;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const bottomMargin = 24;
  const maxTop = Math.max(0, viewportHeight - h - bottomMargin);

  let minTop = 72;
  try {
    const header = document.querySelector('#app-shell header');
    if (header) {
      const rect = header.getBoundingClientRect();
      if (rect && Number.isFinite(rect.bottom)) {
        minTop = Math.max(minTop, Math.round(rect.bottom + 16));
      }
    }
  } catch (_) {}

  if (maxTop < minTop) {
    minTop = Math.max(0, maxTop);
  }
  const clampMin = Number.isFinite(minTop) ? minTop : 0;
  const clampMax = Math.max(clampMin, Number.isFinite(maxTop) ? maxTop : clampMin);

  let targetTop = Math.round(clientY - h / 2);
  if (!Number.isFinite(targetTop)) targetTop = clampMin;
  if (targetTop < clampMin) targetTop = clampMin;
  else if (targetTop > clampMax) targetTop = clampMax;

  bar.style.top = `${targetTop}px`;
  bar.style.bottom = 'auto';

  try {
    if (typeof window.setHasMovedBarToBottom === 'function') window.setHasMovedBarToBottom(true);
  } catch (_) {}
}

/**
 * Ensure the input bar is fully visible within the viewport
 * Clamps it to a safe position if it's outside bounds
 */
export function clampBarInView(): void {
  const bar = document.getElementById('bar') as HTMLElement | null;
  if (!bar) return;

  const rect = bar.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;
  const barH = Math.max(10, bar.offsetHeight || rect.height || 60);
  const needsFix = rect.top < 0 || rect.bottom > vh;

  if (needsFix) {
    // Place 120px above bottom by default
    const targetTop = Math.max(0, vh - (barH + 120));
    bar.style.top = `${targetTop}px`;
    bar.style.transform = 'none';
    bar.classList.remove('initial-position');
  }
}

/**
 * Initialize input bar clamping on mount
 * Runs immediately and again after a tick to catch late layout
 */
export function initInputBarClamp(): void {
  clampBarInView();
  setTimeout(clampBarInView, 50);
}

/**
 * Composable for input bar positioning
 */
export function useInputBarClamp(): InputBarClampAPI {
  return {
    moveBarToViewportY,
    clampBarInView,
    initInputBarClamp,
  };
}
