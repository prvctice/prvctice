/**
 * Library of Congress connector handler.
 * Wraps locService for LoC search.
 * No API key required.
 */

import { searchLoC } from '../../services/locService.js';

async function search(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;

  const results = await searchLoC(query, limit);
  return { results };
}

export const locHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { search };
