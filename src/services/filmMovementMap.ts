/**
 * Film Movement Map
 * Maps cinematic movements to associated directors, genres, keywords, and era boundaries.
 * Used by filmSearchService to resolve movement-based queries into TMDB filters.
 */

export interface MovementDefinition {
  name: string;
  directors: string[];
  genreIds: number[];
  keywordTerms: string[];
  yearRange?: { start?: number; end?: number };
}

/**
 * 12 canonical film movements with their associated metadata.
 * Genre IDs follow TMDB's genre system.
 * Keys are lowercase slug format for consistent lookup.
 */
export const MOVEMENT_MAP: Record<string, MovementDefinition> = {
  'french-new-wave': {
    name: 'French New Wave',
    directors: ['Godard', 'Truffaut', 'Rivette', 'Rohmer', 'Varda', 'Resnais', 'Chabrol', 'Marker'],
    genreIds: [18], // drama
    keywordTerms: ['french new wave'],
    yearRange: { start: 1958, end: 1975 },
  },
  'italian-neorealism': {
    name: 'Italian Neorealism',
    directors: ['De Sica', 'Rossellini', 'Visconti', 'Pasolini'],
    genreIds: [18], // drama
    keywordTerms: ['neorealism'],
    yearRange: { start: 1943, end: 1960 },
  },
  'german-expressionism': {
    name: 'German Expressionism',
    directors: ['Lang', 'Murnau', 'Wiene', 'Pabst'],
    genreIds: [27, 18], // horror, drama
    keywordTerms: ['expressionism'],
    yearRange: { start: 1920, end: 1933 },
  },
  'film-noir': {
    name: 'Film Noir',
    directors: ['Wilder', 'Huston', 'Hawks', 'Lang'],
    genreIds: [80, 53, 18], // crime, thriller, drama
    keywordTerms: ['film noir'],
    yearRange: { start: 1940, end: 1960 },
  },
  'third-cinema': {
    name: 'Third Cinema',
    directors: ['Solanas', 'Getino', 'Rocha', 'Birri', 'Cisse', 'Gerima', 'Maldoror'],
    genreIds: [18], // drama
    keywordTerms: ['third cinema', 'political cinema'],
    yearRange: { start: 1960, end: 1990 },
  },
  'japanese-new-wave': {
    name: 'Japanese New Wave',
    directors: ['Oshima', 'Imamura', 'Suzuki', 'Teshigahara', 'Shinoda'],
    genreIds: [18], // drama
    keywordTerms: ['japanese new wave'],
    yearRange: { start: 1956, end: 1975 },
  },
  'dogme-95': {
    name: 'Dogme 95',
    directors: ['von Trier', 'Vinterberg', 'Levring', 'Kragh-Jacobsen'],
    genreIds: [18], // drama
    keywordTerms: ['dogme 95'],
    yearRange: { start: 1995, end: 2005 },
  },
  'hong-kong-new-wave': {
    name: 'Hong Kong New Wave',
    directors: ['Tsui Hark', 'Ann Hui', 'John Woo', 'Wong Kar-wai', 'Patrick Tam'],
    genreIds: [18, 80], // drama, crime
    keywordTerms: ['hong kong new wave'],
    yearRange: { start: 1979, end: 1995 },
  },
  'iranian-new-wave': {
    name: 'Iranian New Wave',
    directors: ['Kiarostami', 'Panahi', 'Makhmalbaf', 'Farhadi'],
    genreIds: [18], // drama
    keywordTerms: ['iranian cinema'],
    yearRange: { start: 1960 },
  },
  'cinema-novo': {
    name: 'Cinema Novo',
    directors: ['Rocha', 'Diegues', 'Andrade', 'Pereira dos Santos'],
    genreIds: [18], // drama
    keywordTerms: ['cinema novo'],
    yearRange: { start: 1960, end: 1975 },
  },
  'la-rebellion': {
    name: 'L.A. Rebellion',
    directors: ['Burnett', 'Gerima', 'Dash', 'Clark', 'Woodberry'],
    genreIds: [18], // drama
    keywordTerms: ['l.a. rebellion'],
    yearRange: { start: 1967, end: 1989 },
  },
  'parallel-cinema': {
    name: 'Parallel Cinema',
    directors: ['Ray', 'Sen', 'Kaul', 'Shahani', 'Ghatak'],
    genreIds: [18], // drama
    keywordTerms: ['parallel cinema', 'indian new wave'],
    yearRange: { start: 1950, end: 1990 },
  },
};

/**
 * Look up a movement by name with fuzzy matching.
 * Tries exact slug match first, then partial match on display name.
 */
export function getMovementFilters(movementName: string): MovementDefinition | null {
  if (!movementName || typeof movementName !== 'string') return null;

  const normalized = movementName.toLowerCase().trim();

  // Exact slug match
  if (MOVEMENT_MAP[normalized]) {
    return MOVEMENT_MAP[normalized];
  }

  // Try converting input to slug format
  const asSlug = normalized.replace(/[\s.]+/g, '-');
  if (MOVEMENT_MAP[asSlug]) {
    return MOVEMENT_MAP[asSlug];
  }

  // Partial match on display name (case-insensitive)
  for (const [, definition] of Object.entries(MOVEMENT_MAP)) {
    if (definition.name.toLowerCase().includes(normalized)) {
      return definition;
    }
  }

  // Partial match on slug keys
  for (const [slug, definition] of Object.entries(MOVEMENT_MAP)) {
    if (slug.includes(normalized.replace(/[\s.]+/g, '-'))) {
      return definition;
    }
  }

  return null;
}

/**
 * Get all movement display names for listing/autocomplete.
 */
export function getAllMovementNames(): string[] {
  return Object.values(MOVEMENT_MAP).map((m) => m.name);
}
