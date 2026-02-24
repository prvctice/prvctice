/**
 * /message route – sends data to the AI via the assistant service.
 * Legacy route - most functionality has moved to /api/v1/chat
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger.js';

const router = Router();

interface MessageBody {
  content?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  images?: Array<{ data?: string; mimeType?: string }>;
  [key: string]: unknown;
}

interface MessageResponse {
  success?: boolean;
  message?: string;
  response?: string;
  error?: string;
}

/**
 * POST /message
 * Legacy endpoint - deprecated, use /api/v1/chat instead
 */
router.post(
  '/',
  async (
    req: Request<object, MessageResponse, MessageBody>,
    res: Response<MessageResponse>
  ): Promise<void> => {
    try {
      const { content } = req.body;

      if (!content) {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      // This route is deprecated - redirect to the new chat endpoint
      logger.warn('deprecated_message_route_called');
      res.status(410).json({
        success: false,
        error: 'This endpoint is deprecated. Please use /api/v1/chat instead.',
      });
    } catch (err) {
      logger.error('message_route_error', { error: (err as Error).message });
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
