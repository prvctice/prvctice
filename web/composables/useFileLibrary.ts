/**
 * File Library Composable
 *
 * Manages persistent storage of uploaded files (PDFs, documents)
 * with LRU eviction when limit is reached.
 *
 * Features:
 * - Stores files in OPFS via existing blob storage
 * - Metadata in IndexedDB via mirror storage
 * - Content-based deduplication (SHA-256 hash as ID)
 * - LRU eviction when at capacity
 * - Startup reconciliation for orphaned metadata
 * - Lazy thumbnail generation
 */

import { ref, computed, type Ref, type ComputedRef, onScopeDispose } from 'vue';
import { storage, blobPut, blobGet, blobRemove, blobExists } from '@web/storage/storage.js';
import { hashInWorker, terminateHashWorker } from '@web/utils/hashWorker.js';
import { useNotifs } from '@web/composables/useNotifs.js';
import { debugLog, logError } from '@web/utils/debugLog.js';
import type { LibraryFile, LibraryFileMetadata } from '@web/types/library';
import { getLibraryConfig, LIBRARY_STORAGE_KEY, inferFolder } from '@web/types/library';

// =============================================================================
// Types
// =============================================================================

export interface AddFileExtra {
  folder?: string;
  sourceId?: string;
}

export interface UseFileLibraryReturn {
  // State
  files: Ref<LibraryFile[]>;
  isLoading: Ref<boolean>;
  isInitialized: Ref<boolean>;
  fileCount: ComputedRef<number>;
  isNearLimit: ComputedRef<boolean>;
  isAtLimit: ComputedRef<boolean>;
  maxFiles: number;

  // Actions
  initialize: () => Promise<void>;
  addFile: (
    file: File,
    metadata?: LibraryFileMetadata,
    extra?: AddFileExtra
  ) => Promise<LibraryFile>;
  addOrReplaceBySource: (file: File, sourceId: string, folder?: string) => Promise<LibraryFile>;
  removeBySource: (sourceId: string) => Promise<void>;
  removeFile: (id: string) => Promise<void>;
  getFile: (id: string) => Promise<File | null>;
  getFileMetadata: (id: string) => LibraryFile | undefined;
  clearLibrary: () => Promise<void>;
  cleanup: () => void;

  // Thumbnails
  setThumbnail: (id: string, thumbnailBlob: Blob) => Promise<void>;
  getThumbnail: (id: string) => Promise<Blob | null>;
}

// =============================================================================
// Singleton State
// =============================================================================

let instance: UseFileLibraryReturn | null = null;
const files: Ref<LibraryFile[]> = ref([]);
const isLoading: Ref<boolean> = ref(false);
const isInitialized: Ref<boolean> = ref(false);
const addingFiles = new Set<string>(); // Guard against concurrent addFile races

const config = getLibraryConfig();

// =============================================================================
// Implementation
// =============================================================================

/**
 * File Library composable (singleton pattern)
 * Manages persistent file storage with LRU eviction
 */
export function useFileLibrary(): UseFileLibraryReturn {
  if (instance) return instance;

  const notifs = useNotifs();

  // Computed properties
  const fileCount = computed(() => files.value.length);
  const isNearLimit = computed(() => files.value.length >= config.warningThreshold);
  const isAtLimit = computed(() => files.value.length >= config.maxFiles);

  // ---------------------------------------------------------------------------
  // Storage Operations
  // ---------------------------------------------------------------------------

  async function loadLibrary(): Promise<LibraryFile[]> {
    try {
      const stored = storage.mirror.getJSON<LibraryFile[]>(LIBRARY_STORAGE_KEY, []);
      return stored || [];
    } catch (err) {
      logError('storage', 'library:load', err as Error);
      return [];
    }
  }

  async function saveLibrary(): Promise<void> {
    try {
      await storage.mirror.setJSON(LIBRARY_STORAGE_KEY, files.value);
    } catch (err) {
      logError('storage', 'library:save', err as Error);
    }
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Reconcile metadata with actual blob storage on startup.
   * Removes metadata entries where the blob no longer exists.
   */
  async function reconcile(libraryFiles: LibraryFile[]): Promise<LibraryFile[]> {
    const validFiles: LibraryFile[] = [];
    const seen = new Set<string>();

    for (const file of libraryFiles) {
      // Deduplicate by ID (same content hash)
      if (seen.has(file.id)) {
        debugLog('storage', 'library:duplicateRemoved', { fileName: file.name });
        continue;
      }
      seen.add(file.id);

      const exists = await blobExists(file.id);
      if (exists) {
        validFiles.push(file);
      } else {
        debugLog('storage', 'library:orphanedRemoved', { fileName: file.name });
      }
    }

    return validFiles;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async function initialize(): Promise<void> {
    if (isInitialized.value) return;

    isLoading.value = true;
    try {
      const loaded = await loadLibrary();
      const reconciled = await reconcile(loaded);

      // Auto-migrate: assign folders to existing files that don't have one
      let migrated = false;
      const withFolders = reconciled.map((f) => {
        if (!f.folder) {
          const folder = inferFolder(f.mimeType);
          if (folder) {
            migrated = true;
            return { ...f, folder };
          }
        }
        return f;
      });

      files.value = withFolders;

      // Save if we removed orphans or migrated folders
      if (reconciled.length !== loaded.length || migrated) {
        await saveLibrary();
      }

      isInitialized.value = true;
    } catch (err) {
      logError('storage', 'library:init', err as Error);
      files.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function addFile(
    file: File,
    metadata?: LibraryFileMetadata,
    extra?: AddFileExtra
  ): Promise<LibraryFile> {
    // Read file content
    const arrayBuffer = await file.arrayBuffer();

    // Hash in worker (off main thread)
    const hash = await hashInWorker(arrayBuffer.slice(0));

    // Check if file already exists (deduplication)
    const existing = files.value.find((f) => f.id === hash);
    if (existing) {
      // Update last accessed and return existing
      files.value = files.value.map((f) =>
        f.id === hash ? { ...f, lastAccessedAt: Date.now() } : f
      );
      await saveLibrary();
      return existing;
    }

    // Guard against concurrent addFile calls for the same content
    if (addingFiles.has(hash)) {
      // Another addFile for this hash is in progress — wait and return it
      await new Promise((r) => setTimeout(r, 500));
      const added = files.value.find((f) => f.id === hash);
      if (added) return added;
    }
    addingFiles.add(hash);

    // Check limit and evict if needed
    if (files.value.length >= config.maxFiles) {
      const sorted = [...files.value].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      const lru = sorted[0];
      if (lru) {
        await removeFile(lru.id);
        notifs.push('info', 'File Removed', {
          description: `Removed "${lru.name}" to make room for new uploads.`,
        });
      }
    }

    // Store blob content (using existing storage which does its own hashing)
    const blobRecord = await blobPut(arrayBuffer, file.type);

    // Determine folder: explicit > inferred from MIME type
    const folder = extra?.folder ?? inferFolder(file.type);

    // Create library entry
    const now = Date.now();
    const libraryFile: LibraryFile = {
      id: blobRecord.id,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      uploadedAt: now,
      lastAccessedAt: now,
      metadata,
      ...(folder ? { folder } : {}),
      ...(extra?.sourceId ? { sourceId: extra.sourceId } : {}),
    };

    files.value = [...files.value, libraryFile];
    addingFiles.delete(hash);
    await saveLibrary();

    // Emit event for search index freshness (lazy import to avoid init order issues)
    import('@web/services/eventBus').then(({ useEventBus }) => {
      useEventBus().emit('library:file-added', {
        id: libraryFile.id,
        name: libraryFile.name,
        mimeType: libraryFile.mimeType,
        size: libraryFile.size,
      });
    });

    return libraryFile;
  }

  async function addOrReplaceBySource(
    file: File,
    sourceId: string,
    folder?: string
  ): Promise<LibraryFile> {
    // Find existing file with this sourceId
    const existing = files.value.find((f) => f.sourceId === sourceId);
    if (existing) {
      // Remove old blob + metadata
      try {
        await blobRemove({ hash: existing.id });
      } catch (err) {
        logError('storage', 'library:replaceBlob', err as Error);
      }
      if (existing.thumbnailHash) {
        try {
          await blobRemove({ hash: existing.thumbnailHash });
        } catch {}
      }
      files.value = files.value.filter((f) => f.sourceId !== sourceId);
    }

    // Add the new file with folder and sourceId
    return addFile(file, undefined, { folder, sourceId });
  }

  async function removeBySource(sourceId: string): Promise<void> {
    const existing = files.value.find((f) => f.sourceId === sourceId);
    if (existing) {
      await removeFile(existing.id);
    }
  }

  async function removeFile(id: string): Promise<void> {
    const file = files.value.find((f) => f.id === id);
    if (!file) return;

    // Remove blob content
    try {
      await blobRemove({ hash: id });
    } catch (err) {
      logError('storage', 'library:blobRemoval', err as Error);
    }

    // Remove thumbnail if exists
    if (file.thumbnailHash) {
      try {
        await blobRemove({ hash: file.thumbnailHash });
      } catch (err) {
        logError('storage', 'library:thumbnailRemoval', err as Error);
      }
    }

    // Update state
    files.value = files.value.filter((f) => f.id !== id);
    await saveLibrary();

    // Emit event for search index freshness (lazy import to avoid init order issues)
    import('@web/services/eventBus').then(({ useEventBus }) => {
      useEventBus().emit('library:file-removed', { id });
    });
  }

  async function getFile(id: string): Promise<File | null> {
    const entry = files.value.find((f) => f.id === id);
    if (!entry) return null;

    const blob = await blobGet({ hash: id });
    if (!blob) {
      // Blob missing - remove orphaned metadata
      files.value = files.value.filter((f) => f.id !== id);
      await saveLibrary();
      return null;
    }

    // Update lastAccessedAt (only on actual file retrieval)
    files.value = files.value.map((f) => (f.id === id ? { ...f, lastAccessedAt: Date.now() } : f));
    await saveLibrary();

    // Return as File with original name
    return new File([blob], entry.name, { type: entry.mimeType });
  }

  function getFileMetadata(id: string): LibraryFile | undefined {
    return files.value.find((f) => f.id === id);
  }

  async function clearLibrary(): Promise<void> {
    isLoading.value = true;
    try {
      for (const file of files.value) {
        try {
          await blobRemove({ hash: file.id });
        } catch {}
        if (file.thumbnailHash) {
          try {
            await blobRemove({ hash: file.thumbnailHash });
          } catch {}
        }
      }
      files.value = [];
      await saveLibrary();
    } finally {
      isLoading.value = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Thumbnails
  // ---------------------------------------------------------------------------

  async function setThumbnail(id: string, thumbnailBlob: Blob): Promise<void> {
    const entry = files.value.find((f) => f.id === id);
    if (!entry) return;

    // Store thumbnail blob
    const arrayBuffer = await thumbnailBlob.arrayBuffer();
    const thumbRecord = await blobPut(arrayBuffer, thumbnailBlob.type);

    // Update metadata
    files.value = files.value.map((f) =>
      f.id === id ? { ...f, thumbnailHash: thumbRecord.id } : f
    );
    await saveLibrary();
  }

  async function getThumbnail(id: string): Promise<Blob | null> {
    const entry = files.value.find((f) => f.id === id);
    if (!entry?.thumbnailHash) return null;

    const blob = await blobGet({ hash: entry.thumbnailHash });
    return blob;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  function cleanup(): void {
    terminateHashWorker();
  }

  // Auto-cleanup when scope is disposed (e.g., app unmount)
  onScopeDispose(() => {
    cleanup();
  });

  // ---------------------------------------------------------------------------
  // Build Instance
  // ---------------------------------------------------------------------------

  instance = {
    files,
    isLoading,
    isInitialized,
    fileCount,
    isNearLimit,
    isAtLimit,
    maxFiles: config.maxFiles,
    initialize,
    addFile,
    addOrReplaceBySource,
    removeBySource,
    removeFile,
    getFile,
    getFileMetadata,
    clearLibrary,
    cleanup,
    setThumbnail,
    getThumbnail,
  };

  return instance;
}
