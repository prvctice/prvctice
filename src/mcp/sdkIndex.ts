'use strict';

import fs from 'node:fs';
import path from 'node:path';

// ── Data model ──────────────────────────────────────────────────────────────

interface SdkMethod {
  name: string; // "prvctice.audio.tone(frequency, duration, opts)"
  shortName: string; // "tone"
  content: string; // Full markdown for this method
}

interface SdkSection {
  name: string; // "Audio"
  slug: string; // "audio"
  description: string; // First paragraph after ## heading
  methods: SdkMethod[];
  content: string; // Full section markdown
  searchText: string; // Lowercased concatenation for matching
}

interface SearchResult {
  section: SdkSection;
  score: number;
  matchedMethods: SdkMethod[];
}

// ── Alias map for common search terms ───────────────────────────────────────

const ALIASES: Record<string, readonly string[]> = {
  play: ['audio', 'tone', 'media'],
  sound: ['audio', 'tone'],
  record: ['audio', 'recorder'],
  timer: ['ui', 'timer'],
  clock: ['time', 'clock'],
  save: ['storage', 'set'],
  load: ['storage', 'get'],
  persist: ['storage'],
  fetch: ['web'],
  http: ['web'],
  request: ['web'],
  animate: ['animation'],
  spring: ['animation'],
  tween: ['animation'],
  button: ['ui', 'form'],
  input: ['ui', 'form', 'input'],
  modal: ['ui', 'confirm'],
  dialog: ['ui', 'confirm'],
  toast: ['notifications'],
  notify: ['notifications'],
  alert: ['notifications'],
  chart: ['charts', 'sparkline'],
  graph: ['charts', 'sparkline'],
  route: ['navigation', 'router'],
  navigate: ['navigation'],
  tab: ['ui', 'tabs'],
  drop: ['ui', 'dropzone'],
  upload: ['ui', 'dropzone', 'files'],
  download: ['media'],
  stream: ['streaming'],
  canvas: ['ui', 'canvas'],
  draw: ['ui', 'canvas'],
  image: ['image-processing', 'vision'],
  photo: ['image-processing', 'camera'],
  video: ['video', 'camera'],
  gif: ['gif-encoder'],
  movie: ['movies', 'films'],
  film: ['films'],
  book: ['books'],
  search: ['wikipedia', 'youtube', 'books', 'movies', 'music', 'art'],
  weather: ['weather'],
  news: ['news'],
  stock: ['markets'],
  crypto: ['markets'],
  copy: ['clipboard'],
  paste: ['clipboard'],
  file: ['files', 'virtual-file-system'],
  calendar: ['calendar'],
  date: ['calendar', 'time'],
  gps: ['location'],
  position: ['location'],
  midi: ['audio'],
  synth: ['audio', 'tone'],
  slider: ['forms'],
  form: ['forms'],
  recorder: ['audio', 'camera'],
  broadcast: ['broadcast'],
  message: ['broadcast', 'chat'],
  skill: ['skills'],
};

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'about',
  'between',
  'through',
  'after',
  'before',
  'above',
  'below',
  'and',
  'or',
  'but',
  'not',
  'so',
  'if',
  'then',
  'than',
  'too',
  'very',
  'just',
  'how',
  'what',
  'when',
  'where',
  'who',
  'which',
  'that',
  'this',
  'it',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'them',
  'its',
  'use',
  'using',
  'want',
  'need',
  'get',
  'make',
]);

// ── Parsing ─────────────────────────────────────────────────────────────────

let cachedSections: SdkSection[] | null = null;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractMethodName(heading: string): string {
  // "prvctice.audio.tone(frequency, duration, opts)" -> "tone"
  const match = heading.match(/prvctice\.\w+\.(\w+)/);
  if (match?.[1]) return match[1];
  // "prvctice.onReady(callback)" -> "onReady"
  const topLevel = heading.match(/prvctice\.(\w+)/);
  if (topLevel?.[1]) return topLevel[1];
  return heading.trim();
}

function parseSections(): SdkSection[] {
  const refPath = path.join(__dirname, '..', '..', 'documentation', 'sdk', 'reference.md');
  const raw = fs.readFileSync(refPath, 'utf8');

  const sectionSplits = raw.split(/^## /m);
  const sections: SdkSection[] = [];

  for (const block of sectionSplits) {
    const lines = block.split('\n');
    const name = (lines[0] ?? '').trim();

    // Skip the preamble and ToC
    if (!name || name === 'Table of Contents' || name.startsWith('#')) continue;

    const slug = slugify(name);
    const bodyLines = lines.slice(1);
    const content = bodyLines.join('\n').trim();

    // Description: text before first ### or --- (whichever comes first)
    let description = '';
    const descLines: string[] = [];
    for (const line of bodyLines) {
      if (line.startsWith('### ') || line.startsWith('---')) break;
      descLines.push(line);
    }
    description = descLines.join('\n').trim();

    // Parse methods on ### boundaries
    const methods: SdkMethod[] = [];
    const methodSplits = content.split(/^### /m);
    for (let i = 1; i < methodSplits.length; i++) {
      const methodBlock = methodSplits[i] ?? '';
      const methodLines = methodBlock.split('\n');
      const methodHeading = (methodLines[0] ?? '').trim();
      const methodContent = `### ${methodBlock.trim()}`;
      const shortName = extractMethodName(methodHeading);

      methods.push({ name: methodHeading, shortName, content: methodContent });
    }

    // Build search text: name + description + method names + param names
    const paramNames =
      content
        .match(/\|\s*(\w+)\s*\|/g)
        ?.map((m) => m.replace(/\|/g, '').trim())
        .filter(
          (p) => !['Parameter', 'Type', 'Required', 'Description', 'Option', 'Default'].includes(p)
        ) ?? [];

    const searchText = [
      name,
      description,
      ...methods.map((m) => m.name),
      ...methods.map((m) => m.shortName),
      ...paramNames,
    ]
      .join(' ')
      .toLowerCase();

    sections.push({ name, slug, description, methods, content, searchText });
  }

  return sections;
}

// ── Public API ──────────────────────────────────────────────────────────────

function getSections(): readonly SdkSection[] {
  if (!cachedSections) {
    cachedSections = parseSections();
  }
  return cachedSections;
}

function searchSdk(query: string, limit = 3): SearchResult[] {
  const sections = getSections();
  const clampedLimit = Math.max(1, Math.min(10, limit));

  // Tokenize, drop stopwords, expand aliases
  const rawTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const tokens = rawTokens.filter((t) => !STOPWORDS.has(t));

  // If all tokens were stopwords, fall back to raw tokens
  const searchTokens = tokens.length > 0 ? tokens : rawTokens;

  // Expand aliases
  const expandedTokens = new Set(searchTokens);
  for (const token of searchTokens) {
    const aliases = ALIASES[token];
    if (aliases) {
      for (const alias of aliases) {
        expandedTokens.add(alias);
      }
    }
  }

  const results: SearchResult[] = [];

  for (const section of sections) {
    let score = 0;
    const matchedMethods: SdkMethod[] = [];

    for (const token of expandedTokens) {
      // Exact slug or name match (highest value)
      if (section.slug === token || section.name.toLowerCase() === token) {
        score += 10;
      }

      // Method shortName match
      for (const method of section.methods) {
        if (method.shortName.toLowerCase() === token) {
          score += 2;
          if (!matchedMethods.includes(method)) {
            matchedMethods.push(method);
          }
        }
      }

      // General searchText match
      if (section.searchText.includes(token)) {
        score += 1;
      }
    }

    if (score > 0) {
      results.push({ section, score, matchedMethods });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, clampedLimit);
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    const sections = getSections();
    const sectionNames = sections.map((s) => s.name).join(', ');
    return `No matching SDK sections found.\n\nAvailable sections: ${sectionNames}`;
  }

  const parts: string[] = [];

  for (const result of results) {
    const { section, matchedMethods } = result;

    // For large sections with specific method matches, return only matched methods
    const sectionLines = section.content.split('\n').length;
    if (sectionLines > 150 && matchedMethods.length > 0) {
      parts.push(`## ${section.name}\n\n${section.description}\n`);
      for (const method of matchedMethods) {
        parts.push(method.content);
      }
    } else {
      parts.push(`## ${section.name}\n\n${section.content}`);
    }
  }

  return parts.join('\n\n---\n\n');
}

export { getSections, searchSdk, formatSearchResults };
export type { SdkSection, SdkMethod, SearchResult };
