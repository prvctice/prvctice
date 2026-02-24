<template>
  <div v-if="skills.length > 0" class="loaded-skills-indicator">
    <span class="skills-label">Using:</span>
    <span class="skills-list">{{ skillsText }}</span>
    <span v-if="condensed.length > 0" class="skills-condensed">
      (+{{ condensed.length }} condensed)
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    skills: string[];
    condensed?: string[];
  }>(),
  {
    condensed: () => [],
  }
);

const skillsText = computed(() => props.skills.join(', '));
</script>

<style scoped>
.loaded-skills-indicator {
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.5;
  color: var(--color-text-muted, rgb(255 255 255 / 50%));
  padding-top: var(--space-1, 2px);
  user-select: none;
  transition: opacity var(--duration-short, 150ms) ease;
}

.loaded-skills-indicator:hover {
  opacity: 0.75;
}

.skills-label {
  font-weight: 500;
  margin-right: 2px;
}

.skills-list {
  font-style: italic;
}

.skills-condensed {
  margin-left: 4px;
  opacity: 0.7;
}
</style>
