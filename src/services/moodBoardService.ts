/**
 * Moodboard Service - Aggregates images from multiple cultural sources
 *
 * Free sources (always available):
 * - Met Museum
 * - Art Institute of Chicago
 * - Europeana
 * - Library of Congress (art + general intents)
 *
 * Optional sources (require API keys):
 * - TMDB (film stills) - add TMDB_API_KEY
 * - Discogs (album art) - add DISCOGS_TOKEN
 * - Smithsonian (art + general intents) - add SMITHSONIAN_API_KEY
 */
import logger from '../utils/logger.js';
import { normalizeTitle } from '../utils/normalizeTitle.js';

// Import all source services
import { searchMetMuseum, type MetMuseumResult } from './metMuseumService.js';
import { searchArtInstitute, type ArtworkResult } from './artInstituteService.js';
import { searchEuropeana, type EuropeanaResult } from './europeanaService.js';
import { searchTMDB, isAvailable as tmdbAvailable, type TMDBResult } from './tmdbService.js';
import {
  searchDiscogs,
  isAvailable as discogsAvailable,
  type DiscogsResult,
} from './discogsService.js';
import { searchLoC, type LocResult } from './locService.js';
import {
  searchSmithsonian,
  isAvailable as smithsonianAvailable,
  type SmithsonianResult,
} from './smithsonianService.js';
import { isCircuitOpen, recordFailure, recordSuccess } from './circuitBreaker.js';

export type MoodboardIntent = 'film' | 'music' | 'art' | 'general';

export interface MoodboardImage {
  url: string;
  thumbnailUrl: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
}

export interface MoodboardContext {
  apiKeys?: { tmdb?: string; discogs?: string; smithsonian?: string };
  session?: { tmdbApiKey?: string; discogsToken?: string; smithsonianApiKey?: string };
  getApiKey?: (key: string) => string | undefined;
}

export interface MoodboardResult {
  images: MoodboardImage[];
  sources: string[];
  intent: MoodboardIntent;
  totalFound?: number;
  sourcesResponded: number;
  sourcesTotal: number;
}

export interface MoodboardOptions {
  query: string;
  count?: number;
  context?: MoodboardContext;
}

type SourceResult =
  | MetMuseumResult
  | ArtworkResult
  | EuropeanaResult
  | TMDBResult
  | DiscogsResult
  | LocResult
  | SmithsonianResult;

/**
 * Detect the primary intent of a moodboard query
 */
export function detectIntent(query: string): MoodboardIntent {
  const q = String(query || '').toLowerCase();

  // Film indicators
  if (
    /\b(film|movie|cinema|director|cinematograph|scene|still|shot|nouvelle vague|new wave|noir|neorealism|criterion)\b/.test(
      q
    ) ||
    /\b(oshima|godard|fellini|bergman|kurosawa|tarkovsky|wong kar|antonioni|bresson|ozu|hitchcock|scorsese|lynch|coppola|kubrick)\b/.test(
      q
    )
  ) {
    return 'film';
  }

  // Music indicators
  if (
    /\b(album|music|song|track|vinyl|record|jazz|rock|hip.?hop|soul|funk|electronic|classical|playlist|concert|live)\b/.test(
      q
    ) ||
    /\b(coltrane|miles davis|radiohead|beatles|velvet underground|talking heads|bowie|prince|kraftwerk|brian eno)\b/.test(
      q
    )
  ) {
    return 'music';
  }

  // Art/photography indicators
  if (
    /\b(painting|photograph|sculpture|artist|gallery|museum|exhibition|portrait|landscape|abstract|impressionist|modernist|bauhaus|renaissance)\b/.test(
      q
    )
  ) {
    return 'art';
  }

  return 'general';
}

/**
 * Search multiple sources in parallel and aggregate results
 */
export async function getMoodBoardImages({
  query,
  count = 8,
  context = {},
}: MoodboardOptions): Promise<MoodboardResult> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { images: [], sources: [], intent: 'general', sourcesResponded: 0, sourcesTotal: 0 };
  }

  const searchQuery = query.trim();
  const intent = detectIntent(searchQuery);
  const perSource = Math.ceil(count / 3); // Aim to get ~count/3 from each source

  logger.debug(`[moodboard] Query: "${searchQuery}", Intent: ${intent}, Target: ${count} images`);

  // Build list of searches to run based on intent
  const searches: Promise<SourceResult[]>[] = [];
  const sourceNames: string[] = [];

  // Always include museum sources - they have good visual content for all intents
  if (!isCircuitOpen('Met Museum')) {
    searches.push(
      wrapWithCircuitBreaker('Met Museum', searchMetMuseum(searchQuery, perSource + 2))
    );
    sourceNames.push('Met Museum');
  } else {
    logger.debug('[moodboard] Met Museum circuit open, skipping');
  }

  if (!isCircuitOpen('Art Institute of Chicago')) {
    searches.push(
      wrapWithCircuitBreaker(
        'Art Institute of Chicago',
        searchArtInstitute(searchQuery, perSource + 2)
      )
    );
    sourceNames.push('Art Institute of Chicago');
  } else {
    logger.debug('[moodboard] Art Institute of Chicago circuit open, skipping');
  }

  // Europeana is good for historical/cultural content
  if (!isCircuitOpen('Europeana')) {
    searches.push(wrapWithCircuitBreaker('Europeana', searchEuropeana(searchQuery, perSource)));
    sourceNames.push('Europeana');
  } else {
    logger.debug('[moodboard] Europeana circuit open, skipping');
  }

  // Add LoC for art + general intents (supplemental, limit=4)
  if ((intent === 'art' || intent === 'general') && !isCircuitOpen('Library of Congress')) {
    searches.push(wrapWithCircuitBreaker('Library of Congress', searchLoC(searchQuery, 4)));
    sourceNames.push('Library of Congress');
    logger.debug('[moodboard] Library of Congress added for art/general intent');
  }

  // Add Smithsonian for art + general intents (optional, requires API key)
  if (
    (intent === 'art' || intent === 'general') &&
    smithsonianAvailable(context) &&
    !isCircuitOpen('Smithsonian')
  ) {
    searches.push(
      wrapWithCircuitBreaker('Smithsonian', searchSmithsonian(searchQuery, 4, context))
    );
    sourceNames.push('Smithsonian');
    logger.debug('[moodboard] Smithsonian available, adding to search');
  }

  // Add TMDB for film-related queries (if API key available)
  if ((intent === 'film' || intent === 'general') && tmdbAvailable(context)) {
    if (!isCircuitOpen('TMDB')) {
      searches.push(
        wrapWithCircuitBreaker('TMDB', searchTMDB(searchQuery, perSource + 2, context))
      );
      sourceNames.push('TMDB');
      logger.debug('[moodboard] TMDB available, adding to search');
    } else {
      logger.debug('[moodboard] TMDB circuit open, skipping');
    }
  } else if (intent === 'film') {
    logger.debug('[moodboard] TMDB not available (no API key), film results may be limited');
  }

  // Add Discogs for music-related queries (if API key available)
  if ((intent === 'music' || intent === 'general') && discogsAvailable(context)) {
    if (!isCircuitOpen('Discogs')) {
      searches.push(
        wrapWithCircuitBreaker('Discogs', searchDiscogs(searchQuery, perSource + 2, context))
      );
      sourceNames.push('Discogs');
      logger.debug('[moodboard] Discogs available, adding to search');
    } else {
      logger.debug('[moodboard] Discogs circuit open, skipping');
    }
  } else if (intent === 'music') {
    logger.debug('[moodboard] Discogs not available (no API key), music results may be limited');
  }

  const sourcesTotal = sourceNames.length;

  // Execute all searches in parallel
  const results = await Promise.all(searches);

  // Aggregate and dedupe results
  const allImages: MoodboardImage[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Map<string, number>(); // normalized title -> index in allImages
  const activeSources: string[] = [];

  results.forEach((sourceResults, idx) => {
    const sourceName = sourceNames[idx] ?? 'Unknown';
    if (sourceResults && sourceResults.length > 0) {
      activeSources.push(sourceName);

      for (const img of sourceResults) {
        // Skip if we've seen this URL
        if (seenUrls.has(img.url)) continue;
        seenUrls.add(img.url);

        const title = img.title || 'Untitled';
        const normalizedTitle = normalizeTitle(title);

        // Title-based dedup: skip generic titles, keep higher resolution on match
        if (shouldTitleDedup(title) && seenTitles.has(normalizedTitle)) {
          const existingIdx = seenTitles.get(normalizedTitle)!;
          const existing = allImages[existingIdx];
          // Heuristic: prefer non-thumbnail URLs or longer URLs as higher resolution
          if (existing && img.url.length > existing.url.length) {
            allImages[existingIdx] = {
              url: img.url,
              thumbnailUrl: (img as { thumbnailUrl?: string }).thumbnailUrl || img.url,
              title,
              artist: img.artist || '',
              date: img.date || '',
              source: img.source || sourceName,
              sourceUrl: (img as { sourceUrl?: string }).sourceUrl || '',
            };
            seenUrls.add(img.url);
          }
          continue;
        }

        const imageEntry: MoodboardImage = {
          url: img.url,
          thumbnailUrl: (img as { thumbnailUrl?: string }).thumbnailUrl || img.url,
          title,
          artist: img.artist || '',
          date: img.date || '',
          source: img.source || sourceName,
          sourceUrl: (img as { sourceUrl?: string }).sourceUrl || '',
        };

        if (shouldTitleDedup(title)) {
          seenTitles.set(normalizedTitle, allImages.length);
        }

        allImages.push(imageEntry);
      }
    }
  });

  // Shuffle to mix sources, then take requested count
  const shuffled = shuffleArray(allImages);
  const finalImages = shuffled.slice(0, count);

  const sourcesResponded = activeSources.length;

  logger.debug(
    `[moodboard] Aggregated ${allImages.length} images from ${sourcesResponded} of ${sourcesTotal} sources, returning ${finalImages.length}`
  );

  return {
    images: finalImages,
    sources: activeSources,
    intent,
    totalFound: allImages.length,
    sourcesResponded,
    sourcesTotal,
  };
}

/**
 * Wrap a source search promise with circuit breaker tracking.
 * On success: records success (resets failure count).
 * On failure: records failure and returns empty array (graceful degradation).
 */
function wrapWithCircuitBreaker(
  sourceName: string,
  searchPromise: Promise<SourceResult[]>
): Promise<SourceResult[]> {
  return searchPromise
    .then((results) => {
      recordSuccess(sourceName);
      return results;
    })
    .catch((err: Error) => {
      recordFailure(sourceName);
      logger.debug(`[moodboard] ${sourceName} failed:`, { error: err.message });
      return [] as SourceResult[];
    });
}

/**
 * Check if a title should participate in title-based dedup.
 * Skip generic titles (too short, "untitled", "unknown").
 */
function shouldTitleDedup(title: string): boolean {
  const norm = normalizeTitle(title);
  return norm.length >= 5 && norm !== 'untitled' && norm !== 'unknown';
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    const swapVal = arr[j];
    if (temp !== undefined && swapVal !== undefined) {
      arr[i] = swapVal;
      arr[j] = temp;
    }
  }
  return arr;
}

interface SourceInfo {
  name: string;
  available: boolean;
  keyName: string;
}

interface AvailableSources {
  free: string[];
  optional: {
    tmdb: SourceInfo;
    discogs: SourceInfo;
    smithsonian: SourceInfo;
  };
}

/**
 * Get available sources based on current configuration
 */
export function getAvailableSources(context: MoodboardContext = {}): AvailableSources {
  return {
    free: ['Met Museum', 'Art Institute of Chicago', 'Europeana', 'Library of Congress'],
    optional: {
      tmdb: {
        name: 'TMDB (Film Stills)',
        available: tmdbAvailable(context),
        keyName: 'TMDB_API_KEY',
      },
      discogs: {
        name: 'Discogs (Album Art)',
        available: discogsAvailable(context),
        keyName: 'DISCOGS_TOKEN',
      },
      smithsonian: {
        name: 'Smithsonian (Art & Culture)',
        available: smithsonianAvailable(context),
        keyName: 'SMITHSONIAN_API_KEY',
      },
    },
  };
}

export default { getMoodBoardImages, getAvailableSources, detectIntent };
