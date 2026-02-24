# Frame Coordinator System Documentation

> **Why this doc:** The FrameCoordinator consolidates all RAF loops into a single tick with priority ordering. Read this when adding a new animation subscriber or debugging frame timing issues.
>
> **Related systems:** [DOTMATRIX_SYSTEM.md](./DOTMATRIX_SYSTEM.md) | [SKILL_PHYSICS_SYSTEM.md](./SKILL_PHYSICS_SYSTEM.md) | [SPEECH_SYSTEM.md](./SPEECH_SYSTEM.md) | [MAGNETIC_ATTACHMENT_SYSTEM.md](./MAGNETIC_ATTACHMENT_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The FrameCoordinator is a centralized requestAnimationFrame (RAF) loop manager that consolidates multiple animation subscribers into a single coordinated tick. It provides priority-based execution ordering, normalized delta time calculations, and automatic lifecycle management.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Contract and Invariants](#contract-and-invariants)
4. [Data Flow](#data-flow)
5. [Algorithm Details](#algorithm-details)
6. [Configuration Reference](#configuration-reference)
7. [Failure Modes](#failure-modes)
8. [Code Examples](#code-examples)
9. [File Reference](#file-reference)
10. [Reference Mapping](#reference-mapping)
11. [Changelog](#changelog)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SUBSCRIBERS                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │  handtrack  │ │   physics   │ │  dotmatrix  │ │   shimmer   │               │
│  │ TRACKING(0) │ │  PHYSICS(1) │ │  RENDER(2)  │ │  RENDER(2)  │               │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘               │
│         │               │               │               │                        │
│         └───────────────┴───────────────┴───────────────┘                        │
│                                  │                                               │
│                                  ▼                                               │
└──────────────────────────────────┼───────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FRAME COORDINATOR                                       │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                        SUBSCRIPTION REGISTRY                              │  │
│  │  Map<string, Subscriber>                                                  │  │
│  │  ┌─────────────────┬─────────────────┬────────────────┬─────────────────┐ │  │
│  │  │  id: 'handtrack'│ id: 'dotmatrix' │ id: 'shimmer'  │ id: 'visualizer'│ │  │
│  │  │  priority: 0    │ priority: 2     │ priority: 2    │ priority: 2     │ │  │
│  │  │  enabled: true  │ enabled: true   │ enabled: true  │ enabled: false  │ │  │
│  │  └─────────────────┴─────────────────┴────────────────┴─────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│  ┌───────────────────────────────────┼───────────────────────────────────────┐  │
│  │                    TICK LOOP                                              │  │
│  │                                                                           │  │
│  │  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐         │  │
│  │  │ Calculate Delta│ ──▶ │ Sort by        │ ──▶ │ Execute in     │         │  │
│  │  │ + Clamp        │     │ Priority       │     │ Order          │         │  │
│  │  └────────────────┘     └────────────────┘     └────────────────┘         │  │
│  │                                                                           │  │
│  │  deltaMs = now - lastTime                                                 │  │
│  │  deltaFactor = clamp(deltaMs / 16.67, 0, 5)                               │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│  ┌───────────────────────────────────┼───────────────────────────────────────┐  │
│  │                    LIFECYCLE                                              │  │
│  │                                                                           │  │
│  │  Auto-start: First subscriber → start()                                   │  │
│  │  Auto-stop: Last unsubscribe → stop()                                     │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRAME OUTPUT                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                           FrameInfo                                         ││
│  │  {                                                                          ││
│  │    now: 16782345.23,        // performance.now() timestamp                  ││
│  │    deltaMs: 16.7,           // ms since last frame                          ││
│  │    deltaFactor: 1.0         // normalized (1.0 = 60fps baseline)            ││
│  │  }                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Priority Levels

The coordinator defines three priority levels that control execution order within each frame:

```typescript
export const Priority = {
  TRACKING: 0, // Input processing (hand tracking, etc)
  PHYSICS: 1, // Physics updates (springs, collisions)
  RENDER: 2, // Visual updates (particles, effects)
} as const;

export type PriorityLevel = (typeof Priority)[keyof typeof Priority];
```

**Execution Order:** Lower numbers execute first. Within a single frame:

1. `TRACKING` (0) - Read input state before anything else uses it
2. `PHYSICS` (1) - Calculate positions based on input
3. `RENDER` (2) - Draw using final calculated positions

### FrameInfo

Each tick callback receives timing information:

```typescript
export interface FrameInfo {
  now: number; // performance.now() timestamp
  deltaMs: number; // Milliseconds since last frame
  deltaFactor: number; // Normalized delta (1.0 = 60fps)
}
```

### Subscriber

Internal representation of a registered callback:

```typescript
interface Subscriber {
  callback: FrameCallback;
  priority: PriorityLevel;
  enabled: boolean;
}
```

---

## Contract and Invariants

### Guarantees Provided by the Coordinator

| Guarantee           | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| **Single RAF**      | Only one `requestAnimationFrame` loop runs, regardless of subscriber count |
| **Priority Order**  | Subscribers execute in priority order (TRACKING → PHYSICS → RENDER)        |
| **Stable Order**    | Same-priority subscribers execute in registration order                    |
| **Error Isolation** | Callback errors are caught and logged; they don't break other subscribers  |
| **Auto Lifecycle**  | Loop auto-starts with first subscriber, auto-stops when empty              |
| **Delta Clamping**  | `deltaFactor` is always in range [0, 5] to prevent physics explosions      |

### Required Fields

| Method                              | Required Parameters                     | Optional                          |
| ----------------------------------- | --------------------------------------- | --------------------------------- |
| `subscribe(id, callback, priority)` | `id: string`, `callback: FrameCallback` | `priority` (defaults to `RENDER`) |
| `unsubscribe(id)`                   | `id: string`                            | —                                 |
| `enable(id)` / `disable(id)`        | `id: string`                            | —                                 |

### Canonical Data Shapes

The `FrameInfo` object passed to callbacks has a fixed shape:

```typescript
{
  now: number,        // Always present, performance.now() value
  deltaMs: number,    // Always present, >= 0
  deltaFactor: number // Always present, clamped to [0, 5]
}
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRAME LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. SUBSCRIBE (one-time setup)                                              │
│     ┌──────────────────┐                                                    │
│     │ subscriber calls │                                                    │
│     │ subscribe(id,    │                                                    │
│     │   callback,      │                                                    │
│     │   priority)      │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  2. AUTO-START (if first subscriber)                                        │
│     ┌──────────────────┐                                                    │
│     │ subscribers.size │                                                    │
│     │   === 1?         │                                                    │
│     │ → start()        │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  3. RAF SCHEDULED                                                           │
│     ┌──────────────────┐                                                    │
│     │ requestAnimation │                                                    │
│     │   Frame(tick)    │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  4. TICK EXECUTES                                                           │
│     ┌──────────────────┐                                                    │
│     │ a) Calculate     │                                                    │
│     │    deltaMs       │                                                    │
│     │    deltaFactor   │                                                    │
│     │                  │                                                    │
│     │ b) Sort if       │                                                    │
│     │    needsSort     │                                                    │
│     │                  │                                                    │
│     │ c) For each      │                                                    │
│     │    enabled sub:  │                                                    │
│     │    callback()    │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  5. SCHEDULE NEXT                                                           │
│     ┌──────────────────┐                                                    │
│     │ requestAnimation │                                                    │
│     │   Frame(tick)    │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ↺ (repeat from step 4)                                         │
│                                                                             │
│  6. UNSUBSCRIBE                                                             │
│     ┌──────────────────┐                                                    │
│     │ unsubscribe(id)  │                                                    │
│     │ → remove from    │                                                    │
│     │   map            │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  7. AUTO-STOP (if last subscriber)                                          │
│     ┌──────────────────┐                                                    │
│     │ subscribers.size │                                                    │
│     │   === 0?         │                                                    │
│     │ → stop()         │                                                    │
│     │ → cancelAnimation│                                                    │
│     │   Frame()        │                                                    │
│     └──────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Algorithm Details

### Delta Time Calculation

The coordinator normalizes frame timing to provide frame-rate-independent animation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DELTA TIME NORMALIZATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CONSTANTS:                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  FRAME_BASELINE_MS = 1000 / 60 = 16.67ms  (60fps baseline)             │ │
│  │  MAX_DELTA_MULTIPLIER = 5                  (max 5x slowdown)           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  CALCULATION:                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  deltaMs = currentTime - lastTime                                      │ │
│  │                                                                        │ │
│  │  rawFactor = deltaMs / FRAME_BASELINE_MS                               │ │
│  │                                                                        │ │
│  │  deltaFactor = clamp(rawFactor, 0, MAX_DELTA_MULTIPLIER)               │ │
│  │              = Math.min(Math.max(rawFactor, 0), 5)                     │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  EXAMPLES:                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Frame Rate │ deltaMs │ rawFactor │ deltaFactor │ Usage                │ │
│  │  ───────────┼─────────┼───────────┼─────────────┼───────────────────── │ │
│  │  60fps      │ 16.67   │ 1.0       │ 1.0         │ Normal operation     │ │
│  │  120fps     │ 8.33    │ 0.5       │ 0.5         │ High refresh monitor │ │
│  │  30fps      │ 33.33   │ 2.0       │ 2.0         │ Heavy load           │ │
│  │  15fps      │ 66.67   │ 4.0       │ 4.0         │ Very heavy load      │ │
│  │  Tab hidden │ 1000.0  │ 59.9      │ 5.0         │ CLAMPED to prevent   │ │
│  │             │         │           │             │ physics explosion    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  WHY CLAMPING MATTERS:                                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  Without clamping, a tab returning from background after 1 second      │ │
│  │  would have deltaFactor ≈ 60, causing:                                 │ │
│  │                                                                        │ │
│  │  • Spring physics to overshoot wildly                                  │ │
│  │  • Particles to teleport across screen                                 │ │
│  │  • Animations to "jump" instead of smooth resume                       │ │
│  │                                                                        │ │
│  │  With MAX_DELTA_MULTIPLIER = 5:                                        │ │
│  │  • Maximum single-frame jump is 5x normal                              │ │
│  │  • Equivalent to ~83ms or ~12fps                                       │ │
│  │  • Animations catch up smoothly over several frames                    │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Priority Sorting

Subscribers are sorted by priority only when the list changes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRIORITY SORTING                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LAZY SORTING STRATEGY:                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  needsSort = false (initially)                                         │ │
│  │                                                                        │ │
│  │  On subscribe() or unsubscribe():                                      │ │
│  │    needsSort = true                                                    │ │
│  │                                                                        │ │
│  │  On tick(), if needsSort:                                              │ │
│  │    sortedSubscribers = [...subscribers].sort(byPriority)               │ │
│  │    needsSort = false                                                   │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  EXECUTION ORDER EXAMPLE:                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  Registered (in order):        After sort:                             │ │
│  │  ┌──────────────────┐          ┌──────────────────┐                    │ │
│  │  │ dotmatrix (2)    │    ──▶   │ handtrack (0)    │  ← executes first  │ │
│  │  │ handtrack (0)    │          │ dotmatrix (2)    │                    │ │
│  │  │ shimmer (2)      │          │ shimmer (2)      │  ← executes last   │ │
│  │  └──────────────────┘          └──────────────────┘                    │ │
│  │                                                                        │ │
│  │  Sort is STABLE: dotmatrix stays before shimmer (both priority 2)      │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Enable/Disable Pattern

Subscribers can be temporarily disabled without unsubscribing:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENABLE/DISABLE PATTERN                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USE CASE: Visualizer that should pause when panel is hidden                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  // Subscribe once on init                                             │ │
│  │  frameCoordinator.subscribe('visualizer', draw, Priority.RENDER);      │ │
│  │                                                                        │ │
│  │  // When panel hides:                                                  │ │
│  │  frameCoordinator.disable('visualizer');                               │ │
│  │  // Callback stays registered but won't be called                      │ │
│  │                                                                        │ │
│  │  // When panel shows:                                                  │ │
│  │  frameCoordinator.enable('visualizer');                                │ │
│  │  // Callback resumes being called                                      │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ADVANTAGES OVER UNSUBSCRIBE/RESUBSCRIBE:                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  1. No need to re-sort (no needsSort flag set)                         │ │
│  │  2. No closure recreation                                              │ │
│  │  3. Subscriber position in Map preserved                               │ │
│  │  4. Simpler state management in component                              │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

All configuration values are defined in `web/utils/frameCoordinator.ts`:

| Constant               | Value             | Line | Description                       |
| ---------------------- | ----------------- | ---- | --------------------------------- |
| `FRAME_BASELINE_MS`    | `16.67` (1000/60) | 5    | Baseline frame duration for 60fps |
| `MAX_DELTA_MULTIPLIER` | `5`               | 6    | Maximum allowed deltaFactor       |
| `Priority.TRACKING`    | `0`               | 10   | Input processing priority         |
| `Priority.PHYSICS`     | `1`               | 11   | Physics updates priority          |
| `Priority.RENDER`      | `2`               | 12   | Visual updates priority           |

### Default Values

| Setting               | Default               | Notes                                  |
| --------------------- | --------------------- | -------------------------------------- |
| Default priority      | `Priority.RENDER` (2) | Set in `subscribe()` parameter default |
| Initial enabled state | `true`                | New subscribers start enabled          |

---

## Failure Modes

| Scenario                              | Behavior                                                    | How to Detect                                           |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| **Callback throws**                   | Error caught, logged to console, other subscribers continue | Console: `[FrameCoordinator] Error in subscriber "id":` |
| **Duplicate ID**                      | Silently overwrites existing subscriber                     | Previous callback stops being called                    |
| **Unsubscribe unknown ID**            | No-op (Map.delete on missing key)                           | Silent, no error                                        |
| **Enable/disable unknown ID**         | No-op (subscriber not found)                                | `isEnabled(id)` returns `false`                         |
| **Tab backgrounded**                  | deltaFactor clamped to 5, animations slow but don't explode | Large `deltaMs` values in FrameInfo                     |
| **Subscriber blocks (long callback)** | Frame drops, all subsequent subscribers delayed             | Janky animation, high deltaMs                           |

### Debugging Checklist

1. **Subscriber not being called?**
   - Verify subscription: ID should be unique
   - Check enabled state: `frameCoordinator.isEnabled('id')`
   - Confirm coordinator is running: Check if any subscriber is active

2. **Wrong execution order?**
   - Verify priority values (lower = earlier)
   - Check if using `Priority` constants vs raw numbers

3. **Animation jumping/teleporting?**
   - Check if using `deltaFactor` for physics (should be used, not ignored)
   - Verify clamping is working (deltaFactor should never exceed 5)

4. **Memory leak (RAF keeps running)?**
   - Ensure `unsubscribe()` is called on cleanup
   - Check component unmount handlers

---

## Code Examples

### Hand Tracking (TRACKING Priority)

From `web/graphics/dotmatrix/handtrack.ts:1716-1735`:

```typescript
// Subscribe to FrameCoordinator or fallback
const frameCoordinator = dmWindow.frameCoordinator;
const FramePriority = dmWindow.FramePriority;
if (frameCoordinator && FramePriority) {
  frameCoordinator.subscribe('handtrack', () => this.detectAndUpdate(), FramePriority.TRACKING);
  if (DEBUG_HANDTRACK) console.log('[handtrack] Subscribed to FrameCoordinator');
} else {
  if (DEBUG_HANDTRACK)
    console.log('[handtrack] FrameCoordinator not available, using standalone RAF');
  const fallbackLoop = () => {
    if (!this.isEnabled) return;
    this.detectAndUpdate();
    this.animationFrameId = requestAnimationFrame(fallbackLoop);
  };
  fallbackLoop();
}
```

Cleanup in `stop()` at line 1751:

```typescript
dmWindow.frameCoordinator?.unsubscribe('handtrack');
```

### Dotmatrix Rendering (RENDER Priority)

From `web/graphics/dotmatrix/core.ts:2070-2085`:

```typescript
// Use FrameCoordinator if available
if (window.frameCoordinator) {
  window.frameCoordinator.subscribe(
    'dotmatrix',
    (frameInfo: { now: number }) => this.animate(frameInfo.now),
    window.FramePriority?.RENDER ?? 2
  );
} else {
  const fallbackLoop = (now: number) => {
    if (!this.animationActive) return;
    this.animate(now);
    requestAnimationFrame(fallbackLoop);
  };
  requestAnimationFrame(fallbackLoop);
}
```

Cleanup at line 2047:

```typescript
window.frameCoordinator?.unsubscribe('dotmatrix');
```

### Shimmer Effect (RENDER Priority)

From `web/utils/shimmer.ts:446-451`:

```typescript
// Subscribe to FrameCoordinator or fallback to standalone RAF
try {
  frameCoordinator.subscribe('shimmer', shimmerTick, Priority.RENDER);
} catch (_) {
  animate();
}
```

Cleanup at line 459-463:

```typescript
// Unsubscribe from FrameCoordinator
try {
  frameCoordinator.unsubscribe('shimmer');
} catch (_) {
  // ignore
}
```

### Speech Visualizer (RENDER Priority)

From `web/composables/useSpeech.ts:479-483`:

```typescript
if (frameCoordinator) {
  frameCoordinator.subscribe('visualizer', visualizerTick, Priority.RENDER);
} else {
  drawVisualizer();
}
```

Cleanup at line 490-496:

```typescript
if (frameCoordinator) {
  try {
    frameCoordinator.unsubscribe('visualizer');
  } catch {
    // ignore
  }
}
```

### Using Delta Factor for Smooth Animation

```typescript
frameCoordinator.subscribe(
  'myAnimation',
  (frameInfo) => {
    // Move 5 pixels per frame at 60fps, scale with frame rate
    const speed = 5 * frameInfo.deltaFactor;
    position.x += velocity.x * speed;
    position.y += velocity.y * speed;

    // Apply damping (0.95^1 at 60fps, 0.95^2 at 30fps, etc.)
    const damping = Math.pow(0.95, frameInfo.deltaFactor);
    velocity.x *= damping;
    velocity.y *= damping;
  },
  Priority.PHYSICS
);
```

---

## File Reference

| File                                  | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `web/utils/frameCoordinator.ts`       | Core implementation (singleton)      |
| `web/types/global.d.ts`               | TypeScript types for window exposure |
| `web/graphics/dotmatrix/handtrack.ts` | TRACKING priority subscriber         |
| `web/graphics/dotmatrix/core.ts`      | RENDER priority subscriber           |
| `web/utils/shimmer.ts`                | RENDER priority subscriber           |
| `web/composables/useSpeech.ts`        | RENDER priority subscriber           |

---

## Reference Mapping

This table maps documentation claims to their authoritative source locations:

| Doc Claim                     | Source of Truth        | Location                      |
| ----------------------------- | ---------------------- | ----------------------------- |
| `FRAME_BASELINE_MS = 1000/60` | Constant definition    | `frameCoordinator.ts:5`       |
| `MAX_DELTA_MULTIPLIER = 5`    | Constant definition    | `frameCoordinator.ts:6`       |
| Priority TRACKING = 0         | `Priority` object      | `frameCoordinator.ts:10`      |
| Priority PHYSICS = 1          | `Priority` object      | `frameCoordinator.ts:11`      |
| Priority RENDER = 2           | `Priority` object      | `frameCoordinator.ts:12`      |
| FrameInfo interface           | Type definition        | `frameCoordinator.ts:17-21`   |
| Subscriber interface          | Internal type          | `frameCoordinator.ts:25-29`   |
| Delta clamping formula        | `tick()` method        | `frameCoordinator.ts:134`     |
| Auto-start behavior           | `subscribe()` method   | `frameCoordinator.ts:54-57`   |
| Auto-stop behavior            | `unsubscribe()` method | `frameCoordinator.ts:69-72`   |
| Error isolation               | `tick()` try-catch     | `frameCoordinator.ts:150-154` |
| Lazy sorting                  | `needsSort` flag       | `frameCoordinator.ts:137-142` |
| Global exposure               | Window assignment      | `frameCoordinator.ts:167-170` |
| Type declarations             | Global types           | `global.d.ts:124-136`         |
| Handtrack usage               | `startTracking()`      | `handtrack.ts:1716-1735`      |
| Dotmatrix usage               | `resume()`             | `core.ts:2070-2085`           |
| Shimmer usage                 | `showShimmer()`        | `shimmer.ts:446-451`          |
| Speech usage                  | visualizer init        | `useSpeech.ts:479-483`        |

---

## Changelog

- **v1.0** - Initial FrameCoordinator implementation with priority system
- **v1.1** - Added enable/disable pattern for temporary pausing
- **v1.2** - Added global window exposure for legacy script compatibility
- **v1.3** - Documentation created following INTENT_COORDINATOR_SYSTEM.md template

---

_Last verified: 2026-02-23_
