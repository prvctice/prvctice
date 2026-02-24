<template>
  <teleport to="body">
    <div
      v-if="modalOpen"
      ref="overlayRef"
      class="apps-overlay"
      data-no-orbit
      @click="modal.handleOverlayClick"
    >
      <div ref="dialogRef" class="apps-dialog" role="dialog" aria-modal="true" aria-label="Apps">
        <div class="apps-media" aria-hidden="true">
          <video
            class="apps-media-video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="apps-media-scrim"></div>
        </div>
        <div class="apps-inner">
          <!-- Header -->
          <div class="apps-header">
            <div class="apps-header-top">
              <span class="apps-brand"
                ><img
                  :src="baseUrl + 'images/logo-white-thick.png'"
                  alt=""
                  class="apps-brand-logo"
                />Prvctice <span class="apps-brand-version">v{{ appVersion }}</span></span
              >
              <div class="apps-header-actions">
                <button
                  class="apps-header-btn"
                  title="Toggle grid"
                  aria-label="Toggle grid"
                  @click="menuStore.dispatch('toggle-grid')"
                >
                  <iconify-icon icon="ph:grid-four" aria-hidden="true" />
                </button>
                <button
                  class="apps-header-btn"
                  title="Search"
                  aria-label="Search"
                  @click="openSearch"
                >
                  <iconify-icon icon="ph:magnifying-glass" aria-hidden="true" />
                </button>
                <button
                  class="apps-header-btn apps-close-btn"
                  title="Close"
                  aria-label="Close"
                  @click="closeModal"
                >
                  <iconify-icon icon="ph:x" aria-hidden="true" />
                </button>
              </div>
            </div>
            <nav class="apps-nav">
              <button class="apps-nav-btn active" type="button">Apps</button>
              <button class="apps-nav-btn" type="button" @click="navigateTo('file-library')">
                Files
              </button>
              <button class="apps-nav-btn" type="button" @click="navigateTo('settings')">
                Settings
              </button>
              <button class="apps-nav-btn" type="button" @click="navigateTo('about')">About</button>
            </nav>
          </div>

          <!-- Create input -->
          <div class="apps-create-row">
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
              <iconify-icon icon="ph:plus" aria-hidden="true" />
            </button>
          </div>

          <!-- Category filter pills -->
          <div class="apps-category-pills">
            <button
              type="button"
              class="apps-pill"
              :class="{ active: selectedCategory === 'all' }"
              @click="selectedCategory = 'all'"
            >
              All
            </button>
            <button
              v-for="cat in CATEGORY_ORDER"
              :key="cat.key"
              type="button"
              class="apps-pill"
              :class="{ active: selectedCategory === cat.key }"
              @click="selectedCategory = cat.key"
            >
              {{ cat.label }}
            </button>
          </div>

          <!-- Content -->
          <div class="apps-content">
            <!-- My Apps section -->
            <section
              v-if="groupedApps.generated.length && selectedCategory === 'all'"
              class="apps-section"
            >
              <h4 class="apps-section-header">My Apps</h4>
              <div class="apps-list">
                <div
                  v-for="app in groupedApps.generated"
                  :key="app.id"
                  class="apps-row apps-row--managed"
                >
                  <button type="button" class="apps-row-main" @click="handleLaunch(app)">
                    <div class="apps-row-icon">
                      <iconify-icon
                        :icon="app.icon && !isImageSrc(app.icon) ? app.icon : 'ph:cube'"
                        aria-hidden="true"
                      />
                    </div>
                    <span class="apps-row-name">{{ app.name }}</span>
                    <span v-if="app.description" class="apps-row-desc">{{ app.description }}</span>
                  </button>
                  <div class="apps-row-actions">
                    <button type="button" title="Save" @click.stop="handleSave(app)">
                      <iconify-icon icon="ph:download-simple" aria-hidden="true" />
                    </button>
                    <button type="button" title="Edit" @click.stop="handleEdit(app.id)">
                      <iconify-icon icon="ph:pencil-simple" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      class="action-delete"
                      @click.stop="handleDelete(app.id)"
                    >
                      <iconify-icon icon="ph:trash" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Builtin sections by category -->
            <section v-for="cat in filteredCategories" :key="cat.key" class="apps-section">
              <h4 class="apps-section-header">{{ cat.label }}</h4>
              <div class="apps-list">
                <button
                  v-for="app in cat.apps"
                  :key="app.id"
                  type="button"
                  class="apps-row"
                  @click="handleLaunch(app)"
                >
                  <div class="apps-row-icon">
                    <img v-if="isImageSrc(app.icon)" :src="app.icon" alt="" />
                    <iconify-icon v-else :icon="app.icon || 'ph:cube'" aria-hidden="true" />
                  </div>
                  <span class="apps-row-name">{{ app.name }}</span>
                  <span v-if="app.description" class="apps-row-desc">{{ app.description }}</span>
                </button>
              </div>
            </section>

            <!-- Discovered section -->
            <section v-if="selectedCategory === 'all'" class="apps-section">
              <h4 class="apps-section-header">Discovered</h4>
              <div v-if="groupedApps.discovered.length" class="apps-list">
                <div
                  v-for="app in groupedApps.discovered"
                  :key="app.id"
                  class="apps-row apps-row--managed"
                >
                  <button type="button" class="apps-row-main" @click="handleLaunch(app)">
                    <div class="apps-row-icon">
                      <iconify-icon
                        :icon="app.icon && !isImageSrc(app.icon) ? app.icon : 'ph:lightbulb'"
                        aria-hidden="true"
                      />
                    </div>
                    <span class="apps-row-name">{{ app.name }}</span>
                    <span v-if="app.description" class="apps-row-desc">{{ app.description }}</span>
                  </button>
                  <div class="apps-row-actions">
                    <button type="button" title="Edit" @click.stop="handleEdit(app.id)">
                      <iconify-icon icon="ph:pencil-simple" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      class="action-delete"
                      @click.stop="handleDelete(app.id)"
                    >
                      <iconify-icon icon="ph:trash" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <div v-else class="apps-empty">
                No discovered apps yet. Apps will be suggested based on your usage patterns.
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useAppsModal } from '@web/composables/useAppsModal';
import { useModal } from '@web/composables/useModal';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { useWindowManager } from '@web/composables/useWindowManager';
import { useAppGenerator } from '@web/composables/useAppGenerator';
import { useDocumentBrowser } from '@web/composables/useDocumentBrowser';
import { useNotifs } from '@web/composables/useNotifs';
import { useMenuActionStore } from '@web/stores/menuAction';
import { GALLERY_SHORTCUTS } from '@web/services/apps/builtinApps';
import type { AppDefinition } from '@web/types/apps';
import { CATEGORY_ORDER, inferAppCategory } from '@web/types/apps';

declare const __APP_VERSION__: string;
const appVersion = __APP_VERSION__;
const baseUrl = import.meta.env.BASE_URL;

const appsModal = useAppsModal();
const registry = createAppRegistry();
const windowManager = useWindowManager();
const generator = useAppGenerator();
const notifs = useNotifs();
const menuStore = useMenuActionStore();

const overlayRef = ref<HTMLElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const modalOpen = ref(false);

const apps = ref<readonly AppDefinition[]>([]);
const createPrompt = ref('');
const isCreating = ref(false);

const groupedApps = computed(() => ({
  builtin: [...apps.value.filter((a) => a.source === 'builtin'), ...GALLERY_SHORTCUTS],
  generated: apps.value.filter((a) => a.source === 'generated' || a.source === 'sideloaded'),
  discovered: apps.value.filter((a) => a.source === 'discovered'),
}));

const selectedCategory = ref<string>('all');

const builtinByCategory = computed(() => {
  const all = groupedApps.value.builtin;
  return CATEGORY_ORDER.map((cat) => ({
    ...cat,
    apps: all.filter((a) => inferAppCategory(a) === cat.key),
  })).filter((cat) => cat.apps.length > 0);
});

const filteredCategories = computed(() => {
  if (selectedCategory.value === 'all') return builtinByCategory.value;
  return builtinByCategory.value.filter((c) => c.key === selectedCategory.value);
});

// Modal integration
const modal = useModal({
  getElements: () => ({
    overlay: overlayRef.value,
    dialog: dialogRef.value,
  }),
  onClose: () => appsModal.close(),
  closeOnEscape: true,
  closeOnOverlayClick: true,
  lockBodyScroll: true,
});

// Sync appsModal.isOpen -> modal animation
watch(appsModal.isOpen, async (open) => {
  if (open) {
    modalOpen.value = true;
    await refreshApps();
    await nextTick();
    await modal.open();
  } else {
    await modal.close();
    modalOpen.value = false;
  }
});

function closeModal(): void {
  appsModal.close();
}

function navigateTo(action: string): void {
  appsModal.close();
  useMenuActionStore().dispatch(action);
}

function openSearch(): void {
  appsModal.close();
  import('@web/composables/useSearchModal').then(({ useSearchModal }) => {
    useSearchModal().open();
  });
}

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
  appsModal.close();

  try {
    await generator.generateApp(prompt);
  } finally {
    isCreating.value = false;
    setTimeout(() => void refreshApps(), 3000);
  }
}

function handleLaunch(app: AppDefinition): void {
  appsModal.close();

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

  // Track usage (fire-and-forget)
  void registry.update(app.id, {
    lastOpened: Date.now(),
    openCount: (app.openCount ?? 0) + 1,
  });
}

function handleEdit(appId: string): void {
  generator.enterEditMode(appId);
  appsModal.close();
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
</script>

<style scoped>
.apps-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(10 10 10 / 55%);
  backdrop-filter: blur(var(--effect-backdrop-blur, 6px));
  -webkit-backdrop-filter: blur(var(--effect-backdrop-blur, 6px));
}

.apps-dialog {
  position: relative;
  width: min(680px, 92vw);
  max-height: min(720px, 88vh);
  background: var(--glass-surface-gradient, rgb(30 30 30 / 70%));
  border: 1px solid var(--glass-border-subtle, rgb(255 255 255 / 8%));
  border-radius: var(--radius-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(var(--effect-backdrop-blur, 12px)) saturate(120%);
  -webkit-backdrop-filter: blur(var(--effect-backdrop-blur, 12px)) saturate(120%);
  box-shadow: var(--glass-shadow-idle, 0 25px 60px -12px rgb(0 0 0 / 50%));
}

.apps-media,
.apps-media-scrim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.apps-media-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
  opacity: 0.9;
}

.apps-media-scrim {
  background: linear-gradient(180deg, rgb(8 12 24 / 20%), rgb(6 10 20 / 60%));
}

.apps-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: rgb(10 14 26 / 74%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border-radius: inherit;
}

/* Header */
.apps-header {
  padding: 16px 20px 0;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
}

.apps-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.apps-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgb(255 255 255 / 60%);
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.apps-brand-logo {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}

.apps-brand-version {
  color: rgb(255 255 255 / 35%);
  font-weight: 400;
}

.apps-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.apps-header-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  color: rgb(255 255 255 / 50%);
  font-size: 18px;
  transition:
    background 0.15s,
    color 0.15s;
}

.apps-header-btn:hover {
  background: rgb(255 255 255 / 8%);
  color: #f3f3f3;
}

/* Nav tabs */
.apps-nav {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 10px;
}

.apps-nav::-webkit-scrollbar {
  display: none;
}

.apps-nav-btn {
  all: unset;
  cursor: pointer;
  padding: 5px 12px;
  font-size: var(--font-size-sm);
  font-weight: 450;
  color: rgb(255 255 255 / 50%);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  transition:
    color 0.15s,
    background 0.15s;
}

.apps-nav-btn:hover {
  color: rgb(255 255 255 / 80%);
  background: rgb(255 255 255 / 5%);
}

.apps-nav-btn.active {
  color: #fff;
  background: rgb(255 255 255 / 8%);
}

/* Create input */
.apps-create-row {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid rgb(255 255 255 / 4%);
}

.apps-create-row input {
  flex: 1;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgb(255 255 255 / 8%);
  background: rgb(255 255 255 / 3%);
  color: #fff;
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.apps-create-row input::placeholder {
  color: rgb(255 255 255 / 35%);
}

.apps-create-row input:focus {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 5%);
}

.apps-create-row input:disabled {
  opacity: 0.5;
}

.apps-create-row > button {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 4%);
  border: 1px solid rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 60%);
  font-size: 18px;
  transition:
    background 0.15s,
    color 0.15s;
}

.apps-create-row > button:hover:not(:disabled) {
  background: rgb(255 255 255 / 12%);
  color: #fff;
}

.apps-create-row > button:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Category filter pills */
.apps-category-pills {
  display: flex;
  gap: 6px;
  padding: 0 20px 8px;
  flex-shrink: 0;
}

.apps-pill {
  padding: 4px 12px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--radius-pill);
  background: transparent;
  color: rgb(255 255 255 / 50%);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.apps-pill:hover {
  color: rgb(255 255 255 / 70%);
  border-color: rgb(255 255 255 / 18%);
}

.apps-pill.active {
  color: rgb(255 255 255 / 90%);
  border-color: rgb(255 255 255 / 25%);
  background: rgb(255 255 255 / 8%);
}

/* Content area */
.apps-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 12%) transparent;
}

.apps-content::-webkit-scrollbar {
  width: 6px;
}

.apps-content::-webkit-scrollbar-track {
  background: transparent;
}

.apps-content::-webkit-scrollbar-thumb {
  background: rgb(255 255 255 / 12%);
  border-radius: 3px;
}

/* Sections */
.apps-section {
  margin-bottom: 20px;
}

.apps-section:last-child {
  margin-bottom: 0;
}

.apps-section-header {
  font-size: var(--font-size-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(255 255 255 / 40%);
  margin: 0 0 10px;
}

/* List view */
.apps-list {
  display: flex;
  flex-direction: column;
}

.apps-row {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  transition: background 0.12s;
  box-sizing: border-box;
  width: 100%;
}

.apps-row:hover {
  background: rgb(255 255 255 / 6%);
}

.apps-row--managed {
  cursor: default;
  position: relative;
}

.apps-row-main {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.apps-row-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 6%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.apps-row-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.apps-row-icon iconify-icon {
  font-size: 15px;
  color: rgb(255 255 255 / 40%);
}

.apps-row-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: rgb(255 255 255 / 88%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.apps-row-desc {
  font-size: var(--font-size-xs);
  color: rgb(255 255 255 / 35%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  text-align: right;
}

/* Row hover actions */
.apps-row-actions {
  position: absolute;
  right: 10px;
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

.apps-row--managed:hover .apps-row-actions {
  opacity: 1;
}

.apps-row-actions button {
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
    color 0.15s,
    background 0.15s;
}

.apps-row-actions button:hover {
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 85%);
}

.apps-row-actions .action-delete:hover {
  color: rgb(220 53 69 / 90%);
  background: rgb(220 53 69 / 15%);
}

/* Empty state */
.apps-empty {
  padding: 20px;
  text-align: center;
  font-size: var(--font-size-sm);
  color: rgb(255 255 255 / 35%);
}

/* Mobile */
@media (max-width: 640px) {
  .apps-dialog {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }

  .apps-row-actions {
    opacity: 1;
  }
}
</style>
