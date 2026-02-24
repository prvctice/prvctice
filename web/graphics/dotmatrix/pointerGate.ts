/**
 * Pointer Gate Utility for OrbitControls
 *
 * Extracts the pointer gate logic from core.ts into a clean, testable utility.
 * The pointer gate enables OrbitControls only for specific pointer interactions:
 * - Middle-click on desktop
 * - Primary click + modifier keys (shift/alt/meta/ctrl) on desktop
 * - Primary touch on mobile (when touching the canvas)
 *
 * This utility properly tracks all event listeners for guaranteed cleanup.
 */

import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Configuration options for the pointer gate.
 */
export interface PointerGateConfig {
  /** Whether the device is mobile (enables touch handling) */
  isMobile: boolean;
  /** Canvas element for touch target detection */
  canvasEl: HTMLCanvasElement | null;
  /** Canvas container for touch target detection */
  canvasContainer: HTMLElement | null;
  /** Callback to check if controls should be interactive */
  isInteractive: () => boolean;
  /** Callback to check if an element should block orbit */
  isInteractiveTarget: (node: EventTarget | null) => boolean;
}

/**
 * Interface returned by createPointerGate for controlling the gate.
 */
export interface PointerGate {
  /** Enable the pointer gate (starts listening for events) */
  enable: () => void;
  /** Disable the pointer gate (stops listening but preserves state) */
  disable: () => void;
  /** Dispose the pointer gate (removes all listeners, cannot be re-enabled) */
  dispose: () => void;
  /** Check if the gate is currently enabled */
  isEnabled: () => boolean;
}

interface ListenerEntry {
  target: EventTarget;
  type: string;
  handler: EventListener;
  options: AddEventListenerOptions;
}

/**
 * Creates a pointer gate for OrbitControls that enables rotation only for
 * specific pointer interactions.
 *
 * @param controls - The OrbitControls instance to gate
 * @param config - Configuration options
 * @returns PointerGate interface for controlling the gate
 */
export function createPointerGate(controls: OrbitControls, config: PointerGateConfig): PointerGate {
  const listeners: ListenerEntry[] = [];
  let enabled = false;
  let disposed = false;

  /**
   * Check if a DOM node is an interactive target that should block orbit.
   */
  const isInteractiveTarget = (node: EventTarget | null): boolean => {
    return config.isInteractiveTarget(node);
  };

  /**
   * Determines whether orbit should be allowed for this pointer event.
   */
  const shouldAllowOrbit = (ev: PointerEvent): boolean => {
    if (!config.isInteractive()) return false;
    if (!ev || ev.button === 2) return false; // Right-click disabled

    const pointerType = (ev.pointerType || '').toLowerCase();
    const hasModifier = ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey;
    const targetIsInteractive = isInteractiveTarget(ev.target);

    if (pointerType === 'touch') {
      // Touch: only allow on primary touch and when target is canvas
      if (typeof ev.isPrimary === 'boolean' && !ev.isPrimary) return false;
      try {
        if (config.canvasContainer && config.canvasContainer.contains(ev.target as Node)) {
          return true;
        }
        if (config.canvasEl && ev.target === config.canvasEl) return true;
      } catch {
        // Ignore DOM errors
      }
      return false;
    }

    // Mouse: middle-click always, modifier+drag anywhere, or drag on non-interactive background
    const allowMiddle = ev.button === 1;
    const allowWithModifier = ev.button === 0 && hasModifier;
    const allowOnBackground = ev.button === 0 && !targetIsInteractive;
    return allowMiddle || allowWithModifier || allowOnBackground;
  };

  /**
   * Pointer down handler - enables controls if orbit should be allowed.
   */
  const onPointerDown = (ev: Event): void => {
    if (disposed || !enabled) return;
    const pointerEvent = ev as PointerEvent;
    const allow = shouldAllowOrbit(pointerEvent);
    controls.enabled = allow;
  };

  /**
   * Pointer up/cancel handler - disables controls.
   */
  const onPointerReset = (): void => {
    if (disposed) return;
    controls.enabled = false;
  };

  /**
   * Context menu handler - blocks context menu on controls element.
   */
  const onContextMenu = (ev: Event): void => {
    ev.stopImmediatePropagation();
  };

  /**
   * Registers an event listener and tracks it for cleanup.
   */
  const addTrackedListener = (
    target: EventTarget,
    type: string,
    handler: EventListener,
    options: AddEventListenerOptions = {}
  ): void => {
    target.addEventListener(type, handler, options);
    listeners.push({ target, type, handler, options });
  };

  /**
   * Removes all tracked event listeners.
   */
  const removeAllListeners = (): void => {
    for (const { target, type, handler, options } of listeners) {
      try {
        target.removeEventListener(type, handler, options);
      } catch {
        // Ignore removal errors
      }
    }
    listeners.length = 0;
  };

  /**
   * Sets up all event listeners for the pointer gate.
   */
  const setupListeners = (): void => {
    // Block context menu on controls element
    if (controls.domElement) {
      addTrackedListener(controls.domElement, 'contextmenu', onContextMenu, { capture: true });

      // Set touch-action for proper touch handling
      try {
        (controls.domElement as HTMLElement).style.touchAction = config.isMobile
          ? 'none'
          : 'manipulation';
      } catch {
        // Ignore style errors
      }
    }

    // Pointer gate listeners on document (capture phase)
    addTrackedListener(document, 'pointerdown', onPointerDown, { capture: true, passive: true });
    addTrackedListener(document, 'pointerup', onPointerReset, { capture: true, passive: true });
    addTrackedListener(document, 'pointercancel', onPointerReset, { capture: true, passive: true });
  };

  // Initialize controls state
  controls.enabled = false;

  return {
    enable(): void {
      if (disposed || enabled) return;
      enabled = true;
      setupListeners();
    },

    disable(): void {
      if (disposed || !enabled) return;
      enabled = false;
      removeAllListeners();
      controls.enabled = false;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      enabled = false;
      removeAllListeners();
      controls.enabled = false;
    },

    isEnabled(): boolean {
      return enabled && !disposed;
    },
  };
}

/**
 * Default interactive target selector.
 * Elements matching this selector will block orbit controls.
 */
export const DEFAULT_INTERACTIVE_SELECTOR =
  '[data-no-orbit], button, a, input, textarea, select, [role="button"], [contenteditable="true"], dialog[open]';

/**
 * Creates a default isInteractiveTarget function using the standard selector.
 */
export function createDefaultInteractiveCheck(): (node: EventTarget | null) => boolean {
  return (node: EventTarget | null): boolean => {
    if (!(node instanceof Element)) return false;
    return !!node.closest(DEFAULT_INTERACTIVE_SELECTOR);
  };
}
