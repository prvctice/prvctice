import type { InputState } from './types';
import type { GameEngine } from './engine';
import { setPlayerPaddlePosition, pauseEngine, resumeEngine } from './engine';
import {
  getHandTrackingSystem,
  type HandMoveEvent,
  type HandTrackingEventCallback,
} from '../../graphics/dotmatrix/handtrack';

export interface InputHandlers {
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  mousemove: (e: MouseEvent) => void;
  touchmove: (e: TouchEvent) => void;
  touchstart: (e: TouchEvent) => void;
  gamepadPoll: number | null;
  /** @deprecated Use event-based hand tracking instead */
  handTrackPoll: number | null;
  // Event-based hand tracking handler
  handMoveHandler: HandTrackingEventCallback<HandMoveEvent> | null;
}

let handTrackingActive = false;
let handTrackingEnabled = true;
let mousePendingUpdate = false;
let handGrabStartY = 0;
let paddleGrabStartY = 0.5;
const PADDLE_HAND_GAIN = 3.5;

// Smoothed hand position for event-based tracking
let handSmoothedY: number | null = null;
const HAND_SMOOTHING = 0.5;

// Current engine context for event callbacks
let currentEngine: GameEngine | null = null;
let currentInputState: InputState | null = null;

export function createInputState(): InputState {
  return {
    paddleY: 0.5,
    inputSource: 'mouse',
    keyboardVelocity: 0,
    isPaused: false,
  };
}

export function setupInput(
  canvas: HTMLCanvasElement,
  engine: GameEngine,
  inputState: InputState,
  onPauseToggle: () => void
): InputHandlers {
  // Store engine context for event callbacks
  currentEngine = engine;
  currentInputState = inputState;

  const KEYBOARD_SPEED = 0.025;

  const handlers: InputHandlers = {
    keydown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onPauseToggle();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        inputState.keyboardVelocity = -1;
        inputState.inputSource = 'keyboard';
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        inputState.keyboardVelocity = 1;
        inputState.inputSource = 'keyboard';
      }
    },
    keyup: (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (inputState.keyboardVelocity < 0) inputState.keyboardVelocity = 0;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (inputState.keyboardVelocity > 0) inputState.keyboardVelocity = 0;
      }
    },
    mousemove: (e: MouseEvent) => {
      if (handTrackingActive) return;

      const rect = canvas.getBoundingClientRect();
      const y = (e.clientY - rect.top) / rect.height;
      inputState.paddleY = Math.max(0, Math.min(1, y));
      inputState.inputSource = 'mouse';

      if (!mousePendingUpdate) {
        mousePendingUpdate = true;
        requestAnimationFrame(() => {
          mousePendingUpdate = false;
          if (!handTrackingActive) {
            setPlayerPaddlePosition(engine, inputState.paddleY);
          }
        });
      }
    },
    touchstart: (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const y = (touch.clientY - rect.top) / rect.height;
      inputState.paddleY = Math.max(0, Math.min(1, y));
      inputState.inputSource = 'touch';
      setPlayerPaddlePosition(engine, inputState.paddleY);
    },
    touchmove: (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const y = (touch.clientY - rect.top) / rect.height;
      inputState.paddleY = Math.max(0, Math.min(1, y));
      inputState.inputSource = 'touch';
      setPlayerPaddlePosition(engine, inputState.paddleY);
    },
    gamepadPoll: null,
    handTrackPoll: null,
    handMoveHandler: null,
  };

  document.addEventListener('keydown', handlers.keydown);
  document.addEventListener('keyup', handlers.keyup);
  canvas.addEventListener('mousemove', handlers.mousemove);
  canvas.addEventListener('touchstart', handlers.touchstart, { passive: false });
  canvas.addEventListener('touchmove', handlers.touchmove, { passive: false });

  handlers.gamepadPoll = window.setInterval(() => {
    pollGamepad(engine, inputState);
  }, 16);

  // Event-based hand tracking (preferred)
  const handTrackingSystem = getHandTrackingSystem();

  // Handle hand:move events for paddle position
  handlers.handMoveHandler = (event: HandMoveEvent) => {
    if (!handTrackingEnabled || !currentEngine || !currentInputState) return;

    // Activate hand tracking mode
    if (!handTrackingActive) {
      handTrackingActive = true;
      handGrabStartY = event.rawY;
      paddleGrabStartY = currentInputState.paddleY;
      handSmoothedY = currentInputState.paddleY;
    }

    // Calculate relative movement from grab start, amplified by gain
    const handDeltaY = event.rawY - handGrabStartY;
    const amplifiedDeltaY = handDeltaY * PADDLE_HAND_GAIN;

    // Apply amplified delta to starting paddle position (inverted Y for natural control)
    const targetY = Math.max(0, Math.min(1, paddleGrabStartY - amplifiedDeltaY));

    if (handSmoothedY === null) {
      handSmoothedY = targetY;
    } else {
      handSmoothedY += (targetY - handSmoothedY) * HAND_SMOOTHING;
    }

    currentInputState.paddleY = handSmoothedY;
    currentInputState.inputSource = 'hand';
    setPlayerPaddlePosition(currentEngine, currentInputState.paddleY);
  };

  // Subscribe to hand tracking events
  handTrackingSystem.subscribe('hand:move', handlers.handMoveHandler);

  // Subscribe to zone exit to deactivate hand tracking
  const handleZoneExit = () => {
    handTrackingActive = false;
    handSmoothedY = null;
  };
  handTrackingSystem.subscribe('hand:zone-exit', handleZoneExit);

  // Keep polling as deprecated fallback for backwards compatibility
  handlers.handTrackPoll = window.setInterval(() => {
    // Only poll if event-based tracking isn't active
    if (!handTrackingActive) {
      pollHandTracking(engine, inputState);
    }
  }, 16);

  startKeyboardLoop(engine, inputState, KEYBOARD_SPEED);

  return handlers;
}

export function cleanupInput(canvas: HTMLCanvasElement, handlers: InputHandlers): void {
  document.removeEventListener('keydown', handlers.keydown);
  document.removeEventListener('keyup', handlers.keyup);
  canvas.removeEventListener('mousemove', handlers.mousemove);
  canvas.removeEventListener('touchstart', handlers.touchstart);
  canvas.removeEventListener('touchmove', handlers.touchmove);

  if (handlers.gamepadPoll !== null) {
    clearInterval(handlers.gamepadPoll);
  }
  if (handlers.handTrackPoll !== null) {
    clearInterval(handlers.handTrackPoll);
  }

  // Unsubscribe from hand tracking events
  const handTrackingSystem = getHandTrackingSystem();
  if (handlers.handMoveHandler) {
    handTrackingSystem.unsubscribe('hand:move', handlers.handMoveHandler);
  }

  // Reset module state
  currentEngine = null;
  currentInputState = null;
  handTrackingActive = false;
  handSmoothedY = null;
}

let keyboardLoopId: number | null = null;

function startKeyboardLoop(engine: GameEngine, inputState: InputState, speed: number): void {
  function loop(): void {
    if (inputState.inputSource === 'keyboard') {
      if (inputState.keyboardVelocity !== 0) {
        inputState.paddleY += inputState.keyboardVelocity * speed;
        inputState.paddleY = Math.max(0, Math.min(1, inputState.paddleY));
        setPlayerPaddlePosition(engine, inputState.paddleY);
      }
    }
    keyboardLoopId = requestAnimationFrame(loop);
  }
  loop();
}

export function stopKeyboardLoop(): void {
  if (keyboardLoopId !== null) {
    cancelAnimationFrame(keyboardLoopId);
    keyboardLoopId = null;
  }
}

export function isHandTrackingEnabled(): boolean {
  return handTrackingEnabled;
}

export function setHandTrackingEnabled(enabled: boolean): void {
  handTrackingEnabled = enabled;
  if (!enabled) {
    handTrackingActive = false;
  }
}

function pollGamepad(engine: GameEngine, inputState: InputState): void {
  const gamepads = navigator.getGamepads?.() || [];
  for (const gamepad of gamepads) {
    if (!gamepad) continue;

    const leftStickY = gamepad.axes[1] ?? 0;
    const rightStickY = gamepad.axes[3] ?? 0;

    const threshold = 0.15;
    const activeY = Math.abs(leftStickY) > Math.abs(rightStickY) ? leftStickY : rightStickY;

    if (Math.abs(activeY) > threshold) {
      inputState.paddleY += activeY * 0.03;
      inputState.paddleY = Math.max(0, Math.min(1, inputState.paddleY));
      inputState.inputSource = 'gamepad';
      setPlayerPaddlePosition(engine, inputState.paddleY);
    }

    if (gamepad.buttons[9]?.pressed) {
      if (engine.state === 'playing') {
        pauseEngine(engine);
      } else if (engine.state === 'paused') {
        resumeEngine(engine);
      }
    }
  }
}

/**
 * Polling-based hand tracking.
 * @deprecated Use event-based hand tracking via subscribe('hand:move', callback)
 */
function pollHandTracking(engine: GameEngine, inputState: InputState): void {
  if (!handTrackingEnabled) return;
  if (typeof window.getHandTrackingPosition !== 'function') return;

  const pos = window.getHandTrackingPosition();
  if (!pos || !pos.inZone) {
    handTrackingActive = false;
    handSmoothedY = null;
    return;
  }

  if (!handTrackingActive) {
    handTrackingActive = true;
    handGrabStartY = pos.rawY;
    paddleGrabStartY = inputState.paddleY;
    handSmoothedY = inputState.paddleY;
  }

  const handDeltaY = pos.rawY - handGrabStartY;
  const amplifiedDeltaY = handDeltaY * PADDLE_HAND_GAIN;

  const targetY = Math.max(0, Math.min(1, paddleGrabStartY - amplifiedDeltaY));

  if (handSmoothedY === null) {
    handSmoothedY = targetY;
  } else {
    handSmoothedY += (targetY - handSmoothedY) * HAND_SMOOTHING;
  }

  inputState.paddleY = handSmoothedY;
  inputState.inputSource = 'hand';
  setPlayerPaddlePosition(engine, inputState.paddleY);
}

declare global {
  interface Window {
    getHandTrackingPosition?: () => {
      x: number;
      y: number;
      rawX: number;
      rawY: number;
      inZone: boolean;
      hoverTarget: string | null;
      isGrabbing: boolean;
      velocity: { x: number; y: number };
      acceleration: { x: number; y: number };
      speed: number;
      direction: number;
    } | null;
    setDotMatrixHandTracking?: (enabled: boolean) => Promise<boolean>;
    getDotMatrixHandTracking?: () => boolean;
  }
}
