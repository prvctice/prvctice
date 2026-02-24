'use strict';

import type { Session } from 'express-session';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

interface HistoryStore {
  [key: string]: ChatHistoryMessage[] | undefined;
  __shared?: ChatHistoryMessage[];
}

interface SessionWithHistory extends Session {
  mcpHistory?: HistoryStore | ChatHistoryMessage[];
}

export function normaliseProviderName(provider: string | null | undefined): string {
  if (!provider) return 'openai';
  const low = String(provider).toLowerCase();
  if (low === 'google') return 'gemini';
  if (!low) return 'openai';
  return low;
}

function ensureHistoryStore(session: SessionWithHistory | null | undefined): HistoryStore | null {
  if (!session) return null;
  const current = session.mcpHistory;
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    return current as HistoryStore;
  }
  if (Array.isArray(current)) {
    session.mcpHistory = { __shared: current.slice(-40) };
    return session.mcpHistory as HistoryStore;
  }
  session.mcpHistory = {};
  return session.mcpHistory as HistoryStore;
}

export function getHistoryForProvider(
  session: SessionWithHistory | null | undefined,
  provider: string
): ChatHistoryMessage[] {
  if (!session) return [];
  const raw = session.mcpHistory;
  if (Array.isArray(raw)) return raw.slice();
  if (!raw || typeof raw !== 'object') return [];
  const key = normaliseProviderName(provider);
  const bucket = (raw as HistoryStore)[key];
  if (Array.isArray(bucket)) return bucket.slice();
  if (Array.isArray((raw as HistoryStore).__shared)) return (raw as HistoryStore).__shared!.slice();
  return [];
}

export function setHistoryForProvider(
  session: SessionWithHistory | null | undefined,
  provider: string,
  messages: ChatHistoryMessage[] = []
): void {
  if (!session) return;
  const store = ensureHistoryStore(session);
  if (!store) return;
  const key = normaliseProviderName(provider);
  store[key] = Array.isArray(messages) ? messages.slice() : [];
}

export function appendHistoryForProvider(
  session: SessionWithHistory | null | undefined,
  provider: string,
  messages: ChatHistoryMessage[] = []
): void {
  if (!session || !Array.isArray(messages) || messages.length === 0) return;
  const store = ensureHistoryStore(session);
  if (!store) return;
  const key = normaliseProviderName(provider);
  const bucket = Array.isArray(store[key]) ? store[key]! : [];
  bucket.push(...messages);
  store[key] = bucket;
}

export function trimHistoryForProvider(
  session: SessionWithHistory | null | undefined,
  provider: string,
  limit: number
): void {
  if (!session) return;
  const store = ensureHistoryStore(session);
  if (!store) return;
  const key = normaliseProviderName(provider);
  const bucket = Array.isArray(store[key]) ? store[key]! : [];
  if (bucket.length > limit) {
    store[key] = bucket.slice(-limit);
  }
}

export function clearHistory(
  session: SessionWithHistory | null | undefined,
  provider?: string
): void {
  if (!session) return;
  if (provider) {
    const store = ensureHistoryStore(session);
    if (!store) return;
    const key = normaliseProviderName(provider);
    store[key] = [];
    return;
  }
  session.mcpHistory = {};
}

function mergeHistories(
  serverHistory: ChatHistoryMessage[],
  clientHistory?: ChatHistoryMessage[]
): ChatHistoryMessage[] {
  if (!clientHistory) return serverHistory;
  // Prefer client if equal or longer (client may have fresher state)
  if (clientHistory.length >= serverHistory.length) return clientHistory;
  return serverHistory;
}

export function syncHistoryBetweenProviders(
  session: SessionWithHistory | null | undefined,
  fromProvider: string,
  toProvider: string,
  clientMessages?: ChatHistoryMessage[]
): { ok: boolean; count: number } {
  if (!session) return { ok: false, count: 0 };

  const normalizedFrom = normaliseProviderName(fromProvider);
  const normalizedTo = normaliseProviderName(toProvider);

  const serverHistory = getHistoryForProvider(session, normalizedFrom);
  const mergedHistory = mergeHistories(serverHistory, clientMessages);

  setHistoryForProvider(session, normalizedTo, mergedHistory);

  return { ok: true, count: mergedHistory.length };
}
