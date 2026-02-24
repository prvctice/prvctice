'use strict';

/**
 * Lightweight helpers to track whether a session has ever supplied its own
 * provider API key. Once a user enters any key, trial/server keys must no
 * longer be used as fallbacks for that session.
 */

export interface SessionWithKeys {
  __userKeyProvided?: boolean;
  userKeyProviders?: Record<string, boolean>;
  [key: string]: unknown;
}

export function markUserProvidedKey(
  session: SessionWithKeys | null,
  provider: string | null = null
): void {
  if (!session) return;
  try {
    session.__userKeyProvided = true;
    if (provider) {
      session.userKeyProviders = session.userKeyProviders || {};
      session.userKeyProviders[provider] = true;
    }
  } catch {
    // Best-effort - ignore session write failures.
  }
}

export function hasUserProvidedAnyKey(session: SessionWithKeys | null): boolean {
  if (!session) return false;
  if (session.__userKeyProvided) return true;
  if (session.userKeyProviders) {
    return Object.values(session.userKeyProviders).some(Boolean);
  }
  return false;
}

export function hasUserProvidedKeyFor(session: SessionWithKeys | null, provider: string): boolean {
  if (!session || !provider) return false;
  const map = session.userKeyProviders || {};
  return Boolean(map[provider]);
}

export default {
  hasUserProvidedAnyKey,
  hasUserProvidedKeyFor,
  markUserProvidedKey,
};
