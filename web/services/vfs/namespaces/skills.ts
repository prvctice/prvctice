/**
 * VFS Skills Namespace Handler
 *
 * Provides read-only access to frontend skill definitions.
 * - read('/{slug}') -> skill definition as JSON (slug is lowercase, hyphenated name)
 * - list('/') -> all skills as file entries
 */

import type { VFSNamespaceHandler, VFSReadResult, VFSListResult } from '../types.js';
import { VFSNotFoundError } from '../types.js';

/** Convert a skill name to a URL-safe slug */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function createSkillsNamespace(): VFSNamespaceHandler {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async read(subpath: string, _appId: string): Promise<VFSReadResult> {
      const slug = subpath.replace(/^\//, '');
      if (!slug) {
        throw new VFSNotFoundError('/skills/');
      }

      const { useSkillCoordinator } = await import('@web/composables/useSkillCoordinator.js');
      const coordinator = useSkillCoordinator();
      const allSkills = coordinator.listSkills();

      const match = allSkills.find((s) => toSlug(s.title) === slug || s.id === slug);
      if (!match) {
        throw new VFSNotFoundError(`/skills/${slug}`);
      }

      // Return a safe subset of skill data (no internal callbacks)
      return {
        data: {
          id: match.id,
          title: match.title,
          type: match.type,
          source: match.source,
          icon: match.icon,
          color: match.color,
          tags: match.tags,
          usageCount: match.usageCount,
          lastUsed: match.lastUsed,
          createdAt: match.createdAt,
          promptConfig: match.promptConfig,
          templateConfig: match.templateConfig,
          actionConfig: match.actionConfig,
        },
        type: 'json',
      };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async list(_subpath: string, _appId: string): Promise<VFSListResult> {
      const { useSkillCoordinator } = await import('@web/composables/useSkillCoordinator.js');
      const coordinator = useSkillCoordinator();
      const allSkills = coordinator.listSkills();

      const entries = allSkills.map((s) => ({
        name: toSlug(s.title),
        type: 'file' as const,
        size: 0,
        modified: s.lastUsed || s.createdAt || 0,
      }));

      return { entries };
    },
  };
}
