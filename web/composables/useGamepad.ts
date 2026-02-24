// web/composables/useGamepad.ts
// Gamepad/controller input support (PS5 DualSense, Xbox, etc.)
//
// Maps controller inputs to intents via window.intentCoordinator.
// Uses Web Gamepad API with requestAnimationFrame polling.
//
// PS5 DualSense mappings:
//   Right stick X/Y → move cursor
//   L2/R2 triggers → move inputBar down/up
//   Square (btn 0) → click at cursor position
//   Triangle (btn 3) → toggle side menu
//   Circle (btn 1) → back/escape (close menus/modals)
//   L1 (btn 4) → toggle notes tab
//   R1 (btn 5) → toggle mic
//   Options/Start (btn 9) → open settings modal
//   D-pad Up → new conversation
//   D-pad Down → toggle help panel
//   D-pad Left → cycle theme backward
//   D-pad Right → cycle theme forward
//   L3 (btn 10) → toggle 3D bird model
//   R3 (btn 11) → toggle time widget

import { useEventBus } from '@web/services/eventBus';
import { gamepadAdapter } from '@web/adapters/createInputAdapter';
import { debugLog } from '@web/utils/debugLog.js';

// --- Configuration ---
const DEADZONE = 0.15; // Ignore stick movement below this threshold
const STICK_SENSITIVITY = 25; // Pixels per frame at full deflection
const TRIGGER_SENSITIVITY = 25; // Pixels per frame for L2/R2 input bar movement
const BUTTON_DEBOUNCE = 200; // ms between button triggers

// Button indices (standard gamepad mapping)
const BTN = {
  SQUARE: 0, // X on Xbox
  CIRCLE: 1, // B on Xbox
  TRIANGLE: 3, // Y on Xbox
  L1: 4, // LB on Xbox
  R1: 5, // RB on Xbox
  L2: 6, // LT on Xbox
  R2: 7, // RT on Xbox
  OPTIONS: 9, // Start/Menu
  L3: 10, // LS on Xbox (left stick click)
  R3: 11, // RS on Xbox (right stick click)
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

// Axis indices
const AXIS = {
  LEFT_X: 0,
  LEFT_Y: 1,
  RIGHT_X: 2,
  RIGHT_Y: 3,
} as const;

// --- State ---
let gamepadIndex: number | null = null;
let animationId: number | null = null;
const lastButtonPress: Record<number, number> = {}; // { [buttonIndex]: timestamp }
let enabled = false; // Controlled by settings
let initialized = false;

// --- Virtual cursor ---
let cursorEl: HTMLDivElement | null = null;
let cursorX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500;
let cursorY = typeof window !== 'undefined' ? window.innerHeight / 2 : 300;

// --- Double-click tracking ---
const DOUBLE_CLICK_DELAY = 300; // ms window for double-click
const DOUBLE_CLICK_SLOP = 80; // px spatial tolerance
let lastClickTime = 0;
let lastClickX = 0;
let lastClickY = 0;
let clickCount = 0;

// --- Dialog state tracking ---
let dialogWasOpen = false;

// --- Window extensions for gamepad globals ---
// Using type intersection to avoid interface extension conflicts
type GamepadWindow = Window & {
  closeSettingsModal?: () => void;
  openSettingsModal?: () => void;
  startNewChat?: () => void | Promise<void>;
  toggleHelpPane?: () => void;
  openHelpPane?: () => void;
  cycleTheme?: (direction: number) => void;
  toggleWeatherTimeWidget?: () => void;
  themeComposable?: {
    cycle: (direction: number) => void;
  };
};

// ===========================================
// CURSOR MANAGEMENT
// ===========================================

function createCursor(): void {
  if (cursorEl) return;
  cursorEl = document.createElement('div');
  cursorEl.id = 'gamepad-cursor';
  cursorEl.style.cssText = `
    position: fixed;
    width: 24px;
    height: 24px;
    border: 2px solid white;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    z-index: 2147483647;
    transform: translate(-50%, -50%);
    transition: background 0.1s, transform 0.1s;
    display: none;
  `;
  document.body.appendChild(cursorEl);
}

function showCursor(): void {
  if (!cursorEl) createCursor();
  if (cursorEl) cursorEl.style.display = 'block';
  updateCursorPosition();
}

function hideCursor(): void {
  if (cursorEl) cursorEl.style.display = 'none';
}

function updateCursorPosition(): void {
  if (!cursorEl) return;

  // Move cursor into open dialog (top layer) so it's visible above it
  const settingsDialog = document.getElementById(
    'settings-pane-dialog'
  ) as HTMLDialogElement | null;
  const dialogIsOpen = settingsDialog && settingsDialog.open;

  // Center cursor on dialog when it first opens
  if (dialogIsOpen && !dialogWasOpen) {
    const inner = settingsDialog.querySelector('.sp-inner, .sp-inner--sidebar');
    if (inner) {
      const rect = inner.getBoundingClientRect();
      cursorX = rect.left + rect.width / 2;
      cursorY = rect.top + rect.height / 2;
    }
  }
  dialogWasOpen = !!dialogIsOpen;

  if (dialogIsOpen && settingsDialog) {
    // When inside dialog, position: fixed becomes relative to the dialog
    // (dialog creates a containing block), so convert viewport coords to dialog-relative
    const dialogRect = settingsDialog.getBoundingClientRect();
    cursorEl.style.left = cursorX - dialogRect.left + 'px';
    cursorEl.style.top = cursorY - dialogRect.top + 'px';

    if (cursorEl.parentElement !== settingsDialog) {
      settingsDialog.appendChild(cursorEl);
    }
  } else {
    // Normal viewport coordinates when outside dialog
    cursorEl.style.left = cursorX + 'px';
    cursorEl.style.top = cursorY + 'px';

    if (cursorEl.parentElement !== document.body) {
      document.body.appendChild(cursorEl);
    }
  }
}

function animateCursorClick(): void {
  if (!cursorEl) return;
  cursorEl.style.transform = 'translate(-50%, -50%) scale(0.8)';
  cursorEl.style.background = 'rgba(255, 255, 255, 0.6)';
  setTimeout(() => {
    if (cursorEl) {
      cursorEl.style.transform = 'translate(-50%, -50%) scale(1)';
      cursorEl.style.background = 'rgba(255, 255, 255, 0.3)';
    }
  }, 100);
}

// ===========================================
// INTENT EMISSION
// ===========================================

/** Emit options for gamepad adapter */
interface GamepadEmitOptions {
  target?: string;
  value?: unknown;
}

function emit(action: string, options: GamepadEmitOptions = {}): unknown {
  return gamepadAdapter().emit(action, options);
}

// ===========================================
// HELPERS
// ===========================================

function applyDeadzone(value: number): number {
  if (Math.abs(value) < DEADZONE) return 0;
  // Scale remaining range to 0-1
  const sign = value > 0 ? 1 : -1;
  return sign * ((Math.abs(value) - DEADZONE) / (1 - DEADZONE));
}

function isButtonPressed(button: GamepadButton | undefined): boolean {
  return button !== undefined && (button.pressed || button.value > 0.5);
}

function canTriggerButton(index: number): boolean {
  const now = Date.now();
  const last = lastButtonPress[index] || 0;
  if (now - last < BUTTON_DEBOUNCE) return false;
  lastButtonPress[index] = now;
  return true;
}

// ===========================================
// INPUT HANDLERS
// ===========================================

function handleTriggers(buttons: readonly GamepadButton[]): void {
  const l2 = buttons[BTN.L2]?.value ?? 0;
  const r2 = buttons[BTN.R2]?.value ?? 0;
  // L2 moves bar down, R2 moves bar up — net delta
  const raw = l2 - r2;
  if (Math.abs(raw) < DEADZONE) return;

  const deltaY = raw * TRIGGER_SENSITIVITY;
  emit('move', {
    target: 'inputBar',
    value: { delta: { y: deltaY } },
  });
}

function handleRightStick(xAxis: number, yAxis: number): void {
  const x = applyDeadzone(xAxis);
  const y = applyDeadzone(yAxis);
  if (x === 0 && y === 0) return;

  // Move virtual cursor
  let minX = 0;
  let maxX = window.innerWidth;
  let minY = 0;
  let maxY = window.innerHeight;

  // Constrain cursor to dialog bounds when settings modal is open
  const settingsDialog = document.getElementById(
    'settings-pane-dialog'
  ) as HTMLDialogElement | null;
  if (settingsDialog && settingsDialog.open) {
    const inner = settingsDialog.querySelector('.sp-inner, .sp-inner--sidebar');
    if (inner) {
      const rect = inner.getBoundingClientRect();
      minX = rect.left + 10;
      maxX = rect.right - 10;
      minY = rect.top + 10;
      maxY = rect.bottom - 10;
    }
  }

  cursorX = Math.max(minX, Math.min(maxX, cursorX + x * STICK_SENSITIVITY));
  cursorY = Math.max(minY, Math.min(maxY, cursorY + y * STICK_SENSITIVITY));
  updateCursorPosition();
}

function handleTriangle(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.TRIANGLE])) return;
  if (!canTriggerButton(BTN.TRIANGLE)) return;

  // Toggle side menu
  emit('toggle', { target: 'sideMenu' });
  debugLog('gamepad', 'button:triangle', 'Toggling side menu');
}

function handleCircle(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.CIRCLE])) return;
  if (!canTriggerButton(BTN.CIRCLE)) return;

  // Back/escape - close modals or menus
  emit('back', { target: 'global' });

  // Try to close settings modal via global function
  const win = window as GamepadWindow;
  if (typeof win.closeSettingsModal === 'function') {
    win.closeSettingsModal();
  }

  // Dispatch Escape key on the active element and window for modal handling
  const escapeEvent = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  });
  // Try focused element first, then document
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body) {
    activeEl.dispatchEvent(escapeEvent);
  }
  document.dispatchEvent(escapeEvent);
  window.dispatchEvent(escapeEvent);

  debugLog('gamepad', 'button:circle', 'Back/Escape');
}

function handleL1(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.L1])) return;
  if (!canTriggerButton(BTN.L1)) return;

  // Toggle notes tab
  emit('toggle', { target: 'notes' });
  debugLog('gamepad', 'button:l1', 'Toggling notes');
}

function handleR1(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.R1])) return;
  if (!canTriggerButton(BTN.R1)) return;

  // Toggle mic by clicking the voice input button
  const voiceBtn = document.getElementById('voice-input-button');
  if (voiceBtn) {
    voiceBtn.click();
    debugLog('gamepad', 'button:r1', 'Toggling mic');
  }
}

function handleSquare(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.SQUARE])) return;
  if (!canTriggerButton(BTN.SQUARE)) return;

  // Click at cursor position
  animateCursorClick();

  // Hide cursor temporarily to get element underneath
  const cursorWasVisible = cursorEl && cursorEl.style.display !== 'none';
  if (cursorEl) cursorEl.style.display = 'none';

  let el: Element | null = null;
  const settingsDialog = document.getElementById(
    'settings-pane-dialog'
  ) as HTMLDialogElement | null;

  // When dialog is open, find interactive elements within it
  if (settingsDialog && settingsDialog.open) {
    // Get all elements at the cursor position using elementsFromPoint
    const elements = document.elementsFromPoint(cursorX, cursorY);

    // Find the first interactive element that's inside the dialog
    const interactiveSelectors =
      'button, input, select, textarea, [role="button"], a, [tabindex]:not([tabindex="-1"]), .theme-swatch, label';
    for (const elem of elements) {
      if (elem === cursorEl || elem === settingsDialog) continue;
      if (settingsDialog.contains(elem) && elem.matches(interactiveSelectors)) {
        el = elem;
        break;
      }
    }

    // If no interactive element found, try the raw element at point (for scrollable areas etc)
    if (!el) {
      for (const elem of elements) {
        if (elem === cursorEl || elem === settingsDialog) continue;
        if (settingsDialog.contains(elem)) {
          el = elem;
          break;
        }
      }
    }
  } else {
    el = document.elementFromPoint(cursorX, cursorY);
  }

  // Restore cursor
  if (cursorEl && cursorWasVisible) cursorEl.style.display = 'block';

  // Track double-click timing
  const now = Date.now();
  const dx = Math.abs(cursorX - lastClickX);
  const dy = Math.abs(cursorY - lastClickY);
  const dt = now - lastClickTime;

  if (dt < DOUBLE_CLICK_DELAY && dx + dy < DOUBLE_CLICK_SLOP) {
    clickCount++;
  } else {
    clickCount = 1;
  }

  lastClickTime = now;
  lastClickX = cursorX;
  lastClickY = cursorY;

  // Common event options
  const eventOpts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: cursorX,
    clientY: cursorY,
  };

  // Dispatch pointerdown for ripple effects
  const pointerTarget = el || document.body;
  const pointerOpts: PointerEventInit = {
    ...eventOpts,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  pointerTarget.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));

  if (el) {
    // Dispatch mouse events for full compatibility
    const mouseOpts: MouseEventInit = { ...eventOpts, detail: clickCount };
    el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
    el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
    el.dispatchEvent(new MouseEvent('click', mouseOpts));

    // If this is a double-click, also dispatch dblclick event
    if (clickCount >= 2) {
      el.dispatchEvent(new MouseEvent('dblclick', mouseOpts));
      // Also dispatch on document for handlers using capture phase
      document.dispatchEvent(new MouseEvent('dblclick', { ...eventOpts, detail: clickCount }));
      debugLog(
        'gamepad',
        'click:double',
        Math.round(cursorX),
        Math.round(cursorY),
        el.tagName,
        el.className
      );
      // Reset click count after double-click
      clickCount = 0;
    } else {
      debugLog(
        'gamepad',
        'click:single',
        Math.round(cursorX),
        Math.round(cursorY),
        el.tagName,
        el.className
      );
    }
  } else {
    // No element found, but still dispatch events on document for global handlers
    document.dispatchEvent(new MouseEvent('click', { ...eventOpts, detail: clickCount }));
    if (clickCount >= 2) {
      document.dispatchEvent(new MouseEvent('dblclick', { ...eventOpts, detail: clickCount }));
      debugLog('gamepad', 'click:double-bg', Math.round(cursorX), Math.round(cursorY));
      clickCount = 0;
    }
  }
}

function handleOptions(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.OPTIONS])) return;
  if (!canTriggerButton(BTN.OPTIONS)) return;

  // Open settings modal
  const win = window as GamepadWindow;
  if (typeof win.openSettingsModal === 'function') {
    win.openSettingsModal();
    debugLog('gamepad', 'button:options', 'Opening settings modal');
  }
}

// --- D-pad handlers ---
function handleDpadUp(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.DPAD_UP])) return;
  if (!canTriggerButton(BTN.DPAD_UP)) return;

  // New conversation (no confirm when using gamepad)
  const win = window as GamepadWindow;
  if (typeof win.startNewChat === 'function') {
    win.startNewChat();
    debugLog('gamepad', 'dpad:up', 'Starting new conversation');
  }
}

function handleDpadDown(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.DPAD_DOWN])) return;
  if (!canTriggerButton(BTN.DPAD_DOWN)) return;

  // Toggle help panel
  const win = window as GamepadWindow;
  if (typeof win.toggleHelpPane === 'function') {
    win.toggleHelpPane();
    debugLog('gamepad', 'dpad:down', 'Toggling help panel');
  } else if (typeof win.openHelpPane === 'function') {
    win.openHelpPane();
    debugLog('gamepad', 'dpad:down', 'Opening help panel');
  } else {
    const helpBtn = document.getElementById('help-toggle-button');
    if (helpBtn) {
      helpBtn.click();
      debugLog('gamepad', 'dpad:down', 'Clicking help button');
    }
  }
}

function handleDpadLeft(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.DPAD_LEFT])) return;
  if (!canTriggerButton(BTN.DPAD_LEFT)) return;

  // Cycle theme backward
  const win = window as GamepadWindow;
  if (typeof win.cycleTheme === 'function') {
    win.cycleTheme(-1);
    debugLog('gamepad', 'dpad:left', 'Cycling theme backward');
  } else if (win.themeComposable && typeof win.themeComposable.cycle === 'function') {
    win.themeComposable.cycle(-1);
    debugLog('gamepad', 'dpad:left', 'Cycling theme backward');
  }
}

function handleDpadRight(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.DPAD_RIGHT])) return;
  if (!canTriggerButton(BTN.DPAD_RIGHT)) return;

  // Cycle theme forward
  const win = window as GamepadWindow;
  if (typeof win.cycleTheme === 'function') {
    win.cycleTheme(1);
    debugLog('gamepad', 'dpad:right', 'Cycling theme forward');
  } else if (win.themeComposable && typeof win.themeComposable.cycle === 'function') {
    win.themeComposable.cycle(1);
    debugLog('gamepad', 'dpad:right', 'Cycling theme forward');
  }
}

// --- Stick button handlers ---
function handleL3(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.L3])) return;
  if (!canTriggerButton(BTN.L3)) return;

  // Toggle 3D bird model
  const toggleBtn = document.getElementById('toggle-model-button');
  if (toggleBtn) {
    toggleBtn.click();
    debugLog('gamepad', 'button:l3', 'Toggling 3D bird model');
  }
}

function handleR3(buttons: readonly GamepadButton[]): void {
  if (!isButtonPressed(buttons[BTN.R3])) return;
  if (!canTriggerButton(BTN.R3)) return;

  // Toggle time widget
  const win = window as GamepadWindow;
  if (typeof win.toggleWeatherTimeWidget === 'function') {
    win.toggleWeatherTimeWidget();
    debugLog('gamepad', 'button:r3', 'Toggling time widget');
  }
}

// ===========================================
// MAIN POLL LOOP
// ===========================================

function pollGamepad(): void {
  if (!enabled) {
    animationId = null;
    return;
  }

  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gamepadIndex !== null ? gamepads[gamepadIndex] : null;

  if (!gp || !gp.connected) {
    // Lost connection, try to find another
    gamepadIndex = null;
    hideCursor();
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.connected) {
        gamepadIndex = i;
        showCursor();
        debugLog('gamepad', 'connection:switch', `Switched to gamepad ${i}: ${pad.id}`);
        break;
      }
    }
    if (gamepadIndex === null) {
      animationId = requestAnimationFrame(pollGamepad);
      return;
    }
  }

  const gamepad = gamepadIndex !== null ? gamepads[gamepadIndex] : null;
  if (!gamepad) {
    animationId = requestAnimationFrame(pollGamepad);
    return;
  }

  const { buttons, axes } = gamepad;

  // Analog sticks + triggers
  handleRightStick(axes[AXIS.RIGHT_X] ?? 0, axes[AXIS.RIGHT_Y] ?? 0);
  handleTriggers(buttons);

  // Face buttons
  handleSquare(buttons);
  handleTriangle(buttons);
  handleCircle(buttons);
  handleOptions(buttons);

  // Shoulder buttons
  handleL1(buttons);
  handleR1(buttons);

  // D-pad
  handleDpadUp(buttons);
  handleDpadDown(buttons);
  handleDpadLeft(buttons);
  handleDpadRight(buttons);

  // Stick buttons
  handleL3(buttons);
  handleR3(buttons);

  animationId = requestAnimationFrame(pollGamepad);
}

// ===========================================
// ENABLE/DISABLE
// ===========================================

function startPolling(): void {
  if (animationId) return; // Already running

  // Find a connected gamepad
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < gamepads.length; i++) {
    const pad = gamepads[i];
    if (pad && pad.connected) {
      gamepadIndex = i;
      debugLog('gamepad', 'connection:using', `Using gamepad ${i}: ${pad.id}`);
      break;
    }
  }

  // Only show virtual cursor when a gamepad is actually connected
  if (gamepadIndex !== null) {
    showCursor();
  }

  animationId = requestAnimationFrame(pollGamepad);
  debugLog('gamepad', 'polling:start', 'Polling started');
}

function stopPolling(): void {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  // Hide virtual cursor
  hideCursor();
  debugLog('gamepad', 'polling:stop', 'Polling stopped');
}

function setEnabled(value: boolean): void {
  enabled = !!value;
  if (enabled) {
    startPolling();
  } else {
    stopPolling();
  }
}

// ===========================================
// CONNECTION EVENTS
// ===========================================

function onGamepadConnected(e: GamepadEvent): void {
  debugLog('gamepad', 'connection:connected', `${e.gamepad.id} (index ${e.gamepad.index})`);
  if (enabled && gamepadIndex === null) {
    gamepadIndex = e.gamepad.index;
    showCursor();
    startPolling();
  }
}

function onGamepadDisconnected(e: GamepadEvent): void {
  debugLog('gamepad', 'connection:disconnected', e.gamepad.id);
  if (e.gamepad.index === gamepadIndex) {
    gamepadIndex = null;
    // Hide cursor when the active gamepad disconnects
    // The poll loop will try to find another connected gamepad
    hideCursor();
  }
}

// ===========================================
// SETTINGS CHANGE LISTENER
// ===========================================

function onGamepadEnabledChange(event: { enabled: boolean }): void {
  if (event && typeof event.enabled === 'boolean') {
    setEnabled(event.enabled);
  }
}

// ===========================================
// LOAD SAVED SETTING
// ===========================================

function loadSavedSetting(): boolean {
  try {
    const stored = localStorage.getItem('gamepadEnabled');
    return stored === 'true';
  } catch (_) {
    return false;
  }
}

// ===========================================
// INITIALIZATION
// ===========================================

function init(): void {
  if (initialized) return;
  initialized = true;

  // Listen for gamepad connection events
  window.addEventListener('gamepadconnected', onGamepadConnected);
  window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

  // Listen for settings changes from the accessibility pane via EventBus
  useEventBus().on('gamepad:enabled-change', onGamepadEnabledChange);

  // Load saved setting and start if enabled
  enabled = loadSavedSetting();
  if (enabled) {
    debugLog('gamepad', 'init:enabled', 'Enabled via saved setting');
    startPolling();
  }

  debugLog('gamepad', 'init:complete', 'Input handler initialized (enabled: ' + enabled + ')');
}

// ===========================================
// COMPOSABLE EXPORT
// ===========================================

export interface UseGamepadReturn {
  init: () => void;
  isEnabled: () => boolean;
  setEnabled: (value: boolean) => void;
  isInitialized: () => boolean;
}

export function useGamepad(): UseGamepadReturn {
  return {
    init,
    isEnabled: () => enabled,
    setEnabled,
    isInitialized: () => initialized,
  };
}

/**
 * Initialize gamepad support
 * Safe to call multiple times - will only initialize once
 */
export function initGamepad(): void {
  init();
}

export default useGamepad;
