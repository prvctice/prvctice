/**
 * Default skill category definitions and utilities.
 *
 * Skills can use any category string, but these five are the built-in defaults
 * that ship with prvctice. Custom categories are accepted without error.
 */

export interface SkillCategoryDefinition {
  readonly name: string;
  readonly description: string;
}

/**
 * The five default skill categories with descriptions.
 */
export const DEFAULT_SKILL_CATEGORIES: readonly SkillCategoryDefinition[] = [
  {
    name: 'research',
    description: 'Skills for finding, gathering, and analyzing information',
  },
  {
    name: 'curation',
    description: 'Skills for organizing, filtering, and selecting content',
  },
  {
    name: 'workflow',
    description: 'Skills for multi-step processes and task automation',
  },
  {
    name: 'tool',
    description: 'Skills for using specific tools and integrations',
  },
  {
    name: 'behavioral',
    description: 'Skills that modify AI tone, style, or response patterns',
  },
] as const;

/**
 * Array of just the default category name strings.
 */
export const DEFAULT_CATEGORY_NAMES: readonly string[] = DEFAULT_SKILL_CATEGORIES.map(
  (c) => c.name
);

/**
 * Check whether a category name is one of the five built-in defaults.
 * Comparison is case-sensitive.
 */
export function isDefaultCategory(name: string): boolean {
  return DEFAULT_CATEGORY_NAMES.includes(name);
}

/**
 * Maps built-in skill IDs to their default category.
 * IDs correspond to BUILTIN_PROMPT_SKILLS in web/services/skills/builtinActions.ts.
 */
export const BUILTIN_CATEGORY_MAP: Record<string, string> = {
  'builtin-0': 'curation', // Recommend something
  'builtin-1': 'tool', // Open notes
  'builtin-2': 'tool', // Voice commands
  'builtin-3': 'research', // Help me with my research
  'builtin-4': 'research', // Find scenes from Sans soleil
  'builtin-5': 'tool', // Help & Tips
  'builtin-6': 'curation', // Create a playlist
  'builtin-7': 'curation', // What colors are in this?
  'builtin-8': 'curation', // Find films that looks like this
  'builtin-9': 'workflow', // What else can I ask you?
  'builtin-10': 'workflow', // Let's play a game
  'builtin-11': 'curation', // Who makes stuff like this?
};
