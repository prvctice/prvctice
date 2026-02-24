/**
 * Smithsonian Open Access API Service
 * https://api.si.edu/openaccess/api/v1.0
 * Requires free API key from api.data.gov - optional source
 * Supplemental source: fewer images per query, 5-second timeout
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://api.si.edu/openaccess/api/v1.0';
const TIMEOUT = 5000;

export interface SmithsonianResult {
  url: string;
  thumbnailUrl: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  sourceUrl: string;
}

export interface SmithsonianContext {
  apiKeys?: { smithsonian?: string };
  session?: { smithsonianApiKey?: string };
  getApiKey?: (key: string) => string | undefined;
}

interface SmithsonianResource {
  label?: string;
  url?: string;
  width?: number;
  height?: number;
}

interface SmithsonianMedia {
  guid?: string;
  type?: string;
  resources?: SmithsonianResource[];
}

interface SmithsonianOnlineMedia {
  media?: SmithsonianMedia[];
}

interface SmithsonianFreetextEntry {
  label?: string;
  content?: string;
}

interface SmithsonianRow {
  id?: string;
  title?: string;
  url?: string;
  content?: {
    freetext?: {
      name?: SmithsonianFreetextEntry[];
      date?: SmithsonianFreetextEntry[];
      objectType?: SmithsonianFreetextEntry[];
    };
    descriptiveNonRepeating?: {
      online_media?: SmithsonianOnlineMedia;
      record_link?: string;
    };
  };
}

interface SmithsonianSearchResponse {
  status?: number;
  responseCode?: number;
  response?: {
    rowCount?: number;
    rows?: SmithsonianRow[];
  };
}

/**
 * Check if Smithsonian is available (API key configured)
 */
export function isAvailable(context: SmithsonianContext = {}): boolean {
  return !!resolveApiKey(context);
}

/**
 * Resolve Smithsonian API key from context (user-provided keys only)
 */
export function resolveApiKey(context: SmithsonianContext = {}): string | null {
  if (context.apiKeys?.smithsonian) return context.apiKeys.smithsonian;
  if (context.session?.smithsonianApiKey) return context.session.smithsonianApiKey;
  if (typeof context.getApiKey === 'function') {
    const key = context.getApiKey('smithsonian');
    if (key) return key;
  }
  return null;
}

/**
 * Extract the best image URL from a Smithsonian media entry's resources.
 * Prefers "Screen Image" label, falls back to first resource with a URL.
 */
function extractImageUrl(resources: SmithsonianResource[]): string | null {
  // Prefer "Screen Image" for good quality without being too large
  const screenImage = resources.find((r) => r.label === 'Screen Image' && r.url);
  if (screenImage?.url) return screenImage.url;

  // Fall back to first resource with a URL
  const firstWithUrl = resources.find((r) => r.url);
  return firstWithUrl?.url || null;
}

/**
 * Extract the thumbnail URL from a Smithsonian media entry's resources.
 * Uses "Thumbnail" label, falls back to extractImageUrl.
 */
function extractThumbnailUrl(resources: SmithsonianResource[]): string | null {
  const thumbnail = resources.find((r) => r.label === 'Thumbnail' && r.url);
  if (thumbnail?.url) return thumbnail.url;

  return extractImageUrl(resources);
}

/**
 * Extract artist name from Smithsonian freetext name entries.
 */
function extractArtist(nameEntries?: SmithsonianFreetextEntry[]): string {
  if (!nameEntries || nameEntries.length === 0) return 'Unknown';

  const artistEntry = nameEntries.find((entry) => entry.label === 'Artist');
  if (artistEntry?.content) return artistEntry.content;

  // Fall back to first name entry
  return nameEntries[0]?.content || 'Unknown';
}

/**
 * Search Smithsonian Open Access for images across all 19 museums
 */
export async function searchSmithsonian(
  query: string,
  limit: number = 4,
  context: SmithsonianContext = {}
): Promise<SmithsonianResult[]> {
  const apiKey = resolveApiKey(context);

  if (!apiKey) {
    logger.debug('[smithsonian] No API key configured, skipping');
    return [];
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const response = await axios.get<SmithsonianSearchResponse>(`${BASE_URL}/search`, {
      params: {
        q: query.trim(),
        rows: limit * 2, // Fetch extra to filter items without images
        api_key: apiKey,
      },
      timeout: TIMEOUT,
    });

    const rows = response.data?.response?.rows || [];
    const results: SmithsonianResult[] = [];

    for (const row of rows) {
      if (results.length >= limit) break;

      // Deep optional chaining for the nested response structure
      const media = row.content?.descriptiveNonRepeating?.online_media?.media;
      if (!media || media.length === 0) continue;

      // Find first media entry with type "Images"
      const imageMedia = media.find((m) => m.type === 'Images');
      if (!imageMedia?.resources || imageMedia.resources.length === 0) continue;

      const imageUrl = extractImageUrl(imageMedia.resources);
      if (!imageUrl) continue;

      const thumbnailUrl = extractThumbnailUrl(imageMedia.resources) || imageUrl;

      results.push({
        url: imageUrl,
        thumbnailUrl,
        title: row.title || 'Untitled',
        artist: extractArtist(row.content?.freetext?.name),
        date: row.content?.freetext?.date?.[0]?.content || '',
        source: 'Smithsonian',
        sourceUrl:
          row.content?.descriptiveNonRepeating?.record_link ||
          (row.url ? `https://www.si.edu/object/${row.url}` : ''),
      });
    }

    logger.debug(`[smithsonian] Found ${results.length} images for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[smithsonian] Search failed:', { error: message });
    return [];
  }
}

export default { searchSmithsonian, isAvailable, resolveApiKey };
