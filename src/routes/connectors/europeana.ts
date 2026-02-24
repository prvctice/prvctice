/**
 * Europeana connector handler.
 * Wraps europeanaService for cultural heritage image search.
 * No API key required.
 */

import { searchEuropeana } from '../../services/europeanaService.js';

async function search(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;

  const results = await searchEuropeana(query, limit);
  return { results };
}

export const europeanaHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { search };
