import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';
import storage from '../storage/node/sqlite.js';

const router = Router();

// GET /api/v1/search/messages?q=...&limit=20
router.get('/messages', async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    return res.json({ results: [] });
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

  try {
    const results = await storage.search.searchMessages(query, { limit });
    return res.json({ results });
  } catch (err) {
    logger.error('search_messages_error', { error: (err as Error).message });
    return res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/v1/search/index -- index a single message
router.post('/index', async (req: Request, res: Response) => {
  const { id, conversationId, text, role, conversationTitle } = req.body || {};

  if (!id || !conversationId || typeof text !== 'string') {
    return res.status(400).json({ error: 'id, conversationId, and text are required' });
  }

  try {
    await storage.search.indexMessage({
      id,
      conversationId,
      text,
      role: role || 'user',
    });

    // Also upsert conversation record (for title lookups in search results)
    if (conversationTitle) {
      await storage.conversations.put({
        id: conversationId,
        title: conversationTitle,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error('search_index_error', { error: (err as Error).message });
    return res.status(500).json({ error: 'Index failed' });
  }
});

// POST /api/v1/search/bulk-index -- index multiple messages at once
router.post('/bulk-index', async (req: Request, res: Response) => {
  const { messages, conversationId, conversationTitle } = req.body || {};

  if (!Array.isArray(messages) || !conversationId) {
    return res.status(400).json({ error: 'messages array and conversationId are required' });
  }

  try {
    const toIndex = messages
      .filter(
        (m: Record<string, unknown>) => m && typeof m.id === 'string' && typeof m.text === 'string'
      )
      .map((m: Record<string, unknown>) => ({
        id: m.id as string,
        conversationId,
        text: m.text as string,
        role: (m.role as string) || 'user',
      }));

    const count = await storage.search.bulkIndexMessages(toIndex);

    // Upsert conversation for title lookups
    if (conversationTitle) {
      await storage.conversations.put({
        id: conversationId,
        title: conversationTitle,
      });
    }

    return res.json({ ok: true, indexed: count });
  } catch (err) {
    logger.error('search_bulk_index_error', { error: (err as Error).message });
    return res.status(500).json({ error: 'Bulk index failed' });
  }
});

export default router;
