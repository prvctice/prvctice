/**
 * Markets connector handler.
 * Crypto: CoinGecko API (free, no key required, 10-30 req/min).
 * Stocks: Yahoo Finance v8 public endpoint (no key required).
 */

import axios from 'axios';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const TIMEOUT = 10000;

// ==================== CRYPTO (CoinGecko) ====================

interface CoinGeckoPrice {
  [coinId: string]: {
    usd?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
    last_updated_at?: number;
    [key: string]: number | undefined;
  };
}

async function crypto(params: Record<string, unknown>): Promise<unknown> {
  const ids = Array.isArray(params.ids) ? params.ids.map(String) : ['bitcoin'];
  const vs = String(params.vs || 'usd').toLowerCase();

  const response = await axios.get<CoinGeckoPrice>(`${COINGECKO_BASE}/simple/price`, {
    params: {
      ids: ids.join(','),
      vs_currencies: vs,
      include_24hr_change: true,
      include_market_cap: true,
      include_24hr_vol: true,
      include_last_updated_at: true,
    },
    timeout: TIMEOUT,
  });

  const data = response.data || {};
  const prices = ids.map((id) => {
    const coin = data[id] || {};
    return {
      id,
      price: coin[vs] ?? null,
      change24h: coin[`${vs}_24h_change`] ?? null,
      marketCap: coin[`${vs}_market_cap`] ?? null,
      volume24h: coin[`${vs}_24h_vol`] ?? null,
      lastUpdated: coin.last_updated_at
        ? new Date(coin.last_updated_at * 1000).toISOString()
        : null,
    };
  });

  return { prices, currency: vs };
}

interface CoinGeckoTrendingCoin {
  item?: {
    id?: string;
    name?: string;
    symbol?: string;
    thumb?: string;
    data?: {
      price?: number;
      price_change_percentage_24h?: Record<string, number>;
      market_cap?: string;
    };
  };
}

interface CoinGeckoTrendingResponse {
  coins?: CoinGeckoTrendingCoin[];
}

async function cryptoTrending(): Promise<unknown> {
  const response = await axios.get<CoinGeckoTrendingResponse>(`${COINGECKO_BASE}/search/trending`, {
    timeout: TIMEOUT,
  });

  const coins = (response.data?.coins || []).slice(0, 10).map((c) => ({
    id: c.item?.id || '',
    name: c.item?.name || '',
    symbol: c.item?.symbol || '',
    thumb: c.item?.thumb || null,
    price: c.item?.data?.price ?? null,
    change24h: c.item?.data?.price_change_percentage_24h?.usd ?? null,
  }));

  return { coins };
}

// ==================== STOCKS (Yahoo Finance v8) ====================

interface YahooQuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  marketCap?: number;
  currency?: string;
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: YahooQuoteResult[];
    error?: unknown;
  };
}

async function stock(params: Record<string, unknown>): Promise<unknown> {
  const symbol = String(params.symbol || '')
    .trim()
    .toUpperCase();
  if (!symbol) throw new Error('symbol is required (e.g., "AAPL")');

  // Support multiple symbols comma-separated
  const symbols = symbol.includes(',') ? symbol : symbol;

  const response = await axios.get<YahooQuoteResponse>(
    'https://query1.finance.yahoo.com/v7/finance/quote',
    {
      params: { symbols },
      headers: { 'User-Agent': 'Prvctice/1.0' },
      timeout: TIMEOUT,
    }
  );

  const results = response.data?.quoteResponse?.result || [];
  const quotes = results.map((q) => ({
    symbol: q.symbol || symbol,
    name: q.longName || q.shortName || '',
    price: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    changePercent: q.regularMarketChangePercent ?? null,
    volume: q.regularMarketVolume ?? null,
    previousClose: q.regularMarketPreviousClose ?? null,
    open: q.regularMarketOpen ?? null,
    dayHigh: q.regularMarketDayHigh ?? null,
    dayLow: q.regularMarketDayLow ?? null,
    marketCap: q.marketCap ?? null,
    currency: q.currency || 'USD',
  }));

  return { quotes };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function trending(params: Record<string, unknown>): Promise<unknown> {
  // Return crypto trending data
  const cryptoResult = await cryptoTrending();
  return cryptoResult;
}

export const marketsHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { crypto, stock, trending };
