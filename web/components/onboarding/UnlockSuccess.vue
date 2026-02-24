<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="unlock-success"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
      @click="handleDismiss"
    >
      <div class="unlock-success__backdrop"></div>
      <div class="unlock-success__card" @click.stop>
        <div class="unlock-success__media" aria-hidden="true">
          <video
            class="unlock-success__video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="unlock-success__scrim"></div>
        </div>
        <div class="unlock-success__content">
          <div class="unlock-success__check" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <h2 id="success-title" class="unlock-success__title">You're all set!</h2>
          <p class="unlock-success__message">Full access unlocked.</p>

          <button type="button" class="unlock-success__btn" @click="handleDismiss">Continue</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { computed, watch, onBeforeUnmount } from 'vue';
import { useSessionGate } from '@web/composables/useSessionGate.js';

const session = useSessionGate();

const visible = computed<boolean>(() => session.showSuccessModal.value);

let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

function handleDismiss(): void {
  session.dismissSuccessModal();
}

// Auto-dismiss after 3 seconds
watch(visible, (isVisible: boolean) => {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }

  if (isVisible) {
    autoDismissTimer = setTimeout(() => {
      session.dismissSuccessModal();
    }, 3000);
  }
});

onBeforeUnmount((): void => {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
  }
});
</script>

<style scoped>
.unlock-success {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: success-fade-in 0.3s ease-out;
}

@keyframes success-fade-in {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

.unlock-success__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 70%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.unlock-success__card {
  position: relative;
  z-index: 1;
  width: min(360px, 85vw);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow:
    0 24px 60px rgb(0 0 0 / 55%),
    0 0 60px rgb(34 197 94 / 25%);
  animation: card-success-enter 0.4s ease-out;
}

.unlock-success__media {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.unlock-success__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
}

.unlock-success__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(10 12 20 / 70%) 0%, rgb(10 12 20 / 85%) 100%);
}

.unlock-success__content {
  position: relative;
  z-index: 1;
  padding: 40px 32px 32px;
  text-align: center;
}

@keyframes card-success-enter {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.unlock-success__check {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  border-radius: 50%;
  background: rgb(34 197 94 / 20%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #22c55e;
  animation: check-pop 0.5s ease-out 0.1s both;
}

@keyframes check-pop {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.unlock-success__check svg {
  width: 32px;
  height: 32px;
}

.unlock-success__title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #fff;
}

.unlock-success__message {
  margin: 0 0 28px;
  font-size: 14px;
  color: #a0a4b8;
}

.unlock-success__btn {
  display: inline-block;
  padding: 12px 32px;
  border: none;
  border-radius: var(--radius-pill);
  background: #fff;
  color: #1a1d2e;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 30px rgb(255 255 255 / 20%);
  transition: all 0.2s ease;
}

.unlock-success__btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgb(255 255 255 / 30%);
}

.unlock-success__btn:active {
  transform: translateY(0);
}

@media (width <= 720px) {
  .unlock-success__content {
    padding: 32px 24px 28px;
  }

  .unlock-success__check {
    width: 56px;
    height: 56px;
  }

  .unlock-success__check svg {
    width: 28px;
    height: 28px;
  }

  .unlock-success__title {
    font-size: 20px;
  }
}
</style>
