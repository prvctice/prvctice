<template>
  <div class="message-tools">
    <button class="note-button" @click.prevent.stop="onNote">
      <iconify-icon v-if="!noted" icon="ph:arrow-left"></iconify-icon>
      <iconify-icon v-else icon="ph:check"></iconify-icon>
    </button>
    <button class="copy-button" @click.prevent.stop="onCopy">
      <iconify-icon v-if="!copied" icon="ph:copy-simple"></iconify-icon>
      <iconify-icon v-else icon="ph:check"></iconify-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';

// Extend Window for notes integration
declare global {
  interface Window {
    appendAssistantBubbleToNotes?: (el: HTMLElement) => boolean | Promise<boolean>;
  }
}

interface Props {
  bubbleEl: HTMLElement;
}

const props = defineProps<Props>();

const copied = ref(false);
const noted = ref(false);
let noteTimer: ReturnType<typeof setTimeout> | null = null;

function flagNoted(): void {
  noted.value = true;
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    noted.value = false;
    noteTimer = null;
  }, 1500);
}

function getTextWithLinks(): string {
  try {
    const content = props.bubbleEl?.querySelector?.('.message-content') as HTMLElement | null;
    if (!content) return '';
    let text = content.innerText.trim();
    content.querySelectorAll('a').forEach((a: Element) => {
      const anchor = a as HTMLAnchorElement;
      if (!text.includes(anchor.href)) text += '\n' + anchor.href;
    });
    return text;
  } catch (_) {
    return '';
  }
}

function onNote(): void {
  try {
    if (typeof window.appendAssistantBubbleToNotes !== 'function') return;
    const result = window.appendAssistantBubbleToNotes(props.bubbleEl);
    if (result && typeof (result as Promise<boolean>).then === 'function') {
      (result as Promise<boolean>)
        .then((ok) => {
          if (ok !== false) flagNoted();
        })
        .catch(() => {});
    } else if (result !== false) {
      flagNoted();
    }
  } catch (_) {}
}

async function onCopy(): Promise<void> {
  try {
    const text = getTextWithLinks();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch (_) {}
}

onBeforeUnmount(() => {
  if (noteTimer) clearTimeout(noteTimer);
});
</script>
