<template>
  <div class="ap-pane-content">
    <div class="ap-app-list">
      <div v-if="!apps.length" class="ap-empty-state">
        <p>No apps yet. Ask the AI to build one in chat!</p>
      </div>
      <div v-for="app in apps" :key="app.id" class="ap-app-item">
        <div class="ap-app-row">
          <img v-if="app.icon" :src="app.icon" class="ap-thumb" alt="" />
          <div v-else class="ap-thumb ap-thumb--placeholder" />
          <div class="ap-app-info">
            <span v-if="editingNameId !== app.id" class="ap-app-name">{{ app.name }}</span>
            <input
              v-else
              ref="renameInputRef"
              v-model="editNameValue"
              type="text"
              class="ap-name-input"
              @keydown.enter="saveRename(app.id)"
              @blur="saveRename(app.id)"
            />
            <span class="ap-app-desc">{{ app.description || 'No description' }}</span>
          </div>
          <div class="ap-actions">
            <button type="button" title="Rename" @click="startRename(app)">
              <iconify-icon icon="ph:pencil-simple" />
            </button>
            <button type="button" title="Edit app" @click="handleEdit(app.id)">
              <iconify-icon icon="ph:code" />
            </button>
            <button type="button" title="Launch" @click="handleLaunch(app)">
              <iconify-icon icon="ph:play" />
            </button>
            <button type="button" title="Delete" @click="handleDelete(app.id)">
              <iconify-icon icon="ph:trash" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { useAppGenerator } from '@web/composables/useAppGenerator';
import { useWindowManager } from '@web/composables/useWindowManager';
import { useMenuActionStore } from '@web/stores/menuAction.js';
import { useNotifs } from '@web/composables/useNotifs.js';
import type { AppDefinition } from '@web/types/apps';

const registry = createAppRegistry();
const generator = useAppGenerator();
const windowManager = useWindowManager();
const menuStore = useMenuActionStore();
const notifs = useNotifs();

const apps = ref<AppDefinition[]>([]);
const editingNameId = ref<string | null>(null);
const editNameValue = ref('');
const renameInputRef = ref<HTMLInputElement[] | null>(null);

async function refreshApps(): Promise<void> {
  const all = await registry.getAll();
  apps.value = [...all];
}

onMounted(() => {
  void refreshApps();
});

function startRename(app: AppDefinition): void {
  editingNameId.value = app.id;
  editNameValue.value = app.name;
  nextTick(() => {
    const inputs = renameInputRef.value;
    if (inputs && inputs.length > 0) {
      inputs[0].focus();
      inputs[0].select();
    }
  });
}

async function saveRename(id: string): Promise<void> {
  const trimmed = editNameValue.value.trim();
  if (trimmed && editingNameId.value === id) {
    try {
      await registry.update(id, { name: trimmed });
      await refreshApps();
    } catch (err) {
      notifs.push('error', 'Rename Failed', { description: (err as Error).message });
    }
  }
  editingNameId.value = null;
}

function handleEdit(appId: string): void {
  generator.enterEditMode(appId);
  menuStore.closeSettings();
}

function handleLaunch(app: AppDefinition): void {
  windowManager.openWindow(app);
  menuStore.closeSettings();
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

defineExpose({ loadValues });
</script>

<style scoped>
.ap-pane-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ap-app-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ap-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.ap-empty-state p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgb(255 255 255 / 50%);
}

.ap-app-item {
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.ap-app-item:hover {
  background: rgb(255 255 255 / 3%);
}

.ap-app-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}

.ap-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.ap-thumb--placeholder {
  background: var(--color-surface, rgb(255 255 255 / 8%));
}

.ap-app-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ap-app-name {
  font-weight: 500;
  color: #fff;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-input-border);
  background: rgb(0 0 0 / 20%);
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.ap-name-input:focus {
  outline: none;
  border-color: var(--color-input-border-focus);
  box-shadow: 0 0 0 2px rgb(75 163 253 / 30%);
}

.ap-app-desc {
  font-size: 0.85em;
  color: rgb(255 255 255 / 50%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ap-actions button {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  font-size: 16px;
  color: rgb(255 255 255 / 50%);
  transition:
    color 0.15s,
    background 0.15s;
}

.ap-actions button:hover {
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 85%);
}

/* Delete button hover */
.ap-actions button[title='Delete']:hover {
  color: rgb(220 53 69 / 90%);
  background: rgb(220 53 69 / 15%);
}
</style>
