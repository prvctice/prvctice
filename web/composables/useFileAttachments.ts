/**
 * useFileAttachments
 * Vue composable for file attachment management.
 * Handles file picker, drag & drop, previews, and upload logic.
 *
 * Replaces public/scripts/ui/file-upload.js
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useEventBus } from '@web/services/eventBus';
import { storage } from '@web/storage/storage.js';
import { resolve, getApiHeaders } from '@web/services/api.js';
import { debugLog, logError } from '@web/utils/debugLog.js';

// ==================== Types ====================

export interface AttachmentFile {
  file: File;
  previewUrl: string;
  uploadedId?: string; // Server-side file ID (for OpenAI)
}

export interface FileAttachmentsState {
  /** Array of attached files with preview URLs */
  attachments: Ref<AttachmentFile[]>;
  /** Computed count of attachments */
  attachCount: ComputedRef<number>;
  /** Whether drag overlay should be visible */
  isDragging: Ref<boolean>;
  /** Computed flag if any attachments exist */
  hasAttachments: ComputedRef<boolean>;
}

export interface FileAttachmentsActions {
  /** Attach single file */
  attachFile: (file: File) => Promise<void>;
  /** Attach multiple files */
  attachFiles: (files: File[] | FileList) => Promise<void>;
  /** Remove attachment at index */
  removeAttachment: (index: number) => void;
  /** Clear all attachments */
  clearAttachments: () => void;
  /** Handle file input change event */
  handleFileInputChange: (event: Event) => Promise<void>;
  /** Handle drop event */
  handleDrop: (event: DragEvent) => Promise<void>;
  /** Get files for submission */
  getFilesForSubmit: () => File[];
  /** Get base64 images for Gemini (local processing) */
  getBase64Images: () => Promise<Array<{ data: string; mimeType: string }>>;
  /** Set dragging state */
  setDragging: (dragging: boolean) => void;
}

export type UseFileAttachments = FileAttachmentsState & FileAttachmentsActions;

// ==================== Constants ====================

const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif'];
const ALLOWED_DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'txt'];
const ALL_ALLOWED_EXTENSIONS = [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_DOCUMENT_EXTENSIONS];

// ==================== Helpers ====================

function getFileExtension(file: File): string {
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  // Fallback to MIME type if no extension
  if (!ext && file.type) {
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/jpeg') return 'jpg';
    if (file.type === 'image/webp') return 'webp';
    if (file.type === 'image/gif') return 'gif';
  }
  return ext;
}

function isAllowedFile(file: File): boolean {
  const ext = getFileExtension(file);
  return ALL_ALLOWED_EXTENSIONS.includes(ext);
}

function isImageFile(file: File): boolean {
  const ext = getFileExtension(file);
  return ALLOWED_IMAGE_EXTENSIONS.includes(ext) || file.type?.startsWith('image/');
}

function resolveCurrentProvider(): string {
  try {
    const stored = storage.mirror.get('llmProvider');
    let provider = (stored || 'openai').toLowerCase();
    if (provider === 'google') provider = 'gemini';
    return provider;
  } catch {
    return 'openai';
  }
}

function getStoredApiKey(provider: string): string {
  try {
    const raw = storage.mirror.get('apiKeys');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed[provider] === 'string' && parsed[provider].trim()) {
        return parsed[provider].trim();
      }
    }
  } catch {
    // Fall through
  }
  try {
    const single = storage.mirror.get(`${provider}ApiKey`);
    if (typeof single === 'string' && single.trim()) return single.trim();
  } catch {
    // Fall through
  }
  return '';
}

async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get raw base64
      const base64 = result.split(',')[1] || result;
      resolve({
        data: base64,
        mimeType: file.type || 'application/octet-stream',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ==================== Singleton State ====================

// Singleton state shared across all consumers
let instance: UseFileAttachments | null = null;

const attachments: Ref<AttachmentFile[]> = ref([]);
const isDragging: Ref<boolean> = ref(false);

// ==================== Composable ====================

export function useFileAttachments(): UseFileAttachments {
  if (instance) return instance;

  const bus = useEventBus();

  // Computed
  const attachCount = computed(() => attachments.value.length);
  const hasAttachments = computed(() => attachments.value.length > 0);

  // Methods
  async function attachFile(file: File): Promise<void> {
    if (!isAllowedFile(file)) {
      debugLog('chat', 'attachment:unsupportedType', { fileName: file.name });
      return;
    }

    const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : '';
    const attachment: AttachmentFile = { file, previewUrl };

    const provider = resolveCurrentProvider();

    // For Gemini, we don't upload to server - use local base64
    if (provider === 'gemini') {
      attachments.value.push(attachment);
      bus.emit('file:attached', { file, index: attachments.value.length - 1 });
      return;
    }

    // For other providers, upload to server
    try {
      const formData = new FormData();
      formData.append('image', file);

      if (provider === 'openai') {
        const key = getStoredApiKey('openai');
        if (key) formData.append('openaiApiKey', key);
      }

      const response = await fetch(resolve('/api/upload'), {
        method: 'POST',
        body: formData,
        headers: getApiHeaders(),
      });
      if (!response.ok) throw new Error('Failed to upload file');

      const data = await response.json();
      if (data.fileId) {
        attachment.uploadedId = data.fileId;
      }
    } catch (err) {
      logError('chat', 'attachment:uploadFailed', err as Error);
      // Still attach locally even if upload fails
    }

    attachments.value.push(attachment);
    bus.emit('file:attached', { file, index: attachments.value.length - 1 });
  }

  async function attachFiles(files: File[] | FileList): Promise<void> {
    const list = Array.from(files);
    if (!list.length) return;

    const allowed = list.filter(isAllowedFile);
    if (!allowed.length) {
      debugLog('chat', 'attachment:noAllowedFiles', {});
      return;
    }

    const provider = resolveCurrentProvider();

    // For Gemini, attach all locally
    if (provider === 'gemini') {
      for (const file of allowed) {
        const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : '';
        attachments.value.push({ file, previewUrl });
      }
      bus.emit('file:attached', { count: allowed.length });
      return;
    }

    // For other providers, batch upload
    try {
      const formData = new FormData();
      for (const file of allowed) {
        formData.append('images', file);
      }

      if (provider === 'openai') {
        const key = getStoredApiKey('openai');
        if (key) formData.append('openaiApiKey', key);
      }

      const response = await fetch(resolve('/api/upload/multiple'), {
        method: 'POST',
        body: formData,
        headers: getApiHeaders(),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.details || 'Failed to upload files');
      }

      const uploadedFiles = Array.isArray(data.files) ? data.files : [];
      const uploadedIds = uploadedFiles.map((x: { fileId: string }) => x.fileId).filter(Boolean);

      for (let i = 0; i < allowed.length; i++) {
        const file = allowed[i];
        if (!file) continue;
        const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : '';
        attachments.value.push({
          file,
          previewUrl,
          uploadedId: uploadedIds[i],
        });
      }
    } catch (err) {
      logError('chat', 'attachment:batchUploadFailed', err as Error);
      // Fall back to local attachment
      for (const file of allowed) {
        const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : '';
        attachments.value.push({ file, previewUrl });
      }
    }

    bus.emit('file:attached', { count: allowed.length });
  }

  function removeAttachment(index: number): void {
    if (index < 0 || index >= attachments.value.length) return;

    const attachment = attachments.value[index];
    if (!attachment) return;
    if (attachment.previewUrl) {
      try {
        URL.revokeObjectURL(attachment.previewUrl);
      } catch {
        // Silent
      }
    }

    attachments.value.splice(index, 1);
    bus.emit('file:removed', { index });

    if (attachments.value.length === 0) {
      bus.emit('file:cleared', undefined);
    }
  }

  function clearAttachments(): void {
    for (const attachment of attachments.value) {
      if (attachment.previewUrl) {
        try {
          URL.revokeObjectURL(attachment.previewUrl);
        } catch {
          // Silent
        }
      }
    }
    attachments.value = [];
    bus.emit('file:cleared', undefined);
  }

  async function handleFileInputChange(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || !files.length) return;

    const firstFile = files[0];
    if (files.length === 1 && firstFile) {
      await attachFile(firstFile);
    } else {
      await attachFiles(files);
    }

    // Reset input
    try {
      target.value = '';
    } catch {
      // Silent
    }
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    const dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    const files = dt.files;

    // Check for workspace JSON file
    const singleFile = files[0];
    if (files.length === 1 && singleFile) {
      const file = singleFile;
      const ext = getFileExtension(file);
      const win = window as Window & {
        restoreWorkspace?: (json: unknown) => void;
        appendNotifs?: (kind: string, text: string) => void;
      };
      if (
        ext === 'json' &&
        typeof window !== 'undefined' &&
        typeof win.restoreWorkspace === 'function'
      ) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const json: unknown = JSON.parse(ev.target?.result as string);
            win.restoreWorkspace?.(json);
            if (typeof win.appendNotifs === 'function') {
              win.appendNotifs('workspace', 'WORKSPACE LOADED');
            }
          } catch (err) {
            alert('Invalid workspace file');
            logError('storage', 'workspace:parseFile', err as Error);
          }
        };
        reader.readAsText(file);
        return;
      }
    }

    // Handle as regular file attachment
    const firstDroppedFile = files[0];
    if (files.length === 1 && firstDroppedFile) {
      await attachFile(firstDroppedFile);
    } else {
      await attachFiles(files);
    }
  }

  function getFilesForSubmit(): File[] {
    return attachments.value.map((a) => a.file);
  }

  async function getBase64Images(): Promise<Array<{ data: string; mimeType: string }>> {
    const imageFiles = attachments.value.filter((a) => isImageFile(a.file));
    const results: Array<{ data: string; mimeType: string }> = [];

    for (const attachment of imageFiles) {
      try {
        const base64 = await fileToBase64(attachment.file);
        results.push(base64);
      } catch (err) {
        logError('chat', 'attachment:base64Convert', err as Error);
      }
    }

    return results;
  }

  function setDragging(dragging: boolean): void {
    isDragging.value = dragging;
  }

  instance = {
    // State
    attachments,
    attachCount,
    isDragging,
    hasAttachments,
    // Actions
    attachFile,
    attachFiles,
    removeAttachment,
    clearAttachments,
    handleFileInputChange,
    handleDrop,
    getFilesForSubmit,
    getBase64Images,
    setDragging,
  };

  return instance;
}

// Export for testing
export { ALLOWED_IMAGE_EXTENSIONS, ALLOWED_DOCUMENT_EXTENSIONS, ALL_ALLOWED_EXTENSIONS };
