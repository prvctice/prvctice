/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, mock, beforeEach, afterEach } = require('node:test');

describe('FilmSearchService', () => {
  let originalAxiosGet;
  let mockAxiosGet;
  let circuitBreaker;

  beforeEach(() => {
    // Clear module caches
    delete require.cache[require.resolve('../../src/services/filmSearchService')];
    delete require.cache[require.resolve('../../src/services/tmdbService')];

    mockAxiosGet = mock.fn();
    originalAxiosGet = require('axios').get;
    require('axios').get = mockAxiosGet;

    circuitBreaker = require('../../src/services/circuitBreaker');
    circuitBreaker.resetAllCircuits();
  });

  afterEach(() => {
    if (originalAxiosGet) {
      require('axios').get = originalAxiosGet;
    }
    circuitBreaker.resetAllCircuits();
  });

  // ---- Genre resolution tests ----

  describe('_resolveGenres', () => {
    test('maps known genre names to TMDB IDs', () => {
      const { _resolveGenres } = require('../../src/services/filmSearchService');
      const result = _resolveGenres(['thriller', 'drama', 'comedy']);
      assert.deepStrictEqual(result, [53, 18, 35]);
    });

    test('maps sci-fi alias to 878', () => {
      const { _resolveGenres } = require('../../src/services/filmSearchService');
      const result = _resolveGenres(['sci-fi']);
      assert.deepStrictEqual(result, [878]);
    });

    test('maps science fiction to 878', () => {
      const { _resolveGenres } = require('../../src/services/filmSearchService');
      const result = _resolveGenres(['science fiction']);
      assert.deepStrictEqual(result, [878]);
    });

    test('skips unknown genres', () => {
      const { _resolveGenres } = require('../../src/services/filmSearchService');
      const result = _resolveGenres(['thriller', 'experimental', 'drama']);
      assert.deepStrictEqual(result, [53, 18]);
    });

    test('handles case insensitivity', () => {
      const { _resolveGenres } = require('../../src/services/filmSearchService');
      const result = _resolveGenres(['HORROR', 'Drama']);
      assert.deepStrictEqual(result, [27, 18]);
    });
  });

  // ---- Canon period parsing tests ----

  describe('_parseCanonPeriod', () => {
    test('parses prefer later periods', () => {
      const { _parseCanonPeriod } = require('../../src/services/filmSearchService');
      const result = _parseCanonPeriod('Jean-Luc Godard (prefer later periods)');
      assert.strictEqual(result.name, 'jean-luc godard');
      assert.strictEqual(result.preferLater, true);
      assert.strictEqual(result.preferEarlier, false);
    });

    test('parses prefer earlier periods', () => {
      const { _parseCanonPeriod } = require('../../src/services/filmSearchService');
      const result = _parseCanonPeriod('Jean Renoir (prefer earlier periods)');
      assert.strictEqual(result.name, 'jean renoir');
      assert.strictEqual(result.preferLater, false);
      assert.strictEqual(result.preferEarlier, true);
    });

    test('skips decade annotations like (1970s)', () => {
      const { _parseCanonPeriod } = require('../../src/services/filmSearchService');
      const result = _parseCanonPeriod('Keith Jarrett (1970s)');
      assert.strictEqual(result.name, 'keith jarrett');
      assert.strictEqual(result.preferLater, false);
      assert.strictEqual(result.preferEarlier, false);
    });

    test('handles plain names with no annotation', () => {
      const { _parseCanonPeriod } = require('../../src/services/filmSearchService');
      const result = _parseCanonPeriod('Abbas Kiarostami');
      assert.strictEqual(result.name, 'abbas kiarostami');
      assert.strictEqual(result.preferLater, false);
      assert.strictEqual(result.preferEarlier, false);
    });
  });

  // ---- Synopsis truncation tests ----

  describe('_truncateSynopsis', () => {
    test('returns short text unchanged', () => {
      const { _truncateSynopsis } = require('../../src/services/filmSearchService');
      const result = _truncateSynopsis('A short synopsis.');
      assert.strictEqual(result, 'A short synopsis.');
    });

    test('truncates at sentence boundary', () => {
      const { _truncateSynopsis } = require('../../src/services/filmSearchService');
      // Ensure a sentence boundary exists past the 50% mark (100 chars) but before 200
      const long =
        'This is a long opening sentence that sets up the story of a man and his journey through a strange land. ' +
        'The second sentence provides more detail about characters and plot and adds extra length. ' +
        'Third sentence goes well past the limit.';
      const result = _truncateSynopsis(long, 200);
      assert.ok(result.endsWith('.'), `Expected period at end, got: "${result.slice(-10)}"`);
      assert.ok(result.length <= 200, `Expected <= 200 chars, got ${result.length}`);
    });

    test('handles empty/undefined text', () => {
      const { _truncateSynopsis } = require('../../src/services/filmSearchService');
      assert.strictEqual(_truncateSynopsis(''), '');
      assert.strictEqual(_truncateSynopsis(undefined), '');
    });

    test('adds ellipsis when no sentence boundary found', () => {
      const { _truncateSynopsis } = require('../../src/services/filmSearchService');
      // No period in the first half of the text
      const noPeriod = 'A' + ' word'.repeat(50);
      const result = _truncateSynopsis(noPeriod, 50);
      assert.ok(result.endsWith('...'));
    });
  });

  // ---- Re-ranking tests ----

  describe('_reRankResults', () => {
    test('boosts canon directors to top', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const films = [
        { director: 'Unknown Director', year: 2000, title: 'Film A' },
        { director: 'Godard', year: 1965, title: 'Film B' },
        { director: 'Another Person', year: 1990, title: 'Film C' },
      ];
      const canon = new Set(['godard']);
      const banned = new Set();
      const result = _reRankResults(films, canon, banned, []);
      assert.strictEqual(result[0].director, 'Godard');
    });

    test('filters out banned directors entirely', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const films = [
        { director: 'Spielberg', year: 2000, title: 'Film A' },
        { director: 'Godard', year: 1965, title: 'Film B' },
        { director: 'Unknown', year: 1990, title: 'Film C' },
      ];
      const canon = new Set(['godard']);
      const banned = new Set(['spielberg']);
      const result = _reRankResults(films, canon, banned, []);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].director, 'Godard');
    });

    test('applies period preference bonus for prefer later', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const films = [
        { director: 'Godard', year: 1965, title: 'Early' },
        { director: 'Godard', year: 1995, title: 'Late' },
      ];
      const canon = new Set(['godard']);
      const entries = [{ name: 'godard', preferLater: true, preferEarlier: false }];
      const result = _reRankResults(films, canon, new Set(), entries);
      // Both get +10 canon, but Late gets +5 period bonus
      assert.strictEqual(result[0].title, 'Late');
    });

    test('applies period preference bonus for prefer earlier', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const films = [
        { director: 'Renoir', year: 1990, title: 'Late' },
        { director: 'Renoir', year: 1950, title: 'Early' },
      ];
      const canon = new Set(['renoir']);
      const entries = [{ name: 'renoir', preferLater: false, preferEarlier: true }];
      const result = _reRankResults(films, canon, new Set(), entries);
      assert.strictEqual(result[0].title, 'Early');
    });

    test('filters out all films when none match canon', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const films = [
        { director: 'Director A', year: 2000, title: 'Film A' },
        { director: 'Director B', year: 2001, title: 'Film B' },
        { director: 'Director C', year: 2002, title: 'Film C' },
      ];
      const result = _reRankResults(films, new Set(), new Set(), []);
      assert.strictEqual(result.length, 0);
    });

    test('preserves original order as tiebreaker among canon films', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const films = [
        { director: 'Godard', year: 1965, title: 'Film A' },
        { director: 'Bresson', year: 1966, title: 'Film B' },
        { director: 'Tarkovsky', year: 1972, title: 'Film C' },
      ];
      const canon = new Set(['godard', 'bresson', 'tarkovsky']);
      const result = _reRankResults(films, canon, new Set(), []);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].title, 'Film A');
      assert.strictEqual(result[1].title, 'Film B');
      assert.strictEqual(result[2].title, 'Film C');
    });

    test('handles empty film list', () => {
      const { _reRankResults } = require('../../src/services/filmSearchService');
      const result = _reRankResults([], new Set(), new Set(), []);
      assert.deepStrictEqual(result, []);
    });
  });

  // ---- Progressive relaxation tests ----

  describe('progressive relaxation', () => {
    test('returns results when relaxed query succeeds', async () => {
      const { searchFilms } = require('../../src/services/filmSearchService');

      let callCount = 0;
      mockAxiosGet.mock.mockImplementation(async (url) => {
        // Person search
        if (url.includes('/search/person')) {
          return {
            data: {
              results: [
                {
                  id: 1,
                  name: 'Abbas Kiarostami',
                  known_for_department: 'Directing',
                  popularity: 50,
                },
              ],
            },
          };
        }
        // Keyword search
        if (url.includes('/search/keyword')) {
          return { data: { results: [{ id: 100, name: 'test keyword' }] } };
        }
        // Discover: first call returns empty, second (relaxed) returns results
        if (url.includes('/discover/movie')) {
          callCount++;
          if (callCount === 1) {
            return { data: { results: [] } };
          }
          return {
            data: {
              results: [
                {
                  id: 99,
                  title: 'Relaxed Film',
                  release_date: '2000-05-01',
                  overview: 'A story.',
                  poster_path: '/test.jpg',
                },
              ],
            },
          };
        }
        // Credits
        if (url.includes('/credits')) {
          return { data: { crew: [{ job: 'Director', name: 'Abbas Kiarostami' }] } };
        }
        return { data: {} };
      });

      const result = await searchFilms(
        { people: ['Abbas Kiarostami'], keywords: ['obscure term'] },
        { apiKeys: { tmdb: 'test-key' } }
      );
      assert.ok(result.films.length > 0);
      assert.ok(result.matchNotes.some((n) => n.includes('Relaxed')));
    });

    test('returns empty with hint when everything fails', async () => {
      const { searchFilms } = require('../../src/services/filmSearchService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search/person')) {
          return {
            data: {
              results: [
                { id: 1, name: 'Nobody', known_for_department: 'Directing', popularity: 10 },
              ],
            },
          };
        }
        if (url.includes('/discover/movie')) {
          return { data: { results: [] } };
        }
        return { data: { results: [] } };
      });

      const result = await searchFilms({ people: ['Nobody'] }, { apiKeys: { tmdb: 'test-key' } });
      assert.strictEqual(result.films.length, 0);
      assert.ok(result.hint);
      assert.ok(result.hint.includes('No films found'));
    });
  });

  // ---- searchFilms integration tests ----

  describe('searchFilms integration', () => {
    test('full pipeline: person resolution -> discover -> credits -> result', async () => {
      const { searchFilms } = require('../../src/services/filmSearchService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search/person')) {
          return {
            data: {
              results: [
                {
                  id: 42,
                  name: 'Martin Scorsese',
                  known_for_department: 'Directing',
                  popularity: 80,
                },
              ],
            },
          };
        }
        if (url.includes('/discover/movie')) {
          return {
            data: {
              results: [
                {
                  id: 101,
                  title: 'Taxi Driver',
                  release_date: '1976-02-08',
                  overview:
                    'A mentally unstable veteran works as a nighttime taxi driver in New York City.',
                  poster_path: '/taxi.jpg',
                  genre_ids: [18, 80],
                },
                {
                  id: 102,
                  title: 'Goodfellas',
                  release_date: '1990-09-19',
                  overview: 'The story of Henry Hill.',
                  poster_path: '/goodfellas.jpg',
                  genre_ids: [18, 80],
                },
              ],
            },
          };
        }
        if (url.includes('/credits')) {
          return {
            data: {
              crew: [
                { job: 'Director', name: 'Martin Scorsese' },
                { job: 'Director of Photography', name: 'Michael Chapman' },
                { job: 'Original Music Composer', name: 'Bernard Herrmann' },
                { job: 'Screenplay', name: 'Paul Schrader' },
              ],
            },
          };
        }
        return { data: {} };
      });

      const result = await searchFilms(
        { people: ['Scorsese'], genres: ['drama'] },
        { apiKeys: { tmdb: 'test-key' } }
      );
      assert.ok(result.films.length > 0);
      assert.strictEqual(result.films[0].title, 'Taxi Driver');
      assert.strictEqual(result.films[0].director, 'Martin Scorsese');
      assert.strictEqual(result.films[0].cinematographer, 'Michael Chapman');
      assert.ok(result.films[0].tmdbUrl.includes('101'));
      assert.ok(result.films[0].letterboxdUrl.includes('101'));
    });

    test('movement option merges movement directors and genres', async () => {
      const { searchFilms } = require('../../src/services/filmSearchService');

      mockAxiosGet.mock.mockImplementation(async (url) => {
        if (url.includes('/search/person')) {
          return {
            data: {
              results: [
                { id: 10, name: 'Godard', known_for_department: 'Directing', popularity: 60 },
              ],
            },
          };
        }
        if (url.includes('/search/keyword')) {
          return { data: { results: [{ id: 200, name: 'french new wave' }] } };
        }
        if (url.includes('/discover/movie')) {
          return {
            data: {
              results: [
                {
                  id: 201,
                  title: 'Breathless',
                  release_date: '1960-03-16',
                  overview: 'A small-time thief.',
                  poster_path: '/breathless.jpg',
                },
              ],
            },
          };
        }
        if (url.includes('/credits')) {
          return { data: { crew: [{ job: 'Director', name: 'Jean-Luc Godard' }] } };
        }
        return { data: {} };
      });

      const result = await searchFilms(
        { movement: 'french new wave' },
        { apiKeys: { tmdb: 'test-key' } }
      );
      assert.ok(result.matchNotes.some((n) => n.includes('French New Wave')));
      assert.ok(result.films.length > 0);
    });

    test('returns hint when API key is missing', async () => {
      const { searchFilms } = require('../../src/services/filmSearchService');
      const result = await searchFilms({ people: ['Scorsese'] }, {});
      assert.strictEqual(result.films.length, 0);
      assert.ok(result.hint);
      assert.ok(result.hint.includes('API key'));
    });

    test('circuit breaker blocks when circuit is open', async () => {
      const { searchFilms } = require('../../src/services/filmSearchService');

      // Manually open the circuit breaker for tmdb-discover
      circuitBreaker.recordFailure('tmdb-discover');
      circuitBreaker.recordFailure('tmdb-discover');
      circuitBreaker.recordFailure('tmdb-discover');

      // Call should be blocked by open circuit
      const result = await searchFilms({ people: ['test'] }, { apiKeys: { tmdb: 'test-key' } });
      assert.ok(result.hint);
      assert.ok(result.hint.includes('temporarily unavailable'));
      // Should not have made any API calls
      assert.strictEqual(mockAxiosGet.mock.callCount(), 0);
    });
  });

  // ---- filmMovementMap tests ----

  describe('filmMovementMap', () => {
    test('MOVEMENT_MAP contains 12 movements', () => {
      const { MOVEMENT_MAP } = require('../../src/services/filmMovementMap');
      assert.strictEqual(Object.keys(MOVEMENT_MAP).length, 12);
    });

    test('getMovementFilters finds by exact slug', () => {
      const { getMovementFilters } = require('../../src/services/filmMovementMap');
      const result = getMovementFilters('french-new-wave');
      assert.ok(result);
      assert.strictEqual(result.name, 'French New Wave');
      assert.ok(result.directors.length > 0);
    });

    test('getMovementFilters fuzzy matches by display name', () => {
      const { getMovementFilters } = require('../../src/services/filmMovementMap');
      const result = getMovementFilters('italian neorealism');
      assert.ok(result);
      assert.strictEqual(result.name, 'Italian Neorealism');
    });

    test('getMovementFilters returns null for unknown movement', () => {
      const { getMovementFilters } = require('../../src/services/filmMovementMap');
      const result = getMovementFilters('mumblecore');
      assert.strictEqual(result, null);
    });

    test('getAllMovementNames returns all movement display names', () => {
      const { getAllMovementNames } = require('../../src/services/filmMovementMap');
      const names = getAllMovementNames();
      assert.strictEqual(names.length, 12);
      assert.ok(names.includes('French New Wave'));
      assert.ok(names.includes('L.A. Rebellion'));
    });
  });
});
