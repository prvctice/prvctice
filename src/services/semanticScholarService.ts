/**
 * Semantic Scholar Academic Graph API Service
 * https://api.semanticscholar.org/api-docs/graph
 * Free, optional API key for higher rate limits
 */
import axios from 'axios';
import logger from '../utils/logger.js';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';
const TIMEOUT = 10000;
const FIELDS =
  'title,authors,abstract,citationCount,year,isOpenAccess,openAccessPdf,url,externalIds';

export interface EssayResult {
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

interface SemanticScholarAuthor {
  authorId?: string;
  name?: string;
}

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  authors?: SemanticScholarAuthor[];
  abstract?: string | null;
  citationCount?: number;
  year?: number | null;
  isOpenAccess?: boolean;
  openAccessPdf?: { url?: string } | null;
  url?: string;
  externalIds?: Record<string, string>;
}

interface SemanticScholarResponse {
  total?: number;
  data?: SemanticScholarPaper[];
}

/**
 * Search Semantic Scholar for academic papers.
 * Uses minCitationCount=5 to filter noise (user decision).
 * Supports optional SEMANTIC_SCHOLAR_API_KEY env var for higher rate limits.
 */
export async function searchSemanticScholar(
  query: string,
  limit: number = 10
): Promise<EssayResult[]> {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const headers: Record<string, string> = {};
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await axios.get<SemanticScholarResponse>(BASE_URL, {
      params: {
        query: query.trim(),
        fields: FIELDS,
        limit,
        minCitationCount: 5,
      },
      headers,
      timeout: TIMEOUT,
    });

    const papers = response.data?.data || [];
    const results: EssayResult[] = [];

    for (const paper of papers) {
      if (results.length >= limit) break;

      const authors = Array.isArray(paper.authors)
        ? paper.authors.map((a) => a.name || '').filter(Boolean)
        : [];

      const sourceUrl =
        paper.url ||
        (paper.paperId ? `https://www.semanticscholar.org/paper/${paper.paperId}` : '');

      results.push({
        title: paper.title || 'Untitled',
        authors,
        abstract: paper.abstract || '',
        citationCount: paper.citationCount ?? 0,
        year: paper.year ?? null,
        isOpenAccess: paper.isOpenAccess ?? false,
        pdfUrl: paper.openAccessPdf?.url || null,
        source: 'Semantic Scholar',
        sourceUrl,
      });
    }

    logger.debug(`[semanticScholar] Found ${results.length} papers for query: ${query}`);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[semanticScholar] Search failed:', { error: message });
    return [];
  }
}

export default { searchSemanticScholar };
