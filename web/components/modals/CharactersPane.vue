<template>
  <div class="sp-pane-content">
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Character</h4>
        <p>Choose your 3D companion.</p>
      </div>
      <div class="cp-grid">
        <button
          v-for="char in characters"
          :key="char.id"
          type="button"
          class="cp-card"
          :class="{ active: selected === char.id }"
          @click="select(char.id)"
        >
          <iconify-icon :icon="char.icon" class="cp-icon" aria-hidden="true"></iconify-icon>
          <span class="cp-name">{{ char.name }}</span>
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';
import { useNotifs } from '@web/composables/useNotifs';

type CharacterId = 'animebird' | 'dog' | 'tree';

interface CharacterOption {
  id: CharacterId;
  name: string;
  path: string;
  icon: string;
}

const characters: readonly CharacterOption[] = [
  { id: 'animebird', name: 'Lulu', path: 'model/Animebird/animebird_opt.glb', icon: 'ph:bird' },
  { id: 'dog', name: 'Sam', path: 'model/dog/dog_base.glb', icon: 'ph:dog' },
  { id: 'tree', name: 'Symphony', path: 'model/tree/tree_opt.glb', icon: 'ph:tree' },
];

const notifs = useNotifs();

const selected = ref<CharacterId>('animebird');

function loadValues(): void {
  try {
    const stored = storage.mirror.get(STORAGE_KEYS.CHARACTER_MODEL);
    if (stored && characters.some((c) => c.id === stored)) {
      selected.value = stored as CharacterId;
    }
  } catch (_) {}
}

function select(id: CharacterId): void {
  if (id === selected.value) return;
  selected.value = id;
  storage.mirror.set(STORAGE_KEYS.CHARACTER_MODEL, id);
  const char = characters.find((c) => c.id === id);
  if (char) {
    useEventBus().emit('character:change', { id: char.id, path: char.path });
  }
  notifs.push('info', `Character set to ${characters.find((c) => c.id === id)?.name ?? id}`);
}

onMounted(() => {
  loadValues();
});

defineExpose({ loadValues });
</script>

<style scoped>
.cp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  padding: 16px 0;
}

.cp-card {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  background: rgb(255 255 255 / 5%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-lg);
  transition: all 0.15s ease;
}

.cp-card:hover {
  background: rgb(255 255 255 / 8%);
  border-color: rgb(255 255 255 / 12%);
}

.cp-card:focus-visible {
  outline: 2px solid var(--color-focus-ring, rgb(0 125 200 / 60%));
  outline-offset: 2px;
}

.cp-card.active {
  background: rgb(59 130 246 / 15%);
  border-color: rgb(59 130 246 / 40%);
}

.cp-icon {
  font-size: 28px;
  color: rgb(255 255 255 / 50%);
  transition: color 0.15s ease;
}

.cp-card.active .cp-icon {
  color: rgb(255 255 255 / 90%);
}

.cp-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgb(255 255 255 / 60%);
  transition: color 0.15s ease;
}

.cp-card.active .cp-name {
  color: rgb(255 255 255 / 95%);
}
</style>
