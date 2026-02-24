/*
 * Normalised error wrapper so all adapters expose the same surface.
 */

'use strict';

interface ProviderErrorOptions {
  provider: string;
  message: string;
  code?: string | number;
  retriable?: boolean;
}

class ProviderError extends Error {
  provider: string;
  code: string | number | undefined;
  retriable: boolean;

  constructor({ provider, message, code, retriable = false }: ProviderErrorOptions) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.retriable = Boolean(retriable);
  }
}

interface ErrorWithCode extends Error {
  code?: string | number;
  status?: number;
  statusCode?: number;
}

/*
 * Convert arbitrary SDK / HTTP errors into a ProviderError instance.
 * Currently uses naive heuristics: HTTP 429 / 5xx => retriable.
 */
function normaliseError(provider: string, err: ErrorWithCode): ProviderError {
  if (err instanceof ProviderError) return err;

  let code: string | number | undefined = err.code || err.status || err.statusCode;
  let retriable = false;

  if (typeof code === 'number') {
    retriable = code >= 500 || code === 429;
  } else if (typeof code === 'string') {
    const n = Number.parseInt(code, 10);
    if (!Number.isNaN(n)) {
      retriable = n >= 500 || n === 429;
      code = n;
    }
  }

  return new ProviderError({ provider, message: err.message || 'Provider error', code, retriable });
}

module.exports = {
  ProviderError,
  normaliseError,
};

export { ProviderError, normaliseError };
