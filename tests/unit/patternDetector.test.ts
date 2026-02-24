import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicateActions,
  segmentByInactivity,
  detectSequences,
} from '../../web/services/patternDetector.js';
import type { ActionRecord } from '../../web/types/observation.js';

// =============================================================================
// Helpers
// =============================================================================

/** Base timestamp anchored to "now" so age-filter never discards test data. */
const BASE_TS = Date.now() - 1_000_000; // ~16 minutes ago

function makeAction(code: string, ts: number, sessionId = 'session-1'): ActionRecord {
  return { code, ts, sessionId };
}

/** Create an action with a relative offset from BASE_TS. */
function action(code: string, offsetMs: number, sessionId = 'session-1'): ActionRecord {
  return makeAction(code, BASE_TS + offsetMs, sessionId);
}

// =============================================================================
// deduplicateActions
// =============================================================================

describe('deduplicateActions', () => {
  it('removes consecutive duplicate codes', () => {
    const input = [
      makeAction('A', 1),
      makeAction('A', 2),
      makeAction('B', 3),
      makeAction('B', 4),
      makeAction('B', 5),
      makeAction('C', 6),
      makeAction('A', 7),
    ];
    const result = deduplicateActions(input);
    assert.deepEqual(
      result.map((a) => a.code),
      ['A', 'B', 'C', 'A']
    );
  });

  it('returns unchanged array when no consecutive dupes exist', () => {
    const input = [makeAction('A', 1), makeAction('B', 2), makeAction('C', 3)];
    const result = deduplicateActions(input);
    assert.deepEqual(
      result.map((a) => a.code),
      ['A', 'B', 'C']
    );
  });

  it('returns empty array for empty input', () => {
    const result = deduplicateActions([]);
    assert.deepEqual(result, []);
  });

  it('returns single-element array unchanged', () => {
    const input = [makeAction('A', 1)];
    const result = deduplicateActions(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].code, 'A');
  });
});

// =============================================================================
// segmentByInactivity
// =============================================================================

describe('segmentByInactivity', () => {
  const ONE_SECOND = 1000;
  const TEN_MINUTES = 10 * 60 * 1000;
  const GAP_MS = 5 * 60 * 1000; // 5 minutes

  it('keeps closely-spaced actions in one segment', () => {
    const input = [
      makeAction('A', 1000),
      makeAction('B', 1000 + ONE_SECOND),
      makeAction('C', 1000 + 2 * ONE_SECOND),
    ];
    const segments = segmentByInactivity(input, GAP_MS);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].length, 3);
  });

  it('splits on large time gap', () => {
    const input = [
      makeAction('A', 1000),
      makeAction('B', 2000),
      makeAction('C', 2000 + TEN_MINUTES),
      makeAction('D', 2000 + TEN_MINUTES + 1000),
    ];
    const segments = segmentByInactivity(input, GAP_MS);
    assert.equal(segments.length, 2);
    assert.deepEqual(
      segments[0].map((a) => a.code),
      ['A', 'B']
    );
    assert.deepEqual(
      segments[1].map((a) => a.code),
      ['C', 'D']
    );
  });

  it('returns empty array for empty input', () => {
    const segments = segmentByInactivity([], GAP_MS);
    assert.deepEqual(segments, []);
  });

  it('splits on session boundary even without time gap', () => {
    const input = [
      makeAction('A', 1000, 'session-1'),
      makeAction('B', 2000, 'session-1'),
      makeAction('C', 3000, 'session-2'),
      makeAction('D', 4000, 'session-2'),
    ];
    const segments = segmentByInactivity(input, GAP_MS);
    assert.equal(segments.length, 2);
    assert.deepEqual(
      segments[0].map((a) => a.code),
      ['A', 'B']
    );
    assert.deepEqual(
      segments[1].map((a) => a.code),
      ['C', 'D']
    );
  });
});

// =============================================================================
// detectSequences
// =============================================================================

describe('detectSequences', () => {
  it('detects a 2-length sequence repeated 3 times', () => {
    const input = [
      action('A', 0),
      action('B', 1000),
      action('A', 2000),
      action('B', 3000),
      action('A', 4000),
      action('B', 5000),
    ];
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions.length === 2 && p.actions[0] === 'A' && p.actions[1] === 'B'
    );
    assert.ok(ab, 'Expected [A, B] pattern to be detected');
    assert.equal(ab.count, 3);
  });

  it('does not detect sequences below minCount threshold', () => {
    const input = [action('A', 0), action('B', 1000), action('A', 2000), action('B', 3000)];
    // Default minCount is 3 -- only 2 occurrences here
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions.length === 2 && p.actions[0] === 'A' && p.actions[1] === 'B'
    );
    assert.equal(ab, undefined, 'Should not detect [A, B] with only 2 occurrences');
  });

  it('detects pattern within mixed sequence', () => {
    const input = [
      action('A', 0),
      action('B', 1000),
      action('A', 2000),
      action('B', 3000),
      action('C', 4000),
      action('A', 5000),
      action('B', 6000),
    ];
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions.length === 2 && p.actions[0] === 'A' && p.actions[1] === 'B'
    );
    assert.ok(ab, 'Expected [A, B] pattern in mixed sequence');
    assert.equal(ab.count, 3);
  });

  it('does NOT detect sequences crossing session boundaries', () => {
    const input = [
      action('A', 0, 'session-1'),
      action('B', 1000, 'session-2'),
      action('A', 2000, 'session-2'),
      action('B', 3000, 'session-2'),
      action('A', 4000, 'session-2'),
      action('B', 5000, 'session-2'),
    ];
    // Only 2 occurrences of [A,B] within session-2, not 3
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions.length === 2 && p.actions[0] === 'A' && p.actions[1] === 'B'
    );
    assert.equal(ab, undefined, 'Cross-session [A, B] should not count as pattern');
  });

  it('does NOT detect sequences crossing inactivity gaps', () => {
    const TEN_MIN = 10 * 60 * 1000;
    const input = [
      action('A', 0),
      // 10-minute gap
      action('B', TEN_MIN),
      action('A', TEN_MIN + 1000),
      action('B', 2 * TEN_MIN + 1000),
      action('A', 2 * TEN_MIN + 2000),
      action('B', 3 * TEN_MIN + 2000),
    ];
    // Each pair [A, B] is split by inactivity gaps into separate segments
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions.length === 2 && p.actions[0] === 'A' && p.actions[1] === 'B'
    );
    assert.equal(ab, undefined, 'Inactivity-split [A, B] should not count');
  });

  it('detects length-3 sequences', () => {
    const input = [
      action('A', 0),
      action('B', 1000),
      action('C', 2000),
      action('A', 3000),
      action('B', 4000),
      action('C', 5000),
      action('A', 6000),
      action('B', 7000),
      action('C', 8000),
    ];
    const patterns = detectSequences(input);
    const abc = patterns.find(
      (p) =>
        p.actions.length === 3 &&
        p.actions[0] === 'A' &&
        p.actions[1] === 'B' &&
        p.actions[2] === 'C'
    );
    assert.ok(abc, 'Expected [A, B, C] pattern to be detected');
    assert.equal(abc.count, 3);
  });

  it('collapses consecutive duplicates before detecting', () => {
    // [A, A, B, A, A, B, A, A, B] -> after dedup -> [A, B, A, B, A, B] -> [A, B] x3
    const input = [
      action('A', 0),
      action('A', 1000),
      action('B', 2000),
      action('A', 3000),
      action('A', 4000),
      action('B', 5000),
      action('A', 6000),
      action('A', 7000),
      action('B', 8000),
    ];
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions.length === 2 && p.actions[0] === 'A' && p.actions[1] === 'B'
    );
    assert.ok(ab, 'Expected [A, B] after dedup');
    assert.equal(ab.count, 3);
  });

  it('returns empty for empty input', () => {
    const patterns = detectSequences([]);
    assert.deepEqual(patterns, []);
  });

  it('returns empty when all actions are older than maxAge', () => {
    const now = Date.now();
    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    const input = [
      makeAction('A', now - thirtyOneDays),
      makeAction('B', now - thirtyOneDays + 1000),
      makeAction('A', now - thirtyOneDays + 2000),
      makeAction('B', now - thirtyOneDays + 3000),
      makeAction('A', now - thirtyOneDays + 4000),
      makeAction('B', now - thirtyOneDays + 5000),
    ];
    const patterns = detectSequences(input);
    assert.deepEqual(patterns, []);
  });

  it('sorts results by count descending', () => {
    // [A, B] appears 4 times, [C, D] appears 3 times
    const input = [
      action('A', 0),
      action('B', 1000),
      action('C', 2000),
      action('D', 3000),
      action('A', 4000),
      action('B', 5000),
      action('C', 6000),
      action('D', 7000),
      action('A', 8000),
      action('B', 9000),
      action('C', 10000),
      action('D', 11000),
      action('A', 12000),
      action('B', 13000),
    ];
    const patterns = detectSequences(input);
    // Both [A,B] and [C,D] should appear, [A,B] first (count 4 > 3)
    const ab = patterns.find(
      (p) => p.actions[0] === 'A' && p.actions[1] === 'B' && p.actions.length === 2
    );
    const cd = patterns.find(
      (p) => p.actions[0] === 'C' && p.actions[1] === 'D' && p.actions.length === 2
    );
    assert.ok(ab);
    assert.ok(cd);
    assert.ok(patterns.indexOf(ab) < patterns.indexOf(cd), 'Higher count should appear first');
  });

  it('respects custom minCount option', () => {
    const input = [action('A', 0), action('B', 1000), action('A', 2000), action('B', 3000)];
    // minCount=2 should detect [A,B] with 2 occurrences
    const patterns = detectSequences(input, { minCount: 2 });
    const ab = patterns.find(
      (p) => p.actions[0] === 'A' && p.actions[1] === 'B' && p.actions.length === 2
    );
    assert.ok(ab, 'Should detect [A, B] with minCount=2');
    assert.equal(ab.count, 2);
  });

  it('tracks firstSeen and lastSeen timestamps', () => {
    const input = [
      action('A', 0),
      action('B', 1000),
      action('A', 4000),
      action('B', 5000),
      action('A', 8000),
      action('B', 9000),
    ];
    const patterns = detectSequences(input);
    const ab = patterns.find(
      (p) => p.actions[0] === 'A' && p.actions[1] === 'B' && p.actions.length === 2
    );
    assert.ok(ab);
    assert.equal(ab.firstSeen, BASE_TS);
    assert.equal(ab.lastSeen, BASE_TS + 9000);
  });
});
