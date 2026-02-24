<template>
  <div class="sp-pane-content">
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>App loading animation</h4>
        <p>Choose which animation plays while apps are being generated.</p>
      </div>

      <div class="anim-grid">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          class="anim-option"
          :class="{ active: selected === opt.id }"
          @click="select(opt.id)"
        >
          <div
            class="anim-preview"
            :class="{ 'anim-preview--invert': !opt.colorful }"
            :style="opt.previewStyle"
          />
          <span class="anim-label">{{ opt.label }}</span>
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { LOADING_SPRITE_B64 } from '@web/assets/loadingSprite';
import { LOADING_SPRITE_CHICKEN_B64 } from '@web/assets/loadingSpriteChicken';
import { LOADING_SPRITE_CREATURE_B64 } from '@web/assets/loadingSpriteCreature';
import { LOADING_SPRITE_SONGBIRD_B64 } from '@web/assets/loadingSpriteSongbird';
import { LOADING_SPRITE_PARROT_B64 } from '@web/assets/loadingSpriteParrot';
import { LOADING_SPRITE_LOVEBIRD_B64 } from '@web/assets/loadingSpriteLovebird';
import { LOADING_SPRITE_BIRDIE_B64 } from '@web/assets/loadingSpriteBirdie';
import { LOADING_SPRITE_RUNNER_B64 } from '@web/assets/loadingSpriteRunner';

const ANIMATION_IDS = [
  'duck',
  'chicken',
  'creature',
  'songbird',
  'parrot',
  'lovebird',
  'birdie',
  'runner',
] as const;
type AnimationId = (typeof ANIMATION_IDS)[number];

const selected = ref<AnimationId>('duck');

interface AnimOption {
  readonly id: AnimationId;
  readonly label: string;
  readonly colorful: boolean;
  readonly previewStyle: Record<string, string>;
}

function spriteStyle(
  id: string,
  b64: string,
  frameW: number,
  frameH: number,
  sheetW: number,
  sheetH: number,
  cols: number,
  rows: number,
  rowDur: string,
  sheetDur: string
): Record<string, string> {
  return {
    width: `${frameW}px`,
    height: `${frameH}px`,
    background: `url('data:image/png;base64,${b64}') 0 0 no-repeat`,
    backgroundSize: `${sheetW}px ${sheetH}px`,
    imageRendering: 'pixelated',
    animation: `${id}-row ${rowDur} steps(${cols}) infinite, ${id}-sheet ${sheetDur} steps(${rows}) infinite`,
  };
}

const options = computed<readonly AnimOption[]>(() => [
  {
    id: 'duck',
    label: 'Duck',
    colorful: false,
    previewStyle: spriteStyle('duck', LOADING_SPRITE_B64, 56, 50, 616, 250, 11, 5, '2.2s', '11s'),
  },
  {
    id: 'chicken',
    label: 'Chicken',
    colorful: false,
    previewStyle: spriteStyle(
      'chicken',
      LOADING_SPRITE_CHICKEN_B64,
      88,
      84,
      792,
      336,
      9,
      4,
      '0.75s',
      '3s'
    ),
  },
  {
    id: 'creature',
    label: 'Creature',
    colorful: false,
    previewStyle: spriteStyle(
      'creature',
      LOADING_SPRITE_CREATURE_B64,
      80,
      80,
      400,
      240,
      5,
      3,
      '0.417s',
      '1.25s'
    ),
  },
  {
    id: 'songbird',
    label: 'Songbird',
    colorful: false,
    previewStyle: spriteStyle(
      'songbird',
      LOADING_SPRITE_SONGBIRD_B64,
      70,
      70,
      700,
      350,
      10,
      5,
      '0.833s',
      '4.167s'
    ),
  },
  {
    id: 'parrot',
    label: 'Parrot',
    colorful: true,
    previewStyle: spriteStyle(
      'parrot',
      LOADING_SPRITE_PARROT_B64,
      70,
      70,
      700,
      420,
      10,
      6,
      '0.833s',
      '5s'
    ),
  },
  {
    id: 'lovebird',
    label: 'Lovebird',
    colorful: false,
    previewStyle: spriteStyle(
      'lovebird',
      LOADING_SPRITE_LOVEBIRD_B64,
      80,
      80,
      800,
      240,
      10,
      3,
      '0.833s',
      '2.5s'
    ),
  },
  {
    id: 'birdie',
    label: 'Birdie',
    colorful: false,
    previewStyle: spriteStyle(
      'birdie',
      LOADING_SPRITE_BIRDIE_B64,
      80,
      80,
      720,
      320,
      9,
      4,
      '0.75s',
      '3s'
    ),
  },
  {
    id: 'runner',
    label: 'Runner',
    colorful: false,
    previewStyle: spriteStyle(
      'runner',
      LOADING_SPRITE_RUNNER_B64,
      50,
      60,
      850,
      360,
      17,
      6,
      '1s',
      '6s'
    ),
  },
]);

function select(id: AnimationId): void {
  selected.value = id;
  storage.mirror.set(STORAGE_KEYS.LOADING_ANIMATION, id);
}

function loadValues(): void {
  const saved = storage.mirror.get(STORAGE_KEYS.LOADING_ANIMATION);
  if (ANIMATION_IDS.includes(saved as AnimationId)) {
    selected.value = saved as AnimationId;
  }
}

onMounted(() => {
  loadValues();
});

defineExpose({ loadValues });
</script>

<style scoped>
.anim-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  padding: 8px 0;
}

.anim-option {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 8px 12px;
  background: rgb(255 255 255 / 5%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-lg);
  transition: all 0.15s ease;
}

.anim-option:hover {
  background: rgb(255 255 255 / 8%);
  border-color: rgb(255 255 255 / 12%);
}

.anim-option:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgb(0 125 200 / 60%));
  outline-offset: 2px;
}

.anim-option.active {
  background: rgb(59 130 246 / 15%);
  border-color: rgb(59 130 246 / 40%);
}

.anim-preview--invert {
  filter: invert(1);
}

.anim-label {
  font-size: var(--font-size-xs);
  font-weight: 450;
  color: rgb(255 255 255 / 70%);
  letter-spacing: 0.01em;
}

.anim-option.active .anim-label {
  color: rgb(255 255 255 / 95%);
}

/* Per-sprite keyframes */
@keyframes duck-row {
  to {
    background-position-x: -616px;
  }
}
@keyframes duck-sheet {
  to {
    background-position-y: -250px;
  }
}

@keyframes chicken-row {
  to {
    background-position-x: -792px;
  }
}
@keyframes chicken-sheet {
  to {
    background-position-y: -336px;
  }
}

@keyframes creature-row {
  to {
    background-position-x: -400px;
  }
}
@keyframes creature-sheet {
  to {
    background-position-y: -240px;
  }
}

@keyframes songbird-row {
  to {
    background-position-x: -700px;
  }
}
@keyframes songbird-sheet {
  to {
    background-position-y: -350px;
  }
}

@keyframes parrot-row {
  to {
    background-position-x: -700px;
  }
}
@keyframes parrot-sheet {
  to {
    background-position-y: -420px;
  }
}

@keyframes lovebird-row {
  to {
    background-position-x: -800px;
  }
}
@keyframes lovebird-sheet {
  to {
    background-position-y: -240px;
  }
}

@keyframes birdie-row {
  to {
    background-position-x: -720px;
  }
}
@keyframes birdie-sheet {
  to {
    background-position-y: -320px;
  }
}

@keyframes runner-row {
  to {
    background-position-x: -850px;
  }
}
@keyframes runner-sheet {
  to {
    background-position-y: -360px;
  }
}
</style>
