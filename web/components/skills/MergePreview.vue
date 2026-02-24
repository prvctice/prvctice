<template>
  <Teleport to="body">
    <Transition name="merge-fade">
      <div v-if="isVisible" class="merge-preview" :class="{ 'merge-preview--ready': isReady }">
        <!-- Clean loading circle at midpoint -->
        <div class="merge-preview__spinner-container" :style="spinnerContainerStyle">
          <svg class="merge-preview__spinner" viewBox="0 0 48 48">
            <!-- Background circle -->
            <circle
              class="merge-preview__spinner-bg"
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke-width="3"
            />
            <!-- Progress circle -->
            <circle
              class="merge-preview__spinner-progress"
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke-width="3"
              :stroke-dasharray="spinnerCircumference"
              :stroke-dashoffset="spinnerOffset"
            />
            <!-- Spinning indicator when not yet ready -->
            <circle
              v-if="!isReady"
              class="merge-preview__spinner-indicator"
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke-width="3"
              stroke-dasharray="31 94"
            />
          </svg>
          <!-- Mode label shown when ready -->
          <span v-if="isReady" class="merge-preview__mode-label">{{ modeLabel }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import { useSkillPhysics, type CombinationPreviewState } from '@web/composables/useSkillPhysics';
import type { CombineMode } from '@web/types/skills';
import { isLiquidMergeEnabled } from '@web/utils/liquidMerge';

const physics = useSkillPhysics();

// Track if liquid merge is animating (hides spinner during animation)
const isLiquidMerging = ref(false);

// Track animation frame for smooth updates
const previewState = ref<CombinationPreviewState | null>(null);
let rafId: number | null = null;

function updatePreview(): void {
  previewState.value = physics.getCombinationPreview();
  if (physics.isShowingCombinationPreview.value) {
    rafId = requestAnimationFrame(updatePreview);
  }
}

// Watch for preview state changes
watch(
  () => physics.isShowingCombinationPreview.value,
  (showing) => {
    if (showing && rafId === null) {
      rafId = requestAnimationFrame(updatePreview);
    } else if (!showing && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      previewState.value = null;
    }
  },
  { immediate: true }
);

// Watch for merge completion to hide spinner when liquid animation starts
watch(
  () => previewState.value?.holdProgress,
  (progress) => {
    if (progress !== undefined && progress >= 1 && isLiquidMergeEnabled()) {
      isLiquidMerging.value = true;
    } else if (progress === 0 || progress === undefined) {
      isLiquidMerging.value = false;
    }
  }
);

// Computed: visibility - hide during liquid merge animation
const isVisible = computed(() => {
  if (isLiquidMerging.value) return false;
  return previewState.value?.isShowingPreview ?? false;
});

// Computed: ready state (pills are touching)
const isReady = computed(() => {
  return previewState.value?.proximity?.isReady ?? false;
});

// Computed: hold progress (0-1)
const holdProgress = computed(() => {
  return previewState.value?.holdProgress ?? 0;
});

// Computed: combine mode
const combineMode = computed((): CombineMode | null => {
  const mode = previewState.value?.proximity?.combineMode;
  return mode === false ? null : (mode ?? null);
});

// Computed: mode label
const modeLabel = computed(() => {
  switch (combineMode.value) {
    case 'chain':
      return 'CHAIN';
    case 'pipe':
      return 'PIPE';
    case 'modify':
      return 'MODIFY';
    default:
      return '';
  }
});

// Computed: spinner container position (centered at midpoint)
const spinnerContainerStyle = computed(() => {
  const midpoint = previewState.value?.proximity?.midpoint;
  if (!midpoint) return { display: 'none' } as const;

  return {
    position: 'fixed' as const,
    left: `${midpoint.x}px`,
    top: `${midpoint.y}px`,
    transform: 'translate(-50%, -50%)',
  };
});

// Spinner ring calculations (radius 20, circumference = 2 * PI * 20)
const spinnerCircumference = computed(() => 2 * Math.PI * 20);
const spinnerOffset = computed(() => {
  return spinnerCircumference.value * (1 - holdProgress.value);
});
</script>

<style scoped>
.merge-preview {
  pointer-events: none;
  z-index: 2000;
}

.merge-preview__spinner-container {
  position: fixed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  animation: spinner-appear 150ms ease-out forwards;
}

@keyframes spinner-appear {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.7);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.merge-preview__spinner {
  width: 48px;
  height: 48px;
}

.merge-preview__spinner-bg {
  stroke: var(--color-merge-progress-bg, rgb(255 255 255 / 15%));
}

.merge-preview__spinner-progress {
  stroke: var(--color-merge-progress-fill, rgb(100 200 255 / 90%));
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dashoffset 50ms linear;
}

.merge-preview__spinner-indicator {
  stroke: var(--color-merge-indicator, rgb(255 255 255 / 40%));
  stroke-linecap: round;
  transform-origin: center;
  animation: spinner-rotate 1s linear infinite;
}

@keyframes spinner-rotate {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.merge-preview__mode-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-merge-mode, rgb(255 255 255 / 80%));
  text-transform: uppercase;
  letter-spacing: 1px;
  animation: label-appear 150ms ease-out forwards;
}

@keyframes label-appear {
  0% {
    opacity: 0;
    transform: translateY(-4px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.merge-preview--ready .merge-preview__spinner-progress {
  stroke: var(--color-merge-ready-fill, rgb(100 255 150 / 100%));
}

.merge-preview--ready .merge-preview__spinner-container {
  filter: drop-shadow(0 0 12px var(--color-merge-ready-glow, rgb(100 255 150 / 50%)));
}

/* Fade transition for when liquid merge takes over */
.merge-fade-enter-active,
.merge-fade-leave-active {
  transition: opacity 100ms ease-out;
}

.merge-fade-enter-from,
.merge-fade-leave-to {
  opacity: 0;
}
</style>
