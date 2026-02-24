/**
 * YouTube connector handler.
 * Wraps youtubeService for video search.
 * Uses user-provided YouTube key from Settings > Services, falls back to YOUTUBE_API_KEY env var.
 */

import { searchYouTube } from '../../services/youtubeService.js';
import type { ServiceKeys } from './index.js';

async function search(
  params: Record<string, unknown>,
  _appId: string,
  _req: unknown,
  serviceKeys: ServiceKeys = {}
): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 5;

  const apiKey = serviceKeys.youtube || process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube API key required. Add one in Settings → Services.');
  }

  const videos = await searchYouTube(query, limit, { apiKey });
  return { videos };
}

export const youtubeHandler = { search };
