// web/composables/useBarDrag.ts
// Drag-to-position logic for the input bar (#bar)
//
// Extracted from InputBar.vue to achieve single-responsibility principle.
// This composable handles:
// - Mouse drag (mousedown → mousemove → mouseup)
// - Touch drag (touchstart → touchmove → touchend)
// - Physics integration for magnetic effects
// - Viewport clamping on resize

import { onMounted, onUnmounted } from 'vue';
import { useSkillPhysics } from '@web/composables/useSkillPhysics';

interface DragConfig {
  /** Element or selector for the draggable bar */
  barSelector: string;
  /** Minimum top position (px from viewport top) */
  minTop?: number;
  /** Magnetic target selectors for physics system */
  magneticTargets?: string[];
  /** Called after drag ends if bar was moved */
  onDragEnd?: () => void;
}

interface DragState {
  startY: number;
  initialTop: number;
  moved: boolean;
  /** Local flag: only true when startDrag fired from mousedown/touchstart on #bar */
  active: boolean;
}

const DRAG_THRESHOLD = 5;

/**
 * Composable for input bar drag-to-position behavior.
 *
 * @param config - Configuration options
 */
export function useBarDrag(config: DragConfig) {
  const {
    barSelector,
    minTop = 50,
    magneticTargets = ['.floating-notes-widget', '.floating-pdf-widget', '#weather-time-widget'],
    onDragEnd,
  } = config;

  const physics = useSkillPhysics();
  const cleanupFns: Array<() => void> = [];

  // Mutable state object (const reference, mutable properties)
  const state: DragState = {
    startY: 0,
    initialTop: 0,
    moved: false,
    active: false,
  };

  function getBar(): HTMLElement | null {
    return document.querySelector(barSelector);
  }

  function getClientY(e: MouseEvent | TouchEvent): number {
    if ('touches' in e && e.touches.length > 0) {
      const touch = e.touches[0];
      if (touch) return touch.clientY;
    }
    return (e as MouseEvent).clientY;
  }

  function startDrag(e: MouseEvent | TouchEvent): void {
    const bar = getBar();
    if (!bar) return;

    // Don't start a bar drag if another element is already being dragged
    if (physics.isGenericDragging()) return;

    // Snap from initial floating position to an explicit top before moving
    if (bar.classList.contains('initial-position')) {
      const rect = bar.getBoundingClientRect();
      bar.style.top = rect.top + window.scrollY + 'px';
      bar.style.transform = 'none';
      bar.classList.remove('initial-position');
    }

    state.startY = getClientY(e);
    const cs = getComputedStyle(bar);
    let topPx = parseFloat(cs.top);
    if (!Number.isFinite(topPx)) {
      const rect = bar.getBoundingClientRect();
      topPx = rect.top + window.scrollY;
    }
    state.initialTop = topPx;
    state.moved = false;
    state.active = true;

    // Start drag with physics system
    physics.startGenericDrag(
      'inputBar',
      { x: 0, y: topPx }, // x doesn't matter for y-only axis
      { x: 0, y: getClientY(e) - topPx }
    );
  }

  function duringDrag(e: MouseEvent | TouchEvent): void {
    // Only respond when startDrag fired on #bar (local flag, not shared state)
    if (!state.active) return;

    const bar = getBar();
    if (!bar) return;

    const dy = getClientY(e) - state.startY;
    if (!state.moved && Math.abs(dy) > DRAG_THRESHOLD) {
      state.moved = true;
      try {
        if ('touches' in e) e.preventDefault();
      } catch (_) {
        // ignore
      }
    }

    if (state.moved) {
      const h = bar.offsetHeight || 0;
      const maxTop = Math.max(0, (window.innerHeight || 0) - h);

      // Update through physics system for magnetic effects
      const result = physics.updateGenericDrag({ x: 0, y: state.initialTop + dy });

      // Clamp to viewport bounds (minTop prevents bar from going too high)
      let newTop = result.position.y;
      if (newTop < minTop) newTop = minTop;
      if (newTop > maxTop) newTop = maxTop;
      bar.style.top = newTop + 'px';
    }
  }

  function endDrag(): void {
    if (!state.active) return;
    state.active = false;
    physics.endGenericDrag();

    if (state.moved) {
      // Notify that bar was moved (e.g., for hasMovedBarToBottom tracking)
      if (typeof window.setHasMovedBarToBottom === 'function') {
        try {
          window.setHasMovedBarToBottom(true);
        } catch (_) {
          // ignore
        }
      }
      onDragEnd?.();
    }
  }

  function onResize(): void {
    const bar = getBar();
    if (!bar) return;

    try {
      const cs = getComputedStyle(bar);
      let topPx = parseFloat(cs.top);
      if (!Number.isFinite(topPx)) {
        const rect = bar.getBoundingClientRect();
        topPx = rect.top + window.scrollY;
      }
      const maxTop = Math.max(0, (window.innerHeight || 0) - (bar.offsetHeight || 0));
      const clamped = Math.min(Math.max(minTop, topPx), maxTop);
      if (Number.isFinite(clamped)) bar.style.top = clamped + 'px';
    } catch (_) {
      // ignore
    }
  }

  onMounted(() => {
    const bar = getBar();
    if (!bar) return;

    // Ensure fixed positioning (themes must not override)
    try {
      if (getComputedStyle(bar).position !== 'fixed') bar.style.position = 'fixed';
    } catch (_) {
      bar.style.position = 'fixed';
    }

    // Register bar as a draggable with unified physics system
    physics.registerDraggable({
      id: 'inputBar',
      element: bar,
      type: 'bar',
      axis: 'y', // InputBar only moves vertically
      magneticTargets,
    });

    // Capture so inner handlers can't swallow start
    bar.addEventListener('mousedown', startDrag, { capture: true });
    document.addEventListener('mousemove', duringDrag);
    document.addEventListener('mouseup', endDrag);
    bar.addEventListener('touchstart', startDrag, { passive: false, capture: true });
    document.addEventListener('touchmove', duringDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
    document.addEventListener('touchcancel', endDrag);
    window.addEventListener('resize', onResize);

    // Register cleanup to be called on component unmount
    cleanupFns.push(() => {
      try {
        bar.removeEventListener('mousedown', startDrag, true);
        document.removeEventListener('mousemove', duringDrag);
        document.removeEventListener('mouseup', endDrag);
        bar.removeEventListener('touchstart', startDrag, true);
        document.removeEventListener('touchmove', duringDrag);
        document.removeEventListener('touchend', endDrag);
        document.removeEventListener('touchcancel', endDrag);
        window.removeEventListener('resize', onResize);
      } catch (_) {
        // ignore
      }
    });
  });

  onUnmounted(() => {
    // Unregister from physics system
    try {
      physics.unregisterDraggable('inputBar');
    } catch (_) {
      // ignore
    }

    // Run all cleanup functions
    cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        // ignore
      }
    });
    cleanupFns.length = 0;
  });

  return {
    /** Manually trigger scroll-to-bottom on resize (exposed for testing) */
    onResize,
  };
}

export default useBarDrag;
