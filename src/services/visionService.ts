'use strict';

import { getSystemPrompt } from '../utils/systemPrompt.js';
import storage from '../storage/node/sqlite.js';

export class VisionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface NormalizedImage {
  data: string;
  mime: string;
  detail: string;
}

export interface ImageInput {
  data?: string;
  mimeType?: string;
  mime?: string;
  detail?: string;
}

interface AttachmentInput {
  data?: string;
  mimeType?: string;
  mime?: string;
  detail?: string;
}

interface NormalizeImagesInput {
  fileIds?: string[];
  images?: (string | ImageInput)[];
  attachments?: AttachmentInput[];
}

export interface VisionResult {
  text: string;
  raw: unknown;
}

export type VisionProvider = 'anthropic' | 'gemini' | 'openrouter';

interface VisionAdapterInput {
  apiKey: string;
  message: string | null;
  images: NormalizedImage[];
  model?: string;
}

/**
 * Load a local file by ID and return base64 data
 */
export async function loadLocalFile(
  fileId: string
): Promise<{ data: string; mime: string } | null> {
  try {
    await (storage as { __ensureReady: () => Promise<void> }).__ensureReady();
    const blobMeta = await (
      storage as {
        blobs: {
          getById: (id: string) => Promise<{ mime?: string } | null>;
          get: (meta: { mime?: string }) => Buffer | null;
        };
      }
    ).blobs.getById(fileId);
    if (!blobMeta) return null;
    const buffer = (
      storage as { blobs: { get: (meta: { mime?: string }) => Buffer | null } }
    ).blobs.get(blobMeta);
    if (!buffer) return null;
    return {
      data: buffer.toString('base64'),
      mime: blobMeta.mime || 'image/png',
    };
  } catch {
    return null;
  }
}

/**
 * Normalize image inputs from various formats to a standard array
 * Now handles local file IDs instead of OpenAI file IDs
 */
async function normalizeImages({
  fileIds = [],
  images = [],
  attachments = [],
}: NormalizeImagesInput): Promise<NormalizedImage[]> {
  const result: NormalizedImage[] = [];

  // Handle local file IDs
  for (const fid of fileIds) {
    if (typeof fid === 'string' && fid.trim()) {
      const file = await loadLocalFile(fid.trim());
      if (file) {
        result.push({ data: file.data, mime: file.mime, detail: 'auto' });
      }
    }
  }

  // Handle inline images (base64 or objects with data)
  const allImages = Array.isArray(images) ? images : [];
  for (const entry of allImages) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      result.push({ data: entry, mime: 'image/png', detail: 'auto' });
    } else if (entry && typeof entry === 'object') {
      const { data, mimeType, mime, detail = 'auto' } = entry;
      if (data) {
        result.push({ data, mime: mimeType || mime || 'image/png', detail });
      }
    }
  }

  // Handle attachments
  const atts = Array.isArray(attachments) ? attachments : [];
  for (const att of atts) {
    if (!att) continue;
    const { data, mimeType, mime, detail = 'auto' } = att;
    if (typeof data === 'string' && data.trim()) {
      result.push({ data: data.trim(), mime: mimeType || mime || 'image/png', detail });
    }
  }

  return result;
}

/**
 * Provider-specific vision adapters
 */
const adapters: Record<VisionProvider, (input: VisionAdapterInput) => Promise<VisionResult>> = {
  async anthropic({ apiKey, message, images, model }) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const systemInstr = getSystemPrompt();

    type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    type AnthropicContentBlock =
      | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }
      | { type: 'text'; text: string };

    // Build content array for Anthropic API
    const content: AnthropicContentBlock[] = [];
    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mime || 'image/png') as ImageMediaType,
          data: img.data,
        },
      });
    }
    if (message) content.push({ type: 'text', text: message });

    const resp = await client.messages.create({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemInstr,
      messages: [{ role: 'user', content }],
    });

    const text = resp.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('');
    return { text, raw: resp };
  },

  async gemini({ apiKey, message, images, model }) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelClient = genAI.getGenerativeModel({
      model: model || 'gemini-2.0-flash',
    });

    type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
    const parts: GeminiPart[] = [];
    for (const img of images) {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mime || 'image/png',
        },
      });
    }
    if (message) parts.push({ text: message });

    const result = await modelClient.generateContent({
      contents: [{ role: 'user', parts }],
    });
    const text = result.response?.text() || '';
    return { text, raw: result };
  },

  async openrouter({ apiKey, message, images, model }) {
    const content: Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }> = [];
    if (message) content.push({ type: 'text', text: message });

    for (const img of images) {
      const dataUrl = `data:${img.mime || 'image/png'};base64,${img.data}`;
      content.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'minimax/minimax-m2.5',
        messages: [{ role: 'user', content }],
      }),
    });

    const data = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!response.ok) {
      throw new VisionError(
        'api_error',
        data.error?.message || 'OpenRouter API error',
        response.status
      );
    }
    const text = data.choices?.[0]?.message?.content || '';
    return { text, raw: data };
  },
};

export interface RunVisionInput {
  provider: string;
  apiKey: string;
  message?: string;
  fileIds?: string[];
  images?: (string | ImageInput)[];
  attachments?: AttachmentInput[];
  model?: string;
}

/**
 * Run vision analysis with any supported provider
 */
export async function runVision({
  provider,
  apiKey,
  message,
  fileIds,
  images,
  attachments,
  model,
}: RunVisionInput): Promise<VisionResult> {
  if (!apiKey) {
    throw new VisionError('missing_key', `Missing ${provider} API key`);
  }

  // Normalize all image inputs
  const normalizedImages = await normalizeImages({ fileIds, images, attachments });

  const text = typeof message === 'string' && message.trim() ? message.trim() : null;
  if (!text && normalizedImages.length === 0) {
    throw new VisionError('missing_input', 'Either message or image content is required');
  }

  const adapter = adapters[provider?.toLowerCase() as VisionProvider];
  if (!adapter) {
    throw new VisionError('unsupported_provider', `Unsupported vision provider: ${provider}`);
  }

  return adapter({ apiKey, message: text, images: normalizedImages, model });
}

export default {
  runVision,
  VisionError,
  loadLocalFile,
};
