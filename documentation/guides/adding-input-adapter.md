# How to: Add an Input Adapter

> **Prerequisites:** TypeScript, basic Vue.js composables knowledge, familiarity with browser input events
> **Time estimate:** 30-60 minutes
> **Difficulty:** Intermediate

## Architecture Context

prvctice routes all user input through a central IntentCoordinator. Input sources (keyboard, voice, hand tracking, gamepad, gestures) are decoupled from targets (input bar, widgets, menus) via an adapter layer. Each input source creates an adapter using the `createInputAdapter()` factory in `web/adapters/createInputAdapter.ts`, which provides a standardized API for emitting intents.

The coordinator resolves intents to targets using explicit target IDs or spatial zone matching. Target components register themselves via `useIntentCoordinator()` from `web/composables/useIntentCoordinator.ts`.

For the complete system architecture, data flow diagrams, and worked code examples, see [INTENT_COORDINATOR_SYSTEM.md](../INTENT_COORDINATOR_SYSTEM.md) -- particularly the [Expansion Guide (Section 14)](../INTENT_COORDINATOR_SYSTEM.md#expansion-guide) which contains detailed walkthroughs for adding input sources, targets, and middleware. For boundary definitions, see [CODEMAP.md](../CODEMAP.md) (Input Adapters boundary).

You will touch **1-2 files**: a new input source file, and optionally a convenience constructor in the adapter factory. Per the CODEMAP.md invariant, **no changes to the coordinator internals are needed**.

## Step-by-Step

### Step 1: Create a file for your input source

Create a new file for your input handling logic. Place input source files alongside the composable that manages the hardware connection (e.g., `web/composables/`) or in the relevant subsystem directory (e.g., `web/graphics/dotmatrix/` for hand tracking).

```typescript
// web/input/eyeTracking.ts
import { createInputAdapter } from '@web/adapters/createInputAdapter';

const eyeAdapter = createInputAdapter('eye-tracking');
```

### Step 2: Call `createInputAdapter` to get an adapter instance

The factory accepts either a source name string or a configuration object:

```typescript
// Simple: just a source name
const adapter = createInputAdapter('eye-tracking');

// With default target: intents go here when no explicit target is specified
const adapter = createInputAdapter({
  source: 'eye-tracking',
  defaultTarget: 'inputBar',
});
```

### Step 3: Wire input source events to adapter methods

The adapter provides typed convenience methods for common actions:

| Method    | Signature                                                          | Use for                          |
| --------- | ------------------------------------------------------------------ | -------------------------------- |
| `grab`    | `(position: Position, target?: string) => EmitResult \| null`      | User grabs/pinches at a location |
| `release` | `(position: Position) => EmitResult \| null`                       | User releases grip               |
| `move`    | `(position: Position, delta?: MoveDelta) => EmitResult \| null`    | Continuous position updates      |
| `tap`     | `(position: Position) => EmitResult \| null`                       | Quick tap/click at a location    |
| `press`   | `(value: string \| number, target?: string) => EmitResult \| null` | Key/button press                 |
| `toggle`  | `(target: string, value?: boolean) => EmitResult \| null`          | Toggle a target on/off           |
| `focus`   | `(target: string) => EmitResult \| null`                           | Focus a target                   |
| `submit`  | `(target: string, value?: unknown) => EmitResult \| null`          | Submit to a target               |
| `emit`    | `(action: string, options?: EmitOptions) => EmitResult \| null`    | Custom actions (any name)        |

Wire your hardware events to these methods:

```typescript
// Example: eye tracking events
export function onGazeFocus(x: number, y: number) {
  eyeAdapter.tap({ x, y });
}

export function onGazeDrag(x: number, y: number, dx: number, dy: number) {
  eyeAdapter.move({ x, y }, { dx, dy });
}

export function onDwell(x: number, y: number, target: string) {
  // Custom action for eye dwell (not one of the built-in methods)
  eyeAdapter.emit('dwell', {
    position: { x, y },
    target,
  });
}
```

All methods return `EmitResult | null`. A `null` return means the coordinator was not available (graceful degradation).

### Step 4: Optionally add a convenience constructor

If your input source will be reused across the app, add a pre-configured factory to `web/adapters/createInputAdapter.ts`. The existing convenience constructors follow this pattern:

```typescript
// Existing examples in createInputAdapter.ts:
export const handTrackingAdapter = (): InputAdapter => createInputAdapter('hand-tracking');
export const voiceAdapter = (): InputAdapter => createInputAdapter('voice');
export const gamepadAdapter = (): InputAdapter => createInputAdapter('gamepad');
export const gestureAdapter = (): InputAdapter => createInputAdapter('gesture');
export const keyboardAdapter = (): InputAdapter => createInputAdapter('keyboard');

// Add yours:
export const eyeTrackingAdapter = (): InputAdapter => createInputAdapter('eye-tracking');
```

### Step 5: Register target components for new action names

If your input source emits custom actions (like `dwell` in the eye tracking example), target components need to register handlers for those actions via `useIntentCoordinator`:

```typescript
// In your Vue component
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

const { registerTarget, unregisterTarget } = useIntentCoordinator();

onMounted(() => {
  registerTarget('myWidget', {
    zone: '#my-widget', // CSS selector, ZoneRect, or function
    actions: ['tap', 'dwell'], // Include your custom actions
    handler: (intent) => {
      if (intent.action === 'dwell') {
        // Handle eye dwell on this widget
      }
    },
  });
});

onUnmounted(() => {
  unregisterTarget('myWidget');
});
```

### Step 6: Verify no coordinator changes needed

The IntentCoordinator is source-agnostic. It routes intents based on action names and spatial zones, not input source identity. Adding a new input adapter requires **zero changes** to `web/composables/useIntentCoordinator.ts` or any coordinator internals. This is the CODEMAP.md boundary invariant for the Input Adapters system.

## Testing Your Changes

1. **Unit test:** Create a test that verifies your adapter calls `emit` with the correct source name, action, position, and value for each input event type.

2. **Integration test:** Start the dev server (`npm run web:dev`), trigger your input source, and use the intent coordinator debug overlay (`Ctrl+Shift+I` or `window.intentCoordinator.showDebug()`) to see intents flowing through the system.

3. **Target resolution:** Verify that spatial intents (those with `position`) resolve to the correct target. The coordinator uses a 150px grace distance for zone matching.

4. **Graceful degradation:** Verify that calling adapter methods when the coordinator is unavailable returns `null` without throwing errors.

5. **Lint and type-check:**

```bash
npm run lint && npm run type-check
```

## Checklist

- [ ] Created input source file with `createInputAdapter('<your-source>')`
- [ ] Wired hardware/browser events to adapter methods
- [ ] Custom actions (if any) documented in target component handlers
- [ ] Optionally added convenience constructor in `web/adapters/createInputAdapter.ts`
- [ ] No changes made to coordinator internals (`useIntentCoordinator.ts`)
- [ ] Tested intent flow with debug overlay
- [ ] `npm run lint && npm run type-check` passes

## Reference

- [INTENT_COORDINATOR_SYSTEM.md](../INTENT_COORDINATOR_SYSTEM.md) -- full system architecture
- [INTENT_COORDINATOR_SYSTEM.md - Expansion Guide](../INTENT_COORDINATOR_SYSTEM.md#expansion-guide) -- detailed walkthroughs for input sources, targets, and middleware
- [CODEMAP.md](../CODEMAP.md) -- Input Adapters boundary definition
- `web/adapters/createInputAdapter.ts` -- adapter factory and convenience constructors
- `web/composables/useIntentCoordinator.ts` -- target registration and intent routing

---

_Last verified: 2026-02-23_
