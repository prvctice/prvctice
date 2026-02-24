<template>
  <section
    class="user-prompt-block"
    :class="{ 'is-expanded': expanded, 'is-clamped': showToggle }"
    :style="styleVars"
  >
    <div ref="contentWrap" class="user-prompt-block__content">
      <RichContent :markdown="markdown" />
    </div>

    <div v-if="showToggle" class="user-prompt-block__controls">
      <button
        type="button"
        class="user-prompt-block__toggle"
        @click="toggle"
        :aria-expanded="expanded"
      >
        <span>{{ expanded ? collapseLabel : expandLabel }}</span>
        <svg class="user-prompt-block__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import RichContent from './RichContent.vue';

const props = withDefaults(
  defineProps<{
    markdown?: string;
    collapsedPixels?: number;
    expandLabel?: string;
    collapseLabel?: string;
  }>(),
  {
    markdown: '',
    collapsedPixels: 240,
    expandLabel: 'Expand',
    collapseLabel: 'Collapse',
  }
);

const contentWrap = ref<HTMLElement | null>(null);
const expanded = ref(false);
const showToggle = ref(false);

const styleVars = computed(() => ({
  '--user-prompt-collapsed-height': `${props.collapsedPixels}px`,
}));

let raf: number | null = null;
function measure(): void {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = null;
  }
  raf = requestAnimationFrame(() => {
    raf = null;
    const el = contentWrap.value;
    if (!el) return;
    const needsClamp = el.scrollHeight - 2 > props.collapsedPixels;
    showToggle.value = needsClamp;
    if (!needsClamp) {
      expanded.value = false;
    }
  });
}

function toggle(): void {
  expanded.value = !expanded.value;
}

onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  if (raf) cancelAnimationFrame(raf);
});

watch(
  () => props.markdown,
  () => {
    expanded.value = false;
    nextTick(() => measure());
  }
);
</script>
