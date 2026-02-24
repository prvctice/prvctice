/**
 * Conversations Search Provider
 * MiniSearch-backed provider that indexes conversation titles from IndexedDB.
 * Subscribes to event bus for incremental index updates.
 */

import MiniSearch from 'minisearch';
import type { SearchProvider, SearchResult } from '@web/types/search';
import { storage } from '@web/storage/storage.js';

// ==================== TYPES ====================

interface ConversationDoc {
  id: string;
  title: string;
  provider: string;
  updatedAt: number;
}

// ==================== MODULE STATE ====================

let initialized = false;
let cachedRecent: SearchResult[] = [];

const index = new MiniSearch<ConversationDoc>({
  fields: ['title'],
  storeFields: ['title', 'provider', 'updatedAt'],
  searchOptions: {
    boost: { title: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
});

// ==================== HELPERS ====================

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function toSearchResult(
  doc: { id: string; title: string; updatedAt?: number },
  score: number
): SearchResult {
  return {
    id: doc.id,
    type: 'conversation',
    title: doc.title || 'Untitled',
    subtitle: doc.updatedAt ? formatRelativeTime(doc.updatedAt) : undefined,
    icon: 'ph:chats-teardrop',
    score,
    metadata: { providerId: 'conversations' },
  };
}

// ==================== FACTORY ====================

export function createConversationsProvider(): SearchProvider {
  if (initialized) {
    return provider;
  }
  initialized = true;

  // Subscribe to event bus for incremental updates (lazy to avoid init order issues)
  import('@web/services/eventBus').then(({ useEventBus }) => {
    const bus = useEventBus();

    bus.on('conversation:created', (data) => {
      if (!index.has(data.id)) {
        index.add({ id: data.id, title: data.title, provider: '', updatedAt: Date.now() });
      }
      // Update cached recent on creation
      const result = toSearchResult({ id: data.id, title: data.title, updatedAt: Date.now() }, 1);
      cachedRecent = [result, ...cachedRecent.filter((r) => r.id !== data.id)].slice(0, 5);
    });

    bus.on('conversation:updated', (data) => {
      if (data.title) {
        const doc: ConversationDoc = {
          id: data.id,
          title: data.title,
          provider: '',
          updatedAt: Date.now(),
        };
        if (index.has(data.id)) {
          index.replace(doc);
        } else {
          index.add(doc);
        }
      }
    });

    bus.on('conversation:deleted', (data) => {
      if (index.has(data.id)) {
        index.discard(data.id);
      }
      cachedRecent = cachedRecent.filter((r) => r.id !== data.id);
    });
  });

  return provider;
}

// ==================== PROVIDER ====================

const provider: SearchProvider = {
  id: 'conversations',
  label: 'Conversations',
  icon: 'ph:chats-teardrop',
  priority: 10,

  search(query: string): SearchResult[] {
    const hits = index.search(query);
    return hits.map((hit) =>
      toSearchResult(
        {
          id: hit.id as string,
          title: (hit as unknown as ConversationDoc).title,
          updatedAt: (hit as unknown as ConversationDoc).updatedAt,
        },
        hit.score
      )
    );
  },

  getRecent(): SearchResult[] {
    return cachedRecent;
  },

  execute(result: SearchResult): void {
    import('@web/stores/chat').then(({ useChatStore }) => {
      const chat = useChatStore();
      chat.loadConversation(result.id);
    });
  },

  async rebuild(): Promise<void> {
    index.removeAll();

    const conversations = (await storage.conversations.list({
      index: 'updatedAt',
      limit: 200,
    })) as Array<{ id: string; title?: string; provider?: string; updatedAt?: number }>;

    const docs: ConversationDoc[] = conversations.map((c) => ({
      id: c.id,
      title: c.title || 'Untitled',
      provider: c.provider || '',
      updatedAt: c.updatedAt || 0,
    }));

    if (docs.length > 0) {
      index.addAll(docs);
    }

    // Update cached recent (most recent 5)
    cachedRecent = docs.slice(0, 5).map((doc) => toSearchResult(doc, 1));
  },
};
