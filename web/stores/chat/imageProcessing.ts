/**
 * Image processing for chat send operations
 * Handles base64 conversion and message updates for images
 */

import { convertFilesToBase64Images } from './images.js';
import type { ChatMessage } from '@web/types/chat.js';

export interface Base64Image {
  data: string;
  mimeType: string;
}

export interface ImageProcessingResult {
  images: Base64Image[];
  skipped: number;
  errors: number;
}

export interface ImageProcessingCallbacks {
  onConverted?: (img: Base64Image) => void;
  verbose?: boolean;
}

/**
 * Convert attached files to base64 images
 * @param files - Array of File or Blob objects to convert
 * @param callbacks - Optional callbacks for conversion events
 * @returns Conversion result with images, skipped count, and error count
 */
export async function processAttachedImages(
  files: Array<File | Blob>,
  callbacks: ImageProcessingCallbacks = {}
): Promise<ImageProcessingResult> {
  return convertFilesToBase64Images(files, {
    onConverted: callbacks.onConverted,
    verbose: callbacks.verbose,
  });
}

/**
 * Update messages array with base64 data for images that don't have it yet.
 * Returns a new array (immutable update).
 * @param messages - Current messages array
 * @param base64Outputs - Array of base64 images to apply
 * @returns New messages array with updated image data
 */
export function updateMessagesWithBase64(
  messages: ChatMessage[],
  base64Outputs: Base64Image[]
): ChatMessage[] {
  if (base64Outputs.length === 0) return messages;

  let outIdx = 0;
  return messages.map((msg) => {
    // Only update user messages with images
    if (msg.sender !== 'user' || !msg.images || msg.images.length === 0) {
      return msg;
    }

    // Check if any images in this message need base64 data
    const needsUpdate = msg.images.some((img) => !img.base64 && outIdx < base64Outputs.length);
    if (!needsUpdate) return msg;

    // Create new images array with updated base64 data
    const updatedImages = msg.images.map((img) => {
      const output = base64Outputs[outIdx];
      if (!img.base64 && output && outIdx < base64Outputs.length) {
        const updated = {
          ...img,
          base64: output.data,
          mimeType: output.mimeType,
        };
        outIdx++;
        return updated;
      }
      return img;
    });

    return { ...msg, images: updatedImages };
  });
}

/**
 * Get source files for image processing from attachments or window state
 * @param attachedFiles - Files from useFileAttachments
 * @returns Array of files to process
 */
export function getSourceFiles(attachedFiles: Array<File | Blob>): Array<File | Blob> {
  if (attachedFiles.length > 0) {
    return attachedFiles;
  }
  if (
    typeof window !== 'undefined' &&
    Array.isArray(window.localPreviewBlobs) &&
    window.localPreviewBlobs.length > 0
  ) {
    return window.localPreviewBlobs;
  }
  return [];
}
