/**
 * Suggestion System Types
 *
 * Types for the conviction scoring pipeline, skill proposals,
 * and dismissal tracking. All interfaces are immutable (readonly).
 */

import type { SequencePattern } from './observation.js';

// =============================================================================
// Conviction Scoring
// =============================================================================

/**
 * A pattern scored for conviction -- determines whether it reaches the user.
 */
export interface ConvictionScore {
  readonly pattern: SequencePattern;
  readonly conviction: number; // 0-1 scale
  readonly reasoning: string; // Human-readable explanation
  readonly patternKey: string; // Stable key for tracking
}

/**
 * Tracks how many times a user has dismissed a pattern suggestion.
 */
export interface DismissalRecord {
  readonly patternKey: string;
  readonly dismissedAt: number;
  readonly count: number;
  readonly snoozedUntil?: number;
  readonly previousApproaches?: ReadonlyArray<string>;
}

// =============================================================================
// Skill Proposals
// =============================================================================

export type ProposalStatus = 'pending' | 'shown' | 'approved' | 'dismissed' | 'snoozed';

/**
 * A generated skill proposal awaiting user decision.
 */
export interface SkillProposal {
  readonly id: string;
  readonly type: 'skill';
  readonly name: string;
  readonly summary: string;
  readonly reasoning: string;
  readonly impact: string;
  readonly skillMd: string;
  readonly patternKey: string;
  readonly createdAt: number;
  readonly status: ProposalStatus;
  readonly snoozedUntil?: number;
  readonly approvedAt?: number;
  readonly dismissedAt?: number;
}

// =============================================================================
// App Proposals
// =============================================================================

/**
 * App proposal generated from observed usage patterns.
 * Extends base proposal with app-specific fields.
 */
export interface AppProposal {
  readonly id: string;
  readonly type: 'app';
  readonly name: string;
  readonly description: string;
  readonly summary: string;
  readonly reasoning: string;
  readonly html: string;
  readonly permissions: ReadonlyArray<string>;
  readonly window: {
    readonly width: number;
    readonly height: number;
  };
  /** What happens when the user approves: 'launch' opens the app, 'pin' marks it pinned. */
  readonly action: 'launch' | 'pin';
  readonly patternKey: string;
  readonly status: ProposalStatus;
  readonly createdAt: number;
  readonly approvedAt?: number;
  readonly dismissedAt?: number;
}

/**
 * Union of all proposal types.
 * Discriminated via the `type` field.
 */
export type Proposal = SkillProposal | AppProposal;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Tunable parameters for conviction scoring.
 * All fields optional -- defaults are in the scoring function.
 */
export interface ConvictionOptions {
  readonly baseThreshold?: number; // Default: 0.7
  readonly minOccurrences?: number; // Default: 5
  readonly frequencyWeight?: number; // Default: 0.5
  readonly recencyWeight?: number; // Default: 0.3
  readonly consistencyWeight?: number; // Default: 0.2
  readonly dismissalPenaltyPerCount?: number; // Default: 0.15
  readonly globalDismissalMultiplier?: number; // Default: 0.8
  readonly dismissalDecayHalfLifeMs?: number; // Default: 14 days
}
