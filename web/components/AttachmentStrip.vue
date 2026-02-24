<template>
  <div class="image-strip">
    <div
      v-for="(img, idx) in normalised"
      :key="img.src + '-' + idx"
      class="attachment-container"
      title="Click to expand"
      style="cursor: pointer"
      @click="openCarousel(idx)"
    >
      <img class="attachment-image" :src="img.src" :alt="img.alt" loading="lazy" decoding="async" />
      <a
        v-if="img.source && img.kind === 'moodboard'"
        class="source-badge"
        :href="img.sourceUrl || '#'"
        target="_blank"
        rel="noopener noreferrer"
        :title="img.source"
        @click.stop
      >
        {{ abbreviateSource(img.source) }}
      </a>
      <div class="image-toolbar" role="group" aria-label="Image tools">
        <button
          type="button"
          title="Open in new tab"
          aria-label="Open in new tab"
          @click.stop="openInNewTab(img.src)"
        >
          <iconify-icon icon="ph:arrow-square-out"></iconify-icon>
        </button>
        <button
          type="button"
          title="Download"
          aria-label="Download"
          @click.stop="downloadImage(img, idx)"
        >
          <iconify-icon icon="ph:download-simple"></iconify-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  useImageModalStore,
  normaliseImageList,
  type RawImageEntry,
} from '@web/stores/imageModal.js';

interface ImageItem {
  src: string;
  alt?: string;
  prompt?: string;
  mimeType?: string;
  downloadName?: string;
  source?: string;
  sourceUrl?: string;
  kind?: string;
}

interface Props {
  images?: (string | RawImageEntry | null | undefined)[];
}

const props = withDefaults(defineProps<Props>(), {
  images: () => [],
});

const SOURCE_ABBREVIATIONS: Record<string, string> = {
  'Met Museum': 'Met',
  'Art Institute of Chicago': 'AIC',
  Europeana: 'Europeana',
  'Library of Congress': 'LoC',
  Smithsonian: 'SI',
  TMDB: 'TMDB',
  Discogs: 'Discogs',
};

function abbreviateSource(source: string): string {
  return SOURCE_ABBREVIATIONS[source] || source;
}

const modal = useImageModalStore();
const normalised = computed<ImageItem[]>(() => {
  const list = normaliseImageList(props.images) as ImageItem[];
  return list.map((item) => ({
    ...item,
    alt: item.prompt && item.prompt.trim() ? item.prompt : 'Image attachment',
  }));
});

function openCarousel(startIndex: number): void {
  try {
    if (!normalised.value.length) return;
    modal.open(normalised.value, startIndex, { source: 'chat-message' });
  } catch (_) {}
}

function openInNewTab(src: string): void {
  if (!src) return;
  try {
    window.open(src, '_blank', 'noopener');
  } catch (_) {}
}

function downloadImage(img: ImageItem, idx: number): void {
  if (!img || !img.src) return;
  const link = document.createElement('a');
  link.href = img.src;
  const extension = inferExtension(img.mimeType, img.src);
  const fallbackName = `prvctice-image-${(idx || 0) + 1}.${extension}`;
  link.download = img.downloadName || fallbackName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function inferExtension(mimeType: string | undefined, src: string): string {
  if (mimeType && typeof mimeType === 'string') {
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  }
  if (typeof src === 'string') {
    const lowered = src.toLowerCase();
    if (lowered.includes('.png')) return 'png';
    if (lowered.includes('.webp')) return 'webp';
    if (lowered.includes('.jpg') || lowered.includes('.jpeg')) return 'jpg';
  }
  return 'png';
}
</script>

<style scoped>
.attachment-container {
  position: relative;
}

.source-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  padding: 2px 6px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.2;
  color: #fff;
  text-decoration: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 4px;
  pointer-events: auto;
  opacity: 0.85;
  transition: opacity 0.15s ease;
  z-index: 1;
}

.source-badge:hover {
  opacity: 1;
  color: #fff;
}
</style>
