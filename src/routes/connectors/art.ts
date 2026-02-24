/**
 * Art connector handler.
 * Wraps artInstituteService and metMuseumService for artwork search.
 * No API keys required.
 */

import { searchArtInstitute } from '../../services/artInstituteService.js';
import { searchMetMuseum } from '../../services/metMuseumService.js';

async function searchArt(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 8;

  // Search both sources in parallel, merge results
  const [artInstitute, metMuseum] = await Promise.all([
    searchArtInstitute(query, Math.ceil(limit / 2)).catch(() => []),
    searchMetMuseum(query, Math.ceil(limit / 2)).catch(() => []),
  ]);

  const artworks = [...artInstitute, ...metMuseum].slice(0, limit);
  return { artworks };
}

async function artInstituteSearch(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 8;

  const artworks = await searchArtInstitute(query, limit);
  return { artworks };
}

async function metMuseumSearch(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 8;

  const artworks = await searchMetMuseum(query, limit);
  return { artworks };
}

export const artHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = {
  search: searchArt,
  searchArtInstitute: artInstituteSearch,
  searchMetMuseum: metMuseumSearch,
};
