<template>
  <div class="pong" :class="{ 'is-playing': isPlaying }" data-no-orbit>
    <canvas ref="canvasRef" class="game-canvas" @touchmove.prevent />

    <div v-if="isPlaying || state === 'scored'" class="hud">
      <div class="score-group left">
        <div class="player-name">You</div>
        <div class="score-left">{{ playerScore }}</div>
      </div>
      <div class="score-group right">
        <div class="score-right">{{ aiScore }}</div>
        <div class="player-name">{{ opponentName }}</div>
      </div>
    </div>

    <div v-if="isPlaying || state === 'scored'" class="bottom-hud">
      <div class="bottom-hud-score">Round {{ currentRound }} | Total: {{ totalPoints }}</div>
      <div class="bottom-hud-buttons">
        <button
          class="bottom-hud-btn icon-btn"
          :class="{ active: handTrackingOn }"
          :title="handTrackingOn ? 'Hand tracking on' : 'Hand tracking off'"
          @click="toggleHandTracking"
        >
          <iconify-icon icon="ph:hand-pointing" width="18" height="18"></iconify-icon>
        </button>
        <button
          class="bottom-hud-btn icon-btn"
          :class="{ active: hapticEnabled }"
          :title="hapticEnabled ? 'Haptic feedback on' : 'Haptic feedback off'"
          @click="toggleHaptic"
        >
          <iconify-icon icon="ph:vibrate" width="18" height="18"></iconify-icon>
        </button>
        <button class="bottom-hud-btn" @click="togglePause">Pause</button>
        <button class="bottom-hud-btn" @click="exitToTitle">Exit</button>
      </div>
    </div>

    <div v-if="state === 'title'" class="title-screen">
      <h1>PONG</h1>
      <p class="stats">
        Best Run: Round {{ highScore.highestRound }} | {{ highScore.totalPoints }} pts
      </p>
      <p class="instructions">Win matches to advance. Play until you lose!</p>
      <p class="controls">Mouse / Touch / W/S / Arrow Keys / Gamepad / Hand Tracking</p>
      <button class="game-btn" @click="startTournament">Start Tournament</button>
      <button class="game-btn secondary" @click="exit">Exit</button>
    </div>

    <div v-if="state === 'paused'" class="pause-menu">
      <div class="pause-content">
        <div class="pause-header">
          <div class="pause-icon">||</div>
          <h2>Paused</h2>
        </div>

        <div class="pause-stats">
          <p>Round {{ currentRound }} | Total Points: {{ totalPoints }}</p>
        </div>

        <div class="pause-controls">
          <h3>Controls</h3>
          <div class="control-grid">
            <div class="control-item">
              <span class="control-icon">W S</span>
              <span class="control-label">Keyboard</span>
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

    <div v-if="state === 'round_complete'" class="round-complete">
      <h1>Round {{ currentRound }} Complete!</h1>
      <p class="match-result">You defeated {{ opponentName }}</p>
      <p class="round-score">{{ playerScore }} - {{ aiScore }}</p>
      <p class="total-points">Total Points: {{ totalPoints }}</p>
      <p class="next-opponent">Next opponent: {{ nextOpponentName }}</p>
      <button class="game-btn" @click="startNextRound">Continue</button>
    </div>

    <div v-if="state === 'gameover'" class="game-over">
      <h1>Tournament Over</h1>
      <p class="final-score">{{ playerScore }} - {{ aiScore }}</p>
      <p class="opponent-result">{{ opponentName }} wins</p>
      <div class="tournament-summary">
        <p class="rounds-reached">Rounds Won: {{ currentRound - 1 }}</p>
        <p class="total-points-final">Total Points: {{ totalPoints }}</p>
        <p v-if="isNewHighScore" class="new-record">New Record!</p>
        <p class="best-record">
          Best: Round {{ highScore.highestRound }} | {{ highScore.totalPoints }} pts
        </p>
      </div>
      <button class="game-btn" @click="startTournament">Play Again</button>
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
  setAIDifficulty,
  setHapticIntensity,
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
import { getStats, recordWin, recordLoss, getHighScore, updateHighScore } from './storage';
import type { PongStats, PongHighScore } from './storage';
import { getAINameForRound, getThemeColors } from './types';
import type { GameState } from './types';

const emit = defineEmits<{
  (e: 'exit'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const { reduceMotion } = useMotionPreferences();

const state = ref<GameState>('title');
const playerScore = ref(0);
const aiScore = ref(0);
const opponentName = ref('');
const winner = ref<'player' | 'ai' | null>(null);
const stats = ref<PongStats>({ wins: 0, losses: 0, highestRally: 0 });
const highScore = ref<PongHighScore>({ highestRound: 0, totalPoints: 0 });

const currentRound = ref(1);
const totalPoints = ref(0);
const usedOpponentNames = ref<string[]>([]);
const nextOpponentName = ref('');
const isNewHighScore = ref(false);

let engine: GameEngine | null = null;
let inputHandlers: InputHandlers | null = null;
const inputState = createInputState();
let themeObserver: MutationObserver | null = null;

const handTrackingOn = ref(isHandTrackingEnabled() && isGlobalHandTrackingActive());
const hapticEnabled = ref(true);

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

function toggleHaptic(): void {
  hapticEnabled.value = !hapticEnabled.value;
  if (engine) {
    setHapticIntensity(engine, hapticEnabled.value ? 1 : 0);
  }
}

const isPlaying = computed(() => state.value === 'playing');

function handleThemeChange(): void {
  if (engine) {
    updateThemeColors(engine, getThemeColors());
  }
}

onMounted(async () => {
  stats.value = await getStats();
  highScore.value = await getHighScore();
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

function startTournament(): void {
  currentRound.value = 1;
  totalPoints.value = 0;
  usedOpponentNames.value = [];
  isNewHighScore.value = false;
  startRound();
}

function startNextRound(): void {
  currentRound.value++;
  startRound();
}

function startRound(): void {
  if (!canvasRef.value) return;

  resizeCanvas();

  playerScore.value = 0;
  aiScore.value = 0;
  winner.value = null;

  opponentName.value = getAINameForRound(currentRound.value, usedOpponentNames.value);
  usedOpponentNames.value.push(opponentName.value);

  state.value = 'playing';

  engine = createEngine(canvasRef.value, {
    reduceMotion: reduceMotion.value,
    round: currentRound.value,
    hapticIntensity: hapticEnabled.value ? 1 : 0,
    callbacks: {
      onScoreChange: (p, a) => {
        playerScore.value = p;
        aiScore.value = a;
      },
      onGameOver: async (w) => {
        winner.value = w;
        state.value = 'gameover';

        await recordLoss();
        stats.value = await getStats();

        isNewHighScore.value = await updateHighScore(currentRound.value - 1, totalPoints.value);
        highScore.value = await getHighScore();
      },
      onMatchWon: async () => {
        totalPoints.value += playerScore.value;

        nextOpponentName.value = getAINameForRound(currentRound.value + 1, usedOpponentNames.value);

        state.value = 'round_complete';

        await recordWin();
        stats.value = await getStats();
      },
      onStateChange: (s) => {
        if (s === 'paused') state.value = 'paused';
        if (s === 'playing' && state.value === 'paused') state.value = 'playing';
        if (s === 'scored') state.value = 'scored';
        if (s === 'round_complete') state.value = 'round_complete';
      },
      onPointScored: () => {
        // Could add sound here
      },
    },
  });

  inputHandlers = setupInput(canvasRef.value, engine, inputState, togglePause);
  setAIDifficulty(engine, currentRound.value);
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
</script>

<style scoped>
.pong {
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

/* ========================================
   HUD - Score Display
   ======================================== */
.hud {
  position: absolute;
  top: clamp(20px, 4vh, 40px);
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: clamp(48px, 12vw, 120px);
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  color: var(--pong-text, #fff);
  pointer-events: none;
  user-select: none;
}

.score-group {
  display: flex;
  align-items: center;
  gap: clamp(8px, 2vw, 16px);
}

.score-group.left {
  flex-direction: row;
}

.score-group.right {
  flex-direction: row;
}

.score-left,
.score-right {
  font-size: clamp(24px, 4vw, 42px);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  min-width: 1.75em;
  text-align: center;
  letter-spacing: 0.02em;
}

.player-name {
  font-size: clamp(8px, 1.2vw, 11px);
  opacity: 0.45;
  white-space: nowrap;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ========================================
   Menu Screens (Title, Pause, Game Over, Round Complete)
   ======================================== */
.title-screen,
.pause-menu,
.game-over,
.round-complete {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 85%); /* High opacity for reliable text readability over dotmatrix */
  color: #fff;
  gap: var(--space-6, 16px);
}

.title-screen h1,
.game-over h1,
.round-complete h1 {
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 400;
  margin: 0;
  letter-spacing: 0.15em;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  color: #fff;
  text-transform: uppercase;
}

/* ========================================
   Pause Menu
   ======================================== */
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

/* ========================================
   Title Screen Text
   ======================================== */
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

/* ========================================
   Round Complete Screen
   ======================================== */
.round-complete {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.round-complete h1 {
  color: var(--skill-power-color, #2880f0);
}

.match-result {
  font-size: var(--font-size-lg, 1.25rem);
  opacity: 0.8;
  margin: 0;
}

.round-score {
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 400;
  margin: 0;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  font-variant-numeric: tabular-nums;
}

.total-points {
  font-size: var(--font-size-md, 1.125rem);
  opacity: 0.7;
  margin: 0;
}

.next-opponent {
  font-size: var(--font-size-base, 1rem);
  opacity: 0.6;
  margin: var(--space-6, 16px) 0;
  font-style: italic;
}

/* ========================================
   Game Over Screen
   ======================================== */
.final-score {
  font-size: clamp(2.5rem, 10vw, 4rem);
  font-weight: 400;
  margin: 0;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.opponent-result {
  font-size: var(--font-size-lg, 1.25rem);
  opacity: 0.6;
  margin: 0;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tournament-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4, 8px);
  margin: var(--space-6, 16px) 0;
  padding: var(--space-6, 16px) var(--space-10, 32px);
  background: rgb(255 255 255 / 5%);
  border-radius: var(--radius-md, 8px);
  border: 1px solid rgb(255 255 255 / 10%);
}

.rounds-reached {
  font-size: var(--font-size-xl, 1.5rem);
  font-weight: 500;
  margin: 0;
}

.total-points-final {
  font-size: var(--font-size-lg, 1.25rem);
  opacity: 0.8;
  margin: 0;
}

.new-record {
  font-size: var(--font-size-md, 1.125rem);
  color: var(--skill-power-color, #2880f0);
  font-weight: 600;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.best-record {
  font-size: var(--font-size-sm, 0.875rem);
  opacity: 0.5;
  margin: 0;
}

/* ========================================
   Buttons - Frosted glass style matching app aesthetic
   ======================================== */
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

/* ========================================
   Reduced Motion
   ======================================== */
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

/* ========================================
   Mobile Portrait Layout
   ======================================== */
@media (max-width: 768px) and (orientation: portrait) {
  .pong {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  /* Menus need safe area padding */
  .title-screen,
  .pause-menu,
  .game-over,
  .round-complete {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  /* Pause menu adjustments */
  .pause-content {
    padding: var(--space-8, 24px);
    gap: var(--space-8, 24px);
    max-width: 90vw;
  }

  .control-grid {
    gap: var(--space-4, 8px);
  }

  .control-item {
    padding: var(--space-4, 10px) var(--space-4, 8px);
  }

  .control-icon {
    font-size: var(--font-size-xs, 0.75rem);
    padding: var(--space-2, 3px) var(--space-4, 8px);
  }

  .control-label {
    font-size: 0.6875rem;
  }

  /* Smaller instructions on mobile */
  .instructions {
    max-width: 300px;
  }
}

/* ========================================
   Small Mobile Devices
   ======================================== */
@media (max-width: 480px) {
  .pause-content {
    padding: var(--space-7, 20px);
  }

  .control-grid {
    gap: var(--space-3, 6px);
  }
}

/* ========================================
   Bottom HUD
   ======================================== */
.bottom-hud {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  padding-right: max(24px, env(safe-area-inset-right, 24px));
  padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
  box-sizing: border-box;
  font-family: var(--font-family-mono, 'IBM Plex Mono', monospace);
  font-weight: 500;
  font-size: 14px;
  color: var(--pong-text, #fff);
  pointer-events: auto;
  background: var(--pong-hud-gradient, linear-gradient(to top, rgb(0 0 0 / 50%), transparent));
  z-index: 10;
}

.bottom-hud-score {
  color: inherit;
  letter-spacing: 0.02em;
}

.bottom-hud-buttons {
  display: flex;
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

/* ========================================
   Light Theme Overrides
   For: high-contrast, focus, light, eva, share-bear, fragile
   ======================================== */
:global(body.high-contrast-theme .pong),
:global(body.vitti-theme .pong),
:global(body.light-theme .pong),
:global(body.eva-theme .pong),
:global(body.share-bear-theme .pong),
:global(body.fragile-theme .pong) {
  /* Dark text for light backgrounds */
  --pong-text: rgb(0 0 0 / 90%);
  --pong-text-muted: rgb(0 0 0 / 60%);
  --pong-hud-gradient: linear-gradient(to top, rgb(255 255 255 / 70%), transparent);
  --pong-border: rgb(0 0 0 / 15%);
  --pong-border-strong: rgb(0 0 0 / 30%);
  --pong-surface: rgb(0 0 0 / 5%);
  --pong-surface-hover: rgb(0 0 0 / 8%);
  --pong-overlay: rgb(255 255 255 / 92%);
  --pong-shadow: rgb(0 0 0 / 15%);
}

/* Apply light theme colors to menu screens */
:global(body.high-contrast-theme .title-screen),
:global(body.high-contrast-theme .pause-menu),
:global(body.high-contrast-theme .game-over),
:global(body.high-contrast-theme .round-complete),
:global(body.vitti-theme .title-screen),
:global(body.vitti-theme .pause-menu),
:global(body.vitti-theme .game-over),
:global(body.vitti-theme .round-complete),
:global(body.light-theme .title-screen),
:global(body.light-theme .pause-menu),
:global(body.light-theme .game-over),
:global(body.light-theme .round-complete),
:global(body.eva-theme .title-screen),
:global(body.eva-theme .pause-menu),
:global(body.eva-theme .game-over),
:global(body.eva-theme .round-complete),
:global(body.share-bear-theme .title-screen),
:global(body.share-bear-theme .pause-menu),
:global(body.share-bear-theme .game-over),
:global(body.share-bear-theme .round-complete),
:global(body.fragile-theme .title-screen),
:global(body.fragile-theme .pause-menu),
:global(body.fragile-theme .game-over),
:global(body.fragile-theme .round-complete) {
  background: rgb(255 255 255 / 92%);
  color: rgb(0 0 0 / 90%);
}

:global(body.high-contrast-theme .title-screen h1),
:global(body.high-contrast-theme .game-over h1),
:global(body.high-contrast-theme .round-complete h1),
:global(body.vitti-theme .title-screen h1),
:global(body.vitti-theme .game-over h1),
:global(body.vitti-theme .round-complete h1),
:global(body.light-theme .title-screen h1),
:global(body.light-theme .game-over h1),
:global(body.light-theme .round-complete h1),
:global(body.eva-theme .title-screen h1),
:global(body.eva-theme .game-over h1),
:global(body.eva-theme .round-complete h1),
:global(body.share-bear-theme .title-screen h1),
:global(body.share-bear-theme .game-over h1),
:global(body.share-bear-theme .round-complete h1),
:global(body.fragile-theme .title-screen h1),
:global(body.fragile-theme .game-over h1),
:global(body.fragile-theme .round-complete h1) {
  color: rgb(0 0 0 / 90%);
}

/* Pause content for light themes */
:global(body.high-contrast-theme .pause-content),
:global(body.vitti-theme .pause-content),
:global(body.light-theme .pause-content),
:global(body.eva-theme .pause-content),
:global(body.share-bear-theme .pause-content),
:global(body.fragile-theme .pause-content) {
  background: rgb(255 255 255 / 80%);
  border-color: rgb(0 0 0 / 10%);
}

/* Control items for light themes */
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

/* HUD for light themes */
:global(body.high-contrast-theme .hud),
:global(body.vitti-theme .hud),
:global(body.light-theme .hud),
:global(body.eva-theme .hud),
:global(body.share-bear-theme .hud),
:global(body.fragile-theme .hud) {
  color: rgb(0 0 0 / 90%);
}

/* Bottom HUD for light themes */
:global(body.high-contrast-theme .bottom-hud),
:global(body.vitti-theme .bottom-hud),
:global(body.light-theme .bottom-hud),
:global(body.eva-theme .bottom-hud),
:global(body.share-bear-theme .bottom-hud),
:global(body.fragile-theme .bottom-hud) {
  color: rgb(0 0 0 / 85%);
  background: linear-gradient(to top, rgb(255 255 255 / 70%), transparent);
}

/* Buttons for light themes */
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

/* New record indicator for light themes */
:global(body.high-contrast-theme .new-record),
:global(body.vitti-theme .new-record),
:global(body.light-theme .new-record),
:global(body.eva-theme .new-record),
:global(body.share-bear-theme .new-record),
:global(body.fragile-theme .new-record) {
  color: #b8860b;
}
</style>
