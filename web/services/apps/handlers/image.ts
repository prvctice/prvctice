/**
 * Image Handler
 *
 * Handles media:image:load bridge messages. Proxies remote images
 * through the backend, then resizes client-side via canvas to
 * max 800px on the longest side.
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext } from './types';

/**
 * Load and resize an image. Fetches the image via backend proxy,
 * then downscales to max 800px using an offscreen canvas.
 */
export function handleImageLoad(ctx: HandlerContext): void {
  const { respond, requestId, data, apiResolve } = ctx;
  const imageUrl = data.url as string;

  if (!imageUrl) {
    respond({ requestId, error: 'url is required', code: 'INVALID_REQUEST' });
    return;
  }

  void (async () => {
    try {
      const res = await fetch(apiResolve('/api/v1/media/image-proxy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl }),
      });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: `Fetch failed: ${res.status}` }))) as Record<string, string>;
        respond({ requestId, error: body.error || 'Image fetch failed', code: 'CONNECTOR_ERROR' });
        return;
      }
      const { base64, mimeType } = (await res.json()) as { base64: string; mimeType: string };

      // Resize client-side via canvas to max 800px on longest side
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const canvasCtx = canvas.getContext('2d');
        if (canvasCtx) {
          canvasCtx.drawImage(img, 0, 0, w, h);
          const dataUri = canvas.toDataURL('image/jpeg', 0.85);
          respond({ requestId, data: { dataUri, width: w, height: h } });
        } else {
          // Canvas not available -- return raw base64 without resize
          const dataUri = `data:${mimeType};base64,${base64}`;
          respond({ requestId, data: { dataUri, width: img.width, height: img.height } });
        }
      };
      img.onerror = () => {
        respond({ requestId, error: 'Image decode failed', code: 'CONNECTOR_ERROR' });
      };
      img.src = `data:${mimeType};base64,${base64}`;
    } catch (err) {
      logError('bridge', 'media:image:load', err as Error);
      respond({
        requestId,
        error: (err as Error).message || 'Image fetch failed',
        code: 'CONNECTOR_ERROR',
      });
    }
  })();
}
