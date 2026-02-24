// Shared CORS origin allowlist used by both Express CORS middleware and Socket.IO.
// Default origins for local development. Set CORS_ORIGINS env var for production.
const DEFAULT_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:45123',
];

const envOrigins: string[] =
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) || [];

export const corsAllowlist: readonly string[] =
  envOrigins.length > 0 ? envOrigins : DEFAULT_ORIGINS;
