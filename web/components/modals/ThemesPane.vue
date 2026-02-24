<template>
  <div class="sp-pane-content">
    <!-- Theme Selection with visual preview -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Theme</h4>
        <p>Pick a vibe.</p>
      </div>
      <div class="sp-theme-grid">
        <button
          v-for="t in themes"
          :key="t"
          class="sp-theme-btn"
          :class="{ active: t === currentTheme }"
          :style="getThemeStyle(t)"
          @click="applyTheme(t)"
        >
          <span class="sp-theme-preview" :style="getPreviewStyle(t)">
            <span class="sp-mini-accent" :style="getAccentStyle(t)"></span>
            <span class="sp-mini-bubble" :style="getBubbleStyle(t)">
              <span class="sp-mini-text" :style="getTextStyle(t)"></span>
              <span class="sp-mini-text short" :style="getTextStyle(t)"></span>
            </span>
            <span class="sp-mini-input" :style="getInputStyle(t)"></span>
          </span>
          <span class="sp-theme-label">{{ getLabel(t) }}</span>
          <iconify-icon
            v-if="t === currentTheme"
            icon="ph:check-bold"
            class="sp-theme-check"
          ></iconify-icon>
        </button>
      </div>
      <p class="sp-tip">
        <iconify-icon icon="ph:keyboard"></iconify-icon>
        Double-tap the input bar to cycle themes
      </p>
    </article>

    <!-- Workspace Save/Load -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Workspace</h4>
        <p>Save or restore your session.</p>
      </div>
      <div class="sp-workflow-actions">
        <button class="sp-workflow-btn" @click="handleSaveWorkflow">
          <iconify-icon icon="ph:floppy-disk"></iconify-icon>
          <span>Save Workflow</span>
        </button>
        <button class="sp-workflow-btn" @click="handleLoadWorkflow">
          <iconify-icon icon="ph:folder-open"></iconify-icon>
          <span>Load Workflow</span>
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useTheme } from '@web/composables/useTheme.js';
import { saveWorkspaceToFile, promptWorkspaceImport } from '@web/services/workspace.js';
import { useNotifs } from '@web/composables/useNotifs';

interface ThemeColors {
  bg: string;
  bubble: string;
  input: string;
  accent: string;
  text: string;
}

interface AppSettings {
  themeDisplayNames?: Record<string, string>;
}

const notifs = useNotifs();
const { themes, setTheme, getCurrent } = useTheme();

// Theme state
const currentTheme = computed(() => getCurrent());

// Theme preview colors - mini UI mockup colors (based on actual theme CSS)
const themeColors: Record<string, ThemeColors> = {
  light: { bg: '#cbebff', bubble: '#ffffff', input: '#b8d5ea', accent: '#3b82f6', text: '#332f2c' },
  night: { bg: '#0e0f09', bubble: '#1a1b14', input: '#15160f', accent: '#d3b33a', text: '#cccccc' },
  'vera-baxter': {
    bg: '#030e71',
    bubble: '#0b0c0d',
    input: '#030847',
    accent: '#81d6ff',
    text: '#ffffff',
  },
  vitti: { bg: '#c8cfca', bubble: '#d0d7d2', input: '#a8afaa', accent: '#121212', text: '#121212' },
  'share-bear': {
    bg: '#d1c7ec',
    bubble: '#e0d8f2',
    input: '#c0b6dc',
    accent: '#db8eff',
    text: '#121212',
  },
  eva: { bg: '#6fafd2', bubble: '#8bbfe0', input: '#5ba0c4', accent: '#b8a602', text: '#332f2c' },
  fragile: {
    bg: '#c1ced8',
    bubble: '#d0dae2',
    input: '#adbbc6',
    accent: '#0076c0',
    text: '#000000',
  },
  'high-contrast': {
    bg: '#ffffff',
    bubble: '#f5f5f5',
    input: '#e8e8e8',
    accent: '#0066cc',
    text: '#000000',
  },
  custom: {
    bg: '#0b1a2a',
    bubble: '#1a2a3a',
    input: '#0a1520',
    accent: '#4fd8ff',
    text: '#ffffff',
  },
};

function getLabel(t: string): string {
  const appSettings = (window as { AppSettings?: AppSettings }).AppSettings;
  const map: Record<string, string> = {
    light: 'Light',
    night: 'Night',
    'vera-baxter': 'Vera Baxter',
    vitti: 'Vitti',
    'share-bear': 'Share Bear',
    eva: 'EVA',
    fragile: 'Fragile',
    'high-contrast': 'High Contrast',
    custom: 'Custom',
    ...(appSettings?.themeDisplayNames || {}),
  };
  return map[t] || t;
}

function getThemeStyle(t: string): Record<string, string> {
  const colors = themeColors[t] || { bg: '#1a1a1a', accent: '#64b5f6' };
  return {
    '--theme-bg': colors.bg,
    '--theme-accent': colors.accent,
  };
}

function getPreviewStyle(t: string): Record<string, string> {
  const colors = themeColors[t] || {
    bg: '#1a1a1a',
    bubble: '#2a2a2a',
    input: '#151515',
    accent: '#64b5f6',
    text: '#cccccc',
  };
  return {
    background: colors.bg,
  };
}

function getBubbleStyle(t: string): Record<string, string> {
  const colors = themeColors[t] || {
    bg: '#1a1a1a',
    bubble: '#2a2a2a',
    input: '#151515',
    accent: '#64b5f6',
    text: '#cccccc',
  };
  return {
    background: colors.bubble,
  };
}

function getInputStyle(t: string): Record<string, string> {
  const colors = themeColors[t] || {
    bg: '#1a1a1a',
    bubble: '#2a2a2a',
    input: '#151515',
    accent: '#64b5f6',
    text: '#cccccc',
  };
  return {
    background: colors.input,
  };
}

function getTextStyle(t: string): Record<string, string> {
  const colors = themeColors[t] || {
    bg: '#1a1a1a',
    bubble: '#2a2a2a',
    input: '#151515',
    accent: '#64b5f6',
    text: '#cccccc',
  };
  return {
    background: colors.text,
  };
}

function getAccentStyle(t: string): Record<string, string> {
  const colors = themeColors[t] || {
    bg: '#1a1a1a',
    bubble: '#2a2a2a',
    input: '#151515',
    accent: '#64b5f6',
    text: '#cccccc',
  };
  return {
    background: colors.accent,
  };
}

function applyTheme(t: string): void {
  setTheme(t);
  notifs.push('info', `Theme: ${getLabel(t)}`);
}

function handleSaveWorkflow(): void {
  saveWorkspaceToFile();
}

function handleLoadWorkflow(): void {
  promptWorkspaceImport();
}

function loadValues(): void {
  // Theme is reactive via useTheme, no explicit load needed
}

onMounted(() => {
  loadValues();
});

defineExpose({ loadValues });
</script>

<style scoped>
.sp-theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}

.sp-theme-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-lg);
  border: 2px solid rgb(255 255 255 / 10%);
  background: rgb(255 255 255 / 3%);
  transition: all 0.2s ease;
  position: relative;
}

.sp-theme-btn:hover {
  border-color: rgb(255 255 255 / 25%);
  background: rgb(255 255 255 / 6%);
  transform: translateY(-2px);
}

.sp-theme-btn.active {
  border-color: var(--theme-accent, #64b5f6);
  background: rgb(100 181 246 / 8%);
}

.sp-theme-preview {
  position: relative;
  width: 100%;
  height: 56px;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 6px;
  overflow: hidden;
}

.sp-mini-bubble {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  width: 65%;
  align-self: center;
}

.sp-mini-text {
  height: 3px;
  border-radius: 1px; /* Leave as-is: decorative 1px */
  opacity: 0.7;
}

.sp-mini-text.short {
  width: 60%;
}

.sp-mini-input {
  padding: 3px 4px;
  border-radius: var(--radius-sm);
}

.sp-mini-accent {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.sp-theme-label {
  font-size: 0.85rem;
  font-weight: 500;
  opacity: 0.9;
}

.sp-theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--theme-accent, #64b5f6);
  font-size: 1rem;
}

.sp-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  opacity: 0.6;
  margin-top: 12px;
}

.sp-tip iconify-icon {
  font-size: 1rem;
}

@media (width <= 640px) {
  .sp-theme-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .sp-theme-btn {
    padding: 10px;
    border-radius: var(--radius-lg);
  }

  .sp-theme-preview {
    height: 48px;
    padding: 5px;
  }

  .sp-mini-bubble {
    padding: 3px 5px;
    gap: 1px;
  }

  .sp-mini-text {
    height: 2px;
  }

  .sp-mini-input {
    padding: 2px 3px;
  }

  .sp-mini-accent {
    width: 5px;
    height: 5px;
    top: 3px;
    right: 3px;
  }

  .sp-theme-label {
    font-size: 0.8rem;
  }

  .sp-tip {
    display: none;
  }
}

/* Workflow Actions */
.sp-workflow-actions {
  display: flex;
  gap: 12px;
}

.sp-workflow-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid rgb(255 255 255 / 15%);
  background: rgb(255 255 255 / 5%);
  font-size: 0.9rem;
  font-weight: 500;
  color: rgb(255 255 255 / 85%);
  transition: all 0.2s ease;
}

.sp-workflow-btn:hover {
  border-color: rgb(255 255 255 / 30%);
  background: rgb(255 255 255 / 10%);
  transform: translateY(-1px);
}

.sp-workflow-btn:active {
  transform: translateY(0);
}

.sp-workflow-btn iconify-icon {
  font-size: 1.1rem;
  opacity: 0.8;
}

@media (width <= 640px) {
  .sp-workflow-actions {
    gap: 8px;
  }

  .sp-workflow-btn {
    flex: 1;
    justify-content: center;
    padding: 10px 12px;
    font-size: 0.8rem;
  }

  .sp-workflow-btn iconify-icon {
    font-size: 1rem;
  }
}
</style>
