<script setup lang="ts">
/**
 * PermissionBanner
 *
 * Inline permission banner shown at the top of an app window when
 * the app requests a sensitive permission. Styled like Chrome's
 * permission bar with theme-aware colors.
 */

defineProps<{
  visible: boolean;
  appName: string;
  groupName: string;
  groupDescription: string;
}>();

const emit = defineEmits<{
  allow: [];
  deny: [];
}>();
</script>

<template>
  <Transition name="permission-banner">
    <div v-if="visible" class="permission-banner">
      <span class="permission-banner__text">
        <strong>{{ appName }}</strong> wants to access {{ groupDescription }}
      </span>
      <div class="permission-banner__actions">
        <button class="permission-banner__btn permission-banner__btn--deny" @click="emit('deny')">
          Deny
        </button>
        <button class="permission-banner__btn permission-banner__btn--allow" @click="emit('allow')">
          Allow
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.permission-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
  flex-shrink: 0;
}

.permission-banner__text {
  color: var(--color-text);
  line-height: 1.4;
}

.permission-banner__text strong {
  color: var(--color-text);
}

.permission-banner__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.permission-banner__btn {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}

.permission-banner__btn:hover {
  opacity: 0.85;
}

.permission-banner__btn--allow {
  background: var(--color-primary);
  color: #fff;
}

.permission-banner__btn--deny {
  background: transparent;
  color: var(--color-text-secondary);
}

/* Slide transition */
.permission-banner-enter-active,
.permission-banner-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.permission-banner-enter-from,
.permission-banner-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}

.permission-banner-enter-to,
.permission-banner-leave-from {
  max-height: 60px;
  opacity: 1;
}
</style>
