/**
 * Trial Mode Routes
 * --------------------------------------------------------------------------
 * Minimal trial status endpoint. Trial state is managed client-side via
 * localStorage (message count, cooldown, cycle number). Server-side
 * validation of trial limits happens in the chat route on each request.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/trial/status
 *
 * Health check / status endpoint for trial subsystem.
 * Trial state is client-managed; this exists for health checking
 * and potential future server-side trial queries.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
