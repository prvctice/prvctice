/**
 * Actions Search Provider
 * Static string-matching provider for menu actions (no MiniSearch needed).
 * Actions are a fixed, small list dispatched through the menu action store.
 */

import type { SearchProvider, SearchResult } from '@web/types/search';

// ==================== TYPES ====================

interface ActionItem {
  id: string;
  title: string;
  keywords: string[];
  icon: string;
  handler: () => void;
}

// ==================== ACTIONS LIST ====================

const ACTIONS: ActionItem[] = [
  {
    id: 'new-chat',
    title: 'New Chat',
    keywords: ['create', 'start', 'conversation', 'fresh'],
    icon: 'ph:plus',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('new-chat');
      });
    },
  },
  {
    id: 'chat-history',
    title: 'Chat History',
    keywords: ['past', 'conversations', 'previous', 'history'],
    icon: 'ph:clock-counter-clockwise',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('chat-history');
      });
    },
  },
  {
    id: 'settings',
    title: 'Settings',
    keywords: ['preferences', 'config', 'options'],
    icon: 'ph:gear-six',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('settings');
      });
    },
  },
  {
    id: 'themes',
    title: 'Themes',
    keywords: ['appearance', 'colors', 'dark', 'light'],
    icon: 'ph:palette',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('themes');
      });
    },
  },
  {
    id: 'ai-settings',
    title: 'AI Settings',
    keywords: ['model', 'provider', 'api', 'keys'],
    icon: 'ph:brain',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('ai');
      });
    },
  },
  {
    id: 'effects',
    title: 'Visual Effects',
    keywords: ['graphics', 'dotmatrix', 'particles', 'effects'],
    icon: 'ph:sparkle',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('effects');
      });
    },
  },
  {
    id: 'skills',
    title: 'Skills',
    keywords: ['abilities', 'actions', 'prompts'],
    icon: 'ph:lightning',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('skills');
      });
    },
  },
  {
    id: 'gallery',
    title: 'App Gallery',
    keywords: ['apps', 'widgets', 'browse'],
    icon: 'ph:squares-four',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('gallery');
      });
    },
  },
  {
    id: 'help',
    title: 'Help',
    keywords: ['guide', 'documentation', 'tips'],
    icon: 'ph:question',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('help');
      });
    },
  },
  {
    id: 'file-library',
    title: 'File Library',
    keywords: ['files', 'documents', 'uploads'],
    icon: 'ph:folder-open',
    handler: () => {
      import('@web/stores/menuAction').then(({ useMenuActionStore }) => {
        useMenuActionStore().dispatch('file-library');
      });
    },
  },
];

// ==================== FACTORY ====================

export function createActionsProvider(): SearchProvider {
  return provider;
}

// ==================== PROVIDER ====================

const provider: SearchProvider = {
  id: 'actions',
  label: 'Actions',
  icon: 'ph:command',
  priority: 40,

  search(query: string): SearchResult[] {
    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    for (const action of ACTIONS) {
      const titleLower = action.title.toLowerCase();
      const titleMatch = titleLower.includes(q);
      const keywordMatch = action.keywords.some((kw) => kw.includes(q));

      if (titleMatch || keywordMatch) {
        const score = titleLower.startsWith(q) ? 2 : 1;
        matches.push({
          id: action.id,
          type: 'action',
          title: action.title,
          icon: action.icon,
          score,
          metadata: { providerId: 'actions' },
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  },

  getRecent(): SearchResult[] {
    return [];
  },

  execute(result: SearchResult): void {
    const action = ACTIONS.find((a) => a.id === result.id);
    if (action) {
      action.handler();
    }
  },

  async rebuild(): Promise<void> {
    // No-op: actions are static
  },
};
