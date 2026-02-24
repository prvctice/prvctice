<template>
  <BaseSidePanel
    ref="panelRef"
    id="about"
    title="About"
    subtitle="Prvctice is a one-of-a-kind research tool built for creative work."
    aria-label="About Prvctice"
    :show-close-button="true"
    :hides-on-open="['notes', 'help', 'voice-commands']"
    global-name="About"
  >
    <section class="about-section">
      <div class="about-section-content">
        <p>
          I built Prvctice for my own work as a Creative Director and Artist. Crafted around a
          unique cultural knowledge base and methodology, it delivers a more thoughtful and useful
          approach than the average search.
        </p>
        <p>
          Every decision was made to give the user more control over their work. It's fully
          customizable and open source, allowing you to adapt Prvctice to your own processes.
        </p>
      </div>
    </section>

    <section class="about-section">
      <h3>Links</h3>
      <div class="about-section-content">
        <p>
          To learn more, visit
          <a href="https://prvctice.com" target="_blank" rel="noopener">prvctice.com</a>
        </p>
        <p>
          <a href="https://github.com/prvctice/prvctice" target="_blank" rel="noopener">GitHub</a>
        </p>
        <p>
          <a href="https://buymeacoffee.com/timmoore" target="_blank" rel="noopener"
            >Buy me a cup of coffee</a
          >
        </p>
      </div>
    </section>

    <section class="about-section">
      <h3>Special Thanks &amp; Attribution</h3>
      <div class="about-section-content about-attribution">
        <p>
          The upgraded lighting was possible after viewing
          <a href="https://x.com/0xca0a/status/1977379467573023171" target="_blank" rel="noopener"
            >@0xca0a's sample project</a
          >.
        </p>
        <p>
          Thank you to Puneet,
          <a href="https://codepen.io/VoXelo/pen/YPwJwbz" target="_blank" rel="noopener">@VoXelo</a
          >, for sharing how they made the water ripple interaction.
        </p>
        <p>
          Notification toasts powered by
          <a href="https://github.com/hiaaryan/sileo" target="_blank" rel="noopener">Sileo</a>
          by Aaryan Hirani.
        </p>
        <p>
          Liquid glass displacement effect inspired by
          <a href="https://codepen.io/jh3y" target="_blank" rel="noopener">Jhey Tompkins</a>.
        </p>
      </div>
    </section>

    <div class="about-version">
      <span>v{{ appVersion }}</span>
    </div>
  </BaseSidePanel>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseSidePanel from './BaseSidePanel.vue';

declare const __APP_VERSION__: string;
const appVersion = __APP_VERSION__;

const panelRef = ref<InstanceType<typeof BaseSidePanel> | null>(null);

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
