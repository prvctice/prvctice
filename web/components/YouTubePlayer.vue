<template>
  <teleport to="body">
    <div v-if="shouldRender" class="yt-root">
      <transition name="yt-backdrop">
        <div
          v-if="visible && !minimized"
          class="yt-backdrop"
          data-gesture-ignore="global-doubletap"
          @click="onOverlayClick"
        ></div>
      </transition>

      <div
        v-if="visible"
        ref="card"
        :class="['yt-card', { minimized, dragging: isDragging, 'magnet-attached': isAttached }]"
        :style="cardStyle"
        data-gesture-ignore="global-doubletap"
        @pointerdown="onDragStart"
      >
        <div :class="['yt-card-header', { minimized }]">
          <div class="yt-card-title-wrap">
            <span v-if="!minimized" class="yt-card-title">Now Playing</span>
          </div>
          <div class="yt-card-controls">
            <button v-if="!minimized" class="yt-btn" title="Minimize" @click.stop="onMinimizeClick">
              –
            </button>
            <button v-else class="yt-btn" title="Expand" @click.stop="onExpandClick">⟲</button>
            <button class="yt-btn" title="Close" @click.stop="onCloseClick">×</button>
          </div>
        </div>
        <div class="yt-frame">
          <iframe
            v-if="videoSrc"
            ref="iframeRef"
            :src="videoSrc"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useYouTubePlayer } from '@web/composables/useYouTubePlayer.js';
import { useMagneticAttachment } from '@web/composables/useMagneticAttachment';

const { visible, minimized, videoId, dragging, top, left, minimize, expand, close } =
  useYouTubePlayer();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const card = ref<HTMLElement | null>(null);
const shouldRender = ref(false);
const hideTimer: { id: number | null } = { id: null };

// Simple drag state
const isDragging = ref(false);

let dragOffsetX = 0;
let dragOffsetY = 0;
let activePointerId: number | null = null;

// Current position during drag
const dragPosX = ref(0);
const dragPosY = ref(0);

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Card dimensions
function getCardDimensions(): { width: number; height: number; headerHeight: number } {
  const win = typeof window !== 'undefined' ? window : null;
  const vw = win ? win.innerWidth : 1280;
  const isMin = minimized.value;
  const width = isMin
    ? clamp(Math.round(vw * 0.32), 220, 360)
    : clamp(Math.round(vw * 0.72), 560, 960);
  const frameHeight = Math.round((width * 9) / 16);
  const headerHeight = isMin ? 28 : 36;
  const cardHeight = frameHeight + headerHeight;
  return { width, height: cardHeight, headerHeight };
}

// ==================== MAGNETIC ATTACHMENT (RAF-based) ====================

const {
  isAttached,
  attachedEdge,
  startMonitoring: startMagneticMonitoring,
  stopMonitoring: stopMagneticMonitoring,
  checkMagneticSnap,
  checkDetach,
  attach: magneticAttach,
  detach: magneticDetach,
} = useMagneticAttachment({
  targetSelector: '#bar',
  getWidgetHeight: () => getCardDimensions().height,
  onPositionUpdate: (newTop: number) => {
    // Update position when magnetic system enforces snap
    dragPosY.value = newTop;
    top.value = newTop;
  },
});

// ==================== DRAG HANDLERS ====================

function onDragStart(e: PointerEvent): void {
  if (!minimized.value) return;
  if ((e.target as HTMLElement).tagName === 'BUTTON') return;

  const el = card.value;
  if (!el) return;

  isDragging.value = true;
  dragging.value = true;
  activePointerId = e.pointerId;

  const rect = el.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  dragPosX.value = rect.left;
  dragPosY.value = rect.top;

  el.setPointerCapture(e.pointerId);
  disableIframePointerEvents(true);

  el.addEventListener('pointermove', onDragMove);
  el.addEventListener('pointerup', onDragEnd);
  el.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e: PointerEvent): void {
  if (!isDragging.value || e.pointerId !== activePointerId) return;

  const { width, height: cardHeight } = getCardDimensions();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let newLeft = e.clientX - dragOffsetX;
  let newTop = e.clientY - dragOffsetY;

  // Clamp to viewport
  newLeft = clamp(newLeft, 12, vw - width - 12);
  newTop = clamp(newTop, 12, vh - cardHeight - 12);

  // Check magnetic snap using composable
  if (isAttached.value) {
    if (checkDetach(newTop)) {
      magneticDetach();
    } else {
      // When attached, only update horizontal — RAF loop handles vertical
      dragPosX.value = newLeft;
      return;
    }
  }

  const magnetic = checkMagneticSnap(newTop);
  newTop = magnetic.snapY;
  if (magnetic.snapped && magnetic.edge) {
    magneticAttach(magnetic.edge);
  }

  dragPosX.value = newLeft;
  dragPosY.value = newTop;
}

function onDragEnd(e: PointerEvent): void {
  if (e.pointerId !== activePointerId) return;

  const el = card.value;
  if (el) {
    el.releasePointerCapture(e.pointerId);
    el.removeEventListener('pointermove', onDragMove);
    el.removeEventListener('pointerup', onDragEnd);
    el.removeEventListener('pointercancel', onDragEnd);
  }

  // Save final position
  left.value = dragPosX.value;
  top.value = dragPosY.value;

  isDragging.value = false;
  dragging.value = false;
  activePointerId = null;
  disableIframePointerEvents(false);
}

function disableIframePointerEvents(disable: boolean): void {
  if (iframeRef.value) {
    iframeRef.value.style.pointerEvents = disable ? 'none' : '';
  }
}

// ==================== CARD STYLE ====================

const cardStyle = computed(() => {
  if (!visible.value) return {};

  const win = typeof window !== 'undefined' ? window : null;
  const vw = win ? win.innerWidth : 1280;
  const vh = win ? win.innerHeight : 720;
  const { width, height: cardHeight } = getCardDimensions();

  if (minimized.value) {
    // Use drag position if dragging, otherwise use stored position
    if (isDragging.value) {
      return {
        width: `${width}px`,
        height: `${cardHeight}px`,
        top: `${clamp(dragPosY.value, 12, Math.max(12, vh - cardHeight - 12))}px`,
        left: `${clamp(dragPosX.value, 12, Math.max(12, vw - width - 12))}px`,
      };
    }

    const defaultTop =
      top.value ?? clamp(vh - cardHeight - 32, 48, Math.max(48, vh - cardHeight - 24));
    const defaultLeft = left.value ?? clamp(vw - width - 28, 16, Math.max(16, vw - width - 16));

    return {
      width: `${width}px`,
      height: `${cardHeight}px`,
      top: `${clamp(defaultTop, 12, Math.max(12, vh - cardHeight - 12))}px`,
      left: `${clamp(defaultLeft, 12, Math.max(12, vw - width - 12))}px`,
    };
  }

  // Centered when expanded
  const centerTop = clamp((vh - cardHeight) / 2, 32, Math.max(32, vh - cardHeight - 32));
  const centerLeft = clamp((vw - width) / 2, 16, Math.max(16, vw - width - 16));

  return {
    width: `${width}px`,
    height: `${cardHeight}px`,
    top: `${centerTop}px`,
    left: `${centerLeft}px`,
  };
});

// ==================== ACTIONS ====================

function onOverlayClick(): void {
  minimize();
}

function onMinimizeClick(): void {
  minimize();
}

function onExpandClick(): void {
  expand();
}

function onCloseClick(): void {
  close();
}

// ==================== LIFECYCLE ====================

watch(
  () => minimized.value,
  async (isMinimized) => {
    if (isMinimized) {
      await nextTick();
      // Start magnetic monitoring when minimized
      startMagneticMonitoring();
    } else {
      magneticDetach();
      stopMagneticMonitoring();
      dragging.value = false;
    }
  }
);

watch(
  () => visible.value,
  (val) => {
    if (val) {
      if (hideTimer.id) {
        clearTimeout(hideTimer.id);
        hideTimer.id = null;
      }
      shouldRender.value = true;
    } else {
      dragging.value = false;
      stopMagneticMonitoring();

      if (hideTimer.id) clearTimeout(hideTimer.id);
      hideTimer.id = window.setTimeout(() => {
        shouldRender.value = false;
        hideTimer.id = null;
      }, 260);
    }
  },
  { immediate: true }
);

const videoSrc = computed(() => {
  if (!videoId.value) return null;
  const params = new URLSearchParams({
    autoplay: '1',
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    enablejsapi: '1',
  });
  return `https://www.youtube.com/embed/${videoId.value}?${params.toString()}`;
});

onBeforeUnmount(() => {
  if (hideTimer.id) clearTimeout(hideTimer.id);
  stopMagneticMonitoring();
});
</script>

<style scoped>
.yt-root {
  position: fixed;
  inset: 0;
  z-index: 1100;
  pointer-events: none;
}

.yt-backdrop {
  position: absolute;
  inset: 0;
  background: var(--color-yt-backdrop);
  backdrop-filter: blur(24px) saturate(80%);
  -webkit-backdrop-filter: blur(24px) saturate(80%);
  opacity: 1;
  transition: opacity var(--duration-medium) var(--motion-ease-standard);
  pointer-events: auto;
}

.yt-backdrop-enter-from,
.yt-backdrop-leave-to {
  opacity: 0;
}

.yt-card {
  position: fixed;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-yt-card-border);
  background: var(--glass-surface-gradient);
  box-shadow: var(--glass-shadow-idle);
  overflow: hidden;
  pointer-events: auto;
  backdrop-filter: blur(20px) saturate(90%);
  -webkit-backdrop-filter: blur(20px) saturate(90%);
  transition:
    transform var(--duration-long) var(--motion-ease-hover),
    box-shadow var(--duration-medium) var(--motion-ease-standard),
    border-color var(--duration-medium) var(--motion-ease-standard),
    background var(--duration-medium) var(--motion-ease-standard);
  cursor: default;
  touch-action: none;
}

.yt-card.minimized {
  cursor: grab;
}

.yt-card.dragging {
  cursor: grabbing;
  box-shadow: var(--glass-shadow-active);
}

.yt-card.magnet-attached {
  border-color: var(
    --color-yt-card-border-attached,
    var(--color-accent-subtle, rgba(100, 200, 255, 0.3))
  );
}

.yt-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-5) var(--space-4);
  gap: var(--space-5);
  color: var(--color-yt-header-text);
  font-size: var(--font-size-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: transparent;
}

.yt-card-header.minimized {
  padding: var(--space-4) var(--space-5) var(--space-3);
}

.yt-card-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.yt-card-title {
  font-size: var(--font-size-xs);
  letter-spacing: 0.1em;
  color: var(--color-yt-title);
  font-weight: 400;
}

.yt-card-controls {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.yt-btn {
  background: transparent;
  border: none;
  color: var(--color-yt-btn);
  font-size: var(--font-size-sm);
  line-height: 1;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    color var(--duration-short) var(--motion-ease-standard),
    transform var(--duration-short) var(--motion-ease-standard);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 300;
}

.yt-card-header.minimized .yt-btn {
  width: 22px;
  height: 22px;
  font-size: var(--font-size-sm);
}

.yt-btn:hover {
  color: var(--color-yt-btn-hover);
}

.yt-btn:active {
  transform: scale(0.94);
}

.yt-frame {
  position: relative;
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0 var(--space-5) var(--space-5);
  box-sizing: border-box;
}

.yt-card.minimized .yt-frame {
  padding: 0 var(--space-4) var(--space-4);
}

.yt-frame iframe {
  position: relative;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-yt-frame-bg);
  box-shadow: none;
  transition: border-radius var(--duration-medium) var(--motion-ease-standard);
}

.yt-card.minimized .yt-frame iframe {
  border-radius: 3px;
}

@media (max-width: 680px) {
  .yt-card {
    border-radius: var(--radius-sm);
  }

  .yt-card-header {
    padding: var(--space-5) var(--space-5) var(--space-3);
  }

  .yt-frame {
    padding: 0 var(--space-4) var(--space-4);
  }
}
</style>
