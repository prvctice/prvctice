# Graphics + Animation Plan (Reduced Motion + Performance)

> STATUS: Planning document, not verified system documentation

Date: 2026-02-11
Scope: dotmatrix core, handtracking, ripple effects, skill physics, motion policy

## Goals

- Honor reduced-motion and user preference consistently across all animation systems.
- Improve performance predictability (frame pacing, quality scaling, and cleanup).
- Reduce confusing toggles and make behavior match labels.

## Current Priority Findings (summary)

1. Reduced-motion preference is effectively ignored because dotmatrixMotion.isReduced is hardcoded false.
2. 30fps mode can double-schedule frames due to manual RAF inside animate(), even when FrameCoordinator/fallback loop already runs.
3. Handtracking attaches a physics:snap handler on every start() and never removes it.
4. Reduce-effects mode only swaps shaders/bloom but does not reduce geometry, which can be confusing.

## Plan

### Phase 1: Fix reduced-motion gating (highest priority)

- Implement real reduced-motion state in dotmatrix globals and surface it in dotMatrixMotion.isReduced().
- Sync it with:
  - OS preference (prefers-reduced-motion media query)
  - local storage (DOTMATRIX_REDUCE_EFFECTS)
  - explicit user override (Effects settings)
- Update startDotMatrixSafely() and canStartDotMatrix() to consistently block animation when reduced-motion is true.
- Ensure ripple/skill-physics effects check the same shared policy.

Deliverables

- Single source of truth for reduced motion (utility or store)
- dotMatrixMotion.isReduced and hasExplicitPreference return accurate values
- Manual tests to confirm animations are disabled when preference is enabled

### Phase 2: Frame pacing and performance fixes

- Remove the extra RAF scheduling path in dotmatrix animate() when targetFrameRate === 30.
  - Instead, rely on FrameCoordinator or fallback loop to control frame cadence.
- Confirm fallback RAF path schedules exactly once per frame.
- Add a small perf debug flag to log average frame time when enabled (dev only).

Deliverables

- No duplicate RAF scheduling
- Frame pacing matches configured targetFrameRate

### Phase 3: Cleanup and listener hygiene

- Store and remove the physics:snap handler in handtracking stop().
- Audit any other long-lived listeners added on start() or enable().
- Verify stop() leaves no dangling listeners or active loops.

Deliverables

- Handtracking start/stop can be toggled repeatedly without accumulating handlers

### Phase 4: Clarify reduce-effects vs quality tier

- Decide desired semantics:
  - Option A: Reduce-effects = visual-only (rename to something like "Legacy shaders")
  - Option B: Reduce-effects = performance mode (apply low quality tier and smaller grid)
- Update UI copy and config behavior to match the chosen meaning.

Deliverables

- Consistent label and behavior for reduce-effects
- Updated docs if behavior changes

## Verification Checklist

- Reduced motion enabled -> dotmatrix does not start, ripples do not fire, and any motion effects are suppressed.
- Reduced motion disabled -> animation starts normally.
- Quality tier switching affects frame rate and pixel ratio without duplicate RAF loops.
- Toggling handtracking on/off multiple times does not duplicate physics:snap handling.

## Open Questions

- Should reduce-effects automatically force a low quality tier, or just swap shaders?
- Should reduced motion also disable skill physics deformations and ripple effects, or keep non-moving visual affordances?

## Files to Touch

- web/graphics/dotmatrix/core.ts
- web/utils/visuals.ts
- web/composables/useDotmatrixInit.ts
- web/graphics/dotmatrix/handtrack.ts
- web/composables/useRippleEffect.ts (if unified policy is added)
- web/composables/useSkillPhysics.ts (if unified policy is added)
