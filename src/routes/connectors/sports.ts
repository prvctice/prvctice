/**
 * Sports connector handler using ESPN public API.
 * No API key required — ESPN's public endpoints are free.
 *
 * Supported sports: nfl, nba, mlb, nhl, soccer (MLS), college-football, college-basketball
 */

import axios from 'axios';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const TIMEOUT = 12000;

const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Prvctice/1.0)',
  Accept: 'application/json',
} as const;

interface SportConfig {
  readonly path: string;
}

const SPORT_MAP: Readonly<Record<string, SportConfig>> = {
  nfl: { path: 'football/nfl' },
  nba: { path: 'basketball/nba' },
  mlb: { path: 'baseball/mlb' },
  nhl: { path: 'hockey/nhl' },
  soccer: { path: 'soccer/usa.1' },
  mls: { path: 'soccer/usa.1' },
  'premier-league': { path: 'soccer/eng.1' },
  'la-liga': { path: 'soccer/esp.1' },
  'college-football': { path: 'football/college-football' },
  'college-basketball': { path: 'basketball/mens-college-basketball' },
  wnba: { path: 'basketball/wnba' },
};

function resolveSport(sport: unknown, league?: unknown): string {
  const key = String(league || sport || 'nba').toLowerCase();
  const config = SPORT_MAP[key];
  if (!config) {
    const valid = Object.keys(SPORT_MAP).join(', ');
    throw new Error(`Unknown sport: ${key}. Valid options: ${valid}`);
  }
  return config.path;
}

/** Filter events to those involving a specific team (case-insensitive partial match). */
function filterByTeam(events: ESPNEvent[], team: string): ESPNEvent[] {
  const needle = team.toLowerCase();
  return events.filter((event) => {
    const competitors = event.competitions?.[0]?.competitors || [];
    return competitors.some((c) => {
      const name = (c.team?.displayName || '').toLowerCase();
      const abbr = (c.team?.abbreviation || '').toLowerCase();
      return name.includes(needle) || abbr.includes(needle) || needle.includes(abbr);
    });
  });
}

interface ESPNCompetitor {
  team?: { displayName?: string; abbreviation?: string; logo?: string };
  score?: string;
  winner?: boolean;
}

interface ESPNCompetition {
  competitors?: ESPNCompetitor[];
  status?: { type?: { shortDetail?: string; completed?: boolean } };
}

interface ESPNEvent {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  competitions?: ESPNCompetition[];
}

interface ESPNScoreboardResponse {
  events?: ESPNEvent[];
}

function mapEvents(events: ESPNEvent[]): unknown[] {
  return events.map((event) => {
    const comp = event.competitions?.[0];
    const teams = (comp?.competitors || []).map((c) => ({
      name: c.team?.displayName || 'Unknown',
      abbreviation: c.team?.abbreviation || '',
      score: c.score || '0',
      winner: c.winner ?? false,
      logo: c.team?.logo || null,
    }));

    return {
      id: event.id,
      name: event.shortName || event.name || '',
      date: event.date || '',
      status: comp?.status?.type?.shortDetail || '',
      completed: comp?.status?.type?.completed ?? false,
      teams,
    };
  });
}

async function fetchScoreboard(params: Record<string, unknown>): Promise<{
  events: ESPNEvent[];
  sportPath: string;
}> {
  const sportPath = resolveSport(params.sport, params.league);
  const queryParams: Record<string, string> = {};

  // ESPN supports ?dates=YYYYMMDD for specific dates
  if (typeof params.date === 'string') {
    queryParams.dates = params.date.replace(/-/g, '');
  }
  // ?limit controls how many events to return
  if (typeof params.limit === 'number') {
    queryParams.limit = String(params.limit);
  }

  const url = `${ESPN_BASE}/${sportPath}/scoreboard`;
  const response = await axios.get<ESPNScoreboardResponse>(url, {
    timeout: TIMEOUT,
    headers: ESPN_HEADERS,
    params: queryParams,
  });

  return {
    events: response.data?.events || [],
    sportPath,
  };
}

async function scores(params: Record<string, unknown>): Promise<unknown> {
  const { events } = await fetchScoreboard(params);
  const filtered = typeof params.team === 'string' ? filterByTeam(events, params.team) : events;
  return { games: mapEvents(filtered) };
}

interface ESPNStandingsEntry {
  team?: { displayName?: string; abbreviation?: string; logo?: string };
  stats?: Array<{ name?: string; displayValue?: string }>;
}

interface ESPNStandingsGroup {
  header?: string;
  standings?: { entries?: ESPNStandingsEntry[] };
}

interface ESPNStandingsResponse {
  children?: ESPNStandingsGroup[];
}

async function standings(params: Record<string, unknown>): Promise<unknown> {
  const sportPath = resolveSport(params.sport, params.league);

  const response = await axios.get<ESPNStandingsResponse>(`${ESPN_BASE}/${sportPath}/standings`, {
    timeout: TIMEOUT,
    headers: ESPN_HEADERS,
  });

  const groups = response.data?.children || [];
  const result = groups.map((group) => ({
    name: group.header || '',
    teams: (group.standings?.entries || []).map((entry) => {
      const stats: Record<string, string> = {};
      for (const stat of entry.stats || []) {
        if (stat.name && stat.displayValue) {
          stats[stat.name] = stat.displayValue;
        }
      }
      return {
        name: entry.team?.displayName || 'Unknown',
        abbreviation: entry.team?.abbreviation || '',
        logo: entry.team?.logo || null,
        stats,
      };
    }),
  }));

  return { groups: result };
}

async function schedule(params: Record<string, unknown>): Promise<unknown> {
  const { events } = await fetchScoreboard(params);
  const filtered = typeof params.team === 'string' ? filterByTeam(events, params.team) : events;
  return { games: mapEvents(filtered) };
}

export const sportsHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { scores, standings, schedule };
