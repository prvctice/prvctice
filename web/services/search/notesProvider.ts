/**
 * Notes Search Provider
 * MiniSearch-backed provider that indexes note titles and stripped-HTML content.
 * Subscribes to event bus for incremental index updates.
 */

import MiniSearch from 'minisearch';
import type { SearchProvider, SearchResult } from '@web/types/search';
import { storage } from '@web/storage/storage.js';

// ==================== TYPES ====================

interface NoteDoc {
  id: string;
  title: string;
  content: string;
}

interface TabMeta {
  id: string;
  title: string;
  createdAt: number;
}

// ==================== MODULE STATE ====================

let initialized = false;
let cachedRecent: SearchResult[] = [];

const index = new MiniSearch<NoteDoc>({
  fields: ['title', 'content'],
  storeFields: ['title'],
  searchOptions: {
    boost: { title: 3 },
    fuzzy: 0.2,
    prefix: true,
  },
});

// ==================== HELPERS ====================

function stripHtml(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  } catch {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&\w+;/g, ' ')
      .trim();
  }
}

function toSearchResult(id: string, title: string, score: number): SearchResult {
  return {
    id,
    type: 'note',
    title: title || 'Untitled',
    icon: 'ph:note-pencil',
    score,
    metadata: { providerId: 'notes' },
  };
}

// ==================== FACTORY ====================

export function createNotesProvider(): SearchProvider {
  if (initialized) {
    return provider;
  }
  initialized = true;

  // Subscribe to event bus for incremental updates (lazy to avoid init order issues)
  import('@web/services/eventBus').then(({ useEventBus }) => {
    const bus = useEventBus();

    bus.on('note:created', (data) => {
      if (!index.has(data.id)) {
        index.add({ id: data.id, title: data.title, content: '' });
      }
    });

    bus.on('note:updated', (data) => {
      const html = storage.mirror.get(`tab:${data.id}:html`);
      const content = stripHtml(html || '');
      const doc: NoteDoc = { id: data.id, title: data.title, content };
      if (index.has(data.id)) {
        index.replace(doc);
      } else {
        index.add(doc);
      }
    });

    bus.on('note:deleted', (data) => {
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
  id: 'notes',
  label: 'Notes',
  icon: 'ph:note-pencil',
  priority: 20,

  search(query: string): SearchResult[] {
    const hits = index.search(query);
    return hits.map((hit) =>
      toSearchResult(hit.id as string, (hit as unknown as NoteDoc).title, hit.score)
    );
  },

  getRecent(): SearchResult[] {
    return cachedRecent;
  },

  execute(result: SearchResult): void {
    // Set the active note tab
    import('@web/composables/useNotesTabs').then(({ useNotesTabs }) => {
      useNotesTabs().setActiveId(result.id);
    });
    // Open notes window via window manager
    Promise.all([
      import('@web/composables/useWindowManager'),
      import('@web/services/apps/builtinApps'),
    ]).then(([{ useWindowManager }, { BUILTIN_APPS }]) => {
      const wm = useWindowManager();
      const notesDef = BUILTIN_APPS.find((d) => d.id === 'notes');
      if (!notesDef) return;
      const existing = wm.windowList.value.find((w) => w.appId === 'notes');
      if (!existing) {
        wm.openWindow(notesDef);
      }
    });
  },

  async rebuild(): Promise<void> {
    index.removeAll();

    const tabsMeta = storage.mirror.getJSON<TabMeta[]>('notesTabsMeta', []);
    const tabs = tabsMeta || [];

    const docs: NoteDoc[] = tabs.map((tab) => {
      const html = storage.mirror.get(`tab:${tab.id}:html`);
      const content = stripHtml(html || '');
      return { id: tab.id, title: tab.title, content };
    });

    if (docs.length > 0) {
      index.addAll(docs);
    }

    // Cache most recent 3 for getRecent()
    cachedRecent = tabs.slice(0, 3).map((tab) => toSearchResult(tab.id, tab.title, 1));
  },
};
