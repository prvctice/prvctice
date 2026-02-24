/**
 * Smithsonian connector handler.
 * Wraps smithsonianService for Smithsonian Open Access search.
 * Requires API key — throws explicit error when not configured.
 */

import { searchSmithsonian } from '../../services/smithsonianService.js';
import type { ServiceKeys } from './index.js';

async function search(
  params: Record<string, unknown>,
  _appId: string,
  _req: unknown,
  serviceKeys: ServiceKeys
): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;

  if (!serviceKeys.smithsonian) {
    throw new Error('Smithsonian API key not configured. Add your key in Settings > Services.');
  }

  const context = { apiKeys: { smithsonian: serviceKeys.smithsonian } };
  const results = await searchSmithsonian(query, limit, context);
  return { results };
}

export const smithsonianHandler: Readonly<
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
