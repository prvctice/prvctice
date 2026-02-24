/*
 * Central registry for server-side tools callable by LLMs.
 *
 * Each tool:
 *   {
 *     name: string,
 *     description: string,
 *     parameters: JSON-Schema object,
 *     execute?: (args) => Promise<any>
 *   }
 */

import fs from 'fs';
import path from 'path';
import { getCapabilities } from '../utils/capabilities.js';
import { runVision, VisionError, type ImageInput } from '../services/visionService.js';
import { normalizeTitle } from '../utils/normalizeTitle.js';

// Types
interface ToolParameterProperty {
  type: string | string[];
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

interface ToolParameters {
  type: string;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Result Types - Discriminated Unions
// ─────────────────────────────────────────────────────────────────────────────

/** Common error result returned by any tool */
export interface ToolErrorResult {
  type: 'error';
  error: string;
  code?: string;
  do_not_fallback?: boolean;
}

/** YouTube video item in search results */
export interface YouTubeVideoItem {
  videoId?: string;
  url?: string;
  title?: string;
  channelTitle?: string;
  channel?: string;
}

/** Result from youtube_search tool */
export interface YouTubeSearchResult {
  type: 'youtube_search';
  videos: YouTubeVideoItem[];
}

/** Wikipedia article item in search results */
export interface WikipediaArticleItem {
  title: string;
  snippet: string;
  url: string;
}

/** Result from wikipedia_search tool */
export interface WikipediaSearchResult {
  type: 'wikipedia_search';
  results: WikipediaArticleItem[];
  error?: string;
}

/** Result from save_note tool */
export interface SaveNoteResult {
  type: 'save_note';
  savedText: string;
}

/** Single batch task result */
export interface BatchTaskResult {
  index: number;
  name: string;
  ok?: boolean;
  result?: ToolResult;
  error?: string;
}

/** Result from batch_tools tool */
export interface BatchToolsResult {
  type: 'batch_tools';
  results: BatchTaskResult[];
  error?: string;
}

/** Result from vision_describe tool */
export interface VisionDescribeResult {
  type: 'vision_describe';
  text: string;
  raw?: unknown;
  provider: string;
  keySource?: string;
}

/** Image item in moodboard search results */
export interface MoodboardImageItem {
  url: string;
  thumbnailUrl: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
}

/** Available sources info for moodboard */
export interface MoodboardSourcesInfo {
  free: string[];
  optional: {
    tmdb: { available: boolean; reason?: string };
    discogs: { available: boolean; reason?: string };
  };
}

/** Result from moodboard_search tool */
export interface MoodboardSearchResult {
  type: 'moodboard_search';
  images: MoodboardImageItem[];
  sources: string[];
  intent: 'film' | 'music' | 'art' | 'general';
  totalFound?: number;
  availableSources?: MoodboardSourcesInfo;
  hint?: string;
}

/** Book item in search results */
export interface BookItem {
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  publishYear: number | null;
  source: string;
  sourceUrl: string;
  isbn: string | null;
}

/** Result from book_search tool */
export interface BookSearchResult {
  type: 'book_search';
  books: BookItem[];
  sourcesResponded: number;
  sourcesTotal: number;
  hint?: string;
}

/** Essay item in search results */
export interface EssayItem {
  title: string;
  authors: string[];
  abstract: string;
  citationCount: number;
  year: number | null;
  isOpenAccess: boolean;
  pdfUrl: string | null;
  source: string;
  sourceUrl: string;
}

/** Result from essay_search tool */
export interface EssaySearchResult {
  type: 'essay_search';
  essays: EssayItem[];
  hint?: string;
}

/** Film item in search results */
export interface FilmItem {
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

/** Result from film_search tool */
export interface FilmSearchResult {
  type: 'film_search';
  films: FilmItem[];
  matchNotes: string[];
  hint?: string;
}

/** Union of all tool result types */
export type ToolResult =
  | YouTubeSearchResult
  | WikipediaSearchResult
  | SaveNoteResult
  | BatchToolsResult
  | VisionDescribeResult
  | MoodboardSearchResult
  | BookSearchResult
  | EssaySearchResult
  | FilmSearchResult
  | ToolErrorResult;

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definition Types
// ─────────────────────────────────────────────────────────────────────────────

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

interface ToolMetadata {
  name: string;
  description: string;
  parameters: ToolParameters;
}

interface Session {
  youtubeApiKey?: string;
  googleApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
}

interface ApiKeys {
  youtube?: string;
  gemini?: string;
  google?: string;
  openai?: string;
  openAi?: string;
  open_ai?: string;
  anthropic?: string;
  openrouter?: string;
}

interface ToolOptions {
  client?: unknown;
  session?: Session | null;
  getApiKey?: ((provider: string) => string | null) | null;
  apiKeys?: ApiKeys | null;
  request?: unknown;
  requestId?: string | null;
  featureFlags?: Record<string, boolean> | null;
  budget?: unknown;
  provider?: string | null;
  trialActive?: boolean;
}

interface ToolContext extends ToolOptions {
  resolveYouTubeApiKey: () => string | undefined;
  resolveGeminiApiKey: () => { apiKey: string | null; source: string | null };
}

interface YouTubeVideo {
  videoId?: string;
  url?: string;
  title?: string;
  channelTitle?: string;
  channel?: string;
}

interface ProviderCapabilities {
  tools?: string;
  [key: string]: unknown;
}

// (Note) Any tool-specific caching should live inside that tool's module.

// Load canon and banned lists for curated recommendations
const CANON_PATH = path.join(__dirname, '..', '..', 'canon.json');
const BANNED_PATH = path.join(__dirname, '..', '..', 'banned.json');

let canonList: string[] = [];
let bannedList: string[] = [];
let bannedSet: Set<string> = new Set();

function loadCreatorLists(): void {
  try {
    if (fs.existsSync(CANON_PATH)) {
      const raw = fs.readFileSync(CANON_PATH, 'utf8');
      canonList = (JSON.parse(raw) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim() !== ''
      );
    }
  } catch (_) {
    canonList = [];
  }
  try {
    if (fs.existsSync(BANNED_PATH)) {
      const raw = fs.readFileSync(BANNED_PATH, 'utf8');
      bannedList = (JSON.parse(raw) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim() !== ''
      );
      bannedSet = new Set(bannedList.map((b) => b.toLowerCase().trim()));
    }
  } catch (_) {
    bannedList = [];
    bannedSet = new Set();
  }
}

// Load lists at module init
loadCreatorLists();

// Check if a name matches any banned entry
function isBanned(name: string | undefined | null): boolean {
  if (!name || !bannedSet.size) return false;
  const lower = String(name).toLowerCase().trim();
  for (const banned of bannedSet) {
    if (lower.includes(banned) || banned.includes(lower)) return true;
  }
  return false;
}

// Categorize canon artists by likely domain (music, film, art)
function categorizeCanon(): { music: string[]; film: string[]; art: string[]; other: string[] } {
  // Known music-related keywords/names for categorization
  const musicIndicators =
    /miles davis|coltrane|bill evans|herbie hancock|monk|parker|dizzy|keith jarrett|playboi carti|kanye|frank ocean|mobb deep|jay-z|earl sweatshirt|bukka white|robert johnson|blind willie|phil ochs|dave van ronk|karen dalton|sly stone|james brown|prince|ronettes|al green|curtis mayfield|aretha|otis redding|sister sledge|dylan|lou reed|talking heads|richard hell|television|george harrison|bowie|paul simon|zombies|neptunes|lil yachty/i;
  const filmIndicators =
    /godard|renoir|antonioni|fassbinder|wenders|duras|scorsese|rohmer|rivette|oshima|eustache|ozu|mizoguchi|lynch|welles|bresson|kiarostami|coppola|bill gunn|jean vigo|marx brothers|fritz lang|paul thomas anderson|assayas|satoshi kon|hideaki anno|hal hartley|bazin|daney|debord|sarris|sontag|barthes/i;
  const artIndicators =
    /baldessari|lorna simpson|cartier-bresson|vivian maier|eggleston|tillmans|maya lin|bruce nauman|kerry james marshall|christo|viviane sassen|juergen teller|richard serra|robert frank|nick knight|brassai|dieter rams/i;

  const music: string[] = [];
  const film: string[] = [];
  const art: string[] = [];
  const other: string[] = [];

  for (const name of canonList) {
    const lower = name.toLowerCase();
    if (musicIndicators.test(lower)) {
      music.push(name);
    } else if (filmIndicators.test(lower)) {
      film.push(name);
    } else if (artIndicators.test(lower)) {
      art.push(name);
    } else {
      other.push(name);
    }
  }

  return { music, film, art, other };
}

const canonByCategory = categorizeCanon();

function normalizeOptions(input: unknown): ToolOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { client: null };
  }
  const {
    client = null,
    session = null,
    getApiKey = null,
    apiKeys = null,
    request = null,
    requestId = null,
    featureFlags = null,
    budget = null,
    provider = null,
    trialActive = false,
  } = input as ToolOptions;
  return {
    client,
    session,
    getApiKey,
    apiKeys,
    request,
    requestId,
    featureFlags,
    budget,
    provider,
    trialActive,
  };
}

function resolveYouTubeApiKey(context: ToolOptions): string | undefined {
  const { getApiKey, apiKeys, session, trialActive } = context;
  // Check getApiKey function first (preferred)
  if (typeof getApiKey === 'function') {
    const value = getApiKey('youtube');
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // Check apiKeys object
  if (apiKeys && typeof apiKeys.youtube === 'string' && apiKeys.youtube.trim()) {
    return apiKeys.youtube.trim();
  }
  // Check session
  if (session && typeof session.youtubeApiKey === 'string' && session.youtubeApiKey.trim()) {
    return session.youtubeApiKey.trim();
  }
  // Only fall back to env key if trial is active
  // After trial expires, user must provide their own YouTube API key
  if (trialActive) {
    const envKey = process.env.YOUTUBE_API_KEY;
    return envKey && envKey.trim ? envKey.trim() : envKey;
  }
  return undefined;
}

function resolveGeminiApiKeyForContext(context: ToolOptions): {
  apiKey: string | null;
  source: string | null;
} {
  const candidates: Array<{ apiKey: string; source: string }> = [];
  const push = (value: unknown, source: string): void => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) candidates.push({ apiKey: trimmed, source });
    }
  };

  // Check context.apiKeys
  if (context && typeof context.apiKeys === 'object' && context.apiKeys) {
    push(context.apiKeys.gemini, 'context.apiKeys.gemini');
    push(context.apiKeys.google, 'context.apiKeys.google');
  }

  // Check getApiKey function
  if (typeof context.getApiKey === 'function') {
    push(context.getApiKey('gemini'), 'getApiKey(gemini)');
    push(context.getApiKey('google'), 'getApiKey(google)');
  }

  // Check session
  if (context.session) {
    push(context.session.googleApiKey, 'session.googleApiKey');
    push(context.session.geminiApiKey, 'session.geminiApiKey');
  }

  // Only fall back to env keys if trial is active
  if (context.trialActive) {
    push(process.env.GOOGLE_API_KEY, 'env.GOOGLE_API_KEY');
    push(process.env.GEMINI_API_KEY, 'env.GEMINI_API_KEY');
  }

  if (candidates.length === 0) {
    return { apiKey: null, source: null };
  }
  return candidates[0] ?? { apiKey: null, source: null };
}

function createTools(input: unknown = {}): ToolDefinition[] {
  const options = normalizeOptions(input);
  const providerName = options && options.provider ? String(options.provider).toLowerCase() : null;
  const providerCaps = providerName
    ? (getCapabilities(providerName) as ProviderCapabilities | null)
    : null;
  const context: ToolContext = {
    ...options,
    resolveYouTubeApiKey: () => resolveYouTubeApiKey(options),
    resolveGeminiApiKey: () => resolveGeminiApiKeyForContext(options),
  };

  const tools: ToolDefinition[] = [
    // Note: web_search tool removed. Web search is not available as a server tool.
    {
      name: 'youtube_search',
      description:
        'Search YouTube for videos, music, documentaries, tutorials, and more. For diverse results (playlists, compilations), use the "queries" array with specific, varied terms—artist names, album titles, "live at [venue]", decade + genre combos. The tool auto-diversifies broad mood queries (e.g., "chill jazz for a rainy night") into artist-specific searches. Tip: "Thelonious Monk solo piano" finds better gems than "jazz piano music".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Single search query for YouTube videos' },
          queries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: multiple specific queries to aggregate',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 10,
            description: 'Max number of unique videos to return',
          },
          perQuery: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            default: 3,
            description: 'Max results per query when using multiple queries',
          },
        },
      },
      async execute({
        query,
        queries,
        limit = 10,
        perQuery = 3,
      }: {
        query?: string;
        queries?: string[];
        limit?: number;
        perQuery?: number;
      }): Promise<YouTubeSearchResult | ToolErrorResult> {
        const svc = await import('../services/youtubeService.js');

        let resolvedApiKey: string;
        try {
          resolvedApiKey = svc.ensureApiKeyAvailable({ context });
        } catch (err) {
          return {
            type: 'error',
            error:
              'YouTube API key is not configured. The user has been notified to add a key in Settings. IMPORTANT: Do NOT use web search as a fallback - simply tell the user that YouTube search requires an API key.',
            code: 'missing_key',
            do_not_fallback: true,
          };
        }

        // Cap YouTube usage for trial users (env key) to prevent abuse
        const TRIAL_YT_CAP = parseInt(process.env.TRIAL_YT_CAP || '3', 10);
        if (context.trialActive && context.session) {
          const used = ((context.session as Record<string, unknown>).ytTrialCalls as number) || 0;
          if (used >= TRIAL_YT_CAP) {
            return {
              type: 'error',
              error:
                'YouTube search limit reached for trial. Add your own YouTube API key in Settings to continue using YouTube search.',
              code: 'trial_limit',
              do_not_fallback: true,
            };
          }
          (context.session as Record<string, unknown>).ytTrialCalls = used + 1;
        }

        // Hard clamps to prevent excessive API fan-out
        const PER_MAX = Math.max(
          1,
          Math.min(parseInt(process.env.YT_PER_QUERY_MAX || '3', 10), 10)
        );
        const per = Math.max(1, Math.min(parseInt(String(perQuery), 10) || 3, PER_MAX));
        const LIMIT_MAX = Math.max(1, Math.min(parseInt(process.env.YT_LIMIT_MAX || '20', 10), 20));
        const effectiveLimit = Math.max(1, Math.min(parseInt(String(limit), 10) || 10, LIMIT_MAX));
        const QCAP = Math.max(
          1,
          Math.min(parseInt(process.env.YT_MAX_QUERIES_PER_CALL || '3', 10), 12)
        );

        // Heuristic: If only a broad theme query is provided (e.g., "make a jazz playlist for a foggy night"),
        // auto-generate diverse sub-queries using canon.json artists (avoiding banned.json).
        function buildDiverseQueries(theme: string): string[] | null {
          const t = String(theme || '').toLowerCase();

          // Skip diversification if query looks specific (contains proper nouns / quoted titles)
          // e.g. "Sans Soleil Chris Marker" should search directly, not diversify
          const looksSpecific =
            /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(theme) || // Two+ capitalized words (proper nouns)
            /"[^"]+"/.test(theme) || // Quoted text
            /\d{4}/.test(theme); // Year like 1983
          if (looksSpecific) return null;

          // Detect if this is a music/film/art request
          const isMusic =
            /music|playlist|song|album|track|jazz|rock|hip.?hop|rap|soul|funk|folk|electronic|classical|ambient|blues|country/i.test(
              t
            );
          const isFilm = /film|movie|cinema|director|documentary/i.test(t);

          // Get appropriate canon pool, filtering out banned entries
          let artistPool: string[] = [];
          if (isMusic && canonByCategory.music.length) {
            artistPool = canonByCategory.music.filter((a) => !isBanned(a));
          } else if (isFilm && canonByCategory.film.length) {
            artistPool = canonByCategory.film.filter((a) => !isBanned(a));
          }

          // Fall back if no canon artists available
          if (!artistPool.length) return null;

          // Mood keywords based on query tone
          const moodKeywords: Record<string, string[]> = {
            night: ['late night', 'noir', 'intimate', 'nocturne'],
            chill: ['slow', 'mellow', 'acoustic', 'quiet'],
            upbeat: ['live', 'concert', 'energetic', 'session'],
            default: ['live', 'full album', 'session', 'performance'],
          };

          let moodKey = 'default';
          if (/night|late|midnight|fog|foggy|noir|dark/.test(t)) moodKey = 'night';
          else if (/chill|calm|quiet|soft|slow|relax|mellow/.test(t)) moodKey = 'chill';
          else if (/upbeat|fast|energy|dance|party|hype/.test(t)) moodKey = 'upbeat';

          const moods = moodKeywords[moodKey] ?? moodKeywords['default'] ?? [];

          // Clean up base query for combining
          const base = t
            .replace(/^(make|create|build|find|get) (me )?(a |some )?/, '')
            .replace(/playlist|mix|compilation|music|songs?|film|movie/gi, '')
            .replace(/for (a |the )?/gi, '')
            .trim();

          // Build diverse queries from canon artists
          const qs: string[] = [];
          const shuffled = [...artistPool].sort(() => Math.random() - 0.5);
          for (let i = 0; i < shuffled.length && qs.length < 8; i++) {
            const artist = shuffled[i];
            const kw = moods[i % moods.length];
            const q = [artist, kw, base].filter(Boolean).join(' ').trim();
            qs.push(q);
          }

          return qs.length ? qs : null;
        }
        const collect: YouTubeVideo[] = [];
        const seen = new Set<string>();
        const seenTitles = new Set<string>();
        const pushUnique = (arr: YouTubeVideo[]): boolean => {
          for (const v of arr || []) {
            const key = v && (v.videoId || v.url);
            if (!key) continue;
            // Filter out banned creators from results
            if (isBanned(v.title) || isBanned(v.channelTitle) || isBanned(v.channel)) continue;
            const titleKey = normalizeTitle(v.title);
            if (seen.has(key) || (titleKey && seenTitles.has(titleKey))) continue;
            seen.add(key);
            if (titleKey) seenTitles.add(titleKey);
            collect.push(v);
            if (collect.length >= effectiveLimit) return true;
          }
          return false;
        };
        try {
          if (Array.isArray(queries) && queries.length) {
            const norm = (s: string): string =>
              String(s || '')
                .toLowerCase()
                .trim();
            const deduped = Array.from(new Set(queries.map(norm))).filter(Boolean);
            const qs = deduped.slice(0, QCAP);
            const MAX = parseInt(process.env.YT_QUERY_CONCURRENCY || '4', 10);
            const results: YouTubeVideo[][] = new Array(qs.length);
            let idx = 0;
            async function worker(): Promise<void> {
              while (idx < qs.length) {
                const i = idx++;
                const q = qs[i];
                if (!q) continue;
                try {
                  results[i] = await svc.searchYouTube(q, per, { apiKey: resolvedApiKey });
                } catch (e) {
                  // Propagate auth/key errors, swallow transient network issues
                  const msg = (e as Error)?.message || '';
                  if (/api key|auth|configured|403|401/i.test(msg)) {
                    throw e;
                  }
                  results[i] = [];
                }
              }
            }
            const workers = new Array(Math.min(MAX, qs.length)).fill(0).map(worker);
            await Promise.all(workers);
            for (const arr of results) {
              if (pushUnique(arr)) break;
            }
          } else if (query) {
            const diversified = buildDiverseQueries(query);
            if (diversified && diversified.length) {
              for (const q of diversified) {
                const res = await svc.searchYouTube(q, per, { apiKey: resolvedApiKey });
                if (pushUnique(res)) break;
              }
            } else {
              const res = await svc.searchYouTube(query, Math.min(effectiveLimit, 10), {
                apiKey: resolvedApiKey,
              });
              pushUnique(res);
            }
          }
        } catch (e) {
          // Catch auth/key errors from search and return proper error response
          const msg = (e as Error)?.message || '';
          if (/api key|auth|configured|403|401/i.test(msg)) {
            return {
              type: 'error',
              error:
                'YouTube API key is invalid or not configured. The user has been notified to add a key in Settings. IMPORTANT: Do NOT use web search as a fallback - simply tell the user that YouTube search requires an API key.',
              code: 'missing_key',
              do_not_fallback: true,
            };
          }
          throw e;
        }
        return { type: 'youtube_search', videos: collect.slice(0, effectiveLimit) };
      },
    },
    {
      name: 'wikipedia_search',
      description:
        'Search Wikipedia for encyclopedic knowledge—biographies, historical events, scientific concepts, cultural movements, places. Great for grounding creative work in facts, understanding context, or discovering connections between topics. Returns article titles, snippets, and direct links.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms (names, concepts, events, places)' },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            default: 5,
            description: 'Number of results',
          },
        },
        required: ['query'],
      },
      async execute({
        query,
        limit = 5,
      }: { query?: string; limit?: number } = {}): Promise<WikipediaSearchResult> {
        const clamp = (n: unknown, lo: number, hi: number): number =>
          Math.max(lo, Math.min(parseInt(String(n), 10) || lo, hi));
        const svc = await import('../services/wikipediaService.js');
        const q = String(query || '').trim();
        if (!q) return { type: 'wikipedia_search', results: [] };
        const lim = clamp(limit, 1, 20);
        try {
          const results = await svc.searchWikipediaArticles(q, lim);
          return { type: 'wikipedia_search', results };
        } catch (err) {
          const msg = (err as Error)?.message || 'Wikipedia search failed';
          return { type: 'wikipedia_search', error: msg, results: [] };
        }
      },
    },
    // (duplicate save_note removed)
    {
      name: 'save_note',
      description:
        'Capture ideas, discoveries, summaries, or curated lists for the user. Use this to save research findings, playlist recommendations, creative concepts, or anything worth keeping. The user can review and organize their notes later.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Content to save: ideas, findings, summaries, recommendations',
          },
        },
        required: ['text'],
      },
      async execute({ text }: { text?: string }): Promise<SaveNoteResult> {
        return { type: 'save_note', savedText: text || '' };
      },
    },
    {
      name: 'batch_tools',
      description:
        'Execute multiple tool calls in parallel for efficiency. Perfect for: searching multiple topics at once, generating several image variations, or combining research across YouTube + Wikipedia simultaneously. Returns all results together.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                arguments: { type: 'object' },
              },
              required: ['name'],
            },
          },
          concurrency: { type: 'integer', minimum: 1, maximum: 16, default: 4 },
        },
        required: ['tasks'],
      },
      async execute({
        tasks = [],
        concurrency = 4,
      }: {
        tasks?: Array<{ name: string; arguments?: Record<string, unknown> }>;
        concurrency?: number;
      } = {}): Promise<BatchToolsResult> {
        try {
          if (!Array.isArray(tasks) || tasks.length === 0)
            return { type: 'batch_tools', results: [] };
          const all = createTools({ ...context });
          const map = Object.fromEntries(
            all.filter((t) => t && t.name && t.name !== 'batch_tools').map((t) => [t.name, t])
          ) as Record<string, ToolDefinition>;
          const results: BatchTaskResult[] = new Array(tasks.length);
          let i = 0;
          const MAX = Math.max(1, Math.min(16, Number(concurrency) || 4));
          async function worker(): Promise<void> {
            while (i < tasks.length) {
              const idx = i++;
              const task = tasks[idx];
              if (!task) {
                results[idx] = { index: idx, name: '', error: 'empty task' };
                continue;
              }
              const name = String(task.name || '').trim();
              const args = task.arguments || {};
              try {
                if (!name || !map[name] || typeof map[name].execute !== 'function') {
                  results[idx] = { index: idx, name, error: 'unknown tool' };
                  continue;
                }
                const out = await Promise.resolve(map[name].execute(args));
                results[idx] = { index: idx, name, ok: true, result: out };
              } catch (e) {
                const msg = (e as Error)?.message || String(e) || 'task failed';
                results[idx] = { index: idx, name, error: msg };
              }
            }
          }
          const workers = new Array(Math.min(MAX, tasks.length)).fill(0).map(worker);
          await Promise.all(workers);
          return { type: 'batch_tools', results };
        } catch (e) {
          const msg = (e as Error)?.message || String(e) || 'batch failed';
          return { type: 'batch_tools', results: [], error: msg };
        }
      },
    },
    {
      name: 'vision_describe',
      description:
        'Analyze images with AI vision: describe contents, extract text/data, identify objects, understand layouts, get creative inspiration. Ask specific questions like "What era is this architecture from?" or "Describe the color palette and mood" for richer analysis.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'User text describing what to analyse or ask about the image(s)',
          },
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of previously-uploaded file IDs to include as vision inputs.',
          },
          images: {
            type: 'array',
            items: {
              type: ['string', 'object'],
              description:
                'Inline base64 images or {data, detail?} objects. Only use for small images; prefer fileIds for uploads.',
            },
          },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                data: { type: 'string' },
                detail: { type: 'string' },
              },
            },
          },
          provider: {
            type: 'string',
            enum: ['anthropic', 'gemini', 'openrouter'],
            description: 'Vision provider to use (defaults to context provider or anthropic).',
          },
          model: {
            type: 'string',
            description: 'Optional vision-capable model override.',
          },
        },
      },
      async execute(
        args: {
          message?: string;
          fileIds?: string[];
          images?: unknown[];
          attachments?: Array<{ data: string; detail?: string }>;
          provider?: string;
          model?: string;
        } = {}
      ): Promise<VisionDescribeResult | ToolErrorResult> {
        // Determine provider from args or context
        const provider = args.provider || context.provider || 'anthropic';

        // Resolve API key based on provider
        let apiKey: string | null = null;
        let keySource: string | null = null;

        if (provider === 'anthropic') {
          apiKey =
            context.apiKeys?.anthropic ||
            context.session?.anthropicApiKey ||
            (context.trialActive ? process.env.ANTHROPIC_API_KEY : null) ||
            null;
          keySource = apiKey ? 'context' : null;
        } else if (provider === 'gemini') {
          apiKey =
            context.apiKeys?.google ||
            context.apiKeys?.gemini ||
            context.session?.googleApiKey ||
            (context.trialActive
              ? process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
              : null) ||
            null;
          keySource = apiKey ? 'context' : null;
        } else if (provider === 'openrouter') {
          apiKey =
            context.apiKeys?.openrouter ||
            context.session?.openrouterApiKey ||
            (context.trialActive ? process.env.OPENROUTER_API_KEY : null) ||
            null;
          keySource = apiKey ? 'context' : null;
        }

        if (!apiKey) {
          const providerDisplayName = provider.charAt(0).toUpperCase() + provider.slice(1);
          return {
            type: 'error',
            error: `Missing ${providerDisplayName} API key. Configure one in Settings or the environment.`,
            code: 'missing_key',
          };
        }

        try {
          const result = await runVision({
            provider,
            apiKey,
            message: typeof args.message === 'string' ? args.message : undefined,
            fileIds: Array.isArray(args.fileIds) ? args.fileIds : undefined,
            images: Array.isArray(args.images)
              ? (args.images as (string | ImageInput)[])
              : undefined,
            attachments: Array.isArray(args.attachments) ? args.attachments : undefined,
            model:
              typeof args.model === 'string' && args.model.trim() ? args.model.trim() : undefined,
          });
          return {
            type: 'vision_describe',
            text: result.text || '',
            raw: result.raw,
            provider,
            keySource: keySource || undefined,
          };
        } catch (err) {
          if (err instanceof VisionError) {
            return { type: 'error', error: err.message, code: err.code };
          }
          throw err;
        }
      },
    },
    {
      name: 'moodboard_search',
      description:
        'Create visual moodboards by searching cultural archives. Aggregates images from Met Museum, Art Institute of Chicago, Europeana, and Wikimedia Commons. Optionally includes TMDB film stills (if API key configured) and Discogs album art (if token configured). Great for: film research (stills, cinematography), music projects (album art, concert photography), art history, design inspiration, period aesthetics. Returns structured image data with titles, artists, dates, and source attribution.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search query - be specific. Good: "Japanese New Wave cinema 1960s", "Bauhaus design posters", "Blue Note jazz album covers". Bad: "cool stuff", "aesthetic".',
          },
          count: {
            type: 'integer',
            minimum: 4,
            maximum: 20,
            default: 10,
            description: 'Number of images to return (4-20)',
          },
        },
        required: ['query'],
      },
      async execute({
        query,
        count = 10,
      }: {
        query?: string;
        count?: number;
      }): Promise<MoodboardSearchResult | ToolErrorResult> {
        const { getMoodBoardImages, getAvailableSources } = await import(
          '../services/moodBoardService.js'
        );

        const clampedCount = Math.max(4, Math.min(20, parseInt(String(count), 10) || 10));

        try {
          // Adapt context for moodboard service
          const moodboardContext = {
            apiKeys: context.apiKeys as { tmdb?: string; discogs?: string } | undefined,
            session: context.session as { tmdbApiKey?: string; discogsToken?: string } | undefined,
            getApiKey: context.getApiKey as ((key: string) => string | undefined) | undefined,
          };
          const result = await getMoodBoardImages({
            query: query || '',
            count: clampedCount,
            context: moodboardContext,
          });

          // Include info about which sources were used and which are available
          const sources = getAvailableSources(moodboardContext);

          return {
            type: 'moodboard_search',
            images: result.images,
            sources: result.sources,
            intent: result.intent,
            totalFound: result.totalFound,
            availableSources: sources,
            hint:
              result.images.length === 0
                ? 'No images found. Try a more specific query or different terms.'
                : result.intent === 'music' && !sources.optional.discogs.available
                  ? 'Tip: Add a Discogs token in Settings to unlock album artwork.'
                  : undefined,
          };
        } catch (err) {
          const msg = (err as Error)?.message || 'Moodboard search failed';
          return { type: 'error', error: msg };
        }
      },
    },
    {
      name: 'book_search',
      description:
        'Search for books by title, author, or topic. Queries Open Library and Google Books in parallel, returning curated results with cover images, descriptions, and source links. For diverse results, use specific queries like "books about brutalism" or "novels by Haruki Murakami". Returns 3-5 results as rich cards.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms (topic, title, or subject)' },
          author: { type: 'string', description: 'Filter by author name' },
        },
        required: ['query'],
      },
      async execute({
        query,
        author,
      }: {
        query?: string;
        author?: string;
      }): Promise<BookSearchResult | ToolErrorResult> {
        const q = String(query || '').trim();
        if (!q) {
          return { type: 'book_search', books: [], sourcesResponded: 0, sourcesTotal: 0 };
        }

        try {
          const { searchBooks } = await import('../services/bookSearchService.js');
          const result = await searchBooks({ query: q, author, limit: 5 });

          return {
            type: 'book_search',
            books: result.books.map((b) => ({
              title: b.title,
              authors: b.authors,
              description: b.description,
              coverUrl: b.coverUrl,
              publishYear: b.publishYear,
              source: b.source,
              sourceUrl: b.sourceUrl,
              isbn: b.isbn,
            })),
            sourcesResponded: result.sourcesResponded,
            sourcesTotal: result.sourcesTotal,
            hint:
              result.books.length === 0
                ? 'No books found. Try different search terms or use essay_search for academic sources.'
                : undefined,
          };
        } catch (err) {
          const msg = (err as Error)?.message || 'Book search failed';
          return { type: 'error', error: msg };
        }
      },
    },
    {
      name: 'essay_search',
      description:
        'Search for academic essays and papers via Semantic Scholar. Returns papers with abstracts, citation counts, and links to open-access PDFs when available. Filters to papers with 5+ citations for quality. Good for: scholarly research, theoretical frameworks, art criticism, film theory, cultural studies.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Academic search terms (topics, theories, or research areas)',
          },
        },
        required: ['query'],
      },
      async execute({ query }: { query?: string }): Promise<EssaySearchResult | ToolErrorResult> {
        const q = String(query || '').trim();
        if (!q) {
          return { type: 'essay_search', essays: [] };
        }

        try {
          const { searchSemanticScholar } = await import('../services/semanticScholarService.js');
          const results = await searchSemanticScholar(q, 5);

          return {
            type: 'essay_search',
            essays: results.map((r) => ({
              title: r.title,
              authors: r.authors,
              abstract: r.abstract,
              citationCount: r.citationCount,
              year: r.year,
              isOpenAccess: r.isOpenAccess,
              pdfUrl: r.pdfUrl,
              source: r.source,
              sourceUrl: r.sourceUrl,
            })),
            hint:
              results.length === 0
                ? 'No papers found. Try broader or more academic search terms.'
                : undefined,
          };
        } catch (err) {
          const msg = (err as Error)?.message || 'Essay search failed';
          return { type: 'error', error: msg };
        }
      },
    },
    {
      name: 'film_search',
      description:
        'Search films by creative criteria: director, cinematographer, composer, actor, production company, film movement, decade, genre, language, or conceptual keywords. All filters are fully combinable. Supports movement-based searches (e.g. "French New Wave", "Third Cinema", "L.A. Rebellion"). Returns rich film cards with poster, full crew credits, and links to TMDB and Letterboxd. Good for: film research by director ("Kiarostami films"), era ("1970s American thrillers"), crew ("films shot by Roger Deakins"), movement ("Italian Neorealism"), or concept ("existential road movies").',
      parameters: {
        type: 'object',
        properties: {
          people: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Person names to search (directors, actors, cinematographers, composers). Role is auto-detected. AND logic: only films featuring ALL listed people.',
          },
          genres: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Genre terms: action, adventure, animation, comedy, crime, documentary, drama, fantasy, history, horror, music, mystery, romance, sci-fi, thriller, war, western.',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Conceptual/mood keywords resolved via TMDB keyword search. e.g. "existential", "dreamlike", "road movie", "heist".',
          },
          yearStart: {
            type: 'integer',
            description: 'Start year for release date range.',
          },
          yearEnd: {
            type: 'integer',
            description: 'End year for release date range.',
          },
          language: {
            type: 'string',
            description:
              'ISO 639-1 language code for original language filter. e.g. "fr", "ja", "ko", "fa".',
          },
          companies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Production company names. e.g. "A24", "Studio Ghibli", "Janus Films".',
          },
          movement: {
            type: 'string',
            description:
              'Film movement name. Available: French New Wave, Italian Neorealism, German Expressionism, Film Noir, Third Cinema, Japanese New Wave, Dogme 95, Hong Kong New Wave, Iranian New Wave, Cinema Novo, L.A. Rebellion, Parallel Cinema.',
          },
          limit: {
            type: 'integer',
            minimum: 5,
            maximum: 8,
            default: 6,
            description: 'Number of films to return (5-8).',
          },
        },
      },
      async execute(args: Record<string, unknown>): Promise<FilmSearchResult | ToolErrorResult> {
        const {
          people,
          genres,
          keywords,
          yearStart,
          yearEnd,
          language,
          companies,
          movement,
          limit,
        } = args as {
          people?: string[];
          genres?: string[];
          keywords?: string[];
          yearStart?: number;
          yearEnd?: number;
          language?: string;
          companies?: string[];
          movement?: string;
          limit?: number;
        };

        try {
          const { searchFilms } = await import('../services/filmSearchService.js');

          const filmContext = {
            apiKeys: context.apiKeys as { tmdb?: string } | undefined,
            session: context.session as { tmdbApiKey?: string } | undefined,
            getApiKey: context.getApiKey as ((key: string) => string | undefined) | undefined,
          };

          const result = await searchFilms(
            {
              people,
              genres,
              keywords,
              yearStart,
              yearEnd,
              language,
              companies,
              movement,
              limit,
            },
            filmContext
          );

          const films: FilmItem[] = result.films.map((f) => ({
            tmdbId: f.tmdbId,
            title: f.title,
            year: f.year,
            posterUrl: f.posterUrl,
            synopsis: f.synopsis,
            director: f.director,
            cinematographer: f.cinematographer,
            composer: f.composer,
            writer: f.writer,
            tmdbUrl: f.tmdbUrl,
            letterboxdUrl: f.letterboxdUrl,
            matchNote: f.matchNote,
          }));

          return {
            type: 'film_search',
            films,
            matchNotes: result.matchNotes,
            hint:
              films.length === 0
                ? result.hint ||
                  'No films found. Try different criteria or use moodboard_search for film stills.'
                : result.hint,
          };
        } catch (err) {
          const msg = (err as Error)?.message || 'Film search failed';
          return { type: 'error', error: `Film search failed: ${msg}` };
        }
      },
    },
  ];

  if (providerCaps && providerCaps.tools === 'none') {
    return [];
  }

  return tools;
}

// Cache for tool metadata when no context-specific filtering is applied
let cachedBaseMetadata: ToolMetadata[] | null = null;

function getToolMetadata(input: unknown = {}): ToolMetadata[] {
  const options = normalizeOptions(input);
  const featureFlags = (options && options.featureFlags) || {};
  const providerName = options && options.provider ? String(options.provider).toLowerCase() : null;

  // Use cached metadata if no filtering is needed
  const hasFiltering =
    (featureFlags as Record<string, boolean>).blockImageTools ||
    (featureFlags as Record<string, boolean>).blockVideoTools ||
    providerName;

  if (!hasFiltering && cachedBaseMetadata) {
    return cachedBaseMetadata;
  }

  const metadata = createTools(input).map((t) => ({
    name: t.name,
    description: t.description && t.description.trim() ? t.description : '—',
    // Return parameters unchanged – provider adapters may transform case.
    parameters: t.parameters,
  }));

  // Cache base metadata for future calls without filtering
  if (!hasFiltering) {
    cachedBaseMetadata = metadata;
  }

  return metadata;
}

export { createTools, getToolMetadata };

// CommonJS compatibility
module.exports = { createTools, getToolMetadata };
