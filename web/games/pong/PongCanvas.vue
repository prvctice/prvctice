<template>
  <Teleport to="body">
    <Pong v-if="isVisible" @exit="hide" />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent, watch } from 'vue';

const Pong = defineAsyncComponent(() => import('./Pong.vue'));

const isVisible = ref(false);
const handTrackingActive = ref(false);

const DOTMATRIX_REDUCED_OPACITY_LIGHT = 0.15;
const DOTMATRIX_FULL_OPACITY = 1.0;

const LIGHT_THEMES = new Set(['high-contrast', 'vitti', 'light', 'eva', 'share-bear', 'fragile']);

function isLightTheme(): boolean {
  const bodyClasses = document.body.classList;
  for (const theme of LIGHT_THEMES) {
    if (bodyClasses.contains(`${theme}-theme`)) return true;
  }
  return false;
}

function updateDotmatrixOpacity(): void {
  if (!isVisible.value) return;
  // Light themes: dim dotmatrix for contrast (spheres are light colored)
  // Dark themes: full opacity (spheres are already dark, no dimming needed)
  const opacity = isLightTheme() ? DOTMATRIX_REDUCED_OPACITY_LIGHT : DOTMATRIX_FULL_OPACITY;
  if (typeof window.setDotMatrixGameModeOpacity === 'function') {
    window.setDotMatrixGameModeOpacity(opacity);
  }
}

function checkHandTrackingState(): void {
  handTrackingActive.value =
    typeof window.getDotMatrixHandTracking === 'function' && window.getDotMatrixHandTracking();
}

function show(): void {
  hideUIForGame();
  checkHandTrackingState();
  isVisible.value = true;
  window.isGameActive = true;

  // Ensure dotmatrix animation is visible in background
  if (typeof window.startDotMatrix === 'function') {
    window.startDotMatrix(true);
  }
  if (typeof window.setDotMatrixSpheresVisible === 'function') {
    window.setDotMatrixSpheresVisible(true);
  }

  updateDotmatrixOpacity();
}

function hide(): void {
  isVisible.value = false;
  window.isGameActive = false;
  if (typeof window.setDotMatrixGameModeOpacity === 'function') {
    window.setDotMatrixGameModeOpacity(DOTMATRIX_FULL_OPACITY);
  }
  showUIAfterGame();
}

const UI_ELEMENTS_TO_HIDE = [
  '#bar',
  '.input-container',
  'footer',
  '#model-container',
  '#weather-time-widget',
  '#skill-carousel',
  '.footer-bottom-row',
  '.hand-position-indicator',
  '#chat-window',
];

function hideUIForGame(): void {
  UI_ELEMENTS_TO_HIDE.forEach((selector) => {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.dataset.gameHidden = 'true';
      el.style.setProperty('display', 'none', 'important');
    }
  });
  const appShell = document.getElementById('app-shell');
  if (appShell) {
    const thinking = appShell.querySelector('.thinking');
    if (thinking instanceof HTMLElement) {
      thinking.dataset.gameHidden = 'true';
      thinking.style.setProperty('visibility', 'hidden', 'important');
    }
  }
}

function showUIAfterGame(): void {
  UI_ELEMENTS_TO_HIDE.forEach((selector) => {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement && el.dataset.gameHidden === 'true') {
      delete el.dataset.gameHidden;
      el.style.removeProperty('display');
    }
  });
  const appShell = document.getElementById('app-shell');
  if (appShell) {
    const thinking = appShell.querySelector('.thinking');
    if (thinking instanceof HTMLElement && thinking.dataset.gameHidden === 'true') {
      delete thinking.dataset.gameHidden;
      thinking.style.removeProperty('visibility');
    }
  }
  // Force repaint of body background (fixes gradient not rendering after game exit)
  requestAnimationFrame(() => {
    document.body.style.transform = 'translateZ(0)';
    requestAnimationFrame(() => {
      document.body.style.transform = '';
    });
  });
}

declare global {
  interface Window {
    startPongGame?: () => void;
    getDotMatrixHandTracking?: () => boolean;
    setDotMatrixGameModeOpacity?: (opacity: number) => void;
    startDotMatrix?: (force?: boolean) => void;
    setDotMatrixSpheresVisible?: (visible: boolean) => void;
    isGameActive?: boolean;
  }
}

watch(handTrackingActive, updateDotmatrixOpacity);

let handTrackingPollInterval: ReturnType<typeof setInterval> | null = null;
let themeObserver: MutationObserver | null = null;

function handleThemeChange(): void {
  updateDotmatrixOpacity();
}

onMounted(() => {
  window.startPongGame = show;

  handTrackingPollInterval = setInterval(() => {
    if (isVisible.value) {
      const wasActive = handTrackingActive.value;
      checkHandTrackingState();
      if (wasActive !== handTrackingActive.value) {
        updateDotmatrixOpacity();
      }
    }
  }, 500);

  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        handleThemeChange();
        break;
      }
    }
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

onBeforeUnmount(() => {
  if (window.startPongGame === show) {
    window.startPongGame = undefined;
  }
  if (isVisible.value) {
    if (typeof window.setDotMatrixGameModeOpacity === 'function') {
      window.setDotMatrixGameModeOpacity(DOTMATRIX_FULL_OPACITY);
    }
    showUIAfterGame();
  }
  if (handTrackingPollInterval) {
    clearInterval(handTrackingPollInterval);
    handTrackingPollInterval = null;
  }
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
});
</script>
