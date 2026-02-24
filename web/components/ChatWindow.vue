<template>
  <!-- Empty state when no messages -->
  <div v-if="hasNoMessages" class="chat-empty-container">
    <BaseEmptyState
      icon="ph:chat-circle-text"
      :title="emptyStateTitle"
      :description="emptyStateDescription"
      size="lg"
    >
      <template v-if="!hasApiKey" #action>
        <button class="empty-state-cta" @click="openApiKeysModal">Add API Key</button>
      </template>
      <template v-else #action>
        <div class="empty-state-hints">
          <span class="hint-pill">Try: "Brainstorm ideas"</span>
          <span class="hint-pill">Try: "Explain this concept"</span>
        </div>
      </template>
    </BaseEmptyState>
  </div>

  <!-- Virtual scroller for messages -->
  <VList
    v-else
    ref="scrollerRef"
    :data="allItems"
    class="chat-scroller"
    role="log"
    aria-label="Chat messages"
    aria-live="polite"
    aria-atomic="false"
    @scroll="onScroll"
  >
    <template #default="{ item }">
      <!-- Top spacer pushes content down -->
      <div v-if="item.id === '__top-spacer__'" class="chat-top-spacer"></div>
      <!-- Bottom spacer adds extra scroll space and serves as scroll anchor -->
      <div
        v-else-if="item.id === '__bottom-spacer__'"
        ref="bottomSentinelRef"
        class="chat-bottom-spacer"
      ></div>
      <!-- Regular messages -->
      <MessageItem
        v-else
        :key="item.id"
        :sender="item.sender"
        :message-id="item.id"
        :message-text="item.text"
        :is-streaming="item.isStreaming"
        @edit="handleEditMessage"
      >
        <UserPromptBlock v-if="item.text && item.sender === 'user'" :markdown="item.text" />
        <!-- Book results cards -->
        <div v-else-if="item.parsedBooks" class="card-results-grid">
          <BookCard v-for="(book, bi) in item.parsedBooks" :key="`book-${bi}`" :book="book" />
        </div>
        <!-- Essay results cards -->
        <div v-else-if="item.parsedEssays" class="card-results-grid">
          <EssayCard v-for="(essay, ei) in item.parsedEssays" :key="`essay-${ei}`" :essay="essay" />
        </div>
        <!-- Film results cards -->
        <div v-else-if="item.parsedFilms" class="card-results-grid">
          <FilmCard v-for="(film, fi) in item.parsedFilms" :key="`film-${fi}`" :film="film" />
        </div>
        <RichContent v-else-if="item.text" :markdown="item.text" />
        <AttachmentStrip v-if="item.images && item.images.length" :images="item.images" />
        <LoadedSkillsIndicator
          v-if="item.sender === 'assistant' && item.loadedSkills && item.loadedSkills.length"
          :skills="item.loadedSkills"
          :condensed="item.condensedSkills || []"
        />
      </MessageItem>
    </template>
  </VList>

  <!-- Scroll to bottom button when user scrolls up during streaming -->
  <ScrollToBottomButton :visible="!isSticky && streaming.active" @click="forceScrollToBottom" />

  <!-- Screen reader status announcer for streaming -->
  <div v-if="streaming.active" class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    Assistant is responding...
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { VList } from 'virtua/vue';
import { useChatStore } from '@web/stores/chat.js';
import { useSessionGate } from '@web/composables/useSessionGate';
import { useEventBus } from '@web/services/eventBus';
import { useStickToBottom, type VListHandle } from '@web/composables/useStickToBottom';
import { useDotmatrixSync } from '@web/composables/useDotmatrixSync';
import MessageItem from './MessageItem.vue';
import RichContent from './RichContent.vue';
import AttachmentStrip from './AttachmentStrip.vue';
import UserPromptBlock from './UserPromptBlock.vue';
import BookCard from './BookCard.vue';
import EssayCard from './EssayCard.vue';
import FilmCard from './FilmCard.vue';
import BaseEmptyState from './ui/BaseEmptyState.vue';
import ScrollToBottomButton from './ScrollToBottomButton.vue';
import LoadedSkillsIndicator from './chat/LoadedSkillsIndicator.vue';
import type {
  ImageEntry,
  BookResultItem,
  EssayResultItem,
  FilmResultItem,
} from '@web/types/chat.js';

// Session gate for API key status
const { hasApiKey } = useSessionGate();

// Detect mobile/touch device
const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window;

// Empty state content based on context
const emptyStateTitle = computed(() => {
  if (!hasApiKey.value) {
    return 'Welcome to Prvctice';
  }
  return 'Start a conversation';
});

const emptyStateDescription = computed(() => {
  if (!hasApiKey.value) {
    return 'Add an API key in settings to chat with AI';
  }
  if (isMobile) {
    return 'Tap below to type or hold the mic to speak';
  }
  return 'Type, speak, or drop an image to begin';
});

// Open API keys modal (now in AI pane)
function openApiKeysModal(): void {
  useEventBus().emit('panel:open', { panel: 'settings', pane: 'ai' });
}

// Parse book results from marker text: <!--book_results:JSON-->
const bookResultsCache = new Map<string, BookResultItem[] | null>();
function parseBookResults(text: string): BookResultItem[] | null {
  if (!text || !text.startsWith('<!--book_results:')) return null;
  const cached = bookResultsCache.get(text);
  if (cached !== undefined) return cached;
  try {
    const json = text.slice('<!--book_results:'.length, -'-->'.length);
    const parsed = JSON.parse(json) as BookResultItem[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      bookResultsCache.set(text, parsed);
      return parsed;
    }
  } catch (_) {
    // Intentional: not a book results message
  }
  bookResultsCache.set(text, null);
  return null;
}

// Parse essay results from marker text: <!--essay_results:JSON-->
const essayResultsCache = new Map<string, EssayResultItem[] | null>();
function parseEssayResults(text: string): EssayResultItem[] | null {
  if (!text || !text.startsWith('<!--essay_results:')) return null;
  const cached = essayResultsCache.get(text);
  if (cached !== undefined) return cached;
  try {
    const json = text.slice('<!--essay_results:'.length, -'-->'.length);
    const parsed = JSON.parse(json) as EssayResultItem[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      essayResultsCache.set(text, parsed);
      return parsed;
    }
  } catch (_) {
    // Intentional: not an essay results message
  }
  essayResultsCache.set(text, null);
  return null;
}

// Parse film results from marker text: <!--film_results:JSON-->
const filmResultsCache = new Map<string, FilmResultItem[] | null>();
function parseFilmResults(text: string): FilmResultItem[] | null {
  if (!text || !text.startsWith('<!--film_results:')) return null;
  const cached = filmResultsCache.get(text);
  if (cached !== undefined) return cached;
  try {
    const json = text.slice('<!--film_results:'.length, -'-->'.length);
    const parsed = JSON.parse(json) as FilmResultItem[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      filmResultsCache.set(text, parsed);
      return parsed;
    }
  } catch (_) {
    // Intentional: not a film results message
  }
  filmResultsCache.set(text, null);
  return null;
}

interface ChatItem {
  id: string;
  sender: string;
  text: string;
  images?: ImageEntry[];
  loadedSkills?: string[];
  condensedSkills?: string[];
  isStreaming: boolean;
  parsedBooks?: BookResultItem[] | null;
  parsedEssays?: EssayResultItem[] | null;
  parsedFilms?: FilmResultItem[] | null;
}

interface EditMessageEvent {
  messageId: string;
  newText: string;
}

const chat = useChatStore();
const { messages, streaming, activeConversationId } = storeToRefs(chat);

// Clear parse caches when switching conversations to prevent memory leaks
watch(activeConversationId, () => {
  bookResultsCache.clear();
  essayResultsCache.clear();
  filmResultsCache.clear();
});

const scrollerRef = ref<VListHandle | null>(null);
const bottomSentinelRef = ref<HTMLElement | null>(null);

// Dotmatrix animation coordination (extracted to composable)
const { isDotmatrixActive, initialLoadComplete } = useDotmatrixSync();

// Check if there are no messages (for empty state display)
// Hide during initial load and when dotmatrix animation is active
const hasNoMessages = computed(() => {
  if (!initialLoadComplete.value) return false;
  return messages.value.length === 0 && !streaming.value.active && !isDotmatrixActive.value;
});

// Handle message editing
function handleEditMessage({ messageId, newText }: EditMessageEvent): void {
  if (!messageId || !newText) return;
  chat.editMessage(messageId, newText);
}

// Combine messages with streaming buffer as a single list for virtual scroller
const allItems = computed<ChatItem[]>(() => {
  // Start with a spacer item to push content down
  const items: ChatItem[] = [
    {
      id: '__top-spacer__',
      sender: 'spacer',
      text: '',
      images: [],
      isStreaming: false,
    },
  ];

  // Add all messages with pre-computed parsed results
  messages.value.forEach((m) => {
    items.push({
      ...m,
      isStreaming: false,
      parsedBooks: parseBookResults(m.text),
      parsedEssays: parseEssayResults(m.text),
      parsedFilms: parseFilmResults(m.text),
    });
  });

  // Add streaming buffer as a virtual message at the end
  if (streaming.value.active && streaming.value.buffer) {
    items.push({
      id: '__streaming__',
      sender: 'assistant',
      text: streaming.value.buffer as string,
      images: [],
      isStreaming: true,
    });
  }

  // Add bottom spacer for extra scroll space
  items.push({
    id: '__bottom-spacer__',
    sender: 'spacer',
    text: '',
    images: [],
    isStreaming: false,
  });

  return items;
});

// Content length for sticky behavior
const contentLength = computed(() => allItems.value.length);

// Use sticky-to-bottom composable with Intersection Observer
const { isSticky, scrollToBottom, scrollToBottomDebounced, forceScrollToBottom, onScroll } =
  useStickToBottom(scrollerRef, contentLength, bottomSentinelRef);

// Watch for new messages
watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    if (isSticky.value) {
      scrollToBottom();
    }
  }
);

// Watch streaming state changes
watch(
  () => streaming.value.active,
  async (active: boolean) => {
    // When streaming starts, ensure we're scrolled to bottom if sticky
    if (active && isSticky.value) {
      await nextTick();
      scrollToBottom();
    }
  }
);

// Watch streaming buffer updates - debounced scroll for streaming
watch(
  () => streaming.value.buffer,
  () => {
    if (streaming.value.active && isSticky.value) {
      // Virtua measures automatically via ResizeObserver
      // Just need to scroll to bottom with rAF debounce
      scrollToBottomDebounced();
    }
  }
);

// ResizeObserver to handle container size changes (e.g., panels opening/closing)
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  // Initial scroll to bottom
  nextTick(() => {
    if (isSticky.value) {
      scrollToBottom();
    }
  });

  // Dotmatrix coordination handled by useDotmatrixSync composable

  // Watch for container size changes
  const container = document.getElementById('chat-window');
  if (container && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      // Container resized - if we should be at bottom, scroll there
      if (isSticky.value) {
        scrollToBottomDebounced();
      }
    });
    resizeObserver.observe(container);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  // Dotmatrix cleanup handled by useDotmatrixSync composable
});
</script>

<style scoped>
.chat-empty-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: var(--space-8);
}

.chat-scroller {
  /* Use viewport height instead of percentage - fixes DynamicScroller
   not rendering when parent is position:fixed */
  height: calc(100dvh - var(--chat-input-offset, 90px));
  width: 100%;
  overflow-y: auto;

  /* Smooth scroll enables 120Hz-native animations on ProMotion displays */
  scroll-behavior: smooth;

  /* Hide scrollbars for clean aesthetic */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* Disable scroll anchoring on dynamic content */
.chat-scroller :deep(*) {
  overflow-anchor: none;
}

.chat-scroller::-webkit-scrollbar {
  display: none;
}

/* Spacer at top pushes first message down */

.chat-top-spacer {
  height: 6vh;
}

/* Spacer at bottom extends scroll area and serves as scroll anchor */

.chat-bottom-spacer {
  height: 10px;
  overflow-anchor: auto;
}

/* Mobile adjustments */

@media (max-width: 768px) {
  .chat-top-spacer {
    /* Adjust this value for mobile */
    height: 2vh;
  }

  .chat-bottom-spacer {
    height: 10px;
  }
}

/* Empty state CTA button */

.empty-state-cta {
  background: var(--color-btn-primary-bg, #fff);
  color: var(--color-btn-primary-text, #071028);
  border: none;
  border-radius: var(--radius-pill, 999px);
  padding: var(--space-3, 6px) var(--space-6, 16px);
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

.empty-state-cta:hover {
  background: var(--color-btn-primary-bg-hover, #f0f4ff);
  transform: translateY(-1px);
}

.empty-state-cta:active {
  transform: translateY(0);
}

/* Empty state hint pills */

.empty-state-hints {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 4px);
  justify-content: center;
}

.hint-pill {
  background: var(--color-toggle-bg-off, rgb(255 255 255 / 10%));
  color: var(--color-text-muted, rgb(255 255 255 / 50%));
  padding: var(--space-2, 4px) var(--space-3, 6px);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-xs, 0.75rem);
  opacity: 0.7;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.hint-pill:hover {
  opacity: 1;
  background: var(--color-toggle-bg-on, rgb(255 255 255 / 15%));
}

/* Card results grid for books/essays */

.card-results-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .chat-scroller {
    scroll-behavior: auto;
  }
}
</style>
