/**
 * Video Playback Handler
 *
 * Handles media:video:load, play, pause, seek, seekAndCapture, and unload
 * bridge messages. Manages hidden video elements with blob URLs on the host
 * side. Supports multiple simultaneous video players per instance.
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext, VideoPlayerState } from './types';

// ==================== HELPERS ====================

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function cleanupPlayer(state: VideoPlayerState): void {
  try {
    state.video.pause();
  } catch {
    /* ignore */
  }
  state.video.removeAttribute('src');
  state.video.load(); // Release media resources
  if (state.blobUrl) {
    URL.revokeObjectURL(state.blobUrl);
  }
  if (state.video.parentNode) {
    state.video.parentNode.removeChild(state.video);
  }
}

// ==================== HANDLERS ====================

/**
 * Load a video from base64 data, data URI, or remote URL.
 * Creates a hidden video element with a blob URL on the host page.
 */
export function handleVideoLoad(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, setVideoState, apiResolve } = ctx;
  const playerId = data.playerId as string;
  const base64 = data.base64 as string | undefined;
  const url = data.url as string | undefined;
  const mimeType = (data.mimeType as string) || 'video/mp4';

  if (!playerId) {
    respond({ requestId, error: 'playerId is required', code: 'INVALID_REQUEST' });
    return;
  }

  void (async () => {
    try {
      let blobUrl: string;

      if (base64) {
        // Direct base64 -> blob
        const blob = base64ToBlob(base64, mimeType);
        blobUrl = URL.createObjectURL(blob);
      } else if (url && url.startsWith('data:')) {
        // Data URI -> extract base64 -> blob
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) {
          respond({ requestId, error: 'Invalid data URI', code: 'INVALID_REQUEST' });
          return;
        }
        const header = url.slice(5, commaIdx);
        const localMime = header.replace(';base64', '') || mimeType;
        const localBase64 = url.slice(commaIdx + 1);
        const blob = base64ToBlob(localBase64, localMime);
        blobUrl = URL.createObjectURL(blob);
      } else if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        // Remote URL -> proxy through backend
        const res = await fetch(apiResolve('/api/v1/media/video-proxy'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) {
          const body = (await res
            .json()
            .catch(() => ({ error: `Fetch failed: ${res.status}` }))) as Record<string, string>;
          respond({
            requestId,
            error: body.error || 'Video fetch failed',
            code: 'CONNECTOR_ERROR',
          });
          return;
        }
        const { base64: proxyBase64, mimeType: proxyMime } = (await res.json()) as {
          base64: string;
          mimeType: string;
        };
        const blob = base64ToBlob(proxyBase64, proxyMime || mimeType);
        blobUrl = URL.createObjectURL(blob);
      } else if (url && url.startsWith('blob:')) {
        // Already a blob URL (unlikely from sandbox but handle gracefully)
        blobUrl = url;
      } else {
        respond({ requestId, error: 'Either base64 or url is required', code: 'INVALID_REQUEST' });
        return;
      }

      // Create hidden video element
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      document.body.appendChild(video);

      video.src = blobUrl;

      // Wait for metadata
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Video metadata load failed'));
      });

      const state: VideoPlayerState = {
        video,
        blobUrl,
        playerId,
      };

      setVideoState(instance.instanceId, playerId, state);
      respond({
        requestId,
        data: {
          loaded: true,
          playerId,
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        },
      });
    } catch (err: unknown) {
      logError('bridge', 'media:video:load', err as Error);
      respond({
        requestId,
        error: (err as Error).message || 'Video load failed',
        code: 'CONNECTOR_ERROR',
      });
    }
  })();
}

/**
 * Start or resume video playback, optionally from a specific time.
 */
export function handleVideoPlay(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getVideoState } = ctx;
  const playerId = data.playerId as string;
  const startTime = data.startTime as number | undefined;

  const state = getVideoState(instance.instanceId, playerId);
  if (!state) {
    respond({
      requestId,
      error: `No video loaded for playerId: ${playerId}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  void (async () => {
    try {
      if (startTime !== undefined && startTime !== null) {
        state.video.currentTime = startTime;
      }
      await state.video.play();
      respond({ requestId, data: { playing: true, playerId } });
    } catch (err: unknown) {
      logError('bridge', 'media:video:play', err as Error);
      respond({
        requestId,
        error: (err as Error).message || 'Play failed',
        code: 'CONNECTOR_ERROR',
      });
    }
  })();
}

/**
 * Pause video playback.
 */
export function handleVideoPause(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getVideoState } = ctx;
  const playerId = data.playerId as string;

  const state = getVideoState(instance.instanceId, playerId);
  if (!state) {
    respond({
      requestId,
      error: `No video loaded for playerId: ${playerId}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  state.video.pause();
  respond({ requestId, data: { paused: true, playerId, currentTime: state.video.currentTime } });
}

/**
 * Seek to a specific time in the video.
 */
export function handleVideoSeek(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getVideoState } = ctx;
  const playerId = data.playerId as string;
  const time = data.time as number;

  const state = getVideoState(instance.instanceId, playerId);
  if (!state) {
    respond({
      requestId,
      error: `No video loaded for playerId: ${playerId}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  if (typeof time !== 'number' || isNaN(time)) {
    respond({ requestId, error: 'time must be a number', code: 'INVALID_REQUEST' });
    return;
  }

  state.video.currentTime = time;

  const onSeeked = (): void => {
    state.video.removeEventListener('seeked', onSeeked);
    respond({ requestId, data: { seeked: true, playerId, currentTime: state.video.currentTime } });
  };
  state.video.addEventListener('seeked', onSeeked);
}

/**
 * Seek to a specific time and capture the video frame as a JPEG data URI.
 * Useful for generating timeline thumbnails.
 */
export function handleVideoSeekAndCapture(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getVideoState } = ctx;
  const playerId = data.playerId as string;
  const time = data.time as number;
  const requestedWidth = data.width as number | undefined;
  const requestedHeight = data.height as number | undefined;

  const state = getVideoState(instance.instanceId, playerId);
  if (!state) {
    respond({
      requestId,
      error: `No video loaded for playerId: ${playerId}`,
      code: 'INVALID_REQUEST',
    });
    return;
  }

  if (typeof time !== 'number' || isNaN(time)) {
    respond({ requestId, error: 'time must be a number', code: 'INVALID_REQUEST' });
    return;
  }

  state.video.currentTime = time;

  const onSeeked = (): void => {
    state.video.removeEventListener('seeked', onSeeked);

    try {
      // Determine capture dimensions (capped at 800px)
      const maxDim = 800;
      let w = requestedWidth ?? state.video.videoWidth;
      let h = requestedHeight ?? state.video.videoHeight;
      const scale = Math.min(maxDim / w, maxDim / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const canvasCtx = canvas.getContext('2d');

      if (!canvasCtx) {
        respond({ requestId, error: 'Canvas context unavailable', code: 'PLATFORM_UNSUPPORTED' });
        return;
      }

      canvasCtx.drawImage(state.video, 0, 0, w, h);
      const dataUri = canvas.toDataURL('image/jpeg', 0.85);
      respond({ requestId, data: { dataUri, width: w, height: h, time: state.video.currentTime } });
    } catch (err: unknown) {
      logError('bridge', 'media:video:seekAndCapture', err as Error);
      respond({ requestId, error: 'Frame capture failed', code: 'CONNECTOR_ERROR' });
    }
  };
  state.video.addEventListener('seeked', onSeeked);
}

/**
 * Unload a video: pause, revoke blob URL, remove element, delete state.
 */
export function handleVideoUnload(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getVideoState, deleteVideoState } = ctx;
  const playerId = data.playerId as string;

  const state = getVideoState(instance.instanceId, playerId);
  if (!state) {
    respond({ requestId, data: { unloaded: true, playerId } });
    return;
  }

  cleanupPlayer(state);
  deleteVideoState(instance.instanceId, playerId);
  respond({ requestId, data: { unloaded: true, playerId } });
}

/**
 * Clean up all video resources for a given instance.
 * Called by appManager during instance teardown.
 */
export function cleanupVideoForInstance(ctx: HandlerContext, instanceId: string): void {
  ctx.forEachVideoState(instanceId, (state) => {
    cleanupPlayer(state);
  });
  ctx.deleteAllVideoStates(instanceId);
}
