/**
 * Files Search Provider
 * MiniSearch-backed provider that indexes file names from the file library.
 * Subscribes to event bus for incremental index updates (library:file-added/removed).
 */

import MiniSearch from 'minisearch';
import type { SearchProvider, SearchResult } from '@web/types/search';

// ==================== TYPES ====================

interface FileDoc {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  lastAccessedAt: number;
}

// ==================== MODULE STATE ====================

let initialized = false;
let cachedRecent: SearchResult[] = [];

const index = new MiniSearch<FileDoc>({
  fields: ['name'],
  storeFields: ['name', 'mimeType', 'size', 'uploadedAt', 'lastAccessedAt'],
  searchOptions: {
    boost: { name: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
});

// ==================== HELPERS ====================

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'ph:file-pdf';
  if (mimeType.startsWith('image/')) return 'ph:image';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'ph:file-doc';
  if (mimeType.includes('text')) return 'ph:file-text';
  return 'ph:file';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toResult(
  doc: { id: string; name: string; mimeType: string; size: number },
  score: number
): SearchResult {
  return {
    id: doc.id,
    type: 'file',
    title: doc.name,
    subtitle: formatSize(doc.size),
    icon: getFileIcon(doc.mimeType),
    score,
    metadata: { providerId: 'files', mimeType: doc.mimeType },
  };
}

// ==================== FACTORY ====================

export function createFilesProvider(): SearchProvider {
  if (initialized) {
    return provider;
  }
  initialized = true;

  // Subscribe to event bus for incremental updates (lazy to avoid init order issues)
  import('@web/services/eventBus').then(({ useEventBus }) => {
    const bus = useEventBus();

    bus.on('library:file-added', (data) => {
      if (!index.has(data.id)) {
        index.add({
          id: data.id,
          name: data.name,
          mimeType: data.mimeType,
          size: data.size,
          uploadedAt: Date.now(),
          lastAccessedAt: Date.now(),
        });
      }
      // Update cached recent
      const result = toResult(
        { id: data.id, name: data.name, mimeType: data.mimeType, size: data.size },
        1
      );
      cachedRecent = [result, ...cachedRecent.filter((r) => r.id !== data.id)].slice(0, 3);
    });

    bus.on('library:file-removed', (data) => {
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
  id: 'files',
  label: 'Files',
  icon: 'ph:folder-open',
  priority: 50,

  search(query: string): SearchResult[] {
    return index.search(query).map((hit) => {
      const stored = hit as unknown as FileDoc;
      return toResult(
        { id: hit.id as string, name: stored.name, mimeType: stored.mimeType, size: stored.size },
        hit.score
      );
    });
  },

  getRecent(): SearchResult[] {
    return cachedRecent;
  },

  execute(result: SearchResult): void {
    const mimeType = (result.metadata?.mimeType as string) || '';
    if (mimeType === 'application/pdf') {
      import('@web/composables/useFileLibrary').then(({ useFileLibrary }) => {
        useFileLibrary()
          .getFile(result.id)
          .then((file) => {
            if (!file) return;
            type WinWithPdf = Window & {
              loadPdfFile?: (f: File) => void;
              __pendingPdfFile?: File;
            };
            const win = window as WinWithPdf;
            Promise.all([
              import('@web/composables/useWindowManager'),
              import('@web/services/apps/builtinApps'),
            ]).then(([{ useWindowManager }, { BUILTIN_APPS }]) => {
              const wm = useWindowManager();
              const viewerOpen = wm.windowList.value.some((w) => w.appId === 'pdf-viewer');
              if (viewerOpen && win.loadPdfFile) {
                win.loadPdfFile(file);
                return;
              }
              win.__pendingPdfFile = file;
              if (!viewerOpen) {
                const pdfDef = BUILTIN_APPS.find((d) => d.id === 'pdf-viewer');
                if (pdfDef) wm.openWindow(pdfDef);
              }
            });
          });
      });
    } else if (mimeType.startsWith('image/')) {
      import('@web/composables/useFileLibrary').then(({ useFileLibrary }) => {
        useFileLibrary()
          .getFile(result.id)
          .then((file) => {
            if (file) {
              const url = URL.createObjectURL(file);
              window.open(url, '_blank', 'noopener');
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
          });
      });
    } else {
      // Open document browser for other types
      import('@web/composables/useDocumentBrowser').then(({ useDocumentBrowser }) => {
        useDocumentBrowser().open();
      });
    }
  },

  async rebuild(): Promise<void> {
    index.removeAll();

    const { useFileLibrary } = await import('@web/composables/useFileLibrary');
    const library = useFileLibrary();
    const docs: FileDoc[] = library.files.value.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      uploadedAt: f.uploadedAt,
      lastAccessedAt: f.lastAccessedAt,
    }));

    if (docs.length > 0) {
      index.addAll(docs);
    }

    // Cache most recent files (sorted by lastAccessedAt descending)
    const sorted = [...docs].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    cachedRecent = sorted.slice(0, 3).map((d) => toResult(d, 1));
  },
};
