/**
 * Suggestion Engine -- Conviction Scoring Pipeline
 *
 * Pure functions for scoring detected patterns and filtering by conviction.
 * The conviction scorer is the gate that determines whether any suggestion
 * reaches the user. High threshold, dismissal penalties, snooze filtering.
 *
 * Pipeline: generate keys -> filter existing skills -> filter snoozed ->
 *           score conviction -> apply dismissal penalty -> filter threshold -> sort
 */

import type { SequencePattern } from '@web/types/observation.js';
import type {
  ConvictionOptions,
  ConvictionScore,
  DismissalRecord,
} from '@web/types/suggestions.js';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_BASE_THRESHOLD = 0.7;
const DEFAULT_MIN_OCCURRENCES = 3;
const DEFAULT_FREQUENCY_WEIGHT = 0.5;
const DEFAULT_RECENCY_WEIGHT = 0.3;
const DEFAULT_CONSISTENCY_WEIGHT = 0.2;
const DEFAULT_DISMISSAL_PENALTY_PER_COUNT = 0.15;
const DEFAULT_GLOBAL_DISMISSAL_MULTIPLIER = 0.8;
const DEFAULT_DISMISSAL_DECAY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Recency time boundaries
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

// Frequency normalization ceiling
const FREQUENCY_CEILING = 8;

// =============================================================================
// generatePatternKey
// =============================================================================

/**
 * Create a stable key from an action sequence.
 * Uses the same ' -> ' join as the n-gram detector for consistency.
 */
export function generatePatternKey(actions: ReadonlyArray<string>): string {
  return actions.join(' -> ');
}

// =============================================================================
// Internal scoring helpers
// =============================================================================

function computeFrequencyScore(count: number): number {
  return Math.min(count / FREQUENCY_CEILING, 1.0);
}

function computeRecencyScore(lastSeen: number, now: number): number {
  const elapsed = now - lastSeen;
  if (elapsed < ONE_HOUR_MS) return 1.0;
  if (elapsed < ONE_DAY_MS) return 0.7;
  if (elapsed < SEVEN_DAYS_MS) return 0.4;
  return 0.1;
}

function computeConsistencyScore(count: number, minOccurrences: number): number {
  return count >= minOccurrences ? 1.0 : count / minOccurrences;
}

function computeDismissalDecay(timeSinceDismissalMs: number, halfLifeMs: number): number {
  // Exponential decay: penalty halves every halfLife period
  return Math.pow(0.5, timeSinceDismissalMs / halfLifeMs);
}

function buildReasoning(
  frequencyScore: number,
  recencyScore: number,
  consistencyScore: number,
  dismissalPenalty: number,
  finalConviction: number
): string {
  const parts: string[] = [];
  parts.push(`frequency=${frequencyScore.toFixed(2)}`);
  parts.push(`recency=${recencyScore.toFixed(2)}`);
  parts.push(`consistency=${consistencyScore.toFixed(2)}`);
  if (dismissalPenalty > 0) {
    parts.push(`dismissal_penalty=-${dismissalPenalty.toFixed(2)}`);
  }
  parts.push(`conviction=${finalConviction.toFixed(2)}`);
  return parts.join(', ');
}

// =============================================================================
// scoreConviction
// =============================================================================

/**
 * Score detected patterns for conviction and filter by threshold.
 *
 * Pure function: no side effects, deterministic given the same inputs and `now`.
 *
 * @param patterns - Detected sequence patterns from the n-gram detector
 * @param dismissals - User's dismissal history
 * @param existingSkillKeys - Pattern keys of already-existing skills (to exclude)
 * @param options - Tunable scoring parameters
 * @param now - Current timestamp (injectable for testing, defaults to Date.now())
 * @returns Scored patterns above the conviction threshold, sorted descending
 */
export function scoreConviction(
  patterns: ReadonlyArray<SequencePattern>,
  dismissals: ReadonlyArray<DismissalRecord>,
  existingSkillKeys: ReadonlyArray<string>,
  options?: ConvictionOptions,
  now?: number
): ConvictionScore[] {
  const threshold = options?.baseThreshold ?? DEFAULT_BASE_THRESHOLD;
  const minOccurrences = options?.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const frequencyWeight = options?.frequencyWeight ?? DEFAULT_FREQUENCY_WEIGHT;
  const recencyWeight = options?.recencyWeight ?? DEFAULT_RECENCY_WEIGHT;
  const consistencyWeight = options?.consistencyWeight ?? DEFAULT_CONSISTENCY_WEIGHT;
  const penaltyPerCount = options?.dismissalPenaltyPerCount ?? DEFAULT_DISMISSAL_PENALTY_PER_COUNT;
  const globalDismissalMultiplier =
    options?.globalDismissalMultiplier ?? DEFAULT_GLOBAL_DISMISSAL_MULTIPLIER;
  const decayHalfLifeMs = options?.dismissalDecayHalfLifeMs ?? DEFAULT_DISMISSAL_DECAY_HALF_LIFE_MS;
  const currentTime = now ?? Date.now();

  // Build lookup maps
  const existingSet = new Set(existingSkillKeys);
  const dismissalMap = new Map<string, DismissalRecord>();
  for (const d of dismissals) {
    dismissalMap.set(d.patternKey, d);
  }

  const results: ConvictionScore[] = [];

  for (const pattern of patterns) {
    const patternKey = generatePatternKey(pattern.actions);

    // Filter: skip patterns matching existing skills
    if (existingSet.has(patternKey)) continue;

    // Filter: skip snoozed patterns
    const dismissal = dismissalMap.get(patternKey);
    if (dismissal?.snoozedUntil !== undefined && dismissal.snoozedUntil > currentTime) {
      continue;
    }

    // Score components (consistency acts as soft floor for low-count patterns)
    const frequencyScore = computeFrequencyScore(pattern.count);
    const recencyScore = computeRecencyScore(pattern.lastSeen, currentTime);
    const consistencyScore = computeConsistencyScore(pattern.count, minOccurrences);

    const rawConviction =
      frequencyScore * frequencyWeight +
      recencyScore * recencyWeight +
      consistencyScore * consistencyWeight;

    // Apply dismissal penalty with time decay
    let dismissalPenalty = 0;
    if (dismissal) {
      const timeSinceDismissal = currentTime - dismissal.dismissedAt;
      const decayFactor = computeDismissalDecay(timeSinceDismissal, decayHalfLifeMs);
      dismissalPenalty =
        dismissal.count * penaltyPerCount * decayFactor * globalDismissalMultiplier;
    }

    const conviction = Math.max(0, rawConviction - dismissalPenalty);

    // Filter: skip patterns below conviction threshold
    if (conviction < threshold) continue;

    const reasoning = buildReasoning(
      frequencyScore,
      recencyScore,
      consistencyScore,
      dismissalPenalty,
      conviction
    );

    results.push({
      pattern,
      conviction,
      reasoning,
      patternKey,
    });
  }

  // Sort by conviction descending
  results.sort((a, b) => b.conviction - a.conviction);

  return results;
}

// =============================================================================
// Pattern Overlap Detection
// =============================================================================

/**
 * Check if two action sequences describe overlapping workflows.
 * Criteria:
 * 1. One is a contiguous substring of the other (e.g., A->B within A->B->C)
 * 2. High Jaccard similarity of unique action codes (>0.5)
 */
export function patternsOverlap(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  const aStr = a.join(' -> ');
  const bStr = b.join(' -> ');
  if (aStr.includes(bStr) || bStr.includes(aStr)) return true;

  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 && intersection / union > 0.5;
}

/**
 * Remove lower-conviction patterns that overlap with higher-conviction ones.
 * Input must be sorted by conviction descending (highest first).
 */
export function deduplicateOverlappingPatterns(
  scores: ReadonlyArray<ConvictionScore>
): ConvictionScore[] {
  const kept: ConvictionScore[] = [];

  for (const score of scores) {
    const dominated = kept.some((k) => patternsOverlap(score.pattern.actions, k.pattern.actions));
    if (!dominated) {
      kept.push(score);
    }
  }

  return kept;
}
