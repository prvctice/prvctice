/**
 * Film Search Service
 * Orchestrates TMDB person/company/keyword resolution, Discover endpoint queries,
 * credits enrichment, and canon/banned re-ranking for film search.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import {
  searchPerson,
  searchCompany,
  searchKeyword,
  discoverMovies,
  getMovieCredits,
  resolveApiKey,
  type TMDBPersonResult,
  type TMDBDiscoverMovie,
  type TMDBCredits,
} from './tmdbService.js';
import { getMovementFilters } from './filmMovementMap.js';
import { isCircuitOpen, recordFailure, recordSuccess } from './circuitBreaker.js';

// --- Public interfaces ---

export interface FilmSearchOptions {
  people?: string[];
  genres?: string[];
  keywords?: string[];
  yearStart?: number;
  yearEnd?: number;
  language?: string;
  companies?: string[];
  movement?: string;
  limit?: number;
}

export interface FilmSearchContext {
  apiKeys?: { tmdb?: string };
  session?: { tmdbApiKey?: string };
  getApiKey?: (key: string) => string | undefined;
}

export interface FilmResult {
  tmdbId: number;
  title: string;
  year: number;
  posterUrl: string | null;
  synopsis: string;
  director: string;
  cinematographer: string;
  composer: string;
  writer: string;
  tmdbUrl: string;
  letterboxdUrl: string;
  matchNote?: string;
}

export interface FilmSearchResult {
  films: FilmResult[];
  matchNotes: string[];
  hint?: string;
}

// --- Constants ---

const GENRE_MAP: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  'science fiction': 878,
  'sci-fi': 878,
  thriller: 53,
  war: 10752,
  western: 37,
};

const CIRCUIT_KEY = 'tmdb-discover';

// --- Canon/Banned loading ---

interface CanonEntry {
  name: string;
  preferLater: boolean;
  preferEarlier: boolean;
}

const filmIndicators =
  /godard|mi[eé]ville|renoir|antonioni|fassbinder|wenders|duras|scorsese|rohmer|rivette|oshima|eustache|straub|huillet|ozu|mizoguchi|lynch|welles|bresson|kiarostami|coppola|bill gunn|jean vigo|marx brothers|fritz lang|paul thomas anderson|assayas|satoshi kon|hideaki anno|claire denis|tsai ming|akerman|pedro costa|bi gan|hugo santiago|birri|mani kaul|shahani|pialat|maldoror|gerima|cisse|hal hartley|menken|riggs|varda|marker|resnais|sara driver|tarkovsky|tarr|maya deren|hou hsiao|hong sang|pasolini|michael snow|mekas|brakhage|shirley clarke/i;

function loadCanonFilmmakers(): Set<string> {
  const canonSet = new Set<string>();
  try {
    const dir = getDirname();
    const canonPath = path.join(dir, '..', '..', 'canon.json');
    if (fs.existsSync(canonPath)) {
      const raw = fs.readFileSync(canonPath, 'utf8');
      const list = (JSON.parse(raw) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim() !== ''
      );
      for (const entry of list) {
        if (filmIndicators.test(entry.toLowerCase())) {
          const parsed = _parseCanonPeriod(entry);
          canonSet.add(parsed.name);
        }
      }
    }
  } catch {
    // graceful degradation
  }
  return canonSet;
}

function loadBannedFilmmakers(): Set<string> {
  const bannedSet = new Set<string>();
  try {
    const dir = getDirname();
    const bannedPath = path.join(dir, '..', '..', 'banned.json');
    if (fs.existsSync(bannedPath)) {
      const raw = fs.readFileSync(bannedPath, 'utf8');
      const list = (JSON.parse(raw) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim() !== ''
      );
      for (const entry of list) {
        // For banned, include all names (not just film-detected ones)
        // since banned may be broad categories
        const cleaned = entry
          .replace(/\s*\([^)]*\)\s*$/, '')
          .toLowerCase()
          .trim();
        bannedSet.add(cleaned);
      }
    }
  } catch {
    // graceful degradation
  }
  return bannedSet;
}

function loadCanonEntries(): CanonEntry[] {
  const entries: CanonEntry[] = [];
  try {
    const dir = getDirname();
    const canonPath = path.join(dir, '..', '..', 'canon.json');
    if (fs.existsSync(canonPath)) {
      const raw = fs.readFileSync(canonPath, 'utf8');
      const list = (JSON.parse(raw) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim() !== ''
      );
      for (const entry of list) {
        if (filmIndicators.test(entry.toLowerCase())) {
          entries.push(_parseCanonPeriod(entry));
        }
      }
    }
  } catch {
    // graceful degradation
  }
  return entries;
}

function getDirname(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname || process.cwd();
  }
}

// Load at module init
const canonFilmmakers = loadCanonFilmmakers();
const bannedFilmmakers = loadBannedFilmmakers();
const canonEntries = loadCanonEntries();

// --- Exported helpers (prefixed with _ for testing) ---

export function _parseCanonPeriod(entry: string): CanonEntry {
  const name = entry
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    .trim();
  const annotation = entry.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() || '';

  if (annotation.includes('prefer later')) {
    return { name, preferLater: true, preferEarlier: false };
  }
  if (annotation.includes('prefer earlier')) {
    return { name, preferLater: false, preferEarlier: true };
  }
  // Skip non-period annotations like "(1970s)" for period preference
  return { name, preferLater: false, preferEarlier: false };
}

export function _resolveGenres(genreNames: string[]): number[] {
  const ids: number[] = [];
  for (const name of genreNames) {
    const id = GENRE_MAP[name.toLowerCase().trim()];
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

export function _truncateSynopsis(text: string | undefined, maxLen = 200): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;

  // Find sentence boundary near maxLen
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastExcl = truncated.lastIndexOf('!');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastBoundary = Math.max(lastPeriod, lastExcl, lastQuestion);

  if (lastBoundary > maxLen * 0.5) {
    return text.slice(0, lastBoundary + 1);
  }
  return truncated.trimEnd() + '...';
}

export function _reRankResults(
  films: FilmResult[],
  canon: Set<string>,
  banned: Set<string>,
  entries: CanonEntry[]
): FilmResult[] {
  if (films.length === 0) return [];

  const scored = films.map((film, originalIndex) => {
    let score = 0;
    const directorLower = film.director.toLowerCase();

    // Canon boost
    for (const canonName of canon) {
      if (directorLower.includes(canonName) || canonName.includes(directorLower)) {
        score += 10;
        break;
      }
    }

    // Banned demotion
    for (const bannedName of banned) {
      if (directorLower.includes(bannedName) || bannedName.includes(directorLower)) {
        score -= 10;
        break;
      }
    }

    // Period preferences for canon entries
    for (const entry of entries) {
      if (directorLower.includes(entry.name) || entry.name.includes(directorLower)) {
        if (entry.preferLater && film.year > 1980) {
          score += 5;
        }
        if (entry.preferEarlier && film.year < 1970) {
          score += 5;
        }
        break;
      }
    }

    return { film, score, originalIndex };
  });

  // Filter out banned directors and films with no canon connection
  const filtered = scored.filter((s) => s.score > 0);

  // Sort by score descending, then by original order as tiebreaker
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  return filtered.map((s) => s.film);
}

// --- Canon fallback helper ---

function _pickRandomCanonDirectors(count: number): string[] {
  const all = [...canonFilmmakers];
  const picked: string[] = [];
  const copy = [...all];
  while (picked.length < count && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy[idx] as string);
    copy.splice(idx, 1);
  }
  return picked;
}

// --- Main search function ---

export async function searchFilms(
  options: FilmSearchOptions,
  context: FilmSearchContext
): Promise<FilmSearchResult> {
  const matchNotes: string[] = [];

  try {
    // 1. Resolve API key
    const apiKey = resolveApiKey(context);
    if (!apiKey) {
      return {
        films: [],
        matchNotes: [],
        hint: 'TMDB API key not configured on server.',
      };
    }

    // Check circuit breaker
    if (isCircuitOpen(CIRCUIT_KEY)) {
      return {
        films: [],
        matchNotes: [],
        hint: 'Film search temporarily unavailable. Try again in a few minutes.',
      };
    }

    // Copy options to avoid mutation
    const people = [...(options.people || [])];
    const genres = [...(options.genres || [])];
    const keywords = [...(options.keywords || [])];
    const companies = [...(options.companies || [])];
    let { yearStart, yearEnd } = options;
    const { language } = options;
    const limit = Math.min(Math.max(options.limit || 6, 5), 8);

    // 2. Resolve movement
    if (options.movement) {
      const movement = getMovementFilters(options.movement);
      if (movement) {
        matchNotes.push(`Searching ${movement.name} films`);
        people.push(...movement.directors);
        genres.push(...movement.genreIds.map(String));
        keywords.push(...movement.keywordTerms);
        if (movement.yearRange?.start && !yearStart) {
          yearStart = movement.yearRange.start;
        }
        if (movement.yearRange?.end && !yearEnd) {
          yearEnd = movement.yearRange.end;
        }
      } else {
        matchNotes.push(`Movement "${options.movement}" not recognized`);
      }
    }

    // 3. Resolve people
    const crewIds: number[] = [];
    const castIds: number[] = [];

    for (const personName of people) {
      const results = await searchPerson(personName, apiKey);
      if (results.length === 0) {
        matchNotes.push(`No TMDB match found for "${personName}"`);
        continue;
      }

      // Pick most popular result
      const firstResult = results[0] as TMDBPersonResult;
      const person = results.reduce(
        (best: TMDBPersonResult, curr: TMDBPersonResult) =>
          curr.popularity > best.popularity ? curr : best,
        firstResult
      );

      // Note ambiguous matches
      const secondResult = results[1] as TMDBPersonResult | undefined;
      if (results.length > 1 && secondResult && secondResult.popularity > person.popularity * 0.5) {
        matchNotes.push(
          `Showing results for ${person.name} (${person.known_for_department.toLowerCase()})`
        );
      }

      // Route by department
      const dept = person.known_for_department.toLowerCase();
      if (dept === 'acting') {
        castIds.push(person.id);
      } else if (dept === 'directing' || dept === 'writing' || dept === 'camera') {
        crewIds.push(person.id);
      } else {
        // Dual-role or unknown: add to both
        crewIds.push(person.id);
        castIds.push(person.id);
      }
    }

    // 4. Resolve genres
    // Genres from movement come as stringified IDs, regular genres as names
    const resolvedGenreIds: number[] = [];
    for (const g of genres) {
      const asNum = Number(g);
      if (!isNaN(asNum) && asNum > 0) {
        resolvedGenreIds.push(asNum);
      } else {
        const mapped = GENRE_MAP[g.toLowerCase().trim()];
        if (mapped !== undefined) {
          resolvedGenreIds.push(mapped);
        }
      }
    }

    // 5. Resolve keywords
    const keywordIds: number[] = [];
    for (const kw of keywords) {
      const results = await searchKeyword(kw, apiKey);
      const firstKw = results[0];
      if (firstKw) {
        keywordIds.push(firstKw.id);
      }
    }

    // 6. Resolve companies
    const companyIds: number[] = [];
    for (const companyName of companies) {
      const results = await searchCompany(companyName, apiKey);
      const firstCo = results[0];
      if (firstCo) {
        companyIds.push(firstCo.id);
      }
    }

    // 7. Build Discover params
    const params: Record<string, string | number> = {
      sort_by: 'popularity.desc',
    };

    if (crewIds.length > 0) {
      params.with_crew = crewIds.join(',');
    }
    if (castIds.length > 0) {
      params.with_cast = castIds.join(',');
    }
    if (resolvedGenreIds.length > 0) {
      // Pipe-separated = OR logic for genres
      params.with_genres = resolvedGenreIds.join('|');
    }
    if (keywordIds.length > 0) {
      // Comma-separated = AND logic for keywords
      params.with_keywords = keywordIds.join(',');
    }
    if (companyIds.length > 0) {
      // Pipe-separated = OR logic for companies
      params.with_companies = companyIds.join('|');
    }
    if (yearStart) {
      params['primary_release_date.gte'] = `${yearStart}-01-01`;
    }
    if (yearEnd) {
      params['primary_release_date.lte'] = `${yearEnd}-12-31`;
    }
    if (language) {
      params.with_original_language = language;
    }

    // 8. Call discover with progressive relaxation
    let movies = await discoverMovies(params, apiKey);

    if (movies.length === 0) {
      // Progressive relaxation: drop keywords first
      const relaxedParams = { ...params };
      delete relaxedParams.with_keywords;
      movies = await discoverMovies(relaxedParams, apiKey);

      if (movies.length === 0) {
        // Drop language
        delete relaxedParams.with_original_language;
        movies = await discoverMovies(relaxedParams, apiKey);
      }

      if (movies.length === 0) {
        // Drop year range
        delete relaxedParams['primary_release_date.gte'];
        delete relaxedParams['primary_release_date.lte'];
        movies = await discoverMovies(relaxedParams, apiKey);
      }

      if (movies.length === 0) {
        recordSuccess(CIRCUIT_KEY);
        return {
          films: [],
          matchNotes,
          hint: 'No films found matching those criteria. Try broader search terms.',
        };
      }

      matchNotes.push('Relaxed some filters to find results');
    }

    // 9. Enrich with credits
    const topMovies = movies.slice(0, limit);
    const creditResults = await Promise.allSettled(
      topMovies.map((m) => getMovieCredits(m.id, apiKey))
    );

    const films: FilmResult[] = topMovies.map((movie: TMDBDiscoverMovie, i: number) => {
      const result = creditResults[i];
      const credits: TMDBCredits =
        result && result.status === 'fulfilled'
          ? result.value
          : { director: '', cinematographer: '', composer: '', writer: '' };

      return {
        tmdbId: movie.id,
        title: movie.title,
        year: movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : 0,
        posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
        synopsis: _truncateSynopsis(movie.overview),
        director: credits.director,
        cinematographer: credits.cinematographer,
        composer: credits.composer,
        writer: credits.writer,
        tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
        letterboxdUrl: `https://letterboxd.com/tmdb/${movie.id}`,
      };
    });

    // 10. Canon/Banned re-ranking
    const rankedFilms = _reRankResults(films, canonFilmmakers, bannedFilmmakers, canonEntries);

    // 11. Canon fallback: if all results were filtered out, search by random canon directors
    if (rankedFilms.length === 0 && films.length > 0) {
      const canonDirectors = _pickRandomCanonDirectors(4);
      const fallbackCrewIds: number[] = [];

      for (const directorName of canonDirectors) {
        const results = await searchPerson(directorName, apiKey);
        if (results.length > 0) {
          const person = results.reduce(
            (best: TMDBPersonResult, curr: TMDBPersonResult) =>
              curr.popularity > best.popularity ? curr : best,
            results[0] as TMDBPersonResult
          );
          fallbackCrewIds.push(person.id);
        }
      }

      if (fallbackCrewIds.length > 0) {
        // OR logic: films by ANY of these canon directors
        const fallbackParams: Record<string, string | number> = {
          sort_by: 'vote_average.desc',
          'vote_count.gte': 50,
          with_crew: fallbackCrewIds.join('|'),
        };

        const fallbackMovies = await discoverMovies(fallbackParams, apiKey);
        if (fallbackMovies.length > 0) {
          const fallbackTop = fallbackMovies.slice(0, limit);
          const fallbackCredits = await Promise.allSettled(
            fallbackTop.map((m) => getMovieCredits(m.id, apiKey))
          );

          const fallbackFilms: FilmResult[] = fallbackTop.map(
            (movie: TMDBDiscoverMovie, i: number) => {
              const result = fallbackCredits[i];
              const credits: TMDBCredits =
                result && result.status === 'fulfilled'
                  ? result.value
                  : { director: '', cinematographer: '', composer: '', writer: '' };

              return {
                tmdbId: movie.id,
                title: movie.title,
                year: movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : 0,
                posterUrl: movie.poster_path
                  ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                  : null,
                synopsis: _truncateSynopsis(movie.overview),
                director: credits.director,
                cinematographer: credits.cinematographer,
                composer: credits.composer,
                writer: credits.writer,
                tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
                letterboxdUrl: `https://letterboxd.com/tmdb/${movie.id}`,
              };
            }
          );

          const reranked = _reRankResults(
            fallbackFilms,
            canonFilmmakers,
            bannedFilmmakers,
            canonEntries
          );

          if (reranked.length > 0) {
            matchNotes.push('Curated from canon filmmakers');
            recordSuccess(CIRCUIT_KEY);
            return { films: reranked, matchNotes };
          }
        }
      }
    }

    recordSuccess(CIRCUIT_KEY);
    return { films: rankedFilms, matchNotes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[film-search] Pipeline failed:', { error: message });
    recordFailure(CIRCUIT_KEY);
    return {
      films: [],
      matchNotes: [],
      hint: 'Film search failed. Try different criteria.',
    };
  }
}
