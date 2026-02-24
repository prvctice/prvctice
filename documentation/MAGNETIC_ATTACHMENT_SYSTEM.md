# Magnetic Attachment System Documentation

> **Why this doc:** The Magnetic Attachment system keeps widgets snapped to target elements using RAF-based position enforcement. Read this when working on widget docking, snap behavior, or understanding how widgets stay attached during movement.
>
> **Related systems:** [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md) | [SKILL_PHYSICS_SYSTEM.md](./SKILL_PHYSICS_SYSTEM.md) | [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The Magnetic Attachment system provides RAF-based continuous position enforcement for widgets that need to snap and stay attached to target elements (like the input bar). It prevents drift during widget movement from any input source (mouse, touch, hand tracking, gamepad).

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
│                              INPUT SOURCES                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │  Pointer Drag   │ │  Hand Tracking  │ │     Gamepad     │ │      Touch      ││
│  │  (pointermove)  │ │  (handtrack.ts) │ │  (useGamepad)   │ │   (touchmove)   ││
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘│
│           │                   │                   │                   │         │
│           └───────────────────┴─────────┬─────────┴───────────────────┘         │
│                                         │                                       │
│                                         ▼                                       │
│                              ┌────────────────────┐                             │
│                              │  Widget Component  │                             │
│                              │  (drag handlers)   │                             │
│                              └──────────┬─────────┘                             │
└─────────────────────────────────────────┼───────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        MAGNETIC ATTACHMENT COMPOSABLE                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         useMagneticAttachment()                           │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │  │
│  │  │  checkMagneticSnap  │  │    attach/detach    │  │   syncToTarget    │  │  │
│  │  │  (during drag)      │  │  (state changes)    │  │  (position sync)  │  │  │
│  │  └──────────┬──────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │  │
│  │             │                        │                       │            │  │
│  │             ▼                        ▼                       ▼            │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                     RAF MONITORING LOOP                             │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ When attached && !dragging:                                     ││  │  │
│  │  │  │   - Get target element rect (e.g., #bar)                        ││  │  │
│  │  │  │   - Calculate snap position based on edge                       ││  │  │
│  │  │  │   - Call onPositionUpdate(snapY) to enforce position            ││  │  │
│  │  │  └─────────────────────────────────────────────────────────────────┘│  │  │
│  │  │                              │                                      │  │  │
│  │  │                              ▼                                      │  │  │
│  │  │              requestAnimationFrame(monitoringLoop)                  │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│  ┌───────────────────────────────────┼───────────────────────────────────────┐  │
│  │                          EVENT BUS INTEGRATION                            │  │
│  │  ┌─────────────────────────────┐  ┌────────────────────────────────────┐  │  │
│  │  │ handtrack:grab-end listener │  │ physics:snap emitter               │  │  │
│  │  │ (clears isDragging flag)    │  │ (notifies physics systems)         │  │  │
│  │  └─────────────────────────────┘  └────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TARGET ELEMENT                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                           #bar (InputBar)                                 │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │  getBoundingClientRect() → { top, bottom, left, right, ... }        │  │  │
│  │  │                                                                     │  │  │
│  │  │  Widget snaps:                                                      │  │  │
│  │  │   • ABOVE bar: widget.bottom aligns with bar.top                    │  │  │
│  │  │   • BELOW bar: widget.top aligns with bar.bottom                    │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### MagneticAttachmentConfig

Configuration options for initializing the composable:

```typescript
// web/composables/useMagneticAttachment.ts:20-39
export interface MagneticAttachmentConfig {
  /** CSS selector for target element (default: '#bar') */
  targetSelector?: string;
  /** Distance to start magnetic pull (default: 100px) */
  pullThreshold?: number;
  /** Distance to trigger snap (default: 30px) */
  snapThreshold?: number;
  /** Distance to detach when dragging away (default: 50px) */
  detachThreshold?: number;
  /** Allowed edges: 'top', 'bottom', 'both' (default: 'both') */
  edge?: 'top' | 'bottom' | 'both';
  /** Pull strength 0-1 (default: 0.18) */
  pullStrength?: number;
  /** Get current widget height (required for snap calculations) */
  getWidgetHeight: () => number;
  /** Callback when position should update */
  onPositionUpdate: (top: number) => void;
  /** Callback when attachment state changes */
  onAttachmentChange?: (attached: boolean, edge: 'top' | 'bottom' | null) => void;
}
```

### MagneticAttachmentReturn

The composable returns reactive state and control methods:

```typescript
// web/composables/useMagneticAttachment.ts:41-60
export interface MagneticAttachmentReturn {
  /** Whether widget is magnetically attached */
  isAttached: Ref<boolean>;
  /** Which edge attached to */
  attachedEdge: Ref<'top' | 'bottom' | null>;
  /** Start monitoring (call when drag starts or widget becomes visible) */
  startMonitoring: () => void;
  /** Stop monitoring (call when widget hides or unmounts) */
  stopMonitoring: () => void;
  /** Check magnetic snap during drag - returns adjusted Y and snap info */
  checkMagneticSnap: (newTop: number) => MagneticSnapResult;
  /** Check if should detach based on current Y position */
  checkDetach: (currentY: number) => boolean;
  /** Manually attach to edge */
  attach: (edge: 'top' | 'bottom') => void;
  /** Manually detach */
  detach: () => void;
  /** Force re-sync position to target (call after bar moves) */
  syncToTarget: () => void;
}
```

### MagneticSnapResult

Result from checking magnetic snap during a drag operation:

```typescript
// web/composables/useMagneticAttachment.ts:62-69
export interface MagneticSnapResult {
  /** Whether this position would cause a snap */
  snapped: boolean;
  /** Adjusted Y position (with magnetic pull or snap applied) */
  snapY: number;
  /** Which edge we'd snap to, if any */
  edge: 'top' | 'bottom' | null;
}
```

### Dual Implementation Pattern

The magnetic system has two implementations for different use cases:

| Implementation          | File                       | Use Case                            |
| ----------------------- | -------------------------- | ----------------------------------- |
| `useMagneticAttachment` | `useMagneticAttachment.ts` | Vue composable for reactive widgets |
| `makeMagnetic`          | `magnet.ts`                | DOM-based for non-Vue elements      |

Both share the same core algorithm but differ in integration:

- **useMagneticAttachment**: Uses Vue refs, event bus, external position callbacks
- **makeMagnetic**: Direct DOM manipulation with CSS classes

---

## Contract and Invariants

### Guarantees Provided by the Composable

| Guarantee                           | Description                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| **Continuous Position Enforcement** | When attached, RAF loop ensures widget stays snapped even when target moves               |
| **No Drift**                        | Position is recalculated every frame, preventing accumulated jitter from any input source |
| **Edge Priority**                   | When both edges are valid, closer edge wins (by absolute distance)                        |
| **Clean Lifecycle**                 | RAF loop auto-stops on unmount, event listeners are cleaned up                            |
| **State Consistency**               | `isAttached` and `attachedEdge` are always synchronized                                   |

### Required Configuration

| Field              | Required | Default  | Description                                                      |
| ------------------ | -------- | -------- | ---------------------------------------------------------------- |
| `getWidgetHeight`  | **Yes**  | —        | Function returning current widget height for snap calculations   |
| `onPositionUpdate` | **Yes**  | —        | Callback to update widget position (receives computed top value) |
| `targetSelector`   | No       | `'#bar'` | CSS selector for magnetic target element                         |
| `edge`             | No       | `'both'` | Which edges can attach: `'top'`, `'bottom'`, or `'both'`         |

### State Machine

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ATTACHMENT STATE MACHINE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   DETACHED                     ATTACHED                                         │
│   isAttached: false            isAttached: true                                 │
│   attachedEdge: null           attachedEdge: 'top' | 'bottom'                   │
│                                                                                 │
│       │                              │                                          │
│       │ checkMagneticSnap()          │ RAF loop continuously:                   │
│       │ returns snapped=true         │   - calculates snapY                     │
│       │ + edge                       │   - calls onPositionUpdate(snapY)        │
│       │                              │                                          │
│       ▼                              │                                          │
│   ┌───────────────┐                  │                                          │
│   │ attach(edge)  │─────────────────▶│                                          │
│   └───────────────┘                  │                                          │
│                                      │                                          │
│       ▲                              │ checkDetach() returns true               │
│       │                              │ OR target disappears                     │
│       │                              ▼                                          │
│       │◀─────────────────────── detach()                                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          DRAG OPERATION LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. WIDGET MOUNT / VISIBILITY                                                   │
│     ┌──────────────────────────────────────────────────────────────────────────┐│
│     │  startMonitoring()                                                       ││
│     │    → Sets isMonitoring = true                                            ││
│     │    → Starts RAF loop: requestAnimationFrame(monitoringLoop)              ││
│     └──────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  2. USER STARTS DRAG                                                            │
│     ┌──────────────────────────────────────────────────────────────────────────┐│
│     │  Widget's onDragStart(e) handler fires                                   ││
│     │    → Sets isDragging = true                                              ││
│     │    → Captures pointer                                                    ││
│     └──────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  3. USER DRAGS (each pointermove)                                               │
│     ┌──────────────────────────────────────────────────────────────────────────┐│
│     │  a. Calculate new position: newTop = e.clientY - dragOffsetY             ││
│     │                                                                          ││
│     │  b. If attached, check detach:                                           ││
│     │       if (isAttached && checkDetach(newTop)) magneticDetach()            ││
│     │                                                                          ││
│     │  c. If not attached, check for snap:                                     ││
│     │       const magnetic = checkMagneticSnap(newTop)                         ││
│     │       newTop = magnetic.snapY  // May have magnetic pull applied         ││
│     │       if (magnetic.snapped) magneticAttach(magnetic.edge)                ││
│     │                                                                          ││
│     │  d. Update widget position: pos.value = { left, top: newTop }            ││
│     └──────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  4. USER ENDS DRAG                                                              │
│     ┌──────────────────────────────────────────────────────────────────────────┐│
│     │  Widget's onDragEnd(e) handler fires                                     ││
│     │    → Releases pointer capture                                            ││
│     │    → Persists position to storage                                        ││
│     │                                                                          ││
│     │  Hand tracking: eventBus.emit('handtrack:grab-end')                      ││
│     │    → Composable listener sets isDragging = false                         ││
│     └──────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  5. RAF LOOP WHEN ATTACHED (continuous)                                         │
│     ┌──────────────────────────────────────────────────────────────────────────┐│
│     │  monitoringLoop():                                                       ││
│     │    if (isAttached && !isDragging) {                                      ││
│     │      targetRect = document.querySelector(targetSelector).getBoundingClientRect()││
│     │      snapY = calculateSnapY(targetRect, attachedEdge)                     ││
│     │      onPositionUpdate(snapY)  // → widget.pos.top = snapY                 ││
│     │    }                                                                      ││
│     │    requestAnimationFrame(monitoringLoop)                                  ││
│     └───────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
│  6. WIDGET UNMOUNT / HIDE                                                        │
│     ┌────────────────────────────────────────────────────────────────────────── ┐│
│     │  stopMonitoring()                                                         ││
│     │    → Sets isMonitoring = false                                            ││
│     │    → Cancels RAF: cancelAnimationFrame(rafId)                             ││
│     │                                                                           ││
│     │  onBeforeUnmount()                                                        ││
│     │    → eventBus.off('handtrack:grab-end', ...)                              ││
│     └───────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────── ──┘
```

---

## Algorithm Details

### Magnetic Snap Calculation

The core snap algorithm determines whether to pull, snap, or ignore based on distance:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    MAGNETIC SNAP DISTANCE ZONES                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Distance from edge:                                                            │
│                                                                                 │
│     0px                30px              100px              ∞                   │
│      ├──────────────────┼──────────────────┼──────────────────────────────▶     │
│      │                  │                  │                                    │
│      │   SNAP ZONE      │   PULL ZONE      │   NO EFFECT                        │
│      │   (immediate)    │   (gradual)      │                                    │
│      │                  │                  │                                    │
│      │   snapped: true  │  snapped: false  │  snapped: false                    │
│      │   snapY: exact   │  snapY: pulled   │  snapY: original                   │
│      │   edge: 'top'    │  edge: null      │  edge: null                        │
│      │                  │                  │                                    │
│      ▼                  ▼                  ▼                                    │
│  Target edge         snapThreshold     pullThreshold                            │
│                          (30px)           (100px)                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Pull Force Calculation

When in the pull zone, magnetic force increases as the widget approaches:

```typescript
// web/composables/useMagneticAttachment.ts:152-157
if (closerDist < pullThreshold) {
  const targetY = calculateSnapY(targetRect, closerEdge);
  const force = pullStrength * (1 - closerDist / pullThreshold);
  const pulledY = newTop + (targetY - newTop) * force;
  return { snapped: false, snapY: pulledY, edge: null };
}
```

Visual representation of pull force:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PULL FORCE VS DISTANCE                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Pull Force                                                                     │
│  (0-1)                                                                          │
│    │                                                                            │
│ 0.18│ ●────────                                                                 │
│     │          \                                                                │
│     │           \                                                               │
│     │            \                                                              │
│     │             \                                                             │
│     │              \                                                            │
│     │               \                                                           │
│    0│────────────────●──────────────────────▶ Distance                          │
│     0              100px                                                        │
│               (pullThreshold)                                                   │
│                                                                                 │
│  Formula: force = pullStrength × (1 - distance / pullThreshold)                 │
│                                                                                 │
│  At 0px:   force = 0.18 × (1 - 0/100) = 0.18 (maximum)                          │
│  At 50px:  force = 0.18 × (1 - 50/100) = 0.09 (half)                            │
│  At 100px: force = 0.18 × (1 - 100/100) = 0 (none)                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Edge Selection Priority

When multiple edges are valid (edge='both'), the system picks the closer one:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EDGE PRIORITY ALGORITHM                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Widget Position                     Target (e.g., InputBar)                    │
│                                                                                 │
│  ┌─────────────┐                                                                │
│  │   Widget    │                                                                │
│  │             │                                                                │
│  └─────────────┘                                                                │
│        │                                                                        │
│        │ distToTop = |widget.bottom - target.top|                               │
│        │ distToBottom = |widget.top - target.bottom|                            │
│        ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         TARGET ELEMENT                                      ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  Selection Logic (useMagneticAttachment.ts:129-144):                            │
│                                                                                 │
│    1. Start with closerEdge = null, closerDist = Infinity                       │
│    2. If allowTop && distToTop < closerDist:                                    │
│         closerEdge = 'top', closerDist = distToTop                              │
│    3. If allowBottom && distToBottom < closerDist:                              │
│         closerEdge = 'bottom', closerDist = distToBottom                        │
│    4. Use closerEdge for snap calculations                                      │
│                                                                                 │
│  Result: Widget always snaps to the closer edge.                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Snap Position Calculation

How the exact snap Y position is calculated for each edge:

```typescript
// web/composables/useMagneticAttachment.ts:102-111
function calculateSnapY(targetRect: DOMRect, edge: 'top' | 'bottom'): number {
  const widgetHeight = config.getWidgetHeight();
  if (edge === 'top') {
    // Position widget so bottom aligns with target top
    return targetRect.top - widgetHeight;
  } else {
    // Position widget so top aligns with target bottom
    return targetRect.bottom;
  }
}
```

Visual:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SNAP POSITION BY EDGE                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  EDGE = 'top' (widget above target)        EDGE = 'bottom' (widget below target)│
│                                                                                 │
│  ┌─────────────┐                                                                │
│  │   Widget    │ ◀── snapY = target.top - widgetHeight                          │
│  └─────────────┘                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                              TARGET                                         ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐                                                                │
│  │   Widget    │ ◀── snapY = target.bottom                                      │
│  └─────────────┘                                                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Why RAF is Needed

The RAF loop is critical because it prevents drift during target movement:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    THE DRIFT PROBLEM (without RAF)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Time 0:  Widget snaps to bar position Y=800                                    │
│           Widget.top = 800 - widgetHeight                                       │
│                                                                                 │
│  Time 1:  User resizes window                                                   │
│           Bar moves to Y=700                                                    │
│           Widget stays at old position (DRIFT!)                                 │
│                                                                                 │
│  Time 2:  User uses voice command to move bar                                   │
│           Bar moves to Y=650                                                    │
│           Widget still at old position (MORE DRIFT!)                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                    THE SOLUTION (with RAF)                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Every frame (16.67ms at 60fps):                                                │
│                                                                                 │
│    1. Get target rect: targetRect = target.getBoundingClientRect()              │
│    2. Calculate snap position: snapY = targetRect.top - widgetHeight            │
│    3. Update widget position: onPositionUpdate(snapY)                           │
│                                                                                 │
│  Result: Widget position is ALWAYS correct, regardless of:                      │
│    - Window resize                                                              │
│    - Target element animation                                                   │
│    - Hand tracking jitter                                                       │
│    - CSS transitions on target                                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

### Magnetic Thresholds (useMagneticConfig.ts:16-34)

| Threshold         | Value | Description                              |
| ----------------- | ----- | ---------------------------------------- |
| `pullThreshold`   | 100px | Distance to start magnetic attraction    |
| `snapThreshold`   | 30px  | Distance for immediate snap              |
| `detachThreshold` | 50px  | Distance to drag before detaching        |
| `pullStrength`    | 0.18  | Spring stiffness for magnetic pull (0-1) |
| `springStiffness` | 0.06  | Spring stiffness for smooth motion       |
| `springDamping`   | 0.75  | Damping to prevent oscillation           |

### Default Magnetic Target (useMagneticConfig.ts:62-69)

```typescript
export const DEFAULT_MAGNETIC_TARGET = {
  target: '#bar',
  pullThreshold: MAGNETIC_THRESHOLDS.pullThreshold, // 100
  snapThreshold: MAGNETIC_THRESHOLDS.snapThreshold, // 30
  detachThreshold: MAGNETIC_THRESHOLDS.detachThreshold, // 50
  edge: 'both' as const,
  pullStrength: MAGNETIC_THRESHOLDS.pullStrength, // 0.18
};
```

### makeMagnetic Options (magnet.ts:3-10)

| Option            | Type                          | Default                    | Description                        |
| ----------------- | ----------------------------- | -------------------------- | ---------------------------------- |
| `target`          | `string \| HTMLElement`       | `'#bar'`                   | CSS selector or element to snap to |
| `threshold`       | `number`                      | `10` (from AppSettings)    | Distance to trigger attachment     |
| `detachThreshold` | `number`                      | `max(threshold × 0.6, 10)` | Distance to detach                 |
| `edge`            | `'both' \| 'top' \| 'bottom'` | `'both'`                   | Allowed snap edges                 |
| `detachOnDown`    | `boolean`                     | `false`                    | Detach on pointer down             |

---

## Failure Modes

### What Happens When Things Break

| Scenario                           | Behavior                                                                                        | Detection                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Target element not found**       | `getTargetRect()` returns `null`; snap check returns original position; attached widgets detach | Widget doesn't snap; check `document.querySelector(targetSelector)` |
| **Widget height returns 0**        | Snap position calculated incorrectly (widget overlaps target)                                   | Visual overlap; check `getWidgetHeight()` return value              |
| **RAF loop not started**           | Widget snaps once but doesn't follow target movement                                            | Widget drifts when target moves; check `isMonitoring`               |
| **Event bus listener not cleaned** | Memory leak; stale callbacks on unmounted widgets                                               | Console errors on emit after unmount                                |
| **onPositionUpdate throws**        | RAF loop continues; position not updated                                                        | Widget freezes in place; check callback implementation              |

### Debugging Checklist

1. **Widget not snapping?**
   - Verify target element exists: `document.querySelector('#bar')`
   - Check threshold values: `pullThreshold` and `snapThreshold`
   - Verify `getWidgetHeight()` returns non-zero value
   - Check `edge` configuration matches expected snap direction

2. **Widget drifting after attachment?**
   - Verify `startMonitoring()` was called
   - Check `isMonitoring` internal state
   - Verify `onPositionUpdate` callback is updating widget position
   - Check for RAF cancellation: `stopMonitoring()` called prematurely?

3. **Snap position incorrect?**
   - Check `attachedEdge` value: `'top'` vs `'bottom'`
   - Verify `getWidgetHeight()` returns current height
   - Check target element hasn't changed (CSS selector still valid)

4. **Widget stuck in attached state?**
   - Verify `checkDetach()` is called during drag
   - Check `detachThreshold` value
   - Manually call `detach()` to reset state

---

## Code Examples

### Basic Widget Integration

From `web/components/WeatherTimeWidget.vue:132-154`:

```typescript
const {
  isAttached,
  attachedEdge,
  startMonitoring: startMagneticMonitoring,
  stopMonitoring: stopMagneticMonitoring,
  checkMagneticSnap,
  checkDetach,
  attach: magneticAttach,
  detach: magneticDetach,
} = useMagneticAttachment({
  targetSelector: '#bar',
  getWidgetHeight: () => size.value.h,
  onPositionUpdate: (top: number) => {
    // Update position when magnetic system enforces snap
    pos.value = { ...pos.value, top };
  },
  onAttachmentChange: () => {
    // Save attachment state when it changes
    saveAttached();
  },
});
```

### Drag Handler with Magnetic Snap

From `web/components/WeatherTimeWidget.vue:181-207`:

```typescript
function onDragMove(e: PointerEvent): void {
  if (!isDragging.value || e.pointerId !== activePointerId) return;

  let newLeft = e.clientX - dragOffsetX;
  let newTop = e.clientY - dragOffsetY;

  // Clamp to viewport
  const maxLeft = Math.max(0, window.innerWidth - size.value.w - 10);
  const maxTop = Math.max(0, window.innerHeight - size.value.h - 10);
  newLeft = Math.max(10, Math.min(maxLeft, newLeft));
  newTop = Math.max(10, Math.min(maxTop, newTop));

  // Check for detach if attached
  if (isAttached.value && checkDetach(newTop)) {
    magneticDetach();
  }

  // Apply magnetic pull/snap if not attached
  if (!isAttached.value) {
    const magnetic = checkMagneticSnap(newTop);
    newTop = magnetic.snapY;
    if (magnetic.snapped && magnetic.edge) {
      magneticAttach(magnetic.edge);
    }
  }

  pos.value = { left: newLeft, top: newTop };
}
```

### Lifecycle Management

From `web/components/WeatherTimeWidget.vue:775-783, 905-906, 926-929`:

```typescript
// Start monitoring when widget becomes visible
function ensureVisibleInit(): void {
  // ... position initialization ...

  // Start magnetic monitoring (RAF loop for continuous position sync)
  startMagneticMonitoring();
}

// Stop monitoring when widget hides
watch(
  () => visible.value,
  async (isVisible) => {
    if (!isVisible) {
      // Stop magnetic monitoring when hidden
      stopMagneticMonitoring();
    }
  }
);

// Clean up on unmount
onBeforeUnmount(() => {
  // Stop magnetic RAF loop
  stopMagneticMonitoring();
});
```

### Persisting Attachment State

From `web/components/WeatherTimeWidget.vue:604-614, 776-779`:

```typescript
// Read saved attachment state
const savedAttached = readSavedAttached();
if (savedAttached?.attached && savedAttached.edge) {
  // Use the composable to attach - it will start monitoring and sync position
  magneticAttach(savedAttached.edge);
}

// Save attachment state
function saveAttached(): void {
  storage.mirror.setJSON(LS_ATTACHED_KEY, {
    attached: isAttached.value,
    edge: attachedEdge.value,
  });
}
```

### Using makeMagnetic (DOM-based)

From `web/utils/magnet.ts:30-55`:

```typescript
import { makeMagnetic } from '@web/utils/magnet';

// In component mounted hook
onMounted(() => {
  const control = makeMagnetic(widgetEl, {
    target: '#bar',
    threshold: 15,
    edge: 'top',
    detachOnDown: true,
  });

  // Store for cleanup
  magneticControl = control;
});

onBeforeUnmount(() => {
  magneticControl?.destroy();
});
```

### Vue Directive Usage

From `web/directives/magnet.ts:13-19`:

```vue
<template>
  <div v-magnet="{ target: '#bar', edge: 'bottom' }" class="magnetic widget">
    <!-- Widget content -->
  </div>
</template>

<script setup>
import { magnet } from '@web/directives/magnet';
const vMagnet = magnet;
</script>
```

---

## File Reference

| File                                       | Lines | Purpose                                                           |
| ------------------------------------------ | ----- | ----------------------------------------------------------------- |
| `web/composables/useMagneticAttachment.ts` | 281   | Vue composable for RAF-based magnetic attachment                  |
| `web/composables/useMagneticConfig.ts`     | 73    | Shared threshold configuration                                    |
| `web/utils/magnet.ts`                      | 175   | DOM-based magnetic utility (non-Vue)                              |
| `web/directives/magnet.ts`                 | 22    | Vue directive wrapper for `makeMagnetic`                          |
| `web/utils/frameCoordinator.ts`            | 174   | RAF loop manager (priority-based)                                 |
| `web/components/WeatherTimeWidget.vue`     | 954   | Example widget using `useMagneticAttachment`                      |
| `web/components/YouTubePlayer.vue`         | ~300  | Another widget using `useMagneticAttachment`                      |
| `web/types/events.ts`                      | ~250  | Event bus type definitions (`physics:snap`, `handtrack:grab-end`) |

---

## Reference Mapping

| Doc Claim                          | Source of Truth              | Location                           |
| ---------------------------------- | ---------------------------- | ---------------------------------- |
| MagneticAttachmentConfig interface | Type definition              | `useMagneticAttachment.ts:20-39`   |
| MagneticAttachmentReturn interface | Type definition              | `useMagneticAttachment.ts:41-60`   |
| MagneticSnapResult interface       | Type definition              | `useMagneticAttachment.ts:62-69`   |
| Default thresholds                 | `MAGNETIC_THRESHOLDS` object | `useMagneticConfig.ts:16-34`       |
| Default target config              | `DEFAULT_MAGNETIC_TARGET`    | `useMagneticConfig.ts:62-69`       |
| Snap calculation                   | `calculateSnapY()`           | `useMagneticAttachment.ts:102-111` |
| Pull force formula                 | Pull zone handler            | `useMagneticAttachment.ts:152-157` |
| RAF monitoring loop                | `monitoringLoop()`           | `useMagneticAttachment.ts:176-199` |
| Edge priority algorithm            | `checkMagneticSnap()`        | `useMagneticAttachment.ts:129-144` |
| Event bus integration              | Listener setup               | `useMagneticAttachment.ts:218-225` |
| Physics snap event                 | Event emit                   | `useMagneticAttachment.ts:241`     |
| WeatherTimeWidget usage            | Composable setup             | `WeatherTimeWidget.vue:132-154`    |
| Drag handler pattern               | `onDragMove()`               | `WeatherTimeWidget.vue:181-207`    |

---

## Changelog

- **v1.0** - Initial `makeMagnetic` DOM-based implementation in `magnet.ts`
- **v1.1** - Added Vue directive wrapper in `magnet.ts`
- **v2.0** - Created `useMagneticAttachment` composable with RAF-based continuous enforcement
- **v2.1** - Added event bus integration for `handtrack:grab-end` and `physics:snap`
- **v2.2** - Centralized thresholds in `useMagneticConfig.ts`
- **v2.3** - Documentation created following INTENT_COORDINATOR_SYSTEM.md template

---

_Last verified: 2026-02-23_
