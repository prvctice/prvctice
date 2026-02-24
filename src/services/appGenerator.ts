/**
 * App generation service -- prompt composition, slot-fill parsing,
 * iteration prompt building, and LLM response parsing for the AI app generator.
 *
 * Loads the slot-filler prompt (compiled template approach) and the
 * assembler prompt (used by iterate-app). Also keeps the legacy monolithic
 * prompt (app-generation.md, still used by suggest-app).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ThemeColors } from '../../web/types/apps.js';
import { getTemplate, getTemplateSkeleton } from '../templates/index.js';
import type { ArchetypeTemplate } from '../templates/types.js';
import { z } from 'zod';
import { getManifest } from '../connectors/manifests.js';
import type { ConnectorManifest, MethodManifest } from '../connectors/manifests.js';
import { connectorSdkNamespace as sdkNamespace } from '../contracts/sdk-surface.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface GenerationResult {
  readonly name: string;
  readonly description: string;
  readonly html: string;
  readonly permissions: readonly string[];
  readonly window: { readonly width: number; readonly height: number };
  readonly explanation: string;
}

export interface SlotFillResult {
  readonly name: string;
  readonly description: string;
  readonly slots: Readonly<Record<string, string>>;
  readonly script: string;
  readonly style: string;
  readonly permissions: readonly string[];
  readonly window: { readonly width: number; readonly height: number } | null;
  readonly explanation: string;
}

// ---------------------------------------------------------------------------
// Template loading (cached at module scope)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _promptTemplate: string | null = null;
let _componentsGuide: string | null = null;
let _assembler: string | null = null;
let _slotFiller: string | null = null;

function loadCached(cache: { value: string | null }, relativePath: string): string {
  if (cache.value === null) {
    cache.value = readFileSync(resolve(__dirname, relativePath), 'utf-8');
  }
  return cache.value;
}

function getPromptTemplate(): string {
  if (_promptTemplate === null) {
    _promptTemplate = readFileSync(resolve(__dirname, '../prompts/app-generation.md'), 'utf-8');
  }
  return _promptTemplate;
}

function getComponentsGuide(): string {
  if (_componentsGuide === null) {
    _componentsGuide = readFileSync(resolve(__dirname, '../prompts/components-guide.md'), 'utf-8');
  }
  return _componentsGuide;
}

function getAssemblerPrompt(): string {
  const ref = { value: _assembler };
  const result = loadCached(ref, '../prompts/agents/assembler.md');
  _assembler = ref.value;
  return result;
}

function getSlotFillerPrompt(): string {
  const ref = { value: _slotFiller };
  const result = loadCached(ref, '../prompts/agents/slot-filler.md');
  _slotFiller = ref.value;
  return result;
}

// ---------------------------------------------------------------------------
// Legacy system prompt (still used by suggest-app)
// ---------------------------------------------------------------------------

interface BuildSystemPromptOptions {
  readonly theme: ThemeColors;
  readonly connectors: readonly string[];
  readonly existingNames: readonly string[];
}

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const template = getPromptTemplate();

  const themeColors = [
    `--prvctice-background: ${options.theme.background};`,
    `--prvctice-surface: ${options.theme.surface};`,
    `--prvctice-text: ${options.theme.text};`,
    `--prvctice-text-secondary: ${options.theme.textSecondary};`,
    `--prvctice-primary: ${options.theme.primary};`,
    `--prvctice-secondary: ${options.theme.secondary};`,
    `--prvctice-accent: ${options.theme.accent};`,
    `--prvctice-border: ${options.theme.border};`,
  ].join('\n');

  const connectors =
    options.connectors.length > 0 ? options.connectors.join(', ') : 'None available';

  const existingNames =
    options.existingNames.length > 0 ? options.existingNames.join(', ') : 'None yet';

  return template
    .replace('{{COMPONENTS_GUIDE}}', getComponentsGuide())
    .replace('{{THEME_COLORS}}', themeColors)
    .replace('{{CONNECTORS}}', connectors)
    .replace('{{EXISTING_NAMES}}', existingNames);
}

// ---------------------------------------------------------------------------
// Shared helpers (connector API, design tokens, theme block)
// ---------------------------------------------------------------------------

/**
 * Map connector IDs to their prvctice.* SDK namespace.
 * Derived from the contract schema to handle all hyphenated IDs correctly.
 */
function connectorSdkNamespace(connectorId: string): string {
  return `prvctice.${sdkNamespace(connectorId)}`;
}

/**
 * Recursively describe a Zod schema as a human-readable type string.
 * Goes up to maxDepth levels deep for nested objects so the LLM sees
 * the exact field names it must use (e.g. `items`, not `articles`).
 *
 * Uses Zod's public instanceof checks and property accessors (no _def access).
 */
function describeZodSchema(schema: unknown, depth: number = 0, maxDepth: number = 2): string {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return describeZodSchema(schema.unwrap(), depth, maxDepth);
  }

  if (schema instanceof z.ZodArray) {
    return describeZodSchema(schema.element, depth, maxDepth) + '[]';
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, unknown>;
    if (depth >= maxDepth) {
      return '{ ' + Object.keys(shape).join(', ') + ' }';
    }
    const parts = Object.entries(shape).map(function ([key, val]) {
      return key + ': ' + describeZodSchema(val, depth + 1, maxDepth);
    });
    return '{ ' + parts.join(', ') + ' }';
  }

  if (schema instanceof z.ZodRecord) return 'Record<string, unknown>';
  if (schema instanceof z.ZodEnum) {
    const vals = (schema as { options: readonly string[] }).options;
    return vals
      .map(function (v) {
        return '"' + v + '"';
      })
      .join(' | ');
  }
  if (schema instanceof z.ZodUnion) return 'string | object';
  if (schema instanceof z.ZodUnknown) return 'unknown';

  return 'object';
}

/**
 * Extract parameter names from a Zod input schema for SDK function signatures.
 */
function describeInputParams(inputSchema: unknown): string {
  if (!(inputSchema instanceof z.ZodObject)) return '';
  const shape = inputSchema.shape as Record<string, unknown>;

  return Object.entries(shape)
    .map(function ([key, val]) {
      const optional = val instanceof z.ZodOptional;
      return key + (optional ? '?' : '');
    })
    .join(', ');
}

/**
 * SDK parameter overrides for connectors whose SDK wrappers differ
 * from the raw manifest input schemas.
 */
const SDK_PARAM_OVERRIDES: Readonly<Record<string, Record<string, string>>> = {
  weather: {
    current: 'location?',
    forecast: 'location?, days?',
  },
  sports: {
    scores: 'sport?, league?',
    standings: 'sport?, league?',
    schedule: 'sport?, league?',
  },
};

function buildConnectorApiSection(connectorIds: readonly string[]): string {
  if (connectorIds.length === 0) return '';

  const sections: string[] = [];

  for (const id of connectorIds) {
    const manifest: ConnectorManifest | undefined = getManifest(id);
    if (!manifest) continue;

    const ns = connectorSdkNamespace(id);
    const lines: string[] = [`### ${id}`];

    const methods = manifest.methods as Readonly<Record<string, MethodManifest>>;
    for (const [methodName, method] of Object.entries(methods)) {
      const override = SDK_PARAM_OVERRIDES[id]?.[methodName];
      const params = override || describeInputParams(method.input);
      const outputDesc = describeZodSchema(method.output, 0, 2);
      lines.push(`- \`${ns}.${methodName}(${params})\` → \`${outputDesc}\``);
    }

    sections.push(lines.join('\n'));
  }

  if (sections.length === 0) return '';

  return (
    '\n\n## Connector API Reference (EXACT response shapes)\n\n' +
    'All connector methods return **Promises**. Use `.then(function(response) { ... }).catch(showError)`.\n' +
    'The field names below are **EXACT** — use `response.items`, NOT `response.articles` or other guesses.\n\n' +
    sections.join('\n\n')
  );
}

function buildDesignTokensSection(): string {
  return (
    '\n\n## Design Tokens (use ONLY these — never hardcode colors)\n\n' +
    'Colors: var(--p-bg), var(--p-surface), var(--p-text), var(--p-text-secondary), var(--p-text-muted), var(--p-primary), var(--p-secondary), var(--p-accent), var(--p-border), var(--p-success), var(--p-warning), var(--p-danger)\n' +
    'Typography: var(--p-font), var(--p-font-mono)\n' +
    'Spacing: var(--p-1) (4px) through var(--p-10) (40px)\n' +
    'Radius: var(--p-radius-sm) (6px), var(--p-radius-md) (8px), var(--p-radius-lg) (12px), var(--p-radius-xl) (28px), var(--p-radius-pill) (999px)\n' +
    'Motion: var(--p-ease), var(--p-duration-fast) (150ms), var(--p-duration) (250ms)\n\n' +
    'CRITICAL: Body background must be transparent or var(--p-bg). NEVER use white, #fff, #f5f5f5, or any light background. The host theme provides all base colors. NEVER hardcode cornflower/stock blue — use var(--p-primary).'
  );
}

function buildThemeColorBlock(theme: ThemeColors): string {
  const themeColors = [
    `--prvctice-background: ${theme.background};`,
    `--prvctice-surface: ${theme.surface};`,
    `--prvctice-text: ${theme.text};`,
    `--prvctice-text-secondary: ${theme.textSecondary};`,
    `--prvctice-primary: ${theme.primary};`,
    `--prvctice-secondary: ${theme.secondary};`,
    `--prvctice-accent: ${theme.accent};`,
    `--prvctice-border: ${theme.border};`,
  ].join('\n');

  return (
    '\n\n## Theme Colors (injected as CSS custom properties)\n' +
    themeColors +
    '\n\nThe UI Kit maps these to `--p-*` tokens automatically. Use `var(--p-*)` tokens — never hardcode colors.'
  );
}

// ---------------------------------------------------------------------------
// Slot filler prompt builders (compiled template approach)
// ---------------------------------------------------------------------------

function buildSlotDescriptions(template: ArchetypeTemplate): string {
  const lines: string[] = [];
  for (const slot of template.slots) {
    const req = slot.required ? '(required)' : '(optional)';
    lines.push(`- **{{${slot.name}}}** ${req}: ${slot.description}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Feature pattern selection — include only relevant app-type patterns
// ---------------------------------------------------------------------------

interface FeaturePattern {
  readonly header: string;
  readonly body: string;
  readonly keywords: readonly string[];
}

/**
 * Parse the slot-filler prompt into base instructions + individual feature patterns.
 * Splits on the "## Feature Completeness" section, then splits that section
 * on bold pattern headers like "**Audio / Synth / Music maker:**".
 */
function splitPromptAndPatterns(rawPrompt: string): {
  readonly basePrompt: string;
  readonly preamble: string;
  readonly patterns: readonly FeaturePattern[];
} {
  const featureHeader = '## Feature Completeness';
  const featureIdx = rawPrompt.indexOf(featureHeader);

  if (featureIdx === -1) {
    return { basePrompt: rawPrompt, preamble: '', patterns: [] };
  }

  // Find the next ## section after Feature Completeness (Output Format)
  const afterFeature = rawPrompt.slice(featureIdx);
  const nextSectionMatch = afterFeature.match(/\n## (?!Feature Completeness)/);
  const featureEnd = nextSectionMatch
    ? featureIdx + (nextSectionMatch.index ?? afterFeature.length)
    : rawPrompt.length;

  const basePrompt = rawPrompt.slice(0, featureIdx).trimEnd();
  const featureSection = rawPrompt.slice(featureIdx, featureEnd);
  const afterSection = rawPrompt.slice(featureEnd);

  // Extract the preamble (header + intro paragraph before first pattern)
  // Pattern headers are like **Audio / Synth / Music maker:** (colon inside bold)
  const firstPatternMatch = featureSection.match(/\n\*\*[^*]+?:\*\*/);
  const preamble = firstPatternMatch
    ? featureSection.slice(0, firstPatternMatch.index ?? 0).trim()
    : featureSection.trim();

  // Split into individual patterns on bold headers
  const patternRegex = /\*\*([^*]+?):\*\*\n/g;
  const patterns: FeaturePattern[] = [];
  const matches: Array<{ index: number; header: string }> = [];

  let m = patternRegex.exec(featureSection);
  while (m !== null) {
    matches.push({ index: m.index, header: m[1] ?? '' });
    m = patternRegex.exec(featureSection);
  }

  const stopWords = new Set(['the', 'and', 'for', 'etc', 'not', 'can', 'via']);
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : featureSection.length;
    const body = featureSection.slice(start, end).trim();
    const header = matches[i]!.header;

    // Derive keywords from the header (split on /, spaces, parenthetical text)
    const keywords = header
      .toLowerCase()
      .replace(/[()]/g, '')
      .split(/\s*[/,]\s*|\s+/)
      .filter(function (w) {
        return w.length > 2 && !stopWords.has(w);
      });

    patterns.push({ header, body, keywords });
  }

  // Re-append the Output Format section to the base prompt
  const baseWithOutput = afterSection.trim()
    ? basePrompt + '\n\n' + afterSection.trim()
    : basePrompt;

  return { basePrompt: baseWithOutput, preamble, patterns };
}

/** Cache parsed patterns at module scope */
let _parsedPrompt: ReturnType<typeof splitPromptAndPatterns> | null = null;

function getParsedSlotFillerPrompt(): ReturnType<typeof splitPromptAndPatterns> {
  if (_parsedPrompt === null) {
    _parsedPrompt = splitPromptAndPatterns(getSlotFillerPrompt());
  }
  return _parsedPrompt;
}

/**
 * Select the most relevant feature patterns for a user prompt.
 * Returns up to maxPatterns matches, scored by keyword overlap.
 */
function selectRelevantPatterns(
  userPrompt: string,
  patterns: readonly FeaturePattern[],
  maxPatterns: number = 3
): readonly FeaturePattern[] {
  const words = userPrompt.toLowerCase().split(/\s+/);
  const wordSet = new Set(words);

  const scored = patterns.map(function (pattern) {
    let score = 0;
    for (let i = 0; i < pattern.keywords.length; i++) {
      if (wordSet.has(pattern.keywords[i]!)) {
        score += 1;
      }
    }
    // Also check if any keyword is a substring of the prompt (catches "synth" in "synthesizer")
    if (score === 0) {
      const lowerPrompt = userPrompt.toLowerCase();
      for (let j = 0; j < pattern.keywords.length; j++) {
        if (lowerPrompt.includes(pattern.keywords[j]!)) {
          score += 0.5;
        }
      }
    }
    return { pattern: pattern, score: score };
  });

  return scored
    .filter(function (s) {
      return s.score > 0;
    })
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, maxPatterns)
    .map(function (s) {
      return s.pattern;
    });
}

export function buildSlotFillerPrompt(
  archetype: string,
  theme: ThemeColors,
  connectorIds: readonly string[],
  userPrompt?: string
): string {
  const template = getTemplate(archetype);
  const skeleton = template ? template.skeleton : '';
  const slotDescs = template ? buildSlotDescriptions(template) : '';

  const parsed = getParsedSlotFillerPrompt();

  // Build the feature section with only relevant patterns
  let featureSection = '';
  if (parsed.patterns.length > 0 && userPrompt) {
    const relevant = selectRelevantPatterns(userPrompt, parsed.patterns);
    if (relevant.length > 0) {
      featureSection =
        '\n\n' +
        parsed.preamble +
        '\n\n' +
        relevant
          .map(function (p) {
            return p.body;
          })
          .join('\n\n');
    } else {
      // No match — include just the preamble (general guidance)
      featureSection = '\n\n' + parsed.preamble;
    }
  } else if (parsed.patterns.length > 0) {
    // No user prompt provided — include just the preamble
    featureSection = '\n\n' + parsed.preamble;
  }

  const sections = [
    parsed.basePrompt,
    featureSection,
    '\n\n## Template Skeleton (archetype: ' + archetype + ')\n\n```html\n' + skeleton + '\n```\n',
    '\n## Slot Descriptions\n\n' + slotDescs,
    buildConnectorApiSection(connectorIds),
    buildDesignTokensSection(),
    buildThemeColorBlock(theme),
  ];

  return sections.join('');
}

export function buildSlotFillerUserMessage(
  userPrompt: string,
  existingNames: readonly string[]
): string {
  const parts = ['Build a widget for: ' + userPrompt];
  if (existingNames.length > 0) {
    parts.push('\nExisting app names (avoid duplicates): ' + existingNames.join(', '));
  }
  parts.push(
    '\nReturn ONLY a JSON object with: name, description, slots, script, style, permissions, window, explanation.'
  );
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Assembler prompt (used by iterate-app)
// ---------------------------------------------------------------------------

export function buildAssemblerPrompt(theme: ThemeColors): string {
  const prompt = getAssemblerPrompt();

  const themeColors = [
    `--prvctice-background: ${theme.background};`,
    `--prvctice-surface: ${theme.surface};`,
    `--prvctice-text: ${theme.text};`,
    `--prvctice-text-secondary: ${theme.textSecondary};`,
    `--prvctice-primary: ${theme.primary};`,
    `--prvctice-secondary: ${theme.secondary};`,
    `--prvctice-accent: ${theme.accent};`,
    `--prvctice-border: ${theme.border};`,
  ].join('\n');

  return (
    prompt +
    '\n\n## Theme Colors (injected as CSS custom properties)\n' +
    themeColors +
    '\n\nThe UI Kit maps these to `--p-*` tokens automatically. Use `var(--p-*)` tokens — never hardcode colors.'
  );
}

// ---------------------------------------------------------------------------
// Modular assembler prompt (composes template + tokens + connector API)
// Used by iterate-app for context-rich iteration
// ---------------------------------------------------------------------------

function buildTemplateSection(archetype: string): string {
  const skeleton = getTemplateSkeleton(archetype);
  if (!skeleton) return '';

  return (
    '\n\n## Template Structure (MUST follow)\n\n' +
    'You MUST use this HTML structure as your starting point. Fill the {{SLOT}} markers with content. ' +
    'Do not change the container hierarchy.\n\n' +
    skeleton
  );
}

export function buildModularAssemblerPrompt(
  theme: ThemeColors,
  archetype: string,
  connectorIds: readonly string[]
): string {
  const sections = [
    getAssemblerPrompt(),
    buildTemplateSection(archetype),
    buildDesignTokensSection(),
    buildConnectorApiSection(connectorIds),
    buildThemeColorBlock(theme),
  ];
  return sections.join('');
}

// ---------------------------------------------------------------------------
// Iteration prompts (for edit mode)
// ---------------------------------------------------------------------------

export function buildIterationPrompt(currentCode: string, editInstruction: string): string {
  return [
    'Modify this existing app. Here is the current HTML:\n',
    '```html',
    currentCode,
    '```\n',
    `Edit: ${editInstruction}\n`,
    'Rules:',
    '- Modify the existing code, do NOT regenerate from scratch.',
    '- Maintain all existing functionality unless explicitly asked to change it.',
    '- Keep the same app structure and bridge SDK usage patterns.',
    '- The app uses the prvctice UI Kit (p-* CSS classes, prvctice.ui.* JS components, var(--p-*) tokens). Continue using these patterns.',
    '- Never replace UI Kit primitives with raw CSS or hand-built components.',
    '',
    'Return ONLY a JSON object (no markdown fences, no explanation outside JSON):',
    '{"name":"...","description":"...","html":"<!DOCTYPE html>...complete modified HTML...","permissions":[...],"window":{"width":N,"height":N},"explanation":"What changed"}',
  ].join('\n');
}

export function buildIterationAssemblerUserMessage(
  currentCode: string,
  editInstruction: string
): string {
  const parts = [
    'Modify this existing widget. Here is the current HTML:',
    '',
    '```html',
    currentCode,
    '```',
    '',
    `Edit instruction: ${editInstruction}`,
    '',
    'Rules:',
    '- Modify the existing code, do NOT regenerate from scratch.',
    '- Maintain all existing functionality unless explicitly asked to change it.',
    '- Keep the same app structure and bridge SDK usage patterns.',
    '- Use p-* CSS classes, prvctice.ui.* JS components, var(--p-*) tokens.',
    '',
    'Return ONLY a JSON object:',
    '{"name":"...","description":"...","html":"<!DOCTYPE html>...complete modified HTML...","permissions":[...],"window":{"width":N,"height":N},"explanation":"What changed"}',
  ];

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// History-aware iteration prompt builders (multi-turn editing)
// ---------------------------------------------------------------------------

const MAX_HISTORY_MESSAGES = 20;

function formatConversationHistory(history: readonly ConversationMessage[]): string {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  if (recent.length === 0) return '';

  const lines = ['', '## Prior conversation about this widget:', ''];
  for (const msg of recent) {
    const label = msg.role === 'user' ? 'User' : 'Assistant';
    lines.push(`**${label}:** ${msg.content}`, '');
  }
  return lines.join('\n');
}

export function buildIterationAssemblerUserMessageWithHistory(
  currentCode: string,
  editInstruction: string,
  history: readonly ConversationMessage[]
): string {
  const base = buildIterationAssemblerUserMessage(currentCode, editInstruction);
  return base + formatConversationHistory(history);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function clampDimensions(w: number, h: number): { width: number; height: number } {
  return {
    width: Math.max(200, Math.min(800, Math.round(w))),
    height: Math.max(150, Math.min(600, Math.round(h))),
  };
}

function extractResult(parsed: Record<string, unknown>): GenerationResult | null {
  if (typeof parsed.name !== 'string' || typeof parsed.html !== 'string') {
    return null;
  }

  const windowObj =
    parsed.window && typeof parsed.window === 'object'
      ? (parsed.window as Record<string, unknown>)
      : {};
  const rawWidth = typeof windowObj.width === 'number' ? windowObj.width : 400;
  const rawHeight = typeof windowObj.height === 'number' ? windowObj.height : 300;

  const permissions = Array.isArray(parsed.permissions)
    ? parsed.permissions.filter((p): p is string => typeof p === 'string')
    : [];

  return {
    name: parsed.name,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    html: parsed.html,
    permissions,
    window: clampDimensions(rawWidth, rawHeight),
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
  };
}

export function parseGenerationResponse(raw: string): GenerationResult | null {
  return parseJsonResponse<GenerationResult>(raw, extractResult);
}

// ---------------------------------------------------------------------------
// Slot fill response parser
// ---------------------------------------------------------------------------

function extractSlotFillResult(parsed: Record<string, unknown>): SlotFillResult | null {
  if (typeof parsed.name !== 'string') return null;
  if (!parsed.slots || typeof parsed.slots !== 'object') return null;

  const windowObj =
    parsed.window && typeof parsed.window === 'object'
      ? (parsed.window as Record<string, unknown>)
      : null;
  const windowSize = windowObj
    ? {
        width: typeof windowObj.width === 'number' ? windowObj.width : 320,
        height: typeof windowObj.height === 'number' ? windowObj.height : 280,
      }
    : null;

  const permissions = Array.isArray(parsed.permissions)
    ? parsed.permissions.filter((p): p is string => typeof p === 'string')
    : [];

  return {
    name: parsed.name,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    slots: parsed.slots as Readonly<Record<string, string>>,
    script: typeof parsed.script === 'string' ? parsed.script : '',
    style: typeof parsed.style === 'string' ? parsed.style : '',
    permissions,
    window: windowSize,
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
  };
}

export function parseSlotFillResponse(raw: string): SlotFillResult | null {
  return parseJsonResponse<SlotFillResult>(raw, extractSlotFillResult);
}

// ---------------------------------------------------------------------------
// Generic JSON parser with multiple extraction strategies
// ---------------------------------------------------------------------------

function parseJsonResponse<T>(
  raw: string,
  extractor: (parsed: Record<string, unknown>) => T | null
): T | null {
  // Attempt 1: direct JSON.parse
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = extractor(parsed);
    if (result) return result;
  } catch {
    // Fall through
  }

  // Attempt 2: strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1]) as Record<string, unknown>;
      const result = extractor(parsed);
      if (result) return result;
    } catch {
      // Fall through
    }
  }

  // Attempt 3: extract first {...} block
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]) as Record<string, unknown>;
      const result = extractor(parsed);
      if (result) return result;
    } catch {
      // Fall through
    }
  }

  return null;
}
