import { ref, onMounted, onUnmounted, type Ref } from 'vue';

/**
 * Handle interface for Virtua VList component.
 * Matches the VirtualizerHandle interface from virtua/vue.
 */
export interface VListHandle {
  readonly scrollOffset: number;
  readonly scrollSize: number;
  readonly viewportSize: number;
  scrollToIndex(
    index: number,
    opts?: { align?: 'start' | 'center' | 'end'; smooth?: boolean }
  ): void;
  scrollTo(offset: number): void;
  scrollBy(offset: number): void;
  getItemOffset(index: number): number;
  getItemSize(index: number): number;
  findItemIndex(offset: number): number;
}

/**
 * Chat-specific scroll behavior composable for Virtua VList.
 *
 * Handles:
 * - Auto-scroll during streaming (pause if user scrolls up)
 * - Sticky-to-bottom behavior with Intersection Observer
 * - Programmatic scroll tracking (prevents scroll events from breaking sticky state)
 * - Reduced motion preference
 */
export function useStickToBottom(
  scrollerRef: Ref<VListHandle | null>,
  contentLength: Ref<number>,
  sentinelRef?: Ref<HTMLElement | null>
) {
  const isSticky = ref(true);
  const prefersReducedMotion = ref(false);
  let rafId: number | null = null;
  let observer: IntersectionObserver | null = null;
  let isProgrammaticScroll = false;

  onMounted(() => {
    prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Set up Intersection Observer if sentinel provided
    if (sentinelRef?.value) {
      setupIntersectionObserver();
    }
  });

  /**
   * Set up Intersection Observer for more reliable bottom detection.
   * The sentinel element at the bottom of the list is observed.
   */
  function setupIntersectionObserver(): void {
    if (!sentinelRef?.value) return;

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Only update sticky state from IO if not programmatic scroll
        if (!isProgrammaticScroll) {
          isSticky.value = entry.isIntersecting;
        }
      },
      {
        root: null, // viewport
        threshold: 0, // Any visibility counts
        rootMargin: '100px 0px 0px 0px', // Detect 100px before bottom
      }
    );
    observer.observe(sentinelRef.value);
  }

  /**
   * Scroll to the last item immediately.
   * Only scrolls if sticky mode is active.
   */
  function scrollToBottom(): void {
    const scroller = scrollerRef.value;
    if (!scroller || !isSticky.value) return;

    isProgrammaticScroll = true;
    scroller.scrollToIndex(contentLength.value - 1, {
      align: 'end',
      smooth: !prefersReducedMotion.value,
    });

    // Reset flag after scroll animation likely complete
    setTimeout(
      () => {
        isProgrammaticScroll = false;
      },
      prefersReducedMotion.value ? 0 : 300
    );
  }

  /**
   * Debounced scroll-to-bottom via requestAnimationFrame.
   * Use this for streaming updates to batch per-frame, not per-token.
   */
  function scrollToBottomDebounced(): void {
    if (rafId) return; // Already scheduled
    rafId = requestAnimationFrame(() => {
      rafId = null;
      scrollToBottom();
    });
  }

  /**
   * Force scroll to bottom from user action (e.g., button click).
   * Enables sticky mode and scrolls regardless of current position.
   */
  function forceScrollToBottom(): void {
    const scroller = scrollerRef.value;
    if (!scroller) return;

    isSticky.value = true;
    isProgrammaticScroll = true;
    scroller.scrollToIndex(contentLength.value - 1, {
      align: 'end',
      smooth: !prefersReducedMotion.value,
    });

    // Reset flag after scroll animation likely complete
    setTimeout(
      () => {
        isProgrammaticScroll = false;
      },
      prefersReducedMotion.value ? 0 : 300
    );
  }

  /**
   * Check if the scroll position is near the bottom.
   * Used as fallback when Intersection Observer is not available.
   */
  function checkIfAtBottom(): boolean {
    const scroller = scrollerRef.value;
    if (!scroller) return true;

    const threshold = 100; // pixels from bottom
    return scroller.scrollSize - scroller.scrollOffset - scroller.viewportSize < threshold;
  }

  /**
   * Handle scroll events from VList.
   * Updates sticky state based on scroll position.
   * Skips if scroll was triggered programmatically.
   */
  function onScroll(): void {
    // Skip if this is a programmatic scroll
    if (isProgrammaticScroll) return;

    // Fall back to scroll offset check if IO not available
    if (!observer) {
      isSticky.value = checkIfAtBottom();
    }
    // If IO is active, it handles sticky state via intersection callbacks
  }

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
    observer?.disconnect();
  });

  return {
    isSticky,
    scrollToBottom,
    scrollToBottomDebounced,
    forceScrollToBottom,
    onScroll,
  };
}
