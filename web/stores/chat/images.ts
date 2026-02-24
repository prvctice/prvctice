/**
 * Image processing utilities
 * Handles base64 conversion, blob management, and image entry normalization
 */

import { debugLog, logError } from '@web/utils/debugLog.js';
import { uuid } from './utils.js';
import type {
  ImageMetadata,
  AssistantImageEntry,
  ImageConversionOptions,
  ImageConversionResult,
} from '@web/types/chat.js';

/**
 * Build an assistant image entry object
 */
export function buildAssistantImageEntry(
  src: string,
  meta: ImageMetadata = {}
): AssistantImageEntry | null {
  if (!src) return null;
  return {
    src,
    kind: 'assistant',
    mimeType: meta.mimeType,
    prompt: typeof meta.prompt === 'string' ? meta.prompt : '',
    model: typeof meta.model === 'string' ? meta.model : undefined,
    provider: typeof meta.provider === 'string' ? meta.provider : undefined,
    downloadName: meta.downloadName,
    timestamp: meta.timestamp || Date.now(),
    source: typeof meta.source === 'string' ? meta.source : 'assistant',
    imageId: meta.imageId || uuid(),
    base64: typeof meta.base64 === 'string' ? meta.base64 : undefined,
  };
}

/**
 * Allowed image MIME types for uploads
 */
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Normalize MIME type (e.g., image/jpg -> image/jpeg)
 */
function normalizeImageType(type: string): string {
  return type === 'image/jpg' ? 'image/jpeg' : type || 'image/png';
}

/**
 * Convert an array of File/Blob objects to base64 image objects
 */
export async function convertFilesToBase64Images(
  files: Array<File | Blob>,
  options: ImageConversionOptions = {}
): Promise<ImageConversionResult> {
  const { onConverted, verbose = false } = options;
  const images: Array<{ data: string; mimeType: string }> = [];
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const mt = normalizeImageType((file as File).type || 'image/png');
      if (!ALLOWED_IMAGE_TYPES.has(mt)) {
        if (verbose) debugLog('image', 'convert:skip', { type: mt });
        skipped++;
        continue;
      }
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
      const base64 = btoa(binary);
      if (!base64 || base64.length < 100) {
        if (verbose)
          logError('image', 'convert:invalidBase64', `Invalid base64 length: ${base64?.length}`);
        errors++;
        continue;
      }
      if (verbose)
        debugLog('image', 'convert:success', {
          mimeType: mt,
          base64Length: base64.length,
        });
      const imageObj = { data: base64, mimeType: mt };
      images.push(imageObj);
      if (onConverted) onConverted(imageObj);
    } catch (err) {
      if (verbose) logError('image', 'convert:failed', err as Error);
      errors++;
    }
  }

  return { images, skipped, errors };
}
