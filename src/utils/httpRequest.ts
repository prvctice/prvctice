/*
 * Tiny wrapper around https.request used by the fallback code paths of the
 * LLM adapters.  Handles the JSON-serialisation of the request body, adds
 * common headers and returns a Promise resolving to the `IncomingMessage`
 * response which can subsequently be piped into `parseSSE`.
 */

'use strict';

import * as https from 'https';
import type { IncomingMessage, OutgoingHttpHeaders } from 'http';

interface PostJSONOptions {
  hostname: string;
  path: string;
  body: Record<string, unknown>;
  headers?: OutgoingHttpHeaders;
  timeout?: number;
}

/**
 * Make a POST request with a JSON body and return the Node.js response stream
 * once headers have been received.
 *
 * This helper purposefully keeps its feature-set minimal – it is *not* a
 * general HTTP client, only what the adapters need (JSON body, optional
 * custom headers, SSE compatible Accept header).
 */
function postJSON({
  hostname,
  path,
  body,
  headers = {},
  timeout = 30000,
}: PostJSONOptions): Promise<IncomingMessage> {
  const json = JSON.stringify(body ?? {});

  const requestHeaders: OutgoingHttpHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
  };

  const options: https.RequestOptions = {
    hostname,
    path,
    method: 'POST',
    headers: requestHeaders,
    timeout,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => resolve(res));
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

module.exports = {
  postJSON,
};

export { postJSON };
