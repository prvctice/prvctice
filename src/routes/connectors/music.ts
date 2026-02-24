/**
 * Music connector handler.
 * Wraps discogsService for music search.
 * Uses user-provided Discogs token from Settings > Services, falls back to DISCOGS_TOKEN env var.
 */

import { searchDiscogs } from '../../services/discogsService.js';
import type { ServiceKeys } from './index.js';

async function search(
  params: Record<string, unknown>,
  _appId: string,
  _req: unknown,
  serviceKeys: ServiceKeys = {}
): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;

  const token = serviceKeys.discogs || process.env.DISCOGS_TOKEN;
  if (!token) {
    throw new Error('Discogs token required. Add one in Settings → Services.');
  }

  const results = await searchDiscogs(query, limit, {
    apiKeys: { discogs: token },
  });

  return { results };
}

export const musicHandler = { search };
