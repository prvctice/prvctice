/**
 * GIF Encoder Worker
 *
 * Runs off-main-thread to avoid freezing the UI during GIF encoding.
 * Uses modern-gif's top-level encode() function (batch API) rather than
 * the Encoder class, which internally tries to spawn sub-workers that
 * fail in Vite's bundled web-worker context.
 *
 * Frames are collected in memory on addFrame, then encoded in one shot
 * on finish.
 *
 * Messages IN:
 *   { type: 'init', width, height, maxColors }
 *   { type: 'addFrame', imageData: { width, height, data: ArrayBuffer }, delay }
 *   { type: 'finish' }
 *   { type: 'cancel' }
 *
 * Messages OUT:
 *   { type: 'ready' }
 *   { type: 'frameAdded', frameCount }
 *   { type: 'progress', percent }
 *   { type: 'done', blob: Blob }
 *   { type: 'error', message }
 */

import { encode, type UnencodedFrame } from 'modern-gif';

interface InitMessage {
  type: 'init';
  width: number;
  height: number;
  maxColors: number;
}

interface AddFrameMessage {
  type: 'addFrame';
  imageData: { width: number; height: number; data: ArrayBuffer };
  delay: number;
}

interface FinishMessage {
  type: 'finish';
}

interface CancelMessage {
  type: 'cancel';
}

type WorkerMessage = InitMessage | AddFrameMessage | FinishMessage | CancelMessage;

interface GifConfig {
  width: number;
  height: number;
  maxColors: number;
}

let collectedFrames: UnencodedFrame[] = [];
let gifConfig: GifConfig = { width: 400, height: 300, maxColors: 128 };
let cancelled = false;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case 'init': {
        collectedFrames = [];
        cancelled = false;
        gifConfig = {
          width: msg.width,
          height: msg.height,
          maxColors: msg.maxColors,
        };
        self.postMessage({ type: 'ready' });
        break;
      }

      case 'addFrame': {
        if (cancelled) return;
        const { width, height, data } = msg.imageData;
        const clampedData = new Uint8ClampedArray(data);
        collectedFrames.push({
          data: clampedData,
          width,
          height,
          delay: Math.max(10, msg.delay),
        });
        self.postMessage({ type: 'frameAdded', frameCount: collectedFrames.length });
        break;
      }

      case 'finish': {
        if (cancelled) {
          self.postMessage({ type: 'error', message: 'Cancelled' });
          return;
        }
        if (collectedFrames.length === 0) {
          self.postMessage({ type: 'error', message: 'No frames to encode' });
          return;
        }

        self.postMessage({ type: 'progress', percent: 10 });

        const blob = await encode({
          width: gifConfig.width,
          height: gifConfig.height,
          maxColors: gifConfig.maxColors,
          frames: collectedFrames,
          format: 'blob',
        });

        self.postMessage({ type: 'progress', percent: 100 });
        self.postMessage({ type: 'done', blob });

        collectedFrames = [];
        break;
      }

      case 'cancel': {
        cancelled = true;
        collectedFrames = [];
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GIF encoding failed';
    self.postMessage({ type: 'error', message });
  }
};
