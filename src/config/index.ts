import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import logger from '../utils/logger.js';

// Load .env only from project root during development. Do not attempt to load
// or bundle an .env in packaged desktop builds - secrets must live on the server.
const devEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(devEnvPath)) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    require('dotenv').config({ path: devEnvPath });
  } catch {
    // Ignore dotenv load errors
  }
}

interface PackagedDesktopEnv {
  AUTO_UPDATE_BASE_URL?: string;
  [key: string]: string | undefined;
}

let packagedDesktopEnv: PackagedDesktopEnv = {};
try {
  const desktopEnvPath = path.join(__dirname, 'desktop-env.json');
  if (fs.existsSync(desktopEnvPath)) {
    packagedDesktopEnv = JSON.parse(fs.readFileSync(desktopEnvPath, 'utf8'));
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.warn('desktop_env_config_load_failed', { error: message });
}

// Determine port: use explicit PORT env if set; else use ephemeral port in Electron, default 3000 in Node
const envPort = process.env.PORT;
const isElectron = Boolean(
  process.versions && (process.versions as NodeJS.ProcessVersions & { electron?: string }).electron
);
// In packaged Electron we need a stable origin so that `localStorage` persists
// across launches. Using an ephemeral port (0) changes the origin every run
// which wipes all browser-side storage. Use a fixed high port instead.
// Use an uncommon, high port in Electron builds to avoid conflicts while
// keeping the origin stable for `localStorage` (must remain constant across
// launches). 45123 is arbitrary, sitting well above the IANA registered
// range and below the ephemeral port upper bound.
const configPort = envPort != null ? Number(envPort) : isElectron ? 45123 : 3000;

// Enforce SESSION_SECRET in production, but allow a default in non-production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  logger.error('session_secret_missing', {
    message: 'SESSION_SECRET environment variable is required in production',
  });
  process.exit(1);
}

// Use a fallback secret for development/local environments.
// Generate a random secret if not provided (safe for dev, but sessions won't
// persist across server restarts).
const sessionSecret =
  process.env.SESSION_SECRET ||
  (() => {
    const generated = crypto.randomBytes(32).toString('hex');
    logger.warn('session_secret_not_set', {
      message:
        'Using random secret for this session. Sessions will not persist across server restarts.',
    });
    return generated;
  })();

const autoUpdateBaseUrl =
  process.env.AUTO_UPDATE_BASE_URL || packagedDesktopEnv.AUTO_UPDATE_BASE_URL;

// API URL for Electron desktop builds. Defaults to localhost for dev/self-hosted.
const configApiUrl =
  process.env.PRVCTICE_API_URL || packagedDesktopEnv.PRVCTICE_API_URL || 'http://localhost:3000';

export interface AppConfig {
  port: number;
  sessionSecret: string;
  nodeEnv: string | undefined;
  autoUpdateBaseUrl: string | undefined;
  /** Base URL for API requests in Electron desktop builds.
   * Defaults to http://localhost:3000 for dev/self-hosted.
   * Set PRVCTICE_API_URL env var or add to desktop-env.json. */
  apiUrl: string;
  redisUrl: string | undefined;
  redisHost: string | undefined;
  redisPort: string | undefined;
  redisPassword: string | undefined;
  googleApiKey: string | undefined;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
}

const config: AppConfig = {
  port: configPort,
  sessionSecret,
  nodeEnv: process.env.NODE_ENV,
  // Base URL to your S3 update bucket/folder (no trailing slash), e.g.
  // https://my-bucket.s3.amazonaws.com/prvctice/darwin/arm64
  autoUpdateBaseUrl,
  apiUrl: configApiUrl,

  // Redis credentials (optional). Session store will fall back when absent.
  redisUrl: process.env.REDIS_URL,
  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT,
  redisPassword: process.env.REDIS_PASSWORD,

  // Optional Google API credentials (required for Web Speech recognition in
  // packaged Electron builds). If these variables are *not* present the app
  // will still run, but features that rely on Google-hosted services (e.g.
  // `SpeechRecognition`) will fail with a `network` error.
  googleApiKey: process.env.GOOGLE_API_KEY,
  googleClientId: process.env.GOOGLE_DEFAULT_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_DEFAULT_CLIENT_SECRET,
};

export default config;
export const {
  port,
  apiUrl,
  redisUrl,
  redisHost,
  redisPort,
  redisPassword,
  googleApiKey,
  googleClientId,
  googleClientSecret,
} = config;

// CommonJS compatibility for mixed codebase
module.exports = config;
