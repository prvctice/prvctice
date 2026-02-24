import { z } from 'zod';

// ============================================================
// Semver regex: matches MAJOR.MINOR.PATCH with optional pre-release/build
// ============================================================
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

// ============================================================
// Sub-schemas
// ============================================================

/**
 * Category schema: accepts any non-empty string.
 * The five default categories (research, curation, workflow, tool, behavioral)
 * are defined in skillCategories.ts, but custom categories are also valid.
 */
export const SkillCategorySchema = z.string().min(1);

/**
 * Trigger schema: keyword triggers and intent description
 */
export const SkillTriggerSchema = z.object({
  keywords: z.array(z.string()).optional(),
  intent: z.string().optional(),
});

/**
 * Dependency schema: reference to another skill
 */
export const SkillDependencySchema = z.object({
  name: z.string().min(1),
  optional: z.boolean().optional(),
});

// ============================================================
// Main frontmatter schema
// ============================================================

/**
 * Zod schema for SKILL.md YAML frontmatter validation.
 *
 * Required fields: name, version (semver), category (string or array)
 * Optional fields: description, triggers, dependencies, model_hints
 */
export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1, 'name is required'),
  version: z.string().regex(SEMVER_REGEX, 'version must be valid semver (e.g. 1.0.0)'),
  category: z.union([SkillCategorySchema, z.array(SkillCategorySchema).min(1)]),
  description: z.string().optional(),
  triggers: SkillTriggerSchema.optional(),
  dependencies: z.array(SkillDependencySchema).optional(),
  model_hints: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================
// Inferred types
// ============================================================

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
export type SkillTrigger = z.infer<typeof SkillTriggerSchema>;
export type SkillDependency = z.infer<typeof SkillDependencySchema>;

// ============================================================
// Document type (frontmatter + body + file metadata)
// ============================================================

export interface SkillDocument {
  frontmatter: SkillFrontmatter;
  body: string;
  filePath: string;
  fileName: string;
}
