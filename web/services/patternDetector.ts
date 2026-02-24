/**
 * N-Gram Sequence Pattern Detector
 *
 * Pure functions for detecting repeating action subsequences from the
 * observation buffer. No side effects, no service dependencies.
 *
 * Pipeline: filter age -> segment by session+inactivity -> dedup -> n-gram count -> filter -> sort
 */

import type { ActionRecord, DetectionOptions, SequencePattern } from '@web/types/observation.js';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_MIN_LENGTH = 2;
const DEFAULT_MAX_LENGTH = 4;
const DEFAULT_MIN_COUNT = 3;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_INACTIVITY_GAP_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// deduplicateActions
// =============================================================================

/**
 * Remove consecutive records with the same action code.
 * Keeps the first occurrence of each consecutive run.
 */
export function deduplicateActions(actions: ReadonlyArray<ActionRecord>): ActionRecord[] {
  const first = actions[0];
  if (!first) return [];

  const result: ActionRecord[] = [first];
  for (let i = 1; i < actions.length; i++) {
    if (actions[i]!.code !== actions[i - 1]!.code) {
      result.push(actions[i]!);
    }
  }
  return result;
}

// =============================================================================
// segmentByInactivity
// =============================================================================

/**
 * Split actions into sub-arrays where consecutive timestamps exceed gapMs
 * or where sessionId changes.
 */
export function segmentByInactivity(
  actions: ReadonlyArray<ActionRecord>,
  gapMs: number
): ActionRecord[][] {
  if (actions.length === 0) return [];

  const first = actions[0];
  if (!first) return [];

  const segments: ActionRecord[][] = [];
  let current: ActionRecord[] = [first];

  for (let i = 1; i < actions.length; i++) {
    const prev = actions[i - 1]!;
    const curr = actions[i]!;
    const timeDelta = curr.ts - prev.ts;

    if (timeDelta > gapMs || curr.sessionId !== prev.sessionId) {
      segments.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }

  segments.push(current);
  return segments;
}

// =============================================================================
// detectSequences
// =============================================================================

interface NgramEntry {
  count: number;
  firstSeen: number;
  lastSeen: number;
  actions: ReadonlyArray<string>;
}

/**
 * Detect repeating n-gram action sequences from a buffer of ActionRecords.
 *
 * Pipeline:
 * 1. Filter by maxAgeMs
 * 2. Segment by session + inactivity gap
 * 3. Deduplicate consecutive identical codes per segment
 * 4. Slide window of length minLength..maxLength
 * 5. Count occurrences
 * 6. Filter by minCount
 * 7. Sort by count descending
 */
export function detectSequences(
  actions: ReadonlyArray<ActionRecord>,
  options?: DetectionOptions
): SequencePattern[] {
  const minLength = options?.minLength ?? DEFAULT_MIN_LENGTH;
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  const minCount = options?.minCount ?? DEFAULT_MIN_COUNT;
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const inactivityGapMs = options?.inactivityGapMs ?? DEFAULT_INACTIVITY_GAP_MS;

  if (actions.length === 0) return [];

  // 1. Filter by age
  const cutoff = Date.now() - maxAgeMs;
  const recent = actions.filter((a) => a.ts >= cutoff);
  if (recent.length === 0) return [];

  // 2. Segment by session + inactivity
  const segments = segmentByInactivity(recent, inactivityGapMs);

  // 3. Dedup each segment, then extract n-grams
  const ngrams = new Map<string, NgramEntry>();

  for (const segment of segments) {
    const deduped = deduplicateActions(segment);
    if (deduped.length < minLength) continue;

    // 4. Slide window for each n-gram length
    for (let n = minLength; n <= maxLength; n++) {
      for (let i = 0; i <= deduped.length - n; i++) {
        const window = deduped.slice(i, i + n);
        const key = window.map((a) => a.code).join(' -> ');
        const codes = window.map((a) => a.code);
        const windowFirstTs = window[0]!.ts;
        const windowLastTs = window[n - 1]!.ts;

        const existing = ngrams.get(key);
        if (existing) {
          ngrams.set(key, {
            ...existing,
            count: existing.count + 1,
            firstSeen: Math.min(existing.firstSeen, windowFirstTs),
            lastSeen: Math.max(existing.lastSeen, windowLastTs),
          });
        } else {
          ngrams.set(key, {
            count: 1,
            firstSeen: windowFirstTs,
            lastSeen: windowLastTs,
            actions: codes,
          });
        }
      }
    }
  }

  // 6. Filter by minCount
  const results: SequencePattern[] = [];
  for (const entry of ngrams.values()) {
    if (entry.count >= minCount) {
      results.push({
        actions: entry.actions,
        count: entry.count,
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen,
      });
    }
  }

  // 7. Sort by count descending
  results.sort((a, b) => b.count - a.count);

  return results;
}
