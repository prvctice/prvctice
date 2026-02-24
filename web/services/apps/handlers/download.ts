/**
 * Download Handler
 *
 * Handles media:download, media:saveUrl, and media-tools:download
 * bridge messages. Manages base64-to-blob conversion, WebM-to-MP3/MP4
 * auto-conversion via backend, and URL-based downloads.
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext } from './types';

/**
 * Download base64 data as a file. Auto-converts WebM audio to MP3
 * and WebM video to MP4 via the backend conversion endpoint.
 */
export function handleDownload(ctx: HandlerContext): void {
  const { respond, requestId, data, apiResolve } = ctx;
  const { base64, filename, mimeType } = data as {
    base64: string;
    filename: string;
    mimeType: string;
  };

  void (async () => {
    try {
      if (!base64 || typeof base64 !== 'string') {
        respond({ requestId, error: 'Missing base64 data', code: 'INVALID_REQUEST' });
        return;
      }
      const safeMime = (mimeType || 'audio/wav').replace(/[^a-zA-Z0-9/;=.-]/g, '');
      let downloadBase64 = base64;
      let downloadMime = safeMime;
      let downloadName = (filename || 'recording').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);

      // Auto-convert WebM audio -> MP3 and WebM video -> MP4
      const isWebmAudio = safeMime.startsWith('audio/webm');
      const isWebmVideo = safeMime.startsWith('video/webm');
      if (isWebmAudio || isWebmVideo) {
        const outputFormat = isWebmAudio ? 'mp3' : 'mp4';
        try {
          const convRes = await fetch(apiResolve('/api/v1/media/convert'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64,
              inputMime: safeMime,
              outputFormat,
            }),
          });
          if (convRes.ok) {
            const convData = (await convRes.json()) as {
              base64: string;
              mimeType: string;
              ext: string;
            };
            downloadBase64 = convData.base64;
            downloadMime = convData.mimeType;
            // Replace extension in filename
            downloadName = downloadName.replace(/\.[^.]+$/, '') + '.' + convData.ext;
          }
          // If conversion fails, fall through to original format
        } catch {
          // Conversion unavailable -- download original format
        }
      }

      triggerBlobDownload(downloadBase64, downloadMime, downloadName);
      respond({ requestId, data: { downloaded: true, filename: downloadName } });
    } catch (err: unknown) {
      logError('bridge', 'media:download', err as Error);
      respond({ requestId, error: 'Download failed', code: 'CONNECTOR_ERROR' });
    }
  })();
}

/**
 * Download a file from a URL. Fetches the URL, creates a blob,
 * and triggers a browser download.
 */
export function handleSaveUrl(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const saveUrl = data.url as string;
  const saveName = data.filename as string;

  if (!saveUrl || typeof saveUrl !== 'string') {
    respond({ requestId, error: 'Missing url', code: 'INVALID_REQUEST' });
    return;
  }

  void (async () => {
    try {
      // Resolve relative URLs against the current origin
      const resolved = saveUrl.startsWith('/') ? `${window.location.origin}${saveUrl}` : saveUrl;
      const url = new URL(resolved);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        respond({ requestId, error: 'Only http/https URLs are allowed', code: 'INVALID_REQUEST' });
        return;
      }
      const res = await fetch(resolved);
      if (!res.ok) {
        respond({ requestId, error: `Fetch failed: ${res.status}`, code: 'CONNECTOR_ERROR' });
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = (saveName || 'download').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      respond({ requestId, data: { downloaded: true, filename: a.download } });
    } catch (err) {
      logError('bridge', 'media:saveUrl', err as Error);
      respond({ requestId, error: 'Download failed', code: 'CONNECTOR_ERROR' });
    }
  })();
}

/**
 * Download media via the backend media-tools endpoint (yt-dlp/ffmpeg).
 * Uses a two-phase pattern: sends result/error back via bridge push message.
 */
export function handleMediaToolsDownload(ctx: HandlerContext): void {
  const { instance, data, sendToApp, apiResolve } = ctx;
  const downloadUrl = data.url as string;
  const downloadOptions = (data.options || {}) as Record<string, unknown>;
  const downloadId = data.downloadId as string;

  if (!downloadUrl || typeof downloadUrl !== 'string') {
    sendToApp(instance, {
      type: 'media-tools:download:error',
      downloadId,
      error: 'url is required',
    });
    return;
  }

  void (async () => {
    try {
      const res = await fetch(apiResolve('/api/v1/media/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: downloadUrl, format: downloadOptions.format }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: `Download failed: ${res.status}` }))) as Record<string, string>;
        sendToApp(instance, {
          type: 'media-tools:download:error',
          downloadId,
          error: body.error || `Download failed: ${res.status}`,
        });
        return;
      }

      const result = await res.json();
      sendToApp(instance, {
        type: 'media-tools:download:complete',
        downloadId,
        data: result,
      });
    } catch (err) {
      logError('bridge', 'media-tools:download', err as Error);
      sendToApp(instance, {
        type: 'media-tools:download:error',
        downloadId,
        error: (err as Error).message || 'Download failed',
      });
    }
  })();
}

/** Convert base64 to blob and trigger a browser download */
function triggerBlobDownload(base64: string, mimeType: string, filename: string): void {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
