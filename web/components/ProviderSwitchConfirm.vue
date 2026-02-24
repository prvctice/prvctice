<template>
  <teleport to="body">
    <dialog
      ref="dialogRef"
      class="provider-switch-dialog"
      @close="onDialogClose"
      @click="handleBackdropClick"
    >
      <div class="psd-content" @click.stop>
        <header class="psd-header">
          <h2>Switch to {{ targetProviderName }}?</h2>
        </header>

        <div class="psd-body">
          <p v-if="hasImages" class="psd-message psd-message--warning">
            <iconify-icon icon="ph:image" aria-hidden="true"></iconify-icon>
            <span>
              Your conversation includes images. These will be preserved, but formatting may differ
              between providers.
            </span>
          </p>
          <p v-else class="psd-message">
            <iconify-icon icon="ph:chat-circle-dots" aria-hidden="true"></iconify-icon>
            <span>Your conversation will continue with {{ targetProviderName }}.</span>
          </p>
        </div>

        <footer class="psd-footer">
          <button type="button" class="psd-btn psd-btn--secondary" @click="cancel">Cancel</button>
          <button type="button" class="psd-btn psd-btn--primary" @click="confirm">
            Switch Provider
          </button>
        </footer>
      </div>
    </dialog>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

type Provider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio';

interface ShowOptions {
  targetProvider: Provider;
  hasImages: boolean;
  hasMessages: boolean;
}

const PROVIDER_NAMES: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  lmstudio: 'LM Studio',
};

const dialogRef = ref<HTMLDialogElement | null>(null);
const targetProvider = ref<Provider>('openai');
const hasImages = ref(false);
const hasMessages = ref(false);

let resolvePromise: ((value: boolean) => void) | null = null;

const targetProviderName = computed(
  () => PROVIDER_NAMES[targetProvider.value] || targetProvider.value
);

function show(options: ShowOptions): Promise<boolean> {
  targetProvider.value = options.targetProvider;
  hasImages.value = options.hasImages;
  hasMessages.value = options.hasMessages;

  // If no messages, skip confirmation
  if (!options.hasMessages) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    resolvePromise = resolve;
    dialogRef.value?.showModal();
  });
}

function confirm(): void {
  resolvePromise?.(true);
  resolvePromise = null;
  dialogRef.value?.close();
}

function cancel(): void {
  resolvePromise?.(false);
  resolvePromise = null;
  dialogRef.value?.close();
}

function onDialogClose(): void {
  // Handle Escape key or programmatic close
  if (resolvePromise) {
    resolvePromise(false);
    resolvePromise = null;
  }
}

function handleBackdropClick(event: MouseEvent): void {
  // Close on backdrop click
  if (event.target === dialogRef.value) {
    cancel();
  }
}

defineExpose({ show });
</script>

<style scoped>
.provider-switch-dialog {
  position: fixed;
  inset: 0;
  width: 100%;
  max-width: 400px;
  margin: auto;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: var(--radius-xl);
  background: rgb(12 12 14 / 96%);
  backdrop-filter: blur(40px) saturate(120%);
  -webkit-backdrop-filter: blur(40px) saturate(120%);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 4%) inset,
    0 50px 100px -20px rgb(0 0 0 / 70%),
    0 30px 60px -30px rgb(0 0 0 / 60%);
  color: rgb(255 255 255 / 95%);
  font-family: var(--font-family-sans, system-ui, -apple-system, 'Segoe UI', sans-serif);

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

.provider-switch-dialog::backdrop {
  background: rgb(0 0 0 / 80%);
  backdrop-filter: blur(32px) saturate(70%);
  -webkit-backdrop-filter: blur(32px) saturate(70%);
}

.psd-content {
  padding: 24px;
}

.psd-header {
  margin-bottom: 16px;
}

.psd-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.psd-body {
  margin-bottom: 24px;
}

.psd-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin: 0;
  border-radius: var(--radius-lg);
  border: 1px solid rgb(255 255 255 / 6%);
  background: rgb(255 255 255 / 3%);
  font-size: 0.85rem;
  line-height: 1.5;
  color: rgb(255 255 255 / 60%);
}

.psd-message iconify-icon {
  flex-shrink: 0;
  font-size: 1.1rem;
  opacity: 0.5;
  margin-top: 2px;
}

.psd-message--warning {
  background: rgb(255 179 71 / 6%);
  border-color: rgb(255 179 71 / 20%);
}

.psd-message--warning iconify-icon {
  color: #ffb347;
  opacity: 1;
}

.psd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.psd-btn {
  all: unset;
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  padding: 10px 22px;
  border-radius: var(--radius-pill);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition:
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.psd-btn--secondary {
  background: transparent;
  color: rgb(255 255 255 / 60%);
  border: 1px solid rgb(255 255 255 / 6%);
}

.psd-btn--secondary:hover {
  border-color: rgb(255 255 255 / 12%);
  color: rgb(255 255 255 / 95%);
  background: rgb(255 255 255 / 3%);
}

.psd-btn--primary {
  background: rgb(255 255 255 / 95%);
  color: #0a0a0a;
}

.psd-btn--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px -8px rgb(255 255 255 / 30%);
}

.psd-btn--primary:active {
  transform: translateY(0);
}

.psd-btn:focus-visible {
  outline: 2px solid rgb(240 235 227 / 60%);
  outline-offset: 2px;
}

/* Animation */
.provider-switch-dialog[open] {
  animation: dialog-appear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-appear {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .provider-switch-dialog[open] {
    animation: none;
  }
}
</style>
