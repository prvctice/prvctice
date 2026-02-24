/**
 * Universal Search Registry
 * Singleton composable that manages search providers and dispatches queries.
 * Providers register themselves; the registry fans out search/recent calls
 * and groups results by provider.
 *
 * Pattern: singleton composable (same as useSkillCoordinator, useIntentCoordinator)
 */

import { ref, type Ref } from 'vue';
import type { SearchProvider, SearchResult, GroupedResults } from '@web/types/search';

// ==================== SINGLETON STATE ====================

/** Registered search providers keyed by ID */
const providers: Ref<Map<string, SearchProvider>> = ref(new Map());

/** Max results per provider in search mode */
const MAX_SEARCH_RESULTS = 5;

/** Max results per provider in recent mode */
const MAX_RECENT_RESULTS = 3;

// ==================== INSTANCE ====================

/** Singleton guard */
let instance: ReturnType<typeof createInstance> | null = null;

function createInstance() {
  /**
   * Register a search provider.
   * Replaces existing provider with the same ID (HMR-safe).
   */
  function registerProvider(provider: SearchProvider): void {
    providers.value = new Map([...providers.value, [provider.id, provider]]);
  }

  /**
   * Unregister a search provider by ID.
   */
  function unregisterProvider(id: string): void {
    const next = new Map(providers.value);
    next.delete(id);
    providers.value = next;
  }

  /**
   * Search all registered providers.
   * Empty/whitespace query returns recent results instead.
   */
  function search(query: string): GroupedResults {
    const trimmed = query.trim();
    if (!trimmed) {
      return buildRecentResults();
    }

    const results: GroupedResults = {};

    for (const [id, provider] of providers.value) {
      const hits = provider.search(trimmed);
      if (hits.length > 0) {
        results[id] = {
          label: provider.label,
          icon: provider.icon,
          priority: provider.priority,
          items: hits.slice(0, MAX_SEARCH_RESULTS),
        };
      }
    }

    return results;
  }

  /**
   * Build recent-items results from all providers.
   * Used when the search query is empty.
   */
  function buildRecentResults(): GroupedResults {
    const results: GroupedResults = {};

    for (const [id, provider] of providers.value) {
      const recent = provider.getRecent();
      if (recent.length > 0) {
        results[id] = {
          label: provider.label,
          icon: provider.icon,
          priority: provider.priority,
          items: recent.slice(0, MAX_RECENT_RESULTS),
        };
      }
    }

    return results;
  }

  /**
   * Execute a search result via its owning provider.
   */
  function executeResult(providerId: string, result: SearchResult): void {
    const provider = providers.value.get(providerId);
    if (provider) {
      provider.execute(result);
    }
  }

  /**
   * Rebuild all provider indexes from their data sources.
   */
  async function rebuildAll(): Promise<void> {
    const rebuilds = Array.from(providers.value.values()).map((p) => p.rebuild());
    await Promise.all(rebuilds);
  }

  return {
    providers,
    registerProvider,
    unregisterProvider,
    search,
    executeResult,
    rebuildAll,
  };
}

// ==================== COMPOSABLE EXPORT ====================

/**
 * Get the universal search registry.
 * Returns a singleton instance.
 */
export function useUniversalSearch(): ReturnType<typeof createInstance> {
  if (!instance) {
    instance = createInstance();
  }
  return instance;
}
