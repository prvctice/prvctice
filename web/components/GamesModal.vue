<template>
  <teleport to="body">
    <div v-if="visible" class="games-modal-overlay" data-no-orbit @click.self="close">
      <section
        ref="panelRef"
        class="games-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Games"
        tabindex="-1"
      >
        <div class="games-modal-media" aria-hidden="true">
          <video
            class="games-modal-video"
            :src="baseUrl + 'images/fishLoop.mp4'"
            autoplay
            muted
            loop
            playsinline
          ></video>
          <div class="games-modal-scrim"></div>
        </div>
        <div class="games-modal-inner">
          <div class="games-modal-top">
            <div class="games-modal-logo" aria-hidden="true">
              <iconify-icon
                icon="ph:game-controller"
                style="font-size: 36px; color: #fff"
              ></iconify-icon>
            </div>
            <h2>Games</h2>
            <p>Take a break and play</p>
          </div>

          <div class="games-modal-body">
            <div class="games-grid">
              <button
                v-for="game in games"
                :key="game.id"
                type="button"
                class="game-card"
                @click="launchGame(game.id)"
              >
                <div class="game-icon">
                  <iconify-icon :icon="game.icon"></iconify-icon>
                </div>
                <div class="game-info">
                  <div class="game-title">{{ game.name }}</div>
                  <div class="game-description">{{ game.description }}</div>
                </div>
              </button>
            </div>
          </div>

          <footer class="games-modal-footer">
            <button class="secondary" type="button" @click="close">Close</button>
          </footer>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { ref, onBeforeUnmount, watch, nextTick } from 'vue';
import { useGamesModal } from '@web/composables/useGamesModal';
import { useWindowManager } from '@web/composables/useWindowManager';

// Focus management
const panelRef = ref<HTMLElement | null>(null);
const lastFocusedElement = ref<Element | null>(null);

interface GameInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const games: GameInfo[] = [
  {
    id: 'pong',
    name: 'Pong',
    description: 'Classic paddle game vs AI opponent',
    icon: 'ph:tennis-ball',
  },
  {
    id: 'brick-breaker',
    name: 'Brick Breaker',
    description: 'Classic paddle and ball action',
    icon: 'ph:squares-four',
  },
  {
    id: 'solitaire',
    name: 'Solitaire',
    description: 'Classic Klondike card game',
    icon: 'ph:club',
  },
];

const gamesModal = useGamesModal();
const visible = gamesModal.visible;

function close(): void {
  gamesModal.close();
}

function launchGame(gameId: string): void {
  close();

  if (gameId === 'pong') {
    if (typeof window.startPongGame === 'function') {
      window.startPongGame();
    }
  } else if (gameId === 'brick-breaker') {
    if (typeof window.startBlockBreakingGame === 'function') {
      window.startBlockBreakingGame();
    }
  } else if (gameId === 'solitaire') {
    import('@web/services/apps/appRegistry').then(({ createAppRegistry }) => {
      const registry = createAppRegistry();
      void registry.get('solitaire').then((app) => {
        if (app) useWindowManager().openWindow(app);
      });
    });
  }
}

function handleKeydown(evt: KeyboardEvent): void {
  if (evt.key === 'Escape') {
    evt.preventDefault();
    close();
  }
}

watch(visible, (isVisible: boolean) => {
  if (isVisible) {
    // Save current focus and add keyboard handler
    lastFocusedElement.value = document.activeElement;
    window.addEventListener('keydown', handleKeydown);
    // Focus the panel after render
    nextTick(() => {
      panelRef.value?.focus();
    });
  } else {
    window.removeEventListener('keydown', handleKeydown);
    // Restore focus to previous element
    if (lastFocusedElement.value instanceof HTMLElement) {
      lastFocusedElement.value.focus();
    }
  }
});

onBeforeUnmount((): void => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.games-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgb(3 6 12 / 50%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 4000;
}

.games-modal-panel {
  position: relative;
  width: min(460px, calc(100% - 32px));
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow:
    0 22px 60px rgb(0 0 0 / 35%),
    0 4px 18px rgb(0 0 0 / 18%);
}

.games-modal-media,
.games-modal-scrim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.games-modal-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  filter: saturate(115%);
  opacity: 0.9;
}

.games-modal-scrim {
  background: linear-gradient(180deg, rgb(8 12 24 / 20%), rgb(6 10 20 / 60%));
}

.games-modal-inner {
  position: relative;
  border-radius: var(--radius-xl);
  background: rgb(10 14 26 / 74%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 22px 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: rgb(255 255 255 / 95%);
  z-index: 1;

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

.games-modal-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 12px;
  text-align: center;
  align-items: center;
}

.games-modal-logo {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.games-modal-top h2 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: 0.01em;
  font-weight: 700;
}

.games-modal-top p {
  margin: 0;
  color: rgb(255 255 255 / 78%);
  font-size: 0.95rem;
}

.games-modal-body {
  max-height: min(360px, 60vh);
  overflow-y: auto;
  padding-right: 6px;
}

.games-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-card {
  width: 100%;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-xl);
  background: rgb(255 255 255 / 10%);
  padding: 16px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.game-card:hover,
.game-card:focus-visible {
  border-color: rgb(255 255 255 / 32%);
  background: rgb(255 255 255 / 16%);
  box-shadow: 0 8px 18px rgb(0 0 0 / 12%);
  transform: translateY(-2px);
}

.game-card:active {
  transform: scale(0.98);
}

.game-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 12%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.game-icon iconify-icon {
  font-size: 24px;
  color: rgb(255 255 255 / 90%);
}

.game-info {
  flex: 1;
  min-width: 0;
}

.game-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: #f8f8fb;
}

.game-description {
  font-size: 0.86rem;
  color: rgb(255 255 255 / 70%);
}

.games-modal-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 4px;
}

.secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgb(255 255 255 / 60%);
  border-radius: var(--radius-pill);
  padding: 10px 18px;
  background: transparent;
  color: rgb(255 255 255 / 95%);
  cursor: pointer;
  font-weight: 600;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
}

.secondary:hover:not(:disabled) {
  border-color: rgb(255 255 255 / 90%);
  box-shadow: 0 8px 18px rgb(0 0 0 / 12%);
  transform: translateY(-1px);
}

@media (max-width: 640px) {
  .games-modal-overlay {
    padding: 12px;
  }

  .games-modal-inner {
    padding: 22px 20px 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .game-card {
    transition: none;
  }

  .secondary {
    transition: none;
  }
}
</style>
