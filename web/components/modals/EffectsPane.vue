<template>
  <div class="sp-pane-content">
    <!-- Visual Effects -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Visual effects</h4>
        <p>Tune the visual intensity.</p>
      </div>
      <!-- Assistant style selection -->
      <div class="sp-field">
        <span class="sp-toggle-title">Assistant style</span>
        <div class="sp-theme-grid">
          <button
            type="button"
            :class="{ active: animationSize === 'large' }"
            @click="setAnimationSize('large')"
          >
            Big
          </button>
          <button
            type="button"
            :class="{ active: animationSize === 'normal' }"
            @click="setAnimationSize('normal')"
          >
            Small
          </button>
        </div>
      </div>

      <!-- Quality tier selector -->
      <div class="sp-quality-tier">
        <div class="sp-quality-label">
          <span class="sp-toggle-title">Graphics quality</span>
          <span class="sp-toggle-desc">Adjust visual effects for your device's performance.</span>
        </div>
        <label class="sp-toggle sp-auto-toggle">
          <input type="checkbox" :checked="isAutoTier" @change="toggleAutoDetect" />
          <span class="sp-toggle-track" aria-hidden="true"></span>
          <div class="sp-toggle-copy">
            <span class="sp-toggle-title">Auto-detect</span>
          </div>
        </label>
        <div
          class="sp-tier-buttons"
          :class="{ disabled: isAutoTier }"
          role="radiogroup"
          aria-label="Graphics quality"
        >
          <button
            v-for="tier in tiers"
            :key="tier.value"
            type="button"
            role="radio"
            class="sp-tier-btn"
            :class="{ active: qualityTier === tier.value }"
            :aria-checked="qualityTier === tier.value"
            :disabled="isAutoTier"
            @click="setQualityTier(tier.value)"
          >
            <iconify-icon :icon="tier.icon" aria-hidden="true"></iconify-icon>
            <span>{{ tier.label }}</span>
          </button>
        </div>
      </div>

      <div class="sp-toggle-stack">
        <label class="sp-toggle">
          <input type="checkbox" v-model="canvasEffects" @change="saveVisual" />
          <span class="sp-toggle-track" aria-hidden="true"></span>
          <div class="sp-toggle-copy">
            <span class="sp-toggle-title">Tap ripples</span>
            <span class="sp-toggle-desc">Water ripple effect when tapping the background.</span>
          </div>
        </label>

        <label class="sp-toggle">
          <input type="checkbox" v-model="showRuler" @change="saveVisual" />
          <span class="sp-toggle-track" aria-hidden="true"></span>
          <div class="sp-toggle-copy">
            <span class="sp-toggle-title">Input ruler</span>
            <span class="sp-toggle-desc"
              >Show ruler marks on the input bar when grid is active.</span
            >
          </div>
        </label>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';
import { useQualityTier } from '@web/composables/useQualityTier';
import type { QualityTier } from '@web/graphics/dotmatrix/types';
import { useNotifs } from '@web/composables/useNotifs';

const notifs = useNotifs();

type AnimationSize = 'large' | 'normal';

// Visual effects state
const animationSize = ref<AnimationSize>('normal');
const canvasEffects = ref(true);
const showRuler = ref(true);

// Quality tier
const { tier: qualityTier, isAuto: isAutoTier, setTier, resetToAuto } = useQualityTier();

const tiers = [
  { value: 'ultra' as QualityTier, label: 'Ultra', icon: 'ph:shooting-star' },
  { value: 'high' as QualityTier, label: 'High', icon: 'ph:sparkle' },
  { value: 'medium' as QualityTier, label: 'Medium', icon: 'ph:circle-half' },
  { value: 'low' as QualityTier, label: 'Low', icon: 'ph:leaf' },
];

function setQualityTier(tier: QualityTier): void {
  setTier(tier);
  notifs.push('info', `Graphics quality set to ${tier}`);
}

function toggleAutoDetect(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    resetToAuto();
    notifs.push('info', 'Graphics quality auto-detected');
  } else {
    // Switch to manual mode by setting the current tier explicitly
    setTier(qualityTier.value);
  }
}

function loadVisual(): void {
  // Animation size
  try {
    let sizePref = storage.mirror.get(STORAGE_KEYS.DOTMATRIX_SIZE);
    if (sizePref !== 'normal' && sizePref !== 'large') {
      sizePref = 'normal';
    }
    animationSize.value = sizePref as AnimationSize;
  } catch (_) {}

  // Canvas effects
  try {
    const keepPref = storage.mirror.get(STORAGE_KEYS.DOTMATRIX_KEEP_GLOW);
    canvasEffects.value = keepPref !== 'false';
  } catch (_) {}

  // Show ruler
  try {
    const showRulerPref = storage.mirror.get(STORAGE_KEYS.SHOW_RULER);
    showRuler.value = showRulerPref === null || showRulerPref === 'true';
  } catch (_) {}
}

function setAnimationSize(size: AnimationSize): void {
  animationSize.value = size;
  storage.mirror.set(STORAGE_KEYS.DOTMATRIX_SIZE, size);
  useEventBus().emit('dotmatrix:size-change', { size });
  // Also dispatch DOM event for legacy dotmatrix.js which listens on document
  document.dispatchEvent(new CustomEvent('dotmatrixSizeChange', { detail: { size } }));
  notifs.push('info', 'Assistant style updated');
}

function saveVisual(): void {
  // Canvas effects
  storage.mirror.set(STORAGE_KEYS.DOTMATRIX_KEEP_GLOW, canvasEffects.value ? 'true' : 'false');
  useEventBus().emit('dotmatrix:atmosphere-change', { keep: canvasEffects.value });
  // Also dispatch DOM event for dotmatrix core which listens on document
  document.dispatchEvent(
    new CustomEvent('dotmatrixRipplesChange', { detail: { enabled: canvasEffects.value } })
  );

  // Show ruler
  storage.mirror.set(STORAGE_KEYS.SHOW_RULER, showRuler.value ? 'true' : 'false');

  // Update ruler visibility immediately
  const bar = document.getElementById('bar');
  const gridOverlay = document.getElementById('grid-overlay');
  if (bar && gridOverlay) {
    const gridVisible = !gridOverlay.classList.contains('hidden');
    bar.classList.toggle('show-ruler', gridVisible && showRuler.value);
  }

  notifs.push('info', 'Visuals updated');
}

function loadValues(): void {
  loadVisual();
}

onMounted(() => {
  loadValues();
});

defineExpose({ loadValues });
</script>

<style scoped>
.sp-quality-tier {
  padding: 16px 0;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
}

.sp-quality-label {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.sp-auto-toggle {
  margin-bottom: 12px;
}

.sp-tier-buttons {
  display: flex;
  gap: 8px;
  transition: opacity 0.15s ease;
}

.sp-tier-buttons.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.sp-tier-btn {
  all: unset;
  cursor: pointer;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgb(255 255 255 / 5%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  color: rgb(255 255 255 / 60%);
  transition: all 0.15s ease;
}

.sp-tier-btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 8%);
  border-color: rgb(255 255 255 / 12%);
  color: rgb(255 255 255 / 80%);
}

.sp-tier-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgb(0 125 200 / 60%));
  outline-offset: 2px;
}

.sp-tier-btn.active {
  background: rgb(59 130 246 / 15%);
  border-color: rgb(59 130 246 / 40%);
  color: rgb(255 255 255 / 95%);
}

.sp-tier-btn iconify-icon {
  font-size: 20px;
}
</style>
