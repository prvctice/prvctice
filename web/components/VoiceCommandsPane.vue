<template>
  <BaseSidePanel
    ref="panelRef"
    id="voice-commands"
    title="Voice Commands"
    subtitle="Speak these phrases to control Prvctice hands-free."
    aria-label="Voice Commands Reference"
    :show-close-button="true"
    :hides-on-open="['notes', 'help', 'about']"
    global-name="VoiceCommands"
    @open="loadContent"
  >
    <div class="voice-commands-body" v-html="renderedContent"></div>
  </BaseSidePanel>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import BaseSidePanel from './BaseSidePanel.vue';

const panelRef = ref<InstanceType<typeof BaseSidePanel> | null>(null);
const renderedContent = ref('');

async function loadContent(): Promise<void> {
  // Only load once
  if (renderedContent.value) return;

  try {
    const response = await fetch(import.meta.env.BASE_URL + 'voice-commands.md');
    const markdown = await response.text();

    // Parse and sanitize the markdown
    if (window.marked && window.DOMPurify) {
      renderedContent.value = window.DOMPurify.sanitize(window.marked.parse(markdown));
    } else {
      // Fallback: escape HTML and wrap in pre
      renderedContent.value =
        '<pre>' +
        markdown.replace(
          /[<>&]/g,
          (c: string) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c
        ) +
        '</pre>';
    }
  } catch (err) {
    renderedContent.value = '<p>Could not load voice command documentation.</p>';
  }
}

// Intent coordinator registration for voice commands
const { registerTarget, unregisterTarget } = useIntentCoordinator();

onMounted(() => {
  registerTarget('voiceCommands', {
    zone: null,
    actions: ['toggle', 'set'],
    handler: (intent) => {
      if (intent.action === 'toggle') {
        panelRef.value?.toggle();
      } else if (intent.action === 'set') {
        if (intent.value === true || intent.value === 'open') {
          panelRef.value?.open();
        } else {
          panelRef.value?.close();
        }
      }
    },
  });
});

onBeforeUnmount(() => {
  unregisterTarget('voiceCommands');
});

// Expose panel controls
defineExpose({
  open: (force?: boolean, options?: { skipAnimation?: boolean }) =>
    panelRef.value?.open(force, options),
  close: (options?: { force?: boolean; skipAnimation?: boolean; keepSplitMode?: boolean }) =>
    panelRef.value?.close(options),
  toggle: (options?: { force?: boolean; skipAnimation?: boolean; keepSplitMode?: boolean }) =>
    panelRef.value?.toggle(options),
  get visible() {
    return panelRef.value?.visible;
  },
});
</script>
