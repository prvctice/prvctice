/**
 * Archetype Selector — deterministic keyword matching.
 *
 * Maps user prompts to template archetypes without an LLM call.
 * Falls back to 'hero-stat' when no keywords match.
 */

import type { ArchetypeId } from '../templates/types.js';

interface KeywordRule {
  readonly archetype: ArchetypeId;
  readonly keywords: readonly string[];
}

const RULES: readonly KeywordRule[] = [
  {
    archetype: 'media-card',
    keywords: [
      'movie',
      'film',
      'album',
      'art',
      'photo',
      'poster',
      'recipe',
      'artwork',
      'painting',
      'cover',
      'book',
      'gallery',
      'card',
    ],
  },
  {
    archetype: 'list',
    keywords: [
      'news',
      'headlines',
      'scores',
      'standings',
      'feed',
      'playlist',
      'results',
      'articles',
      'todo',
      'tasks',
      'bookmarks',
      'notes',
      'log',
      'journal',
      'diary',
      'inbox',
      'links',
      'entries',
      'saved',
      'history',
      'youtube',
      'videos',
      'wikipedia',
      'lookup',
    ],
  },
  {
    archetype: 'dashboard',
    keywords: [
      'dashboard',
      'monitor',
      'portfolio',
      'overview',
      'analytics',
      'multi',
      'summary',
      'stats',
      'metrics',
      'tracker',
      'fitness',
      'health',
      'workout',
      'budget',
      'spending',
      'expense',
    ],
  },
  {
    archetype: 'tool',
    keywords: [
      'calculator',
      'converter',
      'timer',
      'stopwatch',
      'tool',
      'search',
      'picker',
      'generator',
      'synth',
      'synthesizer',
      'piano',
      'drum',
      'audio',
      'recorder',
      'record',
      'music',
      'voice',
      'microphone',
      'sound',
      'beat',
      'sampler',
      'sequencer',
      'color',
      'random',
      'dice',
      'roll',
      'flashcard',
      'quiz',
      'trivia',
      'pomodoro',
      'habit',
      'counter',
      'tally',
      'translator',
      'translate',
      'password',
      'morse',
      'breathing',
      'breathe',
      'emoji',
      'ascii',
      'cipher',
      'encode',
      'decode',
      'draw',
      'paint',
      'sketch',
      'whiteboard',
      'canvas',
      'writer',
      'madlib',
      'bingo',
      'hangman',
      'metronome',
      'tuner',
      'scratchpad',
      'notepad',
    ],
  },
  {
    archetype: 'viz',
    keywords: [
      'chart',
      'graph',
      'sparkline',
      'gauge',
      'viz',
      'trend',
      'progress',
      'ring',
      'visualization',
      'pie',
      'bar',
      'donut',
      'histogram',
      'heatmap',
    ],
  },
  {
    archetype: 'split-panel',
    keywords: ['compare', 'versus', 'side-by-side', 'dual', 'before', 'after', 'diff', 'unit'],
  },
  {
    archetype: 'hero-stat',
    keywords: [
      'weather',
      'temp',
      'crypto',
      'price',
      'stock',
      'countdown',
      'clock',
      'time',
      'quote',
      'bitcoin',
      'ethereum',
      'forex',
      'currency',
      'motivation',
      'affirmation',
      'horoscope',
      'tip',
      'fact',
      'joke',
      'riddle',
      'fortune',
    ],
  },
];

const DEFAULT_ARCHETYPE: ArchetypeId = 'hero-stat';

/**
 * Select the best archetype for a user prompt via keyword matching.
 * Returns the archetype with the most keyword hits, or 'hero-stat' if none match.
 */
export function selectArchetype(prompt: string): ArchetypeId {
  const words = prompt.toLowerCase().split(/\s+/);

  let bestArchetype: ArchetypeId = DEFAULT_ARCHETYPE;
  let bestScore = 0;

  for (let i = 0; i < RULES.length; i++) {
    const rule = RULES[i]!;
    let score = 0;
    for (let k = 0; k < rule.keywords.length; k++) {
      const keyword = rule.keywords[k]!;
      for (let w = 0; w < words.length; w++) {
        if (words[w]!.includes(keyword)) {
          score++;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = rule.archetype;
    }
  }

  return bestArchetype;
}
