<template>
  <div class="block-breaking" :class="{ 'is-playing': isPlaying }">
    <canvas ref="canvasRef" class="game-canvas" @touchmove.prevent />

    <div v-if="isPlaying || state === 'level_complete'" class="bottom-hud">
      <div class="hud-left">
        <div class="score-display">
          Score: {{ score }} | Best: {{ displayHighScore }} | Lv.{{ level }}
        </div>
      </div>
      <div class="hud-center">
        <div class="lives-display" :data-lives="lives">
          <span v-for="i in lives" :key="i" class="life-icon">&#9679;</span>
        </div>
      </div>
      <div class="hud-right">
        <button
          class="bottom-hud-btn icon-btn"
          :class="{ active: handTrackingOn }"
          :title="handTrackingOn ? 'Hand tracking on' : 'Hand tracking off'"
          @click="toggleHandTracking"
        >
          <iconify-icon icon="ph:hand-pointing" width="18" height="18"></iconify-icon>
        </button>
        <button class="bottom-hud-btn" @click="togglePause">Pause</button>
        <button class="bottom-hud-btn" @click="exitToTitle">Exit</button>
      </div>
    </div>

    <div v-if="state === 'title'" class="title-screen">
      <h1>BLOCKS</h1>
      <p class="stats">High Score: {{ highScore }}</p>
      <p class="instructions">Break all the blocks to advance levels!</p>
      <p class="controls">Mouse / Touch / Arrow Keys / Gamepad / Hand Tracking</p>
      <button class="game-btn" @click="startGame">Start Game</button>
      <button class="game-btn secondary" @click="exit">Exit</button>
    </div>

    <div v-if="state === 'paused'" class="pause-menu">
      <div class="pause-content">
        <div class="pause-header">
          <div class="pause-icon">||</div>
          <h2>Paused</h2>
        </div>

        <div class="pause-stats">
          <p>Level {{ level }} | Score: {{ score }}</p>
        </div>

        <div class="pause-controls">
          <h3>Controls</h3>
          <div class="control-grid">
            <div class="control-item">
              <span class="control-icon">&#8592; &#8594;</span>
              <span class="control-label">Arrow Keys</span>
            </div>
            <div class="control-item">
              <span class="control-icon">Touch</span>
              <span class="control-label">Drag to move</span>
            </div>
            <div class="control-item">
              <span class="control-icon">Mouse</span>
              <span class="control-label">Move cursor</span>
            </div>
            <div class="control-item">
              <span class="control-icon">Esc</span>
              <span class="control-label">Pause game</span>
            </div>
          </div>
        </div>

        <div class="pause-actions">
          <button class="game-btn" @click="resume">Resume</button>
          <button class="game-btn secondary" @click="exitToTitle">Exit to Menu</button>
        </div>
      </div>
    </div>

    <div v-if="state === 'level_complete'" class="level-complete">
      <h1>Level {{ level - 1 }} Complete!</h1>
      <p class="level-score">Score: {{ score }}</p>
      <p class="next-level">Get ready for Level {{ level }}!</p>
    </div>

    <div v-if="state === 'gameover'" class="game-over">
      <h1>Game Over</h1>
      <p v-if="isNewHighScore" class="new-high-score">New High Score!</p>
      <p class="final-score">Score: {{ score }}</p>
      <p class="high-score-display">Best: {{ displayHighScore }}</p>
      <p class="level-display">Level Reached: {{ level }}</p>
      <button class="game-btn" @click="startGame">Play Again</button>
      <button class="game-btn secondary" @click="exitToTitle">Menu</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useMotionPreferences } from '@web/composables/useMotion';
import {
  createEngine,
  startEngine,
  pauseEngine,
  resumeEngine,
  stopEngine,
  updateThemeColors,
  setHighScore,
} from './engine';
import type { GameEngine } from './engine';
import {
  createInputState,
  setupInput,
  cleanupInput,
  stopKeyboardLoop,
  isHandTrackingEnabled,
  setHandTrackingEnabled,
} from './input';
import type { InputHandlers } from './input';
import { getThemeColors } from './types';
import type { GameState } from './types';

const HIGH_SCORE_KEY = 'prvctice_blocks_highScore';

const emit = defineEmits<{
  (e: 'exit'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { reduceMotion } = useMotionPreferences();

const state = ref<GameState>('title');
const score = ref(0);
const highScore = ref(0);
const lives = ref(5);
const level = ref(1);
const isNewHighScore = ref(false);

let engine: GameEngine | null = null;
let inputHandlers: InputHandlers | null = null;
let themeObserver: MutationObserver | null = null;

const handTrackingOn = ref(isHandTrackingEnabled() && isGlobalHandTrackingActive());

function isGlobalHandTrackingActive(): boolean {
  return typeof window.getDotMatrixHandTracking === 'function' && window.getDotMatrixHandTracking();
}

async function toggleHandTracking(): Promise<void> {
  const newState = !handTrackingOn.value;

  if (newState) {
    if (typeof window.setDotMatrixHandTracking === 'function') {
      const success = await window.setDotMatrixHandTracking(true);
      if (success) {
        handTrackingOn.value = true;
        setHandTrackingEnabled(true);
      }
    }
  } else {
    if (typeof window.setDotMatrixHandTracking === 'function') {
      window.setDotMatrixHandTracking(false);
    }
    handTrackingOn.value = false;
    setHandTrackingEnabled(false);
  }
}

const isPlaying = computed(() => state.value === 'playing');
const displayHighScore = computed(() => Math.max(score.value, highScore.value));

function loadHighScore(): void {
  try {
    const saved = localStorage.getItem(HIGH_SCORE_KEY);
    highScore.value = saved ? parseInt(saved, 10) : 0;
  } catch (_e) {
    highScore.value = 0;
  }
}

function saveHighScore(newScore: number): void {
  try {
    if (newScore > highScore.value) {
      highScore.value = newScore;
      localStorage.setItem(HIGH_SCORE_KEY, highScore.value.toString());
    }
  } catch (_e) {
    // Storage failed
  }
}

function handleThemeChange(): void {
  if (engine) {
    updateThemeColors(engine, getThemeColors());
  }
}

onMounted(() => {
  loadHighScore();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('blur', handleBlur);

  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        handleThemeChange();
        break;
      }
    }
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

onBeforeUnmount(() => {
  cleanup();
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('blur', handleBlur);
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
});

function resizeCanvas(): void {
  if (!canvasRef.value) return;
  canvasRef.value.width = window.innerWidth;
  canvasRef.value.height = window.innerHeight;
}

function handleBlur(): void {
  if (state.value === 'playing' && engine) {
    pauseEngine(engine);
    state.value = 'paused';
  }
}

function startGame(): void {
  if (!canvasRef.value) return;

  resizeCanvas();
  isNewHighScore.value = false;

  state.value = 'playing';

  engine = createEngine(canvasRef.value, {
    reduceMotion: reduceMotion.value,
    callbacks: {
      onScoreChange: (s, hs, lvl) => {
        score.value = s;
        level.value = lvl;
      },
      onLivesChange: (l) => {
        lives.value = l;
      },
      onGameOver: (finalScore, finalLevel, newHighScore) => {
        isNewHighScore.value = newHighScore;
        if (newHighScore) {
          saveHighScore(finalScore);
        }
        state.value = 'gameover';
      },
      onLevelComplete: (_lvl) => {
        // Could show level complete animation
      },
      onStateChange: (s) => {
        if (s === 'paused') state.value = 'paused';
        if (s === 'playing' && state.value === 'paused') state.value = 'playing';
        if (s === 'gameover') state.value = 'gameover';
      },
    },
  });

  setHighScore(engine, highScore.value);

  const inputState = createInputState(canvasRef.value.width);
  inputHandlers = setupInput(canvasRef.value, engine, inputState, togglePause);
  startEngine(engine);
}

function togglePause(): void {
  if (!engine) return;
  if (state.value === 'playing') {
    pauseEngine(engine);
    state.value = 'paused';
  } else if (state.value === 'paused') {
    resumeEngine(engine);
    state.value = 'playing';
  }
}

function resume(): void {
  if (!engine) return;
  resumeEngine(engine);
  state.value = 'playing';
}

function exitToTitle(): void {
  cleanup();
  state.value = 'title';
}

function exit(): void {
  cleanup();
  emit('exit');
}

function cleanup(): void {
  if (engine) {
    stopEngine(engine);
    engine = null;
  }
  if (inputHandlers && canvasRef.value) {
    cleanupInput(canvasRef.value, inputHandlers);
    inputHandlers = null;
  }
  stopKeyboardLoop();
}

declare global {
  interface Window {
    setDotMatrixHandTracking?: (enabled: boolean) => Promise<boolean>;
    getDotMatrixHandTracking?: () => boolean;
  }
}
</script>

<style scoped>
.block-breaking {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 9999;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: transparent;
}

.score-display {
  font-size: clamp(12px, 1.5vw, 14px);
  font-weight: 400;
  letter-spacing: 0.02em;
}

.lives-display {
  display: flex;
  gap: 4px;
}

.life-icon {
  font-size: clamp(10px, 1.2vw, 12px);
  color: var(--skill-power-color, #2880f0);
}

.title-screen,
.pause-menu,
.game-over,
.level-complete {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 85%);
  color: #fff;
  gap: var(--space-6, 16px);
}

.title-screen h1,
.game-over h1,
.level-complete h1 {
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 400;
  margin: 0;
  letter-spacing: 0.15em;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  color: #fff;
  text-transform: uppercase;
}

.pause-menu {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.pause-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-10, 32px);
  max-width: 400px;
  padding: var(--space-10, 40px);
  background: var(--menu-background, rgb(0 0 0 / 60%));
  border-radius: var(--radius-lg, 16px);
  border: 1px solid rgb(255 255 255 / 10%);
  box-shadow: 0 24px 64px -16px rgb(0 0 0 / 40%);
}

.pause-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5, 12px);
}

.pause-icon {
  font-size: clamp(36px, 8vw, 48px);
  font-weight: 700;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  letter-spacing: 0.1em;
  opacity: 0.5;
}

.pause-menu h2 {
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
}

.pause-stats {
  text-align: center;
  opacity: 0.7;
}

.pause-stats p {
  margin: 0;
  font-size: var(--font-size-base, 1rem);
}

.pause-controls {
  width: 100%;
}

.pause-controls h3 {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.5;
  margin: 0 0 var(--space-6, 16px) 0;
  text-align: center;
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-5, 12px);
}

.control-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 6px);
  padding: var(--space-5, 12px);
  background: rgb(255 255 255 / 5%);
  border-radius: var(--radius-md, 8px);
  border: 1px solid rgb(255 255 255 / 8%);
  transition: background-color 0.15s var(--motion-ease-standard, ease);
}

.control-item:hover {
  background: rgb(255 255 255 / 8%);
}

.control-icon {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 600;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  padding: var(--space-2, 4px) var(--space-4, 10px);
  background: rgb(255 255 255 / 10%);
  border-radius: var(--radius-sm, 4px);
  letter-spacing: 0.05em;
}

.control-label {
  font-size: var(--font-size-xs, 0.75rem);
  opacity: 0.6;
}

.pause-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 12px);
  width: 100%;
}

.stats {
  font-size: var(--font-size-md, 1.125rem);
  opacity: 0.65;
  margin: 0;
  letter-spacing: 0.02em;
}

.instructions {
  font-size: var(--font-size-base, 1rem);
  opacity: 0.55;
  margin: 0;
  max-width: 420px;
  text-align: center;
  line-height: var(--line-height-relaxed, 1.6);
}

.controls {
  font-size: var(--font-size-sm, 0.875rem);
  opacity: 0.4;
  margin: 0 0 var(--space-8, 24px) 0;
  letter-spacing: 0.02em;
}

.level-complete {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.level-complete h1 {
  color: var(--skill-power-color, #2880f0);
}

.level-score {
  font-size: var(--font-size-xl, 1.5rem);
  font-weight: 500;
  margin: 0;
}

.next-level {
  font-size: var(--font-size-base, 1rem);
  opacity: 0.7;
  margin: 0;
}

.final-score {
  font-size: clamp(1.5rem, 6vw, 2.5rem);
  font-weight: 400;
  margin: 0;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  font-variant-numeric: tabular-nums;
}

.new-high-score {
  font-size: var(--font-size-lg, 1.25rem);
  color: var(--skill-power-color, #2880f0);
  font-weight: 600;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.high-score-display {
  font-size: var(--font-size-md, 1.125rem);
  opacity: 0.7;
  margin: 0;
}

.level-display {
  font-size: var(--font-size-base, 1rem);
  opacity: 0.6;
  margin: 0;
}

.game-btn {
  margin: var(--space-3, 6px);
  padding: var(--space-4, 10px) var(--space-7, 20px);
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: 500;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  letter-spacing: 0.02em;
  text-transform: lowercase;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: var(--radius-sm, 6px);
  background: rgb(255 255 255 / 8%);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  color: rgb(255 255 255 / 92%);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.game-btn:hover {
  transform: translateY(-2px);
  background: rgb(255 255 255 / 12%);
  border-color: rgb(255 255 255 / 30%);
  box-shadow: inset 0 0 16px rgb(109 254 253 / 25%);
}

.game-btn:focus-visible {
  outline: none;
  border-color: rgb(255 255 255 / 50%);
  box-shadow: 0 0 0 2px rgb(255 255 255 / 25%);
}

.game-btn:active {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.game-btn.secondary {
  background: rgb(255 255 255 / 4%);
  border-color: rgb(255 255 255 / 10%);
  color: rgb(255 255 255 / 70%);
}

.game-btn.secondary:hover {
  background: rgb(255 255 255 / 8%);
  border-color: rgb(255 255 255 / 20%);
  color: rgb(255 255 255 / 92%);
}

.game-btn.secondary:focus-visible {
  border-color: rgb(255 255 255 / 40%);
  box-shadow: 0 0 0 2px rgb(255 255 255 / 15%);
}

@media (prefers-reduced-motion: reduce) {
  .game-btn {
    transition: none;
  }

  .game-btn:hover {
    transform: none;
  }

  .game-btn:active {
    transform: none;
  }

  .control-item {
    transition: none;
  }
}

.bottom-hud {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  padding-left: max(24px, env(safe-area-inset-left, 24px));
  padding-right: max(24px, env(safe-area-inset-right, 24px));
  padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
  box-sizing: border-box;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  font-weight: 500;
  font-size: 14px;
  color: var(--blocks-text, #fff);
  pointer-events: auto;
  background: var(--blocks-hud-gradient, linear-gradient(to top, rgb(0 0 0 / 50%), transparent));
  z-index: 10;
  user-select: none;
}

.hud-left {
  flex: 1;
  display: flex;
  align-items: center;
}

.hud-center {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hud-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}

.bottom-hud-btn {
  background: transparent;
  border: none;
  color: inherit;
  padding: 4px 8px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  opacity: 0.8;
  transition: opacity 0.15s var(--motion-ease-standard, ease);
}

.bottom-hud-btn:hover {
  opacity: 1;
}

.bottom-hud-btn:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
  border-radius: 4px;
}

.bottom-hud-btn.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  opacity: 0.5;
}

.bottom-hud-btn.icon-btn.active {
  opacity: 1;
}

.bottom-hud-btn.icon-btn svg {
  display: block;
}

@media (prefers-reduced-motion: reduce) {
  .bottom-hud-btn {
    transition: none;
  }
}

:global(body.high-contrast-theme .block-breaking),
:global(body.vitti-theme .block-breaking),
:global(body.light-theme .block-breaking),
:global(body.eva-theme .block-breaking),
:global(body.share-bear-theme .block-breaking),
:global(body.fragile-theme .block-breaking) {
  --blocks-text: rgb(0 0 0 / 90%);
  --blocks-text-muted: rgb(0 0 0 / 60%);
  --blocks-hud-gradient: linear-gradient(to top, rgb(255 255 255 / 70%), transparent);
  --blocks-border: rgb(0 0 0 / 15%);
  --blocks-border-strong: rgb(0 0 0 / 30%);
  --blocks-surface: rgb(0 0 0 / 5%);
  --blocks-surface-hover: rgb(0 0 0 / 8%);
  --blocks-overlay: rgb(255 255 255 / 92%);
  --blocks-shadow: rgb(0 0 0 / 15%);
}

:global(body.high-contrast-theme .title-screen),
:global(body.high-contrast-theme .pause-menu),
:global(body.high-contrast-theme .game-over),
:global(body.high-contrast-theme .level-complete),
:global(body.vitti-theme .title-screen),
:global(body.vitti-theme .pause-menu),
:global(body.vitti-theme .game-over),
:global(body.vitti-theme .level-complete),
:global(body.light-theme .title-screen),
:global(body.light-theme .pause-menu),
:global(body.light-theme .game-over),
:global(body.light-theme .level-complete),
:global(body.eva-theme .title-screen),
:global(body.eva-theme .pause-menu),
:global(body.eva-theme .game-over),
:global(body.eva-theme .level-complete),
:global(body.share-bear-theme .title-screen),
:global(body.share-bear-theme .pause-menu),
:global(body.share-bear-theme .game-over),
:global(body.share-bear-theme .level-complete),
:global(body.fragile-theme .title-screen),
:global(body.fragile-theme .pause-menu),
:global(body.fragile-theme .game-over),
:global(body.fragile-theme .level-complete) {
  background: rgb(255 255 255 / 92%);
  color: rgb(0 0 0 / 90%);
}

:global(body.high-contrast-theme .title-screen h1),
:global(body.high-contrast-theme .game-over h1),
:global(body.high-contrast-theme .level-complete h1),
:global(body.vitti-theme .title-screen h1),
:global(body.vitti-theme .game-over h1),
:global(body.vitti-theme .level-complete h1),
:global(body.light-theme .title-screen h1),
:global(body.light-theme .game-over h1),
:global(body.light-theme .level-complete h1),
:global(body.eva-theme .title-screen h1),
:global(body.eva-theme .game-over h1),
:global(body.eva-theme .level-complete h1),
:global(body.share-bear-theme .title-screen h1),
:global(body.share-bear-theme .game-over h1),
:global(body.share-bear-theme .level-complete h1),
:global(body.fragile-theme .title-screen h1),
:global(body.fragile-theme .game-over h1),
:global(body.fragile-theme .level-complete h1) {
  color: rgb(0 0 0 / 90%);
}

:global(body.high-contrast-theme .pause-content),
:global(body.vitti-theme .pause-content),
:global(body.light-theme .pause-content),
:global(body.eva-theme .pause-content),
:global(body.share-bear-theme .pause-content),
:global(body.fragile-theme .pause-content) {
  background: rgb(255 255 255 / 80%);
  border-color: rgb(0 0 0 / 10%);
}

:global(body.high-contrast-theme .control-item),
:global(body.vitti-theme .control-item),
:global(body.light-theme .control-item),
:global(body.eva-theme .control-item),
:global(body.share-bear-theme .control-item),
:global(body.fragile-theme .control-item) {
  background: rgb(0 0 0 / 5%);
  border-color: rgb(0 0 0 / 8%);
}

:global(body.high-contrast-theme .control-item:hover),
:global(body.vitti-theme .control-item:hover),
:global(body.light-theme .control-item:hover),
:global(body.eva-theme .control-item:hover),
:global(body.share-bear-theme .control-item:hover),
:global(body.fragile-theme .control-item:hover) {
  background: rgb(0 0 0 / 8%);
}

:global(body.high-contrast-theme .control-icon),
:global(body.vitti-theme .control-icon),
:global(body.light-theme .control-icon),
:global(body.eva-theme .control-icon),
:global(body.share-bear-theme .control-icon),
:global(body.fragile-theme .control-icon) {
  background: rgb(0 0 0 / 10%);
}

:global(body.high-contrast-theme .bottom-hud),
:global(body.vitti-theme .bottom-hud),
:global(body.light-theme .bottom-hud),
:global(body.eva-theme .bottom-hud),
:global(body.share-bear-theme .bottom-hud),
:global(body.fragile-theme .bottom-hud) {
  color: rgb(0 0 0 / 85%);
  background: linear-gradient(to top, rgb(255 255 255 / 70%), transparent);
}

:global(body.high-contrast-theme .game-btn),
:global(body.vitti-theme .game-btn),
:global(body.light-theme .game-btn),
:global(body.eva-theme .game-btn),
:global(body.share-bear-theme .game-btn),
:global(body.fragile-theme .game-btn) {
  background: rgb(0 0 0 / 8%);
  border-color: rgb(0 0 0 / 15%);
  color: rgb(0 0 0 / 90%);
}

:global(body.high-contrast-theme .game-btn:hover),
:global(body.vitti-theme .game-btn:hover),
:global(body.light-theme .game-btn:hover),
:global(body.eva-theme .game-btn:hover),
:global(body.share-bear-theme .game-btn:hover),
:global(body.fragile-theme .game-btn:hover) {
  background: rgb(0 0 0 / 12%);
  border-color: rgb(0 0 0 / 25%);
  box-shadow: inset 0 0 16px rgb(0 100 150 / 15%);
}

:global(body.high-contrast-theme .game-btn.secondary),
:global(body.vitti-theme .game-btn.secondary),
:global(body.light-theme .game-btn.secondary),
:global(body.eva-theme .game-btn.secondary),
:global(body.share-bear-theme .game-btn.secondary),
:global(body.fragile-theme .game-btn.secondary) {
  background: rgb(0 0 0 / 4%);
  border-color: rgb(0 0 0 / 10%);
  color: rgb(0 0 0 / 70%);
}

:global(body.high-contrast-theme .game-btn.secondary:hover),
:global(body.vitti-theme .game-btn.secondary:hover),
:global(body.light-theme .game-btn.secondary:hover),
:global(body.eva-theme .game-btn.secondary:hover),
:global(body.share-bear-theme .game-btn.secondary:hover),
:global(body.fragile-theme .game-btn.secondary:hover) {
  background: rgb(0 0 0 / 8%);
  border-color: rgb(0 0 0 / 20%);
  color: rgb(0 0 0 / 90%);
}

:global(body.high-contrast-theme .new-high-score),
:global(body.vitti-theme .new-high-score),
:global(body.light-theme .new-high-score),
:global(body.eva-theme .new-high-score),
:global(body.share-bear-theme .new-high-score),
:global(body.fragile-theme .new-high-score) {
  color: #b8860b;
}
</style>
