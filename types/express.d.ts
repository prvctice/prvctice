/**
 * Express type extensions
 */

import type { Provider } from './adapters';

declare global {
  namespace Express {
    interface Request {
      provider?: Provider;
      apiKey?: string;
      sessionId?: string;
    }
    interface Session {
      apiKeys?: Record<Provider, string>;
      userId?: string;
    }
  }
}

export {};
