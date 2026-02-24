import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface ImageEntry {
  src: string;
  downloadName?: string;
  prompt: string;
  model?: string;
  provider?: string;
  kind: string;
  mimeType?: string;
  base64?: string;
  source?: string;
  sourceUrl?: string;
  imageId?: string;
  timestamp: number;
}

export interface RawImageEntry {
  src?: string;
  url?: string;
  href?: string;
  downloadName?: string;
  filename?: string;
  prompt?: string;
  model?: string;
  provider?: string;
  kind?: string;
  mimeType?: string;
  type?: string;
  base64?: string;
  source?: string;
  sourceUrl?: string;
  imageId?: string;
  timestamp?: number;
}

export interface ImageModalContext {
  [key: string]: unknown;
}

function normaliseImageEntry(entry: RawImageEntry | string | null | undefined): ImageEntry | null {
  if (entry == null) return null;

  if (typeof entry === 'string') {
    return {
      src: entry,
      downloadName: undefined,
      prompt: '',
      kind: 'unknown',
      mimeType: undefined,
      timestamp: Date.now(),
    };
  }

  const src =
    typeof entry.src === 'string'
      ? entry.src
      : typeof entry.url === 'string'
        ? entry.url
        : typeof entry.href === 'string'
          ? entry.href
          : null;
  if (!src) return null;

  return {
    src,
    downloadName:
      typeof entry.downloadName === 'string'
        ? entry.downloadName
        : typeof entry.filename === 'string'
          ? entry.filename
          : undefined,
    prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
    model: typeof entry.model === 'string' ? entry.model : undefined,
    provider: typeof entry.provider === 'string' ? entry.provider : undefined,
    kind: typeof entry.kind === 'string' ? entry.kind : 'unknown',
    mimeType:
      typeof entry.mimeType === 'string'
        ? entry.mimeType
        : typeof entry.type === 'string'
          ? entry.type
          : undefined,
    base64: typeof entry.base64 === 'string' ? entry.base64 : undefined,
    source: typeof entry.source === 'string' ? entry.source : undefined,
    sourceUrl: typeof entry.sourceUrl === 'string' ? entry.sourceUrl : undefined,
    imageId: typeof entry.imageId === 'string' ? entry.imageId : undefined,
    timestamp: Number(entry.timestamp || Date.now()),
  };
}

export function normaliseImageList(
  images: (RawImageEntry | string | null | undefined)[] = []
): ImageEntry[] {
  const out: ImageEntry[] = [];
  for (const entry of images) {
    const normalised = normaliseImageEntry(entry);
    if (normalised) out.push(normalised);
  }
  return out;
}

export const useImageModalStore = defineStore('image-modal', () => {
  const isOpen = ref(false);
  const items = ref<ImageEntry[]>([]);
  const index = ref(0);
  const context = ref<ImageModalContext | null>(null);

  const total = computed(() => items.value.length);
  const current = computed(() => (total.value ? items.value[index.value] : null));

  function open(
    images: (RawImageEntry | string | null | undefined)[] = [],
    startIndex = 0,
    options: ImageModalContext = {}
  ): void {
    const list = normaliseImageList(images);
    if (!list.length) return;
    items.value = list;
    index.value = Math.min(Math.max(Number(startIndex) || 0, 0), list.length - 1);
    context.value = options && typeof options === 'object' ? { ...options } : null;
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  function next(): void {
    if (!total.value) return;
    index.value = (index.value + 1) % total.value;
  }

  function prev(): void {
    if (!total.value) return;
    index.value = (index.value - 1 + total.value) % total.value;
  }

  function setIndex(nextIndex: number): void {
    if (!total.value) return;
    const parsed = Number(nextIndex);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, 0), total.value - 1);
    index.value = clamped;
  }

  function setMetaAt(targetIndex: number, meta: Partial<ImageEntry> = {}): void {
    if (!total.value) return;
    const idx = Math.min(Math.max(Number(targetIndex) || 0, 0), total.value - 1);
    const currentItem = items.value[idx];
    if (!currentItem) return;
    items.value.splice(idx, 1, { ...currentItem, ...meta });
  }

  return {
    isOpen,
    items,
    index,
    current,
    total,
    context,
    open,
    close,
    next,
    prev,
    setIndex,
    setMetaAt,
  };
});

export default { useImageModalStore };
