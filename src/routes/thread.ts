import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import logger from '../utils/logger.js';
import {
  normaliseProviderName,
  setHistoryForProvider,
  clearHistory,
  syncHistoryBetweenProviders,
  type ChatHistoryMessage,
} from '../utils/mcpHistory.js';

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    threadId?: string | null;
    isNewSession?: boolean;
  }
}

function safeUUID(): string {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {
    // Fall through to fallback
  }
  // Fallback: v4-like UUID using crypto.randomBytes
  try {
    const b = crypto.randomBytes(16);
    const b6 = b[6] ?? 0;
    const b8 = b[8] ?? 0;
    b[6] = (b6 & 0x0f) | 0x40; // version 4
    b[8] = (b8 & 0x3f) | 0x80; // variant 10
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch (_) {
    // Last resort timestamp-based
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }
}

const router = Router();

interface ThreadResponse {
  threadId?: string;
  error?: string;
}

interface ClearResponse {
  message?: string;
  error?: string;
}

interface RestoreBody {
  messages?: Array<{ role?: string; content?: string }>;
  provider?: string;
}

interface RestoreResponse {
  ok?: boolean;
  count?: number;
  error?: string;
}

/** Content part in multi-modal message */
interface SyncContentPart {
  type?: string;
  text?: string;
  image_url?: { url?: string };
}

interface SyncProviderBody {
  fromProvider?: string;
  toProvider?: string;
  messages?: Array<{
    role?: string;
    content?: string | SyncContentPart[];
  }>;
}

interface SyncProviderResponse {
  ok?: boolean;
  count?: number;
  error?: string;
}

router.get('/', (req: Request, res: Response<ThreadResponse>): void => {
  try {
    if (!req.session) {
      logger.warn('thread_session_missing');
      // Instruct client to reload so a fresh session cookie can be negotiated.
      res.status(400).json({ error: 'Session unavailable. Please reload the page and try again.' });
      return;
    }

    logger.debug('thread_request');
    const threadId = safeUUID();
    req.session.threadId = threadId;
    res.json({ threadId });
  } catch (error) {
    logger.error('thread_create_error', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to create thread ID.' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/thread/clear – reset the current conversation
// -----------------------------------------------------------------------------
router.post(
  '/clear',
  (
    req: Request<object, ClearResponse, { provider?: string }>,
    res: Response<ClearResponse>
  ): void => {
    try {
      if (!req.session) {
        logger.warn('thread_clear_session_missing');
        res
          .status(400)
          .json({ error: 'Session unavailable. Please reload the page and try again.' });
        return;
      }

      req.session.threadId = null;
      req.session.isNewSession = true;
      const providerFromBody =
        typeof req.body?.provider === 'string' && req.body.provider.trim()
          ? req.body.provider.trim()
          : null;
      if (providerFromBody) {
        clearHistory(req.session, providerFromBody);
      } else {
        clearHistory(req.session);
      }

      res.json({ message: 'Session and thread reset successfully.' });
    } catch (error) {
      logger.error('thread_reset_error', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to reset session.' });
    }
  }
);

router.post(
  '/restore',
  (req: Request<object, RestoreResponse, RestoreBody>, res: Response<RestoreResponse>): void => {
    try {
      if (!req.session) {
        logger.warn('thread_restore_session_missing');
        res
          .status(400)
          .json({ error: 'Session unavailable. Please reload the page and try again.' });
        return;
      }
      const list = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const out: ChatHistoryMessage[] = [];
      for (const entry of list) {
        if (!entry || typeof entry.content !== 'string') continue;
        const text = entry.content.trim();
        if (!text) continue;
        const role: 'user' | 'assistant' = entry.role === 'assistant' ? 'assistant' : 'user';
        out.push({ role, content: text });
        if (out.length >= 40) break;
      }
      const providerFromBody =
        typeof req.body?.provider === 'string' && req.body.provider.trim()
          ? req.body.provider.trim()
          : null;
      const providerKey = normaliseProviderName(providerFromBody || 'anthropic');
      setHistoryForProvider(req.session, providerKey, out);
      res.json({ ok: true, count: out.length });
    } catch (err) {
      logger.error('thread_restore_error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to restore thread history.' });
    }
  }
);

router.post(
  '/sync-provider',
  (
    req: Request<object, SyncProviderResponse, SyncProviderBody>,
    res: Response<SyncProviderResponse>
  ): void => {
    try {
      if (!req.session) {
        logger.warn('thread_sync_session_missing');
        res
          .status(400)
          .json({ error: 'Session unavailable. Please reload the page and try again.' });
        return;
      }

      const fromProvider =
        typeof req.body?.fromProvider === 'string' ? req.body.fromProvider.trim() : '';
      const toProvider = typeof req.body?.toProvider === 'string' ? req.body.toProvider.trim() : '';

      if (!fromProvider || !toProvider) {
        res.status(400).json({ error: 'fromProvider and toProvider are required.' });
        return;
      }

      // Convert client messages to ChatHistoryMessage format
      const clientMessages: ChatHistoryMessage[] = [];
      if (Array.isArray(req.body?.messages)) {
        for (const entry of req.body.messages) {
          if (!entry) continue;

          let text = '';
          const content = entry.content;

          // Handle string content
          if (typeof content === 'string') {
            text = content.trim();
          }
          // Handle array content (multi-modal)
          else if (Array.isArray(content)) {
            // Extract text parts, note that images are present
            const textParts: string[] = [];
            let hasImages = false;
            for (const part of content) {
              if (part?.type === 'text' && part.text) {
                textParts.push(part.text);
              } else if (part?.type === 'image_url') {
                hasImages = true;
              }
            }
            text = textParts.join('\n');
            // Add placeholder for image-only messages
            if (hasImages && !text) {
              text = '[Image]';
            }
          }

          if (!text) continue;
          const role: 'user' | 'assistant' = entry.role === 'assistant' ? 'assistant' : 'user';
          clientMessages.push({ role, content: text });
          if (clientMessages.length >= 40) break; // Limit same as restore
        }
      }

      const result = syncHistoryBetweenProviders(
        req.session,
        fromProvider,
        toProvider,
        clientMessages.length > 0 ? clientMessages : undefined
      );

      logger.info('thread_sync_provider', {
        from: fromProvider,
        to: toProvider,
        count: result.count,
      });
      res.json({ ok: result.ok, count: result.count });
    } catch (err) {
      logger.error('thread_sync_provider_error', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to sync provider history.' });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
