/**
 * Floating Widget Composable
 *
 * Provides reusable floating widget behavior with:
 * - Simple drag with boundary clamping
 * - Position and size persistence
 * - Hand tracking grab support
 * - Visibility/reveal animations
 * - Optional tilt effect on hover
 * - Resize handle support
 * - IntentCoordinator integration
 */

import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  type Ref,
  type ComputedRef,
} from 'vue';
import { animate, spring } from '@motionone/dom';
import { storage } from '@web/storage/storage.js';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import { useEventBus } from '@web/services/eventBus';
import { prefersReducedMotion } from '@web/composables/useMotion.js';
import { getHandTrackingSystem, type HandGrabEvent } from '@web/graphics/dotmatrix/handtrack';
import { useSkillPhysics } from './useSkillPhysics';
import makeMagnetic from '@web/utils/magnet';
import type { AnimationControls } from '@web/types/motion.js';
import type { MotionKeyframesDefinition, AnimationOptionsWithOverrides } from '@motionone/dom';

/**
 * Typed wrapper for motionone animate — avoids `as Function` lint error.
 * The library's types don't expose the EasingGenerator option through
 * the public `animate` signature, but it works at runtime.
 */
const springAnimate = animate as unknown as (
  elements: Element | Element[],
  keyframes: MotionKeyframesDefinition,
  options?: AnimationOptionsWithOverrides
) => AnimationControls;

// ==================== TYPES ====================

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetPosition {
  left: number | null;
  top: number | null;
}

export interface FloatingWidgetConfig {
  /** Unique ID for the widget (used for storage keys, intent target) */
  id: string;
  /** Storage key prefix (defaults to id) */
  storageKey?: string;
  /** Default size */
  defaultSize: WidgetSize;
  /** Minimum size constraints */
  minSize: WidgetSize;
  /** Maximum size constraints */
  maxSize: WidgetSize;
  /** Default position (if no saved position) */
  defaultPosition?:
    | { left: number; top: number }
    | 'center'
    | 'center-right'
    | 'bottom-left'
    | 'top-right';
  /** Enable tilt effect on hover (default: true) */
  enableTilt?: boolean;
  /** Enable resize handle (default: true) */
  enableResize?: boolean;
  /** Intent actions to handle (default: ['toggle', 'move', 'resize']) */
  intentActions?: string[];
  /** Custom intent handler (receives intent, returns true if handled) */
  onIntent?: (intent: WidgetIntent) => boolean;
  /** Called when visibility changes */
  onVisibilityChange?: (visible: boolean) => void;
  /** Called when widget is closed */
  onClose?: () => void;
  /** Register with IntentCoordinator (default: true) */
  registerIntent?: boolean;
  /** Enable edge-based resize (all 8 handles) instead of corner-only (default: false) */
  edgeResize?: boolean;
  /** Start visible without requiring setVisible(true) call (default: false) */
  initiallyVisible?: boolean;
  /** CSS selectors of elements this widget magnetically snaps to (default: bar + widgets) */
  magneticTargets?: string[];
  /** Disable drag entirely (e.g. on mobile where windows are full-viewport) */
  disableDrag?: boolean;
}

export interface WidgetIntent {
  action: string;
  source?: string;
  value?: {
    w?: number;
    h?: number;
    delta?: { x?: number; y?: number };
    deltaX?: number;
    deltaY?: number;
  };
}

export interface FloatingWidgetReturn {
  // State
  visible: Ref<boolean>;
  shouldRender: Ref<boolean>;
  reveal: Ref<boolean>;
  size: Ref<WidgetSize>;
  pos: Ref<WidgetPosition>;
  reduceMotion: Ref<boolean>;
  tiltX: Ref<number>;
  tiltY: Ref<number>;
  isFullscreen: Ref<boolean>;

  // Drag state
  isDragging: Ref<boolean>;
  isResizing: Ref<boolean>;

  // Computed styles
  wrapperStyle: ComputedRef<Record<string, string | number | undefined>>;
  headerStyle: Record<string, string | number>;
  resizerStyle: Record<string, string | number>;

  // Methods
  setVisible: (v: boolean) => void;
  toggle: () => void;
  bringToFront: () => void;
  close: () => void;
  toggleFullscreen: () => void;

  // Lifecycle bindings (call in onMounted)
  bindRoot: (el: HTMLElement | null) => void;
  bindResizer: (el: HTMLElement | null) => void;

  // Tilt handlers (attach to root element)
  onPointerMove: (e: PointerEvent) => void;
  onPointerLeave: () => void;

  // For external access
  savePos: () => void;
  saveSize: () => void;
}

// ==================== PALETTE (day/night theming) ====================

function createPalette(isDay: boolean) {
  if (isDay) {
    return {
      surface:
        'var(--color-widget-day-surface, linear-gradient(165deg, rgba(200, 210, 220, 0.7) 0%, rgba(170, 185, 200, 0.6) 100%))',
      border: 'var(--color-widget-day-border, rgba(255, 255, 255, 0.35))',
      glowActive: 'var(--color-widget-day-glow-active, 0 24px 48px -12px rgba(0, 0, 0, 0.4))',
      glowIdle: 'var(--color-widget-day-glow-idle, 0 16px 32px -16px rgba(0, 0, 0, 0.25))',
    };
  }
  return {
    surface:
      'var(--color-widget-night-surface, linear-gradient(165deg, rgba(120, 125, 140, 0.7) 0%, rgba(80, 85, 100, 0.6) 100%))',
    border: 'var(--color-widget-night-border, rgba(255, 255, 255, 0.15))',
    glowActive: 'var(--color-widget-night-glow-active, 0 24px 48px -12px rgba(0, 0, 0, 0.5))',
    glowIdle: 'var(--color-widget-night-glow-idle, 0 16px 32px -16px rgba(0, 0, 0, 0.35))',
  };
}

// ==================== Z-INDEX MANAGEMENT ====================

// Global z-index counter for bringing widgets to front
let globalZIndex = 900;
const widgetZIndexes = new Map<string, number>();

function getWidgetZIndex(id: string): number {
  return widgetZIndexes.get(id) ?? 900;
}

function bringWidgetToFront(id: string): number {
  globalZIndex += 1;
  widgetZIndexes.set(id, globalZIndex);
  return globalZIndex;
}

// ==================== COMPOSABLE ====================

export function useFloatingWidget(config: FloatingWidgetConfig): FloatingWidgetReturn {
  const {
    id,
    storageKey = id,
    defaultSize,
    minSize,
    maxSize,
    defaultPosition = 'center-right',
    enableTilt = true,
    enableResize = true,
    intentActions = ['toggle', 'move', 'resize'],
    onIntent,
    onVisibilityChange,
    onClose,
    registerIntent = true,
    edgeResize = false,
    disableDrag = false,
  } = config;

  // Storage keys
  const LS_SIZE_KEY = `${storageKey}Size`;
  const LS_POS_KEY = `${storageKey}Pos`;
  const LS_VISIBLE_KEY = `${storageKey}Visible`;

  // State
  const visible = ref(true);
  const shouldRender = ref(false);
  const reveal = ref(false);
  const size = ref<WidgetSize>({ ...defaultSize });
  const pos = ref<WidgetPosition>({ left: null, top: null });
  const reduceMotion = ref(false);
  const tiltX = ref(0);
  const tiltY = ref(0);
  const zIndex = ref(getWidgetZIndex(id));
  const isDay = ref(true);
  const isDragging = ref(false);
  const isResizing = ref(false);
  const isFullscreen = ref(false);

  // Saved state before fullscreen (for restore)
  let savedBeforeFullscreen: { left: number; top: number; w: number; h: number } | null = null;

  // DOM refs
  let rootElement: HTMLElement | null = null;
  let resizerElement: HTMLElement | null = null;

  // Timers and handlers
  let exitTimer: number | null = null;
  let tiltFrame: number | null = null;
  let motionMediaQuery: MediaQueryList | null = null;
  let motionPreferenceHandler: ((event: MediaQueryListEvent) => void) | null = null;
  let interactionsAttached = false;
  let grabEndHandler: (() => void) | null = null;
  let handTrackingGrabEndHandler: ((payload: HandGrabEvent) => void) | null = null;
  let focusHandler: ((data: { id: string }) => void) | null = null;

  // Hand tracking grab state
  let widgetGrabStartLeft: number | null = null;
  let widgetGrabStartTop: number | null = null;

  // Simple drag state
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;

  // Intent coordinator
  const { registerTarget, unregisterTarget } = useIntentCoordinator();

  // Physics system for unified drag behavior
  const physics = useSkillPhysics();

  // ==================== COMPUTED STYLES ====================

  const palette = computed(() => createPalette(isDay.value));

  const wrapperStyle = computed(() => {
    const paletteVal = palette.value;
    let transform = '';

    if (!reveal.value) {
      transform = 'scale(0.95) translateY(10px)';
    } else if (enableTilt && !reduceMotion.value && !isDragging.value) {
      const maxTilt = 1.5;
      const maxShift = 1.5;
      transform = `rotateX(${(-tiltY.value * maxTilt).toFixed(2)}deg)`;
      transform += ` rotateY(${(tiltX.value * maxTilt).toFixed(2)}deg)`;
      transform += ` translate3d(${(tiltX.value * maxShift).toFixed(2)}px, ${(-tiltY.value * maxShift * 0.6).toFixed(2)}px, 0)`;
    }

    return {
      left: pos.value.left != null ? `${pos.value.left}px` : undefined,
      top: pos.value.top != null ? `${pos.value.top}px` : undefined,
      width: `${size.value.w}px`,
      height: `${size.value.h}px`,
      display: 'flex',
      flexDirection: 'column' as const,
      cursor: disableDrag ? 'default' : 'grab',
      zIndex: zIndex.value,
      overflow: 'hidden' as const,
      borderRadius: 'var(--radius-xl)',
      color: 'var(--color-widget-text)',
      boxShadow: reveal.value ? paletteVal.glowActive : paletteVal.glowIdle,
      background: paletteVal.surface,
      border: `1px solid ${paletteVal.border}`,
      backdropFilter: 'blur(20px) saturate(90%)',
      WebkitBackdropFilter: 'blur(20px) saturate(90%)',
      opacity: reveal.value ? 1 : 0,
      transition: reduceMotion.value
        ? 'opacity 160ms ease-out, box-shadow 160ms ease-out, transform 160ms ease-out'
        : 'opacity 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 420ms ease, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      transform: transform || undefined,
      pointerEvents: 'auto' as const,
    };
  });

  const headerStyle: Record<string, string | number> = {
    height: '28px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5) 0',
    boxSizing: 'border-box',
    color: 'var(--color-widget-header)',
    position: 'relative',
    zIndex: 100,
    pointerEvents: 'auto',
    fontSize: 'var(--font-size-xs)',
    letterSpacing: '0.12em',
    fontWeight: 400,
    textTransform: 'uppercase',
  };

  const resizerStyle: Record<string, string | number> = {
    position: 'absolute',
    width: '24px',
    height: '24px',
    right: '0',
    bottom: '0',
    cursor: 'se-resize',
    zIndex: 3,
    pointerEvents: 'auto',
    background: 'none',
    borderBottomRightRadius: 'var(--radius-sm)',
  };

  // ==================== STORAGE ====================

  function readSavedSize(): void {
    try {
      const obj = storage.mirror.getJSON(LS_SIZE_KEY) as WidgetSize | null;
      if (obj && obj.w > 0 && obj.h > 0) {
        size.value = {
          w: Math.max(minSize.w, Math.min(maxSize.w, obj.w)),
          h: Math.max(minSize.h, Math.min(maxSize.h, obj.h)),
        };
      }
    } catch {
      // Use default
    }
  }

  function saveSize(): void {
    storage.mirror.setJSON(LS_SIZE_KEY, size.value);
  }

  function readSavedPos(): { left: number; top: number } | null {
    try {
      const p = storage.mirror.getJSON(LS_POS_KEY) as { left: number; top: number } | null;
      if (p && typeof p.left === 'number' && typeof p.top === 'number') return p;
    } catch {
      // No saved position
    }
    return null;
  }

  function savePos(): void {
    if (pos.value.left != null && pos.value.top != null) {
      storage.mirror.setJSON(LS_POS_KEY, { left: pos.value.left, top: pos.value.top });
    }
  }

  function readSavedVisible(): boolean {
    try {
      const v = storage.mirror.get(LS_VISIBLE_KEY);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {
      // Default to hidden
    }
    return config.initiallyVisible ?? false;
  }

  function saveVisible(): void {
    storage.mirror.set(LS_VISIBLE_KEY, visible.value ? 'true' : 'false');
  }

  // ==================== VIEWPORT SIZE CLAMPING ====================

  /** Clamp size to fit within viewport (allows going below minSize on small screens) */
  function clampSizeToViewport(): void {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    if (size.value.w > vw || size.value.h > vh) {
      size.value = {
        w: Math.min(size.value.w, vw),
        h: Math.min(size.value.h, vh),
      };
    }
  }

  // ==================== POSITION INITIALIZATION ====================

  function calculateDefaultPosition(): { left: number; top: number } {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return { left: 100, top: 100 };

    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const w = size.value.w;
    const h = size.value.h;

    if (typeof defaultPosition === 'object') {
      return defaultPosition;
    }

    switch (defaultPosition) {
      case 'center':
        return { left: (vw - w) / 2, top: (vh - h) / 2 };
      case 'center-right':
        return { left: vw - w - 20, top: (vh - h) / 2 };
      case 'bottom-left':
        return { left: 20, top: vh - h - 20 };
      case 'top-right':
        return { left: vw - w - 20, top: 20 };
      default:
        return { left: vw - w - 20, top: (vh - h) / 2 };
    }
  }

  function clampPosition(left: number, top: number): { left: number; top: number } {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return { left, top };
    return {
      left: Math.max(0, Math.min(win.innerWidth - size.value.w - 10, left)),
      top: Math.max(0, Math.min(win.innerHeight - size.value.h - 10, top)),
    };
  }

  function ensureVisibleInit(): void {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return;

    // Load saved position or calculate default
    const stored = readSavedPos();
    if (stored) {
      pos.value = clampPosition(stored.left, stored.top);
    } else {
      const defaultPos = calculateDefaultPosition();
      pos.value = clampPosition(defaultPos.left, defaultPos.top);
    }

    // Reset tilt
    onPointerLeave();

    // Attach interactions if not already
    if (!interactionsAttached && rootElement) {
      if (!disableDrag) {
        attachDrag();
      }
      if (enableResize && resizerElement) {
        attachResizer();
      }
      interactionsAttached = true;
    }
  }

  // ==================== EDGE RESIZE DETECTION ====================

  type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

  const EDGE_ZONE_PX = 24;

  function detectEdgeDirection(e: PointerEvent): ResizeDirection | null {
    if (!rootElement) return null;
    const rect = rootElement.getBoundingClientRect();
    const nearLeft = e.clientX - rect.left < EDGE_ZONE_PX;
    const nearRight = rect.right - e.clientX < EDGE_ZONE_PX;
    const nearTop = e.clientY - rect.top < EDGE_ZONE_PX;
    const nearBottom = rect.bottom - e.clientY < EDGE_ZONE_PX;

    // Corner-only resize — side edges conflict with drag
    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearLeft) return 'sw';
    if (nearBottom && nearRight) return 'se';
    return null;
  }

  const CURSOR_MAP: Record<ResizeDirection, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  };

  // Edge resize state
  let edgeResizeDir: ResizeDirection | null = null;
  let edgeResizeStartX = 0;
  let edgeResizeStartY = 0;
  let edgeResizeStartW = 0;
  let edgeResizeStartH = 0;
  let edgeResizeStartLeft = 0;
  let edgeResizeStartTop = 0;

  // ==================== UNIFIED DRAG (via useSkillPhysics) ====================

  function attachDrag(): void {
    if (!rootElement) return;

    const magnetTargets = config.magneticTargets ?? [
      '#bar',
      '.floating-notes-widget',
      '.floating-pdf-widget',
      '#weather-time-widget',
      '.app-window',
    ];

    // Register widget as a draggable
    physics.registerDraggable({
      id,
      element: rootElement,
      type: 'widget',
      axis: 'both',
      magneticTargets: magnetTargets,
    });

    // Use the proven makeMagnetic system — same as skill pills.
    // The onSnap callback keeps Vue's pos.value in sync so `:style` doesn't fight.
    if (magnetTargets.includes('#bar')) {
      rootElement.classList.add('magnetic');
      makeMagnetic(rootElement, {
        target: '#bar',
        threshold: 50,
        detachOnDown: true,
        edge: 'both',
        onSnap: (top, attached) => {
          if (attached) {
            pos.value = { ...pos.value, top };
            savePos();
          }
        },
      });
    }

    const onPointerDown = (e: PointerEvent) => {
      // Ignore if target is interactive element
      const target = e.target as HTMLElement;
      if (target.closest('button, input, textarea, a, [data-no-drag]')) return;

      // Edge resize check (before drag) when edgeResize is enabled
      if (edgeResize) {
        const dir = detectEdgeDirection(e);
        if (dir) {
          e.stopPropagation();
          isResizing.value = true;
          edgeResizeDir = dir;
          edgeResizeStartX = e.clientX;
          edgeResizeStartY = e.clientY;
          edgeResizeStartW = size.value.w;
          edgeResizeStartH = size.value.h;
          edgeResizeStartLeft = pos.value.left ?? 0;
          edgeResizeStartTop = pos.value.top ?? 0;
          rootElement!.setPointerCapture(e.pointerId);
          rootElement!.style.cursor = CURSOR_MAP[dir];
          document.body.style.userSelect = 'none';
          bringToFront();
          return;
        }
      }

      isDragging.value = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartLeft = pos.value.left ?? 0;
      dragStartTop = pos.value.top ?? 0;

      // Calculate offset from cursor to element origin
      const offset = {
        x: e.clientX - dragStartLeft,
        y: e.clientY - dragStartTop,
      };

      // Start physics drag
      physics.startGenericDrag(id, { x: dragStartLeft, y: dragStartTop }, offset);

      rootElement!.setPointerCapture(e.pointerId);
      rootElement!.style.cursor = 'grabbing';
      bringToFront();
    };

    const onPointerMove = (e: PointerEvent) => {
      // Edge resize in progress
      if (isResizing.value && edgeResizeDir) {
        const dx = e.clientX - edgeResizeStartX;
        const dy = e.clientY - edgeResizeStartY;

        let newW = edgeResizeStartW;
        let newH = edgeResizeStartH;
        let newLeft = edgeResizeStartLeft;
        let newTop = edgeResizeStartTop;

        // Apply delta based on direction
        if (edgeResizeDir.includes('e')) newW = edgeResizeStartW + dx;
        if (edgeResizeDir.includes('w')) {
          newW = edgeResizeStartW - dx;
          newLeft = edgeResizeStartLeft + dx;
        }
        if (edgeResizeDir.includes('s')) newH = edgeResizeStartH + dy;
        if (edgeResizeDir.includes('n')) {
          newH = edgeResizeStartH - dy;
          newTop = edgeResizeStartTop + dy;
        }

        // Clamp size
        const clampedW = Math.max(minSize.w, Math.min(maxSize.w, newW));
        const clampedH = Math.max(minSize.h, Math.min(maxSize.h, newH));

        // Adjust position when size is clamped at min (prevent position drift)
        if (edgeResizeDir.includes('w')) {
          newLeft = edgeResizeStartLeft + (edgeResizeStartW - clampedW);
        }
        if (edgeResizeDir.includes('n')) {
          newTop = edgeResizeStartTop + (edgeResizeStartH - clampedH);
        }

        size.value = { w: clampedW, h: clampedH };
        pos.value = clampPosition(newLeft, newTop);

        // Direct DOM update for performance
        if (rootElement) {
          rootElement.style.width = `${clampedW}px`;
          rootElement.style.height = `${clampedH}px`;
          rootElement.style.left = `${pos.value.left}px`;
          rootElement.style.top = `${pos.value.top}px`;
        }
        return;
      }

      // Cursor feedback on hover when edgeResize is enabled (not dragging/resizing)
      if (edgeResize && !isDragging.value && !isResizing.value) {
        const dir = detectEdgeDirection(e);
        if (dir) {
          rootElement!.style.cursor = CURSOR_MAP[dir];
        } else {
          rootElement!.style.cursor = 'grab';
        }
      }

      if (!isDragging.value) return;

      // Calculate raw position from cursor movement
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newX = dragStartLeft + dx;
      const newY = dragStartTop + dy;

      // Update through physics system
      physics.updateGenericDrag({ x: newX, y: newY });

      // Clamp to viewport bounds
      const clamped = clampPosition(newX, newY);
      pos.value = clamped;

      // Update DOM position
      if (rootElement) {
        rootElement.style.left = `${clamped.left}px`;
        rootElement.style.top = `${clamped.top}px`;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      // Edge resize end
      if (isResizing.value) {
        isResizing.value = false;
        edgeResizeDir = null;
        document.body.style.userSelect = '';
        rootElement!.releasePointerCapture(e.pointerId);
        rootElement!.style.cursor = 'grab';
        saveSize();
        savePos();

        // Spring settle on resize end (MOTN-09)
        if (!prefersReducedMotion() && rootElement) {
          const prevTransition = rootElement.style.transition;
          rootElement.style.transition = 'none';
          const resizeSettleAnim = springAnimate(
            rootElement,
            { transform: ['scale(1.01)', 'scale(1)'] },
            { easing: spring({ stiffness: 250, damping: 20, mass: 1 }) }
          );
          resizeSettleAnim.finished
            .catch(() => {})
            .finally(() => {
              if (rootElement) rootElement.style.transition = prevTransition;
            });
        }
        return;
      }

      if (!isDragging.value) return;

      isDragging.value = false;

      // End physics drag
      physics.endGenericDrag();

      savePos();

      rootElement!.releasePointerCapture(e.pointerId);
      rootElement!.style.cursor = 'grab';
    };

    rootElement.addEventListener('pointerdown', onPointerDown);
    rootElement.addEventListener('pointermove', onPointerMove);
    rootElement.addEventListener('pointerup', onPointerUp);
    rootElement.addEventListener('pointercancel', onPointerUp);
  }

  // ==================== RESIZE ====================

  function attachResizer(): void {
    if (!rootElement || !resizerElement) return;

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    const onDown = (e: MouseEvent) => {
      e.stopPropagation();
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = size.value.w;
      startH = size.value.h;
      document.body.style.userSelect = 'none';
    };

    const onMove = (e: MouseEvent) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const w = Math.min(maxSize.w, Math.max(minSize.w, startW + dx));
      const h = Math.min(maxSize.h, Math.max(minSize.h, startH + dy));
      size.value = { w, h };

      // Clamp position to keep widget visible
      const clamped = clampPosition(pos.value.left ?? 0, pos.value.top ?? 0);
      pos.value = clamped;
    };

    const onUp = () => {
      if (!resizing) return;
      resizing = false;
      document.body.style.userSelect = '';
      saveSize();
      savePos();
    };

    resizerElement.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ==================== TILT EFFECT ====================

  function onPointerMove(event: PointerEvent): void {
    if (!enableTilt || reduceMotion.value || !rootElement) return;
    if (isDragging.value) {
      onPointerLeave();
      return;
    }
    if (event.pointerType === 'touch' || event.buttons > 0) return;

    const rect = rootElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1);
    const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1);
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));

    if (typeof window !== 'undefined') {
      if (tiltFrame != null) window.cancelAnimationFrame(tiltFrame);
      tiltFrame = window.requestAnimationFrame(() => {
        tiltX.value = clampedX;
        tiltY.value = clampedY;
        tiltFrame = null;
      });
    } else {
      tiltX.value = clampedX;
      tiltY.value = clampedY;
    }
  }

  function onPointerLeave(): void {
    if (typeof window !== 'undefined' && tiltFrame != null) {
      window.cancelAnimationFrame(tiltFrame);
      tiltFrame = null;
    }
    tiltX.value = 0;
    tiltY.value = 0;
  }

  // ==================== MOTION PREFERENCE ====================

  function initMotionPreference(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.value = motionMediaQuery.matches;

    motionPreferenceHandler = (event: MediaQueryListEvent): void => {
      reduceMotion.value = event.matches;
      if (event.matches) onPointerLeave();
    };

    try {
      motionMediaQuery.addEventListener('change', motionPreferenceHandler);
    } catch {
      motionMediaQuery.addListener(motionPreferenceHandler);
    }
  }

  // ==================== VISIBILITY ====================

  function setVisible(v: boolean): void {
    visible.value = v;
    saveVisible();
    onVisibilityChange?.(v);
  }

  function toggle(): void {
    if (visible.value) {
      setVisible(false);
    } else {
      setVisible(true);
    }
  }

  function bringToFront(): void {
    zIndex.value = bringWidgetToFront(id);
    // Emit focus event for other windows to defocus (MOTN-08)
    useEventBus().emit('widget:focus', { id });
  }

  function close(): void {
    setVisible(false);
    onClose?.();
  }

  function toggleFullscreen(): void {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return;

    if (isFullscreen.value) {
      // Restore from saved state
      if (savedBeforeFullscreen) {
        size.value = { w: savedBeforeFullscreen.w, h: savedBeforeFullscreen.h };
        pos.value = clampPosition(savedBeforeFullscreen.left, savedBeforeFullscreen.top);
        savedBeforeFullscreen = null;
      }
      isFullscreen.value = false;
    } else {
      // Save current state and expand
      savedBeforeFullscreen = {
        left: pos.value.left ?? 0,
        top: pos.value.top ?? 0,
        w: size.value.w,
        h: size.value.h,
      };
      const margin = 20;
      size.value = { w: win.innerWidth - margin * 2, h: win.innerHeight - margin * 2 };
      pos.value = { left: margin, top: margin };
      isFullscreen.value = true;
    }

    // Update DOM directly for immediate feedback
    if (rootElement) {
      rootElement.style.width = `${size.value.w}px`;
      rootElement.style.height = `${size.value.h}px`;
      rootElement.style.left = `${pos.value.left}px`;
      rootElement.style.top = `${pos.value.top}px`;
    }

    saveSize();
    savePos();
    bringToFront();
  }

  // ==================== INTENT HANDLING ====================

  function handleIntent(intent: WidgetIntent): void {
    // Let custom handler try first
    if (onIntent && onIntent(intent)) return;

    switch (intent.action) {
      case 'toggle':
        if (visible.value) {
          bringToFront();
        } else {
          setVisible(true);
        }
        break;

      case 'resize':
        if (intent.value?.w != null || intent.value?.h != null) {
          const newW =
            intent.value.w != null
              ? Math.max(minSize.w, Math.min(maxSize.w, intent.value.w))
              : size.value.w;
          const newH =
            intent.value.h != null
              ? Math.max(minSize.h, Math.min(maxSize.h, intent.value.h))
              : size.value.h;
          size.value = { w: newW, h: newH };
          saveSize();
        }
        break;

      case 'move': {
        const win = typeof window !== 'undefined' ? window : null;
        const vw = win?.innerWidth ?? 1920;
        const vh = win?.innerHeight ?? 1080;
        const currentLeft = pos.value.left ?? vw - size.value.w - 20;
        const currentTop = pos.value.top ?? vh - size.value.h - 20;

        const deltaX = intent.value?.deltaX ?? intent.value?.delta?.x ?? 0;
        const deltaY = intent.value?.deltaY ?? intent.value?.delta?.y ?? 0;

        if (deltaX !== 0 || deltaY !== 0) {
          if (widgetGrabStartLeft === null) {
            widgetGrabStartLeft = currentLeft;
            widgetGrabStartTop = currentTop;

            // Start physics drag for intent-based movement (hand tracking, gamepad)
            if (rootElement) {
              physics.startGenericDrag(id, { x: currentLeft, y: currentTop }, { x: 0, y: 0 });
            }
          }

          let newLeft: number;
          let newTop: number;

          if (intent.source === 'gamepad') {
            newLeft = currentLeft + deltaX;
            newTop = currentTop + deltaY;
          } else {
            newLeft = widgetGrabStartLeft + deltaX;
            newTop = (widgetGrabStartTop ?? currentTop) + deltaY;
          }

          // Route through physics system for magnetic attraction
          const result = physics.updateGenericDrag({ x: newLeft, y: newTop });
          const clamped = clampPosition(result.position.x, result.position.y);
          pos.value = clamped;

          if (rootElement) {
            rootElement.style.left = `${clamped.left}px`;
            rootElement.style.top = `${clamped.top}px`;
          }

          savePos();
        }
        break;
      }
    }
  }

  // ==================== LIFECYCLE ====================

  function bindRoot(el: HTMLElement | null): void {
    rootElement = el;
  }

  function bindResizer(el: HTMLElement | null): void {
    resizerElement = el;
  }

  onMounted(async () => {
    // Load saved state
    readSavedSize();
    clampSizeToViewport();
    visible.value = readSavedVisible();
    initMotionPreference();

    // Register with IntentCoordinator
    if (registerIntent) {
      registerTarget(id, {
        zone: `#${id}`,
        actions: intentActions,
        handler: handleIntent as (intent: unknown) => void,
      });
    }

    // Hand tracking grab end reset
    grabEndHandler = () => {
      widgetGrabStartLeft = null;
      widgetGrabStartTop = null;
      // End physics drag when grab ends
      physics.endGenericDrag();
    };
    useEventBus().on('handtrack:grab-end', grabEndHandler);

    // Hand tracking grab end handler (simplified - no momentum)
    handTrackingGrabEndHandler = () => {
      // Just reset grab state, no physics momentum
      widgetGrabStartLeft = null;
      widgetGrabStartTop = null;
      // End physics drag when grab ends
      physics.endGenericDrag();
    };
    try {
      getHandTrackingSystem().subscribe('hand:grab-end', handTrackingGrabEndHandler);
    } catch {
      // Hand tracking not available
    }

    // Focus/defocus handler: when another widget gains focus, apply subtle defocus scale (MOTN-08)
    focusHandler = (data: { id: string }) => {
      if (data.id === id || !rootElement) return;
      // Another widget gained focus -- apply subtle defocus scale
      if (!prefersReducedMotion()) {
        springAnimate(
          rootElement,
          { transform: ['scale(1)', 'scale(0.97)'], filter: ['blur(0px)', 'blur(0.5px)'] },
          { easing: spring({ stiffness: 180, damping: 24, mass: 1 }), duration: 0.4 }
        );
      }
    };
    useEventBus().on('widget:focus', focusHandler);

    // Show widget if visible
    if (visible.value) {
      shouldRender.value = true;
      await nextTick();
      ensureVisibleInit();
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          reveal.value = true;
        });
      } else {
        reveal.value = true;
      }
    }
  });

  // Watch visibility changes
  watch(
    () => visible.value,
    async (isVisible) => {
      if (isVisible) {
        if (exitTimer) {
          clearTimeout(exitTimer);
          exitTimer = null;
        }
        shouldRender.value = true;
        await nextTick();
        ensureVisibleInit();
        if (typeof window !== 'undefined') {
          window.requestAnimationFrame(() => {
            reveal.value = true;
          });
        } else {
          reveal.value = true;
        }
      } else {
        reveal.value = false;
        onPointerLeave();
        if (typeof window === 'undefined') {
          shouldRender.value = false;
          return;
        }
        if (exitTimer) {
          clearTimeout(exitTimer);
        }
        exitTimer = window.setTimeout(
          () => {
            shouldRender.value = false;
            exitTimer = null;
          },
          reduceMotion.value ? 0 : 260
        );
      }
    }
  );

  watch(
    () => reduceMotion.value,
    (prefersReduce) => {
      if (prefersReduce) onPointerLeave();
    }
  );

  onBeforeUnmount(() => {
    // Unregister from physics system
    physics.unregisterDraggable(id);

    // Unregister from intent coordinator
    if (registerIntent) {
      unregisterTarget(id);
    }

    // Clean up event listeners
    if (grabEndHandler) {
      useEventBus().off('handtrack:grab-end', grabEndHandler);
      grabEndHandler = null;
    }

    if (focusHandler) {
      useEventBus().off('widget:focus', focusHandler);
      focusHandler = null;
    }

    if (handTrackingGrabEndHandler) {
      try {
        getHandTrackingSystem().unsubscribe('hand:grab-end', handTrackingGrabEndHandler);
      } catch {
        // Hand tracking not available
      }
      handTrackingGrabEndHandler = null;
    }

    // Clean up motion preference
    if (motionMediaQuery && motionPreferenceHandler) {
      try {
        motionMediaQuery.removeEventListener('change', motionPreferenceHandler);
      } catch {
        motionMediaQuery.removeListener(motionPreferenceHandler);
      }
      motionMediaQuery = null;
      motionPreferenceHandler = null;
    }

    // Clean up timers
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = null;
    }
    if (typeof window !== 'undefined' && tiltFrame != null) {
      window.cancelAnimationFrame(tiltFrame);
      tiltFrame = null;
    }
  });

  return {
    // State
    visible,
    shouldRender,
    reveal,
    size,
    pos,
    reduceMotion,
    tiltX,
    tiltY,

    // Drag state
    isDragging,
    isResizing,

    // Computed styles
    wrapperStyle,
    headerStyle,
    resizerStyle,

    // Fullscreen
    isFullscreen,

    // Methods
    setVisible,
    toggle,
    bringToFront,
    close,
    toggleFullscreen,

    // Lifecycle bindings
    bindRoot,
    bindResizer,

    // Tilt handlers
    onPointerMove,
    onPointerLeave,

    // External access
    savePos,
    saveSize,
  };
}

export default useFloatingWidget;
