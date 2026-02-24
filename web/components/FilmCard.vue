<template>
  <a
    class="film-card"
    :href="film.tmdbUrl"
    target="_blank"
    rel="noopener noreferrer"
    :title="film.title"
  >
    <div v-if="film.posterUrl" class="film-poster">
      <img :src="film.posterUrl" :alt="film.title" loading="lazy" decoding="async" />
    </div>
    <div class="film-info">
      <h4 class="film-title">{{ film.title }}</h4>
      <p v-if="film.director" class="film-director">{{ film.director }}</p>
      <p v-if="film.synopsis" class="film-synopsis">{{ film.synopsis }}</p>
      <p v-if="crewLine" class="film-crew">{{ crewLine }}</p>
      <div class="film-meta">
        <span v-if="film.year" class="film-year">{{ film.year }}</span>
        <a
          class="letterboxd-link"
          :href="film.letterboxdUrl"
          target="_blank"
          rel="noopener noreferrer"
          @click.stop
        >
          Letterboxd
        </a>
        <span class="source-badge">TMDB</span>
      </div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FilmResultItem } from '@web/types/chat.js';

const props = defineProps<{
  film: FilmResultItem;
}>();

const crewLine = computed(() => {
  const parts: string[] = [];
  if (props.film.cinematographer) parts.push(`DP: ${props.film.cinematographer}`);
  if (props.film.composer) parts.push(`Composer: ${props.film.composer}`);
  if (props.film.writer) parts.push(`Writer: ${props.film.writer}`);
  return parts.join(', ');
});
</script>

<style scoped>
.film-card {
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

.film-card:hover {
  background: var(--color-card-bg-hover, rgba(255, 255, 255, 0.07));
  border-color: var(--color-card-border-hover, rgba(255, 255, 255, 0.15));
}

.film-poster {
  flex-shrink: 0;
  width: 80px;
  border-radius: var(--radius-sm, 4px);
  overflow: hidden;
}

.film-poster img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.film-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.film-title {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.film-director {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.film-synopsis {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.film-crew {
  font-size: 0.625rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.film-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 4px;
}

.film-year {
  font-size: 0.625rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.45));
  font-weight: 500;
}

.letterboxd-link {
  font-size: 0.625rem;
  color: var(--color-text-muted, rgba(255, 255, 255, 0.55));
  text-decoration: none;
  transition: color 0.15s ease;
}

.letterboxd-link:hover {
  color: var(--color-text-muted, rgba(255, 255, 255, 0.8));
  text-decoration: underline;
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

@media (max-width: 480px) {
  .film-card {
    flex-direction: column;
  }

  .film-poster {
    width: 100%;
    max-height: 160px;
  }

  .film-poster img {
    width: 100%;
    max-height: 160px;
    object-fit: contain;
  }
}
</style>
