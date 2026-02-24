import { Router, Request, Response } from 'express';
import { routeRequest, type RouteDecision } from '../services/requestRouter.js';

const router = Router();

interface RouteRequestBody {
  [key: string]: unknown;
}

interface RouteResponse {
  ok: boolean;
  decision?: RouteDecision;
  endpoint?: string;
  error?: string;
}

/**
 * Simple API to classify a request and suggest an endpoint/model.
 * This does not perform the request; it only returns the routing decision.
 */
router.post(
  '/',
  (req: Request<object, RouteResponse, RouteRequestBody>, res: Response<RouteResponse>): void => {
    try {
      const input = req.body || {};
      const decision = routeRequest(input);

      // Map decision to a suggested API endpoint the client can call next.
      // All requests go to the unified chat endpoint.
      const endpoint = '/api/v1/chat';

      // Note: image_generate/image_edit tasks are no longer supported
      // The router now only returns chat_text or chat_vision

      res.json({ ok: true, decision, endpoint });
    } catch (err) {
      const msg: string = (err instanceof Error ? err.message : String(err)) || 'routing error';
      res.status(400).json({ ok: false, error: msg });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
