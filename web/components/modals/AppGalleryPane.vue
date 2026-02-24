<template>
  <div class="ag-pane-content">
    <!-- Create input -->
    <div class="ag-create-row">
      <input
        v-model="createPrompt"
        type="text"
        placeholder="Describe an app..."
        :disabled="isCreating"
        @keydown.enter="handleCreate"
      />
      <button
        type="button"
        title="Generate app"
        :disabled="isCreating || !createPrompt.trim()"
        @click="handleCreate"
      >
        <iconify-icon icon="ph:sparkle"></iconify-icon>
      </button>
    </div>

    <!-- My Apps section -->
    <section v-if="groupedApps.generated.length" class="ag-section">
      <h4 class="ag-section-header">My Apps</h4>
      <div class="ag-list">
        <div v-for="app in groupedApps.generated" :key="app.id" class="ag-row ag-row--managed">
          <button type="button" class="ag-row-main" @click="handleLaunch(app)">
            <div class="ag-row-icon">
              <img v-if="isImageSrc(app.icon)" :src="app.icon" alt="" />
              <iconify-icon v-else :icon="app.icon || 'ph:cube'"></iconify-icon>
            </div>
            <span class="ag-row-name">{{ app.name }}</span>
            <span v-if="app.description" class="ag-row-desc">{{ app.description }}</span>
          </button>
          <div class="ag-row-actions">
            <button type="button" title="Save" @click.stop="handleSave(app)">
              <iconify-icon icon="ph:download-simple"></iconify-icon>
            </button>
            <button type="button" title="Edit" @click.stop="handleEdit(app.id)">
              <iconify-icon icon="ph:pencil-simple"></iconify-icon>
            </button>
            <button
              type="button"
              title="Delete"
              class="action-delete"
              @click.stop="handleDelete(app.id)"
            >
              <iconify-icon icon="ph:trash"></iconify-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Discovered section -->
    <section class="ag-section">
      <h4 class="ag-section-header">Discovered</h4>
      <div v-if="groupedApps.discovered.length" class="ag-list">
        <div v-for="app in groupedApps.discovered" :key="app.id" class="ag-row ag-row--managed">
          <button type="button" class="ag-row-main" @click="handleLaunch(app)">
            <div class="ag-row-icon">
              <img v-if="isImageSrc(app.icon)" :src="app.icon" alt="" />
              <iconify-icon v-else :icon="app.icon || 'ph:lightbulb'"></iconify-icon>
            </div>
            <span class="ag-row-name">{{ app.name }}</span>
            <span v-if="app.description" class="ag-row-desc">{{ app.description }}</span>
          </button>
          <div class="ag-row-actions">
            <button type="button" title="Edit" @click.stop="handleEdit(app.id)">
              <iconify-icon icon="ph:pencil-simple"></iconify-icon>
            </button>
            <button
              type="button"
              title="Delete"
              class="action-delete"
              @click.stop="handleDelete(app.id)"
            >
              <iconify-icon icon="ph:trash"></iconify-icon>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="ag-empty">
        No discovered apps yet. Apps will be suggested based on your usage patterns.
      </div>
    </section>

    <!-- Builtin sections by category -->
    <section v-for="cat in builtinCategories" :key="cat.key" class="ag-section">
      <h4 class="ag-section-header">{{ cat.label }}</h4>
      <div class="ag-list">
        <button
          v-for="app in cat.apps"
          :key="app.id"
          type="button"
          class="ag-row"
          @click="handleLaunch(app)"
        >
          <div class="ag-row-icon">
            <img v-if="isImageSrc(app.icon)" :src="app.icon" alt="" />
            <iconify-icon v-else :icon="app.icon || 'ph:cube'"></iconify-icon>
          </div>
          <span class="ag-row-name">{{ app.name }}</span>
          <span v-if="app.description" class="ag-row-desc">{{ app.description }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { useWindowManager } from '@web/composables/useWindowManager';
import { useAppGenerator } from '@web/composables/useAppGenerator';
import { useDocumentBrowser } from '@web/composables/useDocumentBrowser';
import { useMenuActionStore } from '@web/stores/menuAction.js';
import { useNotifs } from '@web/composables/useNotifs.js';
import { GALLERY_SHORTCUTS } from '@web/services/apps/builtinApps';
import type { AppDefinition } from '@web/types/apps';
import { CATEGORY_ORDER } from '@web/types/apps';

const registry = createAppRegistry();
const windowManager = useWindowManager();
const generator = useAppGenerator();
const menuStore = useMenuActionStore();
const notifs = useNotifs();

const apps = ref<readonly AppDefinition[]>([]);
const createPrompt = ref('');
const isCreating = ref(false);

const groupedApps = computed(() => ({
  builtin: [...apps.value.filter((a) => a.source === 'builtin'), ...GALLERY_SHORTCUTS],
  generated: apps.value.filter((a) => a.source === 'generated' || a.source === 'sideloaded'),
  discovered: apps.value.filter((a) => a.source === 'discovered'),
}));

const builtinCategories = computed(() => {
  const all = groupedApps.value.builtin;
  return CATEGORY_ORDER.map((cat) => ({
    ...cat,
    apps: all.filter((a) => a.category === cat.key),
  })).filter((cat) => cat.apps.length > 0);
});

function isImageSrc(icon: string | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('data:') || icon.startsWith('http');
}

async function refreshApps(): Promise<void> {
  apps.value = await registry.getAll();
}

async function handleCreate(): Promise<void> {
  const prompt = createPrompt.value.trim();
  if (!prompt || isCreating.value) return;

  isCreating.value = true;
  createPrompt.value = '';
  menuStore.closeSettings();

  try {
    await generator.generateApp(prompt);
  } finally {
    isCreating.value = false;
    // Refresh after a delay to pick up the newly registered app
    setTimeout(() => void refreshApps(), 3000);
  }
}

function handleLaunch(app: AppDefinition): void {
  menuStore.closeSettings();

  // Shortcut entries launch native overlays / modals instead of app windows
  if (app.id === 'pong') {
    if (typeof window.startPongGame === 'function') window.startPongGame();
    return;
  }
  if (app.id === 'brick-breaker') {
    if (typeof window.startBlockBreakingGame === 'function') window.startBlockBreakingGame();
    return;
  }
  if (app.id === 'files') {
    useDocumentBrowser().open();
    return;
  }

  windowManager.openWindow(app);
}

function handleEdit(appId: string): void {
  generator.enterEditMode(appId);
  menuStore.closeSettings();
}

function handleSave(app: AppDefinition): void {
  if (!app.html) {
    notifs.push('error', 'No HTML', { description: 'This app has no exportable HTML.' });
    return;
  }
  const blob = new Blob([app.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = app.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.html';
  a.click();
  URL.revokeObjectURL(url);
}

async function handleDelete(appId: string): Promise<void> {
  const confirmed = window.confirm('Delete this app? This cannot be undone.');
  if (!confirmed) return;

  try {
    await registry.unregister(appId);
    await refreshApps();
    notifs.push('success', 'App Deleted', { description: 'The app has been permanently removed.' });
  } catch (err) {
    notifs.push('error', 'Delete Failed', { description: (err as Error).message });
  }
}

function loadValues(): void {
  void refreshApps();
}

onMounted(() => {
  void refreshApps();
});

defineExpose({ loadValues });
</script>

<style scoped>
.ag-pane-content {
  display: flex;
  flex-direction: column;
}

.ag-create-row {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.ag-create-row input {
  flex: 1;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 4%);
  color: #fff;
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.ag-create-row input::placeholder {
  color: rgb(255 255 255 / 35%);
}

.ag-create-row input:focus {
  border-color: rgb(255 255 255 / 25%);
}

.ag-create-row input:disabled {
  opacity: 0.5;
}

.ag-create-row button {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 12%);
  color: rgb(255 255 255 / 60%);
  font-size: 18px;
  transition:
    background 0.15s,
    color 0.15s;
}

.ag-create-row button:hover:not(:disabled) {
  background: rgb(255 255 255 / 12%);
  color: #fff;
}

.ag-create-row button:disabled {
  opacity: 0.4;
  cursor: default;
}

.ag-section {
  margin-bottom: 20px;
}

.ag-section-header {
  font-size: var(--font-size-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(255 255 255 / 40%);
  margin: 0 0 10px;
}

.ag-list {
  display: flex;
  flex-direction: column;
}

.ag-row {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  transition: background 0.12s;
}

.ag-row:hover {
  background: rgb(255 255 255 / 6%);
}

.ag-row--managed {
  cursor: default;
  position: relative;
}

.ag-row-main {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.ag-row-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 6%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ag-row-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ag-row-icon iconify-icon {
  font-size: 15px;
  color: rgb(255 255 255 / 40%);
}

.ag-row-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: rgb(255 255 255 / 88%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  max-width: 160px;
}

.ag-row-desc {
  font-size: var(--font-size-xs);
  color: rgb(255 255 255 / 35%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  text-align: right;
}

.ag-row-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
  background: rgb(30 30 35 / 90%);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.ag-row--managed:hover .ag-row-actions {
  opacity: 1;
}

.ag-row-actions button {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: rgb(255 255 255 / 50%);
  transition:
    color 0.12s,
    background 0.12s;
}

.ag-row-actions button:hover {
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 85%);
}

.ag-row-actions .action-delete:hover {
  color: rgb(220 53 69 / 90%);
  background: rgb(220 53 69 / 15%);
}

.ag-observation {
  font-size: 0.75em;
  font-style: italic;
  color: var(--color-btn-primary-bg, rgb(255 255 255 / 50%));
  margin-top: 2px;
}

.ag-empty {
  padding: 20px;
  text-align: center;
  font-size: var(--font-size-sm);
  color: rgb(255 255 255 / 35%);
}

@media (max-width: 640px) {
  .ag-row-actions {
    opacity: 1;
  }
}
</style>
