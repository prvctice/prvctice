<template>
  <teleport to="body">
    <div
      v-if="historyUi.visible.value"
      class="chat-history-overlay"
      data-no-orbit
      @click.self="handleClose"
    >
      <section
        ref="panelRef"
        class="chat-history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Chat history"
        tabindex="-1"
      >
        <div class="chat-history-media" aria-hidden="true">
          <video
            class="chat-history-video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="chat-history-scrim"></div>
        </div>
        <div class="chat-history-inner">
          <div class="chat-history-top">
            <div class="chat-history-logo" aria-hidden="true">
              <img :src="baseUrl + 'images/logo-white.png'" alt="" loading="lazy" />
            </div>
            <h2>Pick up where you left off</h2>
            <p>Latest 20 chats · stored locally</p>
          </div>

          <div class="chat-history-body">
            <div v-if="loading" class="history-skeleton" aria-label="Loading chat history">
              <div v-for="i in 3" :key="i" class="history-skeleton-card">
                <BaseSkeleton variant="text" width="70%" height="1.1em" />
                <BaseSkeleton
                  variant="text"
                  width="50%"
                  height="0.9em"
                  style="margin-top: 8px; opacity: 0.6"
                />
              </div>
            </div>
            <div v-else-if="error" class="history-callout error">
              <p>{{ error }}</p>
            </div>
            <BaseEmptyState
              v-else-if="!conversations.length"
              icon="ph:chat-circle-dots"
              title="No saved chats yet"
              description="Start a conversation and it will appear here."
              size="sm"
            />
            <ul v-else class="history-list">
              <li v-for="convo in conversations" :key="convo.id">
                <button
                  type="button"
                  class="history-item"
                  :class="{
                    selected: convo.id === currentConversationId,
                    loading: selectingId === convo.id,
                  }"
                  :disabled="selectingId === convo.id"
                  @click="selectConversation(convo.id)"
                >
                  <div class="history-title">{{ convo.title || 'Untitled chat' }}</div>
                  <div class="history-meta">
                    <span>{{ formatTimestamp(convo.updatedAt) || 'Just now' }}</span>
                    <span class="dot">•</span>
                    <span class="provider">{{ formatProvider(convo.provider) }}</span>
                  </div>
                </button>
              </li>
            </ul>
          </div>

          <footer class="chat-history-footer">
            <button class="refresh" type="button" @click="refresh" :disabled="loading">
              <iconify-icon icon="ph:arrow-counter-clockwise"></iconify-icon>
              <span>{{ loading ? 'Refreshing…' : 'Refresh' }}</span>
            </button>
            <button class="secondary" type="button" @click="handleClose">Close</button>
            <p class="hint">Chats never leave this device.</p>
          </footer>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@web/stores/chat.js';
import { useChatHistoryUi } from '@web/composables/useChatHistoryUi.js';
import BaseSkeleton from '@web/components/ui/BaseSkeleton.vue';
import BaseEmptyState from '@web/components/ui/BaseEmptyState.vue';

// Extend Window for bar functions
declare global {
  interface Window {
    lowerBarToBottom?: () => void;
  }
}

interface Conversation {
  id: string;
  title?: string;
  updatedAt?: string | number;
  provider?: string;
}

const MAX_HISTORY_ITEMS = 20;
const chat = useChatStore();
const historyUi = useChatHistoryUi();
const { activeConversationId } = storeToRefs(chat);
const currentConversationId = computed<string | null>(() => activeConversationId.value || null);

const conversations = ref<Conversation[]>([]);
const loading = ref(false);
const error = ref('');
const selectingId = ref<string | null>(null);

// Focus management
const panelRef = ref<HTMLElement | null>(null);
const lastFocusedElement = ref<Element | null>(null);

async function refresh(): Promise<void> {
  if (typeof chat.listConversations !== 'function') {
    conversations.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    conversations.value = (await chat.listConversations(MAX_HISTORY_ITEMS)) || [];
  } catch (err) {
    console.warn('[chat-history] Failed to load list', err);
    error.value = (err as Error)?.message || 'Failed to load chat history.';
  } finally {
    loading.value = false;
  }
}

async function selectConversation(id: string): Promise<void> {
  if (!id || typeof chat.loadConversation !== 'function') return;
  if (selectingId.value) return;
  selectingId.value = id;
  error.value = '';
  try {
    const ok = await chat.loadConversation(id);
    if (!ok) {
      error.value = 'Unable to open that chat. Try refreshing.';
      selectingId.value = null;
      return;
    }
    selectingId.value = null;
    handleClose();
    await nextTick();
    try {
      const chatWindow = document.getElementById('chat-window');
      if (chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;
      if (typeof window.lowerBarToBottom === 'function') window.lowerBarToBottom();
    } catch (_) {}
  } catch (err) {
    console.warn('[chat-history] Failed to open conversation', err);
    error.value = 'Unable to open that chat.';
    selectingId.value = null;
  }
}

function handleClose(): void {
  historyUi.close();
  selectingId.value = null;
}

function handleKeydown(evt: KeyboardEvent): void {
  if (evt.key === 'Escape') {
    evt.preventDefault();
    handleClose();
  }
}

function formatTimestamp(ts: string | number | undefined): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function formatProvider(provider: string | undefined): string {
  if (!provider) return 'local';
  return String(provider).toLowerCase();
}

watch(
  () => historyUi.visible.value,
  (visible: boolean) => {
    try {
      document.body.classList.toggle('chat-history-open', visible);
    } catch (_) {}
    if (visible) {
      // Save current focus
      lastFocusedElement.value = document.activeElement;
      refresh();
      error.value = '';
      selectingId.value = null;
      window.addEventListener('keydown', handleKeydown);
      // Focus the panel after render
      nextTick(() => {
        panelRef.value?.focus();
      });
    } else {
      window.removeEventListener('keydown', handleKeydown);
      selectingId.value = null;
      // Restore focus to previous element
      if (lastFocusedElement.value instanceof HTMLElement) {
        lastFocusedElement.value.focus();
      }
    }
  }
);

onBeforeUnmount((): void => {
  window.removeEventListener('keydown', handleKeydown);
  try {
    document.body.classList.remove('chat-history-open');
  } catch (_) {}
});
</script>

<style scoped>
.chat-history-overlay {
  position: fixed;
  inset: 0;
  background: rgb(3 6 12 / 50%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 4000;
}

.chat-history-panel {
  position: relative;
  width: min(460px, calc(100% - 32px));
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow:
    0 22px 60px rgb(0 0 0 / 35%),
    0 4px 18px rgb(0 0 0 / 18%);
}

.chat-history-media,
.chat-history-scrim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.chat-history-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
  opacity: 0.9;
}

.chat-history-scrim {
  background: linear-gradient(180deg, rgb(8 12 24 / 20%), rgb(6 10 20 / 60%));
}

.chat-history-inner {
  position: relative;
  border-radius: var(--radius-xl);
  background: rgb(10 14 26 / 74%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 22px 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: rgb(255 255 255 / 95%);
  z-index: 1;
}

.chat-history-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 12px;
  text-align: center;
  align-items: center;
}

.chat-history-logo {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chat-history-logo img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.chat-history-top h2 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: 0.01em;
  font-weight: 700;
}

.chat-history-top p {
  margin: 0;
  color: rgb(255 255 255 / 78%);
  font-size: 0.95rem;
}

.chat-history-body {
  max-height: min(360px, 60vh);
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
}

.history-skeleton {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-skeleton-card {
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--radius-xl);
  background: rgb(255 255 255 / 6%);
  padding: 16px;
}

.history-callout {
  border-radius: var(--radius-xl);
  padding: 18px;
  background: rgb(255 255 255 / 10%);
  border: 1px solid rgb(255 255 255 / 24%);
  color: rgb(255 255 255 / 88%);
  text-align: center;
  width: 100%;
  max-width: 360px;
}

.history-callout.error {
  border-color: rgb(248 113 113 / 80%);
  background: rgb(248 113 113 / 16%);
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  width: 100%;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-xl);
  background: rgb(255 255 255 / 10%);
  padding: 16px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.history-item:hover,
.history-item:focus-visible {
  border-color: rgb(255 255 255 / 32%);
  background: rgb(255 255 255 / 16%);
  box-shadow: 0 8px 18px rgb(0 0 0 / 12%);
}

.history-item.selected {
  border-color: rgb(255 255 255 / 50%);
  background: rgb(255 255 255 / 22%);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 35%);
}

.history-item.loading {
  opacity: 0.6;
  cursor: progress;
}

.history-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 6px;
  color: #f8f8fb;
}

.history-meta {
  font-size: 0.86rem;
  color: rgb(255 255 255 / 70%);
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-meta .dot {
  opacity: 0.6;
}

.history-meta .provider {
  text-transform: capitalize;
  letter-spacing: 0.04em;
}

.chat-history-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.chat-history-footer .hint {
  margin: 4px 0 0;
  width: 100%;
  text-align: center;
  font-size: 0.84rem;
  color: rgb(255 255 255 / 68%);
}

.refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: var(--radius-pill);
  padding: 10px 18px;
  background: #fff;
  color: #0a1020;
  cursor: pointer;
  font-weight: 600;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.refresh:hover:not(:disabled) {
  box-shadow: 0 8px 18px rgb(0 0 0 / 12%);
  transform: translateY(-1px);
}

.refresh:disabled {
  opacity: 0.6;
  cursor: progress;
}

.secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgb(255 255 255 / 60%);
  border-radius: var(--radius-pill);
  padding: 10px 18px;
  background: transparent;
  color: rgb(255 255 255 / 95%);
  cursor: pointer;
  font-weight: 600;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
}

.secondary:hover:not(:disabled) {
  border-color: rgb(255 255 255 / 90%);
  box-shadow: 0 8px 18px rgb(0 0 0 / 12%);
  transform: translateY(-1px);
}

@media (max-width: 640px) {
  .chat-history-overlay {
    padding: 12px;
  }

  .chat-history-inner {
    padding: 22px 20px 18px;
  }

  .chat-history-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .refresh {
    justify-content: center;
  }
}
</style>
