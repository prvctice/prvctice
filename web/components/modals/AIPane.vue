<template>
  <div class="sp-pane-content">
    <!-- Current Status Banner -->
    <div class="sp-status-banner" v-if="currentStatus">
      <span class="sp-status-label">Active</span>
      <span class="sp-status-value">{{ currentStatus }}</span>
    </div>

    <!-- Provider Selection -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Provider</h4>
        <p>Choose your AI backend.</p>
      </div>
      <div class="sp-provider-grid">
        <button
          v-for="p in providers"
          :key="p.id"
          type="button"
          class="sp-provider-btn"
          :class="{ active: provider === p.id, 'has-key': keyStatus[p.id] }"
          @click="selectProvider(p.id)"
        >
          <span class="sp-provider-name">{{ p.name }}</span>
          <span class="sp-provider-status" v-if="keyStatus[p.id]">
            <iconify-icon icon="ph:check-circle-fill"></iconify-icon>
          </span>
        </button>
      </div>
      <p class="sp-tip" v-if="!hasAnyKey">
        <iconify-icon icon="ph:info"></iconify-icon>
        Select a provider and add your API key below to get started.
      </p>
    </article>

    <!-- API Key for selected provider (not LM Studio) -->
    <article class="sp-card" v-if="provider !== 'lmstudio'">
      <div class="sp-card-header">
        <div class="sp-card-title">
          <h4>API Key</h4>
          <iconify-icon
            v-if="keyStatus[provider]"
            icon="ph:check-circle-fill"
            class="sp-key-ok"
          ></iconify-icon>
        </div>
        <p>Required to use {{ providers.find((p) => p.id === provider)?.name }}.</p>
      </div>
      <label class="sp-field">
        <div class="sp-input-password">
          <input
            :type="showKey[provider] ? 'text' : 'password'"
            v-model="apiKeys[provider]"
            :placeholder="providers.find((p) => p.id === provider)?.placeholder"
            autocomplete="off"
            @input="onKeyInput(provider)"
          />
          <button
            type="button"
            class="sp-reveal-btn"
            @click="showKey[provider] = !showKey[provider]"
            :aria-label="showKey[provider] ? 'Hide key' : 'Show key'"
          >
            <iconify-icon :icon="showKey[provider] ? 'ph:eye-slash' : 'ph:eye'"></iconify-icon>
          </button>
        </div>
        <a
          class="sp-inline-link"
          :href="providers.find((p) => p.id === provider)?.keyUrl"
          target="_blank"
          rel="noopener"
          >Get a key</a
        >
      </label>
    </article>

    <!-- LM Studio Configuration -->
    <article class="sp-card" v-if="provider === 'lmstudio'">
      <div class="sp-card-header">
        <div class="sp-card-title">
          <h4>Server</h4>
          <span class="sp-field-pill">Local</span>
        </div>
        <p>Run models locally. No API key needed.</p>
      </div>
      <label class="sp-field">
        <span>Server URL</span>
        <input
          type="text"
          v-model="lmstudioBaseUrl"
          placeholder="http://localhost:1234"
          autocomplete="off"
          @input="onLMStudioUrlChange"
        />
      </label>
      <div class="sp-lmstudio-status">
        <template v-if="lmstudioStatus.available">
          <iconify-icon icon="ph:check-circle-fill" class="sp-status-ok"></iconify-icon>
          <span>Connected ({{ lmstudioModels.length }} models)</span>
        </template>
        <template v-else>
          <iconify-icon icon="ph:warning-circle" class="sp-status-warn"></iconify-icon>
          <span>Not connected</span>
        </template>
      </div>
      <a class="sp-inline-link" href="https://lmstudio.ai" target="_blank" rel="noopener"
        >Download LM Studio</a
      >
    </article>

    <!-- Model Configuration -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Model</h4>
        <p>Customize which model to use, or leave blank for defaults.</p>
      </div>

      <!-- OpenRouter model selector -->
      <label class="sp-field" v-if="provider === 'openrouter'">
        <span>Model</span>
        <select
          v-if="openrouterModels.length > 0"
          v-model="models.openrouter"
          @change="onModelChange"
          :disabled="!keyStatus.openrouter"
        >
          <option value="">Default ({{ defaults.openrouter }})</option>
          <option v-for="m in openrouterModels" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select>
        <input
          v-else
          type="text"
          v-model="models.openrouter"
          :placeholder="defaults.openrouter"
          :disabled="!keyStatus.openrouter"
          autocomplete="off"
          @input="onModelChange"
        />
        <small class="sp-field-hint" v-if="!keyStatus.openrouter">
          Add an API key to select a model.
        </small>
      </label>

      <!-- LM Studio model selector -->
      <label class="sp-field" v-else-if="provider === 'lmstudio'">
        <span>Model</span>
        <select
          v-if="lmstudioModels.length > 0"
          v-model="models.lmstudio"
          @change="onModelChange"
          :disabled="!lmstudioStatus.available"
        >
          <option value="">Default ({{ defaults.lmstudio }})</option>
          <option v-for="m in lmstudioModels" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select>
        <input
          v-else
          type="text"
          v-model="models.lmstudio"
          :placeholder="defaults.lmstudio"
          :disabled="!lmstudioStatus.available"
          autocomplete="off"
          @input="onModelChange"
        />
        <small class="sp-field-hint" v-if="!lmstudioStatus.available">
          Start LM Studio and load a model.
        </small>
      </label>

      <!-- Default text input for other providers -->
      <label class="sp-field" v-else>
        <span>Model ID</span>
        <input
          type="text"
          v-model="models[provider]"
          :placeholder="(defaults as Record<string, string>)[provider]"
          :disabled="!keyStatus[provider]"
          autocomplete="off"
          @input="onModelChange"
        />
        <small class="sp-field-hint" v-if="!keyStatus[provider]">
          Add an API key to customize the model.
        </small>
      </label>
    </article>

    <ProviderSwitchConfirm ref="providerSwitchConfirmRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { storage } from '@web/storage/storage.js';
import { useEventBus } from '@web/services/eventBus';
import { resolve, getApiHeaders } from '@web/services/api.js';
import ProviderSwitchConfirm from '@web/components/ProviderSwitchConfirm.vue';
import { setProviderWithSync } from '@web/stores/chat/provider.js';
import { useChatStore } from '@web/stores/chat.js';
import { useNotifs } from '@web/composables/useNotifs';

interface Provider {
  id: string;
  name: string;
  placeholder?: string;
  keyUrl?: string;
}

interface LMStudioModel {
  id: string;
  name: string;
}

type ProviderKey = 'anthropic' | 'google' | 'openrouter' | 'lmstudio';

interface StoredApiKeys {
  anthropic?: string;
  google?: string;
  openrouter?: string;
}

const providers: Provider[] = [
  {
    id: 'anthropic',
    name: 'Claude',
    placeholder: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    name: 'Gemini',
    placeholder: 'AIza...',
    keyUrl: 'https://makersuite.google.com/app/apikey',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    placeholder: 'sk-or-...',
    keyUrl: 'https://openrouter.ai/keys',
  },
  { id: 'lmstudio', name: 'Local (LM Studio)' },
];

const FALLBACK_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  google: 'gemini-3-flash-preview',
  openrouter: 'minimax/minimax-m2.5',
  lmstudio: 'local-model',
};

const notifs = useNotifs();

// Component refs
const providerSwitchConfirmRef = ref<InstanceType<typeof ProviderSwitchConfirm> | null>(null);

// Chat store for accessing messages
const chatStore = useChatStore();

// State
const provider = ref('anthropic');

const models = reactive<Record<string, string>>({
  anthropic: '',
  google: '',
  openrouter: '',
  lmstudio: '',
});

const keyStatus = reactive<Record<string, boolean>>({
  anthropic: false,
  google: false,
  openrouter: false,
  lmstudio: false,
});

// API key state
const apiKeys = reactive<Record<string, string>>({
  anthropic: '',
  google: '',
  openrouter: '',
});

const showKey = reactive<Record<string, boolean>>({
  anthropic: false,
  google: false,
  openrouter: false,
});

// LM Studio URL
const lmstudioBaseUrl = ref('http://localhost:1234');

// LM Studio state
const lmstudioStatus = ref<{ available: boolean }>({ available: false });
const lmstudioModels = ref<LMStudioModel[]>([]);
const openrouterModels = ref<LMStudioModel[]>([]);

// Computed
const hasAnyKey = computed(() => {
  return keyStatus.anthropic || keyStatus.google || keyStatus.openrouter || keyStatus.lmstudio;
});

const defaults = computed(() => ({
  anthropic: resolveDefaultModel('anthropic'),
  google: resolveDefaultModel('google'),
  openrouter: resolveDefaultModel('openrouter'),
  lmstudio: resolveDefaultModel('lmstudio'),
}));

const currentStatus = computed(() => {
  const p = provider.value;
  const modelName = models[p] || defaults.value[p as keyof typeof defaults.value];
  const providerName = providers.find((x) => x.id === p)?.name || p;
  return `${providerName} · ${modelName}`;
});

// Methods
function resolveDefaultModel(providerKey: string): string {
  try {
    const getDefaultModel = (window as { getDefaultModel?: (key: string) => string })
      .getDefaultModel;
    if (typeof getDefaultModel === 'function') {
      const resolved = getDefaultModel(providerKey);
      if (resolved && typeof resolved === 'string') return resolved;
    }
  } catch (_) {}
  return FALLBACK_MODELS[providerKey] ?? FALLBACK_MODELS.anthropic ?? 'claude-sonnet-4-6';
}

async function selectProvider(id: string): Promise<void> {
  // If switching to same provider, just update UI state
  if (id === provider.value) return;

  const newProvider = id as ProviderKey;
  const messages = chatStore.messages || [];
  const hasMessages = messages.length > 0;
  const hasImages = messages.some((m) => m.images && m.images.length > 0);

  // Show confirmation if there are existing messages
  if (hasMessages && providerSwitchConfirmRef.value) {
    const confirmed = await providerSwitchConfirmRef.value.show({
      targetProvider: newProvider,
      hasImages,
      hasMessages,
    });

    if (!confirmed) {
      return; // User cancelled
    }
  }

  // Update local UI state immediately
  provider.value = id;

  // Sync history and update storage
  try {
    await setProviderWithSync(newProvider, messages);
    notifs.push('info', 'Provider updated');
  } catch (err) {
    console.warn('[AIPane] Provider sync failed:', err);
    // Still save provider even if sync fails
    saveProvider();
  }
}

function updateKeyStatus(): void {
  try {
    const stored = (storage.mirror.getJSON('apiKeys', {}) || {}) as StoredApiKeys;
    keyStatus.anthropic = !!stored.anthropic;
    keyStatus.google = !!stored.google;
    keyStatus.openrouter = !!stored.openrouter;
    // Load key values
    apiKeys.anthropic = stored.anthropic || '';
    apiKeys.google = stored.google || '';
    apiKeys.openrouter = stored.openrouter || '';
  } catch (_) {}

  // Check LM Studio status
  checkLMStudioStatus();
}

function onKeyInput(providerId: string): void {
  keyStatus[providerId] = !!apiKeys[providerId]?.trim();
  saveApiKeys();
}

function saveApiKeys(): void {
  // Get existing keys to preserve non-AI keys
  const existing = (storage.mirror.getJSON('apiKeys', {}) || {}) as Record<string, string>;
  const obj = {
    ...existing,
    anthropic: (apiKeys.anthropic ?? '').trim(),
    google: (apiKeys.google ?? '').trim(),
    openrouter: (apiKeys.openrouter ?? '').trim(),
  };

  storage.mirror.setJSON('apiKeys', obj);

  // Backward compatibility
  storage.mirror.set('anthropicApiKey', obj.anthropic);
  storage.mirror.set('geminiApiKey', obj.google);
  storage.mirror.set('googleApiKey', obj.google);
  storage.mirror.set('openrouterApiKey', obj.openrouter);

  try {
    useEventBus().emit('api-keys:updated', { source: 'ai-pane' });
  } catch (_) {}

  notifs.push('info', 'API key saved');
  fetchOpenRouterModels();
}

function isLocalLMStudioUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function onLMStudioUrlChange(): void {
  const url = lmstudioBaseUrl.value.trim();
  if (!url) {
    storage.mirror.set('lmstudio:baseUrl', '');
    return;
  }
  if (!isLocalLMStudioUrl(url)) {
    lmstudioStatus.value.available = false;
    return;
  }
  storage.mirror.set('lmstudio:baseUrl', url);
  checkLMStudioStatus();
}

async function checkLMStudioStatus(): Promise<void> {
  try {
    const url = storage.mirror.get('lmstudio:baseUrl') || 'http://localhost:1234';
    const response = await fetch(
      resolve(`/api/v1/lmstudio/status?baseUrl=${encodeURIComponent(url)}`),
      {
        headers: getApiHeaders(),
      }
    );
    const data = await response.json();
    lmstudioStatus.value.available = data.available;
    keyStatus.lmstudio = data.available;

    if (data.available) {
      await fetchLMStudioModels(url);
    }
  } catch (_) {
    lmstudioStatus.value.available = false;
    keyStatus.lmstudio = false;
  }
}

async function fetchLMStudioModels(baseUrl: string): Promise<void> {
  try {
    const response = await fetch(
      resolve(`/api/v1/lmstudio/models?baseUrl=${encodeURIComponent(baseUrl)}`),
      {
        headers: getApiHeaders(),
      }
    );
    const data = await response.json();
    if (data.ok && data.models) {
      lmstudioModels.value = data.models;
    }
  } catch (_) {}
}

async function fetchOpenRouterModels(): Promise<void> {
  try {
    const stored = (storage.mirror.getJSON('apiKeys', {}) || {}) as StoredApiKeys;
    if (!stored.openrouter) return;

    const response = await fetch(resolve('/api/v1/openrouter/models'), {
      headers: getApiHeaders({ Authorization: `Bearer ${stored.openrouter}` }),
    });
    const data = await response.json();
    if (data.ok && data.models) {
      openrouterModels.value = data.models;
    }
  } catch (_) {}
}

function saveProvider(): void {
  storage.mirror.set('llmProvider', provider.value);
  notifs.push('info', 'Provider updated');
}

function onModelChange(): void {
  saveModels();
}

function saveModels(): void {
  const mAnth = (models.anthropic ?? '').trim();
  const mGmn = (models.google ?? '').trim();
  const mOpenRouter = (models.openrouter ?? '').trim();
  const mLMStudio = (models.lmstudio ?? '').trim();

  storage.mirror.set('model:anthropic', mAnth);
  storage.mirror.set('model:gemini', mGmn);
  storage.mirror.set('model:google', mGmn);
  storage.mirror.set('model:openrouter', mOpenRouter);
  storage.mirror.set('model:lmstudio', mLMStudio);

  notifs.push('info', 'Model updated');
}

function loadValues(): void {
  // Provider
  const getDefaultProvider = (window as { getDefaultProvider?: () => string }).getDefaultProvider;
  provider.value = storage.mirror.get('llmProvider') || getDefaultProvider?.() || 'anthropic';

  // Models
  models.anthropic = storage.mirror.get('model:anthropic') || '';
  models.google = storage.mirror.get('model:gemini') || storage.mirror.get('model:google') || '';
  models.openrouter = storage.mirror.get('model:openrouter') || '';
  models.lmstudio = storage.mirror.get('model:lmstudio') || '';

  // LM Studio URL
  lmstudioBaseUrl.value = storage.mirror.get('lmstudio:baseUrl') || 'http://localhost:1234';

  updateKeyStatus();
  fetchOpenRouterModels();
}

function onApiKeysUpdated(): void {
  updateKeyStatus();
  fetchOpenRouterModels();
}

onMounted(() => {
  loadValues();

  // Listen for key updates from KeysPane
  useEventBus().on('api-keys:updated', onApiKeysUpdated);
});

onBeforeUnmount(() => {
  useEventBus().off('api-keys:updated', onApiKeysUpdated);
});

defineExpose({ loadValues });
</script>

<style scoped>
.sp-status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgb(100 181 246 / 15%), rgb(67 200 255 / 10%));
  border: 1px solid rgb(100 181 246 / 25%);
  border-radius: var(--radius-lg);
  margin-bottom: 18px;
}

.sp-status-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.7;
}

.sp-status-value {
  font-weight: 600;
  font-size: 0.95rem;
}

.sp-provider-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.sp-provider-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: var(--radius-lg);
  border: 1px solid rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 3%);
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.sp-provider-btn:hover {
  background: rgb(255 255 255 / 8%);
  border-color: rgb(255 255 255 / 20%);
}

.sp-provider-btn.active {
  background: rgb(100 181 246 / 12%);
  border-color: rgb(100 181 246 / 40%);
  color: #64b5f6;
}

.sp-provider-status {
  color: #64b5f6;
  font-size: 1.1rem;
  line-height: 1;
}

.sp-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  opacity: 0.7;
  margin-top: 12px;
}

.sp-tip iconify-icon {
  font-size: 1rem;
  color: #ffb347;
}

.sp-field-hint {
  font-size: 0.8rem;
  opacity: 0.6;
  margin-top: 4px;
}

.sp-segmented {
  display: flex;
  gap: 2px;
  background: rgb(255 255 255 / 6%);
  border-radius: var(--radius-lg);
  padding: 3px;
}

.sp-segmented button {
  all: unset;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s ease;
  text-align: center;
  flex: 1;
}

.sp-segmented button:hover {
  background: rgb(255 255 255 / 8%);
}

.sp-segmented button.active {
  background: rgb(100 181 246 / 20%);
  color: #64b5f6;
}

/* Select styling */
.sp-field select {
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 6%);
  color: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' fill-opacity='0.5' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.sp-field select:hover {
  border-color: rgb(255 255 255 / 20%);
}

.sp-field select:focus {
  outline: none;
  border-color: rgb(100 181 246 / 50%);
}

.sp-field select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sp-field select option {
  background: #1a1a2e;
  color: #fff;
}

/* API Key input styles */
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

.sp-key-ok {
  color: #5ef0a3;
  font-size: 1rem;
  margin-left: 8px;
}

.sp-inline-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 0.8rem;
  color: #64b5f6;
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.2s ease;
}

.sp-inline-link:hover {
  opacity: 1;
  text-decoration: underline;
}

/* LM Studio status */
.sp-lmstudio-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-top: 12px;
  background: rgb(255 255 255 / 4%);
  border-radius: var(--radius-lg);
  font-size: 0.85rem;
}

.sp-status-ok {
  color: #5ef0a3;
}

.sp-status-warn {
  color: #ffb347;
}

.sp-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-card-title h4 {
  margin: 0;
}
</style>
