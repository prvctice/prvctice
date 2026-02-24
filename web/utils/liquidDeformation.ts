/**
 * Liquid Deformation Utilities
 *
 * Provides velocity-based squash/stretch deformation for fluid animation.
 * Implements Disney's squash & stretch principle - objects deform in
 * response to motion while maintaining visual volume.
 */

export interface VelocityDeformation {
  /** Scale along motion axis (stretch) */
  scaleX: number;
  /** Scale perpendicular to motion (compress) */
  scaleY: number;
  /** Rotation toward motion direction (radians) */
  rotation: number;
  /** Transform origin shift toward trailing edge (0-1) */
  originOffset: number;
}

export interface DeformationConfig {
  /** Maximum stretch factor (default: 1.08 = 8% stretch) */
  maxStretch: number;
  /** Minimum compress factor (default: 0.94 = 6% compress) */
  minCompress: number;
  /** Speed at which max deformation is reached (px/frame) */
  speedThreshold: number;
  /** Rotation influence (0-1, default: 0.05 = ~3 degrees max) */
  rotationFactor: number;
  /** Origin shift amount (0-1, default: 0.15) */
  originShiftFactor: number;
}

const DEFAULT_CONFIG: DeformationConfig = {
  maxStretch: 1.25, // 25% stretch - visible but smooth
  minCompress: 0.8,
  speedThreshold: 10,
  rotationFactor: 0.08,
  originShiftFactor: 0.2,
};

/**
 * Calculate velocity-based deformation for liquid feel.
 * Fast movement stretches along motion axis, compresses perpendicular.
 *
 * @param velocity - Current velocity {x, y} in pixels/frame
 * @param config - Optional deformation configuration
 * @returns Deformation parameters for transform application
 */
export function calculateVelocityDeformation(
  velocity: { x: number; y: number },
  config: Partial<DeformationConfig> = {}
): VelocityDeformation {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

  // No deformation below threshold
  if (speed < 0.5) {
    return {
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      originOffset: 0,
    };
  }

  // Calculate deformation intensity (0-1)
  const intensity = Math.min(1, speed / cfg.speedThreshold);

  // Ease-out for natural feel (fast start, slow approach to max)
  const easedIntensity = 1 - Math.pow(1 - intensity, 2);

  // Stretch along motion axis
  const stretchAmount = (cfg.maxStretch - 1) * easedIntensity;
  const scaleX = 1 + stretchAmount;

  // Compress perpendicular to maintain volume
  // Volume preservation: scaleX * scaleY ≈ 1
  const scaleY = 1 / scaleX;
  // Clamp to min compress
  const clampedScaleY = Math.max(cfg.minCompress, scaleY);

  // Rotation toward motion direction (subtle)
  const angle = Math.atan2(velocity.y, velocity.x);
  const rotation = angle * cfg.rotationFactor * easedIntensity;

  // Origin shifts to trailing edge for more organic feel
  const originOffset = cfg.originShiftFactor * easedIntensity;

  return {
    scaleX,
    scaleY: clampedScaleY,
    rotation,
    originOffset,
  };
}

/**
 * Apply velocity deformation to an element's transform.
 * Uses angle-based scaling to align deformation with motion direction.
 *
 * @param element - HTML element to deform
 * @param velocity - Current velocity {x, y}
 * @param baseTransform - Optional base transform to combine with
 * @param config - Optional deformation configuration
 */
export function applyVelocityDeformation(
  element: HTMLElement,
  velocity: { x: number; y: number },
  baseTransform = '',
  config: Partial<DeformationConfig> = {}
): void {
  const deform = calculateVelocityDeformation(velocity, config);

  if (deform.scaleX === 1 && deform.scaleY === 1) {
    // No deformation - use base transform only
    element.style.transform = baseTransform || '';
    element.style.transformOrigin = '';
    return;
  }

  // Calculate angle for directional scaling
  const angle = Math.atan2(velocity.y, velocity.x);

  // Build transform: rotate to align with motion, scale, rotate back
  // This creates directional stretch along velocity vector
  const rotDeg = (angle * 180) / Math.PI;
  const microRotDeg = (deform.rotation * 180) / Math.PI;

  // Combine: base transform + directional deformation + micro-rotation
  const deformTransform = [
    baseTransform,
    `rotate(${rotDeg}deg)`,
    `scale(${deform.scaleX.toFixed(4)}, ${deform.scaleY.toFixed(4)})`,
    `rotate(${-rotDeg + microRotDeg}deg)`,
  ]
    .filter(Boolean)
    .join(' ');

  element.style.transform = deformTransform;

  // Shift origin toward trailing edge
  // Trailing edge is opposite to motion direction
  const originX = 50 - Math.cos(angle) * deform.originOffset * 50;
  const originY = 50 - Math.sin(angle) * deform.originOffset * 50;
  element.style.transformOrigin = `${originX.toFixed(1)}% ${originY.toFixed(1)}%`;
}

/**
 * Clear deformation from an element.
 * Call this when motion stops to reset to normal appearance.
 *
 * @param element - HTML element to reset
 * @param baseTransform - Optional base transform to restore
 */
export function clearDeformation(element: HTMLElement, baseTransform = ''): void {
  element.style.transform = baseTransform;
  element.style.transformOrigin = '';
}

/**
 * Smooth deformation state for interpolation between frames.
 * Prevents jarring transitions when velocity changes suddenly.
 */
export class DeformationState {
  private currentScaleX = 1;
  private currentScaleY = 1;
  private currentRotation = 0;
  private currentOriginOffset = 0;
  private smoothing: number;

  constructor(smoothing = 0.15) {
    this.smoothing = smoothing;
  }

  /**
   * Update state toward target deformation with smoothing.
   * Call this each frame for smooth transitions.
   */
  update(target: VelocityDeformation): VelocityDeformation {
    this.currentScaleX += (target.scaleX - this.currentScaleX) * this.smoothing;
    this.currentScaleY += (target.scaleY - this.currentScaleY) * this.smoothing;
    this.currentRotation += (target.rotation - this.currentRotation) * this.smoothing;
    this.currentOriginOffset += (target.originOffset - this.currentOriginOffset) * this.smoothing;

    return {
      scaleX: this.currentScaleX,
      scaleY: this.currentScaleY,
      rotation: this.currentRotation,
      originOffset: this.currentOriginOffset,
    };
  }

  /**
   * Check if deformation has settled to near-identity.
   */
  isSettled(threshold = 0.002): boolean {
    return (
      Math.abs(this.currentScaleX - 1) < threshold &&
      Math.abs(this.currentScaleY - 1) < threshold &&
      Math.abs(this.currentRotation) < threshold &&
      Math.abs(this.currentOriginOffset) < threshold
    );
  }

  /**
   * Reset to identity state immediately.
   */
  reset(): void {
    this.currentScaleX = 1;
    this.currentScaleY = 1;
    this.currentRotation = 0;
    this.currentOriginOffset = 0;
  }
}
