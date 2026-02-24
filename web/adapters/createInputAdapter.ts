/**
 * Input Adapter Factory
 *
 * Creates typed adapters for standardized intent emission from various input sources.
 * Provides a consistent interface for voice, hand-tracking, keyboard, gamepad, and gesture inputs.
 *
 * @example
 * ```ts
 * // Create an adapter for hand tracking
 * const adapter = createInputAdapter('hand-tracking');
 *
 * // Emit a grab intent at a position
 * adapter.grab({ x: 100, y: 200 }, 'inputBar');
 *
 * // Or use the generic emit for custom actions
 * adapter.emit('custom-action', { position: { x: 50, y: 50 }, value: { speed: 2 } });
 * ```
 */

import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

// --- Type definitions ---

/** Position in screen coordinates */
interface Position {
  x: number;
  y: number;
}

/** Movement delta for move actions */
interface MoveDelta {
  dx: number;
  dy: number;
}

/** Common actions supported across input types */
type CommonAction = 'grab' | 'release' | 'move' | 'tap' | 'press' | 'toggle' | 'focus' | 'submit';

/** Configuration for creating an input adapter */
interface AdapterConfig {
  /** Unique identifier for this input source (e.g., 'hand-tracking', 'voice') */
  source: string;
  /** Default target ID to use when none is specified */
  defaultTarget?: string;
}

/** Options for emitting an intent */
interface EmitOptions {
  /** Target component ID to send the intent to */
  target?: string;
  /** Screen position for spatial intents */
  position?: Position;
  /** Additional payload data */
  value?: unknown;
}

/** Result from emitting an intent, or null if coordinator not ready */
interface EmitResult {
  intent: {
    source: string;
    action: string;
    target?: string;
    position?: Position;
    value?: unknown;
    timestamp: number;
    resolvedTarget?: string | null;
  };
  target: {
    id: string;
    handler: (intent: unknown) => void;
  } | null;
}

/**
 * Input adapter interface providing typed intent emission.
 * Each adapter is bound to a specific input source.
 */
interface InputAdapter {
  /** The source identifier for this adapter */
  readonly source: string;

  /**
   * Emit a custom intent action.
   * @param action - The action name (e.g., 'grab', 'release', 'custom-action')
   * @param options - Optional target, position, and value
   * @returns The emit result, or null if coordinator is not available
   */
  emit: (action: string, options?: EmitOptions) => EmitResult | null;

  /**
   * Emit a grab intent at the specified position.
   * @param position - Screen coordinates where the grab occurred
   * @param target - Optional explicit target ID
   */
  grab: (position: Position, target?: string) => EmitResult | null;

  /**
   * Emit a release intent at the specified position.
   * @param position - Screen coordinates where the release occurred
   */
  release: (position: Position) => EmitResult | null;

  /**
   * Emit a move intent with position and optional delta.
   * @param position - Current screen coordinates
   * @param delta - Optional movement delta from previous position
   */
  move: (position: Position, delta?: MoveDelta) => EmitResult | null;

  /**
   * Emit a tap intent at the specified position.
   * @param position - Screen coordinates where the tap occurred
   */
  tap: (position: Position) => EmitResult | null;

  /**
   * Emit a press intent (for keyboard/button presses).
   * @param value - The key or button identifier
   * @param target - Optional explicit target ID
   */
  press: (value: string | number, target?: string) => EmitResult | null;

  /**
   * Emit a toggle intent.
   * @param target - The target to toggle
   * @param value - Optional toggle state (true/false) or leave undefined to flip
   */
  toggle: (target: string, value?: boolean) => EmitResult | null;

  /**
   * Emit a focus intent to a target.
   * @param target - The target to focus
   */
  focus: (target: string) => EmitResult | null;

  /**
   * Emit a submit intent.
   * @param target - The target receiving the submit
   * @param value - Optional submission payload
   */
  submit: (target: string, value?: unknown) => EmitResult | null;
}

// --- Factory function ---

/**
 * Creates a typed input adapter for a specific input source.
 *
 * The adapter provides convenience methods for common actions (grab, release, move, tap)
 * as well as a generic `emit` method for custom actions.
 *
 * @param config - Either a source string or full configuration object
 * @returns An InputAdapter instance bound to the specified source
 *
 * @example
 * ```ts
 * // Simple usage with just source name
 * const adapter = createInputAdapter('hand-tracking');
 *
 * // With default target
 * const voiceAdapter = createInputAdapter({
 *   source: 'voice',
 *   defaultTarget: 'inputBar'
 * });
 * ```
 */
export function createInputAdapter(config: AdapterConfig | string): InputAdapter {
  const { source, defaultTarget } =
    typeof config === 'string' ? { source: config, defaultTarget: undefined } : config;

  /**
   * Internal emit function that safely accesses the coordinator.
   * Returns null if the coordinator is not available.
   */
  function emitIntent(action: string, options: EmitOptions = {}): EmitResult | null {
    try {
      const { emit } = useIntentCoordinator();

      const result = emit({
        source,
        action,
        target: options.target ?? defaultTarget,
        position: options.position,
        value: options.value,
      });

      return result as EmitResult;
    } catch (error) {
      // Coordinator not ready or other error - fail gracefully
      if (import.meta.env.DEV) {
        console.warn(`[InputAdapter:${source}] Failed to emit ${action}:`, error);
      }
      return null;
    }
  }

  return {
    source,
    emit: emitIntent,
    grab: (position, target) => emitIntent('grab', { position, target }),
    release: (position) => emitIntent('release', { position }),
    move: (position, delta) => emitIntent('move', { position, value: delta }),
    tap: (position) => emitIntent('tap', { position }),
    press: (value, target) => emitIntent('press', { value, target }),
    toggle: (target, value) => emitIntent('toggle', { target, value }),
    focus: (target) => emitIntent('focus', { target }),
    submit: (target, value) => emitIntent('submit', { target, value }),
  };
}

// --- Pre-configured adapter factories ---

/**
 * Creates an adapter for hand-tracking input.
 * Use for WebXR hand tracking or webcam-based hand detection.
 */
export const handTrackingAdapter = (): InputAdapter => createInputAdapter('hand-tracking');

/**
 * Creates an adapter for voice input.
 * Use for speech recognition commands.
 */
export const voiceAdapter = (): InputAdapter => createInputAdapter('voice');

/**
 * Creates an adapter for gamepad input.
 * Use for game controller interactions.
 */
export const gamepadAdapter = (): InputAdapter => createInputAdapter('gamepad');

/**
 * Creates an adapter for gesture input.
 * Use for touch gestures (swipe, pinch, etc.).
 */
export const gestureAdapter = (): InputAdapter => createInputAdapter('gesture');

/**
 * Creates an adapter for keyboard input.
 * Use for keyboard shortcuts and text input.
 */
export const keyboardAdapter = (): InputAdapter => createInputAdapter('keyboard');

// --- Type exports ---

export type {
  InputAdapter,
  AdapterConfig,
  EmitOptions,
  EmitResult,
  Position,
  MoveDelta,
  CommonAction,
};
