import express, { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import promClient from 'prom-client';

import corsMiddleware from './middleware/corsConfig.js';
import sessionMiddleware from './middleware/sessionConfig.js';
import deduplicateRequests from './middleware/deduplicateRequests.js';
import requireDemoToken from './middleware/requireDemoToken.js';
import redisCache from './utils/redisCache.js';

// ---------------------------------------------------------------------------
// Logging – privacy-preserving structured logs available via /api/bug-report.
// ---------------------------------------------------------------------------
import logger from './utils/logger.js';

import threadRoutes from './routes/thread.js';
import messageRoutes from './routes/message.js';
import uploadRoutes from './routes/upload.js';

// Aggregated versioned API router (src/routes/index.js)
import api from './routes/index.js';
import bugReportRoutes from './routes/bugReport.js';

// Individual routers temporarily kept for backward-compatibility while the
// frontend migrates to the new versioned endpoints.  Will be removed in the
// next major release.
import fileRoutes from './routes/files.js';
import chatRoutes from './routes/chat/index.js';
import trialRoutes from './routes/trial.js';
import storyboardRoutes from './routes/storyboard.js';
import transcribeRoutes from './routes/transcribe.js';
import { buildManifest } from './mcp/manifest.js';
import { mountMcpTransports } from './mcp/transports.js';

// Global type for metrics init flag
declare global {
  // eslint-disable-next-line no-var
  var __prvcticeMetricsInit: boolean | undefined;
}

const app: Express = express();
const MCP_ENABLED = process.env.MCP_ENABLED === 'true';
// Configure proxy trust: trust first proxy in production, disable in development
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', false);
}
app.disable('x-powered-by');
app.use(helmet());
if (!global.__prvcticeMetricsInit) {
  promClient.collectDefaultMetrics();
  global.__prvcticeMetricsInit = true;
}

// -------------------------------------------------------------
// Content-Security-Policy
// -------------------------------------------------------------
// Electron already sandboxes the renderer process.  In the packaged desktop
// build we therefore run with a *relaxed* CSP to avoid blocking legitimate
// module/asset requests (e.g. Three.js fetching .gltf, .bin, texture files).
//
// In the standalone web build we keep the stricter rules for traditional
// browser security.  The check relies on IS_ELECTRON which is set by
// main.js *before* this file is required.

const isElectron = process.env.IS_ELECTRON === 'true';

if (!isElectron) {
  // ---------------------------------------------------------------------
  // CSP for web builds – security hardened
  // ---------------------------------------------------------------------
  // REMOVED 'unsafe-eval': No longer needed after refactoring handtrack.ts
  //   to use native dynamic import() instead of new Function().
  //
  // 'unsafe-inline' is required because:
  //   1. index.html contains inline <script> blocks for prvStorage shim,
  //      vendor-ready promise, and the legacy script loader.
  //   2. Vite injects inline scripts during development (HMR client).
  //   3. Some CSS-in-JS patterns may inject inline styles.
  //
  // TODO: Migrate inline scripts to external files and use nonces/hashes
  //       to fully eliminate 'unsafe-inline' in a future release.
  // ---------------------------------------------------------------------
  app.use(
    helmet.contentSecurityPolicy({
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        scriptSrcElem: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        // Permit inline event handlers if any exist
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        // Allow workers created from blob URLs (e.g., libraries using inline workers)
        workerSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'data:'],
        connectSrc: [
          "'self'",
          // Allow secure websockets for Socket.IO or similar
          'wss:',
          // Allow HTTPS connections to third parties if needed by tools
          'https:',
          // Allow blob: fetch for local object URLs used by image previews
          'blob:',
          'https://api.open-meteo.com',
          'https://geocoding-api.open-meteo.com',
        ],
        frameSrc: ["'self'", 'https://www.youtube.com'],
      },
    })
  );
} else {
  // ---------------------------------------------------------------------
  // CSP for Electron builds – relaxed but still secure
  // ---------------------------------------------------------------------
  // Electron sandboxes the renderer process, so CSP is less critical here.
  // REMOVED 'unsafe-eval': No code path requires it after refactoring.
  // 'unsafe-inline' kept for embedded HTML scripts/styles in packaged assets.
  // ---------------------------------------------------------------------
  app.use(
    helmet.contentSecurityPolicy({
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        frameSrc: ["'self'", 'https:'],
        workerSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'https:', 'data:'],
      },
    })
  );
}
// Allow relaxed Cross-Origin-Resource-Policy when running inside the Electron shell
app.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.IS_ELECTRON) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  next();
});
// Body parsing and static assets
// Increase JSON body size to allow larger base64-encoded images for Gemini editing
// Raised from 12mb -> 50mb
app.use(express.json({ limit: '50mb' }));
// ---------------------------------------------------------------------------
// Static assets (development and Electron only)
// ---------------------------------------------------------------------------
// In production the frontend is served by CloudFront/S3, so Express only
// handles API, WebSocket, and MCP traffic.  In development and Electron
// builds we continue to serve static files so HMR and packaged apps work.

if (process.env.NODE_ENV !== 'production') {
  const distDir = path.join(__dirname, '../dist');
  let staticDir: string;

  // Prefer the optimised Vite build whenever it exists.
  // This avoids accidental fallbacks to the raw `public/` tree in desktop
  // builds and during forge start when NODE_ENV may be unset.
  if (fs.existsSync(distDir)) {
    staticDir = distDir;
  } else {
    staticDir = path.join(__dirname, '../public');
  }

  const staticRootName = path.basename(staticDir);
  app.set('staticRoot', staticRootName);
  try {
    logger.info('static', { serving: path.relative(process.cwd(), staticDir) });
  } catch (_) {
    /* noop */
  }

  // Main static assets
  app.use(express.static(staticDir));

  // Expose es-module-shims from node_modules so the relative path in
  // index.html works inside the packaged Electron build where only `dist/`
  // is served by default.
  app.use(
    '/node_modules/es-module-shims/dist',
    express.static(path.join(__dirname, '../node_modules/es-module-shims/dist'))
  );

  // Explicit model asset route – maps absolute "/model/…" URLs back to the
  // correct folder inside the static root.
  app.use('/model', express.static(path.join(staticDir, 'model')));
} else {
  app.set('staticRoot', 'none');
}

// ---------------------------------------------------------------------------
// Health, readiness, metrics, and MCP endpoints (always accessible)
// ---------------------------------------------------------------------------

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).send('ok');
});

app.get('/readyz', async (_req: Request, res: Response) => {
  let redisReady = false;
  try {
    redisReady = await redisCache.isEnabled();
  } catch (err) {
    logger.debug('redis_check_failed', { error: (err as Error).message });
    redisReady = false;
  }
  const status = redisReady ? 200 : 503;
  res.status(status).json({
    redis: redisReady,
    uptime: process.uptime(),
  });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Discovery document for Model Context Protocol clients
if (MCP_ENABLED) {
  app.get('/.well-known/mcp.json', (req: Request, res: Response) => {
    try {
      res.json(buildManifest(req, { path: '/mcp' }));
    } catch (err) {
      res.status(500).json({ error: 'Failed to build MCP manifest' });
    }
  });

  // MCP Streamable HTTP transport (POST/GET/DELETE /mcp for JSON-RPC via SDK)
  // WebSocket transport is handled separately by setupMcpWebSocket in server.ts
  mountMcpTransports(app);
}

// Rate limiting for all API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // tightened from 100
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);
// Stricter rate limiting for heavy endpoints (e.g., chat completions, image gen)
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15, // tightened from 20
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/message', heavyLimiter);
// Middlewares: CORS, session, dedupe
app.use(corsMiddleware);
app.use(sessionMiddleware as RequestHandler);
app.use(deduplicateRequests);

// Structured request logging – must be mounted *after* rate-limit/session
// middleware so that the logger sees the final status code but *before* the
// actual route handlers.
app.use(logger.requestLogger);

// Route handlers
// Versioned root – new grouped routes live under /api/v1/*
app.use('/api/v1/connectors/ai', requireDemoToken);
app.use('/api/v1/search', requireDemoToken);
app.use('/api/v1/media', requireDemoToken);
app.use('/api/v1/files', requireDemoToken);
app.use('/api/v1', api);

app.use('/api/thread', threadRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/upload', uploadRoutes);
// Legacy mounts – will be replaced by /api/v1/* once the UI is updated.
app.use('/api/files', requireDemoToken, fileRoutes);
app.use('/chat', chatRoutes);
// Bug report endpoint – allows users to fetch sanitised log excerpts.
app.use('/api/bug-report', requireDemoToken, bugReportRoutes);
// Trial mode endpoint – server-verified trial session management.
app.use('/api/trial', trialRoutes);
// Storyboard API for mood-board and video thumbnail retrieval
app.use('/api/storyboard', storyboardRoutes);
// Whisper transcription endpoint
app.use('/api/transcribe', transcribeRoutes);

interface ClearQuery {
  reload?: string;
}

app.post('/api/clear', (req: Request<unknown, unknown, unknown, ClearQuery>, res: Response) => {
  const isReload = req.query.reload === 'true';

  if (isReload) {
    logger.info('session_clear_reload');
    req.session.destroy((err) => {
      if (err) {
        logger.error('session_destroy_failed', { error: err.message });
        res.status(500).json({ message: 'Failed to clear session on reload.' });
        return;
      }
      res.status(200).json({ message: 'Session cleared on reload.' });
    });
  } else {
    res.status(200).json({ message: 'Session cleared without reload flag.' });
  }
});

// Global error handler – logs the full stack trace *once* before returning a
// generic 500 to the client so that no implementation details are leaked.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ error: 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// Startup observability – log effective defaults and runtime context
// ---------------------------------------------------------------------------
(async () => {
  try {
    const { loadDefaults } = await import('./config/defaults.js');
    const defaults = loadDefaults();
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    logger.info('startup', {
      version: pkg.version,
      staticRoot: app.get('staticRoot'),
      defaults: {
        providerDefault: defaults.providerDefault,
        models: defaults.models,
        reasoningDefault: defaults.reasoningDefault,
        features: defaults.features,
      },
      env: {
        hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        hasGoogle: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
      },
    });
  } catch (_) {
    // ignore – logging is best-effort
  }
})();

export default app;
