// dotmatrix/handtrack.ts
// Camera-based hand tracking for dotmatrix animation
// Uses MediaPipe Hand Landmarker (official Google solution)

import type { Landmark } from './core';
import { useEventBus } from '@web/services/eventBus';
import { prefersReducedMotion } from '@web/composables/useMotion';
import { INTENT_THRESHOLDS } from '@web/composables/useMagneticConfig';
import { handTrackingAdapter } from '@web/adapters/createInputAdapter';
import { debugLog, debugWarn, logError } from '@web/utils/debugLog.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** CDN URL for MediaPipe Vision bundle. Pinned to 0.10.8 for API stability. */
const MEDIAPIPE_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs';

/** Pre-trained hand landmark model. Float16 variant balances accuracy and size (~10MB). */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ---------------------------------------------------------------------------
// Smoothing Factors (0-1)
// Lower values = smoother but laggier. Higher = responsive but jittery.
// All tuned for 60fps; scale proportionally for other frame rates.
// ---------------------------------------------------------------------------

/**
 * Position smoothing factor (0-1).
 * 0.08 balances responsiveness with jitter reduction for palm center tracking.
 * Lower values (0.03-0.05) feel sluggish; higher (0.15+) pass through camera noise.
 */
const POSITION_SMOOTHING = 0.08;

/**
 * Depth smoothing factor (0-1).
 * More aggressive than position (0.06) because depth inference from 2D landmarks
 * is inherently noisier. Prevents z-fighting in particle effects.
 */
const DEPTH_SMOOTHING = 0.06;

/**
 * Rotation smoothing factor (0-1).
 * Matches position smoothing at 0.08 for consistent feel.
 * Used when transitioning rotation state (e.g., fist mode entry/exit).
 */
const ROTATION_SMOOTHING = 0.08;

// ---------------------------------------------------------------------------
// Position Mapping
// Maps normalized camera coordinates (0-1) to application space (-0.9 to 1.9).
//
// Reference values (tuned through experimentation):
// - CAMERA_RANGE: 0.001 to 0.999 (avoid edge artifacts from MediaPipe)
// - GAIN: 1.25 (allows reaching screen edges without extreme hand positions)
// - CENTER: (0.5, 0.5) normalized frame center
// - HAND_REST_Y_OFFSET: 0.65 (compensates for webcam position above screen)
// - POSITION_BOUNDS: -0.9 to 1.9 (matches tracking zone for smooth edges)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tracking Zones
// Define valid ranges for hand position. Extended beyond 0-1 to allow
// smooth edge behavior and partial off-screen tracking.
// ---------------------------------------------------------------------------

/**
 * Minimum tracking zone boundary (normalized).
 * -0.9 allows hand to partially leave frame before losing tracking,
 * providing smoother edge transitions.
 */
const TRACKING_ZONE_MIN = -0.9;

/**
 * Maximum tracking zone boundary (normalized).
 * 1.9 provides symmetric overflow allowance as minimum.
 */
const TRACKING_ZONE_MAX = 1.9;

/**
 * Per-target grace distance overrides (pixels).
 * Values imported from useMagneticConfig.ts for unified configuration.
 * Elements at screen edges or with smaller hit areas need larger grace distances.
 */
const GRAB_HIT_GRACE_OVERRIDES: Record<string, number> = {
  inputBar: INTENT_THRESHOLDS.grabHitInputBar,
  timeWidget: INTENT_THRESHOLDS.grabHitTimeWidget,
  notesWidget: INTENT_THRESHOLDS.grabHitNotesWidget,
};

// ---------------------------------------------------------------------------
// Pinch Detection
// Thresholds are palm-width-normalized distances between thumb and index tips.
// ---------------------------------------------------------------------------

/**
 * Pinch closed threshold (palm-width ratio).
 * When thumb-index distance < 0.2 * palm width, pinch is considered closed.
 * Derived empirically: typical relaxed hand has ~0.5 ratio, tight pinch ~0.1.
 */
const PINCH_THRESHOLD_CLOSE = 0.2;

/**
 * Pinch open threshold (palm-width ratio).
 * When thumb-index distance > 0.8 * palm width, pinch is fully open.
 * Used for normalizing pinch state to 0-1 range.
 */
const PINCH_THRESHOLD_OPEN = 0.8;

// ---------------------------------------------------------------------------
// Fist Detection
// Used for mic toggle gesture (closed fist = push-to-talk).
// ---------------------------------------------------------------------------

/**
 * Fist curl threshold (fingertip-to-wrist / MCP-to-wrist ratio).
 * When fingertip is closer to wrist than 85% of MCP distance, finger is curled.
 * All 4 fingers must be curled to detect fist. 0.85 prevents false positives
 * from relaxed hands while still detecting loose fists.
 */
const FIST_CURL_THRESHOLD = 0.85;

/**
 * Frames required for stable hand count change.
 * 10 frames (~167ms at 60fps) debounces hand entry/exit to prevent
 * flickering when hand is at detection boundary.
 */
const HAND_TRANSITION_FRAMES = 10;

// ---------------------------------------------------------------------------
// Fist Mic Control
// ---------------------------------------------------------------------------

/**
 * Fist-to-mic activation debounce (milliseconds).
 * 150ms requires intentional fist hold before activating mic,
 * preventing accidental triggers during normal hand movement.
 */
const FIST_MIC_DEBOUNCE = 150;

// ---------------------------------------------------------------------------
// Poke Gesture
// Index finger extended, other fingers curled - triggers ripple effect.
// ---------------------------------------------------------------------------

/**
 * Poke curl threshold for non-index fingers (ratio).
 * Same as fist threshold (0.85) - middle/ring/pinky must be curled.
 */
const POKE_CURL_THRESHOLD = 0.85;

/**
 * Poke extension threshold for index finger (ratio).
 * Index tip must be 1.3x farther from wrist than index MCP.
 * Higher than 1.0 ensures finger is clearly extended, not just relaxed.
 */
const POKE_EXTEND_THRESHOLD = 1.3;

/**
 * Cooldown between poke gestures (milliseconds).
 * 400ms prevents rapid-fire ripple spawning from sustained poke pose.
 */
const POKE_COOLDOWN = 400;

// ---------------------------------------------------------------------------
// Pinch Grab
// ---------------------------------------------------------------------------

/**
 * Pinch grab activation threshold (normalized 0-1).
 * When normalized pinch value < 0.35, grab is initiated.
 * Lower than release threshold to create hysteresis band.
 */
const PINCH_GRAB_THRESHOLD = 0.35;

/**
 * Pinch release threshold (normalized 0-1).
 * When normalized pinch value > 0.55, grab is released.
 * Higher than grab threshold to prevent flickering at boundary.
 */
const PINCH_RELEASE_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** localStorage key for persisting tracking button visibility preference. */
const LS_BUTTON_KEY = 'dotMatrixTrackingButtonEnabled';

// ============================================================================
// GESTURE DETECTION THRESHOLDS
// Motion-based gesture detection (swipe, flick, punch).
// ============================================================================

/**
 * Number of position samples to retain for velocity calculation.
 * 5 frames provides ~83ms history at 60fps - enough for gesture detection
 * without excessive memory or stale data.
 */
const POSITION_HISTORY_SIZE = 5;

/**
 * Velocity smoothing factor (0-1).
 * 0.3 is less aggressive than position smoothing because gesture detection
 * needs to capture quick movements while still filtering noise.
 */
const VELOCITY_SMOOTHING = 0.3;

/**
 * Minimum speed for swipe gesture (normalized units per frame).
 * 0.015 filters out slow hand drift while detecting intentional swipes.
 */
const SWIPE_MIN_SPEED = 0.015;

/**
 * Minimum swipe duration (milliseconds).
 * 80ms prevents accidental micro-swipes from being recognized.
 */
const SWIPE_MIN_DURATION = 80;

/**
 * Maximum swipe duration (milliseconds).
 * 400ms ensures swipes are quick, deliberate motions.
 */
const SWIPE_MAX_DURATION = 400;

/**
 * Minimum acceleration for flick gesture (normalized units per frame squared).
 * 0.002 detects the sharp acceleration at start of a flick.
 */
const FLICK_MIN_ACCELERATION = 0.002;

/**
 * Maximum flick duration (milliseconds).
 * 150ms - flicks are faster than swipes, requiring quick snap motion.
 */
const FLICK_MAX_DURATION = 150;

/**
 * Forward movement threshold for punch gesture (normalized Z units).
 * 0.05 detects significant forward hand movement in camera space.
 */
const PUNCH_Z_THRESHOLD = 0.05;

/**
 * Cooldown between gesture recognitions (milliseconds).
 * 100ms prevents double-triggering from sustained gesture poses.
 */
const GESTURE_COOLDOWN = 100;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface GrabbableTarget {
  id: string;
  selector: string;
}

interface Point2D {
  x: number;
  y: number;
}

interface PositionHistoryEntry {
  x: number;
  y: number;
  z: number;
  time: number;
}

// ============================================================================
// GESTURE & EVENT TYPES (EXPORTED)
// ============================================================================

/** Gesture types detected by the hand tracking system */
export type GestureType = 'swipe' | 'flick' | 'punch' | 'circle';

/** Hand gesture with velocity, acceleration, and directional info */
export interface HandGesture {
  type: GestureType;
  velocity: Point2D;
  acceleration: Point2D;
  angle: number; // Direction in radians
  magnitude: number; // Speed magnitude
  duration: number; // ms
}

/** Event types emitted by the hand tracking system */
export type HandTrackingEventType =
  | 'hand:move'
  | 'hand:zone-enter'
  | 'hand:zone-exit'
  | 'hand:grab-start'
  | 'hand:grab-end'
  | 'hand:gesture';

/** Event payloads for each event type */
export interface HandMoveEvent {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  velocity: Point2D;
  acceleration: Point2D;
  speed: number;
  direction: number;
}

export interface HandZoneEvent {
  x: number;
  y: number;
}

export interface HandGrabEvent {
  x: number;
  y: number;
  target: string | null;
  /** Velocity at release (for momentum animation) - pixels per 16.67ms frame */
  velocity?: Point2D;
}

export interface HandGestureEvent {
  gesture: HandGesture;
  position: Point2D;
}

/** Union of all event payloads */
export type HandTrackingEventPayload =
  | HandMoveEvent
  | HandZoneEvent
  | HandGrabEvent
  | HandGestureEvent;

/** Event callback function type */
export type HandTrackingEventCallback<T = HandTrackingEventPayload> = (payload: T) => void;

/** Extended hand tracking position with velocity data */
export interface HandTrackingPosition {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  inZone: boolean;
  hoverTarget: string | null;
  isGrabbing: boolean;
  velocity: Point2D;
  acceleration: Point2D;
  speed: number;
  direction: number;
}

// MediaPipe Vision types (CDN-loaded module)
interface HandLandmarkerResult {
  landmarks: Landmark[][];
  worldLandmarks?: Landmark[][];
  handednesses?: Array<Array<{ categoryName: string; score: number }>>;
}

interface HandLandmarkerClass {
  detectForVideo(video: HTMLVideoElement, timestamp: number): HandLandmarkerResult;
  close(): void;
}

/** Opaque handle returned by FilesetResolver */
interface WasmFileset {
  readonly wasmLoaderPath: string;
  readonly wasmBinaryPath: string;
}

interface FilesetResolverClass {
  forVisionTasks(wasmPath: string): Promise<WasmFileset>;
}

interface HandLandmarkerOptions {
  baseOptions: {
    modelAssetPath: string;
    delegate: 'GPU' | 'CPU';
  };
  runningMode: 'VIDEO' | 'IMAGE';
  numHands: number;
}

interface VisionModule {
  HandLandmarker: {
    createFromOptions(
      wasmFileset: WasmFileset,
      options: HandLandmarkerOptions
    ): Promise<HandLandmarkerClass>;
  };
  FilesetResolver: FilesetResolverClass;
}

// Frame coordinator types
interface FrameCoordinator {
  subscribe(id: string, callback: () => void, priority: number): void;
  unsubscribe(id: string): void;
}

interface FramePriorityEnum {
  TRACKING: number;
}

// Window extension for dotmatrix globals
interface DotMatrixWindow {
  // Vision module (loaded from CDN)
  vision?: VisionModule;

  // Notification system
  appendNotifs?: (type: string, message: string) => void;

  // Frame coordination
  frameCoordinator?: FrameCoordinator;
  FramePriority?: FramePriorityEnum;

  // Game state
  isGameActive?: boolean;

  // DotMatrix state accessors
  getDotMatrixFocusPosition?: () => Point2D | null;
  getDotMatrixDepth?: () => number;
  getDotMatrixRotation?: () => number;

  // DotMatrix state setters
  setDotMatrixCursorActive?: (active: boolean) => void;
  setDotMatrixHeadPosition?: (x: number, y: number) => void;
  setDotMatrixDepth?: (depth: number) => void;
  setDotMatrixRotation?: (rotation: number) => void;
  setDotMatrixHandLandmarks?: (landmarks: Landmark[] | null) => void;

  // DotMatrix callbacks
  onDotMatrixHandLost?: () => void;
  onDotMatrixHandPresent?: () => void;

  // Ripple effect
  spawnDotMatrixRipple?: (x: number, y: number) => void;

  // Voice input controls
  startVoiceInput?: () => void;
  stopVoiceInput?: () => void;
  toggleVoiceInput?: () => void;

  // Hand tracking API (set by initHandTrackingGlobals)
  setDotMatrixHandTracking?: (enabled: boolean) => Promise<boolean>;
  getDotMatrixHandTracking?: () => boolean;
  setDotMatrixTrackingButtonVisible?: (visible: boolean) => void;
  getDotMatrixTrackingButtonVisible?: () => boolean;
  toggleDotMatrixHandTracking?: () => Promise<void>;
  getHandTrackingPosition?: () => HandTrackingPosition;
}

/** Typed accessor for window with dotmatrix extensions */
const dmWindow = window as unknown as Window & DotMatrixWindow;

// ============================================================================
// HAND TRACKING SYSTEM
// ============================================================================

export class HandTrackingSystem {
  private isEnabled = false;
  private isInitialized = false;
  private isLoading = false;
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  private handLandmarker: HandLandmarkerClass | null = null;
  private animationFrameId: number | null = null;

  // Smoothed values
  private smoothedPosition: Point2D = { x: 0.5, y: 0.5 };
  private smoothedDepth = 0.5;
  private smoothedRotation = 0;

  // Raw tracking state
  private isInTrackingZone = true;
  private lastRawPinchDistance = 0.12;
  private rawCameraPosition: Point2D = { x: 0.5, y: 0.5 };

  // Fist rotation state
  private isInFistMode = false;
  private baseRotation = 0;
  private handCountStableFrames = 0;
  private lastHandCount = 0;

  // Fist mic state
  private isMicActiveViaFist = false;
  private fistMicDebounceTime = 0;

  // Pinch-to-grab state
  private isGrabbing = false;
  private physicsSnapHandler: (() => void) | null = null;
  private grabStartX = 0;
  private grabStartY = 0;
  private grabTarget: string | null = null;
  private hoverTarget: string | null = null;

  // Poke gesture state
  private lastPokeTime = 0;
  private wasPoking = false;

  // Grab cooldown state
  private lastGrabEndTime = 0;
  private static readonly GRAB_COOLDOWN_MS = 120;

  // Frame tracking
  private lastVideoTime = -1;
  private frameCount = 0;

  // ============================================================================
  // EVENT EMITTER STATE
  // ============================================================================

  private eventListeners: Map<HandTrackingEventType, Set<HandTrackingEventCallback>> = new Map();

  // ============================================================================
  // VELOCITY & ACCELERATION TRACKING
  // ============================================================================

  private positionHistory: PositionHistoryEntry[] = [];
  private velocity: Point2D = { x: 0, y: 0 };
  private smoothedVelocity: Point2D = { x: 0, y: 0 };
  private acceleration: Point2D = { x: 0, y: 0 };
  private speed = 0;
  private direction = 0;
  private lastVelocityTime = 0;

  // ============================================================================
  // GESTURE DETECTION STATE
  // ============================================================================

  private lastGestureTime = 0;
  private gestureStartTime = 0;
  private gestureStartPosition: Point2D | null = null;
  private isInGestureMotion = false;
  private gestureVelocityHistory: Point2D[] = [];

  private readonly GRABBABLE_TARGETS: GrabbableTarget[] = [
    { id: 'timeWidget', selector: '#weather-time-widget' },
    { id: 'inputBar', selector: '#bar' },
    { id: 'notesWidget', selector: '#floating-notes-widget' },
  ];

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private notify(type: string, message: string): void {
    dmWindow.appendNotifs?.(type, message);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private lerp(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

  /** Returns static grabbable targets plus any currently open app windows. */
  private get allGrabbableTargets(): GrabbableTarget[] {
    const appWindows = document.querySelectorAll('.app-window:not(.app-window--mobile)');
    const windowTargets = Array.from(appWindows)
      .filter((el) => el.id)
      .map((el) => ({ id: el.id, selector: `#${el.id}` }));
    return [...this.GRABBABLE_TARGETS, ...windowTargets];
  }

  // ============================================================================
  // EVENT EMITTER METHODS
  // ============================================================================

  /**
   * Subscribe to a hand tracking event.
   * @param event - The event type to subscribe to
   * @param callback - The callback function to invoke when the event fires
   */
  public subscribe<T extends HandTrackingEventPayload>(
    event: HandTrackingEventType,
    callback: HandTrackingEventCallback<T>
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as HandTrackingEventCallback);
  }

  /**
   * Unsubscribe from a hand tracking event.
   * @param event - The event type to unsubscribe from
   * @param callback - The callback function to remove
   */
  public unsubscribe<T extends HandTrackingEventPayload>(
    event: HandTrackingEventType,
    callback: HandTrackingEventCallback<T>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback as HandTrackingEventCallback);
    }
  }

  /**
   * Emit an event to all subscribed listeners.
   */
  private emit(event: HandTrackingEventType, payload: HandTrackingEventPayload): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(payload);
        } catch (err) {
          debugWarn(
            'handtrack',
            'emit:callback-error',
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    }
  }

  // ============================================================================
  // VELOCITY & ACCELERATION CALCULATION
  // ============================================================================

  /**
   * Update position history and calculate velocity/acceleration.
   * Called every frame with the current smoothed position.
   */
  private updateVelocityTracking(x: number, y: number, z: number): void {
    const now = performance.now();

    // Add to position history
    this.positionHistory.push({ x, y, z, time: now });
    if (this.positionHistory.length > POSITION_HISTORY_SIZE) {
      this.positionHistory.shift();
    }

    // Need at least 2 points to calculate velocity
    if (this.positionHistory.length < 2) {
      return;
    }

    const current = this.positionHistory[this.positionHistory.length - 1];
    const prev = this.positionHistory[this.positionHistory.length - 2];
    if (!current || !prev) return;
    const dt = (current.time - prev.time) / 1000; // Convert to seconds

    if (dt <= 0) return;

    // Calculate instantaneous velocity
    const newVelocity: Point2D = {
      x: (current.x - prev.x) / dt,
      y: (current.y - prev.y) / dt,
    };

    // Smooth velocity using rolling average
    this.smoothedVelocity.x = this.lerp(this.smoothedVelocity.x, newVelocity.x, VELOCITY_SMOOTHING);
    this.smoothedVelocity.y = this.lerp(this.smoothedVelocity.y, newVelocity.y, VELOCITY_SMOOTHING);

    // Store previous velocity for acceleration calculation
    const prevVelocity = { ...this.velocity };
    this.velocity = { ...newVelocity };

    // Calculate acceleration from velocity delta
    if (this.lastVelocityTime > 0) {
      const velDt = (now - this.lastVelocityTime) / 1000;
      if (velDt > 0) {
        this.acceleration = {
          x: (this.velocity.x - prevVelocity.x) / velDt,
          y: (this.velocity.y - prevVelocity.y) / velDt,
        };
      }
    }
    this.lastVelocityTime = now;

    // Calculate speed (magnitude) and direction (angle)
    this.speed = Math.sqrt(
      this.smoothedVelocity.x * this.smoothedVelocity.x +
        this.smoothedVelocity.y * this.smoothedVelocity.y
    );
    this.direction = Math.atan2(this.smoothedVelocity.y, this.smoothedVelocity.x);
  }

  // ============================================================================
  // GESTURE DETECTION
  // ============================================================================

  /**
   * Detect swipe gesture - sustained directional movement.
   */
  private detectSwipe(): HandGesture | null {
    if (this.positionHistory.length < 3) return null;

    const now = performance.now();
    const current = this.positionHistory[this.positionHistory.length - 1];
    if (!current) return null;

    // Check if we're moving fast enough to be a swipe
    if (this.speed >= SWIPE_MIN_SPEED) {
      if (!this.isInGestureMotion) {
        // Start tracking gesture
        this.isInGestureMotion = true;
        this.gestureStartTime = now;
        this.gestureStartPosition = { x: current.x, y: current.y };
        this.gestureVelocityHistory = [];
      }
      this.gestureVelocityHistory.push({ ...this.smoothedVelocity });
    } else if (this.isInGestureMotion) {
      // Gesture ended - check if it qualifies as a swipe
      const duration = now - this.gestureStartTime;

      if (
        duration >= SWIPE_MIN_DURATION &&
        duration <= SWIPE_MAX_DURATION &&
        this.gestureStartPosition
      ) {
        const distance = Math.sqrt(
          Math.pow(current.x - this.gestureStartPosition.x, 2) +
            Math.pow(current.y - this.gestureStartPosition.y, 2)
        );

        // Must have traveled a minimum distance
        if (distance > 0.05) {
          this.isInGestureMotion = false;
          this.gestureStartPosition = null;

          // Average velocity during the swipe
          const avgVelocity = this.gestureVelocityHistory.reduce(
            (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
            { x: 0, y: 0 }
          );
          const count = this.gestureVelocityHistory.length || 1;
          avgVelocity.x /= count;
          avgVelocity.y /= count;

          return {
            type: 'swipe',
            velocity: avgVelocity,
            acceleration: { ...this.acceleration },
            angle: Math.atan2(avgVelocity.y, avgVelocity.x),
            magnitude: Math.sqrt(avgVelocity.x * avgVelocity.x + avgVelocity.y * avgVelocity.y),
            duration,
          };
        }
      }

      this.isInGestureMotion = false;
      this.gestureStartPosition = null;
    }

    return null;
  }

  /**
   * Detect flick gesture - quick snap movement with high acceleration.
   */
  private detectFlick(): HandGesture | null {
    if (this.positionHistory.length < 3) return null;

    const accelerationMag = Math.sqrt(
      this.acceleration.x * this.acceleration.x + this.acceleration.y * this.acceleration.y
    );

    // High acceleration indicates a flick
    if (accelerationMag >= FLICK_MIN_ACCELERATION && this.speed >= SWIPE_MIN_SPEED) {
      const now = performance.now();
      const duration = this.gestureStartTime > 0 ? now - this.gestureStartTime : FLICK_MAX_DURATION;

      if (duration <= FLICK_MAX_DURATION) {
        return {
          type: 'flick',
          velocity: { ...this.smoothedVelocity },
          acceleration: { ...this.acceleration },
          angle: this.direction,
          magnitude: this.speed,
          duration,
        };
      }
    }

    return null;
  }

  /**
   * Detect punch gesture - forward thrust using z-axis movement.
   */
  private detectPunch(): HandGesture | null {
    if (this.positionHistory.length < 3) return null;

    const current = this.positionHistory[this.positionHistory.length - 1];
    const first = this.positionHistory[0];
    if (!current || !first) return null;
    const zDelta = first.z - current.z; // Positive = moving toward camera (punching)

    if (zDelta >= PUNCH_Z_THRESHOLD) {
      const duration = current.time - first.time;

      return {
        type: 'punch',
        velocity: { ...this.smoothedVelocity },
        acceleration: { ...this.acceleration },
        angle: this.direction,
        magnitude: zDelta,
        duration,
      };
    }

    return null;
  }

  /**
   * Run all gesture detectors and emit events for detected gestures.
   */
  private checkGestures(): void {
    const now = performance.now();

    // Enforce cooldown between gestures
    if (now - this.lastGestureTime < GESTURE_COOLDOWN) {
      return;
    }

    // Try to detect gestures in priority order
    let gesture: HandGesture | null = null;

    gesture = this.detectFlick();
    if (!gesture) {
      gesture = this.detectPunch();
    }
    if (!gesture) {
      gesture = this.detectSwipe();
    }

    if (gesture) {
      this.lastGestureTime = now;
      this.emit('hand:gesture', {
        gesture,
        position: { x: this.smoothedPosition.x, y: this.smoothedPosition.y },
      });
    }
  }

  // ============================================================================
  // MEDIAPIPE LOADING
  // ============================================================================

  private async loadMediaPipe(): Promise<boolean> {
    if (dmWindow.vision) return true;

    try {
      debugLog('handtrack', 'mediapipe:loading', 'Loading MediaPipe Vision via dynamic import...');
      // Native dynamic import from CDN – requires 'https://cdn.jsdelivr.net' in
      // CSP scriptSrc but does NOT require 'unsafe-eval'.
      // Note: Using a variable URL defeats Vite's static analysis, allowing
      // runtime resolution without bundling the external module.
      const cdnUrl = MEDIAPIPE_VISION_CDN;
      const vision = (await import(/* @vite-ignore */ cdnUrl)) as VisionModule;
      dmWindow.vision = vision;
      debugLog('handtrack', 'mediapipe:loaded', Object.keys(vision));
      return true;
    } catch (err) {
      debugWarn('handtrack', 'mediapipe:failed', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  private async initHandLandmarker(): Promise<boolean> {
    if (this.handLandmarker) return true;

    try {
      debugLog('handtrack', 'landmarker:init', 'Creating Hand Landmarker...');

      const vision = dmWindow.vision;
      if (!vision) {
        debugWarn('handtrack', 'landmarker:no-vision', 'Vision module not loaded');
        return false;
      }
      const { HandLandmarker, FilesetResolver } = vision;

      const wasmFileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
      });

      debugLog('handtrack', 'landmarker:ready', 'Hand Landmarker ready');
      this.isInitialized = true;
      return true;
    } catch (err) {
      debugWarn('handtrack', 'landmarker:failed', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  // ============================================================================
  // CAMERA SETUP
  // ============================================================================

  private async setupCamera(): Promise<boolean> {
    if (this.videoElement && this.mediaStream) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      this.videoElement.style.cssText =
        'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-9999;';
      document.body.appendChild(this.videoElement);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video timeout')), 10000);
        this.videoElement!.onloadedmetadata = () => {
          clearTimeout(timeout);
          this.videoElement!.play()
            .then(() => resolve())
            .catch(() => resolve());
        };
      });

      // Wait for actual video frames
      await new Promise<void>((resolve) => {
        const checkFrames = () => {
          if (this.videoElement!.videoWidth > 0 && this.videoElement!.videoHeight > 0) {
            resolve();
          } else {
            requestAnimationFrame(checkFrames);
          }
        };
        checkFrames();
      });

      debugLog(
        'handtrack',
        'camera:ready',
        this.videoElement.videoWidth,
        'x',
        this.videoElement.videoHeight
      );
      return true;
    } catch (err) {
      debugWarn('handtrack', 'camera:denied', err instanceof Error ? err.message : String(err));
      this.notify('warning', 'Camera access denied. Hand tracking disabled.');
      return false;
    }
  }

  // ============================================================================
  // HAND ANALYSIS HELPERS
  // ============================================================================

  private getPalmCenter(landmarks: Landmark[]): Point2D {
    const mcpIndices = [5, 9, 13, 17] as const;
    let x = 0,
      y = 0;
    for (const idx of mcpIndices) {
      const lm = landmarks[idx];
      if (lm) {
        x += lm.x;
        y += lm.y;
      }
    }
    return { x: x / mcpIndices.length, y: y / mcpIndices.length };
  }

  private getPinchDistance(landmarks: Landmark[]): number {
    const thumb = landmarks[4];
    const index = landmarks[8];
    if (!thumb || !index) return 0.12; // Default neutral distance
    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const rawDist = Math.sqrt(dx * dx + dy * dy);

    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    if (!indexMcp || !pinkyMcp) return rawDist;
    const palmWidth = Math.sqrt((indexMcp.x - pinkyMcp.x) ** 2 + (indexMcp.y - pinkyMcp.y) ** 2);

    return palmWidth > 0.01 ? rawDist / palmWidth : rawDist;
  }

  private isFist(landmarks: Landmark[]): boolean {
    const wrist = landmarks[0];
    if (!wrist) return false;
    const dist = (a: Landmark, b: Landmark) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const fingers = [
      { tip: 8, mcp: 5 },
      { tip: 12, mcp: 9 },
      { tip: 16, mcp: 13 },
      { tip: 20, mcp: 17 },
    ] as const;

    let curledCount = 0;
    for (const f of fingers) {
      const tip = landmarks[f.tip];
      const mcp = landmarks[f.mcp];
      if (!tip || !mcp) continue;
      const tipDist = dist(tip, wrist);
      const mcpDist = dist(mcp, wrist);
      if (tipDist < mcpDist * FIST_CURL_THRESHOLD) {
        curledCount++;
      }
    }

    return curledCount >= 4;
  }

  private isPoking(landmarks: Landmark[]): boolean {
    const wrist = landmarks[0];
    if (!wrist) return false;
    const dist = (a: Landmark, b: Landmark) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const indexTip = landmarks[8];
    const indexMcp = landmarks[5];
    if (!indexTip || !indexMcp) return false;
    const indexTipDist = dist(indexTip, wrist);
    const indexMcpDist = dist(indexMcp, wrist);

    if (indexTipDist < indexMcpDist * POKE_EXTEND_THRESHOLD) {
      return false;
    }

    const fingers = [
      { tip: 12, mcp: 9 },
      { tip: 16, mcp: 13 },
      { tip: 20, mcp: 17 },
    ] as const;

    let curledCount = 0;
    for (const f of fingers) {
      const tip = landmarks[f.tip];
      const mcp = landmarks[f.mcp];
      if (!tip || !mcp) continue;
      const tipDist = dist(tip, wrist);
      const mcpDist = dist(mcp, wrist);
      if (tipDist < mcpDist * POKE_CURL_THRESHOLD) {
        curledCount++;
      }
    }

    return curledCount >= 3;
  }

  // ============================================================================
  // DETECTION LOOP
  // ============================================================================

  private detectAndUpdate(): void {
    if (!this.isEnabled || !this.videoElement || !this.handLandmarker) {
      return;
    }

    const currentTime = this.videoElement.currentTime;
    if (currentTime !== this.lastVideoTime) {
      this.lastVideoTime = currentTime;

      try {
        const results = this.handLandmarker.detectForVideo(this.videoElement, performance.now());
        const numHands = results.landmarks ? results.landmarks.length : 0;
        const now = performance.now();

        // Track hand count changes
        if (numHands !== this.lastHandCount) {
          this.handCountStableFrames = 0;
          this.lastHandCount = numHands;
        } else {
          this.handCountStableFrames++;
        }

        const handCountStable = this.handCountStableFrames >= HAND_TRANSITION_FRAMES;

        if (numHands === 0) {
          this.handleNoHands(handCountStable, now);
        } else {
          const firstHand = results.landmarks[0];
          if (firstHand) {
            this.handleHandDetected(firstHand, handCountStable, now);
          }
        }
      } catch (err) {
        debugWarn('handtrack', 'detection:error', err instanceof Error ? err.message : String(err));
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleNoHands(handCountStable: boolean, _now: number): void {
    if (this.isInTrackingZone && handCountStable) {
      this.isInTrackingZone = false;
      this.isInFistMode = false;

      // Clear grab state when no hands detected to prevent orphaned grabs
      if (this.isGrabbing) {
        this.emit('hand:grab-end', {
          x: this.smoothedPosition.x,
          y: this.smoothedPosition.y,
          target: this.grabTarget,
        });
        this.isGrabbing = false;
        this.grabTarget = null;
        this.hoverTarget = null;
        this.lastGrabEndTime = performance.now();
        useEventBus().emit('handtrack:grab-end');
      }

      dmWindow.setDotMatrixCursorActive?.(false);
      dmWindow.setDotMatrixHandLandmarks?.(null);
      dmWindow.onDotMatrixHandLost?.();

      debugLog('handtrack', 'state:no-hands', 'No hands - releasing control');
    }

    // Turn off mic if active via fist
    if (this.isMicActiveViaFist && handCountStable) {
      this.isMicActiveViaFist = false;
      this.fistMicDebounceTime = 0;
      debugLog('handtrack', 'mic:off', 'No hands - mic OFF');
      this.toggleMic(false);
      this.notify('info', 'Mic OFF');
    }
  }

  private handleHandDetected(landmarks: Landmark[], handCountStable: boolean, now: number): void {
    const palm = this.getPalmCenter(landmarks);

    // Position tracking - PURE 1:1 mapping
    // Only mirror for front-facing camera (moving hand right moves cursor right)
    const rawX = 1 - palm.x;
    const rawY = 1 - palm.y;

    // Store raw position - same for both visual and grab detection
    this.rawCameraPosition.x = rawX;
    this.rawCameraPosition.y = rawY;

    // Visual target uses same raw position (no offset/gain/normalization)
    // This ensures perfect alignment between cursor and grab detection
    const targetX = rawX;
    const targetY = rawY;

    const inZone =
      targetX >= TRACKING_ZONE_MIN &&
      targetX <= TRACKING_ZONE_MAX &&
      targetY >= TRACKING_ZONE_MIN &&
      targetY <= TRACKING_ZONE_MAX;

    const targetDepth = 0.4;

    // Get z-depth from palm landmarks (average z of MCP joints)
    const palmZ =
      ((landmarks[5]?.z ?? 0) +
        (landmarks[9]?.z ?? 0) +
        (landmarks[13]?.z ?? 0) +
        (landmarks[17]?.z ?? 0)) /
      4;

    // Update velocity/acceleration tracking
    this.updateVelocityTracking(targetX, targetY, palmZ);

    // Pinch detection
    const rawPinch = this.getPinchDistance(landmarks);
    this.lastRawPinchDistance = this.lerp(this.lastRawPinchDistance, rawPinch, 0.15);
    const pinchRange = PINCH_THRESHOLD_OPEN - PINCH_THRESHOLD_CLOSE;
    const normalizedPinch = this.clamp(
      (this.lastRawPinchDistance - PINCH_THRESHOLD_CLOSE) / pinchRange,
      0,
      1
    );
    // Hysteresis: use different thresholds for grab start vs release
    // This prevents flickering when pinch is near the threshold boundary
    const isPinching = this.isGrabbing
      ? normalizedPinch < PINCH_RELEASE_THRESHOLD // Higher threshold to release
      : normalizedPinch < PINCH_GRAB_THRESHOLD; // Lower threshold to grab

    // Update hover target - pure 1:1 screen mapping
    const screenX = this.rawCameraPosition.x * window.innerWidth;
    const screenY = this.rawCameraPosition.y * window.innerHeight;
    this.hoverTarget = null;
    for (const { id, selector } of this.allGrabbableTargets) {
      const el = document.querySelector(selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Skip elements with zero dimensions (hidden via v-show or not rendered)
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }
        if (
          screenX >= rect.left &&
          screenX <= rect.right &&
          screenY >= rect.top &&
          screenY <= rect.bottom
        ) {
          // Check if cursor is over a button - if so, don't set as hover target
          // This allows buttons to remain clickable while widget is grabbable
          const buttonEls = el.querySelectorAll(
            'button, .btn, [role="button"], .close-btn, .add-photo-btn'
          );
          let overButton = false;
          for (const btn of buttonEls) {
            const btnRect = btn.getBoundingClientRect();
            if (
              screenX >= btnRect.left &&
              screenX <= btnRect.right &&
              screenY >= btnRect.top &&
              screenY <= btnRect.bottom
            ) {
              overButton = true;
              break;
            }
          }
          if (!overButton) {
            this.hoverTarget = id;
            break;
          }
        }
      }
    }

    // Handle grab state with event emission
    this.handleGrabState(isPinching, palm, targetX, targetY);

    // Fist gesture for mic control
    this.handleFistGesture(landmarks, now);

    // Poke gesture for ripple
    this.handlePokeGesture(landmarks, now);

    // Check for motion gestures
    this.checkGestures();

    // Track zone enter/exit
    const wasInZone = this.isInTrackingZone;

    // Apply smoothed values
    if (inZone) {
      this.handleInZone(targetX, targetY, targetDepth, landmarks);

      // Emit zone-enter event if just entered
      if (!wasInZone) {
        this.emit('hand:zone-enter', { x: targetX, y: targetY });
      }

      // Emit move event every frame when in zone
      this.emit('hand:move', {
        x: this.smoothedPosition.x,
        y: this.smoothedPosition.y,
        rawX: this.rawCameraPosition.x,
        rawY: this.rawCameraPosition.y,
        velocity: { ...this.smoothedVelocity },
        acceleration: { ...this.acceleration },
        speed: this.speed,
        direction: this.direction,
      });
    } else if (this.isInTrackingZone && handCountStable) {
      this.handleOutOfZone();

      // Emit zone-exit event
      this.emit('hand:zone-exit', { x: targetX, y: targetY });
    }

    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      debugLog(
        'handtrack',
        'frame:stats',
        'pos:',
        this.smoothedPosition.x.toFixed(2),
        this.smoothedPosition.y.toFixed(2),
        'vel:',
        this.speed.toFixed(4),
        'depth:',
        this.smoothedDepth.toFixed(2)
      );
    }
  }

  private handleGrabState(
    isPinching: boolean,
    _palm: Landmark,
    targetX: number,
    targetY: number
  ): void {
    if (isPinching && !this.isGrabbing) {
      // Check cooldown to prevent immediate re-grab after release
      const now = performance.now();
      if (now - this.lastGrabEndTime < HandTrackingSystem.GRAB_COOLDOWN_MS) {
        return; // Still in cooldown
      }

      // Pure 1:1 screen mapping - same as visual cursor
      const screenX = this.rawCameraPosition.x * window.innerWidth;
      const screenY = this.rawCameraPosition.y * window.innerHeight;

      this.grabTarget = null;

      debugLog(
        'handtrack',
        'pinch:detected',
        'screen:',
        Math.round(screenX),
        Math.round(screenY),
        'smoothed:',
        this.smoothedPosition.x.toFixed(2),
        this.smoothedPosition.y.toFixed(2)
      );

      // First pass: check for exact hits
      for (const { id, selector } of this.allGrabbableTargets) {
        const el = document.querySelector(selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          // Skip elements with zero dimensions (hidden via v-show or not rendered)
          if (rect.width === 0 || rect.height === 0) {
            debugLog('handtrack', 'target:skipped', id, '- zero dimensions (hidden)');
            continue;
          }
          const exactHit =
            screenX >= rect.left &&
            screenX <= rect.right &&
            screenY >= rect.top &&
            screenY <= rect.bottom;
          debugLog(
            'handtrack',
            'target:check',
            id,
            'rect:',
            Math.round(rect.left),
            Math.round(rect.top),
            Math.round(rect.right),
            Math.round(rect.bottom),
            'hit:',
            exactHit
          );
          if (exactHit) {
            this.grabTarget = id;
            break;
          }
        } else {
          debugLog('handtrack', 'target:missing', id, 'selector', selector, 'NOT FOUND in DOM');
        }
      }

      // Second pass: if no exact hit, check with per-target grace distances
      // Each target can have its own grace distance based on position/size
      if (!this.grabTarget) {
        let closestTarget: string | null = null;
        let closestDistance = Infinity;
        let closestGraceRatio = Infinity; // distance / graceDistance for priority

        for (const { id, selector } of this.allGrabbableTargets) {
          const el = document.querySelector(selector);
          if (el) {
            const rect = el.getBoundingClientRect();
            // Skip elements with zero dimensions (hidden via v-show or not rendered)
            if (rect.width === 0 || rect.height === 0) {
              continue;
            }
            // Calculate distance to nearest edge of rect
            const dx = Math.max(rect.left - screenX, 0, screenX - rect.right);
            const dy = Math.max(rect.top - screenY, 0, screenY - rect.bottom);
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Get per-target grace distance (fallback to default)
            const graceDistance = GRAB_HIT_GRACE_OVERRIDES[id] ?? INTENT_THRESHOLDS.grabHitDefault;

            // InputBar grace only active in bottom portion of screen to avoid mid-screen grabs
            if (id === 'inputBar') {
              const minY = window.innerHeight * INTENT_THRESHOLDS.inputBarMinYFraction;
              if (screenY < minY) {
                continue; // Skip inputBar grace if pinch is in upper portion of screen
              }
            }

            // Only consider if within this target's grace distance
            if (distance < graceDistance) {
              // Prioritize by ratio of distance to grace (lower = closer relative to allowed)
              const graceRatio = distance / graceDistance;
              if (graceRatio < closestGraceRatio) {
                closestGraceRatio = graceRatio;
                closestDistance = distance;
                closestTarget = id;
              }
            }
          }
        }

        if (closestTarget) {
          this.grabTarget = closestTarget;
          debugLog(
            'handtrack',
            'grace:hit',
            closestTarget,
            'at distance',
            Math.round(closestDistance)
          );
        }
      }

      // Only start grab if we're actually over a grabbable target
      if (!this.grabTarget) {
        debugLog('handtrack', 'grab:no-target', 'No target hit, grab not started');
        return; // Don't grab if not over a target
      }

      this.isGrabbing = true;
      this.grabStartX = targetX;
      this.grabStartY = targetY;
      debugLog('handtrack', 'grab:start', this.grabTarget);

      // Emit grab-start event
      this.emit('hand:grab-start', {
        x: targetX,
        y: targetY,
        target: this.grabTarget,
      });
    } else if (!isPinching && this.isGrabbing) {
      debugLog('handtrack', 'grab:release', this.grabTarget);

      // Use instantaneous velocity for release, not smoothed (smoothed lags behind actual motion)
      // Convert from normalized units/sec to pixels per 16.67ms frame
      const frameTime = 16.67 / 1000;
      // DEBUG: Log velocity values for momentum debugging (remove after verification)
      debugLog(
        'handtrack',
        'release:velocity',
        'norm/s:',
        this.velocity.x.toFixed(3),
        this.velocity.y.toFixed(3)
      );
      debugLog(
        'handtrack',
        'release:smoothed',
        'norm/s:',
        this.smoothedVelocity.x.toFixed(3),
        this.smoothedVelocity.y.toFixed(3)
      );
      const releaseVelocity: Point2D = {
        x: this.velocity.x * window.innerWidth * frameTime,
        y: this.velocity.y * window.innerHeight * frameTime,
      };

      // Emit grab-end event before clearing state
      this.emit('hand:grab-end', {
        x: targetX,
        y: targetY,
        target: this.grabTarget,
        velocity: releaseVelocity,
      });

      this.isGrabbing = false;
      this.grabTarget = null;
      this.hoverTarget = null;
      this.lastGrabEndTime = performance.now();
      useEventBus().emit('handtrack:grab-end');
    }

    // Emit move intent while grabbing
    if (this.isGrabbing && this.grabTarget) {
      const deltaX = (targetX - this.grabStartX) * window.innerWidth;
      const deltaY = (this.grabStartY - targetY) * window.innerHeight;

      handTrackingAdapter().emit('move', {
        target: this.grabTarget,
        value: { deltaX, deltaY },
      });
    }
  }

  private handleFistGesture(landmarks: Landmark[], now: number): void {
    if (dmWindow.isGameActive) {
      if (this.isMicActiveViaFist) {
        this.isMicActiveViaFist = false;
        this.isInFistMode = false;
      }
      this.fistMicDebounceTime = 0;
      return;
    }

    const makingFist = this.isFist(landmarks);

    if (makingFist && !this.isMicActiveViaFist) {
      if (this.fistMicDebounceTime === 0) {
        this.fistMicDebounceTime = now;
      } else if (now - this.fistMicDebounceTime >= FIST_MIC_DEBOUNCE) {
        this.isMicActiveViaFist = true;
        this.isInFistMode = true;
        debugLog('handtrack', 'fist:mic-on', 'Fist closed - mic ON');
        this.toggleMic(true);
        this.notify('info', 'Mic ON');
      }
    } else if (!makingFist && this.isMicActiveViaFist) {
      this.isMicActiveViaFist = false;
      this.isInFistMode = false;
      this.fistMicDebounceTime = 0;
      debugLog('handtrack', 'fist:mic-off', 'Fist opened - mic OFF');
      this.toggleMic(false);
      this.notify('info', 'Mic OFF');
    } else if (!makingFist) {
      this.fistMicDebounceTime = 0;
    }
  }

  private toggleMic(on: boolean): void {
    const micButton =
      document.getElementById('voice-input-button') ||
      document.querySelector('[data-voice-toggle]') ||
      document.querySelector('.voice-input-btn');
    if (micButton) {
      (micButton as HTMLElement).click();
    } else if (on && dmWindow.startVoiceInput) {
      dmWindow.startVoiceInput();
    } else if (!on && dmWindow.stopVoiceInput) {
      dmWindow.stopVoiceInput();
    } else if (dmWindow.toggleVoiceInput) {
      dmWindow.toggleVoiceInput();
    } else {
      document.dispatchEvent(new CustomEvent(on ? 'handtrack:micOn' : 'handtrack:micOff'));
    }
  }

  private handlePokeGesture(landmarks: Landmark[], now: number): void {
    const poking = this.isPoking(landmarks);

    if (poking && !this.wasPoking && now - this.lastPokeTime > POKE_COOLDOWN) {
      this.lastPokeTime = now;

      const indexTip = landmarks[8];
      if (!indexTip) return;
      let pokeX = 1 - indexTip.x;
      let pokeY = 1 - indexTip.y;
      pokeX = this.clamp(pokeX, 0, 1);
      pokeY = this.clamp(pokeY, 0, 1);

      // Suppress visual ripple effect if user prefers reduced motion
      // Gesture detection still runs for accessibility (e.g., triggering actions)
      if (!prefersReducedMotion()) {
        dmWindow.spawnDotMatrixRipple?.(pokeX, pokeY);
        debugLog('handtrack', 'poke:ripple', pokeX.toFixed(2), pokeY.toFixed(2));
      }
    }
    this.wasPoking = poking;
  }

  private handleInZone(
    targetX: number,
    targetY: number,
    targetDepth: number,
    landmarks: Landmark[]
  ): void {
    if (!this.isInTrackingZone) {
      this.isInTrackingZone = true;

      // Snap to current state for seamless handoff
      const pos = dmWindow.getDotMatrixFocusPosition?.();
      if (pos) {
        this.smoothedPosition.x = pos.x;
        this.smoothedPosition.y = pos.y;
      }
      const depth = dmWindow.getDotMatrixDepth?.();
      if (typeof depth === 'number') {
        this.smoothedDepth = depth;
      }
      const rot = dmWindow.getDotMatrixRotation?.();
      if (typeof rot === 'number') {
        this.smoothedRotation = rot;
        this.baseRotation = rot;
      }

      dmWindow.setDotMatrixCursorActive?.(true);
      dmWindow.onDotMatrixHandPresent?.();
      debugLog('handtrack', 'zone:enter', 'Hand in zone - taking control');
    }

    // Smooth everything
    if (!this.isInFistMode) {
      this.smoothedPosition.x = this.lerp(this.smoothedPosition.x, targetX, POSITION_SMOOTHING);
    }
    this.smoothedPosition.y = this.lerp(this.smoothedPosition.y, targetY, POSITION_SMOOTHING);
    this.smoothedDepth = this.lerp(this.smoothedDepth, targetDepth, DEPTH_SMOOTHING);
    this.smoothedRotation = this.lerp(this.smoothedRotation, this.baseRotation, ROTATION_SMOOTHING);

    // Send to dotmatrix
    dmWindow.setDotMatrixHeadPosition?.(this.smoothedPosition.x, this.smoothedPosition.y);
    dmWindow.setDotMatrixDepth?.(this.smoothedDepth);
    dmWindow.setDotMatrixRotation?.(this.smoothedRotation);
    dmWindow.setDotMatrixHandLandmarks?.(landmarks);
  }

  private handleOutOfZone(): void {
    this.isInTrackingZone = false;
    this.isInFistMode = false;

    // Clear grab state on zone exit to prevent orphaned grabs
    if (this.isGrabbing) {
      this.emit('hand:grab-end', {
        x: this.smoothedPosition.x,
        y: this.smoothedPosition.y,
        target: this.grabTarget,
      });
      this.isGrabbing = false;
      this.grabTarget = null;
      this.hoverTarget = null;
      this.lastGrabEndTime = performance.now();
      useEventBus().emit('handtrack:grab-end');
    }

    dmWindow.setDotMatrixCursorActive?.(false);
    dmWindow.setDotMatrixHandLandmarks?.(null);
    dmWindow.onDotMatrixHandLost?.();

    if (this.isMicActiveViaFist) {
      this.isMicActiveViaFist = false;
      this.fistMicDebounceTime = 0;
      debugLog('handtrack', 'zone:exit-mic', 'Left zone - mic OFF');
      this.toggleMic(false);
      this.notify('info', 'Mic OFF');
    }

    debugLog('handtrack', 'zone:exit', 'Hand out of zone');
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  public async start(): Promise<boolean> {
    if (this.isEnabled) return true;
    if (this.isLoading) return false;

    this.isLoading = true;
    this.notify('info', 'Starting hand tracking...');

    try {
      const mpLoaded = await this.loadMediaPipe();
      if (!mpLoaded) {
        this.notify('error', 'Failed to load hand tracking library.');
        this.isLoading = false;
        return false;
      }

      const landmarkerReady = await this.initHandLandmarker();
      if (!landmarkerReady) {
        this.notify('error', 'Failed to initialize hand detector.');
        this.isLoading = false;
        return false;
      }

      const camReady = await this.setupCamera();
      if (!camReady) {
        this.isLoading = false;
        return false;
      }

      this.isEnabled = true;
      this.isLoading = false;
      this.isGrabbing = false;

      // Listen for physics snap events to release grab
      // This prevents move intents from overwriting magnetic snap position
      this.physicsSnapHandler = () => {
        if (this.isGrabbing) {
          debugLog('handtrack', 'physics:snap', 'Physics snap - releasing grab');
          this.isGrabbing = false;
          this.grabTarget = null;
        }
      };
      useEventBus().on('physics:snap', this.physicsSnapHandler);

      // Subscribe to FrameCoordinator or fallback
      const frameCoordinator = dmWindow.frameCoordinator;
      const FramePriority = dmWindow.FramePriority;
      if (frameCoordinator && FramePriority) {
        frameCoordinator.subscribe(
          'handtrack',
          () => this.detectAndUpdate(),
          FramePriority.TRACKING
        );
        debugLog('handtrack', 'frame:coordinator', 'Subscribed to FrameCoordinator');
      } else {
        debugLog(
          'handtrack',
          'frame:fallback',
          'FrameCoordinator not available, using standalone RAF'
        );
        const fallbackLoop = () => {
          if (!this.isEnabled) return;
          this.detectAndUpdate();
          this.animationFrameId = requestAnimationFrame(fallbackLoop);
        };
        fallbackLoop();
      }

      dmWindow.setDotMatrixCursorActive?.(true);
      this.notify('success', 'Hand tracking enabled! Pinch to drag bar, fist to talk.');
      return true;
    } catch (err) {
      logError('handtrack', 'start:failed', err instanceof Error ? err : new Error(String(err)));
      this.notify('error', 'Failed to start hand tracking.');
      this.isLoading = false;
      return false;
    }
  }

  public stop(): void {
    this.isEnabled = false;

    // Clean up physics:snap listener
    if (this.physicsSnapHandler) {
      useEventBus().off('physics:snap', this.physicsSnapHandler);
      this.physicsSnapHandler = null;
    }

    dmWindow.frameCoordinator?.unsubscribe('handtrack');

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement.remove();
      this.videoElement = null;
    }

    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    this.isInitialized = false;

    dmWindow.setDotMatrixCursorActive?.(false);

    // Reset state
    this.smoothedPosition = { x: 0.5, y: 0.5 };
    this.smoothedDepth = 0.5;
    this.smoothedRotation = 0;
    this.isInTrackingZone = true;
    this.lastRawPinchDistance = 0.12;
    this.isInFistMode = false;
    this.baseRotation = 0;
    this.handCountStableFrames = 0;
    this.lastHandCount = 0;
    this.isMicActiveViaFist = false;
    this.fistMicDebounceTime = 0;
    this.lastPokeTime = 0;
    this.wasPoking = false;
    this.isGrabbing = false;

    // Reset velocity/acceleration state
    this.positionHistory = [];
    this.velocity = { x: 0, y: 0 };
    this.smoothedVelocity = { x: 0, y: 0 };
    this.acceleration = { x: 0, y: 0 };
    this.speed = 0;
    this.direction = 0;
    this.lastVelocityTime = 0;

    // Reset gesture detection state
    this.lastGestureTime = 0;
    this.gestureStartTime = 0;
    this.gestureStartPosition = null;
    this.isInGestureMotion = false;
    this.gestureVelocityHistory = [];

    dmWindow.stopVoiceInput?.();
    dmWindow.setDotMatrixHeadPosition?.(0.5, 0.5);
    dmWindow.setDotMatrixDepth?.(0.5);
    dmWindow.setDotMatrixRotation?.(0);
    dmWindow.setDotMatrixHandLandmarks?.(null);
    dmWindow.onDotMatrixHandLost?.();

    this.notify('info', 'Hand tracking disabled');
  }

  public async setEnabled(enabled: boolean): Promise<boolean> {
    if (enabled) {
      return await this.start();
    } else {
      this.stop();
      return true;
    }
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public setButtonVisible(visible: boolean): void {
    try {
      localStorage.setItem(LS_BUTTON_KEY, visible ? 'true' : 'false');
    } catch {
      // Ignore
    }

    document.dispatchEvent(
      new CustomEvent('dotmatrixHandTrackButtonChange', { detail: { visible } })
    );

    if (!visible && this.isEnabled) {
      this.stop();
    }
  }

  public getButtonVisible(): boolean {
    try {
      return localStorage.getItem(LS_BUTTON_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get the current hand tracking position with velocity/acceleration data.
   * This is the polling API - for event-driven updates, use subscribe() instead.
   * @deprecated Prefer using subscribe('hand:move', callback) for event-driven updates
   */
  public getPosition(): HandTrackingPosition {
    return {
      x: this.smoothedPosition.x,
      y: this.smoothedPosition.y,
      rawX: this.rawCameraPosition.x,
      rawY: this.rawCameraPosition.y,
      inZone: this.isInTrackingZone && this.isEnabled,
      hoverTarget: this.hoverTarget,
      isGrabbing: this.isGrabbing,
      velocity: { ...this.smoothedVelocity },
      acceleration: { ...this.acceleration },
      speed: this.speed,
      direction: this.direction,
    };
  }

  public async toggle(): Promise<void> {
    if (this.isEnabled) {
      this.stop();
    } else {
      await this.start();
    }
  }
}

// ============================================================================
// SINGLETON AND WINDOW GLOBALS
// ============================================================================

let instance: HandTrackingSystem | null = null;

export function getHandTrackingSystem(): HandTrackingSystem {
  if (!instance) {
    instance = new HandTrackingSystem();
  }
  return instance;
}

export function initHandTrackingGlobals(): void {
  if (typeof window === 'undefined') return;

  const system = getHandTrackingSystem();

  dmWindow.setDotMatrixHandTracking = (enabled: boolean) => system.setEnabled(enabled);
  dmWindow.getDotMatrixHandTracking = () => system.getEnabled();
  dmWindow.setDotMatrixTrackingButtonVisible = (visible: boolean) =>
    system.setButtonVisible(visible);
  dmWindow.getDotMatrixTrackingButtonVisible = () => system.getButtonVisible();
  dmWindow.toggleDotMatrixHandTracking = () => system.toggle();
  dmWindow.getHandTrackingPosition = () => system.getPosition();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (system.getEnabled()) {
      system.stop();
    }
  });

  debugLog(
    'handtrack',
    'api:exposed',
    'toggleDotMatrixHandTracking:',
    typeof dmWindow.toggleDotMatrixHandTracking
  );
}
