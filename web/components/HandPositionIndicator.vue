<template>
  <div
    v-if="isVisible"
    class="hand-position-indicator"
    :class="{
      'hand-present': handPresent,
      'can-grab': canGrab || intentActiveTarget,
      'is-grabbing': isGrabbing || intentIsDragging,
    }"
  >
    <div class="viewport-box" :style="boxStyle">
      <div class="hand-dot" :style="dotStyle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';

const { subscribe } = useIntentCoordinator();

const isVisible = ref(false);
const handPresent = ref(false);
const handX = ref(0.5);
const handY = ref(0.5);
const canGrab = ref(false);
const isGrabbing = ref(false);
const isPortrait = ref(false);
const intentActiveTarget = ref<string | null>(null);
const intentIsDragging = ref(false);

let intentUnsubscribe: (() => void) | null = null;

// Box dimensions for calculating dot bounds
// Landscape (16:9): 80x45, Portrait (9:16): 45x80
const DOT_SIZE = 8;
const boxWidth = computed(() => (isPortrait.value ? 45 : 80));
const boxHeight = computed(() => (isPortrait.value ? 80 : 45));

let animationFrameId: number | null = null;

const boxStyle = computed(() => ({
  width: `${boxWidth.value}px`,
  height: `${boxHeight.value}px`,
}));

const dotStyle = computed(() => {
  // Calculate position keeping dot fully inside bounds
  // Dot is centered on position, so we need to account for half its size
  const padding = DOT_SIZE / 2;
  const maxX = boxWidth.value - padding;
  const maxY = boxHeight.value - padding;

  // Map 0-1 range to padded pixel range
  const pixelX = padding + handX.value * (maxX - padding);
  const pixelY = padding + (1 - handY.value) * (maxY - padding);

  return {
    left: `${pixelX}px`,
    top: `${pixelY}px`,
  };
});

function updatePosition() {
  // Check orientation (portrait if height > width)
  isPortrait.value = window.innerHeight > window.innerWidth;

  // Check if hand tracking is enabled
  const trackingEnabled =
    typeof window.getDotMatrixHandTracking === 'function' && window.getDotMatrixHandTracking();

  isVisible.value = trackingEnabled;

  if (trackingEnabled && typeof window.getHandTrackingPosition === 'function') {
    const pos = window.getHandTrackingPosition();
    if (pos) {
      handPresent.value = pos.inZone;
      // Use raw camera position for accurate indicator display
      handX.value = Math.max(0, Math.min(1, pos.rawX ?? pos.x));
      handY.value = Math.max(0, Math.min(1, pos.rawY ?? pos.y));
      // Update grab state
      canGrab.value = !!pos.hoverTarget;
      isGrabbing.value = !!pos.isGrabbing;
    }
  } else {
    handPresent.value = false;
    canGrab.value = false;
    isGrabbing.value = false;
  }

  animationFrameId = requestAnimationFrame(updatePosition);
}

onMounted(() => {
  updatePosition();

  // Subscribe to IntentCoordinator state for coordinated feedback
  intentUnsubscribe = subscribe((state) => {
    intentActiveTarget.value = state.activeTarget;
    intentIsDragging.value = state.isDragging;
  });
});

onBeforeUnmount(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Unsubscribe from IntentCoordinator
  intentUnsubscribe?.();
  intentUnsubscribe = null;
});
</script>

<style scoped>
.hand-position-indicator {
  position: fixed;
  top: 16px;
  right: 56px;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.7;
  transition: opacity 0.3s ease;
}

.hand-position-indicator.hand-present {
  opacity: 1;
}

.viewport-box {
  /* Use explicit theme variable instead of currentcolor for consistent behavior */
  border: 2px solid var(--color-text, #000);
  border-radius: 4px;
  position: relative;
  background: transparent;
}

.hand-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  /* Use explicit theme variable instead of currentcolor */
  background: var(--color-text, #000);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease,
    box-shadow 0.15s ease;
  opacity: 0.5;
}

.hand-present .hand-dot {
  opacity: 1;
}

/* Use theme accent color when hovering over grabbable element */

.can-grab .hand-dot {
  background: var(--skill-power-color, #2880f0);
  box-shadow: 0 0 6px var(--skill-power-color, #2880f0);
}

/* Brighter when actively grabbing */

.is-grabbing .hand-dot {
  background: var(--skill-power-color, #2880f0);
  box-shadow: 0 0 10px var(--skill-power-color, #2880f0);
  transform: translate(-50%, -50%) scale(1.25);
}
</style>
