/**
 * Camera Handler
 *
 * Handles media:camera:start, media:camera:capture, and media:camera:stop
 * bridge messages. Manages getUserMedia video streams, captures JPEG frames
 * at configurable FPS, and delivers them to apps via the bridge.
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext, CameraState } from './types';

// ==================== RESOLUTION PRESETS ====================

const RESOLUTION_PRESETS: Readonly<
  Record<string, { readonly width: number; readonly height: number }>
> = {
  low: { width: 320, height: 240 },
  medium: { width: 640, height: 480 },
  high: { width: 1280, height: 720 },
};

// ==================== HANDLERS ====================

/**
 * Start a camera session with configurable resolution, FPS, and facing mode.
 * Creates a MediaStream, off-screen video + canvas, and a RAF loop that
 * captures JPEG frames and sends them to the app.
 */
export function handleCameraStart(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, setCameraState, sendToApp } = ctx;

  const resolutionName = (data.resolution as string) || 'medium';
  const requestedFps = Math.max(1, Math.min(30, Number(data.fps) || 12));
  const facingMode = (data.facingMode as string) === 'environment' ? 'environment' : 'user';

  const preset: { readonly width: number; readonly height: number } = RESOLUTION_PRESETS[
    resolutionName
  ] ?? { width: 640, height: 480 };

  // Stop any existing camera for this instance
  cleanupCameraForInstance(ctx, instance.instanceId);

  void (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          facingMode,
        },
      });

      // Create off-screen video element
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      // Keep off-screen -- don't append to DOM body
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      document.body.appendChild(video);

      // Wait for video dimensions to be available
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      await video.play();

      // Determine actual capture dimensions (capped to preset max)
      const actualWidth = Math.min(video.videoWidth, preset.width);
      const actualHeight = Math.min(video.videoHeight, preset.height);

      // Create off-screen canvas for JPEG encoding
      const canvas = document.createElement('canvas');
      canvas.width = actualWidth;
      canvas.height = actualHeight;
      const canvasCtx = canvas.getContext('2d');

      if (!canvasCtx) {
        // Canvas not available -- clean up and error
        for (const track of stream.getTracks()) track.stop();
        video.remove();
        respond({ requestId, error: 'Canvas context unavailable', code: 'PLATFORM_UNSUPPORTED' });
        return;
      }

      const frameInterval = 1000 / requestedFps;

      const state: CameraState = {
        stream,
        video,
        canvas,
        canvasCtx,
        rafId: null,
        resolution: { width: actualWidth, height: actualHeight },
        fps: requestedFps,
        lastFrameTime: 0,
      };

      // Start RAF frame capture loop
      function captureFrame(): void {
        const now = performance.now();
        if (now - state.lastFrameTime >= frameInterval) {
          state.lastFrameTime = now;
          canvasCtx!.drawImage(video, 0, 0, actualWidth, actualHeight);
          const dataUri = canvas.toDataURL('image/jpeg', 0.7);
          sendToApp(instance, {
            type: 'media:camera:frame',
            dataUri,
            timestamp: Date.now(),
            width: actualWidth,
            height: actualHeight,
          });
        }
        state.rafId = requestAnimationFrame(captureFrame);
      }
      state.rafId = requestAnimationFrame(captureFrame);

      setCameraState(instance.instanceId, state);
      respond({
        requestId,
        data: {
          active: true,
          resolution: { width: actualWidth, height: actualHeight },
          fps: requestedFps,
        },
      });
    } catch (err: unknown) {
      logError('bridge', 'media:camera:start', err as Error);
      respond({
        requestId,
        error: (err as Error).message || 'Camera access failed',
        code: 'PLATFORM_UNSUPPORTED',
      });
    }
  })();
}

/**
 * Capture a single high-quality still frame from the active camera.
 * Uses higher JPEG quality (0.92) than the streaming frames (0.7).
 */
export function handleCameraCapture(ctx: HandlerContext): void {
  const { instance, respond, requestId, getCameraState } = ctx;
  const state = getCameraState(instance.instanceId);

  if (!state) {
    respond({ requestId, error: 'No active camera', code: 'INVALID_REQUEST' });
    return;
  }

  try {
    const { video, canvas, canvasCtx, resolution } = state;
    canvasCtx.drawImage(video, 0, 0, resolution.width, resolution.height);
    const dataUri = canvas.toDataURL('image/jpeg', 0.92);
    respond({
      requestId,
      data: { dataUri, width: resolution.width, height: resolution.height, timestamp: Date.now() },
    });
  } catch (err: unknown) {
    logError('bridge', 'media:camera:capture', err as Error);
    respond({ requestId, error: 'Frame capture failed', code: 'CONNECTOR_ERROR' });
  }
}

/**
 * Stop the camera session: cancel RAF, stop stream tracks, remove
 * the off-screen video element, and delete camera state.
 */
export function handleCameraStop(ctx: HandlerContext): void {
  const { instance, respond, requestId, getCameraState } = ctx;
  const state = getCameraState(instance.instanceId);

  if (!state) {
    respond({ requestId, data: { stopped: true } });
    return;
  }

  cleanupCameraForInstance(ctx, instance.instanceId);
  respond({ requestId, data: { stopped: true } });
}

/**
 * Clean up all camera resources for a given instance.
 * Called by appManager during instance teardown.
 */
export function cleanupCameraForInstance(ctx: HandlerContext, instanceId: string): void {
  const state = ctx.getCameraState(instanceId);
  if (!state) return;

  // Stop RAF loop
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
  }

  // Stop all stream tracks
  for (const track of state.stream.getTracks()) {
    track.stop();
  }

  // Remove off-screen video element
  if (state.video.parentNode) {
    state.video.parentNode.removeChild(state.video);
  }

  ctx.deleteCameraState(instanceId);
}
