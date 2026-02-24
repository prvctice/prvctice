<template>
  <Teleport to="body">
    <div
      id="drop-overlay"
      class="drop-overlay"
      :class="{ 'drop-overlay--visible': isDragging }"
      :aria-hidden="!isDragging"
      :style="overlayStyle"
    >
      <div class="drop-overlay-aura"></div>
      <div class="drop-overlay-panel">
        <div class="drop-overlay-icon">
          <iconify-icon icon="ph:tray-arrow-up"></iconify-icon>
        </div>
        <div class="drop-overlay-headline">Drop to attach</div>
        <div class="drop-overlay-subhead">
          Images stick to the tray and travel with your prompt.
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useFileAttachments } from '@web/composables/useFileAttachments';
import { useWindowManager } from '@web/composables/useWindowManager';
import { BUILTIN_APPS } from '@web/services/apps/builtinApps';

const { isDragging, setDragging, handleDrop } = useFileAttachments();

// Track upload button position for aura effect
const targetX = ref('50%');
const targetY = ref('calc(100% - 120px)');

const overlayStyle = computed(() => ({
  '--drop-overlay-target-x': targetX.value,
  '--drop-overlay-target-y': targetY.value,
}));

function updateTargetPosition() {
  const btn = document.getElementById('upload-button');
  if (!btn) {
    targetX.value = '50%';
    targetY.value = 'calc(100% - 120px)';
    return;
  }
  const rect = btn.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  targetX.value = `${x}px`;
  targetY.value = `${y}px`;
}

function toggleUploadHighlight(active: boolean) {
  const btn = document.getElementById('upload-button');
  if (!btn) return;
  btn.classList.toggle('drag-drop-target', active);
}

function containsFiles(e: DragEvent): boolean {
  const dt = e.dataTransfer;
  if (!dt) return false;
  if (dt.types && Array.from(dt.types).includes('Files')) return true;
  if (dt.items) {
    return Array.from(dt.items).some((item) => item.kind === 'file');
  }
  return false;
}

/**
 * Open a PDF in the viewer, launching the viewer window if needed.
 * Polls for window.loadPdfFile to become available after mount.
 */
type WinWithPdf = Window & {
  loadPdfFile?: (f: File) => void;
  __pendingPdfFile?: File;
};

function openPdfInViewer(file: File): void {
  const win = window as WinWithPdf;
  const wm = useWindowManager();
  const viewerOpen = wm.windowList.value.some((w) => w.appId === 'pdf-viewer');

  if (viewerOpen && win.loadPdfFile) {
    // Viewer is mounted and ready — load directly
    win.loadPdfFile(file);
    return;
  }

  // Queue file for PdfContent to pick up on mount
  win.__pendingPdfFile = file;
  if (!viewerOpen) {
    const pdfDef = BUILTIN_APPS.find((d) => d.id === 'pdf-viewer');
    if (pdfDef) wm.openWindow(pdfDef);
  }
}

let dragCounter = 0;

function onDragEnter(e: DragEvent) {
  if (!containsFiles(e)) return;
  e.preventDefault();
  dragCounter++;
  setDragging(true);
  toggleUploadHighlight(true);
  updateTargetPosition();
}

function onDragOver(e: DragEvent) {
  if (!containsFiles(e)) return;
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
  updateTargetPosition();
}

function onDragLeave(e: DragEvent) {
  if (!containsFiles(e)) return;
  e.preventDefault();
  dragCounter = Math.max(dragCounter - 1, 0);
  if (dragCounter === 0) {
    setDragging(false);
    toggleUploadHighlight(false);
  }
}

async function onDrop(e: DragEvent) {
  if (!containsFiles(e)) return;
  e.preventDefault();
  dragCounter = 0;
  setDragging(false);
  toggleUploadHighlight(false);

  // Check if dropping a PDF file - open in viewer (which adds to library)
  const dt = e.dataTransfer;
  if (dt && dt.files && dt.files.length === 1) {
    const file = dt.files[0];
    if (file && file.type === 'application/pdf') {
      openPdfInViewer(file);
      return;
    }
  }

  await handleDrop(e);
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('resize', updateTargetPosition, { passive: true });
  window.addEventListener('scroll', updateTargetPosition, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onDrop);
  window.removeEventListener('resize', updateTargetPosition);
  window.removeEventListener('scroll', updateTargetPosition);
});
</script>

<style>
/* Note: Using global styles to match existing components.css.
   The base styles are already defined in public/styles/components.css.
   This component uses those styles via the class names. */
</style>
