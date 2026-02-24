/**
 * Films connector handler.
 * Wraps filmSearchService for advanced TMDB film search.
 * Uses TMDB_API_KEY from server environment.
 */

import { searchFilms, type FilmSearchOptions } from '../../services/filmSearchService.js';
import type { ServiceKeys } from './index.js';

async function search(
  params: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _appId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _req: unknown,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _serviceKeys: ServiceKeys
): Promise<unknown> {
  if (!process.env.TMDB_API_KEY) {
    throw new Error('TMDB API key not configured on server.');
  }

  const options: FilmSearchOptions = {
    people: Array.isArray(params.people) ? (params.people as string[]) : undefined,
    genres: Array.isArray(params.genres) ? (params.genres as string[]) : undefined,
    keywords: Array.isArray(params.keywords) ? (params.keywords as string[]) : undefined,
    yearStart: typeof params.yearStart === 'number' ? params.yearStart : undefined,
    yearEnd: typeof params.yearEnd === 'number' ? params.yearEnd : undefined,
    language: typeof params.language === 'string' ? params.language : undefined,
    companies: Array.isArray(params.companies) ? (params.companies as string[]) : undefined,
    movement: typeof params.movement === 'string' ? params.movement : undefined,
    limit: typeof params.limit === 'number' ? params.limit : 10,
  };

  const result = await searchFilms(options, {});
  return result;
}

export const filmsHandler: Readonly<
  Record<
    string,
    (
      params: Record<string, unknown>,
      appId: string,
      req: unknown,
      serviceKeys: ServiceKeys
    ) => Promise<unknown>
  >
> = { search };
