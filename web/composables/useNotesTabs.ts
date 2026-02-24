import { ref, type Ref } from 'vue';
import { storage } from '@web/storage/storage.js';
import { useEventBus } from '@web/services/eventBus';
import { htmlToMarkdown } from '@web/utils/htmlToMarkdown';
import { useFileLibrary } from '@web/composables/useFileLibrary';

const LS_TABS = 'notesTabsMeta';
const LS_ACTIVE = 'notesActiveTabId';
const LS_TAB_PREFIX = 'tab:';
const LS_HTML = (id: string): string => `${LS_TAB_PREFIX}${id}:html`;
const LS_DELTA = (id: string): string => `${LS_TAB_PREFIX}${id}:delta`;
const LS_SIZE = 'notesPaneSize';
const legacyTabKey = (id: string): string => `${LS_TAB_PREFIX}${id}`;

interface TabMeta {
  id: string;
  title: string;
  createdAt: number;
}

interface QuillDelta {
  ops: Array<{
    insert?: string;
    attributes?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strike?: boolean;
      list?: 'bullet' | 'ordered';
      header?: number;
    };
  }>;
}

interface PaneSize {
  width?: number;
  height?: number;
  [key: string]: unknown;
}

interface UseNotesTabsReturn {
  tabs: Ref<TabMeta[]>;
  activeTabId: Ref<string>;
  loadTabs: () => void;
  saveTabs: () => void;
  setActiveId: (id: string) => void;
  loadContent: (id: string) => string;
  saveContent: (id: string, html: string) => void;
  newTab: () => string;
  renameTab: (id: string, newTitle: string) => boolean;
  closeTab: (id: string) => boolean;
  getPaneSize: () => PaneSize | null;
  savePaneSize: (size: PaneSize) => void;
}

/**
 * Convert Quill Delta format to HTML for migration
 */
function deltaToHtml(delta: QuillDelta): string {
  if (!delta || !Array.isArray(delta.ops)) return '';

  let html = '';
  let currentList: 'ul' | 'ol' | null = null;

  for (const op of delta.ops) {
    if (typeof op.insert !== 'string') continue;

    let text: string = op.insert;
    const attrs = op.attributes || {};

    // Escape HTML in text
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Apply inline formatting
    if (attrs.bold) text = `<strong>${text}</strong>`;
    if (attrs.italic) text = `<em>${text}</em>`;
    if (attrs.underline) text = `<u>${text}</u>`;
    if (attrs.strike) text = `<s>${text}</s>`;

    // Handle block formats
    if (attrs.list === 'bullet') {
      if (currentList !== 'ul') {
        if (currentList) html += `</${currentList}>`;
        html += '<ul>';
        currentList = 'ul';
      }
      html += `<li>${text}</li>`;
    } else if (attrs.list === 'ordered') {
      if (currentList !== 'ol') {
        if (currentList) html += `</${currentList}>`;
        html += '<ol>';
        currentList = 'ol';
      }
      html += `<li>${text}</li>`;
    } else if (attrs.header) {
      if (currentList) {
        html += `</${currentList}>`;
        currentList = null;
      }
      html += `<h${attrs.header}>${text}</h${attrs.header}>`;
    } else {
      if (currentList) {
        html += `</${currentList}>`;
        currentList = null;
      }
      // Handle newlines as paragraphs
      const paras = text.split('\n').filter(Boolean);
      for (const p of paras) {
        html += `<p>${p}</p>`;
      }
      // If text ends with newline but had content, add trailing newline effect
      if (text.endsWith('\n') && !paras.length) {
        html += '<p><br></p>';
      }
    }
  }

  if (currentList) html += `</${currentList}>`;
  return html;
}

/**
 * Parse potential Delta JSON from storage
 */
function parseDelta(raw: string | null): QuillDelta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ops)) {
      return parsed as QuillDelta;
    }
  } catch {}
  return null;
}

// Debounce timers for file library sync (keyed by tab ID)
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Multi-tab notes management composable
 */
export function useNotesTabs(): UseNotesTabsReturn {
  const tabs = ref<TabMeta[]>([]);
  const activeTabId = ref<string>('');

  /**
   * Load tabs metadata from storage
   */
  function loadTabs(): void {
    try {
      const meta = storage.mirror.getJSON(LS_TABS) as TabMeta[] | null;
      if (Array.isArray(meta) && meta.length) {
        tabs.value = meta;
      } else {
        tabs.value = [{ id: 't_default', title: 'Untitled', createdAt: Date.now() }];
        saveTabs();
      }
    } catch {
      tabs.value = [{ id: 't_default', title: 'Untitled', createdAt: Date.now() }];
      saveTabs();
    }
    activeTabId.value = getStoredActiveId();
  }

  /**
   * Get the stored active tab ID, validating it exists
   */
  function getStoredActiveId(): string {
    try {
      const v = storage.mirror.get(LS_ACTIVE);
      if (v && tabs.value.some((m) => m.id === v)) return v;
    } catch {}
    return tabs.value[0]?.id || '';
  }

  /**
   * Save tabs metadata to storage
   */
  function saveTabs(): void {
    storage.mirror.setJSON(LS_TABS, tabs.value);
  }

  /**
   * Set the active tab ID
   */
  function setActiveId(id: string): void {
    activeTabId.value = id;
    storage.mirror.set(LS_ACTIVE, id);
  }

  /**
   * Load content for a tab, handling migration from Quill Delta
   */
  function loadContent(id: string): string {
    // 1. Try HTML format first (preferred)
    try {
      const html = storage.mirror.get(LS_HTML(id));
      if (html) return html;
    } catch {}

    // 2. Try Quill Delta format and convert
    try {
      const deltaRaw = storage.mirror.get(LS_DELTA(id));
      const delta = parseDelta(deltaRaw);
      if (delta) {
        const html = deltaToHtml(delta);
        // Migrate to HTML format
        if (html) {
          storage.mirror.set(LS_HTML(id), html);
          storage.mirror.remove(LS_DELTA(id));
        }
        return html;
      }
    } catch {}

    // 3. Try legacy key format
    try {
      const legacy = storage.mirror.get(legacyTabKey(id));
      if (legacy) {
        // Could be HTML or Delta
        const delta = parseDelta(legacy);
        if (delta) {
          const html = deltaToHtml(delta);
          storage.mirror.set(LS_HTML(id), html);
          storage.mirror.remove(legacyTabKey(id));
          return html;
        }
        // It's HTML
        storage.mirror.set(LS_HTML(id), legacy);
        storage.mirror.remove(legacyTabKey(id));
        return legacy;
      }
    } catch {}

    // 4. Try migrating from old prvcticeNotes key (first tab only)
    if (id === 't_default') {
      try {
        const oldNotes = storage.mirror.get('prvcticeNotes');
        if (oldNotes) {
          storage.mirror.set(LS_HTML(id), oldNotes);
          storage.mirror.remove('prvcticeNotes');
          return oldNotes;
        }
      } catch {}
    }

    return '';
  }

  /**
   * Save content for a tab
   */
  function saveContent(id: string, html: string): void {
    storage.mirror.set(LS_HTML(id), html || '');
    // Clean up any old Delta format
    try {
      storage.mirror.remove(LS_DELTA(id));
      storage.mirror.remove(legacyTabKey(id));
    } catch {}
    const tab = tabs.value.find((t) => t.id === id);
    if (tab) {
      useEventBus().emit('note:updated', { id, title: tab.title });
      scheduleSyncToFiles(id, html, tab.title);
    }
  }

  /**
   * Schedule a debounced sync of note content to the file library.
   * Uses a 3-second debounce to avoid hammering on every keystroke.
   */
  function scheduleSyncToFiles(tabId: string, html: string, title: string): void {
    const existing = syncTimers.get(tabId);
    if (existing) clearTimeout(existing);

    syncTimers.set(
      tabId,
      setTimeout(() => {
        syncTimers.delete(tabId);
        syncNoteToFiles(tabId, html, title);
      }, 3000)
    );
  }

  /**
   * Convert note HTML to markdown and upsert into file library.
   */
  async function syncNoteToFiles(tabId: string, html: string, title: string): Promise<void> {
    try {
      const lib = useFileLibrary();
      if (!lib.isInitialized.value) return;

      const md = htmlToMarkdown(html);

      // Skip empty notes
      if (!md.trim()) {
        await lib.removeBySource(tabId);
        return;
      }

      const fileName = sanitizeFileName(title) + '.md';
      const file = new File([md], fileName, { type: 'text/markdown' });
      await lib.addOrReplaceBySource(file, tabId, 'Notes');
    } catch {
      // Silent — file library sync is best-effort
    }
  }

  function sanitizeFileName(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled';
  }

  /**
   * Create a new tab
   */
  function newTab(): string {
    const id = 't_' + Math.random().toString(36).slice(2, 10);
    const tab: TabMeta = { id, title: 'Untitled', createdAt: Date.now() };
    tabs.value = [...tabs.value, tab];
    saveTabs();
    setActiveId(id);
    useEventBus().emit('note:created', { id, title: 'Untitled' });
    return id;
  }

  /**
   * Rename a tab
   */
  function renameTab(id: string, newTitle: string): boolean {
    const idx = tabs.value.findIndex((t) => t.id === id);
    if (idx < 0) return false;

    const title = newTitle?.trim();
    if (!title) return false;

    const existingTab = tabs.value[idx];
    if (!existingTab) return false;
    const trimmedTitle = title.slice(0, 60);
    tabs.value[idx] = { ...existingTab, title: trimmedTitle };
    tabs.value = [...tabs.value]; // Trigger reactivity
    saveTabs();
    useEventBus().emit('note:updated', { id, title: trimmedTitle });

    // Re-sync to update the filename in file library
    const html = loadContent(id);
    if (html) scheduleSyncToFiles(id, html, trimmedTitle);
    return true;
  }

  /**
   * Close a tab
   */
  function closeTab(id: string): boolean {
    if (tabs.value.length <= 1) return false;

    const idx = tabs.value.findIndex((t) => t.id === id);
    if (idx < 0) return false;

    // Cancel any pending sync timer
    const timer = syncTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      syncTimers.delete(id);
    }

    const wasActive = activeTabId.value === id;
    tabs.value = tabs.value.filter((t) => t.id !== id);
    saveTabs();
    useEventBus().emit('note:deleted', { id });

    if (wasActive) {
      const nextTab = tabs.value[idx] || tabs.value[idx - 1] || tabs.value[0];
      if (nextTab) setActiveId(nextTab.id);
    }

    return true;
  }

  /**
   * Get pane size preference
   */
  function getPaneSize(): PaneSize | null {
    try {
      return storage.mirror.getJSON(LS_SIZE) as PaneSize | null;
    } catch {
      return null;
    }
  }

  /**
   * Save pane size preference
   */
  function savePaneSize(size: PaneSize): void {
    try {
      storage.mirror.setJSON(LS_SIZE, size);
    } catch {}
  }

  return {
    tabs,
    activeTabId,
    loadTabs,
    saveTabs,
    setActiveId,
    loadContent,
    saveContent,
    newTab,
    renameTab,
    closeTab,
    getPaneSize,
    savePaneSize,
  };
}
