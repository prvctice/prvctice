/**
 * Connector Manifests
 *
 * Zod-validated contracts for all 13 backend connectors.
 * Each manifest declares methods, input/output schemas, cache policy, and tier.
 */

import { z } from 'zod';

// ==================== Types ====================

export interface CachePolicy {
  readonly ttlMs: number;
  readonly scope: 'shared' | 'per-key';
}

export interface MethodManifest {
  readonly input: z.ZodType;
  readonly output: z.ZodType;
  readonly cache: CachePolicy | null;
}

export interface ConnectorManifest {
  readonly id: string;
  readonly tier: 'backend' | 'frontend';
  readonly requiresApiKey: boolean;
  readonly methods: Readonly<Record<string, MethodManifest>>;
}

// ==================== Shared Schemas ====================

const locationSchema = z.union([
  z.string(),
  z.object({ lat: z.number(), lon: z.number() }),
  z.object({ latitude: z.number(), longitude: z.number() }),
]);

const geoLocationOutput = z.object({
  lat: z.number(),
  lon: z.number(),
  name: z.string().optional(),
  country: z.string().optional(),
});

// ==================== Cache TTL Constants ====================

const TTL_REALTIME = 60_000; // 60s -- sports, markets
const TTL_FREQUENT = 600_000; // 10min -- weather
const TTL_NEWS = 300_000; // 5min -- news
const TTL_STABLE = 3_600_000; // 1hr -- reference data
const TTL_YOUTUBE = 1_800_000; // 30min -- youtube

// ==================== Weather ====================

export const weatherManifest: ConnectorManifest = {
  id: 'weather',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    current: {
      input: z.object({
        location: locationSchema,
        units: z.enum(['imperial', 'metric']).optional(),
      }),
      output: z.object({
        current: z.object({
          temperature_2m: z.number(),
          relative_humidity_2m: z.number(),
          apparent_temperature: z.number(),
          weather_code: z.number(),
          wind_speed_10m: z.number(),
          wind_direction_10m: z.number(),
        }),
        units: z.object({
          temperature_2m: z.string(),
          relative_humidity_2m: z.string(),
          apparent_temperature: z.string(),
          wind_speed_10m: z.string(),
        }),
        location: geoLocationOutput,
      }),
      cache: { ttlMs: TTL_FREQUENT, scope: 'shared' },
    },
    forecast: {
      input: z.object({
        location: locationSchema,
        days: z.number().optional(),
        units: z.enum(['imperial', 'metric']).optional(),
      }),
      output: z.object({
        daily: z.object({
          time: z.array(z.string()),
          weather_code: z.array(z.number()),
          temperature_2m_max: z.array(z.number()),
          temperature_2m_min: z.array(z.number()),
          precipitation_sum: z.array(z.number()),
        }),
        units: z.object({
          temperature_2m_max: z.string(),
          temperature_2m_min: z.string(),
          precipitation_sum: z.string(),
        }),
        location: geoLocationOutput,
      }),
      cache: { ttlMs: TTL_FREQUENT, scope: 'shared' },
    },
  },
};

// ==================== News ====================

export const newsManifest: ConnectorManifest = {
  id: 'news',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    fetch: {
      input: z.object({
        feedUrl: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        link: z.string().optional(),
        items: z.array(
          z.object({
            title: z.string().optional(),
            link: z.string().optional(),
            pubDate: z.string().optional(),
            content: z.string().optional(),
            categories: z.array(z.string()).optional(),
          })
        ),
      }),
      cache: { ttlMs: TTL_NEWS, scope: 'shared' },
    },
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        query: z.string(),
        items: z.array(
          z.object({
            title: z.string().optional(),
            link: z.string().optional(),
            pubDate: z.string().optional(),
            content: z.string().optional(),
            source: z.string().optional(),
          })
        ),
      }),
      cache: { ttlMs: TTL_NEWS, scope: 'shared' },
    },
    headlines: {
      input: z.object({
        topic: z
          .enum([
            'world',
            'nation',
            'business',
            'technology',
            'entertainment',
            'sports',
            'science',
            'health',
          ])
          .optional(),
        limit: z.number().optional(),
      }),
      output: z.object({
        topic: z.string(),
        items: z.array(
          z.object({
            title: z.string().optional(),
            link: z.string().optional(),
            pubDate: z.string().optional(),
            content: z.string().optional(),
            source: z.string().optional(),
          })
        ),
      }),
      cache: { ttlMs: TTL_NEWS, scope: 'shared' },
    },
  },
};

// ==================== Web Fetch ====================

export const webFetchManifest: ConnectorManifest = {
  id: 'web-fetch',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    fetch: {
      input: z.object({
        url: z.string(),
        options: z
          .object({
            method: z.string().optional(),
            headers: z.record(z.string(), z.string()).optional(),
            body: z.unknown().optional(),
          })
          .optional(),
      }),
      output: z.object({
        status: z.number(),
        headers: z.record(z.string(), z.string()),
        data: z.unknown(),
      }),
      cache: null,
    },
  },
};

// ==================== AI ====================

export const aiManifest: ConnectorManifest = {
  id: 'ai',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    complete: {
      input: z.object({
        prompt: z.string(),
        provider: z.string().optional(),
        model: z.string().optional(),
        maxTokens: z.number().optional(),
      }),
      output: z.object({
        text: z.string(),
        provider: z.string(),
        model: z.string(),
      }),
      cache: null,
    },
  },
};

// ==================== Wikipedia ====================

export const wikipediaManifest: ConnectorManifest = {
  id: 'wikipedia',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        articles: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
    images: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        images: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Movies ====================

export const moviesManifest: ConnectorManifest = {
  id: 'movies',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        results: z.array(
          z.object({
            id: z.number(),
            type: z.string().optional(),
            title: z.string(),
            year: z.string(),
            overview: z.string(),
            posterUrl: z.string().nullable(),
            rating: z.number().nullable(),
            url: z.string(),
          })
        ),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'per-key' },
    },
    trending: {
      input: z.object({
        timeWindow: z.enum(['day', 'week']).optional(),
        mediaType: z.enum(['movie', 'tv']).optional(),
        limit: z.number().optional(),
      }),
      output: z.object({
        results: z.array(
          z.object({
            id: z.number(),
            type: z.string(),
            title: z.string(),
            year: z.string(),
            overview: z.string(),
            posterUrl: z.string().nullable(),
            rating: z.number().nullable(),
            url: z.string(),
          })
        ),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'per-key' },
    },
  },
};

// ==================== Books ====================

export const booksManifest: ConnectorManifest = {
  id: 'books',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
        author: z.string().optional(),
      }),
      output: z.object({
        books: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Academic ====================

export const academicManifest: ConnectorManifest = {
  id: 'academic',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        papers: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Art ====================

export const artManifest: ConnectorManifest = {
  id: 'art',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        artworks: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
    searchArtInstitute: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        artworks: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
    searchMetMuseum: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        artworks: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Music ====================

export const musicManifest: ConnectorManifest = {
  id: 'music',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        results: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'per-key' },
    },
  },
};

// ==================== Sports ====================

export const sportsManifest: ConnectorManifest = {
  id: 'sports',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    scores: {
      input: z.object({
        sport: z.string().optional(),
        league: z.string().optional(),
        team: z.string().optional(),
        date: z.string().optional(),
        limit: z.number().optional(),
      }),
      output: z.object({
        games: z.array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            date: z.string(),
            status: z.string(),
            completed: z.boolean(),
            teams: z.array(
              z.object({
                name: z.string(),
                abbreviation: z.string(),
                score: z.string(),
                winner: z.boolean(),
                logo: z.string().nullable(),
              })
            ),
          })
        ),
      }),
      cache: { ttlMs: TTL_REALTIME, scope: 'shared' },
    },
    standings: {
      input: z.object({
        sport: z.string().optional(),
        league: z.string().optional(),
      }),
      output: z.object({
        groups: z.array(
          z.object({
            name: z.string(),
            teams: z.array(
              z.object({
                name: z.string(),
                abbreviation: z.string(),
                logo: z.string().nullable(),
                stats: z.record(z.string(), z.string()),
              })
            ),
          })
        ),
      }),
      cache: { ttlMs: TTL_REALTIME, scope: 'shared' },
    },
    schedule: {
      input: z.object({
        sport: z.string().optional(),
        league: z.string().optional(),
        team: z.string().optional(),
        date: z.string().optional(),
        limit: z.number().optional(),
      }),
      output: z.object({
        games: z.array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            date: z.string(),
            status: z.string(),
            completed: z.boolean(),
            teams: z.array(
              z.object({
                name: z.string(),
                abbreviation: z.string(),
                score: z.string(),
                winner: z.boolean(),
                logo: z.string().nullable(),
              })
            ),
          })
        ),
      }),
      cache: { ttlMs: TTL_REALTIME, scope: 'shared' },
    },
  },
};

// ==================== YouTube ====================

export const youtubeManifest: ConnectorManifest = {
  id: 'youtube',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        videos: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_YOUTUBE, scope: 'per-key' },
    },
  },
};

// ==================== Markets ====================

const cryptoPriceSchema = z.object({
  id: z.string(),
  price: z.number().nullable(),
  change24h: z.number().nullable(),
  marketCap: z.number().nullable(),
  volume24h: z.number().nullable(),
  lastUpdated: z.string().nullable(),
});

const stockQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number().nullable(),
  change: z.number().nullable(),
  changePercent: z.number().nullable(),
  volume: z.number().nullable(),
  previousClose: z.number().nullable(),
  open: z.number().nullable(),
  dayHigh: z.number().nullable(),
  dayLow: z.number().nullable(),
  marketCap: z.number().nullable(),
  currency: z.string(),
});

export const marketsManifest: ConnectorManifest = {
  id: 'markets',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    crypto: {
      input: z.object({
        ids: z.array(z.string()).optional(),
        vs: z.string().optional(),
      }),
      output: z.object({
        prices: z.array(cryptoPriceSchema),
        currency: z.string(),
      }),
      cache: { ttlMs: TTL_REALTIME, scope: 'shared' },
    },
    stock: {
      input: z.object({
        symbol: z.string(),
      }),
      output: z.object({
        quotes: z.array(stockQuoteSchema),
      }),
      cache: { ttlMs: TTL_REALTIME, scope: 'shared' },
    },
    trending: {
      input: z.object({}),
      output: z.object({
        coins: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            symbol: z.string(),
            thumb: z.string().nullable(),
            price: z.number().nullable(),
            change24h: z.number().nullable(),
          })
        ),
      }),
      cache: { ttlMs: TTL_REALTIME, scope: 'shared' },
    },
  },
};

// ==================== Europeana ====================

export const europeanaManifest: ConnectorManifest = {
  id: 'europeana',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        results: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            artist: z.string(),
            date: z.string(),
            source: z.string(),
            sourceUrl: z.string(),
            provider: z.string().optional(),
          })
        ),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Smithsonian ====================

export const smithsonianManifest: ConnectorManifest = {
  id: 'smithsonian',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        results: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            artist: z.string(),
            date: z.string(),
            source: z.string(),
            sourceUrl: z.string(),
          })
        ),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'per-key' },
    },
  },
};

// ==================== Library of Congress ====================

export const locManifest: ConnectorManifest = {
  id: 'loc',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      output: z.object({
        results: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            date: z.string(),
            source: z.string(),
            sourceUrl: z.string(),
            subjects: z.array(z.string()).optional(),
          })
        ),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Google Books ====================

export const googleBooksManifest: ConnectorManifest = {
  id: 'google-books',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    search: {
      input: z.object({
        query: z.string(),
        limit: z.number().optional(),
        author: z.string().optional(),
      }),
      output: z.object({
        books: z.array(z.record(z.string(), z.unknown())),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

// ==================== Geocoding ====================

export const geocodingManifest: ConnectorManifest = {
  id: 'geocoding',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    geocode: {
      input: z.object({
        name: z.string(),
      }),
      output: z.object({
        results: z.array(
          z.object({
            lat: z.number(),
            lon: z.number(),
            name: z.string(),
            country: z.string().optional(),
          })
        ),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
    reverseGeocode: {
      input: z.object({
        lat: z.number(),
        lon: z.number(),
      }),
      output: z.object({
        name: z.string(),
        country: z.string().optional(),
        lat: z.number(),
        lon: z.number(),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'shared' },
    },
  },
};

export const filmsManifest: ConnectorManifest = {
  id: 'films',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    search: {
      input: z.object({
        people: z.array(z.string()).optional(),
        genres: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
        yearStart: z.number().optional(),
        yearEnd: z.number().optional(),
        language: z.string().optional(),
        companies: z.array(z.string()).optional(),
        movement: z.string().optional(),
        limit: z.number().optional(),
      }),
      output: z.object({
        films: z.array(z.record(z.string(), z.unknown())),
        matchNotes: z.array(z.string()),
        hint: z.string().optional(),
      }),
      cache: { ttlMs: TTL_STABLE, scope: 'per-key' },
    },
  },
};

export const visionManifest: ConnectorManifest = {
  id: 'vision',
  tier: 'backend',
  requiresApiKey: true,
  methods: {
    describe: {
      input: z.object({
        imageData: z.string(),
        prompt: z.string().optional(),
        provider: z.string().optional(),
      }),
      output: z.object({
        text: z.string(),
      }),
      cache: null,
    },
  },
};

// ==================== Media Tools ====================

const fileInputSchema = z.object({
  fileId: z.string().optional(),
  base64: z.string().optional(),
});

export const mediaToolsManifest: ConnectorManifest = {
  id: 'media-tools',
  tier: 'backend',
  requiresApiKey: false,
  methods: {
    probe: {
      input: fileInputSchema,
      output: z.object({
        duration: z.number().nullable(),
        size: z.number().nullable(),
        format: z.string().nullable(),
        formatLong: z.string().nullable(),
        bitRate: z.number().nullable(),
        video: z
          .object({
            codec: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
            bitRate: z.number().nullable(),
          })
          .nullable(),
        audio: z
          .object({
            codec: z.string().optional(),
            sampleRate: z.number().nullable(),
            channels: z.number().optional(),
            bitRate: z.number().nullable(),
          })
          .nullable(),
      }),
      cache: null,
    },
    convert: {
      input: fileInputSchema.extend({
        format: z.string(),
      }),
      output: z.object({
        fileId: z.string(),
        size: z.number(),
        url: z.string(),
        format: z.string(),
      }),
      cache: null,
    },
    extractAudio: {
      input: fileInputSchema.extend({
        format: z.string().optional(),
      }),
      output: z.object({
        fileId: z.string(),
        size: z.number(),
        url: z.string(),
        format: z.string(),
      }),
      cache: null,
    },
    screenshot: {
      input: fileInputSchema.extend({
        timestamps: z.array(z.number()),
        format: z.string().optional(),
      }),
      output: z.object({
        screenshots: z.array(
          z.object({
            fileId: z.string(),
            size: z.number(),
            url: z.string(),
            timestamp: z.number(),
          })
        ),
      }),
      cache: null,
    },
    trim: {
      input: fileInputSchema.extend({
        start: z.number().optional(),
        end: z.number().optional(),
        format: z.string().optional(),
      }),
      output: z.object({
        fileId: z.string(),
        size: z.number(),
        url: z.string(),
        format: z.string(),
        start: z.number(),
        end: z.number().nullable(),
      }),
      cache: null,
    },
  },
};

// ==================== Registry ====================

const manifests: ReadonlyMap<string, ConnectorManifest> = new Map([
  ['weather', weatherManifest],
  ['news', newsManifest],
  ['web-fetch', webFetchManifest],
  ['ai', aiManifest],
  ['wikipedia', wikipediaManifest],
  ['movies', moviesManifest],
  ['books', booksManifest],
  ['academic', academicManifest],
  ['art', artManifest],
  ['music', musicManifest],
  ['sports', sportsManifest],
  ['youtube', youtubeManifest],
  ['markets', marketsManifest],
  ['europeana', europeanaManifest],
  ['smithsonian', smithsonianManifest],
  ['loc', locManifest],
  ['google-books', googleBooksManifest],
  ['geocoding', geocodingManifest],
  ['films', filmsManifest],
  ['vision', visionManifest],
  ['media-tools', mediaToolsManifest],
]);

export function getManifest(connectorId: string): ConnectorManifest | undefined {
  return manifests.get(connectorId);
}

export function getAllManifests(): ConnectorManifest[] {
  return [...manifests.values()];
}
