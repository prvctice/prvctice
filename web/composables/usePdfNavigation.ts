/**
 * PDF Navigation Composable
 *
 * Provides thumbnail generation, caching, and preloading for PDF navigation.
 * Features:
 * - Thumbnail generation with caching
 * - Lazy loading of thumbnails as they scroll into view
 * - Preloading adjacent pages for smoother navigation
 * - Integration with usePdfRenderer
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { ThumbnailOptions } from '@web/types/pdf';
import { logError } from '@web/utils/debugLog.js';

/** Thumbnail data structure */
export interface PdfThumbnail {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Data URL for the thumbnail image */
  dataUrl: string | null;
  /** Whether thumbnail is currently loading */
  isLoading: boolean;
  /** Whether thumbnail has been generated */
  isLoaded: boolean;
  /** Error message if generation failed */
  error: string | null;
}

/** Options for usePdfNavigation */
export interface UsePdfNavigationOptions {
  /** Reference to current page from usePdfRenderer */
  currentPage: Ref<number>;
  /** Reference to total pages from usePdfRenderer */
  totalPages: ComputedRef<number> | Ref<number>;
  /** Function to render a thumbnail (from usePdfRenderer) */
  renderThumbnail: (pageNumber: number, options: ThumbnailOptions) => Promise<HTMLCanvasElement>;
  /** Thumbnail dimensions */
  thumbnailSize?: {
    maxWidth: number;
    maxHeight: number;
  };
  /** Number of adjacent pages to preload */
  preloadRadius?: number;
  /** Callback when navigation occurs */
  onNavigate?: (page: number) => void;
}

/** Return type for usePdfNavigation */
export interface UsePdfNavigationReturn {
  // State
  thumbnails: Ref<PdfThumbnail[]>;
  sidebarOpen: Ref<boolean>;
  isGenerating: Ref<boolean>;

  // Computed
  hasThumbnails: ComputedRef<boolean>;
  loadedCount: ComputedRef<number>;

  // Methods
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  generateThumbnail: (pageNumber: number) => Promise<void>;
  generateAllThumbnails: () => Promise<void>;
  getThumbnail: (pageNumber: number) => PdfThumbnail | null;
  preloadAdjacentPages: (currentPage: number) => Promise<void>;
  clearThumbnails: () => void;
  navigateToPage: (page: number) => void;

  // Intersection observer for lazy loading
  observeThumbnail: (element: HTMLElement, pageNumber: number) => void;
  unobserveThumbnail: (element: HTMLElement) => void;
  cleanupObserver: () => void;
}

/** Default thumbnail dimensions */
const DEFAULT_THUMBNAIL_SIZE = {
  maxWidth: 120,
  maxHeight: 160,
};

/** Default preload radius (pages before and after current) */
const DEFAULT_PRELOAD_RADIUS = 2;

export function usePdfNavigation(options: UsePdfNavigationOptions): UsePdfNavigationReturn {
  const {
    currentPage,
    totalPages,
    renderThumbnail,
    thumbnailSize = DEFAULT_THUMBNAIL_SIZE,
    preloadRadius = DEFAULT_PRELOAD_RADIUS,
    onNavigate,
  } = options;

  // State
  const thumbnails = ref<PdfThumbnail[]>([]);
  const sidebarOpen = ref(false);
  const isGenerating = ref(false);

  // Intersection observer for lazy loading
  let observer: IntersectionObserver | null = null;
  const observedElements = new Map<HTMLElement, number>();

  // Computed
  const hasThumbnails = computed(() => thumbnails.value.some((t) => t.isLoaded));
  const loadedCount = computed(() => thumbnails.value.filter((t) => t.isLoaded).length);

  /**
   * Initialize thumbnails array for a document
   */
  function initThumbnails(pageCount: number): void {
    thumbnails.value = Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      dataUrl: null,
      isLoading: false,
      isLoaded: false,
      error: null,
    }));
  }

  /**
   * Clear all thumbnails
   */
  function clearThumbnails(): void {
    thumbnails.value = [];
  }

  /**
   * Toggle sidebar visibility
   */
  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value;
  }

  /**
   * Open sidebar
   */
  function openSidebar(): void {
    sidebarOpen.value = true;
  }

  /**
   * Close sidebar
   */
  function closeSidebar(): void {
    sidebarOpen.value = false;
  }

  /**
   * Generate a single thumbnail
   */
  async function generateThumbnail(pageNumber: number): Promise<void> {
    const index = pageNumber - 1;
    if (index < 0 || index >= thumbnails.value.length) return;

    const thumbnail = thumbnails.value[index];
    if (!thumbnail || thumbnail.isLoading || thumbnail.isLoaded) return;

    // Mark as loading (immutable update)
    thumbnails.value = thumbnails.value.map((t, i) =>
      i === index ? { ...t, isLoading: true, error: null } : t
    );

    try {
      const canvas = await renderThumbnail(pageNumber, thumbnailSize);
      const dataUrl = canvas.toDataURL('image/png');

      // Mark as loaded (immutable update)
      thumbnails.value = thumbnails.value.map((t, i) =>
        i === index ? { ...t, dataUrl, isLoading: false, isLoaded: true } : t
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate thumbnail';
      logError('pdf', `thumbnail:page${pageNumber}`, err as Error);

      // Mark as failed (immutable update)
      thumbnails.value = thumbnails.value.map((t, i) =>
        i === index ? { ...t, isLoading: false, error: errorMessage } : t
      );
    }
  }

  /**
   * Generate all thumbnails (batch operation)
   */
  async function generateAllThumbnails(): Promise<void> {
    if (thumbnails.value.length === 0) return;
    if (isGenerating.value) return;

    isGenerating.value = true;

    try {
      // Generate thumbnails sequentially to avoid overwhelming the browser
      for (let i = 0; i < thumbnails.value.length; i++) {
        const thumb = thumbnails.value[i];
        if (thumb && !thumb.isLoaded && !thumb.isLoading) {
          await generateThumbnail(thumb.pageNumber);
          // Small delay to keep UI responsive
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * Get a thumbnail by page number
   */
  function getThumbnail(pageNumber: number): PdfThumbnail | null {
    const index = pageNumber - 1;
    if (index < 0 || index >= thumbnails.value.length) return null;
    return thumbnails.value[index] ?? null;
  }

  /**
   * Preload adjacent pages around the current page
   */
  async function preloadAdjacentPages(page: number): Promise<void> {
    const start = Math.max(1, page - preloadRadius);
    const end = Math.min(totalPages.value, page + preloadRadius);

    const pagesToLoad: number[] = [];

    // Prioritize: current page, then forward, then backward
    if (!getThumbnail(page)?.isLoaded) {
      pagesToLoad.push(page);
    }

    for (let i = 1; i <= preloadRadius; i++) {
      if (page + i <= end && !getThumbnail(page + i)?.isLoaded) {
        pagesToLoad.push(page + i);
      }
      if (page - i >= start && !getThumbnail(page - i)?.isLoaded) {
        pagesToLoad.push(page - i);
      }
    }

    // Generate in order of priority
    for (const pageNum of pagesToLoad) {
      await generateThumbnail(pageNum);
    }
  }

  /**
   * Navigate to a specific page
   */
  function navigateToPage(page: number): void {
    const validPage = Math.max(1, Math.min(page, totalPages.value));
    onNavigate?.(validPage);
  }

  /**
   * Setup intersection observer for lazy loading
   */
  function setupObserver(): void {
    if (observer) return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNumber = observedElements.get(entry.target as HTMLElement);
            if (pageNumber) {
              generateThumbnail(pageNumber);
            }
          }
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );
  }

  /**
   * Observe a thumbnail element for lazy loading
   */
  function observeThumbnail(element: HTMLElement, pageNumber: number): void {
    if (!observer) {
      setupObserver();
    }
    observedElements.set(element, pageNumber);
    observer?.observe(element);
  }

  /**
   * Stop observing a thumbnail element
   */
  function unobserveThumbnail(element: HTMLElement): void {
    observer?.unobserve(element);
    observedElements.delete(element);
  }

  /**
   * Cleanup observer
   */
  function cleanupObserver(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observedElements.clear();
  }

  // Watch totalPages to initialize thumbnails array
  watch(
    totalPages,
    (newTotal, oldTotal) => {
      if (newTotal > 0 && newTotal !== oldTotal) {
        initThumbnails(newTotal);
      } else if (newTotal === 0) {
        clearThumbnails();
      }
    },
    { immediate: true }
  );

  // Preload adjacent pages when current page changes
  watch(currentPage, (newPage) => {
    if (sidebarOpen.value && thumbnails.value.length > 0) {
      preloadAdjacentPages(newPage);
    }
  });

  // When sidebar opens, start preloading from current page
  watch(sidebarOpen, (isOpen) => {
    if (isOpen && thumbnails.value.length > 0) {
      preloadAdjacentPages(currentPage.value);
    }
  });

  return {
    // State
    thumbnails,
    sidebarOpen,
    isGenerating,

    // Computed
    hasThumbnails,
    loadedCount,

    // Methods
    toggleSidebar,
    openSidebar,
    closeSidebar,
    generateThumbnail,
    generateAllThumbnails,
    getThumbnail,
    preloadAdjacentPages,
    clearThumbnails,
    navigateToPage,

    // Observer methods
    observeThumbnail,
    unobserveThumbnail,
    cleanupObserver,
  };
}

export default usePdfNavigation;
