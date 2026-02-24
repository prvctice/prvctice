<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="unlock-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-title"
    >
      <div class="unlock-prompt__backdrop"></div>
      <div class="unlock-prompt__card">
        <div class="unlock-prompt__media" aria-hidden="true">
          <video
            class="unlock-prompt__video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="unlock-prompt__scrim"></div>
        </div>
        <div class="unlock-prompt__content">
          <h2 id="unlock-title" class="unlock-prompt__title">Session Paused</h2>

          <p class="unlock-prompt__message">
            Add your API key to continue, or come back<br />
            in <span class="unlock-prompt__countdown">{{ cooldownDisplay }}</span> for another free
            session.
          </p>

          <div class="unlock-prompt__actions">
            <button
              type="button"
              class="unlock-prompt__btn unlock-prompt__btn--primary"
              @click="handleAddKey"
            >
              Add API Key
            </button>
            <button
              type="button"
              class="unlock-prompt__btn unlock-prompt__btn--secondary"
              @click="handleWait"
            >
              I'll Wait
            </button>
          </div>

          <div class="unlock-prompt__divider"></div>

          <p class="unlock-prompt__help-text">Get free API keys from:</p>
          <div class="unlock-prompt__providers">
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
              class="unlock-prompt__provider"
            >
              Anthropic
            </a>
            <span class="unlock-prompt__dot">·</span>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              class="unlock-prompt__provider"
            >
              Google
            </a>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useSessionGate } from '@web/composables/useSessionGate.js';

// Cooldown duration constant (must match useSessionGate)
const COOLDOWN_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours

// Extend Window for modal functions
declare global {
  interface Window {
    openApiKeysModal?: () => void;
    openSettingsModal?: () => void;
    handleMenuAction?: (action: string) => void;
  }
}

const session = useSessionGate();
const dismissed = ref(false);

// Tick ref to force cooldownDisplay recomputation every second
const tick = ref(0);
let tickInterval: ReturnType<typeof setInterval> | null = null;

// Show when expired and not dismissed
const visible = computed<boolean>(() => session.isExpired.value && !dismissed.value);

// Reset dismissed when state changes away from expired
watch(
  () => session.state.value,
  (newState: string, oldState: string) => {
    if (oldState === 'trial_expired' && newState !== 'trial_expired') {
      dismissed.value = false;
    }
  }
);

// Start/stop tick interval based on visibility
watch(
  visible,
  (isVisible) => {
    if (isVisible) {
      tickInterval = setInterval(() => {
        tick.value++;
      }, 1000);
    } else {
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
    }
  },
  { immediate: true }
);

// Format cooldown time - uses tick ref to force recomputation every second
const cooldownDisplay = computed<string>(() => {
  // Force recomputation by reading tick value
  void tick.value;

  const start = session.cooldownStart.value;
  if (start <= 0) return '0:00';

  const elapsed = Date.now() - start;
  const ms = Math.max(0, COOLDOWN_DURATION_MS - elapsed);
  if (ms <= 0) return '0:00';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

function handleAddKey(): void {
  dismissed.value = true;
  try {
    if (typeof window.openApiKeysModal === 'function') {
      window.openApiKeysModal();
      return;
    }
  } catch (_) {}
  try {
    if (typeof window.openSettingsModal === 'function') {
      window.openSettingsModal();
      return;
    }
    if (typeof window.handleMenuAction === 'function') {
      window.handleMenuAction('api-keys');
    }
  } catch (_) {}
}

function handleWait(): void {
  dismissed.value = true;
}

// Cleanup interval on unmount
onBeforeUnmount(() => {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
});
</script>

<style scoped>
.unlock-prompt {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: prompt-fade-in 0.3s ease-out;
}

@keyframes prompt-fade-in {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

.unlock-prompt__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 70%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.unlock-prompt__card {
  position: relative;
  z-index: 1;
  max-width: 500px;
  width: 100%;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow:
    0 24px 60px rgb(0 0 0 / 55%),
    0 0 50px rgb(84 114 255 / 30%);
  animation: card-scale-in 0.35s ease-out;
}

.unlock-prompt__media {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.unlock-prompt__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
}

.unlock-prompt__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(10 12 20 / 70%) 0%, rgb(10 12 20 / 85%) 100%);
}

.unlock-prompt__content {
  position: relative;
  z-index: 1;
  padding: 36px 32px 32px;
  text-align: center;
}

@keyframes card-scale-in {
  0% {
    opacity: 0;
    transform: scale(0.95);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.unlock-prompt__title {
  margin: 0 0 16px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #fff;
}

.unlock-prompt__message {
  margin: 0 0 28px;
  font-size: 14px;
  line-height: 1.6;
  color: #a0a4b8;
}

.unlock-prompt__countdown {
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.unlock-prompt__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 28px;
}

.unlock-prompt__btn {
  padding: 12px 24px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.unlock-prompt__btn--primary {
  background: #fff;
  border: none;
  color: #1a1d2e;
  box-shadow: 0 12px 30px rgb(255 255 255 / 20%);
}

.unlock-prompt__btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgb(255 255 255 / 30%);
}

.unlock-prompt__btn--secondary {
  background: transparent;
  border: 1px solid rgb(255 255 255 / 30%);
  color: #fff;
}

.unlock-prompt__btn--secondary:hover {
  background: rgb(255 255 255 / 10%);
  border-color: rgb(255 255 255 / 50%);
}

.unlock-prompt__divider {
  width: 100%;
  height: 1px;
  background: rgb(255 255 255 / 10%);
  margin-bottom: 20px;
}

.unlock-prompt__help-text {
  margin: 0 0 12px;
  font-size: 12px;
  color: #6b7080;
  letter-spacing: 0.05em;
}

.unlock-prompt__providers {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.unlock-prompt__provider {
  color: #6b7aff;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s ease;
}

.unlock-prompt__provider:hover {
  color: #8b97ff;
  text-decoration: underline;
}

.unlock-prompt__dot {
  color: #4a4e5c;
}

@media (width <= 720px) {
  .unlock-prompt__content {
    padding: 28px 20px 24px;
  }

  .unlock-prompt__title {
    font-size: 20px;
  }

  .unlock-prompt__actions {
    flex-direction: column;
  }

  .unlock-prompt__btn {
    width: 100%;
  }
}
</style>
