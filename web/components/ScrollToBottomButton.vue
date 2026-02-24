<template>
  <Transition name="slide-up">
    <button
      v-if="visible"
      class="scroll-to-bottom-btn"
      aria-label="Scroll to new messages"
      @click="onClick"
    >
      <iconify-icon icon="ph:arrow-down-bold" aria-hidden="true"></iconify-icon>
    </button>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

function onClick() {
  emit('click');
}
</script>

<style scoped>
.scroll-to-bottom-btn {
  position: fixed;
  bottom: calc(var(--chat-input-offset, 90px) + 16px);
  right: 24px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-btn-primary-bg, #fff);
  color: var(--color-btn-primary-text, #071028);
  border: none;
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  cursor: pointer;
  z-index: var(--z-floating-ui, 100);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.2s ease,
    transform 0.1s ease;
}

.scroll-to-bottom-btn:hover {
  background: var(--color-btn-primary-bg-hover, #f0f4ff);
  transform: scale(1.05);
}

.scroll-to-bottom-btn:active {
  transform: scale(0.95);
}

/* Slide-up transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .scroll-to-bottom-btn {
    transition: none;
  }

  .slide-up-enter-active,
  .slide-up-leave-active {
    transition: opacity 0.1s ease;
  }

  .slide-up-enter-from,
  .slide-up-leave-to {
    transform: none;
  }
}
</style>
