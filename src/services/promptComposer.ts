/**
 * Prompt Composer — classifies user intent, selects relevant skills,
 * and assembles them into a token-budgeted prompt per provider.
 *
 * Replaces the static "join all skills" assembly with intelligent,
 * budget-aware composition driven by keyword matching and scoring.
 */

import {
  scoreSkillByKeywords,
  applyUsageBoost,
  type RegisteredSkill,
  type ScoredSkill,
  type UsageRecord,
  type SkillRegistry,
} from './skillRegistry.js';

// Static import of capabilities for provider budget lookup
import capabilities from '../../config/capabilities.json';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKILL_BUDGET_RATIO = 0.1;
const DEFAULT_CONTEXT_WINDOW = 32768;
const FALLBACK_SKILL_COUNT = 3;
const HIGH_CONFIDENCE_THRESHOLD = 0.3;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  readonly matchedSkills: ReadonlyArray<ScoredSkill>;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly method: 'keyword' | 'llm' | 'fallback';
  readonly debugInfo?: string;
}

export interface ProviderBudget {
  readonly contextWindow: number;
  readonly skillBudget: number;
}

export interface ComposerOptions {
  readonly provider: string;
  readonly scoredSkills: ReadonlyArray<ScoredSkill>;
  readonly pinnedSkillNames: ReadonlyArray<string>;
  readonly corePrompt: string;
  readonly toolPrompt: string;
  readonly canonList: ReadonlyArray<string>;
  readonly bannedList: ReadonlyArray<string>;
}

export interface ComposedPrompt {
  readonly prompt: string;
  readonly loadedSkills: ReadonlyArray<string>;
  readonly condensedSkills: ReadonlyArray<string>;
  readonly omittedSkills: ReadonlyArray<string>;
  readonly tokenEstimate: number;
  readonly budgetUsed: number;
}

// ---------------------------------------------------------------------------
// Token estimation (sync fallback — chars / 4)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ---------------------------------------------------------------------------
// classifyWithKeywords
// ---------------------------------------------------------------------------

export function classifyWithKeywords(
  userText: string,
  registry: SkillRegistry,
  context: {
    agentCategory?: string;
    pinnedSkills?: ReadonlyArray<string>;
    usageHistory?: ReadonlyArray<UsageRecord>;
  }
): ClassificationResult {
  const userWords = new Set(userText.toLowerCase().split(/\W+/).filter(Boolean));

  const scored = scoreAllSkills(userWords, registry.skills, context);
  const confidence = determineConfidence(scored);

  if (confidence === 'low') {
    const fallback = buildFallbackSkills(registry.skills, context);
    return buildDebugResult(fallback, 'low', 'keyword', userText, context);
  }

  const filtered = scored.filter((s) => s.score > 0);
  return buildDebugResult(filtered, confidence, 'keyword', userText, context);
}

function scoreAllSkills(
  userWords: Set<string>,
  skills: ReadonlyArray<RegisteredSkill>,
  context: {
    agentCategory?: string;
    pinnedSkills?: ReadonlyArray<string>;
    usageHistory?: ReadonlyArray<UsageRecord>;
  }
): ReadonlyArray<ScoredSkill> {
  const pinnedNames = new Set(context.pinnedSkills ?? []);

  return skills
    .map((skill): ScoredSkill => {
      if (pinnedNames.has(skill.name)) {
        return { skill, score: 1.0, reason: 'pinned' };
      }

      let score = scoreSkillByKeywords(userWords, skill, {
        agentCategory: context.agentCategory,
      });

      if (context.usageHistory) {
        score = applyUsageBoost(score, skill.name, context.usageHistory);
      }

      return { skill, score, reason: score > 0 ? 'keyword-match' : 'no-match' };
    })
    .sort((a, b) => b.score - a.score);
}

function determineConfidence(scored: ReadonlyArray<ScoredSkill>): 'high' | 'medium' | 'low' {
  const first = scored[0];
  const topScore = first !== undefined ? first.score : 0;

  if (topScore >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (topScore >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  return 'low';
}

function buildFallbackSkills(
  skills: ReadonlyArray<RegisteredSkill>,
  context: { agentCategory?: string }
): ReadonlyArray<ScoredSkill> {
  // Score all skills by base relevance (agents first, then by category match)
  const ranked = [...skills]
    .map((skill): ScoredSkill => {
      let score = 0.1; // base fallback score
      if (skill.isAgent) score += 0.05;

      // Bias toward active agent category if present
      if (context.agentCategory) {
        const cats = Array.isArray(skill.category) ? skill.category : [skill.category];
        if (cats.includes(context.agentCategory)) {
          score += 0.1;
        }
      }

      return { skill, score, reason: 'fallback' };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(
    0,
    Math.max(FALLBACK_SKILL_COUNT, Math.min(ranked.length, FALLBACK_SKILL_COUNT))
  );
}

function buildDebugResult(
  matchedSkills: ReadonlyArray<ScoredSkill>,
  confidence: 'high' | 'medium' | 'low',
  method: 'keyword' | 'llm' | 'fallback',
  userText: string,
  context: { agentCategory?: string }
): ClassificationResult {
  const debugEnabled = process.env.DEBUG_SKILLS === '1';

  if (!debugEnabled) {
    return { matchedSkills, confidence, method };
  }

  const lines = [
    `[skills] classify: text="${userText}" method=${method} confidence=${confidence}`,
    ...matchedSkills.map(
      (s) => `[skills] score: ${s.skill.name}=${s.score.toFixed(2)} (${s.reason})`
    ),
  ];

  if (context.agentCategory) {
    lines.push(`[skills] context: agentCategory=${context.agentCategory}`);
  }

  return {
    matchedSkills,
    confidence,
    method,
    debugInfo: lines.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// getProviderBudget
// ---------------------------------------------------------------------------

export function getProviderBudget(provider: string): ProviderBudget {
  const providerKey = provider.toLowerCase();
  const config = (capabilities as Record<string, { maxTokens?: number }>)[providerKey];
  const contextWindow = config?.maxTokens ?? DEFAULT_CONTEXT_WINDOW;

  return {
    contextWindow,
    skillBudget: Math.floor(contextWindow * SKILL_BUDGET_RATIO),
  };
}

// ---------------------------------------------------------------------------
// composePrompt
// ---------------------------------------------------------------------------

export function composePrompt(options: ComposerOptions): ComposedPrompt {
  const coreSection = buildCoreSection(options);
  const { skillBudget } = getProviderBudget(options.provider);
  const sorted = sortSkillsForPacking(options.scoredSkills, options.pinnedSkillNames);
  const packed = packSkills(sorted, skillBudget);

  const skillSection = buildSkillSection(packed);
  const prompt = [coreSection, skillSection].filter(Boolean).join('\n\n');
  const tokenEstimate = estimateTokens(prompt);

  return {
    prompt,
    loadedSkills: packed.loaded.map((s) => s.skill.name),
    condensedSkills: packed.condensed.map((s) => s.skill.name),
    omittedSkills: packed.omitted.map((s) => s.skill.name),
    tokenEstimate,
    budgetUsed:
      skillBudget > 0 ? Math.min(100, Math.round((packed.tokensUsed / skillBudget) * 100)) : 0,
  };
}

// ---------------------------------------------------------------------------
// Internal: core section assembly (outside skill budget)
// ---------------------------------------------------------------------------

function buildCoreSection(options: ComposerOptions): string {
  const parts: string[] = [];

  if (options.corePrompt) {
    parts.push(options.corePrompt);
  }

  if (options.toolPrompt) {
    parts.push(options.toolPrompt);
  }

  if (options.canonList.length > 0) {
    parts.push(`## Canon\n${options.canonList.join('\n')}`);
  }

  if (options.bannedList.length > 0) {
    parts.push(`## Banned\n${options.bannedList.join('\n')}`);
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Internal: sort skills for packing (pinned first, agents next, score desc)
// ---------------------------------------------------------------------------

function sortSkillsForPacking(
  scoredSkills: ReadonlyArray<ScoredSkill>,
  pinnedSkillNames: ReadonlyArray<string>
): ReadonlyArray<ScoredSkill> {
  const pinnedSet = new Set(pinnedSkillNames);

  return [...scoredSkills].sort((a, b) => {
    const aPin = pinnedSet.has(a.skill.name) ? 1 : 0;
    const bPin = pinnedSet.has(b.skill.name) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;

    const aAgent = a.skill.isAgent ? 1 : 0;
    const bAgent = b.skill.isAgent ? 1 : 0;
    if (aAgent !== bAgent) return bAgent - aAgent;

    return b.score - a.score;
  });
}

// ---------------------------------------------------------------------------
// Internal: greedy skill packing within token budget
// ---------------------------------------------------------------------------

interface PackResult {
  readonly loaded: ReadonlyArray<ScoredSkill>;
  readonly condensed: ReadonlyArray<ScoredSkill>;
  readonly omitted: ReadonlyArray<ScoredSkill>;
  readonly tokensUsed: number;
}

function packSkills(sorted: ReadonlyArray<ScoredSkill>, budget: number): PackResult {
  const loaded: ScoredSkill[] = [];
  const condensed: ScoredSkill[] = [];
  const omitted: ScoredSkill[] = [];
  let tokensUsed = 0;

  for (const scored of sorted) {
    const bodyTokens = scored.skill.bodyTokens;

    if (tokensUsed + bodyTokens <= budget) {
      loaded.push(scored);
      tokensUsed += bodyTokens;
      continue;
    }

    // Try condensed version (description only + formatting overhead)
    const descTokens = estimateTokens(scored.skill.description) + 10;
    if (tokensUsed + descTokens <= budget) {
      condensed.push(scored);
      tokensUsed += descTokens;
      continue;
    }

    omitted.push(scored);
  }

  return { loaded, condensed, omitted, tokensUsed };
}

// ---------------------------------------------------------------------------
// Internal: build skill section of prompt from pack result
// ---------------------------------------------------------------------------

function buildSkillSection(packed: PackResult): string {
  const parts: string[] = [];

  for (const scored of packed.loaded) {
    parts.push(scored.skill.body);
  }

  if (packed.condensed.length > 0) {
    const condensedLines = packed.condensed.map(
      (s) => `- **${s.skill.name}:** ${s.skill.description}`
    );
    parts.push(`## Available Skills (condensed)\n${condensedLines.join('\n')}`);
  }

  return parts.join('\n\n');
}
