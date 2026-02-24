/**
 * Template Registry
 *
 * Imports all archetype skeletons and provides lookup functions.
 * The registry is the single entry point for template access --
 * the validator, prompt composer, and assembler all query through here.
 */

import type { ArchetypeTemplate } from './types.js';
import { heroStatTemplate } from './skeletons/hero-stat.js';
import { mediaCardTemplate } from './skeletons/media-card.js';
import { splitPanelTemplate } from './skeletons/split-panel.js';
import { listTemplate } from './skeletons/list.js';
import { dashboardTemplate } from './skeletons/dashboard.js';
import { toolTemplate } from './skeletons/tool.js';
import { vizTemplate } from './skeletons/viz.js';

const templates: ReadonlyMap<string, ArchetypeTemplate> = new Map<string, ArchetypeTemplate>([
  [heroStatTemplate.id, heroStatTemplate],
  [mediaCardTemplate.id, mediaCardTemplate],
  [splitPanelTemplate.id, splitPanelTemplate],
  [listTemplate.id, listTemplate],
  [dashboardTemplate.id, dashboardTemplate],
  [toolTemplate.id, toolTemplate],
  [vizTemplate.id, vizTemplate],
]);

export function getTemplate(id: string): ArchetypeTemplate | undefined {
  return templates.get(id);
}

export function getAllTemplates(): readonly ArchetypeTemplate[] {
  return [...templates.values()];
}

export function getTemplateSkeleton(id: string): string | undefined {
  return templates.get(id)?.skeleton;
}

export type { ArchetypeTemplate, TemplateSlot, ArchetypeId } from './types.js';
export { ARCHETYPES } from './types.js';
