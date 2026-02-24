/**
 * Media Tools connector handler.
 * Wraps ffmpeg, ffprobe, and yt-dlp for media processing.
 *
 * Methods: probe, convert, extractAudio, screenshot, trim
 * Input: fileId (blob storage) or base64.
 * Output: stored in blob storage, returns fileId + url.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import storage from '../../storage/node/sqlite.js';

const execFileAsync = promisify(execFile);

// ==================== CONSTANTS ====================

const MAX_INPUT_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_OUTPUT_SIZE = 50 * 1024 * 1024; // 50MB
const FFMPEG_TIMEOUT = 120_000; // 120s per operation
const MAX_SCREENSHOTS = 10;

const ALLOWED_AUDIO_FORMATS = new Set(['mp3', 'aac', 'wav', 'ogg', 'opus', 'flac', 'webm', 'm4a']);
const ALLOWED_VIDEO_FORMATS = new Set(['mp4', 'webm', 'mkv']);
const ALLOWED_IMAGE_FORMATS = new Set(['jpg', 'png', 'webp']);

// ==================== HELPERS ====================

function validateFormat(format: string, allowed: ReadonlySet<string>): void {
  if (!allowed.has(format.toLowerCase())) {
    throw new Error(`Unsupported format: ${format}. Allowed: ${[...allowed].join(', ')}`);
  }
}

function tmpPath(ext: string): string {
  const name = crypto.randomBytes(16).toString('hex');
  return path.join(os.tmpdir(), `prvctice-media-${name}.${ext}`);
}

function cleanupFiles(...paths: string[]): void {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Resolve input to a temp file path.
 * Accepts { fileId } (blob storage) or { base64 } (inline data).
 */
async function resolveInput(
  params: Record<string, unknown>
): Promise<{ inputPath: string; cleanup: boolean }> {
  const fileId = params.fileId as string | undefined;
  const base64 = params.base64 as string | undefined;

  if (fileId) {
    await storage.__ensureReady();
    const blobMeta = await storage.blobs.getById(fileId);
    if (!blobMeta) throw new Error('File not found: ' + fileId);
    const buffer = storage.blobs.get(blobMeta);
    if (!buffer) throw new Error('File content not found: ' + fileId);
    if (buffer.length > MAX_INPUT_SIZE) {
      throw new Error(
        `Input too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max ${MAX_INPUT_SIZE / 1024 / 1024}MB)`
      );
    }
    // Write to tmpfile so ffmpeg can read it
    const ext = (blobMeta.mime || '').split('/')[1] || 'bin';
    const inputPath = tmpPath(ext);
    fs.writeFileSync(inputPath, buffer);
    return { inputPath, cleanup: true };
  }

  if (base64) {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_INPUT_SIZE) {
      throw new Error(
        `Input too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max ${MAX_INPUT_SIZE / 1024 / 1024}MB)`
      );
    }
    const inputPath = tmpPath('bin');
    fs.writeFileSync(inputPath, buffer);
    return { inputPath, cleanup: true };
  }

  throw new Error('Either fileId or base64 is required');
}

/**
 * Store output file in blob storage, return metadata.
 */
async function storeOutput(
  outputPath: string,
  mime: string
): Promise<{ fileId: string; size: number; url: string }> {
  const buffer = fs.readFileSync(outputPath);
  if (buffer.length > MAX_OUTPUT_SIZE) {
    throw new Error(
      `Output too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max ${MAX_OUTPUT_SIZE / 1024 / 1024}MB)`
    );
  }
  await storage.__ensureReady();
  const blobDoc = await storage.blobs.put(buffer, mime);
  return {
    fileId: blobDoc.id,
    size: buffer.length,
    url: `/api/v1/files/${blobDoc.id}`,
  };
}

// ==================== METHODS ====================

/**
 * Probe media file metadata using ffprobe.
 */
async function probe(params: Record<string, unknown>): Promise<unknown> {
  const { inputPath, cleanup } = await resolveInput(params);
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
      { timeout: 30_000 }
    );

    const info = JSON.parse(stdout) as {
      format?: {
        duration?: string;
        size?: string;
        format_name?: string;
        format_long_name?: string;
        bit_rate?: string;
      };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        sample_rate?: string;
        channels?: number;
        duration?: string;
        bit_rate?: string;
      }>;
    };

    const videoStream = (info.streams || []).find((s) => s.codec_type === 'video');
    const audioStream = (info.streams || []).find((s) => s.codec_type === 'audio');

    return {
      duration: info.format?.duration ? parseFloat(info.format.duration) : null,
      size: info.format?.size ? parseInt(info.format.size) : null,
      format: info.format?.format_name || null,
      formatLong: info.format?.format_long_name || null,
      bitRate: info.format?.bit_rate ? parseInt(info.format.bit_rate) : null,
      video: videoStream
        ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            bitRate: videoStream.bit_rate ? parseInt(videoStream.bit_rate) : null,
          }
        : null,
      audio: audioStream
        ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : null,
            channels: audioStream.channels,
            bitRate: audioStream.bit_rate ? parseInt(audioStream.bit_rate) : null,
          }
        : null,
    };
  } finally {
    if (cleanup) cleanupFiles(inputPath);
  }
}

/**
 * Convert media to a different format via ffmpeg.
 */
async function convert(params: Record<string, unknown>): Promise<unknown> {
  const format = (params.format as string) || 'mp4';
  // Determine which format set to check
  const allFormats = new Set([...ALLOWED_AUDIO_FORMATS, ...ALLOWED_VIDEO_FORMATS]);
  validateFormat(format, allFormats);

  const { inputPath, cleanup } = await resolveInput(params);
  const outputPath = tmpPath(format);
  try {
    await execFileAsync('ffmpeg', ['-i', inputPath, '-y', outputPath], { timeout: FFMPEG_TIMEOUT });

    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      mp3: 'audio/mpeg',
      aac: 'audio/aac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
    };
    const mime = mimeMap[format] || 'application/octet-stream';
    const result = await storeOutput(outputPath, mime);
    return { ...result, format };
  } finally {
    if (cleanup) cleanupFiles(inputPath);
    cleanupFiles(outputPath);
  }
}

/**
 * Extract audio track from a video file.
 */
async function extractAudio(params: Record<string, unknown>): Promise<unknown> {
  const format = (params.format as string) || 'mp3';
  validateFormat(format, ALLOWED_AUDIO_FORMATS);

  const { inputPath, cleanup } = await resolveInput(params);
  const outputPath = tmpPath(format);
  try {
    await execFileAsync('ffmpeg', ['-i', inputPath, '-vn', '-y', outputPath], {
      timeout: FFMPEG_TIMEOUT,
    });

    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      aac: 'audio/aac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
      flac: 'audio/flac',
      webm: 'audio/webm',
      m4a: 'audio/mp4',
    };
    const mime = mimeMap[format] || 'audio/mpeg';
    const result = await storeOutput(outputPath, mime);
    return { ...result, format };
  } finally {
    if (cleanup) cleanupFiles(inputPath);
    cleanupFiles(outputPath);
  }
}

/**
 * Extract screenshots at specified timestamps.
 */
async function screenshot(params: Record<string, unknown>): Promise<unknown> {
  const timestamps = params.timestamps as number[];
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    throw new Error('timestamps array is required');
  }
  if (timestamps.length > MAX_SCREENSHOTS) {
    throw new Error(`Max ${MAX_SCREENSHOTS} screenshots per request`);
  }
  const format = (params.format as string) || 'jpg';
  validateFormat(format, ALLOWED_IMAGE_FORMATS);

  const { inputPath, cleanup } = await resolveInput(params);
  const outputs: string[] = [];
  try {
    const results: Array<{ fileId: string; size: number; url: string; timestamp: number }> = [];

    for (const ts of timestamps) {
      const outputPath = tmpPath(format);
      outputs.push(outputPath);

      await execFileAsync(
        'ffmpeg',
        ['-ss', String(ts), '-i', inputPath, '-frames:v', '1', '-y', outputPath],
        { timeout: 30_000 }
      );

      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      const mime = mimeMap[format] || 'image/jpeg';
      const stored = await storeOutput(outputPath, mime);
      results.push({ ...stored, timestamp: ts });
    }

    return { screenshots: results };
  } finally {
    if (cleanup) cleanupFiles(inputPath);
    cleanupFiles(...outputs);
  }
}

/**
 * Trim a media file using stream copy (fast, no re-encoding).
 */
async function trim(params: Record<string, unknown>): Promise<unknown> {
  const start = params.start as number | undefined;
  const end = params.end as number | undefined;
  if (start == null && end == null) {
    throw new Error('At least one of start or end is required');
  }

  const format = (params.format as string) || 'mp4';
  const allFormats = new Set([...ALLOWED_AUDIO_FORMATS, ...ALLOWED_VIDEO_FORMATS]);
  validateFormat(format, allFormats);

  const { inputPath, cleanup } = await resolveInput(params);
  const outputPath = tmpPath(format);
  try {
    const args: string[] = [];
    if (start != null) args.push('-ss', String(start));
    args.push('-i', inputPath);
    if (end != null) {
      if (start != null) {
        args.push('-t', String(end - start));
      } else {
        args.push('-t', String(end));
      }
    }
    args.push('-c', 'copy', '-y', outputPath);

    await execFileAsync('ffmpeg', args, { timeout: FFMPEG_TIMEOUT });

    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      mp3: 'audio/mpeg',
      aac: 'audio/aac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
    };
    const mime = mimeMap[format] || 'application/octet-stream';
    const result = await storeOutput(outputPath, mime);
    return { ...result, format, start: start ?? 0, end: end ?? null };
  } finally {
    if (cleanup) cleanupFiles(inputPath);
    cleanupFiles(outputPath);
  }
}

// ==================== EXPORT ====================

export const mediaToolsHandler: Readonly<
  Record<string, (params: Record<string, unknown>, appId: string) => Promise<unknown>>
> = { probe, convert, extractAudio, screenshot, trim };
