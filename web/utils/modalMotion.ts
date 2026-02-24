import { animate } from '@motionone/dom';
import type { AnimateFunction, AnimationControls } from '@web/types/motion.js';
import {
  motionDurations,
  motionEasings,
  prefersReducedMotion,
} from '@web/composables/useMotion.js';

// Cast animate to properly typed function that includes 'fill' option
// The motion library accepts more options than its types indicate (like 'fill')
const typedAnimate = animate as unknown as AnimateFunction;

interface ModalElements {
  overlay: HTMLElement | null;
  dialog: HTMLElement | null;
}

type TargetGetter = (() => ModalElements) | ModalElements;

export interface ModalMotionController {
  show: () => Promise<void>;
  hide: () => Promise<void>;
  cancel: () => void;
}

function normalizeTargets(targets: TargetGetter): ModalElements {
  if (typeof targets === 'function') return targets();
  return targets || { overlay: null, dialog: null };
}

function resetOverlayStyles(overlay: HTMLElement | null): void {
  if (!overlay) return;
  overlay.style.removeProperty('opacity');
}

function resetDialogStyles(dialog: HTMLElement | null): void {
  if (!dialog) return;
  dialog.style.removeProperty('opacity');
  dialog.style.removeProperty('transform');
}

export function createModalMotionController(targets: TargetGetter): ModalMotionController {
  let overlayAnimation: AnimationControls | null = null;
  let dialogAnimation: AnimationControls | null = null;

  function cancelAnimations(): void {
    if (overlayAnimation && typeof overlayAnimation.cancel === 'function') {
      try {
        overlayAnimation.cancel();
      } catch (_) {
        // Silent
      }
    }
    if (dialogAnimation && typeof dialogAnimation.cancel === 'function') {
      try {
        dialogAnimation.cancel();
      } catch (_) {
        // Silent
      }
    }
    overlayAnimation = null;
    dialogAnimation = null;
  }

  async function show(): Promise<void> {
    const { overlay, dialog } = normalizeTargets(targets);
    if (!overlay || !dialog) return;
    cancelAnimations();
    const durations = motionDurations();
    const easings = motionEasings();

    overlay.classList.add('is-motion-driven');
    overlay.classList.add('open');
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'auto';
    overlay.setAttribute('aria-hidden', 'false');

    const reduce = prefersReducedMotion();
    if (reduce) {
      resetOverlayStyles(overlay);
      resetDialogStyles(dialog);
      return;
    }

    overlay.style.opacity = '0';
    dialog.style.opacity = '0';
    dialog.style.transform = 'translateY(24px) scale(0.98)';

    overlayAnimation = typedAnimate(
      overlay,
      { opacity: [0, 1] },
      {
        duration: durations.short,
        easing: easings.standard,
        fill: 'forwards',
      }
    );
    dialogAnimation = typedAnimate(
      dialog,
      {
        opacity: [0, 1],
        transform: ['translateY(24px) scale(0.98)', 'translateY(0) scale(1)'],
      },
      {
        duration: durations.fade,
        easing: easings.emphasis,
        fill: 'forwards',
      }
    );

    await Promise.all([
      overlayAnimation.finished.catch(() => {}),
      dialogAnimation.finished.catch(() => {}),
    ]);

    resetOverlayStyles(overlay);
    resetDialogStyles(dialog);
    overlayAnimation = null;
    dialogAnimation = null;
  }

  async function hide(): Promise<void> {
    const { overlay, dialog } = normalizeTargets(targets);
    if (!overlay || !dialog) return;
    cancelAnimations();
    const durations = motionDurations();
    const easings = motionEasings();

    overlay.style.pointerEvents = 'none';

    const reduce = prefersReducedMotion();
    if (reduce) {
      overlay.classList.remove('open');
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      resetOverlayStyles(overlay);
      resetDialogStyles(dialog);
      return;
    }

    overlay.style.opacity = '1';
    dialog.style.opacity = '1';
    dialog.style.transform = 'translateY(0) scale(1)';

    overlayAnimation = typedAnimate(
      overlay,
      { opacity: [1, 0] },
      {
        duration: durations.short,
        easing: easings.standard,
        fill: 'forwards',
      }
    );
    dialogAnimation = typedAnimate(
      dialog,
      {
        opacity: [1, 0],
        transform: ['translateY(0) scale(1)', 'translateY(20px) scale(0.97)'],
      },
      {
        duration: durations.short,
        easing: easings.standard,
        fill: 'forwards',
      }
    );

    await Promise.all([
      overlayAnimation.finished.catch(() => {}),
      dialogAnimation.finished.catch(() => {}),
    ]);

    overlay.classList.remove('open');
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    resetOverlayStyles(overlay);
    resetDialogStyles(dialog);
    overlayAnimation = null;
    dialogAnimation = null;
  }

  return {
    show,
    hide,
    cancel: cancelAnimations,
  };
}
