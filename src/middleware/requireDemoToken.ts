import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'node:crypto';

const DEMO_ACCESS_TOKEN = process.env.DEMO_ACCESS_TOKEN || '';
const DEMO_TOKEN_REQUIRED = process.env.DEMO_TOKEN_REQUIRED === 'true';

function extractToken(req: Request): string | null {
  const header = req.get?.('authorization') || req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }

  const demoHeader = req.get?.('x-demo-token') || req.headers?.['x-demo-token'];
  if (typeof demoHeader === 'string' && demoHeader.trim()) {
    return demoHeader.trim();
  }

  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

const requireDemoToken: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!DEMO_ACCESS_TOKEN) {
    if (DEMO_TOKEN_REQUIRED) {
      res.status(503).json({ error: 'Demo access token not configured' });
      return;
    }
    next();
    return;
  }

  const provided = extractToken(req);
  if (!provided) {
    res.status(401).json({ error: 'Demo access token required' });
    return;
  }
  if (!timingSafeEqual(provided, DEMO_ACCESS_TOKEN)) {
    res.status(403).json({ error: 'Invalid demo access token' });
    return;
  }

  next();
};

export default requireDemoToken;
module.exports = requireDemoToken;
