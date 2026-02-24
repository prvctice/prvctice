<template>
  <div class="empty-state" :class="[`empty-state--${size}`]" role="status" aria-live="polite">
    <div v-if="icon" class="empty-state__icon" aria-hidden="true">
      <iconify-icon :icon="icon" />
    </div>
    <h3 v-if="title" class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
type EmptyStateSize = 'sm' | 'md' | 'lg';

interface Props {
  icon?: string;
  title?: string;
  description?: string;
  size?: EmptyStateSize;
}

withDefaults(defineProps<Props>(), {
  icon: undefined,
  title: undefined,
  description: undefined,
  size: 'md',
});
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-8, 24px);
  gap: var(--space-2, 4px);
}

.empty-state__icon {
  font-size: 2.5rem;
  color: var(--color-text-muted, rgb(255 255 255 / 50%));
  opacity: 0.6;
}

.empty-state__title {
  margin: 0;
  font-family: 'Crimson Pro', serif;
  font-size: var(--font-size-lg, 1.25rem);
  font-weight: 500;
  color: var(--color-text-secondary, rgb(255 255 255 / 70%));
  letter-spacing: -0.01em;
}

.empty-state__description {
  margin: 0;
  font-family: var(--font-family-display, 'Gothic A1', sans-serif);
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 500;
  color: var(--color-text-muted, rgb(255 255 255 / 50%));
  max-width: 280px;
  line-height: var(--line-height-relaxed, 1.6);
  letter-spacing: -0.015em;
}

.empty-state__action {
  margin-top: var(--space-2, 4px);
}

/* Size variants */
.empty-state--sm {
  padding: var(--space-5, 12px);
  gap: var(--space-2, 4px);
}

.empty-state--sm .empty-state__icon {
  font-size: 1.5rem;
}

.empty-state--sm .empty-state__title {
  font-size: var(--font-size-sm, 0.875rem);
}

.empty-state--sm .empty-state__description {
  font-size: var(--font-size-xs, 0.75rem);
}

.empty-state--lg {
  padding: var(--space-10, 32px);
  gap: var(--space-3, 6px);
}

.empty-state--lg .empty-state__icon {
  font-size: 2.5rem;
}

.empty-state--lg .empty-state__title {
  font-size: 2.5rem;
  font-weight: 300;
}

.empty-state--lg .empty-state__description {
  font-size: 0.8rem;
  max-width: 360px;
}
</style>
