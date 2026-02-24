# Skill Physics System Documentation

> **Why this doc:** The Skill Physics system controls how skill pills move, snap, and combine through spring physics and magnetic attraction. Read this when working on drag behavior, pill merging, or animation tuning.
>
> **Related systems:** [SKILL_COORDINATOR_SYSTEM.md](./SKILL_COORDINATOR_SYSTEM.md) | [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md) | [MAGNETIC_ATTACHMENT_SYSTEM.md](./MAGNETIC_ATTACHMENT_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The Skill Physics system provides multi-zone magnetic attraction, spring-based motion, pill combination physics, and collision deformation for the skill pill UI. It enables draggable pills to magnetically snap to registered zones, combine with other pills using liquid merge effects, and deform organically during collisions. The system is composed of three cooperating composables: `useSkillPhysics` (core engine), `useSkillAnimations` (visual feedback), and `useBarDrag` (InputBar positioning).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Composable Relationships](#composable-relationships)
3. [Core Concepts](#core-concepts)
4. [Spring Physics Model](#spring-physics-model)
5. [Drag State Machine](#drag-state-machine)
6. [Proximity Detection Algorithm](#proximity-detection-algorithm)
7. [Snap-to-Zone Mechanics](#snap-to-zone-mechanics)
8. [Pill Combination System](#pill-combination-system)
9. [Collision Physics](#collision-physics)
10. [Generic Draggable Support](#generic-draggable-support)
11. [Skill Animations (useSkillAnimations)](#skill-animations)
12. [Bar Drag (useBarDrag)](#bar-drag)
13. [Viewport Edge Detection](#viewport-edge-detection)
14. [RAF Integration](#raf-integration)
15. [Configuration Reference](#configuration-reference)
16. [Failure Modes](#failure-modes)
17. [File Reference](#file-reference)
18. [Changelog](#changelog)

---

## Architecture Overview

```
                              DRAG INITIATION
  +------------------+    +------------------+    +------------------+
  |  Mouse/Touch     |    |  Hand Tracking   |    |  Gamepad         |
  |  startDrag()     |    |  startDrag()     |    |  startDrag()     |
  +--------+---------+    +--------+---------+    +--------+---------+
           |                       |                       |
           +-----------------------+-----------------------+
                                   |
                                   v
  +--------------------------------------------------------------------+
  |                        DRAG STATE MACHINE                          |
  |  +--------+    +------------+    +----------+    +------------+    |
  |  |  IDLE  |--->|  TRACKING  |--->| DRAGGING |--->|  SNAPPING  |    |
  |  |        |    | (threshold)|    | (active) |    | (to zone)  |    |
  |  +--------+    +------------+    +----------+    +------------+    |
  |      ^                                |                |           |
  |      +--------------------------------+----------------+           |
  |                     endDrag() / cancelDrag()                       |
  +--------------------------------------------------------------------+
                                   |
                                   v
  +--------------------------------------------------------------------+
  |                         PHYSICS ENGINE                             |
  |                                                                    |
  |  +------------------------+  +------------------------+            |
  |  |    SPRING PHYSICS      |  |   PROXIMITY DETECTION  |            |
  |  | force = delta * k      |  |   Zone Registry        |            |
  |  | velocity += force      |  |   Distance Calc        |            |
  |  | velocity *= damping    |  |   Attraction Curve     |            |
  |  | position += velocity   |  +------------------------+            |
  |  +------------------------+                                        |
  |                                                                    |
  |  +------------------------+  +------------------------+            |
  |  |  COMBINATION PHYSICS   |  |  COLLISION PHYSICS     |            |
  |  | Pill Registry          |  |  Capsule Detection     |            |
  |  | Proximity Detect       |  |  Deformation Calc      |            |
  |  | Hold Timer (500ms)     |  |  Transform Apply       |            |
  |  +------------------------+  +------------------------+            |
  +--------------------------------------------------------------------+
                                   |
                                   v
  +--------------------------------------------------------------------+
  |                          OUTPUT EFFECTS                            |
  | +---------------+ +---------------+ +---------------+ +---------+  |
  | | Zone Highlight| | Snap Animation| | Liquid Merge  | | Ripple  |  |
  | | (CSS class)   | | (position)    | | (SVG goo)     | | (edge)  |  |
  | +---------------+ +---------------+ +---------------+ +---------+  |
  +--------------------------------------------------------------------+
```

---

## Composable Relationships

The physics system spans three composables plus supporting utilities:

```
+---------------------+       +-------------------------+
|  useSkillPhysics    |<------| useSkillCoordinator     |
|  (core engine)      |       | (zone registry, skill   |
|  1,942 lines        |       |  types, canCombine())   |
+----------+----------+       +-------------------------+
           |
           |  provides registerDraggable(),
           |  startGenericDrag(), etc.
           |
           v
+---------------------+       +-------------------------+
|  useBarDrag         |       | useSkillAnimations      |
|  (InputBar drag)    |       | (visual feedback)       |
|  237 lines          |       | 326 lines               |
+---------------------+       +-------------------------+
           |                              |
           | Uses physics.               | Uses @motionone/dom
           | registerDraggable()          | and useMotion
           | startGenericDrag()           | for pill lifecycle
           | updateGenericDrag()          | animations
           | endGenericDrag()             |
           v                              v
+---------------------+       +-------------------------+
|  frameCoordinator   |       | liquidMerge.ts          |
|  (RAF loop manager) |       | (SVG goo merge effect,  |
|  Priority: PHYSICS  |       |  deformation calc)      |
+---------------------+       +-------------------------+
```

**Data flow:**

- `useSkillPhysics` is a **singleton** -- all consumers share the same drag state, proximity results, and pill registry
- `useBarDrag` consumes `useSkillPhysics` via the generic draggable API (y-axis constrained drag with magnetic targets)
- `useSkillAnimations` is independent -- it provides animation functions that components call alongside physics operations
- `useSkillCoordinator` provides zone definitions and `canCombine()` checks that the physics system queries during drag

---

## Core Concepts

### Position and Rect

```typescript
interface Position {
  x: number; // Screen X coordinate
  y: number; // Screen Y coordinate
}

interface Rect {
  x: number; // Left edge
  y: number; // Top edge
  width: number;
  height: number;
}
```

### Drag State

Tracks the current drag operation:

```typescript
interface DragState {
  skill: SkillV2; // Skill being dragged
  element: HTMLElement; // DOM element
  position: Position; // Current cursor position
  offset: Position; // Cursor offset from pill origin
  isDragging: boolean; // Past drag threshold?
  startPosition: Position; // Initial position for threshold
}
```

### Zone Proximity

Result of calculating distance to a zone:

```typescript
interface ZoneProximity {
  zone: ZoneDefinition; // The zone
  distance: number; // Distance to zone edge (0 if inside)
  isInside: boolean; // Center is inside zone
  isNear: boolean; // Within magnetic radius
  attraction: number; // Normalized strength (0-1)
  snapPoint: Position; // Best snap position
  accepts: boolean; // Zone accepts this skill type
}
```

### Attachment State

Tracks which zone a pill is attached to:

```typescript
interface AttachmentState {
  zone: ZoneDefinition | null;
  snapPoint: Position | null;
  edge: 'top' | 'bottom' | 'center';
}
```

---

## Spring Physics Model

The physics system uses a spring-damper model for smooth, organic motion. Two spring presets operate in different contexts:

### Liquid Spring Presets

```typescript
const LIQUID_SPRING_PRESETS = {
  drag: { stiffness: 0.05, damping: 0.72 }, // Drag follow
  settle: { stiffness: 0.025, damping: 0.78 }, // Post-drop settle
  magnetic: { stiffness: 0.04, damping: 0.7 }, // Zone attraction
  merge: { stiffness: 0.018, damping: 0.72 }, // Merge approach
};
```

### Magnetic Spring Configuration

The active magnetic spring config extends the `magnetic` preset:

```typescript
const MAGNETIC_SPRING_CONFIG = {
  stiffness: 0.04, // From LIQUID_SPRING_PRESETS.magnetic
  damping: 0.7, // From LIQUID_SPRING_PRESETS.magnetic
  velocityThreshold: 0.08, // Lower for smoother stopping
  positionThreshold: 0.3, // Tighter settle tolerance
};
```

### Spring Force Calculation

```
  displacement = snapPoint - currentPosition

  force = displacement * stiffness * attraction
          -----------   ---------   ----------
           distance      spring      zone
           to target     constant    weight (0-1)

  velocity += force
  velocity *= damping     (prevents oscillation)
  position += velocity
```

When no magnetic target is in range, velocity decays at 0.9x per frame to prevent sudden stops.

### Attraction Strength Curve

```
Attraction
    |
1.0 +----------.
    |           \
    |            \
0.5 +             \
    |              \
    |               \
0.0 +----------------\------------------
    0              80px               inf
                magnetRadius       Distance

attraction = max(0, 1 - distance/magnetRadius) * snapStrength
```

The curve is linear from full attraction at the zone edge to zero at `magnetRadius`. The `snapStrength` multiplier (default 0.8) scales the result.

---

## Drag State Machine

```
  +--------------+
  |     IDLE     |  dragState = null
  |              |  proximityResult = null
  |              |  attachmentState.zone = null
  +------+-------+
         |
         | startDrag(skill, element, position, offset)
         v
  +--------------+
  |   TRACKING   |  dragState.isDragging = false
  |              |  Waiting for drag threshold
  |              |  CSS: 'skill-dragging'
  +------+-------+
         |
         | updateDrag() && delta >= 5px
         v
  +--------------+
  |   DRAGGING   |  dragState.isDragging = true
  |              |  proximityResult updated per frame
  |              |  CSS: 'skill-drag-active'
  |              |  Zone callbacks: onEnter/onLeave
  +------+-------+
         |
         | distance < snapDistance (60px)
         v
  +--------------+
  |   SNAPPING   |  attachmentState.zone = activeZone
  |              |  snapPoint calculated
  |              |  Strong magnetic pull
  +------+-------+
         |
         | endDrag()
         v
  +--------------+
  |   DROPPED    |  zone.onDrop(skill, context) called
  |              |  All state reset
  |              |  CSS classes removed
  +------+-------+
         |
         +---> IDLE

  CANCELLATION (from any state):
  cancelDrag() -> IDLE (zone.onLeave called if attached)
```

### CSS Class Lifecycle

| State             | CSS Class           | Applied To           |
| ----------------- | ------------------- | -------------------- |
| TRACKING          | `skill-dragging`    | Pill element         |
| DRAGGING          | `skill-drag-active` | Pill element (added) |
| DROPPED/CANCELLED | Both removed        | Pill element         |

### State Invariants

| Invariant                | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| **dragState.isDragging** | Only `true` after moving past `dragThreshold` (5px)         |
| **proximityResult**      | Only non-null during active drag                            |
| **attachmentState.zone** | Only set when within `snapDistance` of accepting zone       |
| **holdTimer**            | Only active when pills are within `proximityReady` distance |
| **Singleton**            | Only one drag operation can be active at a time             |

---

## Proximity Detection Algorithm

### Zone Proximity Calculation

`calculateProximity(pillRect, skill)` runs on every drag frame:

1. **Get all zones** from `useSkillCoordinator().listZones()`
2. **Calculate pill center** from pill rect
3. **For each zone:**
   - Get zone rect from element/selector via `getZoneRect()`
   - Calculate distance to rect edge via `distanceToRect()` (0 if inside)
   - Check if zone accepts skill type: `zone.accepts.includes(skill.type)`
   - Calculate attraction if near and accepting: `max(0, 1 - distance/magnetRadius) * snapStrength`
   - Calculate snap point via `calculateSnapPoint()`
4. **Sort zones** by distance (nearest first)
5. **Find nearestAccepting** (first accepting zone that `isNear`)
6. **Set activeZone** if `nearestAccepting.distance < snapDistance` (40px)

### Distance to Rect Calculation

```
           Point
             *
              \
               \ distance
                \
     +-----------*-----------+
     |     Nearest point     |
     |     on rect edge      |
     |                       |
     |       ZONE RECT       |
     |                       |
     +-----------------------+

  nearestX = clamp(point.x, rect.x, rect.x + rect.width)
  nearestY = clamp(point.y, rect.y, rect.y + rect.height)
  distance = sqrt((point.x - nearestX)^2 + (point.y - nearestY)^2)
```

If the point is inside the rect, distance returns 0.

---

## Snap-to-Zone Mechanics

### Snap Point Calculation

`calculateSnapPoint(pillRect, zoneRect, zone)` determines where a pill should land:

1. **Custom snap point:** If the zone defines `getMagnetPoint()`, use that function's result with edge `'center'`
2. **Default edge preference:** Compare pill-bottom-to-zone-top vs pill-top-to-zone-bottom distances
   - If closer to zone top: snap pill bottom to zone top (pill sits above zone)
   - If closer to zone bottom: snap pill top to zone bottom (pill sits below zone)
   - X position: centered on zone horizontally, adjusted for pill width

### Zone Enter/Leave Notifications

During drag, when the active zone changes:

- **Previous zone:** `zone.onLeave(skill)` called
- **New zone:** `zone.onEnter(skill, currentPosition)` called

### Drop Handling

On `endDrag()`, if an `activeZone` exists:

1. Get execution context from `useSkillCoordinator().getContext()`
2. Call `zone.onDrop(skill, context)` (async, errors are caught and logged via `debugWarn`)
3. Reset all state: `dragState`, `proximityResult`, `attachmentState`, magnetic velocity, position tracker

---

## Pill Combination System

### Registration

Pills register with `registerPill(skill, element)` and unregister with `unregisterPill(skillId)`. Only **floating** pills participate in merge detection:

```typescript
const isFloating =
  pill.element.classList.contains('skill-floating') ||
  (pill.element as HTMLElement & { _floating?: boolean })._floating === true;
```

### Proximity Zones

```
       +--------------------------------------------+
       |         DETECT ZONE (100px)                |
       |     +--------------------------------+     |
       |     |     READY ZONE (50px)          |     |
       |     |   +------------------------+   |     |
       |     |   |    TARGET PILL         |   |     |
       |     |   +------------------------+   |     |
       |     +--------------------------------+     |
       +--------------------------------------------+

  isDetected: distance <= 100px -> Show merge preview
  isReady:    distance <= 50px  -> Start hold timer
```

### Combination Flow

1. During drag, `updateCombinationPreview()` is called with the dragging pill's ID, position, and rect
2. `calculatePillProximity()` finds the nearest compatible floating pill:
   - Skip the dragged pill itself
   - Skip non-floating pills (tray pills)
   - Check `coordinator.canCombine(draggingSkill, targetSkill)` for compatibility
   - Return nearest within detect range (100px)
3. If `isReady` (within 50px), start hold timer (500ms)
4. Hold timer completes:
   - Play liquid merge animation via `animateLiquidMerge()` if enabled
   - Emit `skill:combine` event via eventBus
5. Event payload:
   ```typescript
   {
     sourceId, targetId,
     mode: 'chain' | 'pipe' | 'modify',
     sourceSkill, targetSkill,
     midpoint, sourceRect, targetRect
   }
   ```

### Hold Timer Behavior

```
holdProgress ----------------------------------------> 1.0
     0%        25%        50%        75%       100%
      |         |          |          |         |
      +---------+----------+----------+---------+
      0ms      125ms     250ms      375ms     500ms

  - Timer resets if distance exceeds proximityReady (50px)
  - Visual feedback via holdProgress (0-1) for UI
```

---

## Collision Physics

Oil-drop behavior: pills deform when touching but don't push each other away. Only visual deformation is applied -- no force-based repulsion.

### Capsule Collision Detection

`calculateCapsuleCollision(draggedRect, stationaryRect, edgePadding)`:

1. **Calculate centers** of both pill rects
2. **Normalize direction vector** between centers
3. **Project half-sizes** onto connection direction (capsule approximation):
   ```
   draggedRadius    = |nx| * halfW + |ny| * halfH
   stationaryRadius = |nx| * halfW + |ny| * halfH
   ```
4. **Edge distance** = centerDistance - (draggedRadius + stationaryRadius + edgePadding)
5. **Collision** if edgeDistance <= 0
6. Returns `{ distance, angle }` or `null`

### Deformation Calculation

From `liquidMerge.ts` DEFORM_CONFIG:

| Parameter         | Value | Effect                          |
| ----------------- | ----- | ------------------------------- |
| `startDistance`   | 120px | Deformation begins              |
| `contactDistance` | 20px  | Maximum squish distance         |
| `maxSquish`       | 0.65  | 35% compression on contact axis |
| `maxBulge`        | 1.25  | 25% expansion perpendicular     |
| `smoothing`       | 0.15  | Deformation transition rate     |

Progress calculation:

```
progress = 1 - (distance - contactDistance) / (startDistance - contactDistance)
```

Ease-in-out applied:

```
eased = progress < 0.5
      ? 2 * progress^2
      : 1 - (-2 * progress + 2)^2 / 2

squish = 1 - (1 - maxSquish) * eased
bulge  = 1 + (maxBulge - 1) * eased
```

### Deformation Application

`applyDeformation()` from `liquidMerge.ts` converts squish/bulge into CSS transforms:

1. Calculate `verticalness` from collision angle via `sin^2(angle)`
2. Blend scaleX/scaleY based on collision direction:
   - Horizontal collision: squish X, bulge Y
   - Vertical collision: squish Y, bulge X
3. Apply asymmetric `border-radius` (flatten contact side, maintain opposite)
4. Shift `transform-origin` toward contact point

### Collision Update Loop

`updateCollisionPhysics()` runs during drag updates:

- Checks dragged pill against all floating pills
- Applies deformation to both dragged and stationary pills
- When no collision, smoothly fades deformation back to normal (interpolation factor 0.15)
- Clears deformation when squish/bulge values are within 0.01 of 1.0

---

## Generic Draggable Support

The physics system supports non-pill draggables (widgets, InputBar) through a parallel API:

```typescript
interface DraggableConfig {
  id: string;
  element: HTMLElement;
  type: 'pill' | 'widget' | 'bar';
  skill?: SkillV2; // Only for pills
  axis?: 'x' | 'y' | 'both'; // Movement constraint
  canSnapToZones?: boolean; // Default true for pills
  magneticTargets?: string[]; // CSS selectors to snap to
}
```

### Generic Drag Lifecycle

1. **`registerDraggable(config)`** -- Adds element to `genericDraggables` Map with axis constraints and magnetic targets
2. **`startGenericDrag(id, position, offset)`** -- Creates `GenericDragState`, adds `'dragging'` CSS class, resets magnetic velocity
3. **`updateGenericDrag(rawPosition)`** -- Applies axis constraints, finds nearest magnetic target via CSS selector matching, applies spring physics if within pull threshold. Returns `{ position, magneticPull, nearestTarget }`
4. **`endGenericDrag()`** -- Checks if snapped to any target (within `snapDistance`), returns `{ finalPosition, snappedTo }`, cleans up state

### Magnetic Target Detection

Generic draggables use CSS selectors (`magneticTargets`) to find snap targets. For each selector, the system queries the DOM, calculates edge-based distance, and determines snap edge (top or bottom) using the same logic as pill snap points.

---

## Skill Animations

`useSkillAnimations` (`web/composables/useSkillAnimations.ts`, 326 lines) provides consistent pill lifecycle animations using the `@motionone/dom` library and the `useMotion` system for duration/easing values.

### Animation Types

| Function                    | Trigger                     | Effect                                                | Duration                            |
| --------------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------------- |
| `animatePillEnter`          | Pill enters carousel        | Fade up from 12px below with stagger delay            | `motionDurations().medium` (~0.25s) |
| `animatePillDrop`           | Pill dropped back to tray   | Subtle opacity + translateY bounce                    | `motionDurations().short` (~0.2s)   |
| `animatePillRemove`         | Pill removed from UI        | Scale down to 0.5 + fade out, then `element.remove()` | `motionDurations().short` (~0.2s)   |
| `animateCombinedPillEnter`  | Combined pill spawns        | Pop effect: scale 0.8 -> 1.05 -> 1.0 at midpoint      | `motionDurations().medium` (~0.25s) |
| `animateHighlightFlash`     | Duplicate combine attempted | Adds/removes `skill-pill--highlight` CSS class        | 800ms (hardcoded)                   |
| `animateDragStart`          | Drag begins                 | Anticipation squash then lift with shadow growth      | `motionDurations().short` (~0.2s)   |
| `animateDragEnd`            | Drag ends                   | Soft droplet landing squash then ease back            | `motionDurations().medium` (~0.25s) |
| `animateCombinePreviewGlow` | Pills approaching merge     | Sets `--combine-glow-opacity` CSS variable            | Immediate (CSS-driven)              |
| `animateZoneSettle`         | Pill settles on zone        | Gentle scale squash then normalize                    | `motionDurations().medium` (~0.25s) |

### Stagger Configuration

`animatePillEnter` accepts stagger options:

```typescript
interface PillAnimationOptions {
  staggerDelay?: number; // Default: 0.05s per pill
  maxStagger?: number; // Default: 0.25s maximum total stagger
}
```

### Reduced Motion Support

All animations check `prefersReducedMotion()` from `useMotion.ts`. When the user's OS prefers reduced motion:

- Most animations are skipped entirely (immediate state application)
- `animatePillRemove` immediately removes the element without animation
- `animateCombinedPillEnter` applies final styles directly

### Motion Duration/Easing System

Animations read duration/easing from CSS custom properties via `useMotion`:

```typescript
// Durations (from CSS --duration-* vars, with fallbacks)
{ short: 0.2, medium: 0.25, long: 0.6, fade: 0.35 }

// Easings (from CSS --easing-* vars, with fallbacks)
{ standard: '...', emphasis: '...', snap: '...' }
```

### Disney Animation Principles

The animations implement several Disney principles:

- **Anticipation:** `animateDragStart` squashes slightly before lifting (scale 1 -> 1.02/0.97 -> 1.04)
- **Follow-through:** `animateDragEnd` uses a soft droplet landing without bounce (slow ease-out)
- **Squash and stretch:** `animateZoneSettle` applies brief squash on contact

### Integration with Physics

`useSkillAnimations` does **not** depend on `useSkillPhysics`. Components call animation functions alongside physics operations:

- Start drag: call `physics.startDrag()` then `animateDragStart(element)`
- End drag: call `physics.endDrag()` then `animateDragEnd(element)`
- Combine: physics emits `skill:combine`, component calls `animateCombinedPillEnter()`

---

## Bar Drag

`useBarDrag` (`web/composables/useBarDrag.ts`, 237 lines) provides vertical drag-to-position behavior for the InputBar element. It uses `useSkillPhysics` as its physics backend through the generic draggable API.

### Configuration

```typescript
interface DragConfig {
  barSelector: string; // CSS selector for bar element
  minTop?: number; // Minimum Y position (default: 50px)
  magneticTargets?: string[]; // Snap targets (default: widget selectors)
  onDragEnd?: () => void; // Callback after drag completes
}
```

Default magnetic targets:

```typescript
['.floating-notes-widget', '.floating-pdf-widget', '#weather-time-widget'];
```

### Physics Integration

On mount, `useBarDrag`:

1. Registers the bar with `physics.registerDraggable({ id: 'inputBar', type: 'bar', axis: 'y', magneticTargets })`
2. Attaches mouse and touch event listeners (capture phase for mousedown/touchstart)

During drag:

1. Calls `physics.startGenericDrag('inputBar', { x: 0, y: topPx }, offset)`
2. Updates via `physics.updateGenericDrag({ x: 0, y: newY })` -- magnetic effects applied automatically
3. Clamps result to viewport bounds: `minTop <= newTop <= maxTop`
4. Ends via `physics.endGenericDrag()`

### Drag Threshold

The bar uses its own `DRAG_THRESHOLD` constant of 5px (same value as the pill physics threshold). Movement below this threshold is ignored.

### Initial Position Handling

If the bar has the `initial-position` class (CSS-centered positioning), the first drag:

1. Reads the computed `getBoundingClientRect().top`
2. Converts to explicit `style.top`
3. Removes the `initial-position` class
4. Sets `transform: none`

This transitions from CSS-centered to absolute positioning for drag support.

### Viewport Clamping

On window resize, `onResize()` clamps the bar position:

```
clamped = min(max(minTop, currentTop), maxTop)
maxTop  = window.innerHeight - bar.offsetHeight
```

### Lifecycle

- **onMounted:** Registers with physics, attaches event listeners, ensures `position: fixed`
- **onUnmounted:** Unregisters from physics via `physics.unregisterDraggable('inputBar')`, removes all event listeners

---

## Viewport Edge Detection

When a pill is dragged near viewport edges, the system triggers ripple effects:

### Edge Detection Configuration

```typescript
const EDGE_DETECTION_CONFIG = {
  margin: 8, // px from viewport edge to trigger
  minIntensity: 0.1, // Minimum velocity-based intensity
};
```

### Velocity-Based Intensity

Intensity is calculated from drag velocity:

```
velocityMagnitude = (sqrt(dx^2 + dy^2) / deltaTime) * 16.67  // Normalize to 60fps
intensity = min(1, velocityMagnitude / 30)                    // maxVelocity = 30
```

### Edge Collision Cooldown

Same-edge triggers have a 100ms cooldown to prevent ripple spam. The edge state resets when the pill moves away from all edges.

### Ripple Integration

The ripple system is optional -- `useSkillPhysics` lazily attempts to initialize `useRippleConsumerOptional()`. If unavailable (no Vue component context), edge detection runs without visual output.

---

## RAF Integration

### frameCoordinator

The physics system integrates with `frameCoordinator` (`web/utils/frameCoordinator.ts`) for coordinated animation updates.

### Priority Levels

| Priority   | Value | Purpose                                          |
| ---------- | ----- | ------------------------------------------------ |
| `TRACKING` | 0     | Input processing (hand tracking) -- runs first   |
| `PHYSICS`  | 1     | Physics updates (springs, collisions)            |
| `RENDER`   | 2     | Visual updates (particles, effects) -- runs last |

### Frame Info

Each subscriber receives:

```typescript
interface FrameInfo {
  now: number; // Current timestamp (performance.now)
  deltaMs: number; // Time since last frame
  deltaFactor: number; // Normalized to 60fps (1.0 = 16.67ms)
}
```

`deltaFactor` is clamped to `MAX_DELTA_MULTIPLIER` (5) to prevent huge jumps after tab switches.

### Auto-start/Auto-stop

The `frameCoordinator` automatically:

- **Starts** the RAF loop when the first subscriber registers
- **Stops** when the last subscriber unregisters

---

## Configuration Reference

### Physics Configuration (DEFAULT_CONFIG)

| Parameter             | Value                        | Description                               |
| --------------------- | ---------------------------- | ----------------------------------------- |
| `defaultMagnetRadius` | 80px                         | Distance where magnetic attraction begins |
| `defaultSnapStrength` | 0.8                          | Multiplier for attraction strength (0-1)  |
| `dragThreshold`       | 5px                          | Minimum drag distance to activate         |
| `snapDistance`        | 60px                         | Distance for auto-snap on release         |
| `snapDuration`        | 200ms                        | Animation duration for snap               |
| `snapEasing`          | `cubic-bezier(0.2, 0, 0, 1)` | CSS easing for snap                       |

Source: `useSkillPhysics.ts` lines 230-237

### Liquid Spring Presets

| Preset     | Stiffness | Damping | Use Case                                       |
| ---------- | --------- | ------- | ---------------------------------------------- |
| `drag`     | 0.05      | 0.72    | Drag follow (responsive but fluid)             |
| `settle`   | 0.025     | 0.78    | Post-drop settle (languid, gravity-influenced) |
| `magnetic` | 0.04      | 0.7     | Zone attraction (gentle pull)                  |
| `merge`    | 0.018     | 0.72    | Merge approach (tuned in liquidMerge.ts)       |

Source: `useSkillPhysics.ts` lines 244-253

### Active Magnetic Spring Config

| Parameter           | Value | Description                    |
| ------------------- | ----- | ------------------------------ |
| `stiffness`         | 0.04  | From magnetic preset           |
| `damping`           | 0.7   | From magnetic preset           |
| `velocityThreshold` | 0.08  | When to consider settled       |
| `positionThreshold` | 0.3   | Position tolerance for settled |

Source: `useSkillPhysics.ts` lines 256-260

### Combination Physics (DEFAULT_COMBINATION_PHYSICS)

| Parameter          | Value | Description                                               |
| ------------------ | ----- | --------------------------------------------------------- |
| `proximityDetect`  | 100px | Show merge preview distance                               |
| `proximityReady`   | 50px  | Pills "touching" distance                                 |
| `holdDuration`     | 500ms | Time to hold for auto-combine                             |
| `glowIntensity`    | 0.6   | Opacity of proximity glow                                 |
| `connectorWidth`   | 2px   | Width of connector line                                   |
| `mergeDuration`    | 720ms | Duration of merge animation (20% slower for languid feel) |
| `separateDuration` | 200ms | Duration of separate animation                            |

Source: `useSkillPhysics.ts` lines 266-274

### Collision Configuration (DEFAULT_COLLISION_CONFIG)

| Parameter     | Value | Description                         |
| ------------- | ----- | ----------------------------------- |
| `edgePadding` | 8px   | Buffer before visual edges touch    |
| `enabled`     | true  | Whether collision physics is active |

Source: `useSkillPhysics.ts` lines 277-280

### Deformation Configuration (DEFORM_CONFIG in liquidMerge.ts)

| Parameter         | Value | Description                 |
| ----------------- | ----- | --------------------------- |
| `startDistance`   | 120px | Distance deformation begins |
| `contactDistance` | 20px  | Maximum squish distance     |
| `maxSquish`       | 0.65  | Maximum compression (35%)   |
| `maxBulge`        | 1.25  | Maximum expansion (25%)     |
| `smoothing`       | 0.15  | Deformation transition rate |

Source: `liquidMerge.ts` lines 69-80

### Oil Drop Physics (OIL_DROP_CONFIG in liquidMerge.ts)

| Parameter          | Value | Description                 |
| ------------------ | ----- | --------------------------- |
| `springStiffness`  | 0.018 | Merge spring constant       |
| `springDamping`    | 0.72  | Merge spring damping        |
| `tensionRadius`    | 90px  | Surface tension pull radius |
| `tensionStrength`  | 0.18  | Base tension force          |
| `approachDuration` | 0.48s | Approach animation phase    |
| `mergeDuration`    | 0.3s  | Merge animation phase       |
| `settleDuration`   | 0.36s | Settle animation phase      |

Source: `liquidMerge.ts` lines 53-66

### Frame Coordinator

| Constant               | Value   | Description                    |
| ---------------------- | ------- | ------------------------------ |
| `FRAME_BASELINE_MS`    | 16.67ms | 60fps baseline for deltaFactor |
| `MAX_DELTA_MULTIPLIER` | 5       | Maximum deltaFactor clamp      |
| `Priority.TRACKING`    | 0       | Input processing priority      |
| `Priority.PHYSICS`     | 1       | Physics update priority        |
| `Priority.RENDER`      | 2       | Visual render priority         |

Source: `frameCoordinator.ts` lines 5-13

---

## Failure Modes

| Scenario                          | Behavior                                                                                              | How to Detect                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **No zones registered**           | Proximity returns empty; no snap targets                                                              | `calculateProximity().zones.length === 0`                  |
| **Zone element not found**        | Zone excluded from proximity calculation                                                              | Zone missing from `proximityResult.zones`                  |
| **Zone doesn't accept type**      | Zone appears with `accepts: false`, attraction = 0                                                    | Check `proximity.accepts` for zone                         |
| **Drag below threshold**          | `updateDrag()` returns `null`; `isDragging` stays `false`                                             | `dragState.isDragging === false`                           |
| **Zone onDrop throws**            | Error logged via `debugWarn('skills', 'physics:drop', ...)`; `endDrag()` returns `{ dropped: false }` | Console: `[debugWarn] skills physics:drop`                 |
| **Pill not registered**           | `calculatePillProximity()` returns `null`                                                             | Pill not in `registeredPills` Map                          |
| **Non-floating pill**             | Excluded from merge detection                                                                         | Only checks `skill-floating` class or `_floating` property |
| **Hold timer interrupted**        | Timer cleared; holdProgress reset to 0                                                                | `clearHoldTimer()` called                                  |
| **Collision with hidden element** | `getElementRect()` returns zero dimensions                                                            | Element not visible in DOM                                 |
| **Ripple unavailable**            | Edge detection runs but no visual output                                                              | `rippleContext` is `null`                                  |
| **Reduced motion enabled**        | All `useSkillAnimations` functions skip animations                                                    | `prefersReducedMotion()` returns `true`                    |

### Debugging Checklist

1. **Pill not snapping to zone?**
   - Check zone is registered with `useSkillCoordinator`
   - Verify zone `accepts` includes skill type
   - Check `defaultMagnetRadius` (80px) is large enough for the layout
   - Verify zone element exists in DOM and has non-zero dimensions

2. **Pills not combining?**
   - Both pills must be registered via `registerPill()`
   - Target pill must have `skill-floating` class or `_floating = true`
   - Check `coordinator.canCombine()` returns a valid mode
   - Verify within `proximityDetect` distance (100px)

3. **Spring motion feels wrong?**
   - Check which `LIQUID_SPRING_PRESETS` preset is active
   - Stiffness controls responsiveness (higher = snappier, less liquid)
   - Damping controls oscillation (higher = less bounce)
   - Verify `resetMagneticVelocity()` called on drag end

4. **Collision deformation not showing?**
   - Check `collisionConfig.enabled` is `true`
   - Verify pills are close enough (within `startDistance` = 120px for deformation to begin)
   - Check element transforms aren't being overridden by other CSS

5. **Bar not dragging?**
   - Verify `useBarDrag` received correct `barSelector`
   - Check bar element has `position: fixed`
   - Confirm physics registration via `physics.getDraggable('inputBar')`

---

## File Reference

| File                                     | Lines | Purpose                                                                                      |
| ---------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `web/composables/useSkillPhysics.ts`     | 1,942 | Core physics composable: drag, proximity, springs, collision, combination, generic draggable |
| `web/composables/useSkillAnimations.ts`  | 326   | Pill lifecycle animations: enter, drop, remove, combine, drag micro-interactions             |
| `web/composables/useBarDrag.ts`          | 237   | InputBar vertical drag with physics integration                                              |
| `web/utils/liquidMerge.ts`               | ~540  | Liquid merge animation: SVG goo filter, deformation calculation, oil-drop physics            |
| `web/utils/frameCoordinator.ts`          | ~175  | Central RAF loop manager with priority-ordered subscribers                                   |
| `web/composables/useSkillCoordinator.ts` | --    | Zone registry, skill types, canCombine() -- queried by physics                               |
| `web/composables/useMotion.ts`           | --    | Motion preferences: reduced motion detection, duration/easing from CSS variables             |
| `web/composables/useRippleEffect.ts`     | --    | Viewport edge ripple effect (optional consumer)                                              |
| `web/types/skills.ts`                    | --    | SkillV2, ZoneDefinition, CombineMode type definitions                                        |
| `web/services/eventBus.ts`               | --    | Event bus for `skill:combine` events                                                         |

---

## Changelog

- **v1.0** - Initial multi-zone physics implementation
- **v1.1** - Added pill combination with hold timer
- **v1.2** - Added liquid merge animation
- **v1.3** - Added collision physics with oil-drop deformation
- **v1.4** - Added generic draggable support (widgets, InputBar)
- **v1.5** - Added viewport edge ripple detection
- **v1.6** - Documentation created (original)
- **v2.0** - Structural rewrite: updated to skill terminology, added useSkillAnimations and useBarDrag documentation, verified all constants against source code, updated spring config to reflect liquid spring presets

---

_Last verified: 2026-02-23_
