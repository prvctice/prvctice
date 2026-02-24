<template>
  <teleport to="body">
    <div
      v-if="modalOpen"
      ref="overlayRef"
      class="docbrowser-overlay"
      data-no-orbit
      @click="modal.handleOverlayClick"
    >
      <div
        ref="dialogRef"
        class="docbrowser-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Document browser"
      >
        <div class="docbrowser-media" aria-hidden="true">
          <video
            class="docbrowser-media-video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="docbrowser-media-scrim"></div>
        </div>
        <div class="docbrowser-inner">
          <!-- Header -->
          <div class="docbrowser-header">
            <div class="header-left">
              <button
                v-if="inFolder"
                class="back-btn"
                title="Back to folders"
                aria-label="Back to folders"
                @click="docBrowser.goBack()"
              >
                <iconify-icon icon="ph:arrow-left" aria-hidden="true" />
              </button>
              <span class="header-title">{{ inFolder ? currentFolder : 'Files' }}</span>
              <span class="header-count"
                >{{ inFolder ? sortedFilteredFiles.length : fileCount }}/{{ maxFiles }}</span
              >
            </div>
            <div class="header-right">
              <button
                class="view-toggle-btn"
                :class="{ active: viewMode === 'grid' }"
                title="Grid view"
                aria-label="Grid view"
                @click="viewMode = 'grid'"
              >
                <iconify-icon icon="ph:grid-four" aria-hidden="true" />
              </button>
              <button
                class="view-toggle-btn"
                :class="{ active: viewMode === 'list' }"
                title="List view"
                aria-label="List view"
                @click="viewMode = 'list'"
              >
                <iconify-icon icon="ph:list" aria-hidden="true" />
              </button>
              <button
                class="close-btn"
                title="Close"
                aria-label="Close document browser"
                @click="closeBrowser"
              >
                <iconify-icon icon="ph:x" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="docbrowser-toolbar">
            <div class="toolbar-left">
              <select v-model="sortField" class="toolbar-select" aria-label="Sort by">
                <option value="name">Name</option>
                <option value="uploadedAt">Date</option>
                <option value="size">Size</option>
              </select>
              <button
                class="sort-dir-btn"
                :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'"
                :aria-label="sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'"
                @click="toggleSortDirection"
              >
                <iconify-icon
                  :icon="sortDirection === 'asc' ? 'ph:sort-ascending' : 'ph:sort-descending'"
                  aria-hidden="true"
                />
              </button>
            </div>
            <div class="toolbar-right">
              <select v-model="filterType" class="toolbar-select" aria-label="Filter by type">
                <option value="all">All</option>
                <option value="pdf">PDFs</option>
                <option value="image">Images</option>
                <option value="document">Documents</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <!-- Content -->
          <div ref="contentRef" class="docbrowser-content">
            <!-- Loading -->
            <div v-if="isLoading" class="docbrowser-empty">
              <iconify-icon icon="ph:spinner" class="spin" aria-hidden="true" />
              <span>Loading files...</span>
            </div>

            <!-- Root view: folder cards + root-level files -->
            <template v-else-if="!inFolder">
              <!-- Folder cards -->
              <div class="docbrowser-folders">
                <button
                  v-for="folder in LIBRARY_FOLDERS"
                  :key="folder"
                  class="folder-card"
                  @click="docBrowser.enterFolder(folder)"
                >
                  <iconify-icon
                    :icon="getFolderIcon(folder)"
                    class="folder-icon"
                    aria-hidden="true"
                  />
                  <span class="folder-name">{{ folder }}</span>
                  <span class="folder-count">{{ folderCounts[folder] || 0 }}</span>
                </button>
              </div>

              <!-- Root-level files (no folder) -->
              <template v-if="sortedFilteredFiles.length > 0">
                <div v-if="viewMode === 'grid'" class="docbrowser-grid">
                  <div
                    v-for="file in sortedFilteredFiles"
                    :key="file.id"
                    :ref="(el) => observeElement(el as HTMLElement, file.id)"
                    class="grid-card"
                    :title="file.name"
                    draggable="true"
                    @click="openFile(file)"
                    @dragstart="handleDragStart($event, file)"
                  >
                    <div class="grid-thumbnail">
                      <img
                        v-if="thumbnailUrls[file.id]"
                        :src="thumbnailUrls[file.id]"
                        :alt="file.name"
                        class="thumbnail-image"
                      />
                      <iconify-icon
                        v-else
                        :icon="getFileIcon(file.mimeType)"
                        class="thumbnail-placeholder"
                        aria-hidden="true"
                      />
                    </div>
                    <div class="grid-info">
                      <span class="grid-name">{{ file.name }}</span>
                      <span class="grid-meta">{{ formatSize(file.size) }}</span>
                    </div>
                    <div class="grid-actions">
                      <button
                        class="grid-action-btn"
                        title="Download file"
                        aria-label="Download file"
                        @click.stop="handleDownload(file)"
                      >
                        <iconify-icon icon="ph:download-simple" aria-hidden="true" />
                      </button>
                      <button
                        class="grid-action-btn grid-action-btn--danger"
                        title="Remove file"
                        aria-label="Remove file"
                        @click.stop="handleDelete(file)"
                      >
                        <iconify-icon icon="ph:trash" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="docbrowser-list">
                  <div
                    v-for="file in sortedFilteredFiles"
                    :key="file.id"
                    :ref="(el) => observeElement(el as HTMLElement, file.id)"
                    class="list-row"
                    :title="file.name"
                    draggable="true"
                    @click="openFile(file)"
                    @dragstart="handleDragStart($event, file)"
                  >
                    <div class="list-thumbnail">
                      <img
                        v-if="thumbnailUrls[file.id]"
                        :src="thumbnailUrls[file.id]"
                        :alt="file.name"
                        class="thumbnail-image"
                      />
                      <iconify-icon
                        v-else
                        :icon="getFileIcon(file.mimeType)"
                        class="thumbnail-placeholder"
                        aria-hidden="true"
                      />
                    </div>
                    <div class="list-info">
                      <span class="list-name">{{ file.name }}</span>
                      <span class="list-meta">
                        {{ formatSize(file.size) }} &middot; {{ formatDate(file.uploadedAt) }}
                      </span>
                    </div>
                    <div class="list-actions">
                      <button
                        class="list-action-btn"
                        title="Download file"
                        aria-label="Download file"
                        @click.stop="handleDownload(file)"
                      >
                        <iconify-icon icon="ph:download-simple" aria-hidden="true" />
                      </button>
                      <button
                        class="list-action-btn list-action-btn--danger"
                        title="Remove file"
                        aria-label="Remove file"
                        @click.stop="handleDelete(file)"
                      >
                        <iconify-icon icon="ph:trash" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <!-- Inside folder: empty state -->
            <div v-else-if="sortedFilteredFiles.length === 0" class="docbrowser-empty">
              <iconify-icon icon="ph:folder-open" class="empty-icon" aria-hidden="true" />
              <span>No files in {{ currentFolder }}</span>
            </div>

            <!-- Inside folder: Grid view -->
            <div v-else-if="viewMode === 'grid'" class="docbrowser-grid">
              <div
                v-for="file in sortedFilteredFiles"
                :key="file.id"
                :ref="(el) => observeElement(el as HTMLElement, file.id)"
                class="grid-card"
                :title="file.name"
                draggable="true"
                @click="openFile(file)"
                @dragstart="handleDragStart($event, file)"
              >
                <div class="grid-thumbnail">
                  <img
                    v-if="thumbnailUrls[file.id]"
                    :src="thumbnailUrls[file.id]"
                    :alt="file.name"
                    class="thumbnail-image"
                  />
                  <iconify-icon
                    v-else
                    :icon="getFileIcon(file.mimeType)"
                    class="thumbnail-placeholder"
                    aria-hidden="true"
                  />
                </div>
                <div class="grid-info">
                  <span class="grid-name">{{ file.name }}</span>
                  <span class="grid-meta">{{ formatSize(file.size) }}</span>
                </div>
                <div class="grid-actions">
                  <button
                    class="grid-action-btn"
                    title="Download file"
                    aria-label="Download file"
                    @click.stop="handleDownload(file)"
                  >
                    <iconify-icon icon="ph:download-simple" aria-hidden="true" />
                  </button>
                  <button
                    class="grid-action-btn grid-action-btn--danger"
                    title="Remove file"
                    aria-label="Remove file"
                    @click.stop="handleDelete(file)"
                  >
                    <iconify-icon icon="ph:trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <!-- List view -->
            <div v-else class="docbrowser-list">
              <div
                v-for="file in sortedFilteredFiles"
                :key="file.id"
                :ref="(el) => observeElement(el as HTMLElement, file.id)"
                class="list-row"
                :title="file.name"
                draggable="true"
                @click="openFile(file)"
                @dragstart="handleDragStart($event, file)"
              >
                <div class="list-thumbnail">
                  <img
                    v-if="thumbnailUrls[file.id]"
                    :src="thumbnailUrls[file.id]"
                    :alt="file.name"
                    class="thumbnail-image"
                  />
                  <iconify-icon
                    v-else
                    :icon="getFileIcon(file.mimeType)"
                    class="thumbnail-placeholder"
                    aria-hidden="true"
                  />
                </div>
                <div class="list-info">
                  <span class="list-name">{{ file.name }}</span>
                  <span class="list-meta">
                    {{ formatSize(file.size) }} &middot; {{ formatDate(file.uploadedAt) }}
                  </span>
                </div>
                <div class="list-actions">
                  <button
                    class="list-action-btn"
                    title="Download file"
                    aria-label="Download file"
                    @click.stop="handleDownload(file)"
                  >
                    <iconify-icon icon="ph:download-simple" aria-hidden="true" />
                  </button>
                  <button
                    class="list-action-btn list-action-btn--danger"
                    title="Remove file"
                    aria-label="Remove file"
                    @click.stop="handleDelete(file)"
                  >
                    <iconify-icon icon="ph:trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <div v-if="deleteConfirm" class="delete-confirm-overlay" @click="deleteConfirm = null">
      <div class="delete-confirm-dialog" @click.stop>
        <p class="delete-confirm-text">Remove "{{ deleteConfirm.name }}" from library?</p>
        <div class="delete-confirm-actions">
          <button class="confirm-cancel-btn" @click="deleteConfirm = null">Cancel</button>
          <button class="confirm-delete-btn" @click="confirmDelete">Remove</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useDocumentBrowser } from '@web/composables/useDocumentBrowser';
import { useFileLibrary } from '@web/composables/useFileLibrary';
import { useModal } from '@web/composables/useModal';
import { useNotifs } from '@web/composables/useNotifs';
import { useWindowManager } from '@web/composables/useWindowManager';
import { BUILTIN_APPS } from '@web/services/apps/builtinApps';
import type { LibraryFile } from '@web/types/library';
import { LIBRARY_FOLDERS } from '@web/types/library';
import type { FilterType } from '@web/composables/useDocumentBrowser';

const baseUrl = import.meta.env.BASE_URL;

// =============================================================================
// State
// =============================================================================

const docBrowser = useDocumentBrowser();
const { viewMode, sortField, sortDirection, filterType, currentFolder } = docBrowser;

const {
  files,
  isLoading,
  fileCount,
  maxFiles,
  removeFile,
  getThumbnail,
  getFile,
  initialize,
  isInitialized,
} = useFileLibrary();

const notifs = useNotifs();

const overlayRef = ref<HTMLElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const deleteConfirm = ref<LibraryFile | null>(null);
const thumbnailUrls = ref<Record<string, string>>({});
const modalOpen = ref(false);

// Track observed elements for cleanup
const observedElements = new Map<string, HTMLElement>();
let observer: IntersectionObserver | null = null;

// =============================================================================
// Modal integration
// =============================================================================

const modal = useModal({
  getElements: () => ({
    overlay: overlayRef.value,
    dialog: dialogRef.value,
  }),
  onClose: () => docBrowser.close(),
  closeOnEscape: true,
  closeOnOverlayClick: true,
  lockBodyScroll: true,
});

// Sync docBrowser.isOpen -> modal animation
watch(docBrowser.isOpen, async (open) => {
  if (open) {
    modalOpen.value = true;
    if (!isInitialized.value) {
      await initialize();
    }
    await nextTick();
    await modal.open();
    setupObserver();
  } else {
    cleanupObserver();
    await modal.close();
    modalOpen.value = false;
  }
});

function closeBrowser(): void {
  docBrowser.close();
}

function toggleSortDirection(): void {
  sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
}

// =============================================================================
// Computed: sorted + filtered files
// =============================================================================

function matchesFilter(file: LibraryFile, filter: FilterType): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'pdf':
      return file.mimeType === 'application/pdf';
    case 'image':
      return file.mimeType.startsWith('image/');
    case 'document':
      return (
        file.mimeType.includes('word') ||
        file.mimeType.includes('document') ||
        file.mimeType.includes('text')
      );
    case 'other':
      return (
        file.mimeType !== 'application/pdf' &&
        !file.mimeType.startsWith('image/') &&
        !file.mimeType.includes('word') &&
        !file.mimeType.includes('document') &&
        !file.mimeType.includes('text')
      );
    default:
      return true;
  }
}

/** Counts per folder for the root folder cards */
const folderCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const name of LIBRARY_FOLDERS) {
    counts[name] = files.value.filter((f) => f.folder === name).length;
  }
  return counts;
});

/** Files not assigned to any folder (root-level) */
const rootFiles = computed(() => files.value.filter((f) => !f.folder));

/** Files in the currently-selected folder */
const folderFiles = computed(() => {
  if (!currentFolder.value) return [];
  return files.value.filter((f) => f.folder === currentFolder.value);
});

/** Whether we're inside a folder */
const inFolder = computed(() => currentFolder.value !== null);

const sortedFilteredFiles = computed(() => {
  // When inside a folder, show that folder's files (filter dropdown still works)
  const source = inFolder.value ? folderFiles.value : rootFiles.value;
  const filtered = source.filter((f) => matchesFilter(f, filterType.value));

  const field = sortField.value;
  const dir = sortDirection.value === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    if (field === 'name') {
      return dir * a.name.localeCompare(b.name);
    }
    if (field === 'uploadedAt') {
      return dir * (a.uploadedAt - b.uploadedAt);
    }
    if (field === 'size') {
      return dir * (a.size - b.size);
    }
    return 0;
  });
});

// =============================================================================
// Thumbnail lazy loading (IntersectionObserver pattern from LibraryPanel)
// =============================================================================

function setupObserver(): void {
  if (observer) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const fileId = (entry.target as HTMLElement).dataset.fileId;
          if (fileId && !thumbnailUrls.value[fileId]) {
            loadThumbnail(fileId);
          }
        }
      }
    },
    {
      root: contentRef.value,
      rootMargin: '100px',
      threshold: 0,
    }
  );

  // Observe any already-rendered elements
  for (const [, el] of observedElements) {
    observer.observe(el);
  }
}

function observeElement(el: HTMLElement | null, fileId: string): void {
  if (!el) return;

  el.dataset.fileId = fileId;

  // Unobserve old element if exists
  const oldEl = observedElements.get(fileId);
  if (oldEl && observer) {
    observer.unobserve(oldEl);
  }

  observedElements.set(fileId, el);

  if (observer) {
    observer.observe(el);
  }
}

async function loadThumbnail(fileId: string): Promise<void> {
  const cached = await getThumbnail(fileId);
  if (cached) {
    thumbnailUrls.value = {
      ...thumbnailUrls.value,
      [fileId]: URL.createObjectURL(cached),
    };
  }
}

function cleanupObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  observedElements.clear();
}

function revokeAllThumbnailUrls(): void {
  for (const url of Object.values(thumbnailUrls.value)) {
    URL.revokeObjectURL(url);
  }
  thumbnailUrls.value = {};
}

// =============================================================================
// File actions
// =============================================================================

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

async function openFile(file: LibraryFile): Promise<void> {
  if (file.mimeType === 'application/pdf') {
    const fileObj = await getFile(file.id);
    if (!fileObj) return;

    openPdfInViewer(fileObj);
    docBrowser.close();
  } else if (file.mimeType.startsWith('image/')) {
    // Open image in new tab
    const fileObj = await getFile(file.id);
    if (fileObj) {
      const url = URL.createObjectURL(fileObj);
      window.open(url, '_blank');
      // Revoke after a delay to allow the new tab to load
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    docBrowser.close();
  } else if (file.mimeType === 'text/markdown' && file.sourceId) {
    // Note file — switch to the source note tab
    import('@web/services/eventBus').then(({ useEventBus }) => {
      useEventBus().emit('notes:focus-tab', { tabId: file.sourceId });
    });
    docBrowser.close();
  } else {
    notifs.push('info', 'No Preview', {
      description: 'Preview is not available for this file type.',
    });
  }
}

async function handleDownload(file: LibraryFile): Promise<void> {
  const fileObj = await getFile(file.id);
  if (!fileObj) {
    notifs.push('error', 'Download failed', { description: 'Could not retrieve file.' });
    return;
  }
  const url = URL.createObjectURL(fileObj);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function handleDelete(file: LibraryFile): void {
  deleteConfirm.value = file;
}

async function handleDragStart(event: DragEvent, file: LibraryFile): Promise<void> {
  const fileObj = await getFile(file.id);
  if (!fileObj || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', file.name);
  event.dataTransfer.setData('application/x-prvctice-file', file.id);
  event.dataTransfer.items.add(fileObj);
  event.dataTransfer.effectAllowed = 'copy';
}

async function confirmDelete(): Promise<void> {
  if (!deleteConfirm.value) return;

  const fileId = deleteConfirm.value.id;

  // Revoke thumbnail URL if exists
  if (thumbnailUrls.value[fileId]) {
    URL.revokeObjectURL(thumbnailUrls.value[fileId]);
    const { [fileId]: _, ...rest } = thumbnailUrls.value;
    thumbnailUrls.value = rest;
  }

  await removeFile(fileId);
  deleteConfirm.value = null;
}

// =============================================================================
// Formatters (copied from LibraryPanel to avoid touching it)
// =============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return 'Today';
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate()) {
    return 'Yesterday';
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'ph:file-pdf';
  if (mimeType.startsWith('image/')) return 'ph:image';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'ph:file-doc';
  if (mimeType.includes('text') || mimeType.includes('markdown')) return 'ph:file-text';
  return 'ph:file';
}

function getFolderIcon(folder: string): string {
  switch (folder) {
    case 'Notes':
      return 'ph:notebook';
    case 'Images':
      return 'ph:image';
    case 'Audio':
      return 'ph:music-notes';
    default:
      return 'ph:folder';
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  if (docBrowser.isOpen.value && !isInitialized.value) {
    initialize();
  }
});

onBeforeUnmount(() => {
  cleanupObserver();
  revokeAllThumbnailUrls();
});
</script>

<style scoped>
/* =============================================================================
 * Overlay + Dialog
 * ============================================================================= */

.docbrowser-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 50%);
  z-index: 9000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

.docbrowser-dialog {
  position: relative;
  background: var(--surface, #1a1a2e);
  border-radius: var(--radius-xl);
  width: 90vw;
  max-width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
  border: 1px solid var(--border, rgb(255 255 255 / 0.08));
  overflow: hidden;
}

.docbrowser-media,
.docbrowser-media-scrim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.docbrowser-media-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
  opacity: 0.9;
}

.docbrowser-media-scrim {
  background: linear-gradient(180deg, rgb(8 12 24 / 20%), rgb(6 10 20 / 60%));
}

.docbrowser-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: rgb(10 14 26 / 74%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* =============================================================================
 * Header
 * ============================================================================= */

.docbrowser-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, rgb(255 255 255 / 0.08));
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
}

.header-count {
  font-size: 11px;
  color: var(--text-secondary, #999);
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  padding: 2px 8px;
  border-radius: 10px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-toggle-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition:
    background 0.15s,
    color 0.15s;
}

.view-toggle-btn:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
}

.view-toggle-btn.active {
  color: var(--text, #e0e0e0);
  background: var(--surface-hover, rgb(255 255 255 / 0.08));
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  margin-left: 4px;
  transition:
    background 0.15s,
    color 0.15s;
}

.close-btn:hover {
  background: rgb(239 68 68 / 12%);
  color: #dc2626;
}

.back-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition:
    background 0.15s,
    color 0.15s;
}

.back-btn:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  color: var(--text, #e0e0e0);
}

/* =============================================================================
 * Folder Cards
 * ============================================================================= */

.docbrowser-folders {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, rgb(255 255 255 / 0.06));
}

.folder-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border, rgb(255 255 255 / 0.08));
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--text, #e0e0e0);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
  text-align: left;
}

.folder-card:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  border-color: var(--border, rgb(255 255 255 / 0.12));
}

.folder-icon {
  font-size: 18px;
  color: var(--text-secondary, #999);
  flex-shrink: 0;
}

.folder-name {
  font-size: 12px;
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.folder-count {
  font-size: 11px;
  color: var(--text-secondary, #999);
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  padding: 1px 6px;
  border-radius: var(--radius-pill, 999px);
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .docbrowser-folders {
    grid-template-columns: 1fr;
  }
}

/* =============================================================================
 * Toolbar
 * ============================================================================= */

.docbrowser-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border, rgb(255 255 255 / 0.08));
  flex-shrink: 0;
  gap: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-select {
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  color: var(--text, #e0e0e0);
  border: 1px solid var(--border, rgb(255 255 255 / 0.08));
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  appearance: auto;
}

.toolbar-select:focus {
  border-color: var(--accent, #6366f1);
}

.sort-dir-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition:
    background 0.15s,
    color 0.15s;
  border: 1px solid var(--border, rgb(255 255 255 / 0.08));
}

.sort-dir-btn:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.08));
  color: var(--text, #e0e0e0);
}

/* =============================================================================
 * Content
 * ============================================================================= */

.docbrowser-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.docbrowser-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-secondary, #999);
}

.docbrowser-empty .spin {
  font-size: 32px;
  animation: docbrowser-spin 1s linear infinite;
}

.empty-icon {
  font-size: 40px;
  opacity: 0.5;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin: 0;
}

@keyframes docbrowser-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* =============================================================================
 * Grid view
 * ============================================================================= */

.docbrowser-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
}

@media (max-width: 640px) {
  .docbrowser-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 400px) {
  .docbrowser-grid {
    grid-template-columns: 1fr;
  }
}

.grid-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 8px;
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  transition: background 0.15s;
  padding: 0;
}

.grid-card:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.1));
}

.grid-card:hover .grid-actions {
  opacity: 1;
}

.grid-card[draggable='true'] {
  cursor: grab;
}

.grid-card[draggable='true']:active {
  cursor: grabbing;
}

.grid-thumbnail {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.03);
  overflow: hidden;
}

.grid-thumbnail .thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.grid-thumbnail .thumbnail-placeholder {
  font-size: 32px;
  color: var(--text-secondary, #666);
}

.grid-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.grid-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid-meta {
  font-size: 11px;
  color: var(--text-secondary, #999);
}

.grid-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.grid-action-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: rgb(0 0 0 / 50%);
  color: #fff;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.15s;
}

.grid-action-btn:hover {
  background: rgb(255 255 255 / 20%);
}

.grid-action-btn--danger:hover {
  background: rgb(239 68 68 / 80%);
}

/* =============================================================================
 * List view
 * ============================================================================= */

.docbrowser-list {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 2px;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  width: 100%;
}

.list-row:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.05));
}

.list-row:hover .list-actions {
  opacity: 1;
}

.list-row[draggable='true'] {
  cursor: grab;
}

.list-row[draggable='true']:active {
  cursor: grabbing;
}

.list-thumbnail {
  width: 40px;
  height: 52px;
  border-radius: 4px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}

.list-thumbnail .thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-thumbnail .thumbnail-placeholder {
  font-size: 20px;
  color: var(--text-secondary, #666);
}

.list-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-meta {
  font-size: 11px;
  color: var(--text-secondary, #999);
}

.list-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.list-action-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition:
    background 0.15s,
    color 0.15s;
}

.list-action-btn:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.08));
  color: var(--text, #e0e0e0);
}

.list-action-btn--danger:hover {
  background: rgb(239 68 68 / 12%);
  color: #dc2626;
}

/* =============================================================================
 * Delete confirmation dialog
 * ============================================================================= */

.delete-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 50%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.delete-confirm-dialog {
  background: var(--surface, #1a1a2e);
  border-radius: 12px;
  padding: 20px;
  max-width: 320px;
  box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
  border: 1px solid var(--border, rgb(255 255 255 / 0.08));
}

.delete-confirm-text {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text, #e0e0e0);
  line-height: 1.5;
}

.delete-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-cancel-btn,
.confirm-delete-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.confirm-cancel-btn {
  background: var(--surface-hover, rgb(255 255 255 / 0.08));
  color: var(--text, #e0e0e0);
}

.confirm-cancel-btn:hover {
  background: var(--surface-hover, rgb(255 255 255 / 0.12));
}

.confirm-delete-btn {
  background: #dc2626;
  color: white;
}

.confirm-delete-btn:hover {
  background: #b91c1c;
}
</style>
