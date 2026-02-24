<template>
  <div class="weather-content" @pointermove="onTiltMove" @pointerleave="onPointerLeave">
    <!-- Media overlay layer -->
    <div ref="mediaLayer" :style="mediaOverlayStyle"></div>

    <!-- City label -->
    <div class="weather-city">{{ location.name }}</div>

    <!-- Content area -->
    <div :style="contentStyle">
      <div :style="contentBackdropStyle"></div>
      <div :style="timeRowStyle">
        <span>{{ timeString }}</span>
        <iconify-icon :icon="dayNightIcon" :style="rowIconStyle"></iconify-icon>
      </div>
      <div :style="weatherRowStyle">
        <iconify-icon :icon="weatherIcon" :style="rowIconStyle"></iconify-icon>
        <span>{{ weatherString }}</span>
      </div>
    </div>

    <!-- Media controls -->
    <div class="weather-controls">
      <button class="weather-ctrl-btn" aria-label="Add media" @click.stop="onAddMedia">+</button>
      <button
        class="weather-ctrl-btn"
        aria-label="Remove media"
        v-show="hasCustomMedia"
        @click.stop="onRemoveMedia"
      >
        &ndash;
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useWeatherTime } from '@web/composables/useWeatherTime.js';
import { storage } from '@web/storage/storage.js';

interface MediaData {
  type: 'image' | 'video';
  dataURL: string;
  width?: number;
  height?: number;
}

const { location, timeString, weatherString, isDay, weatherCode } = useWeatherTime({
  domHooks: false,
});

// DOM refs
const mediaLayer = ref<HTMLElement | null>(null);

// Storage keys (same as original widget)
const LS_MEDIA_KEY = 'weatherWidgetMedia';

// State
const hasCustomMedia = ref(false);
const tiltX = ref(0);
const tiltY = ref(0);
const reduceMotion = ref(false);

let tiltFrame: number | null = null;
let motionMediaQuery: MediaQueryList | null = null;
let motionPreferenceHandler: ((event: MediaQueryListEvent) => void) | null = null;

// ==================== ICONS ====================

const dayNightIcon = computed(() =>
  isDay?.value ? 'line-md:sunny-outline-twotone-loop' : 'line-md:moon-twotone-alt-loop'
);

function iconForWeather(code: number | null | undefined): string {
  if (code == null) return 'fa6-solid:cloud';
  if (code === 0) return 'fa6-solid:sun';
  if (code === 1 || code === 2) return 'fa6-solid:cloud-sun';
  if (code === 3) return 'fa6-solid:cloud';
  if (code === 45 || code === 48) return 'fa6-solid:smog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'fa6-solid:cloud-rain';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'fa6-solid:cloud-showers-heavy';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'fa6-regular:snowflake';
  if ([95, 96, 99].includes(code)) return 'fa6-solid:cloud-bolt';
  return 'fa6-solid:cloud';
}

const weatherIcon = computed(() => iconForWeather(weatherCode?.value));

// ==================== PALETTE ====================

const palette = computed(() => {
  if (isDay?.value) {
    return {
      surface:
        'var(--color-widget-day-surface, linear-gradient(165deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.12) 100%))',
      overlay:
        'var(--color-widget-day-overlay, linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(0, 0, 0, 0.08) 100%))',
      subtitleOpacity: 0.6,
      textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      overlayBlend: 'normal',
      contentTint: 'var(--color-widget-day-tint, rgba(0, 0, 0, 0.25))',
    };
  }
  return {
    surface:
      'var(--color-widget-night-surface, linear-gradient(165deg, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0.18) 100%))',
    overlay:
      'var(--color-widget-night-overlay, linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(0, 0, 0, 0.12) 100%))',
    subtitleOpacity: 0.55,
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    overlayBlend: 'normal',
    contentTint: 'var(--color-widget-night-tint, rgba(0, 0, 0, 0.35))',
  };
});

// ==================== STYLES ====================

const mediaOverlayStyle = computed(() => ({
  position: 'absolute' as const,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden' as const,
  zIndex: 0,
  borderRadius: 'inherit',
  background: palette.value.overlay,
  mixBlendMode: (palette.value.overlayBlend || 'screen') as 'normal' | 'screen',
  opacity: 0.68,
  transition:
    'background var(--duration-long, 300ms) var(--motion-ease-standard, ease), opacity var(--duration-medium, 200ms) var(--motion-ease-standard, ease)',
}));

const contentStyle = computed(() => ({
  position: 'absolute' as const,
  bottom: 0,
  left: 0,
  width: '100%',
  padding: 'var(--space-5, 12px) var(--space-5, 12px) var(--space-5, 12px)',
  boxSizing: 'border-box' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'flex-start',
  gap: 'var(--space-1, 2px)',
  fontWeight: 300,
  textAlign: 'left' as const,
  zIndex: 1,
  pointerEvents: 'none' as const,
  background: 'transparent',
  overflow: 'hidden' as const,
}));

const timeRowStyle = computed(() => ({
  fontSize: 'clamp(26px, 2vw, 32px)',
  fontVariantNumeric: 'tabular-nums' as const,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4, 8px)',
  letterSpacing: '-0.01em',
  textShadow: palette.value.textShadow,
  position: 'relative' as const,
  zIndex: 1,
  fontWeight: 300,
}));

const weatherRowStyle = computed(() => ({
  fontSize: 'clamp(10px, 1vw, 11px)',
  opacity: palette.value.subtitleOpacity,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3, 6px)',
  fontWeight: 400,
  letterSpacing: '0.02em',
  position: 'relative' as const,
  zIndex: 1,
}));

const rowIconStyle = computed(() => ({
  fontSize: '0.9em',
  opacity: 0.6,
  filter: 'none',
  transition:
    'opacity var(--duration-medium, 200ms) var(--motion-ease-standard, ease), transform var(--duration-long, 300ms) var(--motion-ease-hover, ease)',
  transform: reduceMotion.value
    ? 'translate3d(0,0,0)'
    : `translate3d(${(tiltX.value * 4).toFixed(2)}px, ${(-tiltY.value * 3).toFixed(2)}px, 0)`,
}));

const contentBackdropStyle = computed(() => {
  const tint = palette.value.contentTint;
  return {
    position: 'absolute' as const,
    inset: 0,
    background: `linear-gradient(180deg, transparent 0%, transparent 20%, ${tint}40 50%, ${tint} 100%)`,
    backdropFilter: 'blur(12px) saturate(85%)',
    WebkitBackdropFilter: 'blur(12px) saturate(85%)',
    maskImage: 'linear-gradient(180deg, transparent 0%, black 40%, black 100%)',
    WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, black 40%, black 100%)',
    pointerEvents: 'none' as const,
    zIndex: 0,
  };
});

// ==================== TILT EFFECT ====================

function onTiltMove(event: PointerEvent): void {
  if (reduceMotion.value) return;
  if (event.pointerType === 'touch') return;
  if (event.buttons > 0) return;

  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1);
  const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1);
  const clampedX = Math.max(-1, Math.min(1, x));
  const clampedY = Math.max(-1, Math.min(1, y));

  if (tiltFrame != null) cancelAnimationFrame(tiltFrame);
  tiltFrame = requestAnimationFrame(() => {
    tiltX.value = clampedX;
    tiltY.value = clampedY;
    tiltFrame = null;
  });
}

function onPointerLeave(): void {
  if (tiltFrame != null) {
    cancelAnimationFrame(tiltFrame);
    tiltFrame = null;
  }
  tiltX.value = 0;
  tiltY.value = 0;
}

// ==================== MEDIA ====================

function applyDefaultMedia(): void {
  const layer = mediaLayer.value;
  if (!layer || layer.children.length) return;

  const video = document.createElement('video');
  video.src = import.meta.env.BASE_URL + 'images/fishLoop.mp4';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'cover' });
  layer.appendChild(video);
  video.onloadedmetadata = () => {
    video.play().catch(() => {});
  };
}

function applySavedMedia(obj: MediaData | null): void {
  const layer = mediaLayer.value;
  if (!layer || !obj) return;
  layer.innerHTML = '';

  if (obj.type === 'image') {
    const img = new Image();
    img.src = obj.dataURL;
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' });
    layer.appendChild(img);
  } else if (obj.type === 'video') {
    const v = document.createElement('video');
    v.src = obj.dataURL;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    Object.assign(v.style, { width: '100%', height: '100%', objectFit: 'cover' });
    layer.appendChild(v);
    v.onloadedmetadata = () => {
      v.play().catch(() => {});
    };
  }
}

function readSavedMedia(): MediaData | null {
  try {
    return storage.mirror.getJSON(LS_MEDIA_KEY) as MediaData | null;
  } catch (_) {
    return null;
  }
}

function saveMedia(obj: MediaData): void {
  storage.mirror.setJSON(LS_MEDIA_KEY, obj);
}

function clearMedia(): void {
  storage.mirror.remove(LS_MEDIA_KEY);
}

function onAddMedia(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (file) handleMediaFile(file);
  });
  input.click();
}

function handleMediaFile(file: File): void {
  const type = file.type || '';
  const layer = mediaLayer.value;
  if (!layer) return;
  layer.innerHTML = '';

  if (type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result as string;
      const img = new Image();
      img.src = dataURL;
      Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' });
      layer.appendChild(img);
      img.onload = () => {
        saveMedia({ type: 'image', dataURL, width: img.naturalWidth, height: img.naturalHeight });
        hasCustomMedia.value = true;
      };
    };
    reader.readAsDataURL(file);
  } else if (type.startsWith('video/')) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result as string;
      const v = document.createElement('video');
      v.src = dataURL;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      Object.assign(v.style, { width: '100%', height: '100%', objectFit: 'cover' });
      layer.appendChild(v);
      v.onloadedmetadata = () => {
        const maxSecs =
          (window as { AppSettings?: { weatherWidgetVideoMaxSecs?: number } }).AppSettings
            ?.weatherWidgetVideoMaxSecs ?? 30;
        if (v.duration > maxSecs) {
          alert('Please select a shorter video.');
          layer.innerHTML = '';
          return;
        }
        saveMedia({ type: 'video', dataURL, width: v.videoWidth, height: v.videoHeight });
        hasCustomMedia.value = true;
        v.play().catch(() => {});
      };
    };
    reader.readAsDataURL(file);
  } else {
    alert('Unsupported file type.');
  }
}

function onRemoveMedia(): void {
  clearMedia();
  const layer = mediaLayer.value;
  if (layer) layer.innerHTML = '';
  applyDefaultMedia();
  hasCustomMedia.value = false;
}

// ==================== MOTION PREFERENCE ====================

function initMotionPreference(): void {
  if (typeof window === 'undefined') return;
  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduceMotion.value = motionMediaQuery.matches;
  motionPreferenceHandler = (e: MediaQueryListEvent) => {
    reduceMotion.value = e.matches;
    if (e.matches) onPointerLeave();
  };
  motionMediaQuery.addEventListener('change', motionPreferenceHandler);
}

// ==================== LIFECYCLE ====================

onMounted(() => {
  initMotionPreference();

  // Media
  const savedMedia = readSavedMedia();
  if (savedMedia) {
    applySavedMedia(savedMedia);
    hasCustomMedia.value = true;
  } else {
    applyDefaultMedia();
  }
});

onBeforeUnmount(() => {
  if (motionMediaQuery && motionPreferenceHandler) {
    motionMediaQuery.removeEventListener('change', motionPreferenceHandler);
    motionMediaQuery = null;
    motionPreferenceHandler = null;
  }

  if (tiltFrame != null) {
    cancelAnimationFrame(tiltFrame);
    tiltFrame = null;
  }
});
</script>

<style scoped>
.weather-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--color-widget-text);
  background: var(
    --color-widget-day-surface,
    linear-gradient(165deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.12) 100%)
  );
}

.weather-controls {
  position: absolute;
  top: 4px;
  right: 28px;
  display: flex;
  gap: 2px;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.weather-content:hover .weather-controls {
  opacity: 1;
}

.weather-ctrl-btn {
  background: transparent;
  border: none;
  color: var(--color-widget-btn, rgba(255, 255, 255, 0.7));
  font-size: var(--font-size-sm, 14px);
  cursor: pointer;
  line-height: 1;
  padding: var(--space-2, 4px);
  border-radius: var(--radius-sm, 4px);
  transition: color 0.15s ease;
  font-weight: 300;
}

.weather-ctrl-btn:hover {
  color: var(--color-widget-text, #fff);
}

.weather-city {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.5;
  z-index: 2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}
</style>
