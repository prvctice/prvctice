<template>
  <Teleport to="body">
    <BlockBreaking v-if="isVisible" @exit="hide" />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';

const BlockBreaking = defineAsyncComponent(() => import('./BlockBreaking.vue'));

const isVisible = ref(false);

const DOTMATRIX_REDUCED_OPACITY_LIGHT = 0.15;
const DOTMATRIX_FULL_OPACITY = 1.0;

const LIGHT_THEMES = new Set(['high-contrast', 'vitti', 'light', 'eva', 'share-bear', 'fragile']);

declare global {
  interface Window {
    startBlockBreakingGame?: () => void;
    isGameActive?: boolean;
    setDotMatrixGameModeOpacity?: (opacity: number) => void;
    startDotMatrix?: (force?: boolean) => void;
    setDotMatrixSpheresVisible?: (visible: boolean) => void;
  }
}

function isLightTheme(): boolean {
  const bodyClasses = document.body.classList;
  for (const theme of LIGHT_THEMES) {
    if (bodyClasses.contains(`${theme}-theme`)) return true;
  }
  return false;
}

function updateDotmatrixOpacity(): void {
  if (!isVisible.value) return;
  const opacity = isLightTheme() ? DOTMATRIX_REDUCED_OPACITY_LIGHT : DOTMATRIX_FULL_OPACITY;
  if (typeof window.setDotMatrixGameModeOpacity === 'function') {
    window.setDotMatrixGameModeOpacity(opacity);
  }
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

function show(): void {
  hideUIForGame();
  isVisible.value = true;
  window.isGameActive = true;

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

let themeObserver: MutationObserver | null = null;

onMounted(() => {
  window.startBlockBreakingGame = show;

  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        updateDotmatrixOpacity();
        break;
      }
    }
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

onBeforeUnmount(() => {
  if (window.startBlockBreakingGame === show) {
    window.startBlockBreakingGame = undefined;
  }
  if (isVisible.value) {
    if (typeof window.setDotMatrixGameModeOpacity === 'function') {
      window.setDotMatrixGameModeOpacity(DOTMATRIX_FULL_OPACITY);
    }
    showUIAfterGame();
  }
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
});
</script>
