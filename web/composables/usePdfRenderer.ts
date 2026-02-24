/**
 * PDF Renderer Composable
 *
 * Wraps PDF.js for loading and rendering PDF documents.
 * Provides:
 * - Document loading from File or URL
 * - Canvas-based page rendering
 * - Text layer overlay for selection
 * - Zoom/scale controls (fit-width, fit-page, percentage)
 * - Reactive state for current page, total pages, loading, errors
 */

import { ref, computed, shallowRef, watch, onBeforeUnmount, type Ref, type ComputedRef } from 'vue';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask as PdfjsRenderTask,
  TextLayer,
} from 'pdfjs-dist';
import { logError } from '@web/utils/debugLog.js';
import type {
  PdfDocument,
  PdfPage,
  ZoomConfig,
  ZoomMode,
  LoadPdfOptions,
  RenderPageOptions,
  ThumbnailOptions,
} from '@web/types/pdf';

// Local type for text items (not exported from pdfjs-dist main module)
interface PdfTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

// Lazy-load pdfjs-dist (~400KB) only when a PDF is opened
let _pdfjsLib: typeof import('pdfjs-dist') | null = null;
async function getPdfjsLib() {
  if (!_pdfjsLib) {
    const [lib, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    _pdfjsLib = lib;
    lib.GlobalWorkerOptions.workerSrc = (workerModule as { default: string }).default;
  }
  return _pdfjsLib;
}

/** Default zoom configuration */
const DEFAULT_ZOOM: ZoomConfig = {
  mode: 'fit-width',
  percentage: 1.0,
};

/** Zoom step for zoom in/out */
const ZOOM_STEP = 0.25;

/** Minimum zoom percentage */
const ZOOM_MIN = 0.25;

/** Maximum zoom percentage */
const ZOOM_MAX = 5.0;

/** Percentage zoom presets */
const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

export interface UsePdfRendererOptions {
  /** Container element ref for calculating fit dimensions */
  containerRef?: Ref<HTMLElement | null>;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Callback when document loads */
  onDocumentLoad?: (doc: PdfDocument) => void;
  /** Callback on errors */
  onError?: (error: string) => void;
}

export interface UsePdfRendererReturn {
  // State
  document: Ref<PdfDocument | null>;
  currentPage: Ref<number>;
  totalPages: ComputedRef<number>;
  zoom: Ref<ZoomConfig>;
  scale: ComputedRef<number>;
  isLoading: Ref<boolean>;
  isRendering: Ref<boolean>;
  error: Ref<string | null>;

  // Current page info
  pageInfo: Ref<PdfPage | null>;

  // Methods
  loadDocument: (source: File | string, options?: LoadPdfOptions) => Promise<void>;
  unloadDocument: () => void;
  renderPage: (options: RenderPageOptions) => Promise<void>;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setZoom: (config: ZoomConfig) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setZoomPercentage: (percentage: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getPageText: (pageNumber: number) => Promise<string>;
  renderThumbnail: (pageNumber: number, options: ThumbnailOptions) => Promise<HTMLCanvasElement>;

  // Cleanup
  destroy: () => void;
}

/**
 * Generate document ID from file or URL
 */
async function generateDocumentId(source: File | string): Promise<string> {
  let data: string;

  if (source instanceof File) {
    // Use filename + size + lastModified for files
    data = `${source.name}:${source.size}:${source.lastModified}`;
  } else {
    // Use URL for remote sources
    data = source;
  }

  // Simple hash using Web Crypto API
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract document metadata from PDF
 */
async function extractMetadata(
  pdfDoc: PDFDocumentProxy,
  source: File | string,
  docId: string
): Promise<PdfDocument> {
  const metadata = await pdfDoc.getMetadata();
  const info = metadata.info as Record<string, unknown>;

  // Get source name
  const sourceName = source instanceof File ? source.name : source;
  const title =
    (info.Title as string) ||
    (source instanceof File ? source.name.replace(/\.pdf$/i, '') : 'PDF Document');

  return {
    id: docId,
    source: sourceName,
    title,
    author: (info.Author as string) || undefined,
    subject: (info.Subject as string) || undefined,
    keywords: (info.Keywords as string) || undefined,
    creationDate: info.CreationDate ? new Date(info.CreationDate as string) : undefined,
    modificationDate: info.ModDate ? new Date(info.ModDate as string) : undefined,
    numPages: pdfDoc.numPages,
    pdfVersion: (info.PDFFormatVersion as string) || undefined,
    isEncrypted: (info.IsAcroFormPresent as boolean) || false,
    fileSize: source instanceof File ? source.size : undefined,
  };
}

/**
 * Calculate scale factor based on zoom configuration
 */
function calculateScale(
  zoom: ZoomConfig,
  pageWidth: number,
  pageHeight: number,
  containerWidth: number,
  containerHeight: number
): number {
  // Ensure we have valid dimensions - use sensible minimums if container not yet laid out
  const effectiveWidth = Math.max(containerWidth, 200);
  const effectiveHeight = Math.max(containerHeight, 200);

  let result: number;

  switch (zoom.mode) {
    case 'fit-width':
      // Account for some padding
      result = (effectiveWidth - 40) / pageWidth;
      break;

    case 'fit-page': {
      const widthScale = (effectiveWidth - 40) / pageWidth;
      const heightScale = (effectiveHeight - 40) / pageHeight;
      result = Math.min(widthScale, heightScale);
      break;
    }

    case 'percentage':
      result = zoom.percentage;
      break;

    default:
      result = 1.0;
  }

  // Clamp to valid range
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, result));
}

export function usePdfRenderer(options: UsePdfRendererOptions = {}): UsePdfRendererReturn {
  const { containerRef, onPageChange, onDocumentLoad, onError } = options;

  // State
  const document = ref<PdfDocument | null>(null);
  const currentPage = ref(1);
  const zoom = ref<ZoomConfig>({ ...DEFAULT_ZOOM });
  const isLoading = ref(false);
  const isRendering = ref(false);
  const error = ref<string | null>(null);
  const pageInfo = ref<PdfPage | null>(null);

  // Internal state (not reactive to avoid overhead)
  const pdfDocRef = shallowRef<PDFDocumentProxy | null>(null);
  const currentRenderTask = shallowRef<PdfjsRenderTask | null>(null);
  const currentTextLayer = shallowRef<TextLayer | null>(null);

  // Computed
  const totalPages = computed(() => document.value?.numPages ?? 0);

  const scale = computed(() => {
    if (!pageInfo.value) return 1.0;

    const container = containerRef?.value;
    const containerWidth = container?.clientWidth ?? 800;
    const containerHeight = container?.clientHeight ?? 600;

    return calculateScale(
      zoom.value,
      pageInfo.value.width,
      pageInfo.value.height,
      containerWidth,
      containerHeight
    );
  });

  // Watch for page changes
  watch(currentPage, (newPage) => {
    onPageChange?.(newPage);
  });

  /**
   * Load a PDF document from File or URL
   */
  async function loadDocument(
    source: File | string,
    loadOptions: LoadPdfOptions = {}
  ): Promise<void> {
    // Clear any existing document
    unloadDocument();

    isLoading.value = true;
    error.value = null;

    try {
      // Generate document ID
      const docId = await generateDocumentId(source);

      // Prepare loading source
      let loadingSource: string | Uint8Array;

      if (source instanceof File) {
        const arrayBuffer = await source.arrayBuffer();
        loadingSource = new Uint8Array(arrayBuffer);
      } else {
        loadingSource = source;
      }

      // Load the PDF
      const pdfjsLib = await getPdfjsLib();
      const loadingTask = pdfjsLib.getDocument({
        data: loadingSource instanceof Uint8Array ? loadingSource : undefined,
        url: typeof loadingSource === 'string' ? loadingSource : undefined,
        password: loadOptions.password,
        // Use standard fonts
        useSystemFonts: true,
      });

      const pdfDoc = await loadingTask.promise;
      pdfDocRef.value = pdfDoc;

      // Extract metadata
      const docMetadata = await extractMetadata(pdfDoc, source, docId);
      document.value = docMetadata;

      // Set initial page
      const initialPage = loadOptions.initialPage ?? 1;
      currentPage.value = Math.max(1, Math.min(initialPage, docMetadata.numPages));

      // Set initial zoom
      if (loadOptions.initialZoom) {
        zoom.value = { ...loadOptions.initialZoom };
      }

      // Load first page info
      await updatePageInfo(currentPage.value);

      onDocumentLoad?.(docMetadata);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load PDF';
      error.value = message;
      onError?.(message);
      logError('pdf', 'renderer:load', err as Error);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Unload the current document
   */
  function unloadDocument(): void {
    // Cancel any pending render
    if (currentRenderTask.value) {
      currentRenderTask.value.cancel();
      currentRenderTask.value = null;
    }

    // Cancel any pending text layer render
    if (currentTextLayer.value) {
      currentTextLayer.value.cancel();
      currentTextLayer.value = null;
    }

    // Destroy PDF document
    if (pdfDocRef.value) {
      pdfDocRef.value.destroy();
      pdfDocRef.value = null;
    }

    // Reset state
    document.value = null;
    currentPage.value = 1;
    pageInfo.value = null;
    error.value = null;
  }

  /**
   * Update page info for current page
   */
  async function updatePageInfo(pageNumber: number): Promise<void> {
    const pdfDoc = pdfDocRef.value;
    if (!pdfDoc) return;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.0 });

      pageInfo.value = {
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      };
    } catch (err) {
      logError('pdf', 'renderer:getPageInfo', err as Error);
    }
  }

  /**
   * Render a page to canvas
   */
  async function renderPage(renderOptions: RenderPageOptions): Promise<void> {
    const pdfDoc = pdfDocRef.value;
    if (!pdfDoc) {
      throw new Error('No document loaded');
    }

    // Cancel any existing render task
    if (currentRenderTask.value) {
      currentRenderTask.value.cancel();
      currentRenderTask.value = null;
    }

    isRendering.value = true;

    try {
      const page = await pdfDoc.getPage(currentPage.value);
      const renderScale = renderOptions.scale ?? scale.value;
      const devicePixelRatio = renderOptions.devicePixelRatio ?? window.devicePixelRatio ?? 1;

      // Calculate viewport
      const viewport = page.getViewport({ scale: renderScale * devicePixelRatio });
      const cssViewport = page.getViewport({ scale: renderScale });

      // Setup canvas
      const canvas = renderOptions.canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Set canvas size (account for device pixel ratio)
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;

      // Render the page - pdfjs-dist v4+ requires canvas property
      const renderTask = page.render({
        canvas: canvas,
        canvasContext: ctx,
        viewport,
      } as Parameters<typeof page.render>[0]);

      currentRenderTask.value = renderTask;

      await renderTask.promise;

      // Render text layer if container provided
      if (renderOptions.textLayerContainer) {
        await renderTextLayer(page, cssViewport, renderOptions.textLayerContainer);
      }

      currentRenderTask.value = null;
    } catch (err) {
      // Ignore cancellation errors
      if (err instanceof Error && err.name === 'RenderingCancelledException') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to render page';
      error.value = message;
      onError?.(message);
      logError('pdf', 'renderer:render', err as Error);
    } finally {
      isRendering.value = false;
    }
  }

  /**
   * Render text layer for selection using PDF.js built-in TextLayer
   */
  async function renderTextLayer(
    page: PDFPageProxy,
    viewport: { width: number; height: number; scale: number },
    container: HTMLDivElement
  ): Promise<void> {
    // Cancel any existing text layer render
    if (currentTextLayer.value) {
      currentTextLayer.value.cancel();
      currentTextLayer.value = null;
    }

    // Clear existing content
    container.innerHTML = '';

    // Set container size to match canvas exactly
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    try {
      // Get text content from the page
      const textContent = await page.getTextContent();

      // Get the full viewport for the TextLayer
      const fullViewport = page.getViewport({ scale: viewport.scale });

      // Create the PDF.js TextLayer - this handles all the complex
      // positioning, font metrics, and text selection properly
      const pdfjsLib = await getPdfjsLib();
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: container,
        viewport: fullViewport,
      });

      currentTextLayer.value = textLayer;

      // Render the text layer
      await textLayer.render();
    } catch (err) {
      // Ignore cancellation errors
      if (err instanceof Error && err.message.includes('TextLayer task cancelled')) {
        return;
      }
      logError('pdf', 'renderer:textLayer', err as Error);
    }
  }

  /**
   * Navigate to a specific page
   */
  function goToPage(page: number): void {
    if (!document.value) return;

    const newPage = Math.max(1, Math.min(page, document.value.numPages));
    if (newPage !== currentPage.value) {
      currentPage.value = newPage;
      updatePageInfo(newPage);
    }
  }

  /**
   * Go to next page
   */
  function nextPage(): void {
    goToPage(currentPage.value + 1);
  }

  /**
   * Go to previous page
   */
  function prevPage(): void {
    goToPage(currentPage.value - 1);
  }

  /**
   * Set zoom configuration
   */
  function setZoom(config: ZoomConfig): void {
    zoom.value = {
      ...config,
      percentage: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, config.percentage)),
    };
  }

  /**
   * Set zoom mode
   */
  function setZoomMode(mode: ZoomMode): void {
    zoom.value = { ...zoom.value, mode };
  }

  /**
   * Set zoom percentage
   */
  function setZoomPercentage(percentage: number): void {
    zoom.value = {
      mode: 'percentage',
      percentage: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, percentage)),
    };
  }

  /**
   * Zoom in
   */
  function zoomIn(): void {
    const currentScale = scale.value;
    const nextPreset = ZOOM_PRESETS.find((p) => p > currentScale + 0.01);
    setZoomPercentage(nextPreset ?? Math.min(ZOOM_MAX, currentScale + ZOOM_STEP));
  }

  /**
   * Zoom out
   */
  function zoomOut(): void {
    const currentScale = scale.value;
    const nextPreset = [...ZOOM_PRESETS].reverse().find((p) => p < currentScale - 0.01);
    setZoomPercentage(nextPreset ?? Math.max(ZOOM_MIN, currentScale - ZOOM_STEP));
  }

  /**
   * Get text content of a specific page
   */
  async function getPageText(pageNumber: number): Promise<string> {
    const pdfDoc = pdfDocRef.value;
    if (!pdfDoc) {
      throw new Error('No document loaded');
    }

    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems = textContent.items as PdfTextItem[];

    return textItems
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Render a thumbnail for a page
   */
  async function renderThumbnail(
    pageNumber: number,
    thumbOptions: ThumbnailOptions
  ): Promise<HTMLCanvasElement> {
    const pdfDoc = pdfDocRef.value;
    if (!pdfDoc) {
      throw new Error('No document loaded');
    }

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });

    // Calculate thumbnail scale
    const widthScale = thumbOptions.maxWidth / viewport.width;
    const heightScale = thumbOptions.maxHeight / viewport.height;
    const thumbScale = Math.min(widthScale, heightScale);

    const thumbViewport = page.getViewport({ scale: thumbScale });

    // Create canvas
    const canvas = window.document.createElement('canvas');
    canvas.width = thumbViewport.width;
    canvas.height = thumbViewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Render - pdfjs-dist v4+ requires canvas property
    await page.render({
      canvas: canvas,
      canvasContext: ctx,
      viewport: thumbViewport,
    } as Parameters<typeof page.render>[0]).promise;

    return canvas;
  }

  /**
   * Cleanup resources
   */
  function destroy(): void {
    unloadDocument();
  }

  // Cleanup on unmount
  onBeforeUnmount(() => {
    destroy();
  });

  return {
    // State
    document,
    currentPage,
    totalPages,
    zoom,
    scale,
    isLoading,
    isRendering,
    error,
    pageInfo,

    // Methods
    loadDocument,
    unloadDocument,
    renderPage,
    goToPage,
    nextPage,
    prevPage,
    setZoom,
    setZoomMode,
    setZoomPercentage,
    zoomIn,
    zoomOut,
    getPageText,
    renderThumbnail,
    destroy,
  };
}

export default usePdfRenderer;
