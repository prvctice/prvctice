<template>
  <aside class="library-panel" :class="{ open: isOpen }" aria-label="File library">
    <div class="library-header">
      <span class="library-title">Library</span>
      <span class="library-count">{{ fileCount }}/{{ maxFiles }}</span>
      <button
        @click="$emit('close')"
        class="library-close-btn"
        title="Close library"
        aria-label="Close library"
      >
        <iconify-icon icon="ph:x" aria-hidden="true"></iconify-icon>
      </button>
    </div>

    <div v-if="files.length > 3" class="library-search">
      <iconify-icon
        icon="ph:magnifying-glass"
        class="search-icon"
        aria-hidden="true"
      ></iconify-icon>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search files..."
        class="search-input"
        aria-label="Search files"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="search-clear"
        title="Clear search"
        aria-label="Clear search"
      >
        <iconify-icon icon="ph:x" aria-hidden="true"></iconify-icon>
      </button>
    </div>

    <div class="library-content" ref="contentRef">
      <div v-if="isLoading" class="library-loading">
        <iconify-icon icon="ph:spinner" class="spin" aria-hidden="true"></iconify-icon>
        <span>Loading library...</span>
      </div>

      <div v-else-if="filteredFiles.length === 0" class="library-empty">
        <iconify-icon icon="ph:folder-open" class="empty-icon" aria-hidden="true"></iconify-icon>
        <span v-if="searchQuery">No files match "{{ searchQuery }}"</span>
        <template v-else>
          <span>No files yet</span>
          <p class="empty-hint">Drop a PDF to add it to your library</p>
        </template>
      </div>

      <div v-else class="library-grid">
        <button
          v-for="file in filteredFiles"
          :key="file.id"
          :ref="(el) => observeElement(el as HTMLElement, file.id)"
          class="library-file-card"
          @click="handleSelect(file)"
          :title="file.name"
        >
          <div class="file-thumbnail">
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
            ></iconify-icon>
          </div>
          <div class="file-info">
            <span class="file-name">{{ file.name }}</span>
            <span class="file-meta">
              {{ formatSize(file.size) }} &middot; {{ formatDate(file.uploadedAt) }}
            </span>
          </div>
          <button
            @click.stop="handleDelete(file)"
            class="file-delete-btn"
            title="Remove file"
            aria-label="Remove file"
          >
            <iconify-icon icon="ph:trash" aria-hidden="true"></iconify-icon>
          </button>
        </button>
      </div>
    </div>

    <!-- Confirm delete dialog -->
    <Teleport to="body">
      <div v-if="deleteConfirm" class="delete-confirm-overlay" @click="deleteConfirm = null">
        <div class="delete-confirm-dialog" @click.stop>
          <p class="delete-confirm-text">Remove "{{ deleteConfirm.name }}" from library?</p>
          <div class="delete-confirm-actions">
            <button @click="deleteConfirm = null" class="confirm-cancel-btn">Cancel</button>
            <button @click="confirmDelete" class="confirm-delete-btn">Remove</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useFileLibrary } from '@web/composables/useFileLibrary.js';
import type { LibraryFile } from '@web/types/library';

// =============================================================================
// Props & Emits
// =============================================================================

interface Props {
  isOpen: boolean;
  renderThumbnail?: (fileId: string) => Promise<Blob | null>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  select: [file: LibraryFile];
}>();

// =============================================================================
// Library State
// =============================================================================

const { files, isLoading, fileCount, maxFiles, removeFile, getThumbnail, setThumbnail, getFile } =
  useFileLibrary();

// =============================================================================
// Local State
// =============================================================================

const searchQuery = ref('');
const contentRef = ref<HTMLElement | null>(null);
const deleteConfirm = ref<LibraryFile | null>(null);
const thumbnailUrls = ref<Record<string, string>>({});

// Track observed elements for cleanup
const observedElements = new Map<string, HTMLElement>();
let observer: IntersectionObserver | null = null;

// =============================================================================
// Computed
// =============================================================================

const filteredFiles = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) {
    return [...files.value].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }
  return files.value
    .filter((f) => f.name.toLowerCase().includes(query))
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
});

// =============================================================================
// Thumbnail Lazy Loading
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
  // Check if already cached
  const cached = await getThumbnail(fileId);
  if (cached) {
    thumbnailUrls.value = {
      ...thumbnailUrls.value,
      [fileId]: URL.createObjectURL(cached),
    };
    return;
  }

  // Generate thumbnail if render function provided
  if (props.renderThumbnail) {
    try {
      const blob = await props.renderThumbnail(fileId);
      if (blob) {
        await setThumbnail(fileId, blob);
        thumbnailUrls.value = {
          ...thumbnailUrls.value,
          [fileId]: URL.createObjectURL(blob),
        };
      }
    } catch (err) {
      console.warn('[LibraryPanel] Thumbnail generation failed:', err);
    }
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
// Handlers
// =============================================================================

function handleSelect(file: LibraryFile): void {
  emit('select', file);
}

function handleDelete(file: LibraryFile): void {
  deleteConfirm.value = file;
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
// Formatters
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

  // Today
  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return 'Today';
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate()) {
    return 'Yesterday';
  }

  // This year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getFileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'ph:file-pdf';
  if (mimeType.startsWith('image/')) return 'ph:image';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'ph:file-doc';
  if (mimeType.includes('text')) return 'ph:file-text';
  return 'ph:file';
}

// =============================================================================
// Lifecycle
// =============================================================================

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      setupObserver();
    } else {
      cleanupObserver();
    }
  }
);

onMounted(() => {
  if (props.isOpen) {
    setupObserver();
  }
});

onBeforeUnmount(() => {
  cleanupObserver();
  revokeAllThumbnailUrls();
});
</script>

<style scoped>
.library-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--pdf-bg-solid);
  border-right: 1px solid var(--pdf-border);
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  z-index: 20;
}

.library-panel.open {
  transform: translateX(0);
}

/* Mobile fullscreen */
@media (max-width: 768px) {
  .library-panel {
    width: 100%;
    height: 100%;
    position: fixed;
    inset: 0;
    z-index: 1000;
    border-right: none;
  }
}

.library-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--pdf-border);
  flex-shrink: 0;
}

.library-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pdf-text);
  flex: 1;
}

.library-count {
  font-size: 11px;
  color: var(--pdf-text-muted);
  background: var(--pdf-surface-hover);
  padding: 2px 8px;
  border-radius: 10px;
}

.library-close-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--pdf-text-muted);
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

.library-close-btn:hover {
  background: rgb(239 68 68 / 12%);
  color: #dc2626;
}

.library-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--pdf-border);
}

.search-icon {
  color: var(--pdf-text-muted);
  font-size: 14px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--pdf-text);
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: var(--pdf-text-hint);
}

.search-clear {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--pdf-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  border-radius: 4px;
}

.search-clear:hover {
  background: var(--pdf-surface-hover);
}

.library-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.library-loading,
.library-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  text-align: center;
  color: var(--pdf-text-muted);
}

.library-loading iconify-icon,
.empty-icon {
  font-size: 40px;
  opacity: 0.5;
}

.empty-hint {
  font-size: 12px;
  color: var(--pdf-text-hint);
  margin: 0;
}

.library-grid {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

.library-file-card {
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

.library-file-card:hover {
  background: var(--pdf-surface-hover);
}

.library-file-card:hover .file-delete-btn {
  opacity: 0.6;
}

.file-thumbnail {
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

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  font-size: 20px;
  color: var(--pdf-text-hint);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--pdf-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 11px;
  color: var(--pdf-text-muted);
}

.file-delete-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--pdf-text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}

.file-delete-btn:hover {
  opacity: 1 !important;
  background: rgb(239 68 68 / 12%);
  color: #dc2626;
}

/* Delete confirmation dialog */
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
  background: var(--pdf-surface);
  border-radius: 12px;
  padding: 20px;
  max-width: 320px;
  box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
}

.delete-confirm-text {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--pdf-text);
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
  background: var(--pdf-surface-hover);
  color: var(--pdf-text);
}

.confirm-cancel-btn:hover {
  background: var(--pdf-surface-active);
}

.confirm-delete-btn {
  background: #dc2626;
  color: white;
}

.confirm-delete-btn:hover {
  background: #b91c1c;
}

/* Spinner animation */
.spin {
  animation: spin 1s linear infinite;
}
</style>
