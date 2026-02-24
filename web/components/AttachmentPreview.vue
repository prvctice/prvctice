<template>
  <Teleport to="body">
    <div
      v-for="(attachment, index) in visibleAttachments"
      :key="attachment.previewUrl || index"
      class="attachment-preview"
      role="group"
      :aria-label="`Attached image preview ${index + 1}`"
      :style="getPreviewStyle(index)"
      @mousedown="startDrag($event, index)"
      @touchstart.passive="startDrag($event, index)"
    >
      <img
        :src="attachment.previewUrl"
        :alt="`Attached image ${index + 1}`"
        aria-label="Attached image"
      />
      <button
        class="attachment-preview-close"
        title="Remove this image"
        aria-label="Remove this attached image"
        @click.stop="removeAttachment(index)"
      >
        &times;
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useFileAttachments, type AttachmentFile } from '@web/composables/useFileAttachments';

const { attachments, removeAttachment } = useFileAttachments();

// Only show image attachments with preview URLs
const visibleAttachments = computed(() => attachments.value.filter((a) => a.previewUrl));

// Drag state per preview
interface DragState {
  index: number;
  isDragging: boolean;
  isAttachedToBar: boolean;
  startX: number;
  startY: number;
  initialLeft: number;
  initialTop: number;
  currentLeft: number;
  currentTop: number;
}

const dragStates = ref<Map<number, DragState>>(new Map());
const magnetThreshold = ref(20);

// Load magnet threshold from settings
onMounted(() => {
  try {
    const win = window as Window & { AppSettings?: { magnetThreshold?: number } };
    if (typeof window !== 'undefined' && win.AppSettings?.magnetThreshold) {
      magnetThreshold.value = win.AppSettings.magnetThreshold;
    }
  } catch {
    // Use default
  }
});

function getPreviewStyle(index: number) {
  const state = dragStates.value.get(index);
  if (state && (state.currentLeft !== 0 || state.currentTop !== 0)) {
    return {
      position: 'fixed' as const,
      left: `${state.currentLeft}px`,
      top: `${state.currentTop}px`,
      bottom: 'auto',
      right: 'auto',
      cursor: state.isDragging ? 'grabbing' : 'move',
    };
  }

  // Default staggered position
  const offset = index;
  return {
    position: 'fixed' as const,
    bottom: `${100 + (offset % 3) * 10}px`,
    right: `${20 + offset * 170}px`,
    cursor: 'move',
  };
}

function getBarRect(): DOMRect | null {
  const bar = document.getElementById('bar');
  return bar ? bar.getBoundingClientRect() : null;
}

function startDrag(e: MouseEvent | TouchEvent, index: number) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();

  const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
  const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;

  const state: DragState = {
    index,
    isDragging: true,
    isAttachedToBar: false,
    startX: clientX,
    startY: clientY,
    initialLeft: rect.left,
    initialTop: rect.top,
    currentLeft: rect.left,
    currentTop: rect.top,
  };

  dragStates.value.set(index, state);

  // Add global listeners
  const onMove = (moveEvent: MouseEvent | TouchEvent) => {
    const currentState = dragStates.value.get(index);
    if (!currentState || !currentState.isDragging) return;

    const moveX = 'touches' in moveEvent ? (moveEvent.touches[0]?.clientX ?? 0) : moveEvent.clientX;
    const moveY = 'touches' in moveEvent ? (moveEvent.touches[0]?.clientY ?? 0) : moveEvent.clientY;

    const dx = moveX - currentState.startX;
    const dy = moveY - currentState.startY;

    currentState.currentLeft = currentState.initialLeft + dx;
    currentState.currentTop = currentState.initialTop + dy;

    dragStates.value.set(index, { ...currentState });
  };

  const onEnd = () => {
    const currentState = dragStates.value.get(index);
    if (currentState) {
      currentState.isDragging = false;

      // Check for magnetic snap to bar
      const barRect = getBarRect();
      if (barRect) {
        const previewEl = document.querySelector(
          `.attachment-preview:nth-of-type(${index + 1})`
        ) as HTMLElement;
        if (previewEl) {
          const previewRect = {
            top: currentState.currentTop,
            bottom: currentState.currentTop + 150, // Approximate height
            height: 150,
          };

          const distanceTop = previewRect.bottom - barRect.top;
          const distanceBottom = previewRect.top - barRect.bottom;

          if (
            Math.abs(distanceTop) < magnetThreshold.value ||
            Math.abs(distanceBottom) < magnetThreshold.value
          ) {
            currentState.isAttachedToBar = true;
            if (Math.abs(distanceTop) < Math.abs(distanceBottom)) {
              currentState.currentTop = barRect.top - previewRect.height;
            } else {
              currentState.currentTop = barRect.bottom;
            }
          }
        }
      }

      dragStates.value.set(index, { ...currentState });
    }

    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd);

  if ('touches' in e) {
    // Don't prevent default for passive touch
  } else {
    e.preventDefault();
  }
}

// Clean up drag states when attachments change
onBeforeUnmount(() => {
  dragStates.value.clear();
});
</script>

<style scoped>
.attachment-preview {
  position: fixed;
  width: 150px;
  z-index: 1000;
  background: #000;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-xl);
  box-sizing: border-box;
  cursor: move;
  user-select: none;
  touch-action: none;
}

.attachment-preview img {
  width: 100%;
  display: block;
  border-radius: var(--radius-xl);
  pointer-events: none;
}

.attachment-preview-close {
  position: absolute;
  top: 2px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 16px;
  line-height: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attachment-preview-close:hover {
  background: rgba(0, 0, 0, 0.8);
}

.attachment-preview-close:focus {
  outline: 2px solid var(--color-focus, #4da6ff);
  outline-offset: 2px;
}
</style>
