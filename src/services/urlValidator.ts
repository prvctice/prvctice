/**
 * URL Validation Service
 *
 * Tracks known-good URLs from tool results and web search citations,
 * then validates URLs in model output to catch hallucinated links.
 *
 * Valid sources: tool results, web search citations, safe domains.
 * Unknown-domain URLs are stripped with descriptive replacement text.
 */

/** Domains known to be safe (institutional, educational, well-known) */
export const SAFE_DOMAINS: ReadonlySet<string> = new Set([
  'wikipedia.org',
  'en.wikipedia.org',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'metmuseum.org',
  'www.metmuseum.org',
  'artic.edu',
  'www.artic.edu',
  'europeana.eu',
  'www.europeana.eu',
  'loc.gov',
  'www.loc.gov',
  'si.edu',
  'ids.si.edu',
  'openlibrary.org',
  'covers.openlibrary.org',
  'arxiv.org',
  'books.google.com',
  'www.googleapis.com',
  'semanticscholar.org',
  'www.semanticscholar.org',
  'api.semanticscholar.org',
  'themoviedb.org',
  'image.tmdb.org',
  'letterboxd.com',
  'commons.wikimedia.org',
]);

/**
 * Check if a hostname belongs to a safe domain.
 * Checks exact match in SAFE_DOMAINS, .gov suffix, .edu suffix,
 * and parent domain (e.g. tile.loc.gov -> loc.gov).
 */
export function isDomainSafe(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (SAFE_DOMAINS.has(lower)) return true;
  if (lower.endsWith('.gov')) return true;
  if (lower.endsWith('.edu')) return true;

  // Check parent domain: tile.loc.gov -> loc.gov
  const parts = lower.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (SAFE_DOMAINS.has(parent)) return true;
  }

  return false;
}

/** Regex for extracting URLs from text content */
const URL_REGEX = /https?:\/\/[^\s)\]>,"']+/g;

/**
 * Extract URLs from text content.
 * Normalizes by stripping trailing punctuation, returns deduplicated array.
 */
export function extractUrlsFromText(content: string): string[] {
  const matches = content.match(URL_REGEX);
  if (!matches) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  for (const raw of matches) {
    // Strip trailing punctuation that's likely not part of the URL
    const cleaned = raw.replace(/[.,;:!?]+$/, '');
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      results.push(cleaned);
    }
  }

  return results;
}

/** URL validity category */
export type UrlValidity = 'tool_result' | 'web_search' | 'safe_domain' | 'unknown';

/** History message shape (minimal for URL extraction) */
interface HistoryMessage {
  role: string;
  content: unknown;
}

/**
 * Tracks known-good URLs collected from tool results and web search citations.
 * Validates URLs in model output against these sources plus safe domain list.
 */
export class ConversationUrlTracker {
  private readonly toolUrls: Set<string> = new Set();
  private readonly webSearchUrls: Set<string> = new Set();

  constructor(historyMessages?: HistoryMessage[]) {
    if (!Array.isArray(historyMessages)) return;

    for (const msg of historyMessages) {
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        const urls = extractUrlsFromText(msg.content);
        for (const url of urls) {
          this.toolUrls.add(url);
        }
      }
    }
  }

  /** Add URLs discovered in a tool execution result */
  addToolResultUrls(toolName: string, resultContent: string): void {
    const urls = extractUrlsFromText(resultContent);
    for (const url of urls) {
      this.toolUrls.add(url);
    }
  }

  /** Add URLs from web search citations */
  addWebSearchUrls(urls: string[]): void {
    for (const url of urls) {
      if (url) this.webSearchUrls.add(url);
    }
  }

  /** Check if a URL is valid and return its source category */
  isUrlValid(url: string): UrlValidity {
    if (this.toolUrls.has(url)) return 'tool_result';
    if (this.webSearchUrls.has(url)) return 'web_search';

    try {
      const parsed = new URL(url);
      if (isDomainSafe(parsed.hostname)) return 'safe_domain';
    } catch {
      return 'unknown';
    }

    return 'unknown';
  }

  /**
   * Strip or pass through a URL in model output.
   * For markdown links [Title](url), preserves link text.
   * For bare URLs, replaces with descriptive text.
   */
  stripOrFlagUrl(markdownLink: string, rawUrl: string): string {
    const validity = this.isUrlValid(rawUrl);
    if (validity !== 'unknown') return markdownLink;

    // Markdown link pattern: [Title](url)
    const mdMatch = markdownLink.match(/^\[([^\]]*)\]\(.*\)$/);
    if (mdMatch) {
      return `${mdMatch[1]} _(link removed: unverified source)_`;
    }

    // Bare URL
    return '[link removed: unverified source]';
  }
}

// CommonJS compatibility
module.exports = {
  ConversationUrlTracker,
  extractUrlsFromText,
  isDomainSafe,
  SAFE_DOMAINS,
};
