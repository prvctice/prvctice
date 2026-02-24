/**
 * Academic connector handler.
 * Wraps semanticScholarService for paper search.
 * No API key required (optional SEMANTIC_SCHOLAR_API_KEY for higher limits).
 */

import { searchSemanticScholar } from '../../services/semanticScholarService.js';

async function search(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');
  const limit = typeof params.limit === 'number' ? params.limit : 10;

  const papers = await searchSemanticScholar(query, limit);
  return { papers };
}

export const academicHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { search };
