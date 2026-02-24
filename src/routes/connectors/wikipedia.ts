/**
 * Wikipedia connector handler.
 * Wraps wikipediaService for article and image search.
 * No API key required.
 */

import { searchWikipediaArticles, searchWikimediaImages } from '../../services/wikipediaService.js';

async function search(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 5;

  const articles = await searchWikipediaArticles(query, limit);
  return { articles };
}

async function images(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 5;

  const results = await searchWikimediaImages(query, limit);
  return { images: results };
}

export const wikipediaHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { search, images };
