import type { InputState } from './types';
import type { GameEngine } from './engine';
import { setPaddlePosition, movePaddleByDelta, pauseEngine, resumeEngine } from './engine';

export interface InputHandlers {
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  mousemove: (e: MouseEvent) => void;
  touchmove: (e: TouchEvent) => void;
  touchstart: (e: TouchEvent) => void;
  gamepadPoll: number | null;
  handTrackPoll: number | null;
}

const GAMEPAD_DEADZONE = 0.15;
const GAMEPAD_SENSITIVITY = 12;
const PADDLE_HAND_GAIN = 3.5;
const PADDLE_HAND_SMOOTHING = 0.35;

let handTrackingEnabled = true;
let isPinchingPaddle = false;
let handGrabStartX = 0;
let paddleGrabStartX = 0;
let handPaddleX: number | null = null;
let gamepadPauseHeld = false;

export function createInputState(canvasWidth: number): InputState {
  return {
    paddleX: canvasWidth / 2,
    inputSource: 'mouse',
    leftPressed: false,
    rightPressed: false,
    targetPaddleX: canvasWidth / 2,
  };
}

export function setupInput(
  canvas: HTMLCanvasElement,
  engine: GameEngine,
  inputState: InputState,
  onPauseToggle: () => void
): InputHandlers {
  const handlers: InputHandlers = {
    keydown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onPauseToggle();
        return;
      }

      if (e.key === 'Right' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        inputState.rightPressed = true;
        inputState.inputSource = 'keyboard';
      } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        inputState.leftPressed = true;
        inputState.inputSource = 'keyboard';
      }
    },
    keyup: (e: KeyboardEvent) => {
      if (e.key === 'Right' || e.key === 'ArrowRight') {
        inputState.rightPressed = false;
      } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
        inputState.leftPressed = false;
      }
    },
    mousemove: (e: MouseEvent) => {
      if (isPinchingPaddle) return;

      const rect = canvas.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      if (relativeX > 0 && relativeX < canvas.width) {
        inputState.paddleX = relativeX - engine.paddle.width / 2;
        inputState.inputSource = 'mouse';
        setPaddlePosition(engine, inputState.paddleX);
      }
    },
    touchstart: (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const relativeX = touch.clientX - rect.left;

      if (relativeX > 0 && relativeX < canvas.width) {
        inputState.paddleX = relativeX - engine.paddle.width / 2;
        inputState.inputSource = 'touch';
        setPaddlePosition(engine, inputState.paddleX);
      }
    },
    touchmove: (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const relativeX = touch.clientX - rect.left;

      if (relativeX > 0 && relativeX < canvas.width) {
        inputState.paddleX = relativeX - engine.paddle.width / 2;
        inputState.inputSource = 'touch';
        setPaddlePosition(engine, inputState.paddleX);
      }
    },
    gamepadPoll: null,
    handTrackPoll: null,
  };

  document.addEventListener('keydown', handlers.keydown);
  document.addEventListener('keyup', handlers.keyup);
  canvas.addEventListener('mousemove', handlers.mousemove);
  canvas.addEventListener('touchstart', handlers.touchstart, { passive: false });
  canvas.addEventListener('touchmove', handlers.touchmove, { passive: false });

  handlers.gamepadPoll = window.setInterval(() => {
    pollGamepad(engine, inputState);
  }, 16);

  handlers.handTrackPoll = window.setInterval(() => {
    pollHandTracking(engine, inputState);
  }, 16);

  startKeyboardLoop(engine, inputState);

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

  isPinchingPaddle = false;
  handPaddleX = null;
}

let keyboardLoopId: number | null = null;

function startKeyboardLoop(engine: GameEngine, inputState: InputState): void {
  const FIXED_TIMESTEP = 1000 / 60;

  function loop(): void {
    if (inputState.inputSource === 'keyboard') {
      if (inputState.rightPressed && !inputState.leftPressed) {
        movePaddleByDelta(engine, 1, FIXED_TIMESTEP);
      } else if (inputState.leftPressed && !inputState.rightPressed) {
        movePaddleByDelta(engine, -1, FIXED_TIMESTEP);
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
    isPinchingPaddle = false;
    handPaddleX = null;
  }
}

function pollGamepad(engine: GameEngine, inputState: InputState): void {
  const gamepads = navigator.getGamepads?.() || [];
  for (const gamepad of gamepads) {
    if (!gamepad) continue;

    // Pause toggle via Start button - handle before movement check
    if (gamepad.buttons[9]?.pressed) {
      if (!gamepadPauseHeld) {
        gamepadPauseHeld = true;
        if (engine.state === 'playing') {
          pauseEngine(engine);
        } else if (engine.state === 'paused') {
          resumeEngine(engine);
        }
      }
    } else {
      gamepadPauseHeld = false;
    }

    // Skip movement input when paused
    if (engine.state === 'paused') continue;

    const leftStickX = gamepad.axes[0] ?? 0;
    const rightStickX = gamepad.axes[2] ?? 0;

    const activeX = Math.abs(leftStickX) > Math.abs(rightStickX) ? leftStickX : rightStickX;

    if (Math.abs(activeX) > GAMEPAD_DEADZONE) {
      inputState.targetPaddleX = engine.paddle.x + activeX * GAMEPAD_SENSITIVITY;
      inputState.targetPaddleX = Math.max(
        0,
        Math.min(inputState.targetPaddleX, engine.canvas.width - engine.paddle.width)
      );
      inputState.inputSource = 'gamepad';
      setPaddlePosition(engine, inputState.targetPaddleX);
    }
  }
}

function pollHandTracking(engine: GameEngine, inputState: InputState): void {
  if (!handTrackingEnabled) return;
  if (engine.state === 'paused') return;
  if (typeof window.getHandTrackingPosition !== 'function') return;

  const pos = window.getHandTrackingPosition();
  if (!pos) return;

  if (!pos.isGrabbing) {
    if (isPinchingPaddle) {
      isPinchingPaddle = false;
      inputState.targetPaddleX = engine.paddle.x;
    }
    return;
  }

  const dtScale = 1;

  if (!isPinchingPaddle) {
    isPinchingPaddle = true;
    handGrabStartX = pos.rawX;
    paddleGrabStartX = engine.paddle.x;
    handPaddleX = engine.paddle.x;
  }

  const handDelta = pos.rawX - handGrabStartX;
  const amplifiedDelta = handDelta * PADDLE_HAND_GAIN * engine.canvas.width;
  const targetX = paddleGrabStartX + amplifiedDelta;
  const clampedTarget = Math.max(0, Math.min(targetX, engine.canvas.width - engine.paddle.width));

  if (handPaddleX === null) handPaddleX = engine.paddle.x;

  handPaddleX += (clampedTarget - handPaddleX) * PADDLE_HAND_SMOOTHING * dtScale;
  inputState.paddleX = handPaddleX;
  inputState.inputSource = 'hand';
  setPaddlePosition(engine, handPaddleX);
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
