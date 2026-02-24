/**
 * Shared Magnetic System Configuration
 *
 * Unified thresholds for magnetic snap behavior across:
 * - useSkillPhysics (pills)
 * - useIntentCoordinator (intent routing)
 * - handtrack.ts (hand tracking grab detection)
 *
 * Thresholds are tuned for hand tracking tolerance (10-30px jitter)
 * while maintaining precise, intentional feel.
 */

/**
 * Magnetic snap thresholds for physics-based attachment
 */
export const MAGNETIC_THRESHOLDS = {
  /** Distance in px to start pulling toward target (attraction begins) */
  pullThreshold: 100,

  /** Distance in px to trigger auto-snap (immediate attachment) */
  snapThreshold: 30,

  /** Distance in px to drag away before detaching */
  detachThreshold: 50,

  /** Spring stiffness for magnetic pull, 0-1 (higher = snappier) */
  pullStrength: 0.18,

  /** Spring stiffness for smooth motion */
  springStiffness: 0.06,

  /** Spring damping to prevent oscillation */
  springDamping: 0.75,
} as const;

/**
 * Intent system thresholds for spatial routing
 */
export const INTENT_THRESHOLDS = {
  /** Grace distance beyond zone edge for intent resolution */
  graceDistance: 150,

  /** Default grace for hand tracking grab hit detection */
  grabHitDefault: 200,

  /** Grace for InputBar - larger zone but only active in bottom portion of screen */
  grabHitInputBar: 250,

  /** InputBar grace only active when pinch Y > this fraction of screen height (0.5 = bottom half) */
  inputBarMinYFraction: 0.5,

  /** Grace for time widget */
  grabHitTimeWidget: 200,

  /** Grace for notes widget */
  grabHitNotesWidget: 200,
} as const;

/**
 * Default magnetic target configuration
 */
export const DEFAULT_MAGNETIC_TARGET = {
  target: '#bar',
  pullThreshold: MAGNETIC_THRESHOLDS.pullThreshold,
  snapThreshold: MAGNETIC_THRESHOLDS.snapThreshold,
  detachThreshold: MAGNETIC_THRESHOLDS.detachThreshold,
  edge: 'both' as const,
  pullStrength: MAGNETIC_THRESHOLDS.pullStrength,
};

export type MagneticThresholds = typeof MAGNETIC_THRESHOLDS;
export type IntentThresholds = typeof INTENT_THRESHOLDS;
