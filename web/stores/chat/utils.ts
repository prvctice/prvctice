/**
 * Chat store utilities
 * Common helper functions used across the chat store
 */

import type { NotificationKind } from '@web/types/chat.js';

/**
 * Generate a UUID
 */
export function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch (_) {
    // Intentional: fallback to manual UUID when crypto.randomUUID unavailable
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }
}

/**
 * Format tool name for display
 */
export function prettyToolName(name: string | undefined | null): string {
  if (!name) return 'tool';
  return String(name)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Regex for citation tokens in assistant messages
 */
export const CITATION_TOKEN_REGEX = /\uE200cite\uE202([\s\S]+?)\uE201/g;

/**
 * Normalize citation tokens in text
 */
export function normalizeCitations(text: string | undefined | null): string {
  if (!text) return text ?? '';
  return text.replace(CITATION_TOKEN_REGEX, (_, ref: string) => {
    const payload = String(ref || '').trim();
    if (/^https?:\/\//i.test(payload)) return ` <${payload}>`;
    return '';
  });
}

interface NotifAction {
  label: string;
  handler: () => void;
}

/**
 * Show a notification via the legacy notification system
 */
export function notify(kind: NotificationKind, message: string, action?: NotifAction): void {
  try {
    if (action && typeof window.appendNotifsWithAction === 'function') {
      window.appendNotifsWithAction(kind, message, action);
    } else if (typeof window.appendNotifs === 'function') {
      window.appendNotifs(kind, message);
    }
  } catch (_) {
    // Intentional: notification system is optional (best-effort)
  }
}

/**
 * Constants
 */
export const MAX_CONVERSATIONS = 20;
export const MAX_SYNC_MESSAGES = 40;
export const TITLE_FALLBACK = 'New chat';

/**
 * Derive a conversation title from text
 */
export function deriveConversationTitle(text: string = ''): string {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return TITLE_FALLBACK;
  return clean.slice(0, 80);
}
