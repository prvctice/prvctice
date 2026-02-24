/**
 * Magnetic Attachment Composable
 *
 * Provides RAF-based continuous magnetic attachment monitoring.
 * When attached, maintains widget position relative to target even when:
 * - Target moves (input bar repositioning)
 * - Hand tracking sends movement intents with jitter
 * - Window resizes
 *
 * Pattern: Mirrors the working makeMagnetic() from web/utils/magnet.ts
 * but integrates with Vue's reactive system and intent coordinator.
 */

import { ref, onBeforeUnmount, type Ref } from 'vue';
import { MAGNETIC_THRESHOLDS, DEFAULT_MAGNETIC_TARGET } from './useMagneticConfig';
import { useEventBus } from '@web/services/eventBus';

// ==================== TYPES ====================

export interface MagneticAttachmentConfig {
  /** CSS selector for target element (default: '#bar') */
  targetSelector?: string;
  /** Distance to start magnetic pull (default: from config) */
  pullThreshold?: number;
  /** Distance to trigger snap (default: from config) */
  snapThreshold?: number;
  /** Distance to detach when dragging away (default: from config) */
  detachThreshold?: number;
  /** Allowed edges: 'top', 'bottom', 'both' (default: 'both') */
  edge?: 'top' | 'bottom' | 'both';
  /** Pull strength 0-1 (default: from config) */
  pullStrength?: number;
  /** Get current widget height (required for snap calculations) */
  getWidgetHeight: () => number;
  /** Callback when position should update */
  onPositionUpdate: (top: number) => void;
  /** Callback when attachment state changes */
  onAttachmentChange?: (attached: boolean, edge: 'top' | 'bottom' | null) => void;
}

export interface MagneticAttachmentReturn {
  /** Whether widget is magnetically attached */
  isAttached: Ref<boolean>;
  /** Which edge attached to */
  attachedEdge: Ref<'top' | 'bottom' | null>;
  /** Start monitoring (call when drag starts or widget becomes visible) */
  startMonitoring: () => void;
  /** Stop monitoring (call when widget hides or unmounts) */
  stopMonitoring: () => void;
  /** Check magnetic snap during drag - returns adjusted Y and snap info */
  checkMagneticSnap: (newTop: number) => MagneticSnapResult;
  /** Check if should detach based on current Y position */
  checkDetach: (currentY: number) => boolean;
  /** Manually attach to edge */
  attach: (edge: 'top' | 'bottom') => void;
  /** Manually detach */
  detach: () => void;
  /** Force re-sync position to target (call after bar moves) */
  syncToTarget: () => void;
}

export interface MagneticSnapResult {
  /** Whether this position would cause a snap */
  snapped: boolean;
  /** Adjusted Y position (with magnetic pull or snap applied) */
  snapY: number;
  /** Which edge we'd snap to, if any */
  edge: 'top' | 'bottom' | null;
}

// ==================== COMPOSABLE ====================

export function useMagneticAttachment(config: MagneticAttachmentConfig): MagneticAttachmentReturn {
  // Merge config with defaults
  const targetSelector = config.targetSelector ?? DEFAULT_MAGNETIC_TARGET.target;
  const pullThreshold = config.pullThreshold ?? MAGNETIC_THRESHOLDS.pullThreshold;
  const snapThreshold = config.snapThreshold ?? MAGNETIC_THRESHOLDS.snapThreshold;
  const detachThreshold = config.detachThreshold ?? MAGNETIC_THRESHOLDS.detachThreshold;
  const allowedEdge = config.edge ?? 'both';
  const pullStrength = config.pullStrength ?? MAGNETIC_THRESHOLDS.pullStrength;

  const allowTop = allowedEdge === 'both' || allowedEdge === 'top';
  const allowBottom = allowedEdge === 'both' || allowedEdge === 'bottom';

  // State
  const isAttached = ref(false);
  const attachedEdge = ref<'top' | 'bottom' | null>(null);

  // Internal state
  let rafId: number | null = null;
  let isMonitoring = false;
  let isDragging = false;
  let needsEval = false;

  // ==================== TARGET HELPERS ====================

  function getTargetRect(): DOMRect | null {
    const target = document.querySelector(targetSelector);
    return target ? target.getBoundingClientRect() : null;
  }

  function calculateSnapY(targetRect: DOMRect, edge: 'top' | 'bottom'): number {
    const widgetHeight = config.getWidgetHeight();
    if (edge === 'top') {
      // Position widget so bottom aligns with target top
      return targetRect.top - widgetHeight;
    } else {
      // Position widget so top aligns with target bottom
      return targetRect.bottom;
    }
  }

  // ==================== MAGNETIC LOGIC ====================

  function checkMagneticSnap(newTop: number): MagneticSnapResult {
    const targetRect = getTargetRect();
    if (!targetRect) {
      return { snapped: false, snapY: newTop, edge: null };
    }

    const widgetHeight = config.getWidgetHeight();
    const widgetBottom = newTop + widgetHeight;

    // Distance from widget bottom to target top (snap above target)
    const distToTop = Math.abs(widgetBottom - targetRect.top);
    // Distance from widget top to target bottom (snap below target)
    const distToBottom = Math.abs(newTop - targetRect.bottom);

    // Determine closer edge based on allowed edges
    let closerEdge: 'top' | 'bottom' | null = null;
    let closerDist = Infinity;

    if (allowTop && distToTop < closerDist) {
      closerDist = distToTop;
      closerEdge = 'top';
    }
    if (allowBottom && distToBottom < closerDist) {
      closerDist = distToBottom;
      closerEdge = 'bottom';
    }

    if (closerEdge === null) {
      return { snapped: false, snapY: newTop, edge: null };
    }

    // Check snap threshold (immediate attachment)
    if (closerDist < snapThreshold) {
      const snapY = calculateSnapY(targetRect, closerEdge);
      return { snapped: true, snapY, edge: closerEdge };
    }

    // Check pull threshold (magnetic attraction)
    if (closerDist < pullThreshold) {
      const targetY = calculateSnapY(targetRect, closerEdge);
      const force = pullStrength * (1 - closerDist / pullThreshold);
      const pulledY = newTop + (targetY - newTop) * force;
      return { snapped: false, snapY: pulledY, edge: null };
    }

    return { snapped: false, snapY: newTop, edge: null };
  }

  function checkDetach(currentY: number): boolean {
    if (!isAttached.value || !attachedEdge.value) return false;

    const targetRect = getTargetRect();
    if (!targetRect) return true; // Detach if target disappears

    const snapY = calculateSnapY(targetRect, attachedEdge.value);
    return Math.abs(currentY - snapY) > detachThreshold;
  }

  // ==================== RAF MONITORING LOOP ====================
  // This is the key pattern from makeMagnetic() that keeps attachment stable

  function monitoringLoop(): void {
    if (!isMonitoring) return;

    // When attached and not dragging, continuously enforce snap position
    // This handles target movement and prevents drift
    if (isAttached.value && !isDragging) {
      const targetRect = getTargetRect();
      if (targetRect && attachedEdge.value) {
        const snapY = calculateSnapY(targetRect, attachedEdge.value);
        config.onPositionUpdate(snapY);
      } else if (!targetRect) {
        // Target disappeared, detach
        detach();
      }
    }

    // When needs evaluation (movement happened), check magnetic state
    if (needsEval) {
      needsEval = false;
      // Evaluation is handled by the drag handlers calling checkMagneticSnap
    }

    rafId = requestAnimationFrame(monitoringLoop);
  }

  function startMonitoring(): void {
    if (isMonitoring) return;
    isMonitoring = true;
    rafId = requestAnimationFrame(monitoringLoop);
  }

  function stopMonitoring(): void {
    isMonitoring = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ==================== DRAG INTEGRATION ====================

  // Listen for drag state changes
  const eventBus = useEventBus();

  // Track when hand tracking grab ends to stop drag mode
  const onGrabEnd = (): void => {
    isDragging = false;
  };

  eventBus.on('handtrack:grab-end', onGrabEnd);

  // ==================== PUBLIC API ====================

  function attach(edge: 'top' | 'bottom'): void {
    isAttached.value = true;
    attachedEdge.value = edge;
    config.onAttachmentChange?.(true, edge);

    // Immediately sync position
    syncToTarget();

    // Ensure monitoring is running
    startMonitoring();

    // Notify physics system to release grab
    eventBus.emit('physics:snap', { target: targetSelector, edge });
  }

  function detach(): void {
    isAttached.value = false;
    attachedEdge.value = null;
    config.onAttachmentChange?.(false, null);
  }

  function syncToTarget(): void {
    if (!isAttached.value || !attachedEdge.value) return;

    const targetRect = getTargetRect();
    if (!targetRect) return;

    const snapY = calculateSnapY(targetRect, attachedEdge.value);
    config.onPositionUpdate(snapY);
  }

  // ==================== LIFECYCLE ====================

  onBeforeUnmount(() => {
    stopMonitoring();
    eventBus.off('handtrack:grab-end', onGrabEnd);
  });

  return {
    isAttached,
    attachedEdge,
    startMonitoring,
    stopMonitoring,
    checkMagneticSnap,
    checkDetach,
    attach,
    detach,
    syncToTarget,
  };
}

export default useMagneticAttachment;
