<template>
  <button
    :type="type"
    :class="[
      'base-button',
      `base-button--${variant}`,
      `base-button--${size}`,
      { 'base-button--loading': loading, 'base-button--icon-only': iconOnly },
    ]"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span v-if="loading" class="base-button__spinner" aria-hidden="true"></span>
    <span class="base-button__content" :class="{ 'sr-only': loading && !iconOnly }">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
type ButtonType = 'button' | 'submit' | 'reset';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  type?: ButtonType;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
  ariaLabel?: string;
}

withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  iconOnly: false,
  ariaLabel: undefined,
});
</script>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
  border: none;
  outline: none;
  position: relative;
  white-space: nowrap;
}

.base-button:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgba(84, 114, 255, 0.8));
  outline-offset: 2px;
}

.base-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sizes */
.base-button--sm {
  padding: 6px 14px;
  font-size: 13px;
  min-height: 32px;
}

.base-button--md {
  padding: 10px 20px;
  font-size: 14px;
  min-height: 40px;
}

.base-button--lg {
  padding: 12px 28px;
  font-size: 16px;
  min-height: 48px;
}

.base-button--icon-only.base-button--sm {
  padding: 6px;
  min-width: 32px;
}

.base-button--icon-only.base-button--md {
  padding: 10px;
  min-width: 40px;
}

.base-button--icon-only.base-button--lg {
  padding: 12px;
  min-width: 48px;
}

/* Variants */
.base-button--primary {
  background: var(--color-btn-primary-bg);
  color: var(--color-btn-primary-text);
  border: 1px solid var(--color-btn-primary-border);
}

.base-button--primary:hover:not(:disabled) {
  background: var(--color-btn-primary-bg-hover);
  border-color: rgba(255, 255, 255, 0.6);
}

.base-button--primary:active:not(:disabled) {
  transform: scale(0.98);
}

.base-button--secondary {
  background: transparent;
  color: var(--color-btn-secondary-text);
  border: 1px solid var(--color-btn-secondary-border);
}

.base-button--secondary:hover:not(:disabled) {
  background: var(--color-btn-secondary-bg-hover);
  border-color: rgba(255, 255, 255, 0.5);
}

.base-button--secondary:active:not(:disabled) {
  transform: scale(0.98);
}

.base-button--ghost {
  background: transparent;
  color: var(--color-btn-ghost-text);
  border: none;
}

.base-button--ghost:hover:not(:disabled) {
  background: var(--color-btn-ghost-bg-hover);
  color: var(--color-text-primary);
}

.base-button--ghost:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.base-button--danger {
  background: var(--color-btn-danger-bg);
  color: var(--color-btn-danger-text);
  border: none;
}

.base-button--danger:hover:not(:disabled) {
  background: var(--color-btn-danger-bg-hover);
}

.base-button--danger:active:not(:disabled) {
  transform: scale(0.98);
}

/* Loading spinner */
.base-button__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.base-button--loading {
  pointer-events: none;
}

.base-button__content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
