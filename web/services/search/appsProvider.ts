/**
 * Apps Search Provider
 * Simple string-matching provider for app definitions (no MiniSearch needed).
 * Caches app definitions from the registry during rebuild().
 */

import type { SearchProvider, SearchResult } from '@web/types/search';

// ==================== TYPES ====================

interface CachedApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  source: string;
}

// ==================== MODULE STATE ====================

let cachedApps: CachedApp[] = [];

// ==================== FACTORY ====================

export function createAppsProvider(): SearchProvider {
  return provider;
}

// ==================== PROVIDER ====================

const provider: SearchProvider = {
  id: 'apps',
  label: 'Apps',
  icon: 'ph:cube',
  priority: 55,

  search(query: string): SearchResult[] {
    const q = query.toLowerCase();
    return cachedApps
      .filter(
        (app) => app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q)
      )
      .map((app) => ({
        id: app.id,
        type: 'app' as const,
        title: app.name,
        subtitle: app.description,
        icon: app.icon || 'ph:cube',
        score: app.name.toLowerCase().startsWith(q) ? 2 : 1,
        metadata: { providerId: 'apps', appId: app.id, source: app.source },
      }));
  },

  getRecent(): SearchResult[] {
    return [];
  },

  execute(result: SearchResult): void {
    const appId = (result.metadata?.appId as string) || result.id;
    Promise.all([
      import('@web/services/apps/appRegistry'),
      import('@web/composables/useWindowManager'),
    ]).then(([{ createAppRegistry }, { useWindowManager }]) => {
      const registry = createAppRegistry();
      registry.get(appId).then((def) => {
        if (def) {
          const wm = useWindowManager();
          // Check if already open
          const existing = wm.windowList.value.find((w) => w.appId === appId);
          if (!existing) {
            wm.openWindow(def);
          }
        }
      });
    });
  },

  async rebuild(): Promise<void> {
    const { createAppRegistry } = await import('@web/services/apps/appRegistry');
    const registry = createAppRegistry();
    const all = await registry.getAll();
    cachedApps = all.map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description || '',
      icon: app.icon || 'ph:cube',
      source: app.source,
    }));
  },
};
