// web/utils/magnet.ts – Vue-friendly magnetic helper (ported from public/scripts/ui/magnet.js)

interface MakeMagneticOptions {
  target?: string | HTMLElement;
  threshold?: number;
  detachThreshold?: number;
  edge?: 'both' | 'top' | 'bottom';
  detachOnDown?: boolean;
  /** Called when position is snapped — use to sync Vue reactive state */
  onSnap?: (top: number, attached: boolean) => void;
}

interface MagneticControl {
  detach: () => void;
  destroy: () => void;
}

// Extend HTMLElement to track magnetic state
interface MagneticElement extends HTMLElement {
  _isMagnetic?: boolean;
  dataset: DOMStringMap & {
    magnetTarget?: string;
    magnetThreshold?: string;
    magnetDetachThreshold?: string;
    magnetEdge?: string;
    magnetDetachOnDown?: string;
  };
}

// Window types imported from global.d.ts

export function makeMagnetic(
  el: HTMLElement | null,
  opts: MakeMagneticOptions = {}
): MagneticControl | undefined {
  if (!el || (el as MagneticElement)._isMagnetic) return;

  const magnetEl = el as MagneticElement;

  const DEFAULT_THRESHOLD =
    (typeof window !== 'undefined' && window.AppSettings && window.AppSettings.magnetThreshold) ||
    10;
  const DEFAULT_TARGET = '#bar';

  const targetSelector = opts.target || magnetEl.dataset.magnetTarget || DEFAULT_TARGET;
  const attachThreshold =
    Number(opts.threshold ?? magnetEl.dataset.magnetThreshold) || DEFAULT_THRESHOLD;
  const detachThreshold =
    Number(opts.detachThreshold ?? magnetEl.dataset.magnetDetachThreshold) ||
    Math.max(attachThreshold * 0.6, 10);
  const allowedEdgesRaw = opts.edge || magnetEl.dataset.magnetEdge || 'both';
  const allowTop = allowedEdgesRaw === 'both' || allowedEdgesRaw === 'top';
  const allowBottom = allowedEdgesRaw === 'both' || allowedEdgesRaw === 'bottom';

  const targetEl: HTMLElement | null =
    typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;
  if (!targetEl) return;

  let isAttached = false;
  let isDragging = false;
  const detachOnDown = opts.detachOnDown ?? magnetEl.dataset.magnetDetachOnDown !== undefined;

  const onPointerDown = (): void => {
    isDragging = true;
    if (detachOnDown) isAttached = false;
  };
  const onPointerUp = (): void => {
    isDragging = false;
  };

  magnetEl.addEventListener('mousedown', onPointerDown);
  magnetEl.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchend', onPointerUp, { passive: true });

  let needsEval = false;
  const requestEval = (): void => {
    needsEval = true;
  };
  magnetEl.addEventListener('mousemove', requestEval);
  magnetEl.addEventListener('touchmove', requestEval, { passive: true });
  magnetEl.addEventListener('mouseup', requestEval);
  magnetEl.addEventListener('touchend', requestEval, { passive: true });
  window.addEventListener('scroll', requestEval);
  window.addEventListener('resize', requestEval);

  const obs = new MutationObserver(requestEval);
  obs.observe(targetEl, { attributes: true, attributeFilter: ['style', 'class'] });

  let isDestroyed = false;
  let rafId: number | null = null;

  function updateMagnet(): void {
    if (!magnetEl.classList.contains('magnetic')) {
      magnetEl.classList.remove('magnet-attached', 'magnet-edge-top', 'magnet-edge-bottom');
      return;
    }
    const tRect = targetEl!.getBoundingClientRect();
    const eRect = magnetEl.getBoundingClientRect();
    const distanceTop = eRect.bottom - tRect.top;
    const distanceBottom = eRect.top - tRect.bottom;

    if (!isAttached) {
      if (Math.abs(distanceTop) < attachThreshold || Math.abs(distanceBottom) < attachThreshold) {
        isAttached = true;
      }
    }
    if (isAttached && isDragging) {
      let attachedToTop: boolean;
      if (allowTop && allowBottom) attachedToTop = Math.abs(distanceTop) < Math.abs(distanceBottom);
      else if (allowTop) attachedToTop = true;
      else attachedToTop = false;
      const shouldDetach = attachedToTop
        ? Math.abs(distanceTop) > detachThreshold
        : Math.abs(distanceBottom) > detachThreshold;
      if (shouldDetach) isAttached = false;
    }

    if (!isAttached) {
      magnetEl.classList.remove('magnet-attached', 'magnet-edge-top', 'magnet-edge-bottom');
      opts.onSnap?.(eRect.top, false);
    }
    if (isAttached) {
      magnetEl.classList.add('magnet-attached');
      let snapToTop: boolean;
      if (allowTop && allowBottom) snapToTop = Math.abs(distanceTop) < Math.abs(distanceBottom);
      else if (allowTop) snapToTop = true;
      else if (allowBottom) snapToTop = false;
      else snapToTop = true;
      magnetEl.classList.toggle('magnet-edge-top', !snapToTop);
      magnetEl.classList.toggle('magnet-edge-bottom', snapToTop);
      const snapTop = snapToTop ? tRect.top - eRect.height : tRect.bottom;
      magnetEl.style.top = snapTop + 'px';
      magnetEl.style.bottom = 'auto';
      opts.onSnap?.(snapTop, true);
    }
  }

  function loop(): void {
    if (isDestroyed) return;
    if (needsEval || isAttached) {
      needsEval = false;
      updateMagnet();
    }
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);
  updateMagnet();

  magnetEl._isMagnetic = true;
  return {
    detach(): void {
      isAttached = false;
    },
    destroy(): void {
      isDestroyed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      obs.disconnect();
      magnetEl.removeEventListener('mousedown', onPointerDown);
      magnetEl.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
      magnetEl.removeEventListener('mousemove', requestEval);
      magnetEl.removeEventListener('touchmove', requestEval);
      magnetEl.removeEventListener('mouseup', requestEval);
      magnetEl.removeEventListener('touchend', requestEval);
      window.removeEventListener('scroll', requestEval);
      window.removeEventListener('resize', requestEval);
      magnetEl.classList.remove('magnet-attached', 'magnet-edge-top', 'magnet-edge-bottom');
      delete magnetEl._isMagnetic;
    },
  };
}

export default makeMagnetic;
