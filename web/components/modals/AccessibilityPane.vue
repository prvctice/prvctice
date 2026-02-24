<template>
  <div class="sp-pane-content">
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Input devices</h4>
        <p>Alternative ways to control the app.</p>
      </div>
      <div class="sp-toggle-stack">
        <label class="sp-toggle">
          <input type="checkbox" v-model="gamepadEnabled" @change="saveGamepad" />
          <span class="sp-toggle-track" aria-hidden="true"></span>
          <div class="sp-toggle-copy">
            <span class="sp-toggle-title">Game controller</span>
            <span class="sp-toggle-desc">Use a PS5, Xbox, or other gamepad to navigate.</span>
          </div>
        </label>

        <label class="sp-toggle">
          <input type="checkbox" v-model="handTrackingButton" @change="saveHandTrackingButton" />
          <span class="sp-toggle-track" aria-hidden="true"></span>
          <div class="sp-toggle-copy">
            <span class="sp-toggle-title">Hand tracking</span>
            <span class="sp-toggle-desc"
              >Adds a toolbar button to control orbs with your hand.</span
            >
          </div>
        </label>
      </div>

      <!-- Connection status -->
      <div v-if="gamepadEnabled" class="sp-status-box" :class="{ connected: gamepadConnected }">
        <div class="sp-status-indicator">
          <span class="sp-status-dot" aria-hidden="true"></span>
          <span class="sp-status-text">{{
            gamepadConnected ? gamepadName : 'No controller detected'
          }}</span>
        </div>
        <p v-if="!gamepadConnected" class="sp-status-hint">
          Press any button on your controller to connect
        </p>
        <button v-if="!gamepadConnected" type="button" class="sp-check-btn" @click="checkGamepad">
          <iconify-icon icon="ph:arrows-clockwise" aria-hidden="true"></iconify-icon>
          Check again
        </button>
      </div>

      <div v-if="gamepadEnabled && gamepadConnected" class="sp-info-box">
        <div class="sp-info-header">
          <iconify-icon icon="ph:game-controller" aria-hidden="true"></iconify-icon>
          <span>Controller mappings</span>
        </div>
        <ul class="sp-mappings-list">
          <li><kbd>Left stick</kbd> Move input bar</li>
          <li><kbd>Right stick</kbd> Move cursor</li>
          <li><kbd>Square</kbd> Click</li>
          <li><kbd>Triangle</kbd> Toggle side menu</li>
          <li><kbd>Circle</kbd> Back / close menus</li>
          <li><kbd>L1</kbd> Toggle notes</li>
          <li><kbd>R1</kbd> Toggle mic</li>
          <li><kbd>Options</kbd> Open settings</li>
          <li><kbd>D-pad Up</kbd> New conversation</li>
          <li><kbd>D-pad Down</kbd> Help panel</li>
          <li><kbd>D-pad Left/Right</kbd> Cycle themes</li>
        </ul>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';
import { useNotifs } from '@web/composables/useNotifs';

const notifs = useNotifs();

const gamepadEnabled = ref(false);
const gamepadConnected = ref(false);
const gamepadName = ref('');
const handTrackingButton = ref(true);
let pollInterval: ReturnType<typeof setInterval> | null = null;

function checkGamepad(): void {
  try {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        gamepadConnected.value = true;
        // Clean up the name (remove vendor IDs etc)
        let name = gp.id;
        if (name.includes('(')) {
          name = (name.split('(')[0] ?? name).trim();
        }
        gamepadName.value = name || 'Controller connected';
        return;
      }
    }
    gamepadConnected.value = false;
    gamepadName.value = '';
  } catch (_) {
    gamepadConnected.value = false;
  }
}

function startPolling(): void {
  if (pollInterval) return;
  checkGamepad();
  pollInterval = setInterval(checkGamepad, 1000);
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function loadValues(): void {
  try {
    const pref = storage.mirror.get(STORAGE_KEYS.GAMEPAD_ENABLED);
    gamepadEnabled.value = pref === 'true';
    if (gamepadEnabled.value) {
      startPolling();
    }
  } catch (_) {}

  // Hand tracking button visibility (default to true/visible)
  try {
    const handTrackBtnPref = storage.mirror.get(STORAGE_KEYS.HAND_TRACKING_BUTTON);
    handTrackingButton.value = handTrackBtnPref !== 'false';
  } catch (_) {}
}

function saveGamepad(): void {
  storage.mirror.set(STORAGE_KEYS.GAMEPAD_ENABLED, gamepadEnabled.value ? 'true' : 'false');

  // Start/stop polling based on toggle
  if (gamepadEnabled.value) {
    startPolling();
  } else {
    stopPolling();
    gamepadConnected.value = false;
    gamepadName.value = '';
  }

  // Dispatch event to gamepad module
  useEventBus().emit('gamepad:enabled-change', { enabled: gamepadEnabled.value });

  notifs.push(
    'info',
    gamepadEnabled.value ? 'Game controller enabled' : 'Game controller disabled'
  );
}

function saveHandTrackingButton(): void {
  storage.mirror.set(
    STORAGE_KEYS.HAND_TRACKING_BUTTON,
    handTrackingButton.value ? 'true' : 'false'
  );

  // Dispatch event to hand tracking module to show/hide toolbar button
  useEventBus().emit('handtrack:button-change', { visible: handTrackingButton.value });

  // Also call window API if available (for immediate effect)
  const setDotMatrixTrackingButtonVisible = (
    window as { setDotMatrixTrackingButtonVisible?: (v: boolean) => void }
  ).setDotMatrixTrackingButtonVisible;
  if (typeof setDotMatrixTrackingButtonVisible === 'function') {
    setDotMatrixTrackingButtonVisible(handTrackingButton.value);
  }

  notifs.push(
    'info',
    handTrackingButton.value
      ? 'Hand tracking button added to toolbar'
      : 'Hand tracking button removed'
  );
}

onMounted(() => {
  loadValues();
});

onBeforeUnmount(() => {
  stopPolling();
});

defineExpose({ loadValues });
</script>

<style scoped>
.sp-status-box {
  margin-top: 16px;
  padding: 16px;
  background: rgb(255 255 255 / 3%);
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sp-status-box.connected {
  border-color: rgb(100 200 100 / 30%);
  background: rgb(100 200 100 / 5%);
}

.sp-status-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(255 255 255 / 25%);
  flex-shrink: 0;
}

.sp-status-box.connected .sp-status-dot {
  background: #4ade80;
  box-shadow: 0 0 8px rgb(74 222 128 / 50%);
}

.sp-status-text {
  font-size: 0.85rem;
  color: rgb(255 255 255 / 70%);
  font-weight: 500;
}

.sp-status-box.connected .sp-status-text {
  color: rgb(255 255 255 / 90%);
}

.sp-status-hint {
  margin: 0;
  font-size: 0.8rem;
  color: rgb(255 255 255 / 45%);
}

.sp-check-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: rgb(255 255 255 / 60%);
  transition: all 0.15s ease;
  align-self: flex-start;
}

.sp-check-btn:hover {
  background: rgb(255 255 255 / 10%);
  color: rgb(255 255 255 / 85%);
}

.sp-check-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgb(0 125 200 / 60%));
  outline-offset: 2px;
}

.sp-check-btn iconify-icon {
  font-size: 14px;
}

.sp-info-box {
  margin-top: 16px;
  padding: 16px;
  background: rgb(255 255 255 / 3%);
  border: 1px solid rgb(255 255 255 / 6%);
  border-radius: var(--radius-lg);
}

.sp-info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: rgb(255 255 255 / 70%);
  font-size: 0.85rem;
  font-weight: 500;
}

.sp-info-header iconify-icon {
  font-size: 18px;
  opacity: 0.8;
}

.sp-mappings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sp-mappings-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8rem;
  color: rgb(255 255 255 / 55%);
}

.sp-mappings-list kbd {
  display: inline-block;
  min-width: 140px;
  padding: 4px 8px;
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 0.75rem;
  color: rgb(255 255 255 / 70%);
}
</style>
