<template>
  <teleport to="body">
    <dialog
      id="settings-pane-dialog"
      ref="dialogRef"
      aria-labelledby="sp-title"
      data-no-orbit
      @click="handleBackdropClick"
      @close="onDialogClose"
    >
      <!-- Video background -->
      <div class="sp-media" aria-hidden="true">
        <video
          v-if="!reduceMotion"
          ref="videoRef"
          class="sp-media-video"
          :src="baseUrl + 'images/fishLoop.mp4'"
          muted
          loop
          playsinline
          preload="none"
        ></video>
      </div>
      <div class="sp-media-scrim" aria-hidden="true"></div>

      <!-- Inner wrapper with sidebar layout -->
      <div class="sp-inner sp-inner--sidebar">
        <!-- Sidebar navigation -->
        <nav class="sp-sidebar">
          <ul class="sp-nav-list">
            <li>
              <button
                :class="{ active: activePane === 'themes' }"
                @click="setPane('themes')"
                type="button"
              >
                <iconify-icon icon="ph:palette"></iconify-icon>
                <span>Themes</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'skills' }"
                @click="setPane('skills')"
                type="button"
              >
                <iconify-icon icon="ph:lightning"></iconify-icon>
                <span>Skills</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'suggestions' }"
                @click="setPane('suggestions')"
                type="button"
              >
                <iconify-icon icon="ph:lightbulb"></iconify-icon>
                <span>Suggestions</span>
              </button>
            </li>
            <li>
              <button :class="{ active: activePane === 'ai' }" @click="setPane('ai')" type="button">
                <iconify-icon icon="ph:brain"></iconify-icon>
                <span>Models</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'keys' }"
                @click="setPane('keys')"
                type="button"
              >
                <iconify-icon icon="ph:key"></iconify-icon>
                <span>Services</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'effects' }"
                @click="setPane('effects')"
                type="button"
              >
                <iconify-icon icon="ph:sparkle"></iconify-icon>
                <span>Visuals</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'characters' }"
                @click="setPane('characters')"
                type="button"
              >
                <iconify-icon icon="ph:bird"></iconify-icon>
                <span>Characters</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'accessibility' }"
                @click="setPane('accessibility')"
                type="button"
              >
                <iconify-icon icon="ph:hand"></iconify-icon>
                <span>Accessibility</span>
              </button>
            </li>
            <li>
              <button
                :class="{ active: activePane === 'system' }"
                @click="setPane('system')"
                type="button"
              >
                <iconify-icon icon="ph:gear-six"></iconify-icon>
                <span>System</span>
              </button>
            </li>
          </ul>
        </nav>

        <!-- Content area -->
        <div class="sp-main">
          <header>
            <span id="sp-title">{{ paneTitles[activePane] }}</span>
            <button type="button" @click="close" aria-label="Close" id="sp-close">&times;</button>
          </header>

          <div class="sp-body">
            <section class="sp-pane" :hidden="activePane !== 'themes'">
              <ThemesPane ref="themesPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'effects'">
              <EffectsPane ref="effectsPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'ai'">
              <AIPane ref="aiPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'keys'">
              <KeysPane ref="keysPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'system'">
              <SystemPane ref="systemPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'skills'">
              <SkillsPane ref="skillsPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'suggestions'">
              <SuggestionsPane ref="suggestionsPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'characters'">
              <CharactersPane ref="charactersPaneRef" />
            </section>
            <section class="sp-pane" :hidden="activePane !== 'accessibility'">
              <AccessibilityPane ref="accessibilityPaneRef" />
            </section>
          </div>

          <footer>
            <span class="sp-autosave-hint">
              <iconify-icon icon="ph:check-circle"></iconify-icon>
              Changes save automatically
            </span>
            <button type="button" class="sp-close-action" @click="close">
              <span>Done</span>
            </button>
          </footer>
        </div>
      </div>
    </dialog>
  </teleport>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useMenuActionStore } from '@web/stores/menuAction.js';
import { useMotionPreferences, prefersReducedMotion } from '@web/composables/useMotion.js';
import { useEventBus } from '@web/services/eventBus';

import ThemesPane from '@web/components/modals/ThemesPane.vue';
import EffectsPane from '@web/components/modals/EffectsPane.vue';
import AIPane from '@web/components/modals/AIPane.vue';
import KeysPane from '@web/components/modals/KeysPane.vue';
import SystemPane from '@web/components/modals/SystemPane.vue';
import SkillsPane from '@web/components/modals/SkillsPane.vue';
import SuggestionsPane from '@web/components/modals/SuggestionsPane.vue';
import CharactersPane from '@web/components/modals/CharactersPane.vue';
import AccessibilityPane from '@web/components/modals/AccessibilityPane.vue';

// Extend Window for global functions
declare global {
  interface Window {
    openModelModal?: () => void;
    openApiKeysModal?: () => void;
    openThemeModal?: () => void;
    openSettingsModal?: () => void;
    closeSettingsModal?: () => void;
  }
}

type PaneId =
  | 'themes'
  | 'effects'
  | 'ai'
  | 'keys'
  | 'system'
  | 'skills'
  | 'suggestions'
  | 'characters'
  | 'accessibility';

interface PaneRef {
  loadValues?: () => void;
}

const menuStore = useMenuActionStore();
const { settingsModalOpen, activePane } = storeToRefs(menuStore);

const { reduceMotion } = useMotionPreferences();

const dialogRef = ref<HTMLDialogElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const themesPaneRef = ref<PaneRef | null>(null);
const effectsPaneRef = ref<PaneRef | null>(null);
const aiPaneRef = ref<PaneRef | null>(null);
const keysPaneRef = ref<PaneRef | null>(null);
const systemPaneRef = ref<PaneRef | null>(null);
const skillsPaneRef = ref<PaneRef | null>(null);
const suggestionsPaneRef = ref<PaneRef | null>(null);
const charactersPaneRef = ref<PaneRef | null>(null);
const accessibilityPaneRef = ref<PaneRef | null>(null);

const paneTitles: Record<PaneId, string> = {
  themes: 'Themes',
  effects: 'Visuals',
  ai: 'Models',
  keys: 'Services',
  system: 'System',
  skills: 'Skills',
  suggestions: 'Suggestions',
  characters: 'Characters',
  accessibility: 'Accessibility',
};

const isOpen = computed<boolean>(() => settingsModalOpen.value);

// Map legacy pane names to new ones
const paneMapping: Record<string, PaneId> = {
  appearance: 'themes',
  model: 'ai',
  prefs: 'effects',
};

function setPane(pane: string): void {
  // Support legacy pane names
  const mappedPane = (paneMapping[pane] || pane) as PaneId;
  activePane.value = mappedPane as typeof activePane.value;

  // Reload pane data when switching
  nextTick(() => {
    if (mappedPane === 'themes' && themesPaneRef.value?.loadValues) {
      themesPaneRef.value.loadValues();
    } else if (mappedPane === 'effects' && effectsPaneRef.value?.loadValues) {
      effectsPaneRef.value.loadValues();
    } else if (mappedPane === 'ai' && aiPaneRef.value?.loadValues) {
      aiPaneRef.value.loadValues();
    } else if (mappedPane === 'keys' && keysPaneRef.value?.loadValues) {
      keysPaneRef.value.loadValues();
    } else if (mappedPane === 'system' && systemPaneRef.value?.loadValues) {
      systemPaneRef.value.loadValues();
    } else if (mappedPane === 'skills' && skillsPaneRef.value?.loadValues) {
      skillsPaneRef.value.loadValues();
    } else if (mappedPane === 'suggestions' && suggestionsPaneRef.value?.loadValues) {
      suggestionsPaneRef.value.loadValues();
    } else if (mappedPane === 'characters' && charactersPaneRef.value?.loadValues) {
      charactersPaneRef.value.loadValues();
    } else if (mappedPane === 'accessibility' && accessibilityPaneRef.value?.loadValues) {
      accessibilityPaneRef.value.loadValues();
    }
  });
}

function open(): void {
  if (!dialogRef.value) return;
  dialogRef.value.showModal();
  startVideo();
  nextTick(() => {
    setPane(activePane.value);
  });
}

function close(): void {
  if (!dialogRef.value) return;
  stopVideo();
  dialogRef.value.close();
}

function onDialogClose(): void {
  menuStore.closeSettings();
}

function handleBackdropClick(e: MouseEvent): void {
  // Close if clicking on the dialog backdrop (the dialog element itself)
  if (e.target === dialogRef.value) {
    close();
  }
}

function startVideo(): void {
  if (!videoRef.value || prefersReducedMotion()) return;
  try {
    videoRef.value.currentTime = 0;
    videoRef.value.play().catch(() => {});
  } catch (_) {}
}

function stopVideo(): void {
  if (!videoRef.value) return;
  try {
    videoRef.value.pause();
  } catch (_) {}
}

// Watch store for open/close
watch(settingsModalOpen, (shouldOpen: boolean) => {
  if (shouldOpen) {
    open();
  } else {
    close();
  }
});

// Handle panel:open event for settings
function handlePanelOpen(event: { panel: string; pane?: string }): void {
  if (event.panel === 'settings') {
    const pane = event.pane || 'themes';
    menuStore.openSettings(pane);
  }
}

onMounted((): void => {
  // Listen for panel:open events dispatched throughout the app
  useEventBus().on('panel:open', handlePanelOpen);

  // Expose globals for legacy compatibility (mapped to new panes)
  window.openModelModal = () => menuStore.openSettings('ai');
  window.openApiKeysModal = () => menuStore.openSettings('ai');
  window.openThemeModal = () => menuStore.openSettings('themes');
  window.openSettingsModal = () => menuStore.openSettings('themes');
  window.closeSettingsModal = () => menuStore.closeSettings();
});

onBeforeUnmount((): void => {
  useEventBus().off('panel:open', handlePanelOpen);
  stopVideo();
});
</script>

<style>
/* Sidebar layout extension for settings-pane-dialog — MoMA Edition */

#settings-pane-dialog .sp-sidebar {
  width: 200px;
  min-width: 200px;
  height: 100%; /* Safari fix */
  background: var(--color-input-bg);
  padding: 32px 0;
  border-right: 1px solid var(--glass-border-subtle);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}

#settings-pane-dialog .sp-nav-list {
  list-style: none;
  margin: 0;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

#settings-pane-dialog .sp-nav-list li {
  margin: 0;
}

#settings-pane-dialog .sp-nav-list button {
  all: unset;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  box-sizing: border-box;
  color: rgb(255 255 255 / 70%);
  font-size: var(--font-size-sm);
  font-weight: 450;
  letter-spacing: 0.01em;
  cursor: pointer;
  border-radius: var(--radius-md);
  position: relative;
  transition:
    color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

#settings-pane-dialog .sp-nav-list button::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 20px;
  background: var(--color-btn-primary-bg);
  border-radius: 0 2px 2px 0;
  opacity: 0;
  transition:
    opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

#settings-pane-dialog .sp-nav-list button:hover {
  color: rgb(255 255 255 / 85%);
  background: var(--glass-border-subtle);
}

#settings-pane-dialog .sp-nav-list button.active {
  color: #fff;
  background: var(--color-input-bg);
}

#settings-pane-dialog .sp-nav-list button.active::before {
  opacity: 1;
  transform: translateY(-50%) scaleY(1);
}

#settings-pane-dialog .sp-nav-list iconify-icon {
  font-size: 18px;
  opacity: 0.7;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

#settings-pane-dialog .sp-nav-list button:hover iconify-icon {
  opacity: 0.9;
}

#settings-pane-dialog .sp-nav-list button.active iconify-icon {
  opacity: 1;
  color: var(--color-btn-primary-bg);
}

#settings-pane-dialog .sp-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%; /* Safari fix */
  position: relative;
  z-index: 1;
  padding: 32px 28px 20px;
  box-sizing: border-box;
}

#settings-pane-dialog .sp-main header {
  padding-bottom: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

#settings-pane-dialog .sp-main header #sp-title {
  font-size: var(--font-size-md);
  font-weight: 500;
  letter-spacing: -0.01em;
  color: #fff;
}

#settings-pane-dialog .sp-main header #sp-close {
  /* Hidden - "Done" button in footer is the primary close action */
  display: none;
}

#settings-pane-dialog .sp-main header #sp-close:hover {
  background: var(--color-input-bg);
  color: var(--color-btn-ghost-text);
}

#settings-pane-dialog .sp-main header #sp-close:focus-visible {
  outline: 2px solid var(--color-btn-secondary-border);
  outline-offset: 2px;
}

#settings-pane-dialog .sp-main .sp-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-btn-ghost-bg-hover) transparent;
}

#settings-pane-dialog .sp-main .sp-body::-webkit-scrollbar {
  width: 6px;
}

#settings-pane-dialog .sp-main .sp-body::-webkit-scrollbar-track {
  background: transparent;
}

#settings-pane-dialog .sp-main .sp-body::-webkit-scrollbar-thumb {
  background: var(--color-btn-ghost-bg-hover);
  border-radius: 3px;
}

#settings-pane-dialog .sp-main .sp-body::-webkit-scrollbar-thumb:hover {
  background: var(--color-toggle-bg-off);
}

#settings-pane-dialog .sp-main footer {
  border-top: 1px solid var(--glass-border-subtle);
  margin: 16px -28px -20px;
  padding: 16px 28px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

#settings-pane-dialog .sp-autosave-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
  color: var(--color-text-hint);
  font-weight: 400;
}

#settings-pane-dialog .sp-autosave-hint iconify-icon {
  color: var(--color-text-muted);
  font-size: var(--font-size-base);
}

#settings-pane-dialog .sp-close-action {
  all: unset;
  cursor: pointer;
  border-radius: var(--radius-pill);
  padding: 10px 26px;
  font-weight: 500;
  font-size: var(--font-size-sm);
  letter-spacing: 0.01em;
  background: var(--color-btn-primary-bg);
  color: var(--color-text-on-accent);
  transition:
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

#settings-pane-dialog .sp-close-action:hover {
  background: var(--color-btn-primary-bg-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px -6px rgb(0 0 0 / 20%);
}

#settings-pane-dialog .sp-close-action:active {
  transform: translateY(0);
}

/* Make dialog wider for sidebar layout */
#settings-pane-dialog:has(.sp-inner--sidebar) {
  width: min(880px, 94vw);
  max-height: min(620px, 88vh);
}

/* Mobile: convert sidebar to horizontal tabs */
@media (max-width: 640px) {
  #settings-pane-dialog:has(.sp-inner--sidebar) {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }

  #settings-pane-dialog .sp-inner--sidebar {
    flex-direction: column;
    height: 100%;
  }

  #settings-pane-dialog .sp-sidebar {
    width: 100%;
    min-width: unset;
    height: auto;
    padding: 0;
    border-right: none;
    border-bottom: 1px solid var(--color-input-bg);
    flex-shrink: 0;
    background: rgb(0 0 0 / 20%);
  }

  #settings-pane-dialog .sp-nav-list {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 12px 16px;
    gap: 6px;
    scrollbar-width: none;
  }

  #settings-pane-dialog .sp-nav-list::-webkit-scrollbar {
    display: none;
  }

  #settings-pane-dialog .sp-nav-list li {
    flex-shrink: 0;
  }

  #settings-pane-dialog .sp-nav-list button {
    padding: 10px 16px;
    border-radius: var(--radius-pill);
    white-space: nowrap;
    font-size: var(--font-size-xs);
    background: transparent;
    border: 1px solid rgb(255 255 255 / 20%);
    color: rgb(255 255 255 / 70%);
  }

  #settings-pane-dialog .sp-nav-list button::before {
    display: none;
  }

  #settings-pane-dialog .sp-nav-list button.active {
    background: var(--color-btn-primary-bg);
    border-color: transparent;
    color: var(--color-text-on-accent);
  }

  #settings-pane-dialog .sp-nav-list button.active iconify-icon {
    color: var(--color-text-on-accent);
  }

  #settings-pane-dialog .sp-main {
    flex: 1;
    min-height: 0;
    padding: 20px 16px 16px;
    display: flex;
    flex-direction: column;
  }

  #settings-pane-dialog .sp-main header {
    display: none;
  }

  #settings-pane-dialog .sp-main .sp-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  #settings-pane-dialog .sp-main footer {
    flex-shrink: 0;
    padding: 16px;
    margin: auto -16px -16px;
    border-top: 1px solid var(--glass-border-subtle);
  }

  #settings-pane-dialog .sp-autosave-hint {
    display: none;
  }

  #settings-pane-dialog .sp-close-action {
    width: 100%;
    text-align: center;
    padding: 14px 26px;
  }
}
</style>
