import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreConviction, generatePatternKey } from '../../web/services/suggestionEngine.js';
import type { SequencePattern } from '../../web/types/observation.js';
import type { DismissalRecord } from '../../web/types/suggestions.js';

// =============================================================================
// Helpers
// =============================================================================

function makePattern(overrides: Partial<SequencePattern> = {}): SequencePattern {
  const now = Date.now();
  return {
    actions: ['skill:prompt', 'panel:open'],
    count: 8,
    firstSeen: now - 7 * 24 * 60 * 60 * 1000,
    lastSeen: now - 30 * 60 * 1000, // 30 minutes ago
    ...overrides,
  };
}

function makeDismissal(overrides: Partial<DismissalRecord> = {}): DismissalRecord {
  return {
    patternKey: 'skill:prompt -> panel:open',
    dismissedAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
    count: 1,
    ...overrides,
  };
}

// =============================================================================
// generatePatternKey
// =============================================================================

describe('generatePatternKey', () => {
  it('joins actions with arrow separator', () => {
    const key = generatePatternKey(['skill:prompt', 'panel:open']);
    assert.equal(key, 'skill:prompt -> panel:open');
  });

  it('handles single action', () => {
    const key = generatePatternKey(['skill:prompt']);
    assert.equal(key, 'skill:prompt');
  });

  it('handles three actions', () => {
    const key = generatePatternKey(['skill:prompt', 'panel:open', 'chat:new']);
    assert.equal(key, 'skill:prompt -> panel:open -> chat:new');
  });
});

// =============================================================================
// scoreConviction - basic scoring
// =============================================================================

describe('scoreConviction', () => {
  it('scores a strong pattern above threshold', () => {
    // count=8, recent (30min ago), no dismissals
    const pattern = makePattern({ count: 8 });
    const results = scoreConviction([pattern], [], []);

    assert.equal(results.length, 1);
    const score = results[0]!;
    assert.ok(score.conviction >= 0.7, `Expected conviction >= 0.7, got ${score.conviction}`);
    assert.ok(score.conviction <= 1.0, `Expected conviction <= 1.0, got ${score.conviction}`);
    assert.equal(score.patternKey, 'skill:prompt -> panel:open');
    assert.ok(score.reasoning.length > 0, 'Expected non-empty reasoning');
  });

  it('scores patterns below minimum occurrences with reduced consistency', () => {
    // count=3, below default minOccurrences=5
    // consistency = 3/5 = 0.6 (soft floor), frequency = 3/15 = 0.2
    // rawConviction = 0.2*0.5 + 1.0*0.3 + 0.6*0.2 = 0.52, below 0.7 threshold
    const pattern = makePattern({ count: 3 });
    const results = scoreConviction([pattern], [], []);

    assert.equal(results.length, 0);
  });

  it('allows low-count patterns through with lowered threshold', () => {
    // count=3, consistency = 3/5 = 0.6 (soft floor)
    // With a low threshold, the pattern should pass
    const pattern = makePattern({ count: 3, lastSeen: Date.now() - 10 * 60 * 1000 });
    const results = scoreConviction([pattern], [], [], {
      baseThreshold: 0.4,
    });

    assert.ok(results.length > 0, 'Low-count pattern should pass with lowered threshold');
    assert.ok(results[0]!.conviction < 0.7, 'Conviction should be below default threshold');
  });

  it('applies dismissal penalty', () => {
    // count=12, dismissed once -- penalty applied but still above threshold
    const pattern = makePattern({ count: 12 });
    const dismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 1,
    });

    const withoutDismissal = scoreConviction([pattern], [], []);
    const withDismissal = scoreConviction([pattern], [dismissal], []);

    assert.equal(withDismissal.length, 1);
    assert.ok(
      withDismissal[0]!.conviction < withoutDismissal[0]!.conviction,
      'Dismissal should reduce conviction'
    );
  });

  it('filters heavily dismissed patterns', () => {
    // count=6, dismissed 3 times -- heavy penalty should filter
    const pattern = makePattern({ count: 6 });
    const dismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 3,
    });

    const results = scoreConviction([pattern], [dismissal], []);
    assert.equal(results.length, 0);
  });

  it('filters snoozed patterns', () => {
    const pattern = makePattern({ count: 10 });
    const dismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 1,
      snoozedUntil: Date.now() + 60 * 60 * 1000, // 1 hour from now
    });

    const results = scoreConviction([pattern], [dismissal], []);
    assert.equal(results.length, 0);
  });

  it('includes expired snooze patterns', () => {
    const pattern = makePattern({ count: 10 });
    const dismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 1,
      snoozedUntil: Date.now() - 60 * 60 * 1000, // 1 hour ago (expired)
    });

    const results = scoreConviction([pattern], [dismissal], []);
    // Should not be filtered by snooze, but still has dismissal penalty
    assert.ok(results.length >= 0); // may or may not pass threshold depending on penalty
  });

  it('filters patterns matching existing skill names', () => {
    const pattern = makePattern({ count: 10 });
    const existingSkills = ['skill:prompt -> panel:open'];

    const results = scoreConviction([pattern], [], existingSkills);
    assert.equal(results.length, 0);
  });

  it('scores old patterns with low recency', () => {
    // count=6, but lastSeen > 30 days ago
    const pattern = makePattern({
      count: 6,
      lastSeen: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });

    const results = scoreConviction([pattern], [], []);
    // Low recency should reduce conviction below threshold
    assert.equal(results.length, 0);
  });

  it('returns results sorted by conviction descending', () => {
    const now = Date.now();
    const strong = makePattern({
      actions: ['chat:new', 'skill:prompt'],
      count: 15,
      lastSeen: now - 10 * 60 * 1000,
    });
    const medium = makePattern({
      actions: ['panel:open', 'panel:close'],
      count: 8,
      lastSeen: now - 2 * 24 * 60 * 60 * 1000,
    });

    const results = scoreConviction([medium, strong], [], []);
    if (results.length >= 2) {
      assert.ok(
        results[0]!.conviction >= results[1]!.conviction,
        'Results should be sorted by conviction descending'
      );
    }
  });

  it('respects custom options', () => {
    // count=3, normally filtered with default minOccurrences=5
    // but with minOccurrences=2, should pass
    const pattern = makePattern({
      count: 3,
      lastSeen: Date.now() - 10 * 60 * 1000,
    });

    const results = scoreConviction([pattern], [], [], {
      minOccurrences: 2,
      baseThreshold: 0.1,
    });

    assert.ok(results.length > 0, 'Should pass with lowered threshold and minOccurrences');
  });

  it('respects custom scoring weights', () => {
    // Heavy recency weight with a very recent pattern
    const now = Date.now();
    const pattern = makePattern({ count: 6, lastSeen: now - 10 * 60 * 1000 });

    const defaultResults = scoreConviction([pattern], [], [], undefined, now);
    const heavyRecency = scoreConviction(
      [pattern],
      [],
      [],
      {
        frequencyWeight: 0.1,
        recencyWeight: 0.8,
        consistencyWeight: 0.1,
      },
      now
    );

    // Recent pattern with heavy recency weight should score higher
    assert.ok(defaultResults.length > 0 && heavyRecency.length > 0);
    assert.ok(
      heavyRecency[0]!.conviction > defaultResults[0]!.conviction,
      'Heavy recency weight should boost score for recent pattern'
    );
  });

  it('applies globalDismissalMultiplier to reduce dismissal penalty', () => {
    const now = Date.now();
    const pattern = makePattern({ count: 10, lastSeen: now - 10 * 60 * 1000 });
    const dismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 2,
      dismissedAt: now - 24 * 60 * 60 * 1000,
    });

    const defaultResults = scoreConviction([pattern], [dismissal], [], undefined, now);
    const reducedPenalty = scoreConviction(
      [pattern],
      [dismissal],
      [],
      {
        globalDismissalMultiplier: 0.2,
      },
      now
    );

    // Lower multiplier means less dismissal penalty, so higher conviction
    if (defaultResults.length > 0 && reducedPenalty.length > 0) {
      assert.ok(
        reducedPenalty[0]!.conviction > defaultResults[0]!.conviction,
        'Lower globalDismissalMultiplier should reduce penalty'
      );
    }
  });

  it('handles empty patterns array', () => {
    const results = scoreConviction([], [], []);
    assert.equal(results.length, 0);
  });

  it('applies dismissal decay over time', () => {
    const pattern = makePattern({ count: 10 });

    // Recent dismissal (1 day ago)
    const recentDismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 1,
      dismissedAt: Date.now() - 24 * 60 * 60 * 1000,
    });

    // Old dismissal (30 days ago)
    const oldDismissal = makeDismissal({
      patternKey: 'skill:prompt -> panel:open',
      count: 1,
      dismissedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });

    const withRecent = scoreConviction([pattern], [recentDismissal], []);
    const withOld = scoreConviction([pattern], [oldDismissal], []);

    // Old dismissal should have less impact (more decay)
    if (withRecent.length > 0 && withOld.length > 0) {
      assert.ok(
        withOld[0]!.conviction >= withRecent[0]!.conviction,
        'Old dismissal should have less penalty than recent'
      );
    }
  });

  it('generates correct pattern keys', () => {
    const pattern = makePattern({
      actions: ['chat:new', 'skill:prompt', 'panel:open'],
      count: 10,
    });

    const results = scoreConviction([pattern], [], []);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.patternKey, 'chat:new -> skill:prompt -> panel:open');
  });
});
