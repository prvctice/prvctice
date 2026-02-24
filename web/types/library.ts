/**
 * File Library type definitions
 * Types for persistent file storage and management
 */

/** Metadata for a file stored in the library */
export interface LibraryFile {
  /** Unique identifier (SHA-256 hash of content) */
  id: string;
  /** Original filename */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Upload timestamp */
  uploadedAt: number;
  /** Last opened timestamp (for LRU eviction) */
  lastAccessedAt: number;
  /** Hash of thumbnail blob (if generated) */
  thumbnailHash?: string;
  /** Extracted metadata (for PDFs) */
  metadata?: LibraryFileMetadata;
  /** Folder classification ('Notes' | 'Images' | 'Audio' | undefined for root) */
  folder?: string;
  /** Links library file back to a source (e.g. note tab ID) for upsert updates */
  sourceId?: string;
}

/** Extracted metadata from PDF documents */
export interface LibraryFileMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
}

/** Library configuration from environment */
export interface LibraryConfig {
  maxFiles: number;
  warningThreshold: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

/** Get library limits from environment or defaults */
export function getLibraryConfig(): LibraryConfig {
  const envLimit =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_FILE_LIBRARY_LIMIT as string | undefined)
      : undefined;

  const maxFiles = envLimit ? parseInt(envLimit, 10) : 50;

  return {
    maxFiles: Number.isNaN(maxFiles) ? 50 : maxFiles,
    warningThreshold: Math.floor(maxFiles * 0.9),
    thumbnailWidth: 120,
    thumbnailHeight: 160,
  };
}

/** Known folder names for auto-classification */
export const LIBRARY_FOLDERS = ['Notes', 'Images', 'Audio'] as const;
export type LibraryFolder = (typeof LIBRARY_FOLDERS)[number];

/** Infer folder from MIME type */
export function inferFolder(mimeType: string): string | undefined {
  if (mimeType.startsWith('image/')) return 'Images';
  if (mimeType.startsWith('audio/')) return 'Audio';
  return undefined;
}

/** Storage key for library metadata */
export const LIBRARY_STORAGE_KEY = 'fileLibrary';
