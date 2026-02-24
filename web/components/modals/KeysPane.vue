<template>
  <div class="sp-pane-content">
    <!-- Service API Keys -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Services</h4>
        <p>Optional keys for additional features.</p>
      </div>
      <div class="sp-field-stack">
        <label class="sp-field">
          <div class="sp-field-header">
            <span>YouTube</span>
            <span class="sp-field-pill">Video search</span>
          </div>
          <div class="sp-input-password">
            <input
              :type="showOtherKeys.youtube ? 'text' : 'password'"
              v-model="otherKeys.youtube"
              placeholder="AIza..."
              autocomplete="off"
              @input="onOtherKeyChange"
            />
            <button
              type="button"
              class="sp-reveal-btn"
              @click="showOtherKeys.youtube = !showOtherKeys.youtube"
            >
              <iconify-icon
                :icon="showOtherKeys.youtube ? 'ph:eye-slash' : 'ph:eye'"
              ></iconify-icon>
            </button>
          </div>
        </label>

        <label class="sp-field">
          <div class="sp-field-header">
            <span>Wikipedia</span>
            <span class="sp-field-pill">Optional</span>
          </div>
          <div class="sp-input-password">
            <input
              :type="showOtherKeys.wikipedia ? 'text' : 'password'"
              v-model="otherKeys.wikipedia"
              placeholder="Leave empty for shared API"
              autocomplete="off"
              @input="onOtherKeyChange"
            />
            <button
              type="button"
              class="sp-reveal-btn"
              @click="showOtherKeys.wikipedia = !showOtherKeys.wikipedia"
            >
              <iconify-icon
                :icon="showOtherKeys.wikipedia ? 'ph:eye-slash' : 'ph:eye'"
              ></iconify-icon>
            </button>
          </div>
        </label>

        <label class="sp-field">
          <div class="sp-field-header">
            <span>Discogs</span>
            <span class="sp-field-pill">Album art</span>
          </div>
          <p class="sp-field-desc">Unlock real album artwork for music moodboards.</p>
          <div class="sp-input-password">
            <input
              :type="showOtherKeys.discogs ? 'text' : 'password'"
              v-model="otherKeys.discogs"
              placeholder="Your Discogs token"
              autocomplete="off"
              @input="onOtherKeyChange"
            />
            <button
              type="button"
              class="sp-reveal-btn"
              @click="showOtherKeys.discogs = !showOtherKeys.discogs"
            >
              <iconify-icon
                :icon="showOtherKeys.discogs ? 'ph:eye-slash' : 'ph:eye'"
              ></iconify-icon>
            </button>
          </div>
          <a
            class="sp-inline-link"
            href="https://www.discogs.com/settings/developers"
            target="_blank"
            rel="noopener"
            >Generate a Discogs token</a
          >
        </label>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue';
import { storage } from '@web/storage/storage.js';
import { useEventBus } from '@web/services/eventBus';
import { useNotifs } from '@web/composables/useNotifs';

interface StoredApiKeys {
  youtube?: string;
  wikipedia?: string;
  discogs?: string;
}

const notifs = useNotifs();

const otherKeys = reactive<Record<string, string>>({
  youtube: '',
  wikipedia: '',
  discogs: '',
});

const showOtherKeys = reactive<Record<string, boolean>>({
  youtube: false,
  wikipedia: false,
  discogs: false,
});

function onOtherKeyChange(): void {
  saveKeys();
}

function saveKeys(): void {
  // Get existing keys to preserve AI provider keys
  const existing = (storage.mirror.getJSON('apiKeys', {}) || {}) as Record<string, string>;
  const obj = {
    ...existing,
    youtube: (otherKeys.youtube ?? '').trim(),
    wikipedia: (otherKeys.wikipedia ?? '').trim(),
    discogs: (otherKeys.discogs ?? '').trim(),
  };

  storage.mirror.setJSON('apiKeys', obj);

  // Backward compatibility
  storage.mirror.set('youtubeApiKey', obj.youtube);
  storage.mirror.set('wikipediaApiKey', obj.wikipedia);
  storage.mirror.set('discogsToken', obj.discogs);

  try {
    useEventBus().emit('api-keys:updated', { source: 'keys-pane' });
  } catch (_) {}

  notifs.push('info', 'Keys saved');
}

function loadValues(): void {
  try {
    const stored = (storage.mirror.getJSON('apiKeys', {}) || {}) as StoredApiKeys;
    otherKeys.youtube = stored.youtube || '';
    otherKeys.wikipedia = stored.wikipedia || '';
    otherKeys.discogs = stored.discogs || '';
  } catch (_) {}
}

onMounted(() => {
  loadValues();
});

defineExpose({ loadValues });
</script>

<style scoped>
.sp-field-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sp-field-desc {
  font-size: 0.8rem;
  opacity: 0.65;
  margin: 4px 0 8px;
}

.sp-input-password {
  position: relative;
  display: flex;
  align-items: center;
}

.sp-input-password input {
  flex: 1;
  padding-right: 44px;
}

.sp-reveal-btn {
  all: unset;
  position: absolute;
  right: 12px;
  cursor: pointer;
  padding: 4px;
  opacity: 0.5;
  transition: opacity 0.2s ease;
  font-size: 1.1rem;
  line-height: 1;
}

.sp-reveal-btn:hover {
  opacity: 1;
}
</style>
