/**
 * Movies connector handler.
 * Wraps tmdbService for movie/TV search and trending.
 * Uses TMDB_API_KEY from server environment.
 */

import axios from 'axios';
import type { ServiceKeys } from './index.js';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TIMEOUT = 10000;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getApiKey(_serviceKeys: ServiceKeys = {}): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB API key not configured on server.');
  return key;
}

interface TMDBMultiResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  genre_ids?: number[];
}

interface TMDBMultiSearchResponse {
  results?: TMDBMultiResult[];
  total_results?: number;
}

async function search(
  params: Record<string, unknown>,
  _appId: string,
  _req: unknown,
  serviceKeys: ServiceKeys = {}
): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;
  const apiKey = getApiKey(serviceKeys);

  const response = await axios.get<TMDBMultiSearchResponse>(`${BASE_URL}/search/multi`, {
    params: { api_key: apiKey, query, include_adult: false },
    timeout: TIMEOUT,
  });

  const raw = response.data?.results || [];
  const results = raw
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      type: r.media_type,
      title: r.title || r.name || 'Untitled',
      year: (r.release_date || r.first_air_date || '').slice(0, 4),
      overview: r.overview || '',
      posterUrl: r.poster_path ? `${IMAGE_BASE}/w342${r.poster_path}` : null,
      rating: r.vote_average ?? null,
      url:
        r.media_type === 'movie'
          ? `https://www.themoviedb.org/movie/${r.id}`
          : `https://www.themoviedb.org/tv/${r.id}`,
    }));

  return { results };
}

async function trending(
  params: Record<string, unknown>,
  _appId: string,
  _req: unknown,
  serviceKeys: ServiceKeys = {}
): Promise<unknown> {
  const apiKey = getApiKey(serviceKeys);
  const timeWindow = params.timeWindow === 'week' ? 'week' : 'day';
  const mediaType = params.mediaType === 'tv' ? 'tv' : 'movie';

  const response = await axios.get<TMDBMultiSearchResponse>(
    `${BASE_URL}/trending/${mediaType}/${timeWindow}`,
    { params: { api_key: apiKey }, timeout: TIMEOUT }
  );

  const raw = response.data?.results || [];
  const limit = typeof params.limit === 'number' ? params.limit : 10;
  const results = raw.slice(0, limit).map((r) => ({
    id: r.id,
    type: mediaType,
    title: r.title || r.name || 'Untitled',
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
    overview: r.overview || '',
    posterUrl: r.poster_path ? `${IMAGE_BASE}/w342${r.poster_path}` : null,
    rating: r.vote_average ?? null,
    url:
      mediaType === 'movie'
        ? `https://www.themoviedb.org/movie/${r.id}`
        : `https://www.themoviedb.org/tv/${r.id}`,
  }));

  return { results };
}

export const moviesHandler = { search, trending };
