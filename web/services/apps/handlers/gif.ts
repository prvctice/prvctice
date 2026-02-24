/**
 * GIF Encoder Handler
 *
 * Handles media:gif:create, addFrame, finish, and cancel bridge messages.
 * Manages Web Worker-based GIF encoding on the host side. Apps feed frames
 * progressively and receive the final GIF blob via the bridge.
 *
 * Max output dimensions: 800x600. Frames auto-scaled to fit.
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext, GifEncoderState } from './types';

// ==================== CONSTANTS ====================

const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

const QUALITY_PRESETS: Readonly<Record<string, number>> = {
  high: 256,
  medium: 128,
  low: 64,
};

// ==================== HELPERS ====================

/**
 * Decode a data URI to an ImageData at the specified dimensions.
 * Uses an off-screen canvas to draw and resize the image.
 */
function dataUriToImageData(
  dataUri: string,
  targetWidth: number,
  targetHeight: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(ctx.getImageData(0, 0, targetWidth, targetHeight));
    };
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataUri;
  });
}

/**
 * Convert a Blob to a base64 data URI.
 */
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not produce a string'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// ==================== HANDLERS ====================

/**
 * Create a new GIF encoder backed by a Web Worker.
 * Accepts encoderId, width, height, quality. Clamps dimensions to max 800x600.
 */
export function handleGifCreate(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, setGifState } = ctx;
  const encoderId = data.encoderId as string;
  const rawWidth = Number(data.width) || 400;
  const rawHeight = Number(data.height) || 300;
  const qualityName = (data.quality as string) || 'medium';

  if (!encoderId) {
    respond({ requestId, error: 'encoderId is required', code: 'INVALID_REQUEST' });
    return;
  }

  // Clamp dimensions to max bounds while preserving aspect ratio
  let width = Math.min(rawWidth, MAX_WIDTH);
  let height = Math.min(rawHeight, MAX_HEIGHT);
  const scale = Math.min(MAX_WIDTH / rawWidth, MAX_HEIGHT / rawHeight, 1);
  width = Math.round(rawWidth * scale);
  height = Math.round(rawHeight * scale);

  const maxColors = QUALITY_PRESETS[qualityName] ?? QUALITY_PRESETS.medium;
  const quality = (qualityName in QUALITY_PRESETS ? qualityName : 'medium') as
    | 'high'
    | 'medium'
    | 'low';

  try {
    const worker = new Worker(new URL('@web/workers/gifEncoder.worker.ts', import.meta.url), {
      type: 'module',
    });

    // Wait for ready
    const onMessage = (e: MessageEvent): void => {
      const msg = e.data as { type: string; message?: string };
      worker.removeEventListener('message', onMessage);

      if (msg.type === 'ready') {
        const state: GifEncoderState = {
          encoderId,
          worker,
          width,
          height,
          quality,
          frameCount: 0,
        };
        setGifState(instance.instanceId, encoderId, state);
        respond({
          requestId,
          data: { created: true, encoderId, width, height, quality },
        });
      } else if (msg.type === 'error') {
        worker.terminate();
        respond({
          requestId,
          error: msg.message || 'Worker init failed',
          code: 'CONNECTOR_ERROR',
        });
      }
    };

    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'init', width, height, maxColors });
  } catch (err: unknown) {
    logError('bridge', 'media:gif:create', err as Error);
    respond({
      requestId,
      error: (err as Error).message || 'GIF encoder creation failed',
      code: 'CONNECTOR_ERROR',
    });
  }
}

/**
 * Add a frame to an active GIF encoder.
 * Accepts a data URI (JPEG/PNG) and delay in milliseconds.
 * The image is decoded and resized to encoder dimensions before transfer.
 */
export function handleGifAddFrame(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getGifState } = ctx;
  const encoderId = data.encoderId as string;
  const dataUri = data.dataUri as string;
  const delay = Math.max(10, Number(data.delay) || 100);

  const state = getGifState(instance.instanceId, encoderId);
  if (!state) {
    respond({
      requestId,
      error: `No GIF encoder for encoderId: ${encoderId}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  if (!dataUri) {
    respond({ requestId, error: 'dataUri is required', code: 'INVALID_REQUEST' });
    return;
  }

  void (async () => {
    try {
      const imageData = await dataUriToImageData(dataUri, state.width, state.height);

      // Transfer the buffer to the worker (zero-copy)
      const buffer = imageData.data.buffer;
      state.worker.postMessage(
        {
          type: 'addFrame',
          imageData: { width: state.width, height: state.height, data: buffer },
          delay,
        },
        [buffer]
      );

      state.frameCount++;
      respond({
        requestId,
        data: { added: true, encoderId, frameCount: state.frameCount },
      });
    } catch (err: unknown) {
      logError('bridge', 'media:gif:addFrame', err as Error);
      respond({
        requestId,
        error: (err as Error).message || 'Frame add failed',
        code: 'CONNECTOR_ERROR',
      });
    }
  })();
}

/**
 * Finish encoding and produce the final GIF.
 * Sends progress callbacks to the app during encoding.
 * Returns the GIF as a base64 data URI.
 */
export function handleGifFinish(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getGifState, deleteGifState, sendToApp } = ctx;
  const encoderId = data.encoderId as string;

  const state = getGifState(instance.instanceId, encoderId);
  if (!state) {
    respond({
      requestId,
      error: `No GIF encoder for encoderId: ${encoderId}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  const onMessage = (e: MessageEvent): void => {
    const msg = e.data as { type: string; percent?: number; blob?: Blob; message?: string };

    switch (msg.type) {
      case 'progress':
        sendToApp(instance, {
          type: 'media:gif:progress',
          encoderId,
          percent: msg.percent,
        });
        break;

      case 'done': {
        state.worker.removeEventListener('message', onMessage);
        state.worker.terminate();
        deleteGifState(instance.instanceId, encoderId);

        if (!msg.blob) {
          respond({ requestId, error: 'No blob produced', code: 'CONNECTOR_ERROR' });
          return;
        }

        // Convert blob to data URI
        void blobToDataUri(msg.blob)
          .then((dataUriResult) => {
            respond({
              requestId,
              data: {
                dataUri: dataUriResult,
                size: msg.blob!.size,
                frameCount: state.frameCount,
                width: state.width,
                height: state.height,
              },
            });
          })
          .catch((err: unknown) => {
            respond({
              requestId,
              error: (err as Error).message || 'Blob conversion failed',
              code: 'CONNECTOR_ERROR',
            });
          });
        break;
      }

      case 'error':
        state.worker.removeEventListener('message', onMessage);
        state.worker.terminate();
        deleteGifState(instance.instanceId, encoderId);
        respond({
          requestId,
          error: msg.message || 'GIF encoding failed',
          code: 'CONNECTOR_ERROR',
        });
        break;
    }
  };

  state.worker.addEventListener('message', onMessage);
  state.worker.postMessage({ type: 'finish' });
}

/**
 * Cancel an in-progress GIF encoding. Terminates the worker.
 */
export function handleGifCancel(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getGifState, deleteGifState } = ctx;
  const encoderId = data.encoderId as string;

  const state = getGifState(instance.instanceId, encoderId);
  if (!state) {
    respond({ requestId, data: { cancelled: true, encoderId } });
    return;
  }

  state.worker.postMessage({ type: 'cancel' });
  state.worker.terminate();
  deleteGifState(instance.instanceId, encoderId);
  respond({ requestId, data: { cancelled: true, encoderId } });
}

/**
 * Clean up all GIF encoder resources for a given instance.
 * Called by appManager during instance teardown.
 */
export function cleanupGifForInstance(ctx: HandlerContext, instanceId: string): void {
  ctx.forEachGifState(instanceId, (state) => {
    state.worker.postMessage({ type: 'cancel' });
    state.worker.terminate();
  });
  ctx.deleteAllGifStates(instanceId);
}
