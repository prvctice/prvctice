/**
 * Skills Search Provider
 * MiniSearch-backed provider that indexes skill titles from the skill coordinator.
 * Subscribes to event bus for incremental index updates.
 */

import MiniSearch from 'minisearch';
import type { SearchProvider, SearchResult } from '@web/types/search';

// ==================== TYPES ====================

interface SkillDoc {
  id: string;
  title: string;
  type: string;
  icon: string;
}

// ==================== MODULE STATE ====================

let initialized = false;

const index = new MiniSearch<SkillDoc>({
  fields: ['title'],
  storeFields: ['title', 'type', 'icon'],
  searchOptions: {
    boost: { title: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
});

// ==================== HELPERS ====================

function toSearchResult(
  doc: { id: string; title: string; type?: string; icon?: string },
  score: number
): SearchResult {
  return {
    id: doc.id,
    type: 'skill',
    title: doc.title || 'Untitled Skill',
    subtitle: doc.type || undefined,
    icon: doc.icon || 'ph:lightning',
    score,
    metadata: { providerId: 'skills' },
  };
}

// ==================== FACTORY ====================

export function createSkillsProvider(): SearchProvider {
  if (initialized) {
    return provider;
  }
  initialized = true;

  // Subscribe to event bus for incremental updates (lazy to avoid init order issues)
  import('@web/services/eventBus').then(({ useEventBus }) => {
    const bus = useEventBus();

    bus.on('skill:created', (data) => {
      if (!index.has(data.id)) {
        index.add({ id: data.id, title: data.title, type: '', icon: '' });
      }
    });

    bus.on('skill:deleted', (data) => {
      if (index.has(data.id)) {
        index.discard(data.id);
      }
    });
  });

  return provider;
}

// ==================== PROVIDER ====================

const provider: SearchProvider = {
  id: 'skills',
  label: 'Skills',
  icon: 'ph:lightning',
  priority: 30,

  search(query: string): SearchResult[] {
    const hits = index.search(query);
    return hits.map((hit) => {
      const stored = hit as unknown as SkillDoc;
      return toSearchResult(
        { id: hit.id as string, title: stored.title, type: stored.type, icon: stored.icon },
        hit.score
      );
    });
  },

  getRecent(): SearchResult[] {
    return [];
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute(_result: SearchResult): void {
    // Open the skills pane in settings modal
    import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
      useMenuActionStore().openSettings('skills');
    });
  },

  async rebuild(): Promise<void> {
    index.removeAll();

    const { useSkillCoordinator } = await import('@web/composables/useSkillCoordinator');
    const coordinator = useSkillCoordinator();
    const allSkills = coordinator.listSkills();

    const docs: SkillDoc[] = allSkills.map((skill) => ({
      id: skill.id,
      title: skill.title,
      type: skill.type || '',
      icon: skill.icon || '',
    }));

    if (docs.length > 0) {
      index.addAll(docs);
    }
  },
};
