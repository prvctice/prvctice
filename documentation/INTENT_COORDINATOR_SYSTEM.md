# IntentCoordinator System Documentation

> **Why this doc:** The IntentCoordinator routes all user input (keyboard, mouse, hand tracking, gamepad, voice) to the correct target. Read this when adding a new input source, registering a new target zone, or debugging why an action goes to the wrong component.
>
> **Related systems:** [SKILL_COORDINATOR_SYSTEM.md](./SKILL_COORDINATOR_SYSTEM.md) | [DOTMATRIX_SYSTEM.md](./DOTMATRIX_SYSTEM.md) | [SPEECH_SYSTEM.md](./SPEECH_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The IntentCoordinator is the central hub for all input-to-action routing in prvctice. It decouples input sources (voice, gesture, keyboard, gamepad, hand tracking) from targets (inputBar, widgets, menus), enabling a modular, extensible interaction system.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Contract and Invariants](#contract-and-invariants)
4. [Data Flow](#data-flow)
5. [Input Adapter Pattern](#input-adapter-pattern)
6. [Target Registration](#target-registration)
7. [Zone-Based Spatial Routing](#zone-based-spatial-routing)
8. [Hand Tracking Grace Algorithm](#hand-tracking-grace-algorithm)
9. [Middleware Pipeline](#middleware-pipeline)
10. [State Management and Subscriptions](#state-management-and-subscriptions)
11. [Configuration Reference](#configuration-reference)
12. [Failure Modes](#failure-modes)
13. [Code Examples](#code-examples)
14. [Expansion Guide](#expansion-guide)
15. [File Reference](#file-reference)
16. [Reference Mapping](#reference-mapping)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              INPUT SOURCES                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Hand Track  │ │  Gamepad    │ │   Voice     │ │  Gesture    │ │  Keyboard   ││
│  │ (handtrack) │ │(useGamepad) │ │ (useSpeech) │ │(useBarGest) │ │(keyboardAd) ││
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘│
│         │               │               │               │               │       │
│         ▼               ▼               ▼               ▼               ▼       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         INPUT ADAPTERS                                      ││
│  │  createInputAdapter('hand-tracking')  createInputAdapter('gamepad')  ...    ││
│  │                                                                             ││
│  │  Standardized API:  adapter.emit(action, { position, target, value })       ││
│  └──────────────────────────────────┬──────────────────────────────────────────┘│
└─────────────────────────────────────┼───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          INTENT COORDINATOR                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                      MIDDLEWARE PIPELINE                                  │  │
│  │  ┌─────────────────┐     ┌───────────────┐     ┌─────────────────┐        │  │
│  │  │  beforeEmit[]   │ ──▶ │ TARGET ROUTER │ ──▶ │  afterEmit[]    │        │  │
│  │  │ (modify/cancel) │     │ (resolution)  │     │ (logging/stats) │        │  │
│  │  └─────────────────┘     └───────────────┘     └─────────────────┘        │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                          │
│  ┌───────────────────────────────────┼───────────────────────────────────────┐  │
│  │                    STATE MANAGEMENT                                       │  │
│  │  activeTarget │ lastIntent │ isDragging │ dragSource                      │  │
│  │                           │                                               │  │
│  │              ┌────────────┴────────────┐                                  │  │
│  │              │   State Subscribers     │                                  │  │
│  │              │   (visualizers, UI)     │                                  │  │
│  │              └─────────────────────────┘                                  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TARGETS                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │  inputBar   │ │  sideMenu   │ │    help     │ │   notes     │ │  model3d    ││
│  │  zone:#bar  │ │  zone:null  │ │  zone:null  │ │  zone:null  │ │  zone:null  ││
│  │ move,focus  │ │ toggle,set  │ │ toggle,set  │ │ toggle,set  │ │   toggle    ││
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘│
│         │               │               │               │               │       │
│         ▼               ▼               ▼               ▼               ▼       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                        HANDLER EXECUTION                                    ││
│  │  Target receives IntentWithTimestamp → executes domain logic                ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            SUBSCRIBERS                                          │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌────────────────────┐│
│  │ HandPositionIndicator   │  │    Debug Overlay       │  │   Analytics        ││
│  │ (visual feedback)       │  │  (development)         │  │   (production)     ││
│  └─────────────────────────┘  └────────────────────────┘  └────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Intent

An **Intent** represents a user action that needs to be routed to a target:

```typescript
interface Intent {
  source: string; // Input source identifier (e.g., 'hand-tracking', 'gamepad')
  action: string; // Action type (e.g., 'grab', 'move', 'toggle', 'submit')
  target?: string; // Explicit target ID (optional for non-spatial intents)
  position?: Position; // Screen coordinates for spatial intents
  value?: unknown; // Action-specific payload
  timestamp?: number; // Auto-added if not provided
}
```

### Target

A **Target** is a registered component that can receive intents:

```typescript
interface Target {
  id: string; // Unique identifier
  zone: ZoneDefinition; // Spatial area (or null for non-spatial)
  actions: string[]; // Supported action types
  handler: (intent: IntentWithTimestamp) => void; // Handler function
}
```

### Zone Definition

Zones define the spatial area of a target. Three formats are supported:

```typescript
type ZoneDefinition =
  | ZoneRect // Static: { x, y, width, height }
  | string // CSS selector: '#bar', '.widget'
  | (() => ZoneRect | null) // Dynamic: function returning rect
  | null; // Non-spatial target
```

---

## Contract and Invariants

### Guarantees Provided by the Coordinator

| Guarantee             | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| **Timestamp**         | Every emitted intent receives a `timestamp` (auto-generated if not provided)   |
| **Resolved Target**   | After emit, `intent.resolvedTarget` contains the matched target ID or `null`   |
| **State Updates**     | `isDragging` and `activeTarget` are updated atomically after handler execution |
| **History**           | Last 50 intents are preserved in `history` array (most recent first)           |
| **Handler Isolation** | Handler errors are caught and logged; they don't break the coordinator         |

### Required Fields by Action Type

| Action Type                                | Required Fields      | Optional Fields                          |
| ------------------------------------------ | -------------------- | ---------------------------------------- |
| Spatial (`grab`, `release`, `move`, `tap`) | `position: { x, y }` | `target`, `value`                        |
| Non-spatial (`toggle`, `focus`, `submit`)  | `target: string`     | `value`                                  |
| Hybrid (`press`)                           | `value`              | `target` (falls back to `defaultTarget`) |

### Canonical Data Shapes

The `intent.value` payload varies by action. Target handlers should expect these shapes:

| Action                   | `intent.value` Type          | Example                                 |
| ------------------------ | ---------------------------- | --------------------------------------- |
| `move`                   | `{ dx: number, dy: number }` | `{ dx: -5, dy: 10 }`                    |
| `toggle`                 | `boolean \| undefined`       | `true` (explicit) or `undefined` (flip) |
| `press`                  | `string \| number`           | `'Enter'`, `'Escape'`, `1`              |
| `submit`                 | `unknown`                    | Application-specific payload            |
| `grab`, `release`, `tap` | `undefined`                  | —                                       |

**Important:** The move delta uses `dx`/`dy`, not `deltaX`/`deltaY`. This matches the `MoveDelta` interface in `createInputAdapter.ts`.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTENT LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. INPUT EVENT                                                             │
│     ┌──────────────────┐                                                    │
│     │ User performs    │                                                    │
│     │ action (pinch,   │                                                    │
│     │ button press)    │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  2. ADAPTER CREATES INTENT                                                  │
│     ┌──────────────────┐                                                    │
│     │ adapter.grab({   │                                                    │
│     │   x: 100, y: 200 │                                                    │
│     │ })               │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  3. MIDDLEWARE: beforeEmit                                                  │
│     ┌──────────────────┐                                                    │
│     │ Callbacks can:   │                                                    │
│     │ - Modify intent  │                                                    │
│     │ - Cancel (null)  │                                                    │
│     └────────┬─────────┘                                                    │
│              │ (if not cancelled)                                           │
│              ▼                                                              │
│  4. TARGET RESOLUTION                                                       │
│     ┌──────────────────┐                                                    │
│     │ If position:     │                                                    │
│     │  - Find zones    │                                                    │
│     │  - Check inside  │                                                    │
│     │  - Apply grace   │                                                    │
│     │ Else if target:  │                                                    │
│     │  - Direct lookup │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  5. HANDLER EXECUTION                                                       │
│     ┌──────────────────┐                                                    │
│     │ target.handler(  │                                                    │
│     │   fullIntent     │                                                    │
│     │ )                │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  6. MIDDLEWARE: afterEmit                                                   │
│     ┌──────────────────┐                                                    │
│     │ Callbacks for:   │                                                    │
│     │ - Logging        │                                                    │
│     │ - Analytics      │                                                    │
│     │ - Side effects   │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  7. STATE UPDATE + NOTIFY                                                   │
│     ┌──────────────────┐                                                    │
│     │ Update state:    │                                                    │
│     │ - activeTarget   │                                                    │
│     │ - lastIntent     │                                                    │
│     │ - isDragging     │                                                    │
│     │ Notify subs      │                                                    │
│     └──────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Input Adapter Pattern

Input adapters provide a consistent API for emitting intents from different input sources.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT ADAPTER FACTORY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  createInputAdapter(config)                                                 │
│  ├── source: string          (e.g., 'hand-tracking')                        │
│  └── defaultTarget?: string  (optional fallback target)                     │
│                                                                             │
│  Returns InputAdapter with methods:                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Spatial Actions (require position):                                    ││
│  │  ├── grab(position, target?)  → emit 'grab' intent at position          ││
│  │  ├── release(position)        → emit 'release' intent at position       ││
│  │  ├── move(position, delta?)   → emit 'move' intent with optional delta  ││
│  │  └── tap(position)            → emit 'tap' intent at position           ││
│  │                                                                         ││
│  │  Non-Spatial Actions (require explicit target):                         ││
│  │  ├── toggle(target, value?)   → emit 'toggle' intent to target          ││
│  │  ├── focus(target)            → emit 'focus' intent to target           ││
│  │  └── submit(target, value?)   → emit 'submit' intent to target          ││
│  │                                                                         ││
│  │  Hybrid Actions (target optional, uses defaultTarget if configured):    ││
│  │  └── press(value, target?)    → emit 'press' intent (keyboard/button)   ││
│  │                                                                         ││
│  │  Generic:                                                               ││
│  │  └── emit(action, options)    → emit custom action with full options    ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pre-configured Adapters

```typescript
// Factory functions for common input sources
handTrackingAdapter(); // source: 'hand-tracking'
voiceAdapter(); // source: 'voice'
gamepadAdapter(); // source: 'gamepad'
gestureAdapter(); // source: 'gesture'
keyboardAdapter(); // source: 'keyboard'
```

---

## Target Registration

Targets self-register in their own Vue components using the composable pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TARGET REGISTRATION LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  COMPONENT MOUNT                                                            │
│  ┌────────────────────┐                                                     │
│  │ onMounted(() => {  │                                                     │
│  │   registerTarget(  │                                                     │
│  │     'targetId',    │                                                     │
│  │     { zone,        │                                                     │
│  │       actions,     │                                                     │
│  │       handler }    │                                                     │
│  │   );               │                                                     │
│  │ });                │                                                     │
│  └─────────┬──────────┘                                                     │
│            │                                                                │
│            ▼                                                                │
│  COORDINATOR STATE                                                          │
│  ┌────────────────────┐                                                     │
│  │ targets Map:       │                                                     │
│  │ {                  │                                                     │
│  │   'inputBar' → ... │                                                     │
│  │   'sideMenu' → ... │                                                     │
│  │   'help' → ...     │                                                     │
│  │   'targetId' → {   │ ◀── NEW ENTRY                                       │
│  │     id, zone,      │                                                     │
│  │     actions,       │                                                     │
│  │     handler        │                                                     │
│  │   }                │                                                     │
│  │ }                  │                                                     │
│  └────────────────────┘                                                     │
│                                                                             │
│  COMPONENT UNMOUNT                                                          │
│  ┌────────────────────┐                                                     │
│  │ onBeforeUnmount(() │                                                     │
│  │   => {             │                                                     │
│  │   unregisterTarget │                                                     │
│  │     ('targetId');  │                                                     │
│  │ });                │                                                     │
│  └─────────┬──────────┘                                                     │
│            │                                                                │
│            ▼                                                                │
│  COORDINATOR STATE                                                          │
│  ┌────────────────────┐                                                     │
│  │ targets Map:       │                                                     │
│  │ {                  │                                                     │
│  │   'inputBar' → ... │                                                     │
│  │   'sideMenu' → ... │                                                     │
│  │   'help' → ...     │                                                     │
│  │   ─────────────    │ ◀── ENTRY REMOVED                                   │
│  │ }                  │                                                     │
│  └────────────────────┘                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Zone-Based Spatial Routing

When an intent has a `position`, the coordinator resolves the target spatially:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SPATIAL RESOLUTION ALGORITHM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SCREEN SPACE                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │        ┌──────────────────────┐                                       │  │
│  │        │    NOTES WIDGET      │  zone: #floating-notes-widget         │  │
│  │        │    (300x400)         │                                       │  │
│  │        └──────────────────────┘                                       │  │
│  │                                                                       │  │
│  │                                       ┌───────────────┐               │  │
│  │                                       │  TIME WIDGET  │               │  │
│  │               ✕ ← Pinch at (400,300)  │   (200x100)   │               │  │
│  │                                       └───────────────┘               │  │
│  │                                                                       │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │   │                        INPUT BAR                                │ │  │
│  │   │                        zone: #bar                               │ │  │
│  │   └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  RESOLUTION STEPS (Coordinator - useIntentCoordinator.ts):                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  1. Collect all targets with zones supporting the action              │  │
│  │     → [notesWidget, timeWidget, inputBar]                             │  │
│  │                                                                       │  │
│  │  2. For each target, calculate:                                       │  │
│  │     • isInside: point within zone bounds?                             │  │
│  │     • distance: pixels to nearest edge (0 if inside)                  │  │
│  │                                                                       │  │
│  │  3. Filter: keep if inside OR distance < 150px (hardcoded grace)      │  │
│  │     NOTE: This is a simple fallback. See "Hand Tracking Grace" below  │  │
│  │     for the more sophisticated per-target algorithm used by handtrack.│  │
│  │                                                                       │  │
│  │  4. Sort by priority:                                                 │  │
│  │     a) Targets where isInside=true come first                         │  │
│  │     b) Then by absolute distance (closest first)                      │  │
│  │                                                                       │  │
│  │  5. Return first candidate (or null if none)                          │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Hand Tracking Grace Algorithm

> **Scope:** This section describes the grace algorithm in `handtrack.ts`, which is specific to hand tracking grab detection. The coordinator's `resolveTarget()` uses a simpler 150px absolute distance fallback. Hand tracking bypasses the coordinator's resolution for grab detection to provide per-target tuning.

The grace distance system allows grabbing targets slightly outside their bounds - essential for hand tracking with 10-30px jitter.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      GRACE HIT DETECTION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Per-Target Grace Distances (from useMagneticConfig.ts):                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  grabHitDefault    = 200px  (fallback for unknown targets)            │  │
│  │  grabHitInputBar   = 250px  (larger for bottom-screen target)         │  │
│  │  grabHitTimeWidget = 200px                                            │  │
│  │  grabHitNotesWidget = 200px                                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  GRACE RATIO CALCULATION:                                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  For each target within its grace distance:                           │  │
│  │                                                                       │  │
│  │     graceRatio = distance / graceDistance                             │  │
│  │                                                                       │  │
│  │  Example:                                                             │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Target A: distance=80px, grace=200px  → ratio = 0.40            │ │  │
│  │  │  Target B: distance=100px, grace=250px → ratio = 0.40            │ │  │
│  │  │  Target C: distance=150px, grace=200px → ratio = 0.75            │ │  │
│  │  │                                                                  │ │  │
│  │  │  Winner: Target A or B (tie), Target C excluded (higher ratio)   │ │  │
│  │  └──────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                       │  │
│  │  Lower ratio = closer relative to allowed grace = higher priority     │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  VISUAL EXAMPLE:                                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │                      ╭─────────────────────────╮                      │  │
│  │                   ╭──│       INPUT BAR         │──╮                   │  │
│  │                ╭──│  │      (actual zone)      │  │──╮                │  │
│  │             ╭──│  │  └─────────────────────────┘  │  │──╮             │  │
│  │             │  │  │                               │  │  │             │  │
│  │             │  │  │       Grace Zone (250px)      │  │  │             │  │
│  │             │  │  │                               │  │  │             │  │
│  │             ╰──│  │                               │  │──╯             │  │
│  │                ╰──│         ✕ ← Pinch here        │──╯                │  │
│  │                   ╰───────────────────────────────╯                   │  │
│  │                                                                       │  │
│  │  The pinch is 80px outside the bar, but within 250px grace → HIT      │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vertical Zone Restriction (InputBar Example)

The inputBar has special logic to prevent mid-screen grabs:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INPUTBAR VERTICAL RESTRICTION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Problem: InputBar at bottom has 250px grace extending upward               │
│           Users pinching in the middle could accidentally grab the bar      │
│                                                                             │
│  Solution: inputBarMinYFraction = 0.5                                       │
│           Grace only applies when pinch Y > 50% of screen height            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Screen (1000px height)                                               │  │
│  │  ┌─────────────────────────────────────────┐                          │  │
│  │  │                                         │  y = 0                   │  │
│  │  │         NO GRACE ZONE                   │                          │  │
│  │  │    (pinch here won't grab bar)          │                          │  │
│  │  │                                         │                          │  │
│  │  │              ✕ ← Pinch at y=300         │  Ignored (y < 500)       │  │
│  │  │                                         │                          │  │
│  │  ├─────────────────────────────────────────┤  y = 500 (50%)           │  │
│  │  │                                         │                          │  │
│  │  │         GRACE ZONE ACTIVE               │                          │  │
│  │  │    (pinch here can grab bar)            │                          │  │
│  │  │                                         │                          │  │
│  │  │              ✕ ← Pinch at y=700         │  Bar grabbed             │  │
│  │  │  ┌─────────────────────────────────┐    │                          │  │
│  │  │  │         INPUT BAR               │    │  y = 850                 │  │
│  │  │  └─────────────────────────────────┘    │                          │  │
│  │  └─────────────────────────────────────────┘  y = 1000                │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Code (in handtrack.ts):                                                    │
│  if (id === 'inputBar') {                                                   │
│    const minY = window.innerHeight * INTENT_THRESHOLDS.inputBarMinYFraction;│
│    if (screenY < minY) continue; // Skip grace for upper screen             │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Middleware Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MIDDLEWARE PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BEFORE EMIT (Pre-routing)                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Intent ──▶ callback1 ──▶ callback2 ──▶ ... ──▶ callbackN ──▶ Router  │  │
│  │                │              │                      │                │  │
│  │                ▼              ▼                      ▼                │  │
│  │           Modify OR      Modify OR              Modify OR             │  │
│  │           return null    return null            return null           │  │
│  │           (cancel)       (cancel)               (cancel)              │  │
│  │                                                                       │  │
│  │  Use cases:                                                           │  │
│  │  • Input validation                                                   │  │
│  │  • Rate limiting                                                      │  │
│  │  • Permission checks                                                  │  │
│  │  • Intent transformation                                              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  AFTER EMIT (Post-routing)                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ──▶ Router ──▶ Handler ──▶ callback1 ──▶ callback2 ──▶ ... ──▶ Done  │  │
│  │                                  │              │                     │  │
│  │                                  ▼              ▼                     │  │
│  │                             Read-only      Read-only                  │  │
│  │                             (logging)      (analytics)                │  │
│  │                                                                       │  │
│  │  Use cases:                                                           │  │
│  │  • Logging all intents                                                │  │
│  │  • Analytics tracking                                                 │  │
│  │  • Debug visualization                                                │  │
│  │  • Performance monitoring                                             │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## State Management and Subscriptions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STATE STRUCTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  interface IntentState {                                                    │
│    activeTarget: string | null;    // Currently resolved target ID          │
│    lastIntent: IntentWithTimestamp | null;  // Most recent intent           │
│    isDragging: boolean;            // Drag operation in progress            │
│    dragSource: string | null;      // Source of current drag                │
│  }                                                                          │
│                                                                             │
│  STATE TRANSITIONS:                                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  IDLE                                                                 │  │
│  │  { activeTarget: null, isDragging: false, dragSource: null }          │  │
│  │           │                                                           │  │
│  │           │ emit('grab', position)                                    │  │
│  │           ▼                                                           │  │
│  │  GRABBING                                                             │  │
│  │  { activeTarget: 'inputBar', isDragging: true, dragSource: 'hand' }   │  │
│  │           │                                                           │  │
│  │           │ emit('move', position)  (multiple times)                  │  │
│  │           │                                                           │  │
│  │  DRAGGING                                                             │  │
│  │  { activeTarget: 'inputBar', isDragging: true, dragSource: 'hand' }   │  │
│  │           │                                                           │  │
│  │           │ emit('release', position)                                 │  │
│  │           ▼                                                           │  │
│  │  IDLE                                                                 │  │
│  │  { activeTarget: null, isDragging: false, dragSource: null }          │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  SUBSCRIPTION PATTERN:                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  const { subscribe } = useIntentCoordinator();                        │  │
│  │                                                                       │  │
│  │  onMounted(() => {                                                    │  │
│  │    unsubscribe = subscribe((state) => {                               │  │
│  │      // React to state changes                                        │  │
│  │      if (state.isDragging) {                                          │  │
│  │        showDragIndicator();                                           │  │
│  │      }                                                                │  │
│  │    });                                                                │  │
│  │  });                                                                  │  │
│  │                                                                       │  │
│  │  onBeforeUnmount(() => {                                              │  │
│  │    unsubscribe?.();                                                   │  │
│  │  });                                                                  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

Most thresholds are centralized in `web/composables/useMagneticConfig.ts`. Exception: the coordinator's fallback grace distance (150px) is hardcoded in `useIntentCoordinator.ts:205`.

### Magnetic Thresholds (Physics)

| Threshold         | Value | Description                           |
| ----------------- | ----- | ------------------------------------- |
| `pullThreshold`   | 100px | Distance to start magnetic attraction |
| `snapThreshold`   | 30px  | Distance for immediate snap           |
| `detachThreshold` | 50px  | Distance to drag before detaching     |
| `pullStrength`    | 0.18  | Spring stiffness for magnetic pull    |
| `springStiffness` | 0.06  | Spring stiffness for smooth motion    |
| `springDamping`   | 0.75  | Damping to prevent oscillation        |

### Intent Thresholds (Routing)

| Threshold              | Value | Description                       |
| ---------------------- | ----- | --------------------------------- |
| `graceDistance`        | 150px | Default grace beyond zone edge    |
| `grabHitDefault`       | 200px | Default grace for grab detection  |
| `grabHitInputBar`      | 250px | Grace for InputBar (larger zone)  |
| `grabHitTimeWidget`    | 200px | Grace for TimeWidget              |
| `grabHitNotesWidget`   | 200px | Grace for NotesWidget             |
| `inputBarMinYFraction` | 0.5   | InputBar grace only in bottom 50% |

### Hand Tracking Thresholds (in handtrack.ts)

| Threshold                 | Value | Description                         |
| ------------------------- | ----- | ----------------------------------- |
| `PINCH_GRAB_THRESHOLD`    | 0.35  | Pinch value to initiate grab        |
| `PINCH_RELEASE_THRESHOLD` | 0.55  | Pinch value to release (hysteresis) |
| `GRAB_COOLDOWN_MS`        | 120ms | Cooldown between grabs              |

---

## Failure Modes

Understanding what happens when things go wrong helps with debugging and defensive coding.

| Scenario                   | Behavior                                                                     | How to Detect                               |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| **No matching target**     | Intent is logged but not delivered; `emit()` returns `{ target: null }`      | Check `result.target` after emit            |
| **Target lacks action**    | Target is skipped during resolution; falls through to next candidate or null | Target not receiving expected intents       |
| **Zone resolves to null**  | Target excluded from spatial candidates (e.g., element not mounted)          | `getAllZoneRects()` missing expected target |
| **Middleware cancels**     | `beforeEmit` returns `null`; intent never reaches router                     | `emit()` returns `null`                     |
| **Handler throws**         | Error caught and logged; coordinator continues; state still updates          | Console error: `[Intent] Handler error`     |
| **Adapter emit fails**     | Returns `null`; warning logged in dev mode                                   | Adapter method returns `null`               |
| **CSS selector not found** | Zone resolves to `null`; target becomes non-spatial                          | Element missing from DOM at resolution time |

### Debugging Checklist

1. **Intent not reaching target?**
   - Verify target is registered: `getTargets().has('targetId')`
   - Verify action is in target's `actions` array
   - For spatial: verify zone resolves: `getZoneRect(zone) !== null`
   - Check middleware isn't cancelling: add `onAfterEmit` logger

2. **Wrong target selected?**
   - Enable dev mode logging (automatic in `import.meta.env.DEV`)
   - Check zone overlaps with `getAllZoneRects()`
   - For hand tracking: verify grace distances in `useMagneticConfig.ts`

3. **State not updating?**
   - Verify subscription is active: `subscribe()` returns unsubscribe function
   - Check action triggers state change (`grab`/`release` affect `isDragging`)

---

## Code Examples

### Creating a New Input Adapter

```typescript
// web/adapters/createInputAdapter.ts usage

import { createInputAdapter } from '@web/adapters/createInputAdapter';

// Simple adapter
const eyeAdapter = createInputAdapter('eye-tracking');

// With default target
const voiceAdapter = createInputAdapter({
  source: 'voice',
  defaultTarget: 'inputBar',
});

// Using the adapter
eyeAdapter.tap({ x: 100, y: 200 }); // Spatial tap
voiceAdapter.toggle('sideMenu'); // Non-spatial toggle
```

### Registering a New Target

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

const widgetRef = ref<HTMLElement | null>(null);
const { registerTarget, unregisterTarget } = useIntentCoordinator();

onMounted(() => {
  registerTarget('myWidget', {
    // Zone options:
    zone: '#my-widget', // CSS selector
    // zone: () => widgetRef.value?.getBoundingClientRect() ?? null,  // Dynamic
    // zone: { x: 100, y: 100, width: 200, height: 150 },  // Static
    // zone: null,  // Non-spatial (voice/keyboard only)

    actions: ['toggle', 'move', 'focus'], // Supported actions

    handler: (intent) => {
      switch (intent.action) {
        case 'toggle':
          visible.value = !visible.value;
          break;
        case 'move':
          // Move delta uses { dx, dy } - see Canonical Data Shapes section
          const delta = intent.value as { dx?: number; dy?: number } | undefined;
          if (delta?.dx != null) {
            position.x += delta.dx;
          }
          if (delta?.dy != null) {
            position.y += delta.dy;
          }
          break;
        case 'focus':
          widgetRef.value?.focus();
          break;
      }
    },
  });
});

onBeforeUnmount(() => {
  unregisterTarget('myWidget');
});
</script>
```

### Using Middleware for Logging

```typescript
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

const { onBeforeEmit, onAfterEmit } = useIntentCoordinator();

// Log all intents (afterEmit - read-only)
const unsubscribe = onAfterEmit((intent, target) => {
  console.log('[Analytics]', {
    source: intent.source,
    action: intent.action,
    target: target?.id ?? 'none',
    timestamp: intent.timestamp,
  });
});

// Rate limit certain actions (beforeEmit - can modify/cancel)
let lastEmit = 0;
const unsubscribeRateLimit = onBeforeEmit((intent) => {
  if (intent.action === 'move') {
    const now = Date.now();
    if (now - lastEmit < 16) {
      // 60fps max
      return null; // Cancel
    }
    lastEmit = now;
  }
  return intent; // Continue
});

// Cleanup
onBeforeUnmount(() => {
  unsubscribe();
  unsubscribeRateLimit();
});
```

### Subscribing to State for Visualizers

```vue
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

const { subscribe } = useIntentCoordinator();
const isDragging = ref(false);
const activeTarget = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

onMounted(() => {
  unsubscribe = subscribe((state) => {
    isDragging.value = state.isDragging;
    activeTarget.value = state.activeTarget;
  });
});

onBeforeUnmount(() => {
  unsubscribe?.();
});
</script>

<template>
  <div class="indicator" :class="{ dragging: isDragging }">
    {{ activeTarget ?? 'None' }}
  </div>
</template>
```

---

## Expansion Guide

### Adding a New Input Source

1. **Create the adapter** in your input handling code:

```typescript
// web/input/eyeTracking.ts
import { createInputAdapter } from '@web/adapters/createInputAdapter';

const eyeAdapter = createInputAdapter('eye-tracking');

export function onGazeFocus(x: number, y: number) {
  eyeAdapter.tap({ x, y });
}

export function onDwell(x: number, y: number, target: string) {
  eyeAdapter.emit('dwell', {
    position: { x, y },
    target,
  });
}
```

2. **Ensure targets support the new actions**:

```typescript
// In target component
registerTarget('myWidget', {
  actions: ['tap', 'dwell', ...],  // Add new actions
  handler: (intent) => {
    if (intent.action === 'dwell') {
      // Handle eye dwell
    }
  }
});
```

### Adding a New Target with Custom Zone

1. **Register with dynamic zone**:

```typescript
registerTarget('floatingPanel', {
  zone: () => {
    const el = document.getElementById('floating-panel');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Expand hit area by 20px on all sides
    return {
      x: rect.x - 20,
      y: rect.y - 20,
      width: rect.width + 40,
      height: rect.height + 40
    };
  },
  actions: ['grab', 'move', 'release'],
  handler: (intent) => { ... }
});
```

2. **Add to grace overrides** (if needed):

```typescript
// In handtrack.ts GRAB_HIT_GRACE_OVERRIDES
const GRAB_HIT_GRACE_OVERRIDES: Record<string, number> = {
  inputBar: INTENT_THRESHOLDS.grabHitInputBar,
  floatingPanel: 180, // Custom grace distance
};
```

### Creating Custom Middleware

```typescript
// web/middleware/intentLogger.ts
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

export function installIntentLogger() {
  const { onAfterEmit } = useIntentCoordinator();

  return onAfterEmit((intent, target) => {
    if (import.meta.env.DEV) {
      console.table({
        source: intent.source,
        action: intent.action,
        target: target?.id ?? '(none)',
        position: intent.position
          ? `${intent.position.x.toFixed(0)}, ${intent.position.y.toFixed(0)}`
          : 'N/A',
        timestamp: new Date(intent.timestamp).toISOString(),
      });
    }
  });
}
```

### Integrating with New Visualizers

```vue
<!-- web/components/IntentDebugOverlay.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

const { subscribe, getAllZoneRects, onAfterEmit } = useIntentCoordinator();

const zones = ref<ZoneRectInfo[]>([]);
const lastIntent = ref<IntentWithTimestamp | null>(null);

let unsubscribeState: (() => void) | null = null;
let unsubscribeAfter: (() => void) | null = null;

onMounted(() => {
  // Update zones periodically
  const updateZones = () => {
    zones.value = getAllZoneRects();
    requestAnimationFrame(updateZones);
  };
  updateZones();

  // Subscribe to state
  unsubscribeState = subscribe((state) => {
    lastIntent.value = state.lastIntent;
  });

  // Log all intents
  unsubscribeAfter = onAfterEmit((intent) => {
    lastIntent.value = intent;
  });
});

onBeforeUnmount(() => {
  unsubscribeState?.();
  unsubscribeAfter?.();
});
</script>

<template>
  <div class="debug-overlay">
    <div
      v-for="zone in zones"
      :key="zone.id"
      class="zone-rect"
      :style="{
        left: zone.rect.x + 'px',
        top: zone.rect.y + 'px',
        width: zone.rect.width + 'px',
        height: zone.rect.height + 'px',
      }"
    >
      {{ zone.id }}
    </div>
  </div>
</template>
```

### Best Practices

1. **Always clean up** - Unregister targets and unsubscribe in `onBeforeUnmount`

2. **Use descriptive target IDs** - `inputBar`, `timeWidget`, not `target1`

3. **Specify minimal actions** - Only list actions the target actually handles

4. **Dynamic zones for moving elements** - Use function zones for draggable widgets

5. **Prefer adapters over direct emit** - Use `gamepadAdapter()` not `emit({ source: 'gamepad' })`

6. **Handle unknown actions gracefully** - Use switch/case with default fallback

7. **Test with multiple input sources** - Ensure targets work with hand, gamepad, voice

---

## File Reference

| File                                       | Purpose                                |
| ------------------------------------------ | -------------------------------------- |
| `web/composables/useIntentCoordinator.ts`  | Core coordinator singleton             |
| `web/adapters/createInputAdapter.ts`       | Input adapter factory                  |
| `web/composables/useMagneticConfig.ts`     | Threshold configuration                |
| `web/graphics/dotmatrix/handtrack.ts`      | Hand tracking with grace hit detection |
| `web/composables/useBarGestures.ts`        | Gesture input source                   |
| `web/composables/useGamepad.ts`            | Gamepad input source                   |
| `web/composables/useSideMenu.ts`           | Example target registration            |
| `web/components/HandPositionIndicator.vue` | Example state subscriber               |
| `web/types/global.d.ts`                    | TypeScript type definitions            |
| `web/components/InputBar.vue`              | Spatial target example                 |
| `web/components/VoiceCommandsPane.vue`     | Non-spatial target example             |

---

## Reference Mapping

This table maps documentation claims to their authoritative source locations. When updating docs or code, check both sides stay aligned.

| Doc Claim                          | Source of Truth                  | Location                        |
| ---------------------------------- | -------------------------------- | ------------------------------- |
| Move delta shape `{ dx, dy }`      | `MoveDelta` interface            | `createInputAdapter.ts:31-34`   |
| Coordinator grace distance (150px) | `MAX_GRACE` constant             | `useIntentCoordinator.ts:187`   |
| Per-target grace distances         | `INTENT_THRESHOLDS`              | `useMagneticConfig.ts:39-57`    |
| Grace ratio algorithm              | `graceRatio` calculation         | `handtrack.ts:1395-1396`        |
| InputBar vertical restriction      | `inputBarMinYFraction`           | `useMagneticConfig.ts:50`       |
| Supported adapter methods          | `InputAdapter` interface         | `createInputAdapter.ts:78-142`  |
| State shape                        | `IntentState` interface          | `useIntentCoordinator.ts:68-73` |
| Intent shape                       | `Intent` / `IntentWithTimestamp` | `useIntentCoordinator.ts:23-35` |

---

## Changelog

- **v1.0** - Initial IntentCoordinator implementation
- **v1.1** - Added input adapter layer
- **v1.2** - Added middleware hooks (beforeEmit, afterEmit)
- **v1.3** - Added state subscriptions for visualizers
- **v1.4** - Added per-target grace distances
- **v1.5** - Added vertical zone restrictions for InputBar
- **v1.6** - Documentation improvements: Contract section, canonical data shapes, failure modes, reference mapping; clarified grace algorithm scope (coordinator vs handtrack)

---

_Last verified: 2026-02-23_
