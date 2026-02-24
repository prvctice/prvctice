/**
 * Audio Playback Handler
 *
 * Handles media:audio:load bridge messages. Supports data URIs,
 * raw base64 strings, and remote URLs (proxied through the backend).
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext } from './types';

/**
 * Load audio for playback. Handles three source types:
 * 1. data: URIs -- extracted and sent directly
 * 2. Raw base64 strings -- treated as audio/webm
 * 3. Remote http/https URLs -- proxied through backend audio-proxy endpoint
 */
export function handleAudioLoad(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, sendToApp, apiResolve } = ctx;
  const audioUrl = data.url as string;
  const playerId = data.playerId as string;

  if (!audioUrl || !playerId) {
    respond({ requestId, error: 'url and playerId required', code: 'INVALID_REQUEST' });
    return;
  }

  // Local data: data URIs handled in-process (no backend proxy)
  if (audioUrl.startsWith('data:')) {
    const commaIdx = audioUrl.indexOf(',');
    if (commaIdx === -1) {
      respond({ requestId, error: 'Invalid data URI', code: 'INVALID_REQUEST' });
      return;
    }
    const header = audioUrl.slice(5, commaIdx); // after "data:", before ","
    const localMime = header.replace(';base64', '') || 'audio/webm';
    const localBase64 = audioUrl.slice(commaIdx + 1);
    sendToApp(instance, {
      type: 'media:audio:data',
      playerId,
      base64: localBase64,
      mimeType: localMime,
    });
    respond({ requestId, data: { loaded: true, playerId } });
    return;
  }

  // Raw base64 string (no URL prefix) -- treat as audio/webm
  if (
    !audioUrl.startsWith('http://') &&
    !audioUrl.startsWith('https://') &&
    !audioUrl.startsWith('blob:')
  ) {
    sendToApp(instance, {
      type: 'media:audio:data',
      playerId,
      base64: audioUrl,
      mimeType: 'audio/webm',
    });
    respond({ requestId, data: { loaded: true, playerId } });
    return;
  }

  // Remote URL -- proxy through backend
  void (async () => {
    try {
      const res = await fetch(apiResolve('/api/v1/media/audio-proxy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: audioUrl }),
      });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: `Fetch failed: ${res.status}` }))) as Record<string, string>;
        sendToApp(instance, {
          type: 'media:audio:error',
          playerId,
          error: body.error || `Fetch failed: ${res.status}`,
        });
        respond({ requestId, error: body.error || 'Audio fetch failed', code: 'CONNECTOR_ERROR' });
        return;
      }
      const { base64, mimeType } = (await res.json()) as { base64: string; mimeType: string };

      sendToApp(instance, {
        type: 'media:audio:data',
        playerId,
        base64,
        mimeType,
      });
      respond({ requestId, data: { loaded: true, playerId } });
    } catch (err) {
      logError('bridge', 'media:audio:load', err as Error);
      sendToApp(instance, {
        type: 'media:audio:error',
        playerId,
        error: (err as Error).message || 'Audio fetch failed',
      });
      respond({
        requestId,
        error: (err as Error).message || 'Audio fetch failed',
        code: 'CONNECTOR_ERROR',
      });
    }
  })();
}
