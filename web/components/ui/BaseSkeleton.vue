<template>
  <div
    class="skeleton"
    :class="[
      `skeleton--${variant}`,
      { 'skeleton--animated': animated, 'skeleton--rounded': rounded },
    ]"
    :style="customStyle"
    :aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

type SkeletonVariant = 'text' | 'card' | 'avatar' | 'button' | 'custom';

interface Props {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  animated?: boolean;
  rounded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'text',
  width: undefined,
  height: undefined,
  animated: true,
  rounded: false,
});

const customStyle = computed(() => {
  const style: Record<string, string> = {};
  if (props.width) style.width = props.width;
  if (props.height) style.height = props.height;
  return style;
});
</script>

<style scoped>
.skeleton {
  background: var(--color-input-bg, rgb(255 255 255 / 6%));
  position: relative;
  overflow: hidden;
}

.skeleton--animated::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 8%) 50%, transparent 100%);
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  transform: translateX(-100%);
}

/* Variants */

.skeleton--text {
  height: 1em;
  border-radius: var(--radius-sm);
  width: 100%;
}

.skeleton--card {
  height: 80px;
  border-radius: var(--radius-md, 8px);
  width: 100%;
}

.skeleton--avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}

.skeleton--button {
  height: 40px;
  width: 120px;
  border-radius: var(--radius-pill);
}

.skeleton--custom {
  border-radius: var(--radius-md, 8px);
}

.skeleton--rounded {
  border-radius: var(--radius-pill);
}

@keyframes skeleton-shimmer {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton--animated::after {
    animation: none;
  }

  .skeleton--animated {
    background: var(--color-input-border, rgb(255 255 255 / 12%));
  }
}
</style>
