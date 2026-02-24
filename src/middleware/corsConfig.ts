import cors from 'cors';
import type { RequestHandler } from 'express';
import { corsAllowlist } from './corsAllowlist.js';

type CorsCallback = (err: Error | null, allow?: boolean) => void;

const corsMiddleware: RequestHandler = cors({
  origin(origin: string | undefined, callback: CorsCallback) {
    if (!origin) {
      return callback(null, true);
    }
    if (corsAllowlist.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Demo-Token'],
  credentials: true,
});

export default corsMiddleware;
module.exports = corsMiddleware;
