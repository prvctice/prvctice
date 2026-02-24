/**
 * Lightweight request-body validation middleware.
 *
 * Designed to be used with Zod schemas but degrades gracefully when Zod is
 * not available (e.g. during offline development or unit tests).
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger.js';

interface ValidationIssue {
  message: string;
  path?: (string | number)[];
  code?: string;
}

interface ValidationError {
  issues?: ValidationIssue[];
}

interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: ValidationError;
}

interface Schema<T = unknown> {
  safeParse(data: unknown): SafeParseResult<T>;
}

/**
 * Creates a validation middleware for the given schema.
 * The schema must expose a `safeParse` method that returns `{ success: boolean, data?: any }`.
 */
function validate<T = unknown>(schema: Schema<T> | null | undefined): RequestHandler {
  // If the caller passed `null` or a non-object, skip validation entirely so
  // the route can still work in legacy mode.
  if (!schema || typeof schema !== 'object') {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (typeof schema.safeParse !== 'function') {
        // Not a Zod-like schema – bypass validation.
        next();
        return;
      }

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error?.issues });
        return;
      }

      // Replace body with parsed/typed data so downstream handlers receive an
      // object that conforms to the schema.
      req.body = parsed.data;
      next();
    } catch (err) {
      // On unexpected errors fail closed to avoid passing potentially unsafe
      // input further down the chain.
      logger.error('validation_middleware_error', { error: (err as Error).message || String(err) });
      res.status(400).json({ error: 'Invalid request payload' });
    }
  };
}

export default validate;

// CommonJS compatibility for mixed codebase
module.exports = validate;
