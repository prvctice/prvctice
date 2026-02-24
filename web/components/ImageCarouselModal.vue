<template>
  <Teleport to="body">
    <Presence>
      <Motion
        v-if="isOpen"
        id="image-carousel-modal"
        ref="modalRef"
        tag="div"
        class="image-carousel-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Expanded image viewer"
        tabindex="-1"
        data-no-orbit
        :initial="overlayInitial()"
        :animate="overlayAnimate()"
        :exit="overlayExit()"
        :transition="overlayTransition()"
      >
        <div class="carousel-overlay" @click.self="handleBackdropClick">
          <button class="carousel-close" type="button" @click="closeModal" aria-label="Close">
            ×
          </button>

          <Motion
            tag="div"
            class="carousel-content"
            :initial="contentInitial()"
            :animate="contentAnimate()"
            :exit="contentExit()"
            :transition="contentTransition()"
          >
            <button
              class="carousel-prev"
              type="button"
              @click="showPrev"
              aria-label="Previous image"
            >
              &#10094;
            </button>

            <div class="carousel-main">
              <figure class="carousel-figure">
                <img
                  v-if="current"
                  class="carousel-image"
                  :src="current.src"
                  :alt="currentAlt"
                  @load="onImageLoaded"
                />
                <figcaption v-if="currentPrompt" class="carousel-caption">
                  {{ currentPrompt }}
                </figcaption>
              </figure>
            </div>

            <div class="carousel-meta" v-if="total > 0">
              <span class="carousel-counter">{{ displayIndex }} / {{ total }}</span>
              <a
                class="carousel-download"
                :href="current?.src || '#'"
                :download="downloadFilename"
                @click.prevent="downloadCurrent"
                title="Download image"
              >
                &#8681;
              </a>
            </div>

            <button class="carousel-next" type="button" @click="showNext" aria-label="Next image">
              &#10095;
            </button>
          </Motion>
        </div>
      </Motion>
    </Presence>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useImageModalStore, type RawImageEntry } from '@web/stores/imageModal.js';
import { Motion, Presence } from '@motionone/vue';
import type { VariantDefinition, AnimationOptionsWithOverrides } from '@motionone/dom';
import {
  useMotionPreferences,
  motionDurations,
  motionEasings,
} from '@web/composables/useMotion.js';

// Extend Window for carousel functions
declare global {
  interface Window {
    openCarouselModal?: (
      images: unknown[],
      startIndex?: number,
      options?: Record<string, unknown>
    ) => void;
    closeCarouselModal?: () => void;
    attachImageToolbar?: () => void;
  }
}

interface ImageItem {
  src: string;
  prompt?: string;
  mimeType?: string;
  downloadName?: string;
  kind?: 'assistant' | 'user';
}

interface ModalElement extends HTMLElement {
  focus: (options?: FocusOptions) => void;
}

type BridgeOpenFn = (
  images: unknown[],
  startIndex?: number,
  options?: Record<string, unknown>
) => void;
type BridgeCloseFn = () => void;

const store = useImageModalStore();
const { isOpen, current, total, index } = storeToRefs(store);

const modalRef = ref<ModalElement | null>(null);
const lastActiveElement = ref<Element | null>(null);
let previousOverflow: string | null = null;
let bridgeOpen: BridgeOpenFn | null = null;
let bridgeClose: BridgeCloseFn | null = null;

const displayIndex = computed<number>(() => (total.value ? index.value + 1 : 0));
const currentPrompt = computed<string>(() => {
  const item = current.value as ImageItem | null;
  const prompt = item && item.prompt;
  return prompt && prompt.trim().length ? prompt.trim() : '';
});
const currentAlt = computed<string>(() => {
  const item = current.value as ImageItem | null;
  if (!item) return 'Expanded image';
  if (currentPrompt.value) return currentPrompt.value;
  if (item.kind === 'assistant') return 'Assistant generated image';
  if (item.kind === 'user') return 'User supplied image';
  return 'Expanded image';
});
const downloadFilename = computed<string>(() => {
  const item = current.value as ImageItem | null;
  if (!item || !item.src) return 'image.png';
  if (item.downloadName) return item.downloadName;
  const extension = guessExtension(item.mimeType, item.src);
  return `prvctice-image.${extension}`;
});

const { reduceMotion } = useMotionPreferences();

function guessExtension(mimeType: string | undefined, src: string): string {
  if (typeof mimeType === 'string' && mimeType.includes('/')) {
    const subtype = mimeType.split('/')[1];
    if (subtype) return subtype.replace('jpeg', 'jpg');
  }
  if (typeof src === 'string') {
    const lowered = src.toLowerCase();
    if (lowered.includes('.png')) return 'png';
    if (lowered.includes('.webp')) return 'webp';
    if (lowered.includes('.jpg') || lowered.includes('.jpeg')) return 'jpg';
  }
  return 'png';
}

function closeModal(): void {
  store.close();
}

function showNext(): void {
  store.next();
}

function showPrev(): void {
  store.prev();
}

function handleBackdropClick(): void {
  closeModal();
}

function onImageLoaded(): void {
  try {
    modalRef.value?.focus({ preventScroll: true });
  } catch (_) {}
}

function handleKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return;
  if (event.defaultPrevented) return;
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      closeModal();
      break;
    case 'ArrowRight':
    case 'Right':
      event.preventDefault();
      showNext();
      break;
    case 'ArrowLeft':
    case 'Left':
      event.preventDefault();
      showPrev();
      break;
    default:
      break;
  }
}

function downloadCurrent(): void {
  const item = current.value as ImageItem | null;
  if (!item || !item.src) return;
  const link = document.createElement('a');
  link.href = item.src;
  link.download = downloadFilename.value || 'image.png';
  link.rel = 'noopener';
  link.target = '_self';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function overlayInitial(): VariantDefinition {
  return reduceMotion.value ? { opacity: 1 } : { opacity: 0 };
}

function overlayAnimate(): VariantDefinition {
  return { opacity: 1 };
}

function overlayExit(): VariantDefinition {
  return reduceMotion.value ? { opacity: 0 } : { opacity: 0 };
}

function overlayTransition(): AnimationOptionsWithOverrides {
  return reduceMotion.value
    ? { duration: 0 }
    : ({
        duration: motionDurations().short,
        easing: motionEasings().standard,
      } as AnimationOptionsWithOverrides);
}

function contentInitial(): VariantDefinition {
  return reduceMotion.value ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.94, y: 18 };
}

function contentAnimate(): VariantDefinition {
  return reduceMotion.value ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 };
}

function contentExit(): VariantDefinition {
  return reduceMotion.value ? { opacity: 0, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: 14 };
}

function contentTransition(): AnimationOptionsWithOverrides {
  return reduceMotion.value
    ? { duration: 0 }
    : ({
        duration: motionDurations().fade,
        easing: motionEasings().emphasis,
      } as AnimationOptionsWithOverrides);
}

watch(
  isOpen,
  (open: boolean) => {
    if (typeof document === 'undefined') return;
    if (open) {
      lastActiveElement.value = document.activeElement;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        try {
          modalRef.value?.focus({ preventScroll: true });
        } catch (_) {}
      });
    } else {
      document.body.style.overflow = previousOverflow || '';
      previousOverflow = null;
      if (
        lastActiveElement.value &&
        'focus' in lastActiveElement.value &&
        typeof (lastActiveElement.value as HTMLElement).focus === 'function'
      ) {
        try {
          (lastActiveElement.value as HTMLElement).focus();
        } catch (_) {}
      }
      lastActiveElement.value = null;
    }
  },
  { immediate: false }
);

onMounted((): void => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown, { passive: false });
    if (!window.openCarouselModal) {
      bridgeOpen = (images: unknown[], startIndex = 0, options = {}): void => {
        store.open(images as (string | RawImageEntry | null | undefined)[], startIndex, options);
      };
      window.openCarouselModal = bridgeOpen;
    }
    if (!window.closeCarouselModal) {
      bridgeClose = (): void => {
        store.close();
      };
      window.closeCarouselModal = bridgeClose;
    }
    if (!window.attachImageToolbar) {
      window.attachImageToolbar = (): void => {};
    }
  }
});

onBeforeUnmount((): void => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
    if (bridgeClose && window.closeCarouselModal === bridgeClose) {
      delete window.closeCarouselModal;
    }
    if (bridgeOpen && window.openCarouselModal === bridgeOpen) {
      delete window.openCarouselModal;
    }
  }
});
</script>

<style scoped>
.carousel-caption {
  margin-top: 12px;
  color: rgb(255 255 255 / 85%);
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.4;
}

.carousel-figure {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.carousel-image {
  max-width: 96vw;
  max-height: 94vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-lg);
}
</style>
