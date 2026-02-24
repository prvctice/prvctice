/**
 * Streaming utilities for chat route
 * - Tool image streaming
 * - Synthetic delta writing
 * - Stream follow-up handling
 */

import type { Response } from 'express';
import type { StreamChunk, StreamAdapter, ToolEventSummary } from './types';
import * as fs from 'fs';
import logger from '../../utils/logger.js';

/**
 * Safe write to response stream — logs instead of silently swallowing errors.
 * Client disconnects during streaming are expected; this ensures visibility.
 */
function safeWrite(res: Response, data: string, context?: string): boolean {
  try {
    res.write(data);
    return true;
  } catch (err) {
    logger.warn('stream_write_failed', {
      context: context ?? 'unknown',
      error: (err as Error)?.message,
    });
    return false;
  }
}

/** Image data from tool output */
interface ToolImage {
  data?: string | Buffer;
  base64?: string;
  image?: string;
  mimeType?: string;
}

/** Download file info */
interface DownloadFile {
  path?: string;
  variant?: string;
  contentType?: string;
}

/** Moodboard image from tool */
interface MoodboardImage {
  url?: string;
  thumbnailUrl?: string;
  title?: string;
  artist?: string;
  date?: string;
  source?: string;
  sourceUrl?: string;
}

/** Tool payload with images */
interface ToolImagePayload {
  images?: (ToolImage | MoodboardImage)[];
  downloads?: DownloadFile[];
  sources?: string[];
  intent?: string;
  books?: unknown[];
  essays?: unknown[];
  films?: unknown[];
  matchNotes?: string[];
  results?: unknown[]; // batch_tools nested results
}

/** Stream follow result */
interface StreamFollowResult {
  nextToolCalls: StreamChunk[];
  responseId: string | null;
}

/**
 * Stream tool images to client
 */
async function streamToolImages(res: Response, name: string, payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') return;

  const toolPayload = payload as ToolImagePayload;

  // Handle batch_tools: iterate over nested results and stream each sub-result
  if (name === 'batch_tools' && Array.isArray(toolPayload.results)) {
    for (const entry of toolPayload.results as Array<{
      name?: string;
      ok?: boolean;
      result?: unknown;
    }>) {
      if (entry && entry.ok && entry.name && entry.result) {
        await streamToolImages(res, entry.name, entry.result);
      }
    }
    return;
  }

  // Handle book_search results - structured text cards, not images
  if (name === 'book_search' && toolPayload.books && Array.isArray(toolPayload.books)) {
    safeWrite(
      res,
      `${JSON.stringify({
        type: 'book_results',
        books: toolPayload.books,
        sources: toolPayload.sources || [],
      })}\n`,
      'book_results'
    );
    return;
  }

  // Handle essay_search results - structured text cards, not images
  if (name === 'essay_search' && toolPayload.essays && Array.isArray(toolPayload.essays)) {
    safeWrite(
      res,
      `${JSON.stringify({
        type: 'essay_results',
        essays: toolPayload.essays,
      })}\n`,
      'essay_results'
    );
    return;
  }

  // Handle film_search results - structured cards with poster and crew
  if (name === 'film_search' && toolPayload.films && Array.isArray(toolPayload.films)) {
    safeWrite(
      res,
      `${JSON.stringify({
        type: 'film_results',
        films: toolPayload.films,
        matchNotes: toolPayload.matchNotes || [],
      })}\n`,
      'film_results'
    );
    return;
  }

  // Handle moodboard_search results - URL-based images, not base64
  if (
    name === 'moodboard_search' &&
    Array.isArray(toolPayload.images) &&
    toolPayload.images.length > 0
  ) {
    safeWrite(
      res,
      `${JSON.stringify({
        type: 'moodboard',
        images: toolPayload.images.map((img) => {
          const mbImg = img as MoodboardImage;
          return {
            url: mbImg.url,
            thumbnailUrl: mbImg.thumbnailUrl || mbImg.url,
            title: mbImg.title || '',
            artist: mbImg.artist || '',
            date: mbImg.date || '',
            source: mbImg.source || '',
            sourceUrl: mbImg.sourceUrl || '',
          };
        }),
        sources: toolPayload.sources || [],
        intent: toolPayload.intent || 'general',
      })}\n`,
      'moodboard_results'
    );
    if (process.env.DEBUG_MCP === '1') {
      logger.debug('stream_moodboard_images', { count: toolPayload.images.length });
    }
    return;
  }

  const images: ToolImage[] = Array.isArray(toolPayload.images)
    ? ([...toolPayload.images] as ToolImage[])
    : [];
  const downloads = Array.isArray(toolPayload.downloads) ? toolPayload.downloads : [];

  if (downloads.length) {
    for (const file of downloads) {
      if (!file || !file.path) continue;
      const variant = String(file.variant || '').toLowerCase();
      if (!['thumbnail', 'spritesheet'].includes(variant)) continue;
      try {
        const buffer = await fs.promises.readFile(file.path);
        const mime =
          file.contentType ||
          (variant === 'thumbnail'
            ? 'image/webp'
            : variant === 'spritesheet'
              ? 'image/jpeg'
              : 'image/png');
        images.push({ data: buffer.toString('base64'), mimeType: mime });
      } catch (err) {
        if (process.env.DEBUG_MCP === '1') {
          logger.warn('stream_thumbnail_failed', {
            variant,
            path: file.path,
            error: (err as Error) && (err as Error).message,
          });
        }
      }
    }
  }

  if (!images.length) return;

  const limit = Math.max(1, parseInt(process.env.TOOL_IMAGE_STREAM_LIMIT || '4', 10));
  let sent = 0;

  for (const img of images) {
    if (!img) continue;
    let data: string | Buffer | null = img.data || img.base64 || img.image || null;
    if (Buffer.isBuffer(data)) data = data.toString('base64');
    if (typeof data !== 'string' || !data.trim()) continue;
    const cleaned = data.replace(/\s+/g, '');
    if (!cleaned) continue;
    const paddingNeeded = cleaned.length % 4;
    const padded = paddingNeeded === 0 ? cleaned : `${cleaned}${'='.repeat(4 - paddingNeeded)}`;
    const mimeType =
      typeof img.mimeType === 'string' && img.mimeType.trim() ? img.mimeType.trim() : 'image/png';

    if (process.env.DEBUG_MCP === '1') {
      logger.debug('stream_image_chunk', { name, preview: padded.slice(0, 16) });
    }
    safeWrite(
      res,
      `${JSON.stringify({
        type: 'image',
        name,
        mimeType,
        data: padded,
      })}\n`,
      'image'
    );

    sent += 1;
    if (sent >= limit) break;
  }
}

/**
 * Create synthetic delta writer
 */
function createSyntheticDeltaWriter(res: Response): (summary: string) => boolean {
  let lastSyntheticSummary: string | null = null;

  return function writeSyntheticDelta(summary: string): boolean {
    const trimmed = typeof summary === 'string' ? summary.trim() : '';
    if (!trimmed) {
      if (process.env.DEBUG_MCP === '1') {
        logger.debug('synthetic_empty_summary');
      }
      return false;
    }
    if (lastSyntheticSummary && lastSyntheticSummary === trimmed) {
      if (process.env.DEBUG_MCP === '1') {
        logger.debug('synthetic_duplicate_summary');
      }
      return false;
    }
    lastSyntheticSummary = trimmed;
    const deltaChunk = { type: 'delta', content: trimmed };
    try {
      res.write(`${JSON.stringify(deltaChunk)}\n`);
      if (process.env.DEBUG_MCP === '1') {
        logger.debug('synthetic_wrote_delta', { length: trimmed.length });
      }
    } catch (err) {
      if (process.env.DEBUG_MCP === '1') {
        logger.debug('synthetic_write_error', { error: (err as Error)?.message });
      }
      return false;
    }
    return true;
  };
}

/**
 * Create stream follow function for handling follow-up tool calls
 */
function createStreamFollow(
  adapter: StreamAdapter,
  res: Response,
  provider: string
): (params: Record<string, unknown>) => Promise<StreamFollowResult> {
  return async function streamFollow(params: Record<string, unknown>): Promise<StreamFollowResult> {
    logger.debug('stream_follow_called', { messageCount: (params.messages as unknown[])?.length });
    const nextToolCalls: StreamChunk[] = [];
    let lastResponseId: string | null = null;

    for await (const chunk of adapter.streamChat(params)) {
      if (process.env.DEBUG_MCP === '1' || provider.toLowerCase() === 'anthropic') {
        logger.debug('stream_follow_chunk', { chunk: JSON.stringify(chunk) });
      }

      if (chunk.type === 'tool_call') {
        nextToolCalls.push(chunk);
        const toolId =
          chunk.id || chunk.call_id || chunk.tool_call_id || chunk.tool_use_id || chunk.toolUseId;
        logger.debug('follow_stream_tool_call', { name: chunk.name, id: toolId });
        if (toolId) {
          safeWrite(
            res,
            `${JSON.stringify({
              type: 'tool_progress',
              phase: 'started',
              id: toolId,
              name: chunk.name,
            })}\n`,
            'follow_tool_progress'
          );
        }
        continue;
      }

      if (chunk.type === 'response_id' && chunk.id) {
        lastResponseId = chunk.id;
      }

      if (chunk.type === 'delta') {
        logger.debug('follow_stream_delta', { length: chunk.content?.length || 0 });
      }

      res.write(`${JSON.stringify(chunk)}\n`);
    }

    return { nextToolCalls, responseId: lastResponseId };
  };
}

/**
 * Emit tool progress event
 */
function emitToolProgress(
  res: Response,
  phase: string,
  toolId: string | undefined,
  toolName: string | undefined
): void {
  safeWrite(
    res,
    `${JSON.stringify({
      type: 'tool_progress',
      phase,
      id: toolId,
      name: toolName,
    })}\n`,
    `tool_progress:${phase}`
  );
}

/**
 * Emit tool result event
 */
function emitToolResult(
  res: Response,
  toolId: string | undefined,
  toolName: string | undefined,
  eventSummary: ToolEventSummary
): void {
  const event: Record<string, unknown> = {
    type: 'tool_result',
    id: toolId,
    name: toolName,
    status: eventSummary.status,
    summary: eventSummary.summary,
    count: eventSummary.count,
    note: eventSummary.note,
  };
  // Include error code and action for actionable UI
  if (eventSummary.code) event.code = eventSummary.code;
  if (eventSummary.action) event.action = eventSummary.action;
  safeWrite(res, `${JSON.stringify(event)}\n`, `tool_result:${toolName}`);
}

export {
  streamToolImages,
  createSyntheticDeltaWriter,
  createStreamFollow,
  emitToolProgress,
  emitToolResult,
};
