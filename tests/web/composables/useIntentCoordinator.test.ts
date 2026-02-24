import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useIntentCoordinator } from '../../../web/composables/useIntentCoordinator.js';

// =============================================================================
// Setup: DOM mocking for string zone selectors
// =============================================================================

const mockElements = new Map<string, { getBoundingClientRect: () => DOMRect }>();

function mockElement(
  selector: string,
  rect: { x: number; y: number; width: number; height: number }
): void {
  mockElements.set(selector, {
    getBoundingClientRect: () =>
      ({
        ...rect,
        left: rect.x,
        top: rect.y,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        toJSON: () => rect,
      }) as DOMRect,
  });
}

// Install a minimal document mock if one doesn't exist or patch querySelector
const originalDocument = globalThis.document;
globalThis.document = {
  ...((originalDocument as unknown) || {}),
  querySelector: (selector: string) => mockElements.get(selector) || null,
} as unknown as Document;

// =============================================================================
// Helpers
// =============================================================================

function getCoordinator() {
  return useIntentCoordinator();
}

/** Convenience: register a target that accepts all actions at a ZoneRect. */
function registerZoneTarget(
  id: string,
  zone: { x: number; y: number; width: number; height: number },
  actions: string[] = ['tap', 'move', 'grab', 'release', 'press'],
  opts: { priority?: number } = {}
) {
  const handler = () => {};
  getCoordinator().registerTarget(id, { zone, actions, priority: opts.priority, handler });
  return handler;
}

/** Convenience: register a non-spatial target with explicit ID. */
function registerExplicitTarget(
  id: string,
  actions: string[] = ['press', 'submit', 'focus', 'tap'],
  opts: { priority?: number } = {}
) {
  const calls: unknown[] = [];
  const handler = (intent: unknown) => calls.push(intent);
  getCoordinator().registerTarget(id, { actions, priority: opts.priority, handler });
  return { handler, calls };
}

// =============================================================================
// Cleanup between tests
// =============================================================================

let middlewareUnsubs: Array<() => void> = [];

beforeEach(() => {
  const ic = getCoordinator();
  // Unregister all targets from previous test
  for (const id of ic.getTargets().keys()) {
    ic.unregisterTarget(id);
  }
  // Clear mock elements
  mockElements.clear();
  // Clear middleware
  middlewareUnsubs = [];
});

afterEach(() => {
  // Unsubscribe any middleware registered during the test
  for (const unsub of middlewareUnsubs) {
    unsub();
  }
  middlewareUnsubs = [];
});

// =============================================================================
// Target Resolution -- Explicit vs Spatial
// =============================================================================

describe('Target Resolution -- Explicit vs Spatial', () => {
  it('emit with explicit target (no position) routes to named target', () => {
    const { calls } = registerExplicitTarget('inputBar', ['press']);
    const ic = getCoordinator();

    const result = ic.emit({ source: 'keyboard', action: 'press', target: 'inputBar', value: 'a' });

    assert.ok(result, 'emit should return a result');
    assert.equal(result.target?.id, 'inputBar');
    assert.equal(calls.length, 1, 'handler should have been called');
  });

  it('emit with position (no target) routes to closest spatial target', () => {
    const ic = getCoordinator();
    const zone = { x: 100, y: 100, width: 200, height: 50 };
    registerZoneTarget('widget', zone, ['tap']);

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 150, y: 120 } });

    assert.ok(result, 'emit should return a result');
    assert.equal(result.target?.id, 'widget');
  });

  it('emit with BOTH target and position gives explicit target priority', () => {
    const ic = getCoordinator();

    // Spatial target at 100,100
    registerZoneTarget('spatialWidget', { x: 100, y: 100, width: 200, height: 50 }, ['tap']);

    // Explicit target
    const { calls } = registerExplicitTarget('explicitWidget', ['tap']);

    // Position is inside spatial, but explicit target is also specified
    const result = ic.emit({
      source: 'hand',
      action: 'tap',
      target: 'explicitWidget',
      position: { x: 150, y: 120 },
    });

    assert.ok(result);
    assert.equal(result.target?.id, 'explicitWidget', 'explicit target should win over spatial');
    assert.equal(calls.length, 1);
  });

  it('emit with explicit target that does not support the action falls through to spatial', () => {
    const ic = getCoordinator();

    // Explicit target only supports 'submit', not 'tap'
    registerExplicitTarget('explicitWidget', ['submit']);

    // Spatial target supports 'tap'
    registerZoneTarget('spatialWidget', { x: 100, y: 100, width: 200, height: 50 }, ['tap']);

    const result = ic.emit({
      source: 'hand',
      action: 'tap',
      target: 'explicitWidget',
      position: { x: 150, y: 120 },
    });

    assert.ok(result);
    assert.equal(result.target?.id, 'spatialWidget', 'should fall through to spatial target');
  });

  it('emit with explicit target that does not exist falls through to spatial', () => {
    const ic = getCoordinator();

    registerZoneTarget('spatialWidget', { x: 100, y: 100, width: 200, height: 50 }, ['tap']);

    const result = ic.emit({
      source: 'hand',
      action: 'tap',
      target: 'nonExistent',
      position: { x: 150, y: 120 },
    });

    assert.ok(result);
    assert.equal(result.target?.id, 'spatialWidget', 'should fall through to spatial');
  });

  it('emit with no target and no position returns null target', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    const result = ic.emit({ source: 'test', action: 'press' });

    assert.ok(result, 'emit returns result even when no target');
    assert.equal(result.target, null);
  });
});

// =============================================================================
// Spatial Resolution
// =============================================================================

describe('Spatial Resolution', () => {
  it('point inside a single zone resolves to that target', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'box');
  });

  it('point inside two overlapping zones resolves by score (priority then distance)', () => {
    const ic = getCoordinator();

    // Two overlapping zones, but 'inner' has higher priority
    registerZoneTarget('outer', { x: 0, y: 0, width: 300, height: 300 }, ['tap'], { priority: 0 });
    registerZoneTarget('inner', { x: 50, y: 50, width: 100, height: 100 }, ['tap'], {
      priority: 1,
    });

    // Point is inside both
    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'inner', 'higher priority wins when both inside');
  });

  it('point outside all zones but within GRACE_DISTANCE resolves to closest', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 200, y: 200, width: 100, height: 100 }, ['tap']);

    // Point is 50px away from the box (outside, but within 150px grace)
    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 150, y: 200 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'box');
  });

  it('point outside all zones and beyond GRACE_DISTANCE returns null', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 500, y: 500, width: 50, height: 50 }, ['tap']);

    // Point is far away (more than 150px)
    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 0, y: 0 } });

    assert.ok(result);
    assert.equal(result.target, null);
  });

  it('zone with CSS string selector resolves via document.querySelector mock', () => {
    const ic = getCoordinator();
    mockElement('#my-widget', { x: 100, y: 100, width: 200, height: 50 });

    ic.registerTarget('widget', {
      zone: '#my-widget',
      actions: ['tap'],
      handler: () => {},
    });

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 150, y: 120 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'widget');
  });

  it('zone with ZoneRect object resolves directly', () => {
    const ic = getCoordinator();
    ic.registerTarget('widget', {
      zone: { x: 10, y: 10, width: 80, height: 80 },
      actions: ['tap'],
      handler: () => {},
    });

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 50, y: 50 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'widget');
  });

  it('zone with function calls function for rect', () => {
    const ic = getCoordinator();
    let callCount = 0;
    ic.registerTarget('widget', {
      zone: () => {
        callCount++;
        return { x: 10, y: 10, width: 80, height: 80 };
      },
      actions: ['tap'],
      handler: () => {},
    });

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 50, y: 50 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'widget');
    assert.ok(callCount > 0, 'zone function should have been called');
  });

  it('zone with null is excluded from spatial resolution', () => {
    const ic = getCoordinator();
    ic.registerTarget('noZone', {
      zone: null,
      actions: ['tap'],
      handler: () => {},
    });

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 50, y: 50 } });

    assert.ok(result);
    assert.equal(result.target, null, 'null-zone target should not match spatially');
  });
});

// =============================================================================
// Priority
// =============================================================================

describe('Priority', () => {
  it('two overlapping targets with different priority -- higher priority wins', () => {
    const ic = getCoordinator();
    registerZoneTarget('low', { x: 0, y: 0, width: 200, height: 200 }, ['tap'], { priority: 0 });
    registerZoneTarget('high', { x: 0, y: 0, width: 200, height: 200 }, ['tap'], { priority: 5 });

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 100, y: 100 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'high');
  });

  it('two equidistant targets with different priority -- higher priority wins', () => {
    const ic = getCoordinator();
    // Both zones are the same size and position, but different priorities
    registerZoneTarget('low', { x: 50, y: 50, width: 100, height: 100 }, ['move'], { priority: 1 });
    registerZoneTarget('high', { x: 50, y: 50, width: 100, height: 100 }, ['move'], {
      priority: 3,
    });

    const result = ic.emit({ source: 'hand', action: 'move', position: { x: 75, y: 75 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'high');
  });

  it('higher priority target further away but in grace range still wins', () => {
    const ic = getCoordinator();
    // Low priority target: point is inside
    registerZoneTarget('close', { x: 40, y: 40, width: 100, height: 100 }, ['tap'], {
      priority: 0,
    });
    // High priority target: point is outside, but within grace distance (50px away)
    registerZoneTarget('far', { x: 200, y: 40, width: 100, height: 100 }, ['tap'], {
      priority: 15,
    });

    // Point at 60,60 is inside 'close', ~140px from edge of 'far'
    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 60, y: 60 } });

    assert.ok(result);
    // With PRIORITY_WEIGHT=100, priority 15 = 1500 score bonus.
    // 'close' gets INSIDE_BONUS=1000 + distanceScore(150) + priorityScore(0) = 1150
    // 'far' gets 0 + ~10 + 1500 = ~1510 (depending on exact distance)
    // Higher priority should still win
    assert.equal(
      result.target?.id,
      'far',
      'high priority should outweigh inside bonus for large priority difference'
    );
  });

  it('priority 0 (default) behaves normally', () => {
    const ic = getCoordinator();
    registerZoneTarget('widget', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);
    // Default priority is 0

    const target = ic.getTargets().get('widget');
    assert.ok(target);
    assert.equal(target.priority, 0);

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });
    assert.ok(result);
    assert.equal(result.target?.id, 'widget');
  });
});

// =============================================================================
// Enable / Disable
// =============================================================================

describe('Enable / Disable', () => {
  it('disabled target is skipped during explicit resolution', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);
    ic.disableTarget('widget');

    const result = ic.emit({ source: 'keyboard', action: 'press', target: 'widget' });

    assert.ok(result);
    assert.equal(result.target, null, 'disabled target should not match explicitly');
  });

  it('disabled target is skipped during spatial resolution', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);
    ic.disableTarget('box');

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });

    assert.ok(result);
    assert.equal(result.target, null, 'disabled target should not match spatially');
  });

  it('enableTarget re-enables a disabled target', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);
    ic.disableTarget('box');

    // Verify disabled
    let result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });
    assert.equal(result?.target, null);

    // Re-enable
    ic.enableTarget('box');

    result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });
    assert.ok(result);
    assert.equal(result.target?.id, 'box', 'target should be matchable after re-enabling');
  });

  it('disableTarget on already-disabled target is a no-op', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);
    ic.disableTarget('box');

    // Second disable should not throw or change state
    ic.disableTarget('box');

    const target = ic.getTargets().get('box');
    assert.ok(target);
    assert.equal(target.enabled, false);
  });

  it('disabled target stays in the map (not removed)', () => {
    const ic = getCoordinator();
    registerZoneTarget('box', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);
    ic.disableTarget('box');

    const map = ic.getTargets();
    assert.ok(map.has('box'), 'target should still be in the map');
    assert.equal(map.get('box')?.enabled, false);
  });
});

// =============================================================================
// Scoring
// =============================================================================

describe('Scoring', () => {
  it('inside target scores higher than outside target at same priority', () => {
    const ic = getCoordinator();
    // 'inside' zone contains the point
    registerZoneTarget('inside', { x: 50, y: 50, width: 100, height: 100 }, ['tap']);
    // 'outside' zone is near but does not contain the point
    registerZoneTarget('outside', { x: 200, y: 50, width: 100, height: 100 }, ['tap']);

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'inside');
  });

  it('closer target scores higher than farther target (both outside)', () => {
    const ic = getCoordinator();
    // Both targets are outside the point, but 'near' is closer
    registerZoneTarget('near', { x: 80, y: 0, width: 50, height: 50 }, ['tap']);
    registerZoneTarget('far', { x: 130, y: 0, width: 50, height: 50 }, ['tap']);

    // Point at 60,25 is outside both, but closer to 'near'
    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 60, y: 25 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'near');
  });

  it('priority adds significant score bonus', () => {
    const ic = getCoordinator();
    // Two targets, same position, same inside status
    registerZoneTarget('lowPri', { x: 50, y: 50, width: 100, height: 100 }, ['tap'], {
      priority: 0,
    });
    registerZoneTarget('highPri', { x: 50, y: 50, width: 100, height: 100 }, ['tap'], {
      priority: 2,
    });

    const result = ic.emit({ source: 'hand', action: 'tap', position: { x: 75, y: 75 } });

    assert.ok(result);
    assert.equal(result.target?.id, 'highPri');
  });
});

// =============================================================================
// Middleware
// =============================================================================

describe('Middleware', () => {
  it('onBeforeEmit can modify intent', () => {
    const ic = getCoordinator();
    const { calls } = registerExplicitTarget('widget', ['press']);

    const unsub = ic.onBeforeEmit((intent) => ({
      ...intent,
      value: 'modified',
    }));
    middlewareUnsubs.push(unsub);

    ic.emit({ source: 'test', action: 'press', target: 'widget', value: 'original' });

    assert.equal(calls.length, 1);
    assert.equal((calls[0] as { value: unknown }).value, 'modified');
  });

  it('onBeforeEmit returning null cancels intent', () => {
    const ic = getCoordinator();
    const { calls } = registerExplicitTarget('widget', ['press']);

    const unsub = ic.onBeforeEmit(() => null);
    middlewareUnsubs.push(unsub);

    const result = ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.equal(result, null, 'emit should return null when middleware cancels');
    assert.equal(calls.length, 0, 'handler should not be called');
  });

  it('onAfterEmit receives resolved target', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    let afterTarget: unknown = undefined;
    const unsub = ic.onAfterEmit((_intent, target) => {
      afterTarget = target;
    });
    middlewareUnsubs.push(unsub);

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.ok(afterTarget);
    assert.equal((afterTarget as { id: string }).id, 'widget');
  });

  it('onAfterEmit receives null target when no match', () => {
    const ic = getCoordinator();

    let afterTarget: unknown = 'sentinel';
    const unsub = ic.onAfterEmit((_intent, target) => {
      afterTarget = target;
    });
    middlewareUnsubs.push(unsub);

    ic.emit({ source: 'test', action: 'press' });

    assert.equal(afterTarget, null);
  });

  it('multiple middleware callbacks all execute', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    const order: number[] = [];
    const unsub1 = ic.onBeforeEmit((intent) => {
      order.push(1);
      return intent;
    });
    const unsub2 = ic.onBeforeEmit((intent) => {
      order.push(2);
      return intent;
    });
    middlewareUnsubs.push(unsub1, unsub2);

    const afterOrder: number[] = [];
    const unsub3 = ic.onAfterEmit(() => afterOrder.push(1));
    const unsub4 = ic.onAfterEmit(() => afterOrder.push(2));
    middlewareUnsubs.push(unsub3, unsub4);

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.deepEqual(order, [1, 2], 'all beforeEmit callbacks should fire');
    assert.deepEqual(afterOrder, [1, 2], 'all afterEmit callbacks should fire');
  });

  it('middleware unsubscribe works', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    let called = false;
    const unsub = ic.onBeforeEmit((intent) => {
      called = true;
      return intent;
    });
    // Immediately unsubscribe
    unsub();

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.equal(called, false, 'unsubscribed middleware should not be called');
  });
});

// =============================================================================
// State Management
// =============================================================================

describe('State Management', () => {
  it('activeTargetId reflects state.activeTarget as a computed ref', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.equal(ic.activeTargetId.value, 'widget');
  });

  it('emit updates state.activeTarget', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widgetA', ['press']);
    registerExplicitTarget('widgetB', ['press']);

    ic.emit({ source: 'test', action: 'press', target: 'widgetA' });
    assert.equal(ic.state.value.activeTarget, 'widgetA');

    ic.emit({ source: 'test', action: 'press', target: 'widgetB' });
    assert.equal(ic.state.value.activeTarget, 'widgetB');
  });

  it('emit updates state.isDragging on grab action', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['grab', 'release']);

    ic.emit({ source: 'hand', action: 'grab', target: 'widget' });
    assert.equal(ic.state.value.isDragging, true);
    assert.equal(ic.state.value.dragSource, 'hand');
  });

  it('emit updates state.isDragging on release action', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['grab', 'release']);

    // First grab
    ic.emit({ source: 'hand', action: 'grab', target: 'widget' });
    assert.equal(ic.state.value.isDragging, true);

    // Then release
    ic.emit({ source: 'hand', action: 'release', target: 'widget' });
    assert.equal(ic.state.value.isDragging, false);
    assert.equal(ic.state.value.dragSource, null);
  });

  it('emit updates state.isDragging on drag and dragstart actions', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['drag', 'dragstart', 'dragend']);

    ic.emit({ source: 'hand', action: 'dragstart', target: 'widget' });
    assert.equal(ic.state.value.isDragging, true);

    ic.emit({ source: 'hand', action: 'dragend', target: 'widget' });
    assert.equal(ic.state.value.isDragging, false);
  });

  it('history grows up to MAX_HISTORY (50)', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    // Emit 60 intents
    for (let i = 0; i < 60; i++) {
      ic.emit({ source: 'test', action: 'press', target: 'widget', value: i });
    }

    const hist = ic.getHistory();
    assert.equal(hist.length, 50, 'history should be capped at 50');
  });

  it('history is LIFO (newest first)', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    ic.emit({ source: 'test', action: 'press', target: 'widget', value: 'first' });
    ic.emit({ source: 'test', action: 'press', target: 'widget', value: 'second' });

    const hist = ic.getHistory();
    assert.equal(hist[0]?.value, 'second', 'newest should be first');
    assert.equal(hist[1]?.value, 'first', 'oldest should be second');
  });

  it('subscribe receives state updates', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    const states: Array<{ activeTarget: string | null }> = [];
    const unsub = ic.subscribe((s) => states.push({ activeTarget: s.activeTarget }));
    middlewareUnsubs.push(unsub);

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.ok(states.length > 0, 'subscriber should have been called');
    assert.equal(states[states.length - 1]?.activeTarget, 'widget');
  });

  it('subscribe unsubscribe stops callbacks', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    let callCount = 0;
    const unsub = ic.subscribe(() => callCount++);
    unsub();

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.equal(callCount, 0, 'unsubscribed state callback should not be called');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('registerTarget with same ID replaces existing target', () => {
    const ic = getCoordinator();

    const calls1: unknown[] = [];
    ic.registerTarget('widget', {
      actions: ['press'],
      handler: () => calls1.push(1),
    });

    const calls2: unknown[] = [];
    ic.registerTarget('widget', {
      actions: ['press'],
      handler: () => calls2.push(2),
    });

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.equal(calls1.length, 0, 'first handler should not be called');
    assert.equal(calls2.length, 1, 'second handler should be called');
  });

  it('unregisterTarget removes from map', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    ic.unregisterTarget('widget');

    assert.equal(ic.getTargets().has('widget'), false);
  });

  it('emit with no registered targets returns null target', () => {
    const ic = getCoordinator();

    const result = ic.emit({ source: 'test', action: 'press', target: 'nonExistent' });

    assert.ok(result);
    assert.equal(result.target, null);
  });

  it('handler errors do not prevent afterEmit callbacks', () => {
    const ic = getCoordinator();

    ic.registerTarget('widget', {
      actions: ['press'],
      handler: () => {
        throw new Error('handler crash');
      },
    });

    let afterCalled = false;
    const unsub = ic.onAfterEmit(() => {
      afterCalled = true;
    });
    middlewareUnsubs.push(unsub);

    // Should not throw
    const result = ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.ok(result, 'emit should still return result');
    assert.equal(result.target?.id, 'widget', 'target should still be resolved');
    assert.equal(afterCalled, true, 'afterEmit should fire despite handler error');
  });

  it('handler errors do not prevent state updates', () => {
    const ic = getCoordinator();

    ic.registerTarget('widget', {
      actions: ['grab'],
      handler: () => {
        throw new Error('handler crash');
      },
    });

    ic.emit({ source: 'hand', action: 'grab', target: 'widget' });

    assert.equal(ic.state.value.isDragging, true, 'state should still update after handler error');
  });

  it('emit adds timestamp when not provided', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    const before = Date.now();
    const result = ic.emit({ source: 'test', action: 'press', target: 'widget' });
    const after = Date.now();

    assert.ok(result);
    assert.ok(result.intent.timestamp >= before);
    assert.ok(result.intent.timestamp <= after);
  });

  it('emit preserves provided timestamp', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    const ts = 1234567890;
    const result = ic.emit({ source: 'test', action: 'press', target: 'widget', timestamp: ts });

    assert.ok(result);
    assert.equal(result.intent.timestamp, ts);
  });

  it('history records resolvedTarget', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    ic.emit({ source: 'test', action: 'press', target: 'widget' });

    const hist = ic.getHistory();
    assert.equal(hist[0]?.resolvedTarget, 'widget');
  });

  it('history records null resolvedTarget when no match', () => {
    const ic = getCoordinator();

    ic.emit({ source: 'test', action: 'press' });

    const hist = ic.getHistory();
    assert.equal(hist[0]?.resolvedTarget, null);
  });

  it('beforeEmit error does not prevent intent from being processed', () => {
    const ic = getCoordinator();
    const { calls } = registerExplicitTarget('widget', ['press']);

    const unsub = ic.onBeforeEmit(() => {
      throw new Error('middleware crash');
    });
    middlewareUnsubs.push(unsub);

    // Should not throw and should still process
    const result = ic.emit({ source: 'test', action: 'press', target: 'widget' });

    assert.ok(result);
    // The erroring middleware is skipped, and the original intent proceeds
    assert.equal(calls.length, 1);
  });

  it('afterEmit error does not throw from emit', () => {
    const ic = getCoordinator();
    registerExplicitTarget('widget', ['press']);

    const unsub = ic.onAfterEmit(() => {
      throw new Error('afterEmit crash');
    });
    middlewareUnsubs.push(unsub);

    // Should not throw
    const result = ic.emit({ source: 'test', action: 'press', target: 'widget' });
    assert.ok(result);
  });
});

// =============================================================================
// Zone Geometry Helpers
// =============================================================================

describe('Zone Geometry Helpers', () => {
  it('isInsideZone returns true for point inside rect', () => {
    const ic = getCoordinator();
    const result = ic.isInsideZone(50, 50, { x: 0, y: 0, width: 100, height: 100 });
    assert.equal(result, true);
  });

  it('isInsideZone returns false for point outside rect', () => {
    const ic = getCoordinator();
    const result = ic.isInsideZone(150, 150, { x: 0, y: 0, width: 100, height: 100 });
    assert.equal(result, false);
  });

  it('isInsideZone returns true for point on boundary', () => {
    const ic = getCoordinator();
    const result = ic.isInsideZone(100, 100, { x: 0, y: 0, width: 100, height: 100 });
    assert.equal(result, true);
  });

  it('isInsideZone returns false for null zone', () => {
    const ic = getCoordinator();
    const result = ic.isInsideZone(50, 50, null);
    assert.equal(result, false);
  });

  it('distanceToZone returns 0 for point inside', () => {
    const ic = getCoordinator();
    const result = ic.distanceToZone(50, 50, { x: 0, y: 0, width: 100, height: 100 });
    assert.equal(result, 0);
  });

  it('distanceToZone returns correct distance for point outside', () => {
    const ic = getCoordinator();
    // Point at 200,0 is 100px to the right of a zone 0,0 100x100
    const result = ic.distanceToZone(200, 0, { x: 0, y: 0, width: 100, height: 100 });
    assert.equal(result, 100);
  });

  it('distanceToZone returns Infinity for null zone', () => {
    const ic = getCoordinator();
    const result = ic.distanceToZone(50, 50, null);
    assert.equal(result, Infinity);
  });

  it('getZoneRect returns rect for ZoneRect object', () => {
    const ic = getCoordinator();
    const zone = { x: 10, y: 20, width: 30, height: 40 };
    const result = ic.getZoneRect(zone);
    assert.deepEqual(result, zone);
  });

  it('getZoneRect returns null for null zone', () => {
    const ic = getCoordinator();
    const result = ic.getZoneRect(null);
    assert.equal(result, null);
  });

  it('getZoneRect calls function zone and returns result', () => {
    const ic = getCoordinator();
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    const result = ic.getZoneRect(() => rect);
    assert.deepEqual(result, rect);
  });

  it('getZoneRect returns null when function zone returns null', () => {
    const ic = getCoordinator();
    const result = ic.getZoneRect(() => null);
    assert.equal(result, null);
  });

  it('getZoneRect resolves string selector via document.querySelector', () => {
    const ic = getCoordinator();
    mockElement('.test-el', { x: 5, y: 10, width: 50, height: 60 });

    const result = ic.getZoneRect('.test-el');
    assert.ok(result);
    assert.equal(result.x, 5);
    assert.equal(result.y, 10);
    assert.equal(result.width, 50);
    assert.equal(result.height, 60);
  });

  it('getZoneRect returns null for unresolvable string selector', () => {
    const ic = getCoordinator();
    const result = ic.getZoneRect('.does-not-exist');
    assert.equal(result, null);
  });
});

// =============================================================================
// Debug Helpers
// =============================================================================

describe('Debug Helpers', () => {
  it('showDebug sets debugVisible to true', () => {
    const ic = getCoordinator();
    ic.showDebug(true);
    assert.equal(ic.debugVisible.value, true);
  });

  it('showDebug(false) sets debugVisible to false', () => {
    const ic = getCoordinator();
    ic.showDebug(true);
    ic.showDebug(false);
    assert.equal(ic.debugVisible.value, false);
  });

  it('toggleDebug flips debugVisible', () => {
    const ic = getCoordinator();
    ic.showDebug(false);
    ic.toggleDebug();
    assert.equal(ic.debugVisible.value, true);
    ic.toggleDebug();
    assert.equal(ic.debugVisible.value, false);
  });

  it('getAllZoneRects returns rects for all targets with zones', () => {
    const ic = getCoordinator();
    registerZoneTarget('a', { x: 0, y: 0, width: 100, height: 100 }, ['tap']);
    registerZoneTarget('b', { x: 200, y: 200, width: 50, height: 50 }, ['tap']);
    // Target without a zone
    ic.registerTarget('c', { actions: ['tap'], handler: () => {} });

    const rects = ic.getAllZoneRects();
    assert.equal(rects.length, 2, 'should only include targets with zones');
    const ids = rects.map((r) => r.id).sort();
    assert.deepEqual(ids, ['a', 'b']);
  });

  it('getActiveTarget with position resolves target and updates state', () => {
    const ic = getCoordinator();
    registerZoneTarget('widget', { x: 50, y: 50, width: 100, height: 100 }, ['move']);

    const target = ic.getActiveTarget({ x: 75, y: 75 });

    assert.ok(target);
    assert.equal(target.id, 'widget');
    assert.equal(ic.state.value.activeTarget, 'widget');
  });

  it('getActiveTarget with null returns null', () => {
    const ic = getCoordinator();
    const target = ic.getActiveTarget(null);
    assert.equal(target, null);
  });
});

// =============================================================================
// Singleton Behavior
// =============================================================================

describe('Singleton Behavior', () => {
  it('multiple calls to useIntentCoordinator return same state', () => {
    const ic1 = useIntentCoordinator();
    const ic2 = useIntentCoordinator();

    ic1.registerTarget('shared', { actions: ['press'], handler: () => {} });

    assert.equal(ic2.getTargets().has('shared'), true, 'state should be shared across instances');
  });
});
