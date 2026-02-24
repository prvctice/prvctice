<template>
  <a
    class="book-card"
    :href="book.sourceUrl"
    target="_blank"
    rel="noopener noreferrer"
    :title="book.title"
  >
    <div v-if="book.coverUrl" class="book-cover">
      <img :src="book.coverUrl" :alt="book.title" loading="lazy" decoding="async" />
    </div>
    <div class="book-info">
      <h4 class="book-title">{{ book.title }}</h4>
      <p v-if="book.authors.length" class="book-authors">
        {{ book.authors.join(', ') }}
      </p>
      <p v-if="book.description" class="book-description">{{ book.description }}</p>
      <div class="book-meta">
        <span v-if="book.publishYear" class="book-year">{{ book.publishYear }}</span>
        <span class="source-badge" :title="book.source">{{ sourceAbbrev }}</span>
      </div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BookResultItem } from '@web/types/chat.js';

const props = defineProps<{
  book: BookResultItem;
}>();

const SOURCE_ABBREVIATIONS: Record<string, string> = {
  'Open Library': 'OL',
  'Google Books': 'GBooks',
};

const sourceAbbrev = computed(() => SOURCE_ABBREVIATIONS[props.book.source] || props.book.source);
</script>

<style scoped>
.book-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--color-card-border, rgba(255, 255, 255, 0.08));
  text-decoration: none;
  color: inherit;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
  overflow: hidden;
}

.book-card:hover {
  background: var(--color-card-bg-hover, rgba(255, 255, 255, 0.07));
  border-color: var(--color-card-border-hover, rgba(255, 255, 255, 0.15));
}

.book-cover {
  flex-shrink: 0;
  width: 80px;
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
}

.book-cover img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.book-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.book-title {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.book-authors {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-description {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.book-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 4px;
}

.book-year {
  font-size: 0.625rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  font-weight: 500;
}

.source-badge {
  padding: 2px 6px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.2;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 4px;
  opacity: 0.85;
}

@media (max-width: 480px) {
  .book-card {
    flex-direction: column;
  }

  .book-cover {
    width: 100%;
    max-height: 160px;
  }

  .book-cover img {
    width: 100%;
    max-height: 160px;
    object-fit: contain;
  }
}
</style>
