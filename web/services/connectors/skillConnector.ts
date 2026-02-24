/**
 * Skill Connector
 *
 * Exposes the skill coordinator's list and execute functionality
 * to sandboxed apps via the connector interface.
 */

import type { ConnectorHandler } from './types';

// ==================== HANDLER ====================

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  // Lazy import to avoid circular dependency at module load time
  const { default: useSkillCoordinator } = await import('@web/composables/useSkillCoordinator');
  const coordinator = useSkillCoordinator();

  switch (method) {
    case 'list': {
      const skills = coordinator.listSkills();
      return skills.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        tags: s.tags ?? [],
      }));
    }

    case 'execute': {
      const skillId = params.skillId as string;
      if (typeof skillId !== 'string') {
        throw new Error('Missing skillId parameter');
      }
      const result = await coordinator.execute(skillId);
      return result;
    }

    default:
      throw new Error(`Unknown skills method: ${method}`);
  }
}

export const skillConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
