/*
 * Builds and caches the canonical system prompt that is shared across
 * assistantService, the `/chat` HTTP route, and any vision helpers.
 *
 * Source components:
 *   - `src/services/systemInstructions.md`  -- identity, tone, guardrails
 *   - `src/services/toolInstructions.md`    -- tooling contracts and budgets
 *   - `src/skills/` (subdirectories)         -- composable skill bodies (agents, playbooks)
 *   - `canon.json`                          -- preferred creators list
 *   - `banned.json`                         -- blocked creators list
 *
 * Two modes:
 *   1. getSystemPrompt()          -- static cached prompt (backward compatible)
 *   2. getSystemPrompt(context)   -- per-request dynamic composition via skill registry + composer
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import logger from './logger.js';
import { createSkillRegistry, type SkillRegistry } from '../services/skillRegistry.js';
import {
  classifyWithKeywords,
  composePrompt,
  type ComposedPrompt,
} from '../services/promptComposer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptContext {
  readonly provider: string;
  readonly userText: string;
  readonly agentContext?: string;
  readonly pinnedSkills?: string[];
  readonly usageHistory?: ReadonlyArray<{
    readonly skillName: string;
    readonly count: number;
    readonly lastUsed: number;
  }>;
  readonly debug?: boolean;
}

export interface PromptResult {
  readonly prompt: string;
  readonly loadedSkills: string[];
  readonly condensedSkills: string[];
  readonly debugInfo?: string;
}

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

let cachedPrompt: string | null = null;
let cachedFingerprint: string | null = null;

// Lazy singleton for the skill registry
let registryInstance: SkillRegistry | null = null;

interface PathMap {
  base: string;
  tools: string;
  skills: string;
  canon: string;
  banned: string;
}

const paths: PathMap = {
  base: path.join(__dirname, '..', 'services', 'systemInstructions.md'),
  tools: path.join(__dirname, '..', 'services', 'toolInstructions.md'),
  skills: process.env.SKILLS_DIR || path.join(__dirname, '..', 'skills'),
  canon: path.join(__dirname, '..', '..', 'canon.json'),
  banned: path.join(__dirname, '..', '..', 'banned.json'),
};

// ---------------------------------------------------------------------------
// File helpers (unchanged)
// ---------------------------------------------------------------------------

function readRequired(filePath: string, label?: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const name = label || path.basename(filePath);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load ${name}: ${message}`);
  }
}

function readOptional(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function loadList(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch (_) {
    return [];
  }
}

function loadSkillBodies(skillsDir: string): string[] {
  const bodies: string[] = [];
  if (!fs.existsSync(skillsDir)) return bodies;

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
      try {
        const content = fs.readFileSync(path.join(categoryPath, file), 'utf8');
        const parsed = matter(content);
        const body = parsed.content.trim();
        if (body) bodies.push(body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('skill_body_load_failed', { file: `${category}/${file}`, error: message });
      }
    }
  }

  return bodies;
}

// ---------------------------------------------------------------------------
// Fingerprinting (unchanged)
// ---------------------------------------------------------------------------

function getSkillFileStats(skillsDir: string): string[] {
  const segments: string[] = [];
  if (!fs.existsSync(skillsDir)) {
    segments.push('skills:missing');
    return segments;
  }

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
        segments.push(`skill:${category}/${file}:${stat.size}:${stat.mtimeMs}`);
      } catch {
        segments.push(`skill:${category}/${file}:error`);
      }
    }
  }

  if (segments.length === 0) {
    segments.push('skills:empty');
  }

  return segments;
}

function computeFingerprint(): string {
  const segments: string[] = [];
  for (const key of ['base', 'tools', 'canon', 'banned'] as const) {
    const filePath = paths[key];
    try {
      if (!fs.existsSync(filePath)) {
        segments.push(`${key}:missing`);
        continue;
      }
      const stat = fs.statSync(filePath);
      segments.push(`${key}:${stat.size}:${stat.mtimeMs}`);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : 'unknown';
      segments.push(`${key}:error:${code}`);
    }
  }

  segments.push(...getSkillFileStats(paths.skills));

  return segments.join('|');
}

// ---------------------------------------------------------------------------
// Static prompt builder (unchanged -- used by no-args overload)
// ---------------------------------------------------------------------------

function buildPrompt(): string {
  const base = readRequired(paths.base, 'systemInstructions.md');
  const tools = readRequired(paths.tools, 'toolInstructions.md');
  const skillBodies = loadSkillBodies(paths.skills);

  const canonList = loadList(paths.canon);
  const bannedList = loadList(paths.banned);

  const sections: string[] = [base, tools, ...skillBodies];

  if (Array.isArray(canonList) && canonList.length) {
    sections.push(
      '## Preferred Creators\n' + canonList.map((creator) => `- ${creator}`).join('\n')
    );
  }

  if (Array.isArray(bannedList) && bannedList.length) {
    sections.push('## Banned Creators\n' + bannedList.map((creator) => `- ${creator}`).join('\n'));
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Registry singleton (lazy, auto-refreshes via fingerprint)
// ---------------------------------------------------------------------------

function getRegistry(): SkillRegistry | null {
  if (!fs.existsSync(paths.skills)) {
    return null;
  }

  if (!registryInstance) {
    registryInstance = createSkillRegistry(paths.skills);
  }

  return registryInstance;
}

// ---------------------------------------------------------------------------
// Hardcoded minimal prompt (no skills directory fallback)
// ---------------------------------------------------------------------------

const MINIMAL_PROMPT = 'You are a helpful, knowledgeable assistant. Respond clearly and concisely.';

// ---------------------------------------------------------------------------
// Dynamic composition (per-request)
// ---------------------------------------------------------------------------

function buildDynamicPrompt(context: PromptContext): PromptResult {
  const registry = getRegistry();

  // Missing skills directory: degrade to hardcoded minimal prompt
  if (!registry || registry.skills.length === 0) {
    logger.debug('dynamic_prompt_fallback', { reason: 'no_skills_available' });

    // Still try to load core prompt files
    let corePrompt = MINIMAL_PROMPT;
    try {
      const base = readOptional(paths.base);
      const tools = readOptional(paths.tools);
      if (base) corePrompt = [base, tools].filter(Boolean).join('\n\n');
    } catch (_) {
      // Use minimal prompt
    }

    return {
      prompt: corePrompt,
      loadedSkills: [],
      condensedSkills: [],
    };
  }

  // Classify intent using keywords
  const classification = classifyWithKeywords(context.userText, registry, {
    agentCategory: context.agentContext,
    pinnedSkills: context.pinnedSkills,
    usageHistory: context.usageHistory,
  });

  // Log debug info if requested
  if (context.debug && classification.debugInfo) {
    logger.debug('skills_classification', { debugInfo: classification.debugInfo });
  }

  // Load core prompt components
  const corePrompt = readRequired(paths.base, 'systemInstructions.md');
  const toolPrompt = readRequired(paths.tools, 'toolInstructions.md');
  const canonList = loadList(paths.canon);
  const bannedList = loadList(paths.banned);

  // Compose token-budgeted prompt
  const composed: ComposedPrompt = composePrompt({
    provider: context.provider,
    scoredSkills: classification.matchedSkills,
    pinnedSkillNames: context.pinnedSkills ?? [],
    corePrompt,
    toolPrompt,
    canonList,
    bannedList,
  });

  if (context.debug) {
    logger.debug('skills_composed', {
      loaded: composed.loadedSkills,
      condensed: composed.condensedSkills,
      omitted: composed.omittedSkills,
      budgetUsed: `${composed.budgetUsed}%`,
      tokenEstimate: composed.tokenEstimate,
    });
  }

  return {
    prompt: composed.prompt,
    loadedSkills: [...composed.loadedSkills],
    condensedSkills: [...composed.condensedSkills],
    debugInfo: classification.debugInfo,
  };
}

// ---------------------------------------------------------------------------
// Public API (overloaded)
// ---------------------------------------------------------------------------

/**
 * Get the system prompt.
 *
 * - No args: returns static cached prompt (backward compatible for
 *   assistantService, visionService).
 * - With PromptContext: returns per-request dynamic prompt with loaded
 *   skills metadata.
 */
function getSystemPrompt(): string;
function getSystemPrompt(context: PromptContext): PromptResult;
function getSystemPrompt(context?: PromptContext): string | PromptResult {
  // Dynamic mode: per-request composition
  if (context) {
    return buildDynamicPrompt(context);
  }

  // Static mode: cached prompt (backward compatible)
  const fingerprint = computeFingerprint();
  if (!cachedPrompt || cachedFingerprint !== fingerprint) {
    cachedPrompt = buildPrompt();
    cachedFingerprint = fingerprint;
  }
  return cachedPrompt;
}

function resetSystemPromptCache(): void {
  cachedPrompt = null;
  cachedFingerprint = null;
  registryInstance = null;
}

module.exports = {
  getSystemPrompt,
  resetSystemPromptCache,
};

export { getSystemPrompt, resetSystemPromptCache };
