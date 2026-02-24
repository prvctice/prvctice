/**
 * Bug report route - returns last N log lines.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import logger from '../utils/logger.js';
import { loadDefaults } from '../config/defaults.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as { version: string };

const router = Router();

interface BugReportQuery {
  lines?: string;
}

interface BugReportResponse {
  reportId?: string;
  generated?: string;
  logLines?: string[];
  defaults?: {
    providerDefault: string | undefined;
    models: unknown;
    reasoningDefault: string | undefined;
    features: unknown;
    fileHash: string | null;
  };
  runtime?: {
    version: string;
    staticRoot: string;
    env: {
      hasOpenAI: boolean;
      hasAnthropic: boolean;
      hasGoogle: boolean;
    };
  };
  error?: string;
}

// GET /api/bug-report?lines=N
router.get(
  '/',
  (
    req: Request<object, BugReportResponse, object, BugReportQuery>,
    res: Response<BugReportResponse>
  ): void => {
    const logPath = logger.getLogFilePath();

    const maxLines = 1000;
    let linesRequested = parseInt(req.query.lines || '', 10);
    if (Number.isNaN(linesRequested) || linesRequested <= 0) linesRequested = 200;
    if (linesRequested > maxLines) linesRequested = maxLines;

    try {
      const data = fs.readFileSync(logPath, 'utf8');
      const lines = data.trim().split(/\r?\n/);
      const selected = lines.slice(-linesRequested);

      // Effective defaults snapshot (non-sensitive)
      let defaults: ReturnType<typeof loadDefaults> | undefined;
      let defaultsHash: string | null = null;
      try {
        defaults = loadDefaults();
        const cfgPath = path.join(__dirname, '../../config/defaults.json');
        const raw = fs.readFileSync(cfgPath);
        defaultsHash = crypto.createHash('sha256').update(raw).digest('hex');
      } catch (_) {
        // Ignore errors loading defaults
      }

      // Runtime metadata (non-sensitive)
      const runtime = {
        version: pkg.version,
        staticRoot: (req.app.get('staticRoot') as string) || 'public',
        env: {
          hasOpenAI: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
          hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
          hasGoogle: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
        },
      };

      const report: BugReportResponse = {
        reportId: crypto.randomUUID(),
        generated: new Date().toISOString(),
        logLines: selected,
        defaults: defaults
          ? {
              providerDefault: defaults.providerDefault,
              models: defaults.models,
              reasoningDefault: defaults.reasoningDefault,
              features: defaults.features,
              fileHash: defaultsHash,
            }
          : undefined,
        runtime,
      };

      res.json(report);
    } catch (err) {
      logger.error('Failed to generate bug report', { error: (err as Error).message });
      res.status(500).json({ error: 'Could not generate bug report.' });
    }
  }
);

export default router;

// CommonJS compatibility for mixed codebase
module.exports = router;
