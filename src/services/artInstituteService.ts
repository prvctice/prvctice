/**
 * Art Institute of Chicago API Service
 * https://api.artic.edu/docs/
 * Free, no API key required
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://api.artic.edu/api/v1';
const IIIF_URL = 'https://www.artic.edu/iiif/2';
const TIMEOUT = 10000;

export interface ArtworkResult {
  url: string;
  title: string;
  artist: string;
  date: string;
  medium: string;
  source: string;
  sourceUrl: string;
}

interface ArtworkResponse {
  id: number;
  title?: string;
  artist_display?: string;
  date_display?: string;
  image_id?: string;
  medium_display?: string;
  is_public_domain?: boolean;
  thumbnail?: { width?: number; height?: number } | null;
}

interface SearchResponse {
  data?: ArtworkResponse[];
}

/**
 * Search Art Institute of Chicago collection for images
 */
export async function searchArtInstitute(
  query: string,
  limit: number = 8
): Promise<ArtworkResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const response = await axios.get<SearchResponse>(`${BASE_URL}/artworks/search`, {
      params: {
        q: query.trim(),
        limit: limit * 2, // Fetch extra in case some lack images
        fields:
          'id,title,artist_display,date_display,image_id,medium_display,is_public_domain,thumbnail',
      },
      timeout: TIMEOUT,
    });

    const artworks = response.data?.data || [];
    const results: ArtworkResult[] = [];

    for (const artwork of artworks) {
      if (results.length >= limit) break;

      // Only include artworks with public domain images that have thumbnails
      // (non-public-domain images return 403 from the IIIF server)
      if (artwork.image_id && artwork.is_public_domain !== false && artwork.thumbnail) {
        // Construct IIIF image URL (full size, max 843px)
        const imageUrl = `${IIIF_URL}/${artwork.image_id}/full/843,/0/default.jpg`;

        results.push({
          url: imageUrl,
          title: artwork.title || 'Untitled',
          artist: artwork.artist_display || 'Unknown',
          date: artwork.date_display || '',
          medium: artwork.medium_display || '',
          source: 'Art Institute of Chicago',
          sourceUrl: `https://www.artic.edu/artworks/${artwork.id}`,
        });
      }
    }

    logger.debug(`[artInstitute] Found ${results.length} images for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[artInstitute] Search failed:', { error: message });
    return [];
  }
}

export default { searchArtInstitute };
