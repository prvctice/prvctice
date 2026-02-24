// Lightweight structured logger - no external deps, ND-JSON output.

import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { getElectronUserData } from './electronPaths.js';

// Config
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? LEVELS.info;

// Persistent file - use userData in Electron, fallback to project logs dir
const ELECTRON_USER_DATA = getElectronUserData();
const LOG_DIR = ELECTRON_USER_DATA
  ? path.join(ELECTRON_USER_DATA, 'logs')
  : path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE_PATH = path.join(LOG_DIR, 'app.log');
const LOG_STREAM = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a' });

// Stream cleanup to prevent file descriptor leaks
let streamClosed = false;

function closeLogStream(): void {
  if (streamClosed) return;
  streamClosed = true;
  LOG_STREAM.end();
}

process.on('exit', closeLogStream);
process.on('SIGINT', closeLogStream);
process.on('SIGTERM', closeLogStream);

// Exact keys to redact (matched case-insensitively)
const SENSITIVE_KEYS_EXACT: ReadonlySet<string> = new Set([
  'password',
  'token',
  'accesstoken',
  'auth',
  'authorization',
  'cookie',
  'set-cookie',
  'session',
  'email',
  'apikey',
  'refreshtoken',
  'secret',
  'credential',
  'x-demo-token',
]);

// Substrings that trigger redaction when found in a key (case-insensitive).
// Catches provider-prefixed keys like anthropicApiKey, geminiApiKey, etc.
const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  'apikey',
  'api_key',
  'secret',
  'password',
  'token',
  'credential',
  'lmstudio-url',
  'openai-key',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

// Deep-clone & redact.
function sanitize(value: unknown): unknown {
  if (!isObject(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  const clone: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const lower = key.toLowerCase();
    const isSensitive =
      SENSITIVE_KEYS_EXACT.has(lower) || SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
    if (isSensitive) {
      clone[key] = '[REDACTED]';
    } else if (isObject(val)) {
      clone[key] = sanitize(val);
    } else {
      clone[key] = val;
    }
  }
  return clone;
}

function write(level: LogLevel, message: string, meta: Record<string, unknown>): void {
  if (LEVELS[level] > CURRENT_LEVEL) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(sanitize(meta) as Record<string, unknown>),
  };

  const line = JSON.stringify(entry);
  LOG_STREAM.write(line + '\n');

  // Also print to console.
  const target = level === 'error' ? console.error : console.log;
  target(line);
}

// Public API
export interface Logger {
  error: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  trace: (msg: string, meta?: Record<string, unknown>) => void;
  getLogFilePath: () => string;
  requestLogger: (req: Request, res: Response, next: NextFunction) => void;
}

const logger: Logger = {
  error: (msg, meta = {}) => write('error', msg, meta),
  warn: (msg, meta = {}) => write('warn', msg, meta),
  info: (msg, meta = {}) => write('info', msg, meta),
  debug: (msg, meta = {}) => write('debug', msg, meta),
  trace: (msg, meta = {}) => write('trace', msg, meta),

  // Expose path so other modules can read the file.
  getLogFilePath() {
    return LOG_FILE_PATH;
  },

  // Express request logger middleware.
  requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;

      const meta: Record<string, unknown> = {
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        duration: `${durationMs.toFixed(2)}ms`,
      };

      // Only include body & query if something went wrong (>=400). Even then we
      // sanitise the payload to avoid accidental PII leakage.
      if (res.statusCode >= 400) {
        if (req.body && Object.keys(req.body).length > 0) meta.body = req.body;
        if (req.query && Object.keys(req.query).length > 0) meta.query = req.query;
      }

      logger.info('HTTP', meta);
    });

    next();
  },
};

export default logger;
export { closeLogStream };

// CommonJS compatibility for mixed codebase
module.exports = logger;
module.exports.closeLogStream = closeLogStream;
