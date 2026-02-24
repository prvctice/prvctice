<template>
  <teleport to="body">
    <div v-if="isOpen" ref="overlayRef" class="search-overlay" data-no-orbit @click.self="close">
      <div
        ref="dialogRef"
        class="search-dialog"
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-owns="search-listbox"
      >
        <div class="search-media" aria-hidden="true">
          <video
            class="search-media-video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="search-media-scrim"></div>
        </div>
        <div class="search-inner">
          <!-- Search input -->
          <div class="search-input-wrap">
            <iconify-icon icon="ph:magnifying-glass" class="search-icon" aria-hidden="true" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="search-input"
              placeholder="Search conversations, notes, skills..."
              role="combobox"
              aria-autocomplete="list"
              aria-controls="search-listbox"
              :aria-activedescendant="activeDescendantId"
              @keydown="onKeydown"
            />
            <button class="search-close-btn" aria-label="Close search" @click="close">
              <iconify-icon icon="ph:x" aria-hidden="true" />
            </button>
          </div>

          <!-- Results list -->
          <div
            v-if="hasResults"
            id="search-listbox"
            role="listbox"
            aria-label="Search results"
            class="search-results"
          >
            <template v-for="[providerId, group] in sortedGroups" :key="providerId">
              <div class="search-group-header" role="presentation">
                <iconify-icon :icon="group.icon" aria-hidden="true" />
                <span>{{ group.label }}</span>
              </div>
              <div
                v-for="item in group.items"
                :key="item.id"
                :id="`search-result-${providerId}-${item.id}`"
                role="option"
                :aria-selected="isActive(providerId, item.id)"
                class="search-result-item"
                :class="{ active: isActive(providerId, item.id) }"
                @click="onResultClick(providerId, item)"
                @mouseenter="onResultHover(providerId, item)"
              >
                <iconify-icon :icon="item.icon" class="result-icon" aria-hidden="true" />
                <div class="result-text">
                  <div class="result-title">{{ item.title }}</div>
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div
                    v-if="item.subtitle && item.metadata?.hasHtmlSnippet"
                    class="result-subtitle snippet-highlight"
                    v-html="sanitizeSnippet(item.subtitle)"
                  />
                  <div v-else-if="item.subtitle" class="result-subtitle">{{ item.subtitle }}</div>
                </div>
              </div>
            </template>
          </div>

          <!-- Empty state -->
          <div v-else class="search-empty">
            <span class="search-empty-text">{{
              query ? 'No results found' : 'Start typing to search...'
            }}</span>
          </div>

          <!-- Footer actions -->
          <div class="search-footer">
            <button class="search-footer-action" @click="onNewChat">
              <iconify-icon icon="ph:plus" aria-hidden="true" />
              <span>New Chat</span>
            </button>
            <button class="search-footer-action" @click="onOpenFiles">
              <iconify-icon icon="ph:folder-open" aria-hidden="true" />
              <span>Open Files</span>
            </button>
            <button class="search-footer-action" @click="onNewNote">
              <iconify-icon icon="ph:note-pencil" aria-hidden="true" />
              <span>New Note</span>
            </button>
            <button class="search-footer-action" @click="onOpenApps">
              <iconify-icon icon="ph:squares-four" aria-hidden="true" />
              <span>Open Apps</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useSearchModal } from '@web/composables/useSearchModal';
import { useUniversalSearch } from '@web/composables/useUniversalSearch';
import { useModal } from '@web/composables/useModal';
import type { SearchResult } from '@web/types/search';

const baseUrl = import.meta.env.BASE_URL;

const { isOpen, query, results, activeIndex, flatResults, close, moveDown, moveUp, selectActive } =
  useSearchModal();

const universalSearch = useUniversalSearch();

const overlayRef = ref<HTMLElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

// Use useModal for animation and Escape handling
const modal = useModal({
  getElements: () => ({
    overlay: overlayRef.value,
    dialog: dialogRef.value,
  }),
  onClose: () => close(),
  closeOnEscape: true,
  closeOnOverlayClick: false, // We handle overlay click via @click.self
  lockBodyScroll: true,
});

// Sync search modal open state -> useModal animations
watch(isOpen, async (open) => {
  if (open) {
    await nextTick();
    await modal.open();
    await nextTick();
    inputRef.value?.focus();
  } else {
    await modal.close();
  }
});

// Sorted groups by priority (ascending)
const sortedGroups = computed(() => {
  const entries = Object.entries(results.value);
  return [...entries].sort(([, a], [, b]) => a.priority - b.priority);
});

const hasResults = computed(() => flatResults.value.length > 0);

// Active descendant ID for aria
const activeDescendantId = computed(() => {
  const idx = activeIndex.value;
  if (idx < 0 || idx >= flatResults.value.length) return undefined;
  const entry = flatResults.value[idx];
  if (!entry) return undefined;
  return `search-result-${entry.providerId}-${entry.result.id}`;
});

// Check if a given result is the currently active one
function isActive(providerId: string, itemId: string): boolean {
  const idx = activeIndex.value;
  if (idx < 0 || idx >= flatResults.value.length) return false;
  const entry = flatResults.value[idx];
  if (!entry) return false;
  return entry.providerId === providerId && entry.result.id === itemId;
}

/**
 * Sanitize FTS5 snippet HTML: only allow <mark> tags.
 * Prevents XSS from message content while preserving highlight markers.
 */
function sanitizeSnippet(html: string): string {
  return html
    .replace(/<mark>/g, '\x00MARK_OPEN\x00')
    .replace(/<\/mark>/g, '\x00MARK_CLOSE\x00')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\x00MARK_OPEN\x00/g, '<mark>')
    .replace(/\x00MARK_CLOSE\x00/g, '</mark>');
}

// Result click handler
function onResultClick(providerId: string, item: SearchResult): void {
  if (providerId === 'messages') {
    const convId = item.metadata?.conversationId as string | undefined;
    if (convId) {
      import('@web/stores/chat').then(({ useChatStore }) => {
        const chat = useChatStore();
        chat.loadConversation(convId);
      });
    }
    close();
    return;
  }
  universalSearch.executeResult(providerId, item);
  close();
}

// Hover sets activeIndex to the hovered item
function onResultHover(providerId: string, item: SearchResult): void {
  const idx = flatResults.value.findIndex(
    (e) => e.providerId === providerId && e.result.id === item.id
  );
  if (idx >= 0) {
    activeIndex.value = idx;
  }
}

// Keyboard handler for arrow nav and enter
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveDown();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveUp();
  } else if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault();
    selectActive();
  }
}

// Footer actions
function onNewChat(): void {
  close();
  if (typeof window.startNewChat === 'function') {
    window.startNewChat();
  }
}

function onOpenFiles(): void {
  close();
  import('@web/composables/useDocumentBrowser').then(({ useDocumentBrowser }) => {
    useDocumentBrowser().open();
  });
}

function onNewNote(): void {
  close();
  import('@web/composables/useNotesTabs').then(({ useNotesTabs }) => {
    const notesTabs = useNotesTabs();
    notesTabs.newTab();
    if (typeof window.openNotesPane === 'function') {
      window.openNotesPane();
    }
  });
}

function onOpenApps(): void {
  close();
  import('@web/composables/useAppsModal').then(({ useAppsModal }) => {
    useAppsModal().open();
  });
}

// Scroll active result into view
watch(activeIndex, (idx) => {
  if (idx < 0) return;
  const entry = flatResults.value[idx];
  if (!entry) return;
  const elId = `search-result-${entry.providerId}-${entry.result.id}`;
  const el = document.getElementById(elId);
  if (el) {
    el.scrollIntoView({ block: 'nearest' });
  }
});
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  background: rgb(10 10 10 / 55%);
  backdrop-filter: blur(var(--effect-backdrop-blur, 6px));
  -webkit-backdrop-filter: blur(var(--effect-backdrop-blur, 6px));
}

.search-dialog {
  position: relative;
  width: min(520px, 92vw);
  max-height: 60vh;
  background: rgb(30 30 30 / 70%);
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: var(--radius-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px -12px rgb(0 0 0 / 50%);
}

.search-media,
.search-media-scrim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.search-media-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
  opacity: 0.9;
}

.search-media-scrim {
  background: linear-gradient(180deg, rgb(8 12 24 / 20%), rgb(6 10 20 / 60%));
}

.search-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: rgb(10 14 26 / 74%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);

  /* Force light-on-dark tokens so text remains visible on light themes */
  --color-text-primary: rgb(255 255 255 / 95%);
  --color-text-secondary: rgb(255 255 255 / 70%);
  --color-text-muted: rgb(255 255 255 / 45%);
  --color-text-hint: rgb(255 255 255 / 30%);
  --color-input-text: rgb(255 255 255 / 90%);
  --color-input-bg: rgb(255 255 255 / 6%);
  --color-input-border: rgb(255 255 255 / 12%);
  --color-btn-ghost-text: rgb(255 255 255 / 70%);
  --color-btn-ghost-bg-hover: rgb(255 255 255 / 8%);
}

.search-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
}

.search-icon {
  color: rgb(255 255 255 / 50%);
  font-size: 1.15rem;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f3f3f3;
  font-size: 1rem;
  line-height: 1.4;
}

.search-input::placeholder {
  color: rgb(255 255 255 / 40%);
}

.search-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: var(--radius-sm);
  color: rgb(255 255 255 / 50%);
  font-size: 0.9rem;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.1s ease,
    color 0.1s ease;
}

.search-close-btn:hover {
  background: rgb(255 255 255 / 12%);
  color: rgb(255 255 255 / 80%);
}

.search-results {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.search-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(255 255 255 / 50%);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.search-result-item:hover,
.search-result-item.active {
  background: rgb(255 255 255 / 8%);
}

.result-icon {
  color: rgb(255 255 255 / 70%);
  font-size: 1.1rem;
  flex-shrink: 0;
}

.result-text {
  flex: 1;
  min-width: 0;
}

.result-title {
  color: #f3f3f3;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-subtitle {
  color: rgb(255 255 255 / 50%);
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.snippet-highlight {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.snippet-highlight :deep(mark) {
  background: var(--color-accent-muted, rgba(255, 200, 50, 0.25));
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.search-empty-text {
  color: rgb(255 255 255 / 50%);
  font-size: 0.9rem;
}

.search-footer {
  display: flex;
  gap: 4px;
  border-top: 1px solid rgb(255 255 255 / 10%);
  padding: 8px 12px;
}

.search-footer-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: rgb(255 255 255 / 60%);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    background 0.1s ease,
    color 0.1s ease;
  white-space: nowrap;
}

.search-footer-action:hover {
  background: rgb(255 255 255 / 8%);
  color: #f3f3f3;
}
</style>
