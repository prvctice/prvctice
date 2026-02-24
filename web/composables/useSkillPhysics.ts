/**
 * Skill Physics - Multi-zone magnetic attraction system
 *
 * Phase 3: Extends the single-target magnet.ts to support multiple drop zones.
 * Pills can now magnetically snap to any registered zone, not just the input bar.
 *
 * Key features:
 * - Multiple simultaneous zone detection
 * - Per-zone magnetic radius and snap strength
 * - Proximity-based visual feedback
 * - Smooth transitions between zones
 * - Backwards compatible with existing makeMagnetic behavior
 *
 * Based on docs/SKILLS_EVOLUTION.md specification
 */

import { ref, computed, readonly, type Ref, type ComputedRef } from 'vue';
import type { ZoneDefinition, SkillV2, CombineMode } from '@web/types/skills';
import { useSkillCoordinator } from './useSkillCoordinator';
import { useEventBus } from '@web/services/eventBus';
import {
  animateLiquidMerge,
  isLiquidMergeEnabled,
  calculateDeformation,
  applyDeformation,
} from '@web/utils/liquidMerge';
import { debugWarn } from '@web/utils/debugLog';
import { prefersReducedMotion } from '@web/composables/useMotion';
import { useRippleConsumerOptional, type RippleEffectContext } from './useRippleEffect';

// ==================== TYPES ====================

/** Position in screen coordinates */
export interface Position {
  x: number;
  y: number;
}

/** Rectangle in screen coordinates */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** State of a pill being dragged */
export interface DragState {
  /** Skill being dragged */
  skill: SkillV2;
  /** Current pill element */
  element: HTMLElement;
  /** Current position */
  position: Position;
  /** Offset from cursor to pill origin */
  offset: Position;
  /** Whether drag has started (past threshold) */
  isDragging: boolean;
  /** Start position for threshold detection */
  startPosition: Position;
}

/** Zone proximity calculation result */
export interface ZoneProximity {
  /** Zone definition */
  zone: ZoneDefinition;
  /** Distance to zone edge (0 if inside) */
  distance: number;
  /** Whether pill center is inside zone */
  isInside: boolean;
  /** Whether within magnetic radius */
  isNear: boolean;
  /** Normalized attraction strength (0-1) */
  attraction: number;
  /** Best snap point on/in zone */
  snapPoint: Position;
  /** Zone accepts this skill type */
  accepts: boolean;
}

/** Result of zone proximity detection */
export interface ProximityResult {
  /** All zones with proximity data, sorted by distance */
  zones: ZoneProximity[];
  /** Nearest zone that accepts the skill (if any) */
  nearestAccepting: ZoneProximity | null;
  /** Zone currently being targeted (within snap distance) */
  activeZone: ZoneProximity | null;
}

/** Physics configuration constants */
export interface PhysicsConfig {
  /** Default magnetic radius if zone doesn't specify (px) */
  defaultMagnetRadius: number;
  /** Default snap strength if zone doesn't specify (0-1) */
  defaultSnapStrength: number;
  /** Minimum drag distance to initiate drag (px) */
  dragThreshold: number;
  /** Snap distance for auto-attach (px) */
  snapDistance: number;
  /** Animation duration for snap (ms) */
  snapDuration: number;
  /** Easing function for snap animation */
  snapEasing: string;
}

/** Combination physics constants from spec */
export interface CombinationPhysics {
  /** Distance to start showing merge preview (px) */
  proximityDetect: number;
  /** Distance when pills are "touching" (px) */
  proximityReady: number;
  /** Time to hold for auto-combine (ms) */
  holdDuration: number;
  /** Opacity of proximity glow (0-1) */
  glowIntensity: number;
  /** Width of connector line (px) */
  connectorWidth: number;
  /** Duration of merge animation (ms) */
  mergeDuration: number;
  /** Duration of separate animation (ms) */
  separateDuration: number;
}

/** Pill proximity state during drag */
export interface PillProximity {
  /** The other pill being approached */
  pillId: string;
  /** Distance between pill centers */
  distance: number;
  /** Whether within detect range */
  isDetected: boolean;
  /** Whether within ready range (touching) */
  isReady: boolean;
  /** Midpoint between the two pills */
  midpoint: Position;
  /** Position of the other pill */
  otherPosition: Position;
  /** Combine mode if compatible */
  combineMode: CombineMode | false;
}

/** State for combination preview */
export interface CombinationPreviewState {
  /** Source pill being dragged */
  sourcePill: {
    id: string;
    position: Position;
    rect: Rect;
  } | null;
  /** Target pill being approached */
  targetPill: {
    id: string;
    position: Position;
    rect: Rect;
  } | null;
  /** Current proximity data */
  proximity: PillProximity | null;
  /** Hold timer progress (0-1) */
  holdProgress: number;
  /** Whether currently showing preview */
  isShowingPreview: boolean;
}

/** Magnetic attachment state */
export interface AttachmentState {
  /** Zone the pill is attached to */
  zone: ZoneDefinition | null;
  /** Snap position */
  snapPoint: Position | null;
  /** Edge attached to ('top' | 'bottom' | 'center') */
  edge: 'top' | 'bottom' | 'center';
}

/** Collision physics configuration */
export interface CollisionConfig {
  /** Extra padding beyond pill edges before collision (px) */
  edgePadding: number;
  /** Whether collision physics is enabled */
  enabled: boolean;
}

/** Collision state for all pills - deformation only, no pushing */
export interface CollisionState {
  /** Currently applied deformations (pill ID -> squish/bulge/angle) */
  deformations: Map<string, { squish: number; bulge: number; angle: number }>;
}

// ==================== GENERIC DRAGGABLE TYPES ====================

/** Generic draggable element configuration */
export interface DraggableConfig {
  id: string;
  element: HTMLElement;
  type: 'pill' | 'widget' | 'bar';
  skill?: SkillV2; // Only for pills
  axis?: 'x' | 'y' | 'both'; // Movement constraint (bar is 'y' only)
  canSnapToZones?: boolean; // Default true for pills
  magneticTargets?: string[]; // CSS selectors this can snap to
}

/** Generic drag state */
export interface GenericDragState {
  id: string;
  element: HTMLElement;
  type: 'pill' | 'widget' | 'bar';
  skill?: SkillV2;
  position: Position;
  offset: Position;
  isDragging: boolean;
  startPosition: Position;
  axis: 'x' | 'y' | 'both';
  magneticTargets: string[];
}

/** Result from updating generic drag position */
export interface GenericDragUpdateResult {
  position: Position;
  magneticPull: Position | null;
  nearestTarget: { selector: string; element: Element; distance: number } | null;
}

/** Result from ending a generic drag */
export interface GenericDragEndResult {
  finalPosition: Position;
  snappedTo: string | null;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: PhysicsConfig = {
  defaultMagnetRadius: 80,
  defaultSnapStrength: 0.8,
  dragThreshold: 5,
  snapDistance: 60,
  snapDuration: 200,
  snapEasing: 'cubic-bezier(0.2, 0, 0, 1)',
};

/**
 * Liquid spring presets - Disney-quality fluid physics
 * Lower stiffness = slower, more liquid motion
 * Higher damping = less oscillation, smoother settle
 */
const LIQUID_SPRING_PRESETS = {
  /** Drag follow - responsive but fluid */
  drag: { stiffness: 0.05, damping: 0.72 },
  /** Settle after drop - languid, gravity-influenced */
  settle: { stiffness: 0.025, damping: 0.78 },
  /** Magnetic attraction - gentle pull */
  magnetic: { stiffness: 0.04, damping: 0.7 },
  /** Merge approach - already tuned in liquidMerge.ts */
  merge: { stiffness: 0.018, damping: 0.72 },
} as const;

/** Spring configuration for magnetic zones - liquid feel */
const MAGNETIC_SPRING_CONFIG = {
  ...LIQUID_SPRING_PRESETS.magnetic,
  velocityThreshold: 0.08, // Lower for smoother stopping
  positionThreshold: 0.3, // Tighter settle
};

/** Velocity state for spring-based magnetic attraction */
const magneticVelocity: Position = { x: 0, y: 0 };

/** Default combination physics values from spec */
const DEFAULT_COMBINATION_PHYSICS: CombinationPhysics = {
  proximityDetect: 100, // start showing merge preview
  proximityReady: 50, // pills are "touching"
  holdDuration: 500, // ms to hold for auto-combine
  glowIntensity: 0.6,
  connectorWidth: 2,
  mergeDuration: 720, // 20% slower for languid liquid feel
  separateDuration: 200,
};

/** Default collision physics configuration */
const DEFAULT_COLLISION_CONFIG: CollisionConfig = {
  edgePadding: 8, // small buffer before visual edges touch
  enabled: true,
};

// ==================== SINGLETON STATE ====================

/** Current drag state (if any) */
const dragState: Ref<DragState | null> = ref(null);

/** Current proximity result */
const proximityResult: Ref<ProximityResult | null> = ref(null);

/** Current attachment state */
const attachmentState: Ref<AttachmentState> = ref({
  zone: null,
  snapPoint: null,
  edge: 'center',
});

/** Physics configuration (can be customized) */
const config: Ref<PhysicsConfig> = ref({ ...DEFAULT_CONFIG });

/** Whether physics system is enabled */
const enabled: Ref<boolean> = ref(true);

/** Combination physics configuration */
const combinationConfig: Ref<CombinationPhysics> = ref({ ...DEFAULT_COMBINATION_PHYSICS });

/** Current combination preview state */
const combinationPreview: Ref<CombinationPreviewState> = ref({
  sourcePill: null,
  targetPill: null,
  proximity: null,
  holdProgress: 0,
  isShowingPreview: false,
});

/** Registered pill elements for proximity detection */
const registeredPills: Map<string, { element: HTMLElement; skill: SkillV2 }> = new Map();

/** Hold timer for auto-combine */
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let holdStartTime = 0;

/** Collision physics configuration */
const collisionConfig: Ref<CollisionConfig> = ref({ ...DEFAULT_COLLISION_CONFIG });

/** Collision state tracking - deformation only */
const collisionState: CollisionState = {
  deformations: new Map(),
};

// ==================== GENERIC DRAGGABLE STATE ====================

/** Registry of generic draggable elements (not pills) */
const genericDraggables: Map<string, DraggableConfig> = new Map();

/** Current generic drag state */
const genericDragState: Ref<GenericDragState | null> = ref(null);

/** Velocity state for generic magnetic attraction */
const genericMagneticVelocity: Position = { x: 0, y: 0 };

/** Animation frame ID for collision physics loop */
let collisionAnimationFrame: number | null = null;

/** Optional ripple context for edge bounce effects */
let rippleContext: RippleEffectContext | null = null;

/** Viewport edge detection configuration */
const EDGE_DETECTION_CONFIG = {
  /** Margin from viewport edge to trigger edge event (px) */
  margin: 8,
  /** Minimum intensity threshold to emit ripple */
  minIntensity: 0.1,
};

/** Position tracking for velocity estimation in edge detection */
const dragPositionTracker = {
  previousPosition: null as Position | null,
  previousTime: 0,
};

// ==================== GEOMETRY HELPERS ====================

/**
 * Get the bounding rect for a zone element
 */
function getZoneRect(zone: ZoneDefinition): Rect | null {
  if (!zone.element) return null;

  const element =
    typeof zone.element === 'string' ? document.querySelector(zone.element) : zone.element;

  if (!element) return null;

  const domRect = element.getBoundingClientRect();
  return {
    x: domRect.left,
    y: domRect.top,
    width: domRect.width,
    height: domRect.height,
  };
}

/**
 * Get center point of a rect
 */
function getRectCenter(rect: Rect): Position {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

/**
 * Check if a point is inside a rect
 */
function isPointInRect(point: Position, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Calculate distance from a point to the nearest edge of a rect
 * Returns 0 if point is inside the rect
 */
function distanceToRect(point: Position, rect: Rect): number {
  if (isPointInRect(point, rect)) return 0;

  // Clamp point to rect bounds to find nearest point on rect
  const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));

  return Math.sqrt(Math.pow(point.x - nearestX, 2) + Math.pow(point.y - nearestY, 2));
}

/** Edge where viewport collision occurred */
type ViewportEdge = 'top' | 'bottom' | 'left' | 'right';

/** State tracking for edge collision detection to prevent repeat triggers */
const edgeCollisionState = {
  lastEdge: null as ViewportEdge | null,
  lastTriggerTime: 0,
  /** Minimum ms between ripple triggers on same edge */
  cooldown: 100,
};

/**
 * Check if a pill rect is touching viewport edges and trigger ripple if applicable.
 * Uses velocity estimation from position delta for intensity calculation.
 */
function checkViewportEdgeCollision(
  pillRect: Rect,
  previousPosition: Position | null,
  deltaTime: number
): void {
  if (!rippleContext || prefersReducedMotion()) return;

  const { margin, minIntensity } = EDGE_DETECTION_CONFIG;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const now = performance.now();

  // Calculate velocity-based intensity if we have previous position
  let velocityMagnitude = 0;
  if (previousPosition && deltaTime > 0) {
    const dx = pillRect.x - previousPosition.x;
    const dy = pillRect.y - previousPosition.y;
    velocityMagnitude = (Math.sqrt(dx * dx + dy * dy) / deltaTime) * 16.67; // Normalize to 60fps
  }

  // Intensity based on velocity (clamped 0-1)
  const maxVelocity = 30;
  const intensity = Math.min(1, velocityMagnitude / maxVelocity);

  if (intensity < minIntensity) return;

  // Check each edge
  let triggeredEdge: ViewportEdge | null = null;
  let rippleX = 0;
  let rippleY = 0;

  // Left edge
  if (pillRect.x <= margin) {
    triggeredEdge = 'left';
    rippleX = 0;
    rippleY = pillRect.y + pillRect.height / 2;
  }
  // Right edge
  else if (pillRect.x + pillRect.width >= vw - margin) {
    triggeredEdge = 'right';
    rippleX = vw;
    rippleY = pillRect.y + pillRect.height / 2;
  }
  // Top edge
  else if (pillRect.y <= margin) {
    triggeredEdge = 'top';
    rippleX = pillRect.x + pillRect.width / 2;
    rippleY = 0;
  }
  // Bottom edge
  else if (pillRect.y + pillRect.height >= vh - margin) {
    triggeredEdge = 'bottom';
    rippleX = pillRect.x + pillRect.width / 2;
    rippleY = vh;
  }

  // Trigger ripple if we hit an edge (with cooldown to prevent spam)
  if (triggeredEdge) {
    const sameEdge = triggeredEdge === edgeCollisionState.lastEdge;
    const onCooldown = now - edgeCollisionState.lastTriggerTime < edgeCollisionState.cooldown;

    if (!sameEdge || !onCooldown) {
      rippleContext.triggerRipple(rippleX, rippleY, intensity);
      edgeCollisionState.lastEdge = triggeredEdge;
      edgeCollisionState.lastTriggerTime = now;
    }
  } else {
    // Reset edge state when not touching any edge
    edgeCollisionState.lastEdge = null;
  }
}

/**
 * Calculate the best snap point for a pill relative to a zone
 * Considers zone edge preference and pill dimensions
 */
function calculateSnapPoint(
  pillRect: Rect,
  zoneRect: Rect,
  zone: ZoneDefinition
): { point: Position; edge: 'top' | 'bottom' | 'center' } {
  // If zone has custom getMagnetPoint, use it
  if (zone.getMagnetPoint) {
    const customPoint = zone.getMagnetPoint(
      new DOMRect(zoneRect.x, zoneRect.y, zoneRect.width, zoneRect.height),
      new DOMRect(pillRect.x, pillRect.y, pillRect.width, pillRect.height)
    );
    return { point: customPoint, edge: 'center' };
  }

  // Default: snap to center-top of zone, pill at bottom
  const zoneCenter = getRectCenter(zoneRect);

  // Compute top/bottom from y/height
  const pillBottom = pillRect.y + pillRect.height;
  const zoneTop = zoneRect.y;
  const pillTop = pillRect.y;
  const zoneBottom = zoneRect.y + zoneRect.height;

  // Determine if we should snap to top or bottom edge of zone
  const distToTop = Math.abs(pillBottom - zoneTop);
  const distToBottom = Math.abs(pillTop - zoneBottom);

  if (distToTop < distToBottom) {
    // Snap pill bottom to zone top
    return {
      point: {
        x: zoneCenter.x - pillRect.width / 2,
        y: zoneTop - pillRect.height,
      },
      edge: 'top',
    };
  } else {
    // Snap pill top to zone bottom
    return {
      point: {
        x: zoneCenter.x - pillRect.width / 2,
        y: zoneBottom,
      },
      edge: 'bottom',
    };
  }
}

// ==================== PROXIMITY DETECTION ====================

/**
 * Calculate proximity data for all registered zones
 */
function calculateProximity(pillRect: Rect, skill: SkillV2): ProximityResult {
  const coordinator = useSkillCoordinator();
  const zones = coordinator.listZones();
  const pillCenter = getRectCenter(pillRect);

  const proximities: ZoneProximity[] = [];

  for (const zone of zones) {
    const zoneRect = getZoneRect(zone);
    if (!zoneRect) continue;

    const distance = distanceToRect(pillCenter, zoneRect);
    const isInside = distance === 0;
    const magnetRadius = zone.magnetRadius ?? config.value.defaultMagnetRadius;
    const snapStrength = zone.snapStrength ?? config.value.defaultSnapStrength;
    const isNear = distance < magnetRadius;
    const accepts = zone.accepts.includes(skill.type);

    // Calculate attraction strength (1 at distance 0, decreasing to 0 at magnetRadius)
    let attraction = 0;
    if (isNear && accepts) {
      attraction = Math.max(0, 1 - distance / magnetRadius) * snapStrength;
    }

    const { point: snapPoint } = calculateSnapPoint(pillRect, zoneRect, zone);

    proximities.push({
      zone,
      distance,
      isInside,
      isNear,
      attraction,
      snapPoint,
      accepts,
    });
  }

  // Sort by distance (nearest first)
  proximities.sort((a, b) => a.distance - b.distance);

  // Find nearest accepting zone
  const nearestAccepting = proximities.find((p) => p.accepts && p.isNear) || null;

  // Active zone is one we're close enough to snap to
  const activeZone =
    nearestAccepting && nearestAccepting.distance < config.value.snapDistance
      ? nearestAccepting
      : null;

  return {
    zones: proximities,
    nearestAccepting,
    activeZone,
  };
}

// ==================== DRAG HANDLING ====================

/**
 * Start tracking a drag operation
 */
function startDrag(
  skill: SkillV2,
  element: HTMLElement,
  startPosition: Position,
  offset: Position
): void {
  dragState.value = {
    skill,
    element,
    position: startPosition,
    offset,
    isDragging: false,
    startPosition,
  };

  // Add dragging class
  element.classList.add('skill-dragging');
}

/**
 * Update drag position and calculate proximity
 */
function updateDrag(currentPosition: Position): ProximityResult | null {
  if (!dragState.value || !enabled.value) return null;

  const state = dragState.value;
  const now = performance.now();

  // Check if we've passed the drag threshold
  if (!state.isDragging) {
    const dx = currentPosition.x - state.startPosition.x;
    const dy = currentPosition.y - state.startPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < config.value.dragThreshold) {
      return null;
    }

    state.isDragging = true;
    state.element.classList.add('skill-drag-active');
    // Initialize position tracking when drag starts
    dragPositionTracker.previousPosition = { ...currentPosition };
    dragPositionTracker.previousTime = now;
  }

  // Update position
  state.position = currentPosition;

  // Get pill dimensions
  const pillRect: Rect = {
    x: currentPosition.x - state.offset.x,
    y: currentPosition.y - state.offset.y,
    width: state.element.offsetWidth,
    height: state.element.offsetHeight,
  };

  // Check for viewport edge collisions and trigger ripple
  const deltaTime = now - dragPositionTracker.previousTime;
  if (deltaTime > 0) {
    checkViewportEdgeCollision(pillRect, dragPositionTracker.previousPosition, deltaTime);
  }

  // Update position tracker for next frame
  dragPositionTracker.previousPosition = { x: pillRect.x, y: pillRect.y };
  dragPositionTracker.previousTime = now;

  // Calculate proximity to all zones
  const result = calculateProximity(pillRect, state.skill);
  proximityResult.value = result;

  // Update attachment state
  if (result.activeZone) {
    attachmentState.value = {
      zone: result.activeZone.zone,
      snapPoint: result.activeZone.snapPoint,
      edge: 'center', // Will be refined in calculateSnapPoint
    };

    // Notify zone of enter
    if (result.activeZone.zone.onEnter) {
      result.activeZone.zone.onEnter(state.skill, currentPosition);
    }
  } else if (attachmentState.value.zone) {
    // Notify previous zone of leave
    const previousZone = attachmentState.value.zone;
    if (previousZone.onLeave) {
      previousZone.onLeave(state.skill);
    }

    attachmentState.value = {
      zone: null,
      snapPoint: null,
      edge: 'center',
    };
  }

  return result;
}

/**
 * End drag operation and optionally drop on zone
 */
async function endDrag(): Promise<{
  dropped: boolean;
  zone: ZoneDefinition | null;
}> {
  if (!dragState.value) {
    return { dropped: false, zone: null };
  }

  const state = dragState.value;
  const result = proximityResult.value;

  // Clean up classes
  state.element.classList.remove('skill-dragging', 'skill-drag-active');

  // Check if we should drop on a zone
  if (result?.activeZone && state.isDragging) {
    const zone = result.activeZone.zone;
    const coordinator = useSkillCoordinator();

    try {
      // Get execution context
      const ctx = coordinator.getContext();

      // Call zone's onDrop handler
      const dropResult = await zone.onDrop(state.skill, ctx);

      // Clear state and reset magnetic velocity
      dragState.value = null;
      proximityResult.value = null;
      attachmentState.value = { zone: null, snapPoint: null, edge: 'center' };
      resetMagneticVelocity();
      resetDragPositionTracker();

      return { dropped: dropResult.success, zone };
    } catch (err) {
      debugWarn('skills', 'physics:drop', err instanceof Error ? err : String(err));
    }
  }

  // Clear state and reset magnetic velocity
  dragState.value = null;
  proximityResult.value = null;
  attachmentState.value = { zone: null, snapPoint: null, edge: 'center' };
  resetMagneticVelocity();
  resetDragPositionTracker();

  return { dropped: false, zone: null };
}

/**
 * Reset position tracker state (call when drag ends)
 */
function resetDragPositionTracker(): void {
  dragPositionTracker.previousPosition = null;
  dragPositionTracker.previousTime = 0;
  edgeCollisionState.lastEdge = null;
  edgeCollisionState.lastTriggerTime = 0;
}

/**
 * Cancel drag without dropping
 */
function cancelDrag(): void {
  if (dragState.value) {
    const state = dragState.value;
    state.element.classList.remove('skill-dragging', 'skill-drag-active');

    // Notify zone of leave if attached
    if (attachmentState.value.zone?.onLeave) {
      attachmentState.value.zone.onLeave(state.skill);
    }
  }

  dragState.value = null;
  proximityResult.value = null;
  attachmentState.value = { zone: null, snapPoint: null, edge: 'center' };
  resetDragPositionTracker();
}

// ==================== MAGNETIC SNAP ====================

/**
 * Apply spring-based magnetic attraction to a position
 * Returns smoothly interpolated position with velocity for organic feel
 */
function applyMagneticAttraction(position: Position, pillRect: Rect, skill: SkillV2): Position {
  if (!enabled.value) return position;

  const result = calculateProximity(pillRect, skill);
  const nearest = result.nearestAccepting;

  if (!nearest || nearest.attraction === 0) {
    // Decay velocity when no target
    magneticVelocity.x *= 0.9;
    magneticVelocity.y *= 0.9;
    return position;
  }

  // Skip spring animation for reduced motion — instant snap
  if (prefersReducedMotion()) {
    return nearest.snapPoint;
  }

  const { stiffness, damping } = MAGNETIC_SPRING_CONFIG;

  // Calculate spring force toward snap point
  const dx = nearest.snapPoint.x - position.x;
  const dy = nearest.snapPoint.y - position.y;

  // Scale force by attraction strength for gradual engagement
  const forceX = dx * stiffness * nearest.attraction;
  const forceY = dy * stiffness * nearest.attraction;

  // Apply force to velocity
  magneticVelocity.x += forceX;
  magneticVelocity.y += forceY;

  // Apply damping for smooth settling
  magneticVelocity.x *= damping;
  magneticVelocity.y *= damping;

  // Update position with velocity
  return {
    x: position.x + magneticVelocity.x,
    y: position.y + magneticVelocity.y,
  };
}

/**
 * Reset magnetic velocity (call when drag ends)
 */
function resetMagneticVelocity(): void {
  magneticVelocity.x = 0;
  magneticVelocity.y = 0;
}

/**
 * Check if a position should trigger magnetic snap
 */
function shouldSnap(pillRect: Rect, skill: SkillV2): ZoneProximity | null {
  if (!enabled.value) return null;

  const result = calculateProximity(pillRect, skill);
  return result.activeZone;
}

// ==================== ZONE HIGHLIGHTING ====================

/**
 * Get zones that should be highlighted during a drag
 */
function getHighlightedZones(): ZoneDefinition[] {
  if (!dragState.value || !proximityResult.value) return [];

  return proximityResult.value.zones.filter((p) => p.accepts && p.isNear).map((p) => p.zone);
}

/**
 * Get the currently active (snap target) zone
 */
function getActiveZone(): ZoneDefinition | null {
  return attachmentState.value.zone;
}

// ==================== PILL COMBINATION ====================

/**
 * Register a pill element for proximity detection
 */
function registerPill(skill: SkillV2, element: HTMLElement): void {
  registeredPills.set(skill.id, { element, skill });
}

/**
 * Unregister a pill element
 */
function unregisterPill(skillId: string): void {
  registeredPills.delete(skillId);
}

/**
 * Get the skill associated with a registered pill
 */
function getRegisteredSkill(skillId: string): SkillV2 | null {
  return registeredPills.get(skillId)?.skill ?? null;
}

/**
 * Get the center position of an element
 */
function getElementCenter(element: HTMLElement): Position {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Get the rect of an element
 */
function getElementRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Calculate distance between two points
 */
function getDistance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate midpoint between two positions
 */
function getMidpoint(a: Position, b: Position): Position {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/**
 * Calculate pill proximity during drag
 * Returns the nearest pill that can be combined with
 * Only considers floating pills - pills in the tray cannot be merged with
 */
function calculatePillProximity(
  draggingPillId: string,
  draggingPosition: Position
): PillProximity | null {
  const draggingPill = registeredPills.get(draggingPillId);
  if (!draggingPill) return null;

  const coordinator = useSkillCoordinator();
  const draggingSkill = draggingPill.skill;

  let nearest: PillProximity | null = null;
  let nearestDistance = Infinity;

  for (const [pillId, pill] of registeredPills) {
    // Skip the pill being dragged
    if (pillId === draggingPillId) continue;

    // Skip pills that are in the tray (not floating)
    // Only floating pills can be merged with
    const isFloating =
      pill.element.classList.contains('skill-floating') ||
      (pill.element as HTMLElement & { _floating?: boolean })._floating === true;
    if (!isFloating) continue;

    const otherCenter = getElementCenter(pill.element);
    const distance = getDistance(draggingPosition, otherCenter);

    // Only consider if within detect range
    if (distance > combinationConfig.value.proximityDetect) continue;

    // Check if can combine
    const combineMode = coordinator.canCombine(draggingSkill, pill.skill);

    if (combineMode !== false && distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        pillId,
        distance,
        isDetected: distance <= combinationConfig.value.proximityDetect,
        isReady: distance <= combinationConfig.value.proximityReady,
        midpoint: getMidpoint(draggingPosition, otherCenter),
        otherPosition: otherCenter,
        combineMode,
      };
    }
  }

  return nearest;
}

/**
 * Update combination preview during drag
 */
function updateCombinationPreview(
  draggingPillId: string,
  draggingPosition: Position,
  draggingRect: Rect
): void {
  const draggingPill = registeredPills.get(draggingPillId);
  if (!draggingPill) {
    clearCombinationPreview();
    clearCollisionState();
    return;
  }

  // Update collision physics for all floating pills (skip deformation in reduced motion)
  if (!prefersReducedMotion()) {
    updateCollisionPhysics(draggingPillId, draggingPosition);
  }

  const pillProximity = calculatePillProximity(draggingPillId, draggingPosition);

  if (!pillProximity) {
    clearCombinationPreview();
    return;
  }

  const targetPill = registeredPills.get(pillProximity.pillId);
  if (!targetPill) {
    clearCombinationPreview();
    return;
  }

  combinationPreview.value = {
    sourcePill: {
      id: draggingPillId,
      position: draggingPosition,
      rect: draggingRect,
    },
    targetPill: {
      id: pillProximity.pillId,
      position: pillProximity.otherPosition,
      rect: getElementRect(targetPill.element),
    },
    proximity: pillProximity,
    holdProgress: combinationPreview.value.holdProgress,
    isShowingPreview: pillProximity.isDetected,
  };

  // Handle hold timer for auto-combine
  if (pillProximity.isReady) {
    if (!holdTimer) {
      holdStartTime = Date.now();
      startHoldTimer(draggingPillId, pillProximity.pillId, pillProximity.combineMode);
    } else {
      // Update hold progress
      const elapsed = Date.now() - holdStartTime;
      combinationPreview.value.holdProgress = Math.min(
        1,
        elapsed / combinationConfig.value.holdDuration
      );
    }
  } else {
    clearHoldTimer();
  }
}

/**
 * Start the hold timer for auto-combine
 */
function startHoldTimer(
  sourcePillId: string,
  targetPillId: string,
  combineMode: CombineMode | false
): void {
  if (combineMode === false) return;
  holdTimer = setTimeout(async () => {
    const sourceRegistration = registeredPills.get(sourcePillId);
    const targetRegistration = registeredPills.get(targetPillId);

    if (sourceRegistration && targetRegistration) {
      // Calculate positions for the new combined pill
      const sourceCenter = getElementCenter(sourceRegistration.element);
      const targetCenter = getElementCenter(targetRegistration.element);
      const midpoint = getMidpoint(sourceCenter, targetCenter);
      const sourceDomRect = sourceRegistration.element.getBoundingClientRect();
      const targetDomRect = targetRegistration.element.getBoundingClientRect();
      const sourceRect = getElementRect(sourceRegistration.element);
      const targetRect = getElementRect(targetRegistration.element);

      // Play liquid merge animation if enabled (skip in reduced motion)
      if (isLiquidMergeEnabled() && !prefersReducedMotion()) {
        await animateLiquidMerge({
          source: {
            element: sourceRegistration.element,
            rect: sourceDomRect,
          },
          target: {
            element: targetRegistration.element,
            rect: targetDomRect,
          },
          midpoint,
          mode: combineMode,
          duration: combinationConfig.value.mergeDuration,
        });
      }

      // Emit combine event with position data
      useEventBus().emit('skill:combine', {
        sourceId: sourcePillId,
        targetId: targetPillId,
        mode: combineMode,
        sourceSkill: sourceRegistration.skill,
        targetSkill: targetRegistration.skill,
        // Position data for spawning combined pill near the source pills
        midpoint,
        sourceRect,
        targetRect,
      });
    }

    clearCombinationPreview();
  }, combinationConfig.value.holdDuration);
}

/**
 * Clear the hold timer
 */
function clearHoldTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  holdStartTime = 0;
  if (combinationPreview.value.holdProgress > 0) {
    combinationPreview.value = {
      ...combinationPreview.value,
      holdProgress: 0,
    };
  }
}

/**
 * Clear combination preview state
 */
function clearCombinationPreview(): void {
  clearHoldTimer();
  combinationPreview.value = {
    sourcePill: null,
    targetPill: null,
    proximity: null,
    holdProgress: 0,
    isShowingPreview: false,
  };
  // Also clear collision state when preview is cleared (drag ended)
  clearCollisionState();
}

/**
 * Get current combination preview state
 */
function getCombinationPreview(): CombinationPreviewState {
  return combinationPreview.value;
}

// ==================== COLLISION PHYSICS ====================

/**
 * Calculate edge-to-edge collision between two pill capsules
 * Pills are treated as capsules (rounded rectangles) not circles.
 * Returns collision data if edges are overlapping, null otherwise.
 */
function calculateCapsuleCollision(
  draggedRect: Rect,
  stationaryRect: Rect,
  edgePadding: number
): { distance: number; angle: number } | null {
  // Calculate centers
  const draggedCenterX = draggedRect.x + draggedRect.width / 2;
  const draggedCenterY = draggedRect.y + draggedRect.height / 2;
  const stationaryCenterX = stationaryRect.x + stationaryRect.width / 2;
  const stationaryCenterY = stationaryRect.y + stationaryRect.height / 2;

  // Use half-widths for horizontal separation, half-heights for vertical
  // This creates capsule-like collision (elliptical approximation)
  const draggedHalfW = draggedRect.width / 2;
  const draggedHalfH = draggedRect.height / 2;
  const stationaryHalfW = stationaryRect.width / 2;
  const stationaryHalfH = stationaryRect.height / 2;

  // Vector between centers
  const dx = stationaryCenterX - draggedCenterX;
  const dy = stationaryCenterY - draggedCenterY;
  const centerDistance = Math.sqrt(dx * dx + dy * dy);

  if (centerDistance === 0) {
    // Exactly overlapping - use horizontal angle
    return { distance: 0, angle: 0 };
  }

  // Normalize direction
  const nx = dx / centerDistance;
  const ny = dy / centerDistance;

  // Calculate the edge-to-edge distance along the line connecting centers
  // For each pill, project its half-size onto the connection direction
  // This accounts for pill width vs height based on collision angle
  const draggedRadius = Math.abs(nx) * draggedHalfW + Math.abs(ny) * draggedHalfH;
  const stationaryRadius = Math.abs(nx) * stationaryHalfW + Math.abs(ny) * stationaryHalfH;

  // Combined radii = minimum center distance for edges to touch
  const combinedRadii = draggedRadius + stationaryRadius + edgePadding;

  // Edge-to-edge distance (negative = overlapping)
  const edgeDistance = centerDistance - combinedRadii;

  // No collision if edges don't touch
  if (edgeDistance > 0) {
    return null;
  }

  // Calculate angle for deformation direction
  const angle = Math.atan2(dy, dx);

  return {
    distance: centerDistance, // for deformation calculation
    angle,
  };
}

/**
 * Apply deformation CSS to an element
 * Rotates to contact axis, scales, rotates back
 */
function applyCollisionDeformation(
  element: HTMLElement,
  pillId: string,
  angle: number,
  squish: number,
  bulge: number
): void {
  // Store deformation state
  collisionState.deformations.set(pillId, { squish, bulge, angle });

  // Use the applyDeformation from liquidMerge
  applyDeformation(element, angle, squish, bulge);
}

/**
 * Clear deformation from an element
 */
function clearCollisionDeformation(element: HTMLElement, pillId: string): void {
  const hadDeformation = collisionState.deformations.has(pillId);
  collisionState.deformations.delete(pillId);

  if (hadDeformation) {
    element.style.transform = '';
    element.style.transformOrigin = '';
    element.style.borderRadius = '';
  }
}

/**
 * Process collision physics for all floating pills
 * Called during drag updates.
 *
 * Oil-drop behavior: pills stick together and deform at contact point.
 * No bouncing or pushing - just visual squish/bulge deformation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function updateCollisionPhysics(draggingPillId: string, _draggedPosition: Position): void {
  if (!collisionConfig.value.enabled) return;

  const { edgePadding } = collisionConfig.value;

  // Get the dragged pill element and rect
  const draggedPill = registeredPills.get(draggingPillId);
  if (!draggedPill) return;

  const draggedRect = getElementRect(draggedPill.element);
  let closestCollision: { pillId: string; distance: number; angle: number } | null = null;

  // Check collision with each floating pill
  for (const [pillId, pill] of registeredPills) {
    if (pillId === draggingPillId) continue;

    // Only process floating pills
    const isFloating =
      pill.element.classList.contains('skill-floating') ||
      (pill.element as HTMLElement & { _floating?: boolean })._floating === true;
    if (!isFloating) {
      // Clear any deformation on non-floating pills
      clearCollisionDeformation(pill.element, pillId);
      continue;
    }

    const stationaryRect = getElementRect(pill.element);
    const collision = calculateCapsuleCollision(draggedRect, stationaryRect, edgePadding);

    if (collision) {
      // --- Edges are touching - apply oil-drop deformation ---

      // Track closest for dragged pill deformation
      if (!closestCollision || collision.distance < closestCollision.distance) {
        closestCollision = {
          pillId,
          distance: collision.distance,
          angle: collision.angle,
        };
      }

      // Calculate deformation based on center distance
      const { squish, bulge } = calculateDeformation(collision.distance);

      // Apply deformation - stationary pill squishes toward dragged pill
      // Angle is from dragged to stationary, so stationary deforms toward dragged
      applyCollisionDeformation(pill.element, pillId, collision.angle + Math.PI, squish, bulge);
    } else {
      // No collision - fade out deformation smoothly
      const existingDeform = collisionState.deformations.get(pillId);
      if (existingDeform) {
        // Interpolate back to normal
        const newSquish = existingDeform.squish + (1 - existingDeform.squish) * 0.15;
        const newBulge = existingDeform.bulge + (1 - existingDeform.bulge) * 0.15;

        if (Math.abs(1 - newSquish) < 0.01 && Math.abs(1 - newBulge) < 0.01) {
          clearCollisionDeformation(pill.element, pillId);
        } else {
          applyCollisionDeformation(
            pill.element,
            pillId,
            existingDeform.angle,
            newSquish,
            newBulge
          );
        }
      }
    }
  }

  // Apply deformation to dragged pill based on closest collision
  if (closestCollision) {
    const { squish, bulge } = calculateDeformation(closestCollision.distance);
    applyCollisionDeformation(
      draggedPill.element,
      draggingPillId,
      closestCollision.angle,
      squish,
      bulge
    );
  } else {
    // No collision - fade out deformation on dragged pill
    const existingDeform = collisionState.deformations.get(draggingPillId);
    if (existingDeform) {
      const newSquish = existingDeform.squish + (1 - existingDeform.squish) * 0.15;
      const newBulge = existingDeform.bulge + (1 - existingDeform.bulge) * 0.15;

      if (Math.abs(1 - newSquish) < 0.01 && Math.abs(1 - newBulge) < 0.01) {
        clearCollisionDeformation(draggedPill.element, draggingPillId);
      } else {
        applyCollisionDeformation(
          draggedPill.element,
          draggingPillId,
          existingDeform.angle,
          newSquish,
          newBulge
        );
      }
    }
  }
}

/**
 * Clear all collision state and reset pill transforms
 */
function clearCollisionState(): void {
  // Clear deformations - smoothly animate back to normal
  for (const [pillId] of collisionState.deformations) {
    const pill = registeredPills.get(pillId);
    if (pill) {
      // Add transition for smooth return to normal shape
      pill.element.style.transition =
        'transform 0.2s cubic-bezier(0.2, 0, 0, 1), border-radius 0.2s cubic-bezier(0.2, 0, 0, 1)';
      pill.element.style.transform = '';
      pill.element.style.transformOrigin = '';
      pill.element.style.borderRadius = '';
      // Clean up transition after animation
      setTimeout(() => {
        if (pill.element) {
          pill.element.style.transition = '';
        }
      }, 200);
    }
  }
  collisionState.deformations.clear();

  // Cancel animation frame if any
  if (collisionAnimationFrame !== null) {
    cancelAnimationFrame(collisionAnimationFrame);
    collisionAnimationFrame = null;
  }
}

/**
 * Update collision configuration
 */
function setCollisionConfig(updates: Partial<CollisionConfig>): void {
  collisionConfig.value = { ...collisionConfig.value, ...updates };
}

/**
 * Update combination physics configuration
 */
function setCombinationConfig(updates: Partial<CombinationPhysics>): void {
  combinationConfig.value = { ...combinationConfig.value, ...updates };
}

// ==================== GENERIC DRAGGABLE SUPPORT ====================

/**
 * Register any element as draggable (widgets, InputBar, etc.)
 */
function registerDraggable(config: DraggableConfig): void {
  genericDraggables.set(config.id, config);
}

/**
 * Unregister a draggable element
 */
function unregisterDraggable(id: string): void {
  genericDraggables.delete(id);
  if (genericDragState.value?.id === id) {
    genericDragState.value = null;
  }
}

/**
 * Get a registered draggable config by ID
 */
function getDraggable(id: string): DraggableConfig | undefined {
  return genericDraggables.get(id);
}

/** Minimal rect shape for center distance calculation */
interface CenterDistanceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Calculate distance between two element centers
 */
function calculateCenterDistance(rectA: CenterDistanceRect, rectB: CenterDistanceRect): number {
  const centerAX = rectA.left + rectA.width / 2;
  const centerAY = rectA.top + rectA.height / 2;
  const centerBX = rectB.left + rectB.width / 2;
  const centerBY = rectB.top + rectB.height / 2;

  const dx = centerBX - centerAX;
  const dy = centerBY - centerAY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Start a generic drag (for widgets/bar, not pills)
 */
function startGenericDrag(
  id: string,
  startPosition: Position,
  offset: Position
): GenericDragState | null {
  const dragConfig = genericDraggables.get(id);
  if (!dragConfig) return null;

  genericDragState.value = {
    id,
    element: dragConfig.element,
    type: dragConfig.type,
    skill: dragConfig.skill,
    position: startPosition,
    offset,
    isDragging: true,
    startPosition,
    axis: dragConfig.axis ?? 'both',
    magneticTargets: dragConfig.magneticTargets ?? [],
  };

  dragConfig.element.classList.add('dragging');

  // Reset magnetic velocity for fresh drag
  genericMagneticVelocity.x = 0;
  genericMagneticVelocity.y = 0;

  return genericDragState.value;
}

/**
 * Update generic drag position with magnetic physics
 * Returns the magnetic-adjusted position
 */
function updateGenericDrag(rawPosition: Position): GenericDragUpdateResult {
  if (!genericDragState.value) {
    return { position: rawPosition, magneticPull: null, nearestTarget: null };
  }

  const state = genericDragState.value;

  // Apply axis constraint
  let constrainedPos = { ...rawPosition };
  if (state.axis === 'x') {
    constrainedPos.y = state.startPosition.y;
  } else if (state.axis === 'y') {
    constrainedPos.x = state.startPosition.x;
  }

  // Check magnetic targets using direct element matching
  let magneticResult: GenericDragUpdateResult = {
    position: constrainedPos,
    magneticPull: null,
    nearestTarget: null,
  };

  if (state.magneticTargets.length > 0) {
    const elRect = state.element.getBoundingClientRect();
    const elCenter: Position = {
      x: elRect.left + elRect.width / 2,
      y: elRect.top + elRect.height / 2,
    };
    let nearestDistance = Infinity;
    let nearestTarget: { selector: string; element: Element; distance: number } | null = null;
    let targetRect: DOMRect | null = null;
    let snapEdge: 'top' | 'bottom' = 'top';

    for (const selector of state.magneticTargets) {
      const targets = document.querySelectorAll(selector);
      for (const target of targets) {
        if (target === state.element) continue;

        const tRect = target.getBoundingClientRect();
        // Use edge-based distance like skills do
        const tRectAsRect: Rect = {
          x: tRect.left,
          y: tRect.top,
          width: tRect.width,
          height: tRect.height,
        };
        const distance = distanceToRect(elCenter, tRectAsRect);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestTarget = { selector, element: target, distance };
          targetRect = tRect;

          // Determine which edge to snap to (like calculateSnapPoint)
          const elBottom = elRect.top + elRect.height;
          const targetTop = tRect.top;
          const elTop = elRect.top;
          const targetBottom = tRect.top + tRect.height;
          const distToTop = Math.abs(elBottom - targetTop);
          const distToBottom = Math.abs(elTop - targetBottom);
          snapEdge = distToTop < distToBottom ? 'top' : 'bottom';
        }
      }
    }

    // Apply magnetic pull if within threshold
    // Use existing MAGNETIC_SPRING_CONFIG for consistent physics
    const pullThreshold = config.value.defaultMagnetRadius;

    if (nearestTarget && nearestDistance < pullThreshold && targetRect) {
      // Calculate edge-based snap point (like skills)
      const targetCenterX = targetRect.left + targetRect.width / 2;
      let snapPoint: Position;
      if (snapEdge === 'top') {
        // Snap element bottom to target top
        snapPoint = {
          x: targetCenterX - elRect.width / 2,
          y: targetRect.top - elRect.height,
        };
      } else {
        // Snap element top to target bottom
        snapPoint = {
          x: targetCenterX - elRect.width / 2,
          y: targetRect.bottom,
        };
      }

      // Calculate attraction strength (1 at distance 0, decreasing to 0 at pullThreshold)
      const attraction = Math.max(0, 1 - nearestDistance / pullThreshold);

      // Apply spring physics using existing config
      const { stiffness, damping } = MAGNETIC_SPRING_CONFIG;

      // Calculate spring force toward snap point
      const dx = snapPoint.x - constrainedPos.x;
      const dy = snapPoint.y - constrainedPos.y;

      // Only apply force in allowed axes
      let forceX = 0;
      let forceY = 0;

      if (state.axis === 'both' || state.axis === 'x') {
        forceX = dx * stiffness * attraction;
      }
      if (state.axis === 'both' || state.axis === 'y') {
        forceY = dy * stiffness * attraction;
      }

      // Apply force to velocity
      genericMagneticVelocity.x += forceX;
      genericMagneticVelocity.y += forceY;

      // Apply damping for smooth settling
      genericMagneticVelocity.x *= damping;
      genericMagneticVelocity.y *= damping;

      // Update position with velocity
      constrainedPos = {
        x: constrainedPos.x + genericMagneticVelocity.x,
        y: constrainedPos.y + genericMagneticVelocity.y,
      };

      magneticResult = {
        position: constrainedPos,
        magneticPull: { x: genericMagneticVelocity.x, y: genericMagneticVelocity.y },
        nearestTarget,
      };
    } else {
      // Decay velocity when no target
      genericMagneticVelocity.x *= 0.9;
      genericMagneticVelocity.y *= 0.9;

      magneticResult = {
        position: constrainedPos,
        magneticPull: null,
        nearestTarget,
      };
    }
  }

  state.position = magneticResult.position;
  return magneticResult;
}

/**
 * End generic drag, return final position and any snap target
 */
function endGenericDrag(): GenericDragEndResult | null {
  if (!genericDragState.value) return null;

  const state = genericDragState.value;
  state.element.classList.remove('dragging');

  // Check if we snapped to any target
  let snappedTo: string | null = null;

  if (state.magneticTargets.length > 0) {
    // Use the physics-adjusted position (state.position) instead of raw DOM rect.
    // During drag, the element's DOM position may lag behind the spring-adjusted
    // position, causing snap detection to fail when the spring animation hasn't
    // caught up. This matches how skill pills reliably snap via zone-based detection.
    const elWidth = state.element.offsetWidth;
    const elHeight = state.element.offsetHeight;
    const elRect: CenterDistanceRect = {
      left: state.position.x,
      top: state.position.y,
      width: elWidth,
      height: elHeight,
    };
    const snapThreshold = config.value.snapDistance;

    for (const selector of state.magneticTargets) {
      const targets = document.querySelectorAll(selector);
      for (const target of targets) {
        if (target === state.element) continue;

        const targetRect = target.getBoundingClientRect();
        const distance = calculateCenterDistance(elRect, targetRect);

        if (distance < snapThreshold) {
          snappedTo = selector;
          break;
        }
      }
      if (snappedTo) break;
    }
  }

  const result: GenericDragEndResult = {
    finalPosition: state.position,
    snappedTo,
  };

  // Reset state
  genericDragState.value = null;
  genericMagneticVelocity.x = 0;
  genericMagneticVelocity.y = 0;

  return result;
}

/**
 * Cancel a generic drag without completing it
 */
function cancelGenericDrag(): void {
  if (genericDragState.value) {
    genericDragState.value.element.classList.remove('dragging');
  }
  genericDragState.value = null;
  genericMagneticVelocity.x = 0;
  genericMagneticVelocity.y = 0;
}

/**
 * Check if a generic drag is currently active
 */
function isGenericDragging(): boolean {
  return genericDragState.value !== null && genericDragState.value.isDragging;
}

// ==================== CONFIGURATION ====================

/**
 * Update physics configuration
 */
function setConfig(updates: Partial<PhysicsConfig>): void {
  config.value = { ...config.value, ...updates };
}

/**
 * Enable/disable physics system
 */
function setEnabled(value: boolean): void {
  enabled.value = value;
  if (!value) {
    cancelDrag();
  }
}

// ==================== COMPUTED VALUES ====================

/** Whether a drag is currently active */
const isDragging: ComputedRef<boolean> = computed(() => dragState.value?.isDragging ?? false);

/** Current skill being dragged */
const draggingSkill: ComputedRef<SkillV2 | null> = computed(() => dragState.value?.skill ?? null);

/** Current proximity result */
const currentProximity: ComputedRef<ProximityResult | null> = computed(() => proximityResult.value);

/** Currently attached zone */
const attachedZone: ComputedRef<ZoneDefinition | null> = computed(() => attachmentState.value.zone);

/** Current combination preview state */
const currentCombinationPreview: ComputedRef<CombinationPreviewState> = computed(
  () => combinationPreview.value
);

/** Whether a combination preview is active */
const isShowingCombinationPreview: ComputedRef<boolean> = computed(
  () => combinationPreview.value.isShowingPreview
);

// ==================== COMPOSABLE EXPORT ====================

export interface UseSkillPhysicsReturn {
  // State (readonly)
  isDragging: ComputedRef<boolean>;
  draggingSkill: ComputedRef<SkillV2 | null>;
  currentProximity: ComputedRef<ProximityResult | null>;
  attachedZone: ComputedRef<ZoneDefinition | null>;
  config: Readonly<Ref<PhysicsConfig>>;
  enabled: Readonly<Ref<boolean>>;

  // Combination state (readonly)
  currentCombinationPreview: ComputedRef<CombinationPreviewState>;
  isShowingCombinationPreview: ComputedRef<boolean>;
  combinationConfig: Readonly<Ref<CombinationPhysics>>;

  // Collision state (readonly)
  collisionConfig: Readonly<Ref<CollisionConfig>>;

  // Generic draggable state (readonly - use isGenericDragging() for boolean check)
  genericDragState: Ref<GenericDragState | null>;

  // Drag operations
  startDrag: typeof startDrag;
  updateDrag: typeof updateDrag;
  endDrag: typeof endDrag;
  cancelDrag: typeof cancelDrag;

  // Magnetic calculations
  applyMagneticAttraction: typeof applyMagneticAttraction;
  resetMagneticVelocity: typeof resetMagneticVelocity;
  shouldSnap: typeof shouldSnap;
  calculateProximity: typeof calculateProximity;

  // Zone queries
  getHighlightedZones: typeof getHighlightedZones;
  getActiveZone: typeof getActiveZone;

  // Pill combination
  registerPill: typeof registerPill;
  unregisterPill: typeof unregisterPill;
  getRegisteredSkill: typeof getRegisteredSkill;
  calculatePillProximity: typeof calculatePillProximity;
  updateCombinationPreview: typeof updateCombinationPreview;
  clearCombinationPreview: typeof clearCombinationPreview;
  getCombinationPreview: typeof getCombinationPreview;
  setCombinationConfig: typeof setCombinationConfig;

  // Collision physics
  updateCollisionPhysics: typeof updateCollisionPhysics;
  clearCollisionState: typeof clearCollisionState;
  setCollisionConfig: typeof setCollisionConfig;

  // Generic draggable support
  registerDraggable: typeof registerDraggable;
  unregisterDraggable: typeof unregisterDraggable;
  getDraggable: typeof getDraggable;
  startGenericDrag: typeof startGenericDrag;
  updateGenericDrag: typeof updateGenericDrag;
  endGenericDrag: typeof endGenericDrag;
  cancelGenericDrag: typeof cancelGenericDrag;
  isGenericDragging: typeof isGenericDragging;

  // Geometry helpers
  getZoneRect: typeof getZoneRect;
  distanceToRect: typeof distanceToRect;
  isPointInRect: typeof isPointInRect;
  getDistance: typeof getDistance;
  getMidpoint: typeof getMidpoint;
  calculateCenterDistance: typeof calculateCenterDistance;

  // Configuration
  setConfig: typeof setConfig;
  setEnabled: typeof setEnabled;
}

/**
 * Composable for multi-zone magnetic physics
 * Returns singleton instance
 */
export function useSkillPhysics(): UseSkillPhysicsReturn {
  // Initialize ripple context on first use (lazy, optional)
  if (!rippleContext) {
    try {
      rippleContext = useRippleConsumerOptional();
    } catch {
      // Not in a Vue component context - ripple will be unavailable
    }
  }

  return {
    // State
    isDragging,
    draggingSkill,
    currentProximity,
    attachedZone,
    config: readonly(config),
    enabled: readonly(enabled),

    // Combination state
    currentCombinationPreview,
    isShowingCombinationPreview,
    combinationConfig: readonly(combinationConfig),

    // Collision state
    collisionConfig: readonly(collisionConfig),

    // Generic draggable state (exposed as-is, use isGenericDragging() for safe check)
    genericDragState,

    // Drag operations
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,

    // Magnetic calculations
    applyMagneticAttraction,
    resetMagneticVelocity,
    shouldSnap,
    calculateProximity,

    // Zone queries
    getHighlightedZones,
    getActiveZone,

    // Pill combination
    registerPill,
    unregisterPill,
    getRegisteredSkill,
    calculatePillProximity,
    updateCombinationPreview,
    clearCombinationPreview,
    getCombinationPreview,
    setCombinationConfig,

    // Collision physics
    updateCollisionPhysics,
    clearCollisionState,
    setCollisionConfig,

    // Generic draggable support
    registerDraggable,
    unregisterDraggable,
    getDraggable,
    startGenericDrag,
    updateGenericDrag,
    endGenericDrag,
    cancelGenericDrag,
    isGenericDragging,

    // Geometry helpers
    getZoneRect,
    distanceToRect,
    isPointInRect,
    getDistance,
    getMidpoint,
    calculateCenterDistance,

    // Configuration
    setConfig,
    setEnabled,
  };
}

export default useSkillPhysics;
