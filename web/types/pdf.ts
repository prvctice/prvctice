/**
 * PDF module type definitions
 * Types for PDF rendering, highlights, and annotations
 */

/** PDF document metadata */
export interface PdfDocument {
  /** Unique identifier (hash of file or URL) */
  id: string;
  /** Original filename or URL */
  source: string;
  /** Display title (from metadata or filename) */
  title: string;
  /** Author from PDF metadata */
  author?: string;
  /** Subject from PDF metadata */
  subject?: string;
  /** Keywords from PDF metadata */
  keywords?: string;
  /** PDF creation date */
  creationDate?: Date;
  /** PDF modification date */
  modificationDate?: Date;
  /** Total number of pages */
  numPages: number;
  /** PDF version string */
  pdfVersion?: string;
  /** Whether document is encrypted */
  isEncrypted: boolean;
  /** File size in bytes */
  fileSize?: number;
}

/** PDF page information */
export interface PdfPage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Original page width in PDF units */
  width: number;
  /** Original page height in PDF units */
  height: number;
  /** Page rotation in degrees (0, 90, 180, 270) */
  rotation: number;
  /** Extracted text content */
  textContent?: string;
}

/** Zoom mode for PDF rendering */
export type ZoomMode = 'fit-width' | 'fit-page' | 'percentage';

/** Zoom configuration */
export interface ZoomConfig {
  mode: ZoomMode;
  /** Percentage value when mode is 'percentage' (0.1 - 5.0) */
  percentage: number;
}

/** Text position in PDF coordinates */
export interface PdfTextPosition {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Character index start */
  startIndex: number;
  /** Character index end */
  endIndex: number;
  /** Bounding rectangles (multiple for multi-line selections) */
  rects: PdfRect[];
}

/** Rectangle in PDF coordinates */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Highlight color options */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple';

/** Highlight data structure */
export interface PdfHighlight {
  /** Unique identifier */
  id: string;
  /** Document ID this highlight belongs to */
  documentId: string;
  /** Selected text content */
  text: string;
  /** Position information */
  position: PdfTextPosition;
  /** Highlight color */
  color: HighlightColor;
  /** Optional annotation/note */
  annotation?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt?: number;
}

/** Annotation data structure (standalone note not tied to highlight) */
export interface PdfAnnotation {
  /** Unique identifier */
  id: string;
  /** Document ID */
  documentId: string;
  /** Page number */
  pageNumber: number;
  /** Position on page (percentage from top-left) */
  position: {
    x: number;
    y: number;
  };
  /** Annotation content */
  content: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt?: number;
}

/** Render task state */
export interface RenderTask {
  pageNumber: number;
  scale: number;
  canvas: HTMLCanvasElement;
  cancel: () => void;
}

/** PDF renderer state */
export interface PdfRendererState {
  /** Currently loaded document */
  document: PdfDocument | null;
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Total pages in document */
  totalPages: number;
  /** Current zoom configuration */
  zoom: ZoomConfig;
  /** Computed scale factor */
  scale: number;
  /** Whether document is loading */
  isLoading: boolean;
  /** Whether page is rendering */
  isRendering: boolean;
  /** Error message if any */
  error: string | null;
}

/** Options for loading a PDF */
export interface LoadPdfOptions {
  /** Password for encrypted PDFs */
  password?: string;
  /** Initial page to navigate to */
  initialPage?: number;
  /** Initial zoom configuration */
  initialZoom?: ZoomConfig;
}

/** Options for rendering a page */
export interface RenderPageOptions {
  /** Target canvas element */
  canvas: HTMLCanvasElement;
  /** Optional text layer container */
  textLayerContainer?: HTMLDivElement;
  /** Optional annotation layer container */
  annotationLayerContainer?: HTMLDivElement;
  /** Scale override (uses current scale if not provided) */
  scale?: number;
  /** Device pixel ratio for high-DPI displays */
  devicePixelRatio?: number;
}

/** Thumbnail render options */
export interface ThumbnailOptions {
  /** Maximum width in pixels */
  maxWidth: number;
  /** Maximum height in pixels */
  maxHeight: number;
}

/** Storage key format for PDF data */
export interface PdfStorageKeys {
  /** Key for document metadata */
  document: (id: string) => string;
  /** Key for highlights */
  highlights: (id: string) => string;
  /** Key for annotations */
  annotations: (id: string) => string;
  /** Key for last position */
  position: (id: string) => string;
}

/** PDF storage keys factory */
export const PDF_STORAGE_KEYS: PdfStorageKeys = {
  document: (id: string) => `pdf:${id}:document`,
  highlights: (id: string) => `pdf:${id}:highlights`,
  annotations: (id: string) => `pdf:${id}:annotations`,
  position: (id: string) => `pdf:${id}:position`,
};

/** Color values for highlights (CSS colors) */
export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(255, 235, 59, 0.4)',
  green: 'rgba(76, 175, 80, 0.4)',
  blue: 'rgba(33, 150, 243, 0.4)',
  pink: 'rgba(233, 30, 99, 0.4)',
  orange: 'rgba(255, 152, 0, 0.4)',
  purple: 'rgba(156, 39, 176, 0.4)',
};

export {};
