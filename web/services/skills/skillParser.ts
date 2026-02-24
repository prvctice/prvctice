/**
 * SKILL.md parser and validator.
 *
 * Parses SKILL.md file content (string with YAML frontmatter + markdown body)
 * into a validated SkillDocument object using gray-matter and Zod.
 *
 * NOTE: gray-matter is used with string input only (no fs calls).
 * If used in the browser, parsing should be done via IPC to avoid
 * Vite bundling issues with the `fs` module.
 */

import matter from 'gray-matter';
import { SkillFrontmatterSchema } from '../../types/skillSchema.js';
import type { SkillFrontmatter, SkillDocument } from '../../types/skillSchema.js';

// ============================================================
// Result types
// ============================================================

type ParseSuccess = { readonly success: true; readonly data: SkillDocument };
type ParseFailure = { readonly success: false; readonly error: string };
type ParseResult = ParseSuccess | ParseFailure;

type ValidateSuccess = { readonly success: true; readonly data: SkillFrontmatter };
type ValidateFailure = { readonly success: false; readonly error: string };
type ValidateResult = ValidateSuccess | ValidateFailure;

// ============================================================
// Public API
// ============================================================

/**
 * Parse a SKILL.md file content string into a validated SkillDocument.
 *
 * @param content - Raw file content with YAML frontmatter delimited by ---
 * @param fileName - Name of the file (e.g. "research-synthesis.md")
 * @returns Success with SkillDocument or failure with descriptive error string
 */
export function parseSkillDocument(content: string, fileName: string): ParseResult {
  // Check for frontmatter delimiters
  if (!content.trimStart().startsWith('---')) {
    return {
      success: false,
      error: 'Missing or empty frontmatter: file must begin with --- delimiters',
    };
  }

  const parsed = matter(content);

  // Check if frontmatter is empty (gray-matter parses `---\n---` as empty object)
  if (parsed.data === null || parsed.data === undefined) {
    return {
      success: false,
      error: 'Missing or empty frontmatter: no YAML data found between --- delimiters',
    };
  }

  const validation = validateSkillFrontmatter(parsed.data);

  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const document: SkillDocument = {
    frontmatter: validation.data,
    body: parsed.content.trim(),
    filePath: fileName,
    fileName,
  };

  return { success: true, data: document };
}

/**
 * Validate raw data against the SkillFrontmatter schema.
 * Standalone validation without parsing — for programmatic use.
 *
 * @param data - Unknown data to validate as skill frontmatter
 * @returns Success with typed SkillFrontmatter or failure with error description
 */
export function validateSkillFrontmatter(data: unknown): ValidateResult {
  const result = SkillFrontmatterSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessage = formatZodErrors(result.error);
  return { success: false, error: errorMessage };
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Format Zod validation errors into a human-readable string.
 */
function formatZodErrors(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map((p) => String(p)).join('.') : 'value';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
