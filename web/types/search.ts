/**
 * Search Provider Registry Types
 * Type definitions for the universal search system.
 * Providers implement SearchProvider to participate in Cmd+K search.
 */

// ==================== RESULT TYPES ====================

/**
 * Categories of searchable content.
 * 'file' and 'app' reserved for future phases.
 */
export type SearchResultType = 'conversation' | 'note' | 'skill' | 'action' | 'file' | 'app';

/**
 * A single search result returned by a provider.
 * All fields are readonly to enforce immutability.
 */
export interface SearchResult {
  readonly id: string;
  readonly type: SearchResultType;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon: string;
  readonly score: number;
  readonly metadata?: Record<string, unknown>;
}

// ==================== PROVIDER INTERFACE ====================

/**
 * Contract for search providers.
 * Each provider manages its own MiniSearch index and translates
 * domain-specific data into SearchResult format.
 */
export interface SearchProvider {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly priority: number;

  /** Synchronous search against in-memory MiniSearch index */
  search(query: string): SearchResult[];

  /** Return recent items for empty-query state */
  getRecent(): SearchResult[];

  /** Execute an action when the user selects a result */
  execute(result: SearchResult): void;

  /** Full index rebuild from data source */
  rebuild(): Promise<void>;
}

// ==================== GROUPED RESULTS ====================

/**
 * A group of search results from a single provider,
 * used for rendering grouped sections in the search UI.
 */
export interface GroupedResult {
  readonly label: string;
  readonly icon: string;
  readonly priority: number;
  readonly items: SearchResult[];
}

/**
 * All grouped results keyed by provider ID.
 */
export type GroupedResults = Record<string, GroupedResult>;
