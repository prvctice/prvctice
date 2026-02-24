/**
 * Template System Types
 *
 * Defines the structural template system for widget generation.
 * Templates are HTML skeletons with typed slots that constrain
 * AI-generated widget layout (Apple WidgetKit model).
 */

export interface TemplateSlot {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
  readonly defaultContent: string;
}

export interface ArchetypeTemplate {
  readonly id: string;
  readonly skeleton: string;
  readonly slots: readonly TemplateSlot[];
  readonly sizePreset: string;
  readonly requiredClasses: readonly string[];
  readonly forbiddenPatterns: readonly string[];
}

export const ARCHETYPES = [
  'hero-stat',
  'media-card',
  'split-panel',
  'list',
  'dashboard',
  'tool',
  'viz',
] as const;

export type ArchetypeId = (typeof ARCHETYPES)[number];
