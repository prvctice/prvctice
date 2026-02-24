/**
 * useSidePanel - Shared composable for side panel behavior
 *
 * Handles: visibility, animations, splitter resizing, keyboard shortcuts,
 * global method registration, and cleanup tracking.
 */
import { ref, type Ref, onMounted, onBeforeUnmount } from 'vue';
import { animate } from '@motionone/dom';
import type { AnimationOptionsWithOverrides } from '@motionone/dom';
import { useMotionPreferences, motionDurations, motionEasings } from './useMotion.js';
import { overlayOn, overlayOff } from '@web/utils/customOverlay.js';

// Extend motionone options with Web Animations API fill property
type AnimationOptionsWithFill = AnimationOptionsWithOverrides & { fill?: FillMode };

export type PaneId = 'help' | 'about' | 'voice-commands' | 'notes';

export interface SidePanelConfig {
  /** Unique identifier for this panel */
  id: PaneId;
  /** Overlay name (defaults to id) */
  overlayName?: string;
  /** Other panes to hide when this one opens */
  hidesOnOpen?: PaneId[];
  /** Whether to show a close button */
  showCloseButton?: boolean;
  /** Keyboard shortcut to toggle (e.g., 'h' for Cmd+Shift+H) */
  keyboardShortcut?: string;
  /** ID of the toggle button element */
  toggleButtonId?: string;
  /** Called when panel opens */
  onOpen?: () => void;
  /** Called when panel closes */
  onClose?: () => void;
}

export interface OpenOptions {
  skipAnimation?: boolean;
}

export interface CloseOptions {
  force?: boolean;
  skipAnimation?: boolean;
  keepSplitMode?: boolean;
}

export interface SidePanelReturn {
  /** Whether the panel is currently visible */
  visible: Ref<boolean>;
  /** Ref to attach to the container element */
  containerRef: Ref<HTMLElement | null>;
  /** Ref to attach to the content element (for scroll reset) */
  contentRef: Ref<HTMLElement | null>;
  /** Open the panel */
  open: (force?: boolean, options?: OpenOptions) => Promise<void>;
  /** Close the panel */
  close: (options?: CloseOptions) => Promise<void>;
  /** Toggle the panel */
  toggle: (options?: CloseOptions) => Promise<void>;
  /** Motion preference */
  reduceMotion: Ref<boolean>;
}

// DOM element getters
function getElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function chatContainer(): HTMLElement | null {
  return getElement('chat-container');
}

function splitter(): HTMLElement | null {
  return getElement('splitter');
}

function getPaneContainer(id: PaneId): HTMLElement | null {
  return getElement(`${id}-container`);
}

function isPaneOpen(id: PaneId): boolean {
  const el = getPaneContainer(id);
  return !!el && !el.classList.contains('hidden');
}

function hidePane(id: PaneId): void {
  const el = getPaneContainer(id);
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  overlayOff(id);
  try {
    window.setDotMatrixReadingOpen?.(false);
  } catch (_) {}
}

function lowerBarToBottomSafe(): void {
  try {
    if (typeof window.lowerBarToBottom === 'function') {
      window.lowerBarToBottom();
    }
  } catch (_) {}
}

export function useSidePanel(config: SidePanelConfig): SidePanelReturn {
  const {
    id,
    overlayName = id,
    hidesOnOpen = [],
    toggleButtonId,
    keyboardShortcut,
    onOpen,
    onClose,
  } = config;

  const containerRef = ref<HTMLElement | null>(null);
  const contentRef = ref<HTMLElement | null>(null);
  const visible = ref(false);
  const cleanups: Array<() => void> = [];
  const { reduceMotion } = useMotionPreferences();

  let paneAnimation: ReturnType<typeof animate> | null = null;
  let splitterAnimation: ReturnType<typeof animate> | null = null;

  // Animation helpers
  function stopPaneAnimation(): void {
    if (paneAnimation && typeof paneAnimation.cancel === 'function') {
      try {
        paneAnimation.cancel();
      } catch (_) {}
    }
    paneAnimation = null;
  }

  function stopSplitterAnimation(): void {
    if (splitterAnimation && typeof splitterAnimation.cancel === 'function') {
      try {
        splitterAnimation.cancel();
      } catch (_) {}
    }
    splitterAnimation = null;
  }

  function resetPaneStyles(node: HTMLElement | null): void {
    if (!node) return;
    node.style.removeProperty('opacity');
    node.style.removeProperty('transform');
  }

  function resetSplitterStyles(node: HTMLElement | null): void {
    if (!node) return;
    node.style.removeProperty('opacity');
    node.style.removeProperty('transform');
  }

  function animatePane(entering: boolean, node: HTMLElement | null): Promise<void> {
    if (!node) return Promise.resolve();
    stopPaneAnimation();
    const durations = motionDurations();
    const easings = motionEasings();
    const duration = entering ? durations.fade : durations.medium;
    const easing = entering ? easings.emphasis : easings.standard;
    node.style.opacity = entering ? '0' : '1';
    node.style.transform = entering ? 'translateY(18px)' : 'translateY(0px)';
    paneAnimation = animate(
      node,
      {
        opacity: entering ? [0, 1] : [1, 0],
        transform: entering
          ? ['translateY(18px)', 'translateY(0px)']
          : ['translateY(0px)', 'translateY(18px)'],
      },
      { duration, easing, fill: 'forwards' } as AnimationOptionsWithFill
    );
    const finished = paneAnimation.finished.catch(() => {});
    if (entering) {
      return finished.finally(() => {
        resetPaneStyles(node);
        paneAnimation = null;
      });
    }
    return finished.finally(() => {
      resetPaneStyles(node);
      paneAnimation = null;
    });
  }

  function animateSplitter(entering: boolean, node: HTMLElement | null): Promise<void> {
    if (!node) return Promise.resolve();
    stopSplitterAnimation();
    const durations = motionDurations();
    const easing = motionEasings().standard;
    const duration = entering ? durations.medium : durations.short;
    node.style.opacity = entering ? '0' : '1';
    splitterAnimation = animate(node, { opacity: entering ? [0, 1] : [1, 0] }, {
      duration,
      easing,
      fill: 'forwards',
    } as AnimationOptionsWithFill);
    const finished = splitterAnimation.finished.catch(() => {});
    if (entering) {
      return finished.finally(() => {
        resetSplitterStyles(node);
        splitterAnimation = null;
      });
    }
    return finished.finally(() => {
      splitterAnimation = null;
    });
  }

  // Core visibility state machine
  async function applyVisibilityState({
    skipAnimation = false,
    keepSplitMode = false,
  }: { skipAnimation?: boolean; keepSplitMode?: boolean } = {}): Promise<void> {
    const container = containerRef.value;
    const chat = chatContainer();
    const split = splitter();
    if (!container || !chat || !split) return;

    const shouldAnimate = !skipAnimation && !reduceMotion.value;

    stopPaneAnimation();
    stopSplitterAnimation();

    if (visible.value) {
      // Opening
      container.classList.remove('hidden');
      container.setAttribute('aria-hidden', 'false');
      chat.classList.add('split-mode');
      split.classList.remove('hidden');
      if (contentRef.value) contentRef.value.scrollTop = 0;
      try {
        window.setDotMatrixReadingOpen?.(true);
        window.setModelViewerPanelOpen?.(true);
      } catch (_) {}
      if (shouldAnimate) {
        resetPaneStyles(container);
        resetSplitterStyles(split);
        await Promise.all([animatePane(true, container), animateSplitter(true, split)]);
      } else {
        resetPaneStyles(container);
        resetSplitterStyles(split);
      }
      return;
    }

    // Closing
    try {
      window.setDotMatrixReadingOpen?.(false);
    } catch (_) {}

    // Check if other panes are open
    const otherPaneIds: PaneId[] = ['notes', 'help', 'about', 'voice-commands'];
    const otherPanesOpen =
      otherPaneIds.filter((paneId) => paneId !== id && isPaneOpen(paneId)).length > 0;
    const preserveSplit = otherPanesOpen || keepSplitMode;

    // Restore bird visibility only if no other panels are open
    if (!otherPanesOpen) {
      try {
        window.setModelViewerPanelOpen?.(false);
      } catch (_) {}
    }

    if (shouldAnimate) {
      resetPaneStyles(container);
      if (!preserveSplit) resetSplitterStyles(split);
      const animations = [animatePane(false, container)];
      if (!preserveSplit) animations.push(animateSplitter(false, split));
      await Promise.all(animations);
    } else {
      resetPaneStyles(container);
      if (!preserveSplit) resetSplitterStyles(split);
    }

    container.classList.add('hidden');
    container.setAttribute('aria-hidden', 'true');

    if (!preserveSplit) {
      chat.classList.remove('split-mode');
      split.classList.add('hidden');
      resetSplitterStyles(split);
    }
    resetPaneStyles(container);
  }

  // Public API
  function open(force = false, options: OpenOptions = {}): Promise<void> {
    if (visible.value && !force) return Promise.resolve();

    // Hide other panes
    for (const paneId of hidesOnOpen) {
      hidePane(paneId);
    }

    visible.value = true;
    lowerBarToBottomSafe();

    try {
      overlayOn(overlayName);
    } catch (_) {}

    onOpen?.();

    return applyVisibilityState({ skipAnimation: options.skipAnimation === true });
  }

  function close(options: CloseOptions = {}): Promise<void> {
    const { force = false, skipAnimation = false, keepSplitMode = false } = options || {};
    if (!visible.value && !force) return Promise.resolve();

    visible.value = false;

    try {
      overlayOff(overlayName);
    } catch (_) {}

    onClose?.();

    return applyVisibilityState({ skipAnimation, keepSplitMode }).then(() => {
      // Use RAF to ensure DOM has settled after split-mode removal
      requestAnimationFrame(() => {
        // Reset chat window position (fixes mobile positioning after panel close)
        try {
          const chatWindow = document.querySelector('.chat-window') as HTMLElement;
          if (chatWindow) {
            chatWindow.style.removeProperty('position');
            chatWindow.style.removeProperty('left');
            chatWindow.style.removeProperty('visibility');
            chatWindow.style.removeProperty('transform');
          }
        } catch (_) {}
        // Refresh chat scroller after panel closes (fixes mobile scroll position)
        try {
          if (typeof window.refreshChatScroller === 'function') {
            window.refreshChatScroller();
          }
        } catch (_) {}
      });
    });
  }

  function toggle(options: CloseOptions = {}): Promise<void> {
    return visible.value ? close(options) : open(false, options);
  }

  // Splitter drag handling
  function attachSplitter(): (() => void) | null {
    const container = containerRef.value;
    const chat = chatContainer();
    const split = splitter();
    if (!container || !chat || !split) return null;

    const minSize = 280;
    const isVertical = (): boolean => getComputedStyle(chat).flexDirection.startsWith('column');
    let startX = 0;
    let startY = 0;
    let startPrimary = 0;

    const onMove = (e: MouseEvent): void => {
      if (!visible.value) return;
      if (isVertical()) {
        const dy = e.clientY - startY;
        let h = startPrimary - dy;
        const maxH = window.innerHeight * 0.8;
        h = Math.min(Math.max(h, minSize), maxH);
        container.style.flex = `0 0 ${h}px`;
        container.style.height = `${h}px`;
      } else {
        const dx = e.clientX - startX;
        let w = startPrimary + dx;
        const maxW = window.innerWidth * 0.8;
        w = Math.min(Math.max(w, minSize), maxW);
        container.style.flex = `0 0 ${w}px`;
        container.style.width = `${w}px`;
      }
    };

    const stop = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', stop);
    };

    const onDown = (e: MouseEvent): void => {
      if (!visible.value) return;
      if (isVertical()) {
        startY = e.clientY;
        startPrimary = container.getBoundingClientRect().height;
      } else {
        startX = e.clientX;
        startPrimary = container.getBoundingClientRect().width;
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', stop);
    };

    split.addEventListener('mousedown', onDown);
    return () => split.removeEventListener('mousedown', onDown);
  }

  // Keyboard shortcut (Cmd+Shift+<key>)
  function attachKeyboardShortcut(): (() => void) | null {
    if (!keyboardShortcut) return null;

    const handler = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === keyboardShortcut.toLowerCase()) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler, { passive: false });
    return () => window.removeEventListener('keydown', handler);
  }

  // Escape key to close
  function attachEscapeKey(): () => void {
    const handler = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && visible.value) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler, { passive: false });
    return () => window.removeEventListener('keydown', handler);
  }

  // Toggle button
  function attachToggleButton(): (() => void) | null {
    if (!toggleButtonId) return null;
    const btn = getElement(toggleButtonId);
    if (!btn) return null;

    const handler = (e: Event): void => {
      e.preventDefault();
      toggle();
    };
    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }

  // Update toggle button active state
  function updateToggleButtonState(): void {
    if (!toggleButtonId) return;
    const btn = getElement(toggleButtonId);
    if (!btn) return;
    if (visible.value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  // Lifecycle
  onMounted(() => {
    overlayOff(overlayName);

    const splitterCleanup = attachSplitter();
    if (splitterCleanup) cleanups.push(splitterCleanup);

    const escapeCleanup = attachEscapeKey();
    cleanups.push(escapeCleanup);

    const shortcutCleanup = attachKeyboardShortcut();
    if (shortcutCleanup) cleanups.push(shortcutCleanup);

    const buttonCleanup = attachToggleButton();
    if (buttonCleanup) cleanups.push(buttonCleanup);

    cleanups.push(() => {
      stopPaneAnimation();
      stopSplitterAnimation();
    });
  });

  onBeforeUnmount(() => {
    close({ force: true, skipAnimation: true });
    cleanups.forEach((fn) => {
      if (typeof fn === 'function') {
        try {
          fn();
        } catch (_) {}
      }
    });
    cleanups.length = 0;
  });

  // Wrap open/close to update toggle button
  const wrappedOpen = (force = false, options: OpenOptions = {}): Promise<void> => {
    const result = open(force, options);
    updateToggleButtonState();
    return result;
  };

  const wrappedClose = (options: CloseOptions = {}): Promise<void> => {
    const result = close(options);
    updateToggleButtonState();
    return result;
  };

  const wrappedToggle = (options: CloseOptions = {}): Promise<void> => {
    return visible.value ? wrappedClose(options) : wrappedOpen(false, options);
  };

  return {
    visible,
    containerRef,
    contentRef,
    open: wrappedOpen,
    close: wrappedClose,
    toggle: wrappedToggle,
    reduceMotion,
  };
}

/**
 * Helper to register global window methods for a panel
 */
export function registerPanelGlobals(
  panelName: string,
  open: (force?: boolean, options?: OpenOptions) => Promise<void>,
  close: (options?: CloseOptions) => Promise<void>,
  toggle: (options?: CloseOptions) => Promise<void>,
  extras?: Record<string, unknown>
): () => void {
  const capitalizedName = panelName.charAt(0).toUpperCase() + panelName.slice(1);
  const openKey = `open${capitalizedName}Pane`;
  const closeKey = `close${capitalizedName}Pane`;
  const toggleKey = `toggle${capitalizedName}Pane`;

  const win = window as unknown as Record<string, unknown>;

  try {
    win[openKey] = open;
    win[closeKey] = close;
    win[toggleKey] = toggle;

    if (extras) {
      for (const [key, value] of Object.entries(extras)) {
        win[key] = value;
      }
    }
  } catch (_) {}

  return () => {
    try {
      delete win[openKey];
      delete win[closeKey];
      delete win[toggleKey];

      if (extras) {
        for (const key of Object.keys(extras)) {
          delete win[key];
        }
      }
    } catch (_) {}
  };
}
