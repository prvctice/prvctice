// web/composables/useDotmatrixSync.ts
// Dotmatrix animation coordination for ChatWindow
//
// Extracted from ChatWindow.vue to achieve single-responsibility principle.
// This composable handles:
// - Tracking dotmatrix animation state (active/inactive)
// - Detecting when dotmatrix finishes initial animation
// - Polling for state changes (dotmatrix doesn't emit stop events)
// - Fallback timeout when dotmatrix never initializes

import { ref, onMounted, onUnmounted, type Ref } from 'vue';

// Uses global DotMatrixMotion interface from web/types/global.d.ts

interface DotmatrixSyncOptions {
  /** Polling interval in ms (default: 200) */
  pollInterval?: number;
  /** Fallback timeout in ms if dotmatrix never initializes (default: 3000) */
  fallbackTimeout?: number;
}

interface DotmatrixSyncReturn {
  /** Whether dotmatrix is currently active or starting */
  isDotmatrixActive: Ref<boolean>;
  /** Whether dotmatrix system has initialized */
  dotmatrixInitialized: Ref<boolean>;
  /** Whether initial load is complete (for empty state display) */
  initialLoadComplete: Ref<boolean>;
}

/**
 * Check if dotmatrix is running or starting (non-reactive check from window)
 */
function checkDotmatrixActive(): boolean {
  if (!window.dotMatrixMotion) return false;
  const motion = window.dotMatrixMotion;
  const isActive = typeof motion.isActive === 'function' && motion.isActive();
  const isStarting = typeof motion.isStarting === 'function' && motion.isStarting();
  return isActive || isStarting;
}

/**
 * Check if dotmatrix is disabled
 */
function isDotmatrixDisabled(): boolean {
  return window.__disableDotmatrix === true;
}

/**
 * Composable for coordinating with dotmatrix animation state.
 *
 * On initial load, hides empty state until dotmatrix finishes initial animation.
 * This prevents the jarring flash of "Start a conversation" during app load.
 *
 * @param options - Configuration options
 */
export function useDotmatrixSync(options: DotmatrixSyncOptions = {}): DotmatrixSyncReturn {
  const { pollInterval = 200, fallbackTimeout = 3000 } = options;

  // Track dotmatrix active state reactively
  const isDotmatrixActive = ref(false);
  // Track if dotmatrix system has initialized
  const dotmatrixInitialized = ref(false);
  // On initial load, hide empty state until dotmatrix finishes initial animation
  const initialLoadComplete = ref(false);

  // Polling interval handle
  let dotmatrixPollInterval: ReturnType<typeof setInterval> | null = null;
  // Fallback timeout handle
  let fallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Handler for dotmatrix ready event - marks initialization complete
   */
  function onDotmatrixReady(): void {
    dotmatrixInitialized.value = true;
    isDotmatrixActive.value = checkDotmatrixActive();
  }

  /**
   * Handler for dotmatrix state changes - check if animation finished
   */
  function onDotmatrixStateChange(): void {
    const wasActive = isDotmatrixActive.value;
    isDotmatrixActive.value = checkDotmatrixActive();

    // Once dotmatrix has been active and then becomes inactive, show empty state
    if (dotmatrixInitialized.value && wasActive && !isDotmatrixActive.value) {
      initialLoadComplete.value = true;
    }
  }

  onMounted(() => {
    // If dotmatrix is disabled, show empty state immediately
    if (isDotmatrixDisabled()) {
      initialLoadComplete.value = true;
    }

    // Check initial dotmatrix state
    isDotmatrixActive.value = checkDotmatrixActive();
    if (window.dotMatrixMotion) {
      dotmatrixInitialized.value = true;
    }

    // Poll for dotmatrix state changes (still needed since dotmatrix doesn't emit stop events)
    // But now with smarter logic that waits for init + active->inactive transition
    dotmatrixPollInterval = setInterval(() => {
      onDotmatrixStateChange();
    }, pollInterval);

    // Fallback: if dotmatrix never initializes after timeout, show empty state
    fallbackTimeoutId = setTimeout(() => {
      if (!initialLoadComplete.value) {
        initialLoadComplete.value = true;
      }
    }, fallbackTimeout);

    // Listen for dotmatrix ready event
    window.addEventListener('dotmatrixReady', onDotmatrixReady);
  });

  onUnmounted(() => {
    if (dotmatrixPollInterval) {
      clearInterval(dotmatrixPollInterval);
      dotmatrixPollInterval = null;
    }
    if (fallbackTimeoutId) {
      clearTimeout(fallbackTimeoutId);
      fallbackTimeoutId = null;
    }
    window.removeEventListener('dotmatrixReady', onDotmatrixReady);
  });

  return {
    isDotmatrixActive,
    dotmatrixInitialized,
    initialLoadComplete,
  };
}

export default useDotmatrixSync;
