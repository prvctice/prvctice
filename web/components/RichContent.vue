<template>
  <div ref="root"></div>
</template>

<script setup lang="ts">
import { onMounted, onUpdated, onBeforeUnmount, ref, watch } from 'vue';

interface MarkedLib {
  parse: (md: string) => string;
}

interface DOMPurifyLib {
  sanitize: (html: string) => string;
}

const props = withDefaults(
  defineProps<{
    markdown?: string;
  }>(),
  {
    markdown: '',
  }
);

const root = ref<HTMLElement | null>(null);

function addColorSwatches(html: string): string {
  try {
    return String(html).replace(/(#[0-9a-fA-F]{6})/g, (m) => {
      return `<span class="color-swatch" style="display:inline-block;width:12px;height:12px;background-color:${m};margin-right:4px;vertical-align:middle;"></span>${m}`;
    });
  } catch (_) {
    return html;
  }
}

function escapeHtml(str: string): string {
  return String(str).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] || c
  );
}

function toHtml(md: string | undefined | null): string {
  try {
    let html = String(md ?? '');
    const marked = (window as { marked?: MarkedLib }).marked;
    if (marked && typeof marked.parse === 'function') {
      html = marked.parse(html);
    }
    // Add color swatches BEFORE sanitization so DOMPurify validates the injected spans
    html = addColorSwatches(html);
    const DOMPurify = (window as { DOMPurify?: DOMPurifyLib }).DOMPurify;
    if (DOMPurify) {
      return DOMPurify.sanitize(html);
    }
    // Escape HTML if DOMPurify unavailable to prevent XSS
    return escapeHtml(html);
  } catch (_) {
    return escapeHtml(String(md ?? ''));
  }
}

function enhance(el: HTMLElement | null): void {
  if (!el) return;
  try {
    el.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  } catch (_) {}
  // Syntax highlighting removed by request; keep links only.
}

let enhanceScheduled = false;
function scheduleEnhance(el: HTMLElement | null): void {
  if (!el) return;
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  requestAnimationFrame(() => {
    enhanceScheduled = false;
    try {
      enhance(el);
    } catch (_) {}
  });
}

function renderMarkdown(): void {
  const el = root.value;
  if (!el) return;
  el.innerHTML = toHtml(props.markdown);
  scheduleEnhance(el);
}

// Throttle rendering during streaming (~80ms) with leading-edge immediate render
const RENDER_THROTTLE = 80;
let lastRenderTime = 0;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.markdown,
  () => {
    const now = Date.now();
    if (trailingTimer !== null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    if (now - lastRenderTime >= RENDER_THROTTLE) {
      lastRenderTime = now;
      renderMarkdown();
    } else {
      trailingTimer = setTimeout(
        () => {
          trailingTimer = null;
          lastRenderTime = Date.now();
          renderMarkdown();
        },
        RENDER_THROTTLE - (now - lastRenderTime)
      );
    }
  },
  { immediate: true }
);

onMounted(() => renderMarkdown());
onBeforeUnmount(() => {
  if (trailingTimer !== null) clearTimeout(trailingTimer);
});
onUpdated(() => scheduleEnhance(root.value));
</script>
