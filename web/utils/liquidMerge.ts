/**
 * Liquid Merge Animation
 *
 * Creates a liquid capsule merge effect when two pills combine.
 * Features:
 * - SVG goo filter for organic blob merging
 * - Soft-body deformation: pills squish on contact side, bulge perpendicular
 * - Custom spring physics for smooth, liquid-like motion
 * - Proximity-reactive: deformation increases as pills approach
 */

import { animate } from '@motionone/dom';
import { prefersReducedMotion } from '@web/composables/useMotion';
import type { CombineMode } from '@web/types/skills';

export interface LiquidMergeConfig {
  source: {
    element: HTMLElement;
    rect: DOMRect;
  };
  target: {
    element: HTMLElement;
    rect: DOMRect;
  };
  midpoint: { x: number; y: number };
  mode: CombineMode;
  /** Duration of the merge animation in ms */
  duration?: number;
  /** Callback when animation completes */
  onComplete?: () => void;
}

/** Mode-specific colors for the liquid effect */
const MODE_COLORS: Record<CombineMode, { fill: string; glow: string }> = {
  chain: {
    fill: 'rgba(100, 180, 255, 0.9)',
    glow: 'rgba(100, 180, 255, 0.5)',
  },
  pipe: {
    fill: 'rgba(140, 200, 255, 0.9)',
    glow: 'rgba(140, 200, 255, 0.5)',
  },
  modify: {
    fill: 'rgba(255, 180, 100, 0.9)',
    glow: 'rgba(255, 180, 100, 0.5)',
  },
};

/**
 * Oil-drop physics configuration
 * Tuned for liquid feel: slower, bouncier, more cohesive
 */
const OIL_DROP_CONFIG = {
  // Spring physics - lower = slower, bouncier
  springStiffness: 0.018,
  springDamping: 0.72,

  // Surface tension - pulls pills together when close (cubic curve)
  tensionRadius: 90, // Slightly larger for earlier pull
  tensionStrength: 0.18, // Stronger base tension

  // Animation phases - 20% slower for languid liquid feel
  approachDuration: 0.48,
  mergeDuration: 0.3,
  settleDuration: 0.36,
};

/** Soft-body deformation configuration */
const DEFORM_CONFIG = {
  /** Distance at which deformation starts (px) */
  startDistance: 120,
  /** Distance at which max squish occurs (px) - pills "touching" */
  contactDistance: 20,
  /** Maximum squish factor on contact axis (0.7 = 30% compression) */
  maxSquish: 0.65,
  /** Maximum bulge factor perpendicular to contact (1.2 = 20% expansion) */
  maxBulge: 1.25,
  /** Smoothing for deformation transitions */
  smoothing: 0.15,
};

/**
 * Calculate deformation factors based on distance between two points
 * Returns { squish, bulge } where squish < 1 compresses, bulge > 1 expands
 */
function calculateDeformation(distance: number): { squish: number; bulge: number } {
  const { startDistance, contactDistance, maxSquish, maxBulge } = DEFORM_CONFIG;

  // No deformation if too far apart
  if (distance >= startDistance) {
    return { squish: 1, bulge: 1 };
  }

  // Calculate progress: 0 = start distance, 1 = contact
  const progress = 1 - (distance - contactDistance) / (startDistance - contactDistance);
  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Ease-in-out for smooth deformation
  const eased =
    clampedProgress < 0.5
      ? 2 * clampedProgress * clampedProgress
      : 1 - Math.pow(-2 * clampedProgress + 2, 2) / 2;

  // Interpolate toward max deformation
  const squish = 1 - (1 - maxSquish) * eased;
  const bulge = 1 + (maxBulge - 1) * eased;

  return { squish, bulge };
}

/**
 * Get angle between two points (radians)
 */
function getAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Get distance between two points
 */
function getDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Apply soft-body deformation transforms to a pill element
 * Creates an organic liquid/water-drop effect by:
 * 1. Using angle-based scaleX/scaleY (not rotate-scale-rotate which causes skew)
 * 2. Applying asymmetric border-radius to flatten contact side
 * 3. Shifting transform-origin toward the contact point
 *
 * This avoids the "italic/rigid" look of rotate-scale-rotate transforms.
 */
function applyDeformation(
  element: HTMLElement,
  angle: number,
  squish: number,
  bulge: number
): void {
  // Normalize angle to 0-2π range
  const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Calculate how vertical the collision is using sin²(angle)
  // sin²(0) = 0 (horizontal), sin²(π/2) = 1 (vertical)
  const sinAngle = Math.sin(normalizedAngle);
  const verticalness = sinAngle * sinAngle;

  // Calculate scaleX and scaleY based on collision direction:
  // - Horizontal collision (angle ~0 or ~π): squish X, bulge Y
  // - Vertical collision (angle ~π/2 or ~3π/2): squish Y, bulge X
  const scaleX = squish + (bulge - squish) * verticalness;
  const scaleY = bulge + (squish - bulge) * verticalness;

  // Calculate asymmetric border-radius for organic look
  // The contact side flattens, the opposite side bulges
  const baseBorderRadius = 9999; // Full pill shape
  const deformAmount = (1 - squish) * 100; // 0-35% based on squish

  // Determine which sides to flatten based on angle
  // cos > 0 = contact from right, cos < 0 = contact from left
  // sin > 0 = contact from below, sin < 0 = contact from above
  const cosAngle = Math.cos(normalizedAngle);

  // Border radius: top-left top-right bottom-right bottom-left
  // Flatten the contact side, maintain or bulge the opposite
  let borderRadius: string;
  const flatRadius = Math.max(baseBorderRadius * 0.3, baseBorderRadius - deformAmount * 30);
  const bulgeRadius = baseBorderRadius;

  // Blend radius based on collision direction
  const horizontalBias = Math.abs(cosAngle);
  const verticalBias = Math.abs(sinAngle);

  if (horizontalBias > verticalBias) {
    // Mostly horizontal collision
    if (cosAngle > 0) {
      // Contact from right - flatten right side
      borderRadius = `${bulgeRadius}px ${flatRadius}px ${flatRadius}px ${bulgeRadius}px`;
    } else {
      // Contact from left - flatten left side
      borderRadius = `${flatRadius}px ${bulgeRadius}px ${bulgeRadius}px ${flatRadius}px`;
    }
  } else {
    // Mostly vertical collision
    if (sinAngle > 0) {
      // Contact from below - flatten bottom
      borderRadius = `${bulgeRadius}px ${bulgeRadius}px ${flatRadius}px ${flatRadius}px`;
    } else {
      // Contact from above - flatten top
      borderRadius = `${flatRadius}px ${flatRadius}px ${bulgeRadius}px ${bulgeRadius}px`;
    }
  }

  // Shift transform-origin toward the contact point for more organic feel
  // 50% is center, shift 10-20% toward contact side
  const originShift = deformAmount * 0.3; // 0-10% shift
  let originX = 50;
  let originY = 50;

  if (horizontalBias > 0.3) {
    originX = cosAngle > 0 ? 50 + originShift : 50 - originShift;
  }
  if (verticalBias > 0.3) {
    originY = sinAngle > 0 ? 50 + originShift : 50 - originShift;
  }

  // Apply transforms - direct scale without rotate-scale-rotate
  element.style.transform = `scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
  element.style.transformOrigin = `${originX.toFixed(1)}% ${originY.toFixed(1)}%`;
  element.style.borderRadius = borderRadius;
}

/**
 * Enhanced spring physics for liquid-like motion
 * Supports velocity injection for surface tension effects
 */
class LiquidSpring {
  private current: number;
  private target: number;
  private velocity = 0;
  private stiffness: number;
  private damping: number;

  constructor(initial: number, stiffness = 0.018, damping = 0.72) {
    this.current = initial;
    this.target = initial;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  setTarget(t: number): void {
    this.target = t;
  }

  /** Add velocity for external forces like surface tension */
  addVelocity(v: number): void {
    this.velocity += v;
  }

  update(): number {
    const force = (this.target - this.current) * this.stiffness;
    this.velocity += force;
    this.velocity *= this.damping;
    this.current += this.velocity;
    return this.current;
  }

  get(): number {
    return this.current;
  }

  getVelocity(): number {
    return this.velocity;
  }

  isSettled(threshold = 0.5): boolean {
    return Math.abs(this.target - this.current) < threshold && Math.abs(this.velocity) < threshold;
  }
}

/**
 * Calculate surface tension pull between two pills
 * Uses cubic curve for "snap" effect - gentle at distance, strong when close
 */
function calculateSurfaceTension(
  sourceCenter: { x: number; y: number },
  targetCenter: { x: number; y: number }
): { dx: number; dy: number } {
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > OIL_DROP_CONFIG.tensionRadius || distance < 1) {
    return { dx: 0, dy: 0 };
  }

  // Cubic tension curve: gentle at edge, snaps together when very close
  // This creates the "liquid drops merging" feel
  const normalizedDistance = distance / OIL_DROP_CONFIG.tensionRadius;
  const cubicTension = Math.pow(1 - normalizedDistance, 3);
  const tension = cubicTension * OIL_DROP_CONFIG.tensionStrength * 1.5; // Increased strength

  // Normalize direction and apply tension
  const nx = (dx / distance) * tension;
  const ny = (dy / distance) * tension;

  return { dx: nx, dy: ny };
}

/**
 * Create the SVG goo filter definition
 */
function createGooFilterSvg(): string {
  return `
    <svg style="position:absolute;width:0;height:0;pointer-events:none">
      <defs>
        <filter id="liquid-merge-goo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 18 -7"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  `;
}

/**
 * Create a proxy pill element that matches the original
 */
function createProxyPill(rect: DOMRect, color: string, element: HTMLElement): HTMLElement {
  const proxy = document.createElement('div');
  proxy.className = 'liquid-merge-pill';

  // Get computed styles from original element for backdrop-filter effect
  const computed = getComputedStyle(element);
  const bgColor = computed.backgroundColor;
  const hasBackdrop = computed.backdropFilter !== 'none';

  proxy.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border-radius: 999px;
    background: ${bgColor !== 'rgba(0, 0, 0, 0)' ? bgColor : color};
    ${hasBackdrop ? `backdrop-filter: ${computed.backdropFilter};` : ''}
    will-change: transform, left, top;
    pointer-events: none;
  `;

  return proxy;
}

/**
 * Create the overlay container with goo filter
 */
function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'liquid-merge-overlay';
  overlay.innerHTML = createGooFilterSvg();

  const shapesContainer = document.createElement('div');
  shapesContainer.className = 'liquid-merge-shapes';
  overlay.appendChild(shapesContainer);

  return overlay;
}

/**
 * Animate liquid merge effect with soft-body deformation
 *
 * Pills squish on the contact side and bulge perpendicular as they approach,
 * like water droplets pressing together before merging.
 *
 * @param config - Merge configuration with source/target elements and positions
 * @returns Promise that resolves when animation completes
 */
export async function animateLiquidMerge(config: LiquidMergeConfig): Promise<void> {
  const { source, target, midpoint, mode, duration = 300, onComplete } = config;

  // Skip animation if reduced motion is preferred
  if (prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const colors = MODE_COLORS[mode] || MODE_COLORS.chain;

  // Create overlay and append to body
  const overlay = createOverlay();
  document.body.appendChild(overlay);

  const shapesContainer = overlay.querySelector('.liquid-merge-shapes') as HTMLDivElement;

  // Create proxy pills
  const sourcePill = createProxyPill(source.rect, colors.fill, source.element);
  const targetPill = createProxyPill(target.rect, colors.fill, target.element);

  shapesContainer.appendChild(sourcePill);
  shapesContainer.appendChild(targetPill);

  // Hide original pills
  const sourceOriginalOpacity = source.element.style.opacity;
  const targetOriginalOpacity = target.element.style.opacity;
  source.element.style.opacity = '0';
  target.element.style.opacity = '0';

  // Calculate target positions (centered at midpoint)
  const sourceTargetLeft = midpoint.x - source.rect.width / 2;
  const sourceTargetTop = midpoint.y - source.rect.height / 2;
  const targetTargetLeft = midpoint.x - target.rect.width / 2;
  const targetTargetTop = midpoint.y - target.rect.height / 2;

  // Spring physics for position - use oil-drop config for liquid feel
  const { springStiffness, springDamping } = OIL_DROP_CONFIG;

  const sourceX = new LiquidSpring(source.rect.left, springStiffness, springDamping);
  const sourceY = new LiquidSpring(source.rect.top, springStiffness, springDamping);
  const targetX = new LiquidSpring(target.rect.left, springStiffness, springDamping);
  const targetY = new LiquidSpring(target.rect.top, springStiffness, springDamping);

  sourceX.setTarget(sourceTargetLeft);
  sourceY.setTarget(sourceTargetTop);
  targetX.setTarget(targetTargetLeft);
  targetY.setTarget(targetTargetTop);

  // Track current deformation for smoothing
  let sourceSquish = 1;
  let sourceBulge = 1;
  let targetSquish = 1;
  let targetBulge = 1;

  try {
    // Phase 1: Move pills together with soft-body deformation
    await new Promise<void>((resolve) => {
      let frameId: number;
      const maxFrames = Math.ceil((duration / 1000) * 60 * 2.5); // ~2.5x duration at 60fps
      let frameCount = 0;

      function tick() {
        frameCount++;

        // Calculate current centers before spring update
        const sourceCenterX = sourceX.get() + source.rect.width / 2;
        const sourceCenterY = sourceY.get() + source.rect.height / 2;
        const targetCenterX = targetX.get() + target.rect.width / 2;
        const targetCenterY = targetY.get() + target.rect.height / 2;

        // Apply surface tension - pills attract each other like oil drops
        const tension = calculateSurfaceTension(
          { x: sourceCenterX, y: sourceCenterY },
          { x: targetCenterX, y: targetCenterY }
        );
        sourceX.addVelocity(tension.dx * 0.5);
        sourceY.addVelocity(tension.dy * 0.5);
        targetX.addVelocity(-tension.dx * 0.5);
        targetY.addVelocity(-tension.dy * 0.5);

        // Update spring positions
        const sx = sourceX.update();
        const sy = sourceY.update();
        const tx = targetX.update();
        const ty = targetY.update();

        // Calculate centers for distance/angle
        const sourceCenter = {
          x: sx + source.rect.width / 2,
          y: sy + source.rect.height / 2,
        };
        const targetCenter = {
          x: tx + target.rect.width / 2,
          y: ty + target.rect.height / 2,
        };

        // Calculate distance and deformation
        const distance = getDistance(sourceCenter, targetCenter);
        const { squish, bulge } = calculateDeformation(distance);

        // Smooth deformation transitions
        const smooth = DEFORM_CONFIG.smoothing;
        sourceSquish += (squish - sourceSquish) * smooth;
        sourceBulge += (bulge - sourceBulge) * smooth;
        targetSquish += (squish - targetSquish) * smooth;
        targetBulge += (bulge - targetBulge) * smooth;

        // Calculate angles - each pill squishes toward the other
        const sourceAngle = getAngle(sourceCenter, targetCenter);
        const targetAngle = getAngle(targetCenter, sourceCenter);

        // Apply positions
        sourcePill.style.left = `${sx}px`;
        sourcePill.style.top = `${sy}px`;
        targetPill.style.left = `${tx}px`;
        targetPill.style.top = `${ty}px`;

        // Apply deformation transforms
        applyDeformation(sourcePill, sourceAngle, sourceSquish, sourceBulge);
        applyDeformation(targetPill, targetAngle, targetSquish, targetBulge);

        // Check if settled or max frames reached
        const settled =
          sourceX.isSettled() && sourceY.isSettled() && targetX.isSettled() && targetY.isSettled();

        if (settled || frameCount >= maxFrames) {
          cancelAnimationFrame(frameId);
          resolve();
        } else {
          frameId = requestAnimationFrame(tick);
        }
      }

      frameId = requestAnimationFrame(tick);
    });

    // Phase 2: Merge blob effect with wobble settle, then fade
    await animate(
      shapesContainer,
      {
        scale: [1, 1.12, 0.95, 1.02, 0],
        opacity: [1, 1, 1, 0.8, 0],
      },
      {
        duration: OIL_DROP_CONFIG.settleDuration + OIL_DROP_CONFIG.mergeDuration,
        easing: 'ease-out',
      }
    );
  } catch {
    // Animation was interrupted - clean up silently
  }

  // Cleanup
  overlay.remove();

  // Restore original pills (they'll be replaced by combined pill)
  source.element.style.opacity = sourceOriginalOpacity || '';
  target.element.style.opacity = targetOriginalOpacity || '';

  onComplete?.();
}

/**
 * Check if liquid merge animation is enabled
 * Returns false if reduced motion is preferred
 */
export function isLiquidMergeEnabled(): boolean {
  return !prefersReducedMotion();
}

// Export deformation utilities for collision physics
export { calculateDeformation, applyDeformation, getAngle, getDistance, DEFORM_CONFIG };
