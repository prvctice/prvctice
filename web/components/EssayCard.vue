<template>
  <div class="essay-card">
    <div class="essay-info">
      <a class="essay-title" :href="essay.sourceUrl" target="_blank" rel="noopener noreferrer">
        {{ essay.title }}
      </a>
      <p v-if="essay.authors.length" class="essay-authors">
        {{ essay.authors.join(', ') }}
      </p>
      <p v-if="essay.abstract" class="essay-abstract">{{ essay.abstract }}</p>
      <div class="essay-meta">
        <span v-if="essay.year" class="essay-year">{{ essay.year }}</span>
        <span v-if="essay.year && essay.citationCount" class="essay-divider">&mdash;</span>
        <span v-if="essay.citationCount" class="essay-citations">
          {{ essay.citationCount }} citation{{ essay.citationCount === 1 ? '' : 's' }}
        </span>
        <span v-if="essay.isOpenAccess" class="open-access-badge">Open Access</span>
        <a
          v-if="essay.pdfUrl"
          class="pdf-link"
          :href="essay.pdfUrl"
          target="_blank"
          rel="noopener noreferrer"
          @click.stop
        >
          PDF
        </a>
        <span class="source-badge" title="Semantic Scholar">S2</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EssayResultItem } from '@web/types/chat.js';

defineProps<{
  essay: EssayResultItem;
}>();
</script>

<style scoped>
.essay-card {
  display: flex;
  padding: 12px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-card-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--color-card-border, rgba(255, 255, 255, 0.06));
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.essay-card:hover {
  background: var(--color-card-bg-hover, rgba(255, 255, 255, 0.06));
  border-color: var(--color-card-border-hover, rgba(255, 255, 255, 0.12));
}

.essay-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.essay-title {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  margin: 0;
  color: inherit;
  text-decoration: none;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

.essay-title:hover {
  text-decoration: underline;
}

.essay-authors {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.essay-abstract {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.essay-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 4px;
  flex-wrap: wrap;
}

.essay-year,
.essay-citations {
  font-size: 0.625rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  font-weight: 500;
}

.essay-divider {
  font-size: 0.625rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.3));
}

.open-access-badge {
  padding: 1px 5px;
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.2;
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 3px;
}

.pdf-link {
  padding: 1px 5px;
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.2;
  color: #60a5fa;
  text-decoration: none;
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: 3px;
  transition: background 0.15s ease;
}

.pdf-link:hover {
  background: rgba(96, 165, 250, 0.1);
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
  margin-left: auto;
}
</style>
