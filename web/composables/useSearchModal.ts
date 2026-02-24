/**
 * useSearchModal Composable
 * Singleton composable that manages the Cmd+K search modal state,
 * debounced search dispatch, keyboard navigation, and open/close lifecycle.
 *
 * Pattern: singleton composable (same as useUniversalSearch, useSkillCoordinator)
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import { useUniversalSearch } from '@web/composables/useUniversalSearch';
import { apiResolve, withApiHeaders } from '@web/stores/chat/transport';
import type { SearchResult, GroupedResults } from '@web/types/search';

// ==================== TYPES ====================

interface FlatResultEntry {
  readonly providerId: string;
  readonly result: SearchResult;
}

interface UseSearchModalReturn {
  isOpen: Ref<boolean>;
  query: Ref<string>;
  results: Ref<GroupedResults>;
  activeIndex: Ref<number>;
  flatResults: ComputedRef<FlatResultEntry[]>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  moveDown: () => void;
  moveUp: () => void;
  selectActive: () => void;
}

// ==================== SINGLETON STATE ====================

const isOpen: Ref<boolean> = ref(false);
const query: Ref<string> = ref('');
const results: Ref<GroupedResults> = ref({});
const activeIndex: Ref<number> = ref(-1);

/** Previously focused element, restored on close */
let lastFocusedElement: Element | null = null;

/** Backend message search abort controller */
let backendSearchAbort: AbortController | null = null;

// ==================== INSTANCE ====================

let instance: UseSearchModalReturn | null = null;

function createInstance(): UseSearchModalReturn {
  const universalSearch = useUniversalSearch();

  // Flatten grouped results sorted by priority (lower = higher rank)
  const flatResults: ComputedRef<FlatResultEntry[]> = computed(() => {
    const entries = Object.entries(results.value);
    const sorted = [...entries].sort(([, a], [, b]) => a.priority - b.priority);
    const flat: FlatResultEntry[] = [];
    for (const [providerId, group] of sorted) {
      for (const item of group.items) {
        flat.push({ providerId, result: item });
      }
    }
    return flat;
  });

  // ---- Async backend message search ----

  /**
   * Search backend message content via FTS5.
   * Merges results into the `results` ref as a 'messages' group.
   */
  async function searchBackendMessages(searchQuery: string): Promise<void> {
    // Abort any in-flight backend search
    if (backendSearchAbort) {
      try {
        backendSearchAbort.abort();
      } catch (_) {
        // Intentional: abort on stale controller is expected
      }
    }

    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      // Remove message results if query is too short
      const current = { ...results.value };
      delete current['messages'];
      results.value = current;
      return;
    }

    const controller = new AbortController();
    backendSearchAbort = controller;

    try {
      const url = apiResolve(`/api/v1/search/messages?q=${encodeURIComponent(trimmed)}&limit=5`);
      const resp = await fetch(url, {
        ...withApiHeaders(),
        signal: controller.signal,
      });

      if (!resp.ok) return;
      const data = (await resp.json()) as {
        results: Array<{
          messageId: string;
          conversationId: string;
          snippet: string;
          conversationTitle: string;
          role: string;
          rank: number;
        }>;
      };
      const hits = data.results;

      if (!Array.isArray(hits) || hits.length === 0) {
        const current = { ...results.value };
        delete current['messages'];
        results.value = current;
        return;
      }

      const items: SearchResult[] = hits.map((hit) => ({
        id: hit.messageId,
        type: 'conversation' as const,
        title: hit.conversationTitle || 'Conversation',
        subtitle: hit.snippet,
        icon: hit.role === 'user' ? 'ph:user' : 'ph:robot',
        score: Math.abs(hit.rank),
        metadata: {
          providerId: 'messages',
          conversationId: hit.conversationId,
          messageId: hit.messageId,
          hasHtmlSnippet: true,
        },
      }));

      // Merge into results (add/update 'messages' group)
      results.value = {
        ...results.value,
        messages: {
          label: 'Messages',
          icon: 'ph:chat-text',
          priority: 15,
          items,
        },
      };

      // Update activeIndex if it was -1 and we now have results
      if (activeIndex.value < 0 && flatResults.value.length > 0) {
        activeIndex.value = 0;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Intentional: backend search failure is non-critical
    } finally {
      if (backendSearchAbort === controller) {
        backendSearchAbort = null;
      }
    }
  }

  // ---- Open / Close / Toggle ----

  function open(): void {
    try {
      lastFocusedElement = document.activeElement;
    } catch (_) {
      lastFocusedElement = null;
    }
    query.value = '';
    activeIndex.value = -1;
    isOpen.value = true;

    // Immediate search for recent items (no debounce)
    results.value = universalSearch.search('');
    if (flatResults.value.length > 0) {
      activeIndex.value = 0;
    }
  }

  function close(): void {
    isOpen.value = false;
    query.value = '';
    results.value = {};
    activeIndex.value = -1;

    // Restore focus to previously focused element
    try {
      const el = lastFocusedElement as HTMLElement | null;
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    } catch (_) {
      // Element may be gone
    }
    lastFocusedElement = null;
  }

  function toggle(): void {
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  }

  // ---- Debounced search ----

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(query, (newQuery) => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      results.value = universalSearch.search(newQuery);
      if (flatResults.value.length > 0) {
        activeIndex.value = 0;
      } else {
        activeIndex.value = -1;
      }

      // Also search backend messages (async, merges results when ready)
      if (newQuery.trim().length >= 2) {
        searchBackendMessages(newQuery);
      } else {
        const current = { ...results.value };
        delete current['messages'];
        results.value = current;
      }
    }, 150);
  });

  // ---- Clamp activeIndex when results shrink ----

  watch(flatResults, (flat) => {
    if (activeIndex.value >= flat.length) {
      activeIndex.value = flat.length > 0 ? flat.length - 1 : -1;
    }
  });

  // ---- Keyboard navigation ----

  function moveDown(): void {
    const len = flatResults.value.length;
    if (len === 0) return;
    activeIndex.value = (activeIndex.value + 1) % len;
  }

  function moveUp(): void {
    const len = flatResults.value.length;
    if (len === 0) return;
    activeIndex.value = activeIndex.value <= 0 ? len - 1 : activeIndex.value - 1;
  }

  function selectActive(): void {
    const idx = activeIndex.value;
    if (idx < 0 || idx >= flatResults.value.length) return;
    const entry = flatResults.value[idx];
    if (!entry) return;

    // Handle message search results (not from a registered provider)
    if (entry.providerId === 'messages') {
      const convId = entry.result.metadata?.conversationId as string | undefined;
      if (convId) {
        import('@web/stores/chat').then(({ useChatStore }) => {
          const chat = useChatStore();
          chat.loadConversation(convId);
        });
      }
      close();
      return;
    }

    universalSearch.executeResult(entry.providerId, entry.result);
    close();
  }

  // ---- Global Cmd+K listener ----

  const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

  function handleGlobalKeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;

    const modifier = isMac ? e.metaKey : e.ctrlKey;
    if (modifier && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggle();
    }
  }

  document.addEventListener('keydown', handleGlobalKeydown, { passive: false });

  return {
    isOpen,
    query,
    results,
    activeIndex,
    flatResults,
    open,
    close,
    toggle,
    moveDown,
    moveUp,
    selectActive,
  };
}

// ==================== COMPOSABLE EXPORT ====================

/**
 * Get the search modal controller.
 * Returns a singleton instance.
 */
export function useSearchModal(): UseSearchModalReturn {
  if (!instance) {
    instance = createInstance();
  }
  return instance;
}
