/**
 * TMDB (The Movie Database) API Service
 * https://developer.themoviedb.org/docs
 * Requires free API key - optional enhancement
 */
import axios, { AxiosError } from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const TIMEOUT = 10000;

export interface TMDBResult {
  url: string;
  thumbnailUrl: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
  aspectRatio?: number;
}

/** @deprecated TMDB key is now resolved from process.env.TMDB_API_KEY */
export interface TMDBContext {
  apiKeys?: { tmdb?: string };
  session?: { tmdbApiKey?: string };
  getApiKey?: (key: string) => string | undefined;
}

interface TMDBMovie {
  id: number;
  title?: string;
  release_date?: string;
}

interface TMDBImage {
  file_path: string;
  aspect_ratio?: number;
}

interface TMDBSearchResponse {
  results?: TMDBMovie[];
}

interface TMDBImagesResponse {
  backdrops?: TMDBImage[];
  posters?: TMDBImage[];
}

/**
 * Check if TMDB is available (API key configured)
 */
export function isAvailable(context: TMDBContext = {}): boolean {
  const apiKey = resolveApiKey(context);
  return !!apiKey;
}

/**
 * Resolve TMDB API key from environment variable
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveApiKey(_context: TMDBContext = {}): string | null {
  return process.env.TMDB_API_KEY || null;
}

/**
 * Search TMDB for movie stills and backdrops
 */
export async function searchTMDB(
  query: string,
  limit: number = 8,
  context: TMDBContext = {}
): Promise<TMDBResult[]> {
  const apiKey = resolveApiKey(context);

  if (!apiKey) {
    logger.debug('[tmdb] No API key configured, skipping');
    return [];
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    // Search for movies
    const searchResponse = await axios.get<TMDBSearchResponse>(`${BASE_URL}/search/movie`, {
      params: {
        api_key: apiKey,
        query: query.trim(),
        include_adult: false,
      },
      timeout: TIMEOUT,
    });

    const movies = searchResponse.data?.results || [];
    if (movies.length === 0) {
      logger.debug(`[tmdb] No movies found for query: ${query}`);
      return [];
    }

    const results: TMDBResult[] = [];

    // Get images for top movies
    for (const movie of movies.slice(0, Math.min(5, movies.length))) {
      if (results.length >= limit) break;

      try {
        // Fetch movie images
        const imagesResponse = await axios.get<TMDBImagesResponse>(
          `${BASE_URL}/movie/${movie.id}/images`,
          {
            params: {
              api_key: apiKey,
            },
            timeout: TIMEOUT,
          }
        );

        const images = imagesResponse.data;

        // Add backdrops (these are the cinematic stills)
        for (const backdrop of (images.backdrops || []).slice(0, 3)) {
          if (results.length >= limit) break;

          results.push({
            url: `${IMAGE_BASE_URL}/w1280${backdrop.file_path}`,
            thumbnailUrl: `${IMAGE_BASE_URL}/w780${backdrop.file_path}`,
            title: movie.title || 'Untitled',
            artist: '', // Could fetch director with additional call
            date: movie.release_date ? movie.release_date.slice(0, 4) : '',
            source: 'TMDB',
            sourceUrl: `https://www.themoviedb.org/movie/${movie.id}`,
            aspectRatio: backdrop.aspect_ratio,
          });
        }

        // Add some stills/posters if we need more
        if (results.length < limit) {
          for (const still of (images.posters || []).slice(0, 2)) {
            if (results.length >= limit) break;

            results.push({
              url: `${IMAGE_BASE_URL}/w780${still.file_path}`,
              thumbnailUrl: `${IMAGE_BASE_URL}/w342${still.file_path}`,
              title: movie.title || 'Untitled',
              artist: '',
              date: movie.release_date ? movie.release_date.slice(0, 4) : '',
              source: 'TMDB',
              sourceUrl: `https://www.themoviedb.org/movie/${movie.id}`,
              aspectRatio: still.aspect_ratio,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.debug(`[tmdb] Failed to fetch images for movie: ${movie.id} - ${message}`);
      }
    }

    logger.debug(`[tmdb] Found ${results.length} images for query: ${query}`);
    return results;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 401) {
      logger.warn('[tmdb] Invalid API key');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[tmdb] Search failed:', { error: message });
    }
    return [];
  }
}

/**
 * Search for a specific movie by title and get its images
 */
export async function getMovieStills(
  title: string,
  year: number | null = null,
  context: TMDBContext = {}
): Promise<TMDBResult[]> {
  const apiKey = resolveApiKey(context);
  if (!apiKey) return [];

  try {
    const params: Record<string, unknown> = {
      api_key: apiKey,
      query: title,
      include_adult: false,
    };
    if (year) params.year = year;

    const searchResponse = await axios.get<TMDBSearchResponse>(`${BASE_URL}/search/movie`, {
      params,
      timeout: TIMEOUT,
    });

    const movie = searchResponse.data?.results?.[0];
    if (!movie) return [];

    const imagesResponse = await axios.get<TMDBImagesResponse>(
      `${BASE_URL}/movie/${movie.id}/images`,
      {
        params: { api_key: apiKey },
        timeout: TIMEOUT,
      }
    );

    const backdrops = imagesResponse.data?.backdrops || [];
    return backdrops.slice(0, 5).map((backdrop) => ({
      url: `${IMAGE_BASE_URL}/w1280${backdrop.file_path}`,
      thumbnailUrl: `${IMAGE_BASE_URL}/w780${backdrop.file_path}`,
      title: movie.title || '',
      artist: '',
      date: movie.release_date ? movie.release_date.slice(0, 4) : '',
      source: 'TMDB',
      sourceUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[tmdb] getMovieStills failed:', { error: message });
    return [];
  }
}

// --- Film Search API types and helpers ---

export interface TMDBPersonResult {
  id: number;
  name: string;
  known_for_department: string;
  popularity: number;
}

export interface TMDBCompanyResult {
  id: number;
  name: string;
}

export interface TMDBKeywordResult {
  id: number;
  name: string;
}

export interface TMDBCredits {
  director: string;
  cinematographer: string;
  composer: string;
  writer: string;
}

export interface TMDBDiscoverMovie {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  genre_ids?: number[];
}

interface TMDBPersonSearchResponse {
  results?: Array<{
    id: number;
    name: string;
    known_for_department?: string;
    popularity?: number;
  }>;
}

interface TMDBCompanySearchResponse {
  results?: Array<{ id: number; name: string }>;
}

interface TMDBKeywordSearchResponse {
  results?: Array<{ id: number; name: string }>;
}

interface TMDBDiscoverResponse {
  results?: Array<{
    id: number;
    title: string;
    release_date?: string;
    overview?: string;
    poster_path?: string | null;
    genre_ids?: number[];
  }>;
}

interface TMDBCreditsResponse {
  crew?: Array<{ job: string; name: string }>;
}

/**
 * Search TMDB for people (actors, directors, etc.)
 */
export async function searchPerson(query: string, apiKey: string): Promise<TMDBPersonResult[]> {
  try {
    const response = await axios.get<TMDBPersonSearchResponse>(`${BASE_URL}/search/person`, {
      params: { api_key: apiKey, query },
      timeout: 8000,
    });
    const results = response.data?.results || [];
    return results.slice(0, 5).map((p) => ({
      id: p.id,
      name: p.name,
      known_for_department: p.known_for_department || 'Unknown',
      popularity: p.popularity || 0,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[tmdb] searchPerson failed:', { error: message, query });
    return [];
  }
}

/**
 * Search TMDB for production companies
 */
export async function searchCompany(query: string, apiKey: string): Promise<TMDBCompanyResult[]> {
  try {
    const response = await axios.get<TMDBCompanySearchResponse>(`${BASE_URL}/search/company`, {
      params: { api_key: apiKey, query },
      timeout: 8000,
    });
    const results = response.data?.results || [];
    return results.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[tmdb] searchCompany failed:', { error: message, query });
    return [];
  }
}

/**
 * Search TMDB for keywords
 */
export async function searchKeyword(query: string, apiKey: string): Promise<TMDBKeywordResult[]> {
  try {
    const response = await axios.get<TMDBKeywordSearchResponse>(`${BASE_URL}/search/keyword`, {
      params: { api_key: apiKey, query },
      timeout: 8000,
    });
    const results = response.data?.results || [];
    return results.slice(0, 10).map((k) => ({
      id: k.id,
      name: k.name,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[tmdb] searchKeyword failed:', { error: message, query });
    return [];
  }
}

/**
 * Discover movies with combined filter parameters
 */
export async function discoverMovies(
  params: Record<string, string | number>,
  apiKey: string
): Promise<TMDBDiscoverMovie[]> {
  try {
    const response = await axios.get<TMDBDiscoverResponse>(`${BASE_URL}/discover/movie`, {
      params: {
        sort_by: 'popularity.desc',
        ...params,
        api_key: apiKey,
      },
      timeout: 10000,
    });
    const results = response.data?.results || [];
    return results.slice(0, 20).map((m) => ({
      id: m.id,
      title: m.title,
      release_date: m.release_date,
      overview: m.overview,
      poster_path: m.poster_path,
      genre_ids: m.genre_ids,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[tmdb] discoverMovies failed:', { error: message });
    return [];
  }
}

/**
 * Get credits (director, cinematographer, composer, writer) for a movie
 */
export async function getMovieCredits(movieId: number, apiKey: string): Promise<TMDBCredits> {
  const empty: TMDBCredits = {
    director: '',
    cinematographer: '',
    composer: '',
    writer: '',
  };
  try {
    const response = await axios.get<TMDBCreditsResponse>(`${BASE_URL}/movie/${movieId}/credits`, {
      params: { api_key: apiKey },
      timeout: 8000,
    });
    const crew = response.data?.crew || [];
    return {
      director: crew.find((c) => c.job === 'Director')?.name || '',
      cinematographer: crew.find((c) => c.job === 'Director of Photography')?.name || '',
      composer: crew.find((c) => c.job === 'Original Music Composer')?.name || '',
      writer: crew.find((c) => c.job === 'Screenplay' || c.job === 'Writer')?.name || '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[tmdb] getMovieCredits failed:', {
      error: message,
      movieId,
    });
    return empty;
  }
}

export default {
  searchTMDB,
  getMovieStills,
  isAvailable,
  resolveApiKey,
  searchPerson,
  searchCompany,
  searchKeyword,
  discoverMovies,
  getMovieCredits,
};
