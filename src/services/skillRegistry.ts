/**
 * Skill Registry — discovers, parses, indexes, and scores SKILL.md files.
 *
 * Provides structured, queryable access to skills for the prompt composer.
 * Replaces the naive "load all skills" pattern with keyword matching,
 * category filtering, usage-weighted scoring, and file-change caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import logger from '../utils/logger.js';

// tokenx is ESM-only; use lazy dynamic import cached in a module-level promise
let tokenxPromise: Promise<{ estimateTokenCount: (text: string) => number }> | null = null;
function getTokenx(): Promise<{ estimateTokenCount: (text: string) => number }> {
  if (!tokenxPromise) {
    tokenxPromise = import('tokenx');
  }
  return tokenxPromise;
}

// Fallback for synchronous context: rough estimate (chars / 4)
function estimateTokensFallback(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisteredSkill {
  readonly name: string;
  readonly category: string | string[];
  readonly description: string;
  readonly body: string;
  readonly bodyTokens: number;
  readonly triggers: {
    readonly keywords: string[];
    readonly intent: string;
  };
  readonly filePath: string;
  readonly isAgent: boolean;
}

export interface ScoredSkill {
  readonly skill: RegisteredSkill;
  readonly score: number;
  readonly reason: string;
}

export interface UsageRecord {
  readonly skillName: string;
  readonly count: number;
  readonly lastUsed: number;
}

export interface SkillRegistry {
  readonly skills: ReadonlyArray<RegisteredSkill>;
  getByKeywords(words: string[]): RegisteredSkill[];
  getByCategory(category: string): RegisteredSkill[];
  getAgents(): RegisteredSkill[];
  getPlaybooks(): RegisteredSkill[];
  refresh(): void;
}

// ---------------------------------------------------------------------------
// Internal: file fingerprint for cache invalidation
// ---------------------------------------------------------------------------

interface FileFingerprint {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

function collectFingerprints(skillsDir: string): ReadonlyArray<FileFingerprint> {
  const prints: FileFingerprint[] = [];
  if (!fs.existsSync(skillsDir)) return prints;

  const categories = fs.readdirSync(skillsDir).sort();
  for (const category of categories) {
    const categoryPath = path.join(skillsDir, category);
    try {
      if (!fs.statSync(categoryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      try {
        const stat = fs.statSync(filePath);
        prints.push({ path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // skip unreadable files
      }
    }
  }
  return prints;
}

function fingerprintKey(prints: ReadonlyArray<FileFingerprint>): string {
  return prints.map((p) => `${p.path}:${p.size}:${p.mtimeMs}`).join('|');
}

// ---------------------------------------------------------------------------
// Internal: parse a single skill file
// ---------------------------------------------------------------------------

function parseSkillFile(filePath: string, isAgent: boolean): RegisteredSkill | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    const body = parsed.content.trim();

    if (!body || !fm.name) return null;

    const triggers = (fm.triggers ?? {}) as Record<string, unknown>;

    return {
      name: String(fm.name),
      category: fm.category as string | string[],
      description: String(fm.description ?? ''),
      body,
      bodyTokens: estimateTokensFallback(body),
      triggers: {
        keywords: Array.isArray(triggers.keywords) ? (triggers.keywords as string[]) : [],
        intent: String(triggers.intent ?? ''),
      },
      filePath,
      isAgent,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('skill_parse_error', { filePath, error: message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: load all skills from directory
// ---------------------------------------------------------------------------

function loadAllSkills(skillsDir: string): ReadonlyArray<RegisteredSkill> {
  const skills: RegisteredSkill[] = [];
  if (!fs.existsSync(skillsDir)) return skills;

  const categories = fs.readdirSync(skillsDir).sort();
  for (const category of categories) {
    const categoryPath = path.join(skillsDir, category);
    try {
      if (!fs.statSync(categoryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const isAgent = category === 'agents';
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith('.md'))
      .sort();

    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      const skill = parseSkillFile(filePath, isAgent);
      if (skill) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

// ---------------------------------------------------------------------------
// Internal: update bodyTokens asynchronously via tokenx
// ---------------------------------------------------------------------------

async function enrichTokenCounts(
  skills: ReadonlyArray<RegisteredSkill>
): Promise<ReadonlyArray<RegisteredSkill>> {
  try {
    const { estimateTokenCount } = await getTokenx();
    return skills.map((skill) => ({
      ...skill,
      bodyTokens: estimateTokenCount(skill.body),
    }));
  } catch {
    // tokenx unavailable; keep fallback estimates
    return skills;
  }
}

// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------

export function createSkillRegistry(skillsDir: string): SkillRegistry {
  let cachedKey: string = '';
  let cachedSkills: ReadonlyArray<RegisteredSkill> = [];

  function ensureLoaded(): ReadonlyArray<RegisteredSkill> {
    const prints = collectFingerprints(skillsDir);
    const key = fingerprintKey(prints);

    if (key === cachedKey && cachedSkills.length > 0) {
      return cachedSkills;
    }

    cachedSkills = loadAllSkills(skillsDir);
    cachedKey = key;

    // Fire-and-forget: enrich token counts asynchronously
    enrichTokenCounts(cachedSkills)
      .then((enriched) => {
        cachedSkills = enriched;
      })
      .catch(() => {
        // keep fallback counts
      });

    return cachedSkills;
  }

  // Initial load
  ensureLoaded();

  const registry: SkillRegistry = {
    get skills(): ReadonlyArray<RegisteredSkill> {
      return ensureLoaded();
    },

    getByKeywords(words: string[]): RegisteredSkill[] {
      const wordSet = new Set(words.map((w) => w.toLowerCase()));
      return ensureLoaded().filter((skill) =>
        skill.triggers.keywords.some((kw) => {
          const parts = kw.toLowerCase().split(/\s+/);
          return parts.every((part) => wordSet.has(part));
        })
      );
    },

    getByCategory(category: string): RegisteredSkill[] {
      return ensureLoaded().filter((skill) => {
        const cats = Array.isArray(skill.category) ? skill.category : [skill.category];
        return cats.includes(category);
      });
    },

    getAgents(): RegisteredSkill[] {
      return ensureLoaded().filter((skill) => skill.isAgent);
    },

    getPlaybooks(): RegisteredSkill[] {
      return ensureLoaded().filter((skill) => !skill.isAgent);
    },

    refresh(): void {
      cachedKey = '';
      cachedSkills = [];
      ensureLoaded();
    },
  };

  return registry;
}

// ---------------------------------------------------------------------------
// Scoring: keyword match scoring
// ---------------------------------------------------------------------------

export function scoreSkillByKeywords(
  userWords: Set<string>,
  skill: RegisteredSkill,
  context: { agentCategory?: string }
): number {
  const keywords = skill.triggers.keywords;
  if (keywords.length === 0) return 0;

  let matchCount = 0;

  for (const kw of keywords) {
    const parts = kw.toLowerCase().split(/\s+/);
    const allPresent = parts.every((part) => userWords.has(part));
    if (allPresent) {
      matchCount += 1;
    }
  }

  if (matchCount === 0) return 0;

  // Base score: match density (proportion of keywords matched)
  const density = matchCount / keywords.length;

  // Specificity bonus: reward more absolute matches
  const specificityBonus = matchCount * 0.05;

  let score = density + specificityBonus;

  // Agent context bias: 30% boost when skill category matches context
  if (context.agentCategory) {
    const cats = Array.isArray(skill.category) ? skill.category : [skill.category];
    if (cats.includes(context.agentCategory)) {
      score = score * 1.3;
    }
  }

  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Scoring: usage boost with logarithmic decay
// ---------------------------------------------------------------------------

const ONE_HOUR_MS = 3600000;

export function applyUsageBoost(
  score: number,
  skillName: string,
  usageHistory: ReadonlyArray<UsageRecord>
): number {
  const record = usageHistory.find((r) => r.skillName === skillName);
  if (!record || record.count === 0) return score;

  // Logarithmic usage boost
  const usageBoost = Math.log2(record.count + 1) * 0.02;

  // Recency boost: extra 0.05 if used within last hour
  const recencyBoost = Date.now() - record.lastUsed < ONE_HOUR_MS ? 0.05 : 0;

  return Math.min(score + usageBoost + recencyBoost, 1.0);
}

// ---------------------------------------------------------------------------
// Adaptive tuning: enrich usage history with pattern-derived boosts
// ---------------------------------------------------------------------------

/**
 * Summary of action patterns associated with a skill.
 * Used to derive adaptive scoring boosts from observed usage.
 */
export interface ActionPatternSummary {
  readonly skillName: string;
  readonly actionCount: number;
  readonly category: string;
}

/** Maximum additional count that adaptive tuning can add per skill. */
const MAX_ADAPTIVE_BOOST = 5;

/**
 * Enrich base usage history with pattern-derived boosts.
 *
 * For each pattern summary, either boosts an existing usage record's count
 * or creates a new one. The boost follows a logarithmic curve capped at
 * MAX_ADAPTIVE_BOOST to prevent feedback loops.
 *
 * Returns a new array -- the input is never mutated.
 */
export function enrichUsageHistory(
  baseHistory: ReadonlyArray<UsageRecord>,
  patternSummaries: ReadonlyArray<ActionPatternSummary>
): ReadonlyArray<UsageRecord> {
  // Build a mutable map from existing records
  const enriched = new Map<string, UsageRecord>(
    baseHistory.map((record) => [record.skillName, record])
  );

  for (const summary of patternSummaries) {
    const rawBoost = Math.round(Math.log2(summary.actionCount + 1) * 2);
    const boost = Math.min(rawBoost, MAX_ADAPTIVE_BOOST);

    if (boost <= 0) continue;

    const existing = enriched.get(summary.skillName);

    if (existing) {
      enriched.set(summary.skillName, {
        ...existing,
        count: existing.count + boost,
      });
    } else {
      enriched.set(summary.skillName, {
        skillName: summary.skillName,
        count: boost,
        lastUsed: Date.now(),
      });
    }
  }

  return Array.from(enriched.values());
}
