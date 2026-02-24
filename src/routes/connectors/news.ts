/**
 * News connector handler using rss-parser.
 * Supports both raw RSS feed parsing and topic-based search via Google News RSS.
 * No API key required -- RSS feeds are public.
 */

import Parser from 'rss-parser';
import axios from 'axios';

const parser = new Parser({ timeout: 10_000 });

/**
 * Sanitize XML by escaping bare `&` that aren't valid XML entities.
 * Google News RSS feeds often contain unescaped `&` in article titles/content.
 */
function sanitizeXml(xml: string): string {
  return xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, '&amp;');
}

/**
 * Fetch an RSS URL and parse it, sanitizing malformed XML first.
 * Falls back to direct parseURL if the manual fetch fails.
 */
async function safeParseFeed(url: string): Promise<Parser.Output<Record<string, unknown>>> {
  const response = await axios.get<string>(url, {
    timeout: 10_000,
    responseType: 'text',
    headers: { 'User-Agent': 'prvctice/1.0 RSS Reader' },
  });
  const sanitized = sanitizeXml(response.data);
  return parser.parseString(sanitized) as Promise<Parser.Output<Record<string, unknown>>>;
}

const MAX_CONTENT_LENGTH = 500;
const DEFAULT_ITEM_LIMIT = 20;

async function fetchFeed(params: Record<string, unknown>): Promise<unknown> {
  const { feedUrl, limit } = params;

  if (typeof feedUrl !== 'string' || feedUrl.trim().length === 0) {
    throw new Error('feedUrl is required and must be a non-empty string');
  }

  if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
    throw new Error('feedUrl must use http:// or https:// protocol');
  }

  const itemLimit = typeof limit === 'number' && limit > 0 ? limit : DEFAULT_ITEM_LIMIT;

  const feed = await safeParseFeed(feedUrl);

  return {
    title: feed.title,
    description: feed.description,
    link: feed.link,
    items: feed.items.slice(0, itemLimit).map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content:
        item.contentSnippet ||
        (item.content ? item.content.substring(0, MAX_CONTENT_LENGTH) : undefined),
      categories: item.categories,
    })),
  };
}

/**
 * Topic-based news search using Google News RSS.
 * Returns articles matching a search query.
 */
async function searchNews(params: Record<string, unknown>): Promise<unknown> {
  const query = String(params.query || '').trim();
  if (!query) throw new Error('query is required');

  const limit =
    typeof params.limit === 'number' && params.limit > 0 ? params.limit : DEFAULT_ITEM_LIMIT;

  // Google News RSS search endpoint
  const encodedQuery = encodeURIComponent(query);
  const feedUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

  const feed = await safeParseFeed(feedUrl);

  return {
    query,
    items: feed.items.slice(0, limit).map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content:
        item.contentSnippet ||
        (item.content ? item.content.substring(0, MAX_CONTENT_LENGTH) : undefined),
      source: item.creator || extractSource(item.title),
    })),
  };
}

/**
 * Extract source name from Google News title format: "Article Title - Source Name"
 */
function extractSource(title: string | undefined): string {
  if (!title) return '';
  const parts = title.split(' - ');
  return parts.length > 1 ? (parts[parts.length - 1] ?? '').trim() : '';
}

/**
 * Get top headlines via Google News RSS.
 */
async function headlines(params: Record<string, unknown>): Promise<unknown> {
  const limit =
    typeof params.limit === 'number' && params.limit > 0 ? params.limit : DEFAULT_ITEM_LIMIT;

  const rawTopic = String(params.topic || '').toUpperCase();
  // Google News topic codes -- only these are valid RSS section paths
  const VALID_TOPICS = new Set([
    'WORLD',
    'NATION',
    'BUSINESS',
    'TECHNOLOGY',
    'ENTERTAINMENT',
    'SPORTS',
    'SCIENCE',
    'HEALTH',
  ]);
  const topic = VALID_TOPICS.has(rawTopic) ? rawTopic : '';
  const topicPath = topic ? `/headlines/section/topic/${topic}` : '';
  const feedUrl = `https://news.google.com/rss${topicPath}?hl=en-US&gl=US&ceid=US:en`;

  const feed = await safeParseFeed(feedUrl);

  return {
    topic: topic || 'top',
    items: feed.items.slice(0, limit).map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content:
        item.contentSnippet ||
        (item.content ? item.content.substring(0, MAX_CONTENT_LENGTH) : undefined),
      source: item.creator || extractSource(item.title),
    })),
  };
}

export const newsHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { fetch: fetchFeed, search: searchNews, headlines };
