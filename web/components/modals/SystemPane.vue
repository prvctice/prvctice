<template>
  <div class="sp-pane-content">
    <!-- Weather & Location -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Weather widget</h4>
        <p>Set your location for the floating weather display.</p>
      </div>
      <label class="sp-field">
        <span>Location</span>
        <div class="sp-input-with-action">
          <input
            type="text"
            v-model="weatherQuery"
            placeholder="City name or zip code"
            @keydown.enter="searchLocation"
          />
          <button
            type="button"
            class="sp-input-action sp-input-action--text"
            @click="searchLocation"
            :disabled="searching"
          >
            <iconify-icon v-if="searching" icon="ph:circle-notch" class="spin"></iconify-icon>
            <span>{{ searching ? 'Setting...' : 'Set location' }}</span>
          </button>
        </div>
      </label>

      <!-- Current location display -->
      <div class="sp-location-result" v-if="currentLocation">
        <iconify-icon icon="ph:map-pin-fill" class="sp-location-icon"></iconify-icon>
        <span class="sp-location-name">{{ currentLocation }}</span>
        <button
          type="button"
          class="sp-location-clear"
          @click="clearLocation"
          aria-label="Clear location"
        >
          <iconify-icon icon="ph:x"></iconify-icon>
        </button>
      </div>

      <!-- Search feedback -->
      <div class="sp-field-feedback" v-if="searchFeedback">
        <iconify-icon
          :icon="searchFeedback.success ? 'ph:check-circle' : 'ph:warning-circle'"
          :class="searchFeedback.success ? 'valid' : 'invalid'"
        ></iconify-icon>
        <span>{{ searchFeedback.message }}</span>
      </div>
    </article>

    <!-- Temperature preference -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Temperature</h4>
        <p>Unit preference for weather apps and widgets.</p>
      </div>
      <div class="sp-field">
        <span class="sp-toggle-title">Unit</span>
        <div class="sp-theme-grid">
          <button
            type="button"
            :class="{ active: temperatureUnit === 'fahrenheit' }"
            @click="setTemperatureUnit('fahrenheit')"
          >
            °F (Fahrenheit)
          </button>
          <button
            type="button"
            :class="{ active: temperatureUnit === 'celsius' }"
            @click="setTemperatureUnit('celsius')"
          >
            °C (Celsius)
          </button>
        </div>
      </div>
    </article>

    <!-- Input bar start position -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Input bar</h4>
        <p>Where the input bar appears when you open the app.</p>
      </div>
      <div class="sp-field">
        <span class="sp-toggle-title">Start position</span>
        <div class="sp-theme-grid">
          <button
            type="button"
            :class="{ active: barStartPosition === 'centered' }"
            @click="setBarStartPosition('centered')"
          >
            Centered
          </button>
          <button
            type="button"
            :class="{ active: barStartPosition === 'lowered' }"
            @click="setBarStartPosition('lowered')"
          >
            Lowered
          </button>
        </div>
      </div>
    </article>

    <!-- Load app -->
    <article class="sp-card">
      <div class="sp-card-header">
        <h4>Load app</h4>
        <p>Import an HTML app from a file.</p>
      </div>
      <div class="sp-field">
        <input
          ref="fileInputRef"
          type="file"
          accept=".html,.htm"
          class="sp-file-input-hidden"
          @change="handleFileSelect"
        />
        <button
          type="button"
          class="sp-input-action sp-input-action--text"
          :disabled="loadingApp"
          @click="fileInputRef?.click()"
        >
          <iconify-icon
            :icon="loadingApp ? 'ph:circle-notch' : 'ph:upload-simple'"
            :class="{ spin: loadingApp }"
          ></iconify-icon>
          <span>{{ loadingApp ? 'Loading...' : 'Choose file' }}</span>
        </button>
        <p class="sp-load-warning">
          Sideloaded apps run in a sandbox but are not verified. Load files from sources you trust.
        </p>
      </div>
    </article>

    <!-- Danger Zone -->
    <article class="sp-card sp-card--danger">
      <div class="sp-card-header">
        <h4>Danger zone</h4>
        <p>Irreversible actions that permanently delete your data.</p>
      </div>
      <div class="sp-danger-item">
        <div class="sp-danger-content">
          <span class="sp-danger-title">Clear all data</span>
          <span class="sp-danger-desc">
            Remove all conversations, notes, settings, and stored files. This cannot be undone.
          </span>
        </div>
        <button
          type="button"
          class="sp-danger-action"
          :class="{
            'sp-danger-action--warning': confirmStep === 1,
            'sp-danger-action--confirm': confirmStep === 2,
          }"
          @click="confirmClearAllData"
          :disabled="clearing"
        >
          <iconify-icon
            :icon="clearing ? 'ph:circle-notch' : confirmStep === 2 ? 'ph:warning' : 'ph:trash'"
            :class="{ spin: clearing }"
          ></iconify-icon>
          <span>{{
            clearing
              ? 'Clearing...'
              : confirmStep === 2
                ? 'Confirm'
                : confirmStep === 1
                  ? 'Sure?'
                  : 'Clear'
          }}</span>
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
import { getAppSettings } from '@web/config/appSettings';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { validateAppCode } from '@web/services/apps/validator';
import type { AppDefinition } from '@web/types/apps';
import { useNotifs } from '@web/composables/useNotifs';

type BarStartPosition = 'centered' | 'lowered';
type TemperatureUnit = 'fahrenheit' | 'celsius';

interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface SearchFeedback {
  success: boolean;
  message: string;
}

interface ElectronStorage {
  clearAll: () => Promise<{ __error?: boolean; message?: string }>;
}

interface ClearResult {
  success: boolean;
  errors?: string[];
}

const notifs = useNotifs();

const LS_WEATHER = 'weatherWidgetPrefs';

const weatherQuery = ref('');
const currentLocation = ref('');
const searching = ref(false);
const searchFeedback = ref<SearchFeedback | null>(null);
const temperatureUnit = ref<TemperatureUnit>('fahrenheit');
const barStartPosition = ref<BarStartPosition>('centered');
const fileInputRef = ref<HTMLInputElement | null>(null);
const loadingApp = ref(false);
const clearing = ref(false);
const confirmStep = ref(0); // 0 = initial, 1 = first confirm, 2 = ready to clear
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

async function handleFileSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Reset input so re-selecting the same file triggers change
  input.value = '';

  loadingApp.value = true;
  try {
    const html = await file.text();

    const result = validateAppCode(html);
    if (!result.valid) {
      notifs.push('info', 'Validation failed: ' + result.violations.join(', '));
      return;
    }

    // Extract <title> for app name, fallback to filename
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const name = titleMatch?.[1]?.trim() || file.name.replace(/\.(html?|htm)$/i, '');

    const definition: AppDefinition = {
      id: crypto.randomUUID(),
      name,
      type: 'html',
      source: 'sideloaded',
      permissions: [],
      html,
    };

    const registry = createAppRegistry();
    await registry.register(definition);
    notifs.push('info', `App loaded: ${name}`);
  } catch (err) {
    console.error('[SystemPane] Failed to load app', err);
    notifs.push('info', 'Failed to load app');
  } finally {
    loadingApp.value = false;
  }
}

async function geocodeByName(query: string): Promise<GeoLocation | null> {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?name=' +
    encodeURIComponent(query) +
    '&count=1&language=en&format=json';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;
    const r = data.results[0];
    return {
      name: r.name || query,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone || 'UTC',
    };
  } catch {
    return null;
  }
}

async function geocodeByZipCode(zipCode: string): Promise<GeoLocation | null> {
  // Use Zippopotam.us for US zip code lookup (free, no API key)
  const url = `https://api.zippopotam.us/us/${zipCode}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.places?.length) return null;
    const place = data.places[0];
    const lat = parseFloat(place.latitude);
    const lng = parseFloat(place.longitude);
    if (isNaN(lat) || isNaN(lng)) return null;

    // Get timezone from Open-Meteo using the coordinates
    const tzUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`;
    let timezone = 'America/New_York'; // Default for US
    try {
      const tzRes = await fetch(tzUrl);
      const tzData = await tzRes.json();
      if (tzData.timezone) timezone = tzData.timezone;
    } catch {}

    return {
      name: `${place['place name']}, ${place['state abbreviation']}`,
      latitude: lat,
      longitude: lng,
      timezone,
    };
  } catch {
    return null;
  }
}

async function geocode(query: string): Promise<GeoLocation | null> {
  // Check if query is a US zip code (5 digits)
  if (/^\d{5}$/.test(query)) {
    return geocodeByZipCode(query);
  }
  return geocodeByName(query);
}

function refreshWeatherWidget(): void {
  try {
    // Dispatch event for Vue composable to reload location
    useEventBus().emit('weather:location-changed');
  } catch (err) {
    console.warn('[SystemPane] Failed to refresh Weather widget', err);
  }
}

async function searchLocation(): Promise<void> {
  const q = weatherQuery.value.trim();
  if (!q) return;

  searching.value = true;
  searchFeedback.value = null;

  const geo = await geocode(q);

  searching.value = false;

  if (geo) {
    storage.mirror.setJSON(LS_WEATHER, geo);
    currentLocation.value = geo.name;
    weatherQuery.value = '';
    searchFeedback.value = { success: true, message: `Found: ${geo.name}` };
    refreshWeatherWidget();
    notifs.push('info', 'Weather location updated');

    // Clear feedback after a moment
    setTimeout(() => {
      searchFeedback.value = null;
    }, 3000);
  } else {
    searchFeedback.value = {
      success: false,
      message: 'Location not found. Try a different search.',
    };
  }
}

function clearLocation(): void {
  storage.mirror.set(LS_WEATHER, null);
  currentLocation.value = '';
  weatherQuery.value = '';
  refreshWeatherWidget();
  notifs.push('info', 'Weather location cleared');
}

function resetConfirmStep(): void {
  confirmStep.value = 0;
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
}

async function confirmClearAllData(): Promise<void> {
  if (clearing.value) return;

  if (confirmStep.value === 0) {
    // First click: show warning
    confirmStep.value = 1;
    notifs.push('info', 'Click again to confirm deletion');
    // Auto-reset after 5 seconds
    confirmTimer = setTimeout(() => {
      resetConfirmStep();
    }, 5000);
    return;
  }

  if (confirmStep.value === 1) {
    // Second click: final confirmation
    confirmStep.value = 2;
    notifs.push('info', 'Click once more to permanently delete all data');
    // Auto-reset after 3 seconds
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      resetConfirmStep();
    }, 3000);
    return;
  }

  // Third click: execute
  resetConfirmStep();
  await executeClearAllData();
}

async function executeClearAllData(): Promise<void> {
  clearing.value = true;
  try {
    const electronStorage = (window as { electronStorage?: ElectronStorage }).electronStorage;
    const isElectron = typeof electronStorage?.clearAll === 'function';
    if (isElectron && electronStorage) {
      // Clear SQLite database via IPC
      const result = await electronStorage.clearAll();
      if (result?.__error) {
        throw new Error(result.message);
      }
      // Also clear browser storage in renderer process (IndexedDB, OPFS, localStorage)
      // The frontend uses IndexedDB for conversations/messages, not SQLite
      const { clearAllData } = (await import('@web/storage/storage.js')) as {
        clearAllData: () => Promise<ClearResult>;
      };
      const webResult = await clearAllData();
      if (!webResult.success) {
        console.warn('[SystemPane] Partial web storage clear:', webResult.errors);
      }
    } else {
      const { clearAllData } = (await import('@web/storage/storage.js')) as {
        clearAllData: () => Promise<ClearResult>;
      };
      const result = await clearAllData();
      if (!result.success) {
        console.warn('[SystemPane] Partial clear:', result.errors);
      }
    }
    notifs.push('info', 'All data cleared. Reloading...');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (err) {
    console.error('[SystemPane] Failed to clear data', err);
    notifs.push('info', 'Failed to clear data');
    clearing.value = false;
  }
}

function setTemperatureUnit(unit: TemperatureUnit): void {
  temperatureUnit.value = unit;
  const existing = (storage.mirror.getJSON('systemPreferences', {}) || {}) as Record<
    string,
    unknown
  >;
  storage.mirror.setJSON('systemPreferences', { ...existing, temperatureUnit: unit });
  notifs.push('info', 'Temperature unit updated');
}

function setBarStartPosition(position: BarStartPosition): void {
  barStartPosition.value = position;
  storage.mirror.set(STORAGE_KEYS.INPUT_BAR_START_POSITION, position);
  const settings = getAppSettings();
  settings.centerInputBarOnStart = position === 'centered';
  notifs.push('info', 'Input bar position updated');
}

function loadValues(): void {
  try {
    const raw = storage.mirror.getJSON(LS_WEATHER) as { name?: string } | null;
    currentLocation.value = raw?.name || '';
  } catch (_) {}

  try {
    const sysPref = storage.mirror.getJSON('systemPreferences', null) as {
      temperatureUnit?: string;
    } | null;
    if (sysPref?.temperatureUnit === 'celsius') {
      temperatureUnit.value = 'celsius';
    } else {
      // Default based on locale
      const resolvedOptions = Intl.DateTimeFormat().resolvedOptions();
      const isUS =
        resolvedOptions.locale?.startsWith('en-US') ||
        resolvedOptions.timeZone?.startsWith('America/');
      temperatureUnit.value = isUS ? 'fahrenheit' : 'celsius';
    }
  } catch (_) {}

  try {
    const posPref = storage.mirror.get(STORAGE_KEYS.INPUT_BAR_START_POSITION);
    barStartPosition.value = posPref === 'lowered' ? 'lowered' : 'centered';
  } catch (_) {}
}

onMounted(() => {
  loadValues();
});

defineExpose({ loadValues });
</script>

<style scoped>
.sp-input-with-action {
  display: flex;
  gap: 8px;
}

.sp-input-with-action input {
  flex: 1;
}

.sp-input-action {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 8%);
  border: 1px solid rgb(255 255 255 / 15%);
  transition: all 0.2s ease;
  font-size: 1.1rem;
}

.sp-input-action--text {
  width: auto;
  padding: 0 16px;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}

.sp-input-action:hover:not(:disabled) {
  background: rgb(255 255 255 / 15%);
}

.sp-input-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sp-input-action .spin {
  animation: spin 1s linear infinite;
}

.sp-location-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgb(94 240 163 / 10%);
  border: 1px solid rgb(94 240 163 / 25%);
  border-radius: var(--radius-lg);
  margin-top: 12px;
}

.sp-location-icon {
  color: #5ef0a3;
  font-size: 1.1rem;
}

.sp-location-name {
  flex: 1;
  font-weight: 500;
}

.sp-location-clear {
  all: unset;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s ease;
  font-size: 1rem;
  line-height: 1;
}

.sp-location-clear:hover {
  opacity: 1;
}

.sp-field-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  margin-top: 10px;
}

.sp-field-feedback iconify-icon.valid {
  color: #5ef0a3;
}

.sp-field-feedback iconify-icon.invalid {
  color: #ffb347;
}

.sp-card--muted {
  opacity: 0.5;
  border-style: dashed;
}

.sp-file-input-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.sp-load-warning {
  margin-top: 10px;
  font-size: 0.8rem;
  color: rgb(255 255 255 / 40%);
  line-height: 1.4;
}
</style>
