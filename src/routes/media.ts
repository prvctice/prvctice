/**
 * Media proxy routes for sandboxed apps.
 *
 * POST /audio-proxy — Fetches remote audio, returns base64 (max 10MB).
 * POST /image-proxy — Fetches remote image, returns base64 for host-side resize.
 * POST /download   — Downloads video via yt-dlp, stores in blob storage.
 *
 * Audio/image proxies validate URLs via the SSRF guard to prevent internal network access.
 */

import { Router, json } from 'express';
import rateLimit from 'express-rate-limit';
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import axios from 'axios';
import ipaddr from 'ipaddr.js';
import { validateUrl } from '../utils/ssrfGuard.js';
import storage from '../storage/node/sqlite.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const router = Router();

const mediaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
});

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MEDIA_DOWNLOAD_ENABLED = process.env.MEDIA_DOWNLOAD_ENABLED === 'true';

/** Build an agent that pins DNS to the validated IP, preventing DNS rebinding. */
function createPinnedAgent(protocol: string, resolvedIp: string): http.Agent | https.Agent {
  const family = ipaddr.isValid(resolvedIp) && ipaddr.parse(resolvedIp).kind() === 'ipv6' ? 6 : 4;
  const AgentClass = protocol === 'https:' ? https.Agent : http.Agent;
  return new AgentClass({
    lookup: (
      _hostname: string,
      _options: unknown,
      cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) => {
      cb(null, resolvedIp, family);
    },
  });
}

// ==================== Audio Proxy ====================

router.post('/audio-proxy', json(), mediaLimiter, async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  try {
    const validated = await validateUrl(url);
    const agent = createPinnedAgent(validated.url.protocol, validated.resolvedIp);

    const response = await axios.get(validated.url.toString(), {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: MAX_AUDIO_SIZE,
      maxBodyLength: MAX_AUDIO_SIZE,
      httpAgent: agent,
      httpsAgent: agent,
    });

    const buffer = Buffer.from(response.data as ArrayBuffer);
    if (buffer.length > MAX_AUDIO_SIZE) {
      res.status(413).json({ error: 'Audio file too large (max 10MB)' });
      return;
    }

    const mimeType = (response.headers['content-type'] as string) || 'audio/mpeg';
    const base64 = buffer.toString('base64');

    res.json({ base64, mimeType });
  } catch (err) {
    const message = (err as Error).message || 'Audio fetch failed';
    const axiosErr = err as { code?: string };
    if (axiosErr.code === 'ERR_BAD_RESPONSE' || message.includes('maxContentLength')) {
      res.status(413).json({ error: 'Audio file too large (max 10MB)' });
      return;
    }
    logger.error('audio_proxy_failed', { error: message });
    res.status(500).json({ error: message });
  }
});

// ==================== Image Proxy ====================

router.post('/image-proxy', json(), mediaLimiter, async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  try {
    const validated = await validateUrl(url);
    const imgAgent = createPinnedAgent(validated.url.protocol, validated.resolvedIp);

    const response = await axios.get(validated.url.toString(), {
      responseType: 'arraybuffer',
      timeout: 15_000,
      maxContentLength: MAX_IMAGE_SIZE,
      maxBodyLength: MAX_IMAGE_SIZE,
      httpAgent: imgAgent,
      httpsAgent: imgAgent,
    });

    const buffer = Buffer.from(response.data as ArrayBuffer);
    if (buffer.length > MAX_IMAGE_SIZE) {
      res.status(413).json({ error: 'Image file too large (max 5MB)' });
      return;
    }
    const mimeType = (response.headers['content-type'] as string) || 'image/jpeg';
    const base64 = buffer.toString('base64');

    res.json({ base64, mimeType, width: null, height: null });
  } catch (err) {
    const message = (err as Error).message || 'Image fetch failed';
    const axiosErr = err as { code?: string };
    if (axiosErr.code === 'ERR_BAD_RESPONSE' || message.includes('maxContentLength')) {
      res.status(413).json({ error: 'Image file too large (max 5MB)' });
      return;
    }
    logger.error('image_proxy_failed', { error: message });
    res.status(500).json({ error: message });
  }
});

// ==================== Video Download (yt-dlp) ====================

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  message: { error: 'Rate limit exceeded — max 3 downloads per minute', code: 'RATE_LIMITED' },
});

const MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT = 120_000; // 120s

router.post('/download', json(), downloadLimiter, async (req, res) => {
  if (!MEDIA_DOWNLOAD_ENABLED) {
    res.status(503).json({ error: 'Media download disabled' });
    return;
  }

  const { url, format } = req.body as { url?: string; format?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  // Basic URL validation
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    res.status(400).json({ error: 'url must use http:// or https:// protocol' });
    return;
  }

  const tmpName = crypto.randomBytes(16).toString('hex');
  const tmpDir = path.join(os.tmpdir(), `prvctice-dl-${tmpName}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const outputTemplate = path.join(tmpDir, '%(title).100B.%(ext)s');

    const args: string[] = [
      '--no-exec',
      '--no-playlist',
      '--max-filesize',
      `${MAX_DOWNLOAD_SIZE}`,
      '--restrict-filenames',
      '--print-json',
      '-o',
      outputTemplate,
    ];

    // Audio-only format
    if (format === 'audio') {
      args.push('-x', '--audio-format', 'mp3');
    } else {
      // Prefer H.264 + AAC for broad compatibility (QuickTime, iOS, browsers)
      args.push('-S', 'vcodec:h264,acodec:m4a');
    }

    args.push(url);

    const { stdout } = await execFileAsync('yt-dlp', args, {
      timeout: DOWNLOAD_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024, // 10MB for JSON output
    });

    // Parse yt-dlp JSON output (may contain multiple lines for post-processing)
    const lines = stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '';
    const metadata = JSON.parse(lastLine) as Record<string, unknown>;

    // Find the downloaded file
    const downloadedFile = (metadata._filename || metadata.filename) as string | undefined;
    if (!downloadedFile || !fs.existsSync(downloadedFile)) {
      // Scan tmpDir for any file
      const files = fs.readdirSync(tmpDir);
      if (files.length === 0) {
        res.status(500).json({ error: 'Download completed but no file found' });
        return;
      }
      const filePath = path.join(tmpDir, files[0] as string);
      const buffer = await fs.promises.readFile(filePath);

      await storage.__ensureReady();
      const blobDoc = await storage.blobs.put(buffer, 'application/octet-stream');

      res.json({
        fileId: blobDoc.id,
        url: `/api/v1/files/${blobDoc.id}`,
        size: buffer.length,
        title: (metadata.title as string) || files[0],
        duration: (metadata.duration as number) || null,
        format: (metadata.ext as string) || null,
        metadata: {
          uploader: metadata.uploader || null,
          thumbnail: metadata.thumbnail || null,
          description:
            typeof metadata.description === 'string' ? metadata.description.slice(0, 500) : null,
        },
      });
      return;
    }

    const buffer = await fs.promises.readFile(downloadedFile);
    if (buffer.length > MAX_DOWNLOAD_SIZE) {
      res.status(413).json({ error: 'Downloaded file too large (max 100MB)' });
      return;
    }

    // Determine MIME type from extension
    const ext = path.extname(downloadedFile).slice(1).toLowerCase();
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      opus: 'audio/opus',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      flac: 'audio/flac',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';

    await storage.__ensureReady();
    const blobDoc = await storage.blobs.put(buffer, mime);

    res.json({
      fileId: blobDoc.id,
      url: `/api/v1/files/${blobDoc.id}`,
      size: buffer.length,
      title: (metadata.title as string) || path.basename(downloadedFile),
      duration: (metadata.duration as number) || null,
      format: ext || null,
      metadata: {
        uploader: metadata.uploader || null,
        thumbnail: metadata.thumbnail || null,
        description:
          typeof metadata.description === 'string' ? metadata.description.slice(0, 500) : null,
      },
    });
  } catch (err) {
    const message = (err as Error).message || 'Download failed';
    logger.error('media_download_failed', { error: message });

    if (message.includes('maxBuffer')) {
      res.status(413).json({ error: 'Download output too large' });
      return;
    }
    if (message.includes('TIMEOUT') || message.includes('timed out')) {
      res.status(504).json({ error: 'Download timed out (max 120s)' });
      return;
    }
    res.status(500).json({ error: message });
  } finally {
    // Clean up temp directory
    try {
      if (fs.existsSync(tmpDir)) {
        const files = fs.readdirSync(tmpDir);
        for (const f of files) {
          fs.unlinkSync(path.join(tmpDir, f));
        }
        fs.rmdirSync(tmpDir);
      }
    } catch {
      /* ignore cleanup errors */
    }
  }
});

// ==================== Format Conversion (ffmpeg) ====================

const convertLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
});

const MAX_CONVERT_SIZE = 50 * 1024 * 1024; // 50MB input
const CONVERT_TIMEOUT = 60_000; // 60s

const CONVERT_PROFILES: Record<
  string,
  { ext: string; mime: string; args: string[]; type: 'audio' | 'video' | 'image' }
> = {
  // Audio
  mp3: {
    ext: 'mp3',
    mime: 'audio/mpeg',
    args: ['-codec:a', 'libmp3lame', '-qscale:a', '2'],
    type: 'audio',
  },
  wav: {
    ext: 'wav',
    mime: 'audio/wav',
    args: ['-codec:a', 'pcm_s16le'],
    type: 'audio',
  },
  ogg: {
    ext: 'ogg',
    mime: 'audio/ogg',
    args: ['-codec:a', 'libvorbis', '-qscale:a', '5'],
    type: 'audio',
  },
  'audio-webm': {
    ext: 'webm',
    mime: 'audio/webm',
    args: ['-codec:a', 'libopus', '-b:a', '128k', '-vn'],
    type: 'audio',
  },
  // Video
  mp4: {
    ext: 'mp4',
    mime: 'video/mp4',
    args: ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'],
    type: 'video',
  },
  webm: {
    ext: 'webm',
    mime: 'video/webm',
    args: ['-c:v', 'libvpx-vp9', '-c:a', 'libopus', '-b:v', '1M'],
    type: 'video',
  },
  gif: {
    ext: 'gif',
    mime: 'image/gif',
    args: ['-vf', 'fps=10,scale=480:-1:flags=lanczos', '-loop', '0'],
    type: 'video',
  },
  'extract-audio': {
    ext: 'mp3',
    mime: 'audio/mpeg',
    args: ['-vn', '-codec:a', 'libmp3lame', '-qscale:a', '2'],
    type: 'audio',
  },
  // Image
  png: {
    ext: 'png',
    mime: 'image/png',
    args: ['-frames:v', '1', '-update', '1'],
    type: 'image',
  },
  jpeg: {
    ext: 'jpg',
    mime: 'image/jpeg',
    args: ['-frames:v', '1', '-update', '1', '-q:v', '2'],
    type: 'image',
  },
  'image-webp': {
    ext: 'webp',
    mime: 'image/webp',
    args: ['-frames:v', '1', '-update', '1', '-quality', '85'],
    type: 'image',
  },
};

/** Map MIME types to file extensions for accurate ffmpeg input detection */
const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/ogg': 'ogv',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
  'audio/opus': 'opus',
  'audio/x-wav': 'wav',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
};

interface ConvertOptions {
  base64?: string;
  inputMime?: string;
  outputFormat?: string;
  quality?: number; // 1-100, maps to codec quality param
  audioBitrate?: string; // e.g. '128k', '192k', '320k'
  resolution?: string; // e.g. '1080p', '720p', '480p'
  startTime?: number; // trim start in seconds
  endTime?: number; // trim end in seconds
}

router.post('/convert', json({ limit: '60mb' }), convertLimiter, async (req, res) => {
  const { base64, inputMime, outputFormat, quality, audioBitrate, resolution, startTime, endTime } =
    req.body as ConvertOptions;

  if (!base64 || typeof base64 !== 'string') {
    res.status(400).json({ error: 'base64 data is required' });
    return;
  }

  const format = (outputFormat || '').toLowerCase();
  const profile = CONVERT_PROFILES[format];
  if (!profile) {
    const supported = Object.keys(CONVERT_PROFILES).join(', ');
    res
      .status(400)
      .json({ error: `Unsupported output format: ${format}. Supported: ${supported}` });
    return;
  }

  // Determine input extension from MIME for accurate ffmpeg detection
  const inputExt = MIME_TO_EXT[(inputMime || '').toLowerCase()] || 'webm';

  const inputBuf = Buffer.from(base64, 'base64');
  if (inputBuf.length > MAX_CONVERT_SIZE) {
    res.status(413).json({ error: 'Input too large (max 50MB)' });
    return;
  }

  const tmpName = crypto.randomBytes(16).toString('hex');
  const tmpDir = path.join(os.tmpdir(), `prvctice-convert-${tmpName}`);
  const inputPath = path.join(tmpDir, `input.${inputExt}`);
  const outputPath = path.join(tmpDir, `output.${profile.ext}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(inputPath, inputBuf);

    const args: string[] = [];

    // Trim: start time must come before -i for fast seek
    if (typeof startTime === 'number' && startTime > 0) {
      args.push('-ss', String(startTime));
    }

    args.push('-i', inputPath, '-y');

    // Trim: end time / duration
    if (typeof endTime === 'number' && endTime > 0) {
      const duration = typeof startTime === 'number' ? endTime - startTime : endTime;
      if (duration > 0) args.push('-t', String(duration));
    }

    // Profile base args
    args.push(...profile.args);

    // Quality overrides
    if (typeof quality === 'number' && quality >= 1 && quality <= 100) {
      if (format === 'jpeg' || format === 'image-webp') {
        // ffmpeg quality: lower = better for jpeg (1-31), higher = better for webp
        const q = format === 'jpeg' ? Math.round(31 - (quality / 100) * 30) : quality;
        const flag = format === 'jpeg' ? '-q:v' : '-quality';
        args.push(flag, String(q));
      }
    }

    // Audio bitrate override
    if (audioBitrate && /^\d+k$/i.test(audioBitrate) && profile.type === 'audio') {
      args.push('-b:a', audioBitrate);
    }

    // Video resolution scaling
    if (resolution && profile.type === 'video') {
      const resMap: Record<string, string> = {
        '1080p': '1920:-2',
        '720p': '1280:-2',
        '480p': '854:-2',
      };
      const scale = resMap[resolution];
      if (scale) {
        // Check if -vf already in args and append, otherwise add new
        const vfIdx = args.indexOf('-vf');
        if (vfIdx !== -1 && args[vfIdx + 1]) {
          args[vfIdx + 1] = `scale=${scale}:flags=lanczos,${args[vfIdx + 1]}`;
        } else {
          args.push('-vf', `scale=${scale}:flags=lanczos`);
        }
      }
    }

    args.push(outputPath);

    await execFileAsync('ffmpeg', args, { timeout: CONVERT_TIMEOUT });

    if (!fs.existsSync(outputPath)) {
      res.status(500).json({ error: 'Conversion produced no output' });
      return;
    }

    const outputBuf = await fs.promises.readFile(outputPath);
    const outputBase64 = outputBuf.toString('base64');

    res.json({
      base64: outputBase64,
      mimeType: profile.mime,
      ext: profile.ext,
      size: outputBuf.length,
    });
  } catch (err) {
    const message = (err as Error).message || 'Conversion failed';
    logger.error('media_convert_failed', { error: message });

    if (message.includes('TIMEOUT') || message.includes('timed out')) {
      res.status(504).json({ error: 'Conversion timed out (max 60s)' });
      return;
    }
    res.status(500).json({ error: 'Conversion failed' });
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        for (const f of fs.readdirSync(tmpDir)) {
          fs.unlinkSync(path.join(tmpDir, f));
        }
        fs.rmdirSync(tmpDir);
      }
    } catch {
      /* ignore cleanup errors */
    }
  }
});

export default router;
