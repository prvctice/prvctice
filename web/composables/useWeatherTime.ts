// Weather/Time widget state + helpers (Vue version)
// Minimal parity to start: toggle visibility, show time for timezone,
// fetch current weather via Open-Meteo, persist location via mirror storage.

import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';
import { getConfig } from '@web/stores/config.js';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';
import { logError } from '@web/utils/debugLog.js';

interface Location {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface WeatherResponse {
  current_weather?: {
    temperature: number;
    weathercode: number;
    is_day: number;
  };
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
}

interface Config {
  features?: {
    domHooks?: boolean;
  };
}

interface UseWeatherTimeOptions {
  domHooks?: boolean;
  interceptToggleSelector?: string;
}

interface UseWeatherTimeReturn {
  visible: Ref<boolean>;
  location: Ref<Location>;
  timeString: Ref<string>;
  weatherString: Ref<string>;
  isDay: Ref<boolean>;
  weatherCode: Ref<number | null>;
  setVisible: (v: boolean) => void;
  toggle: () => void;
  saveLocation: () => void;
}

// Window types imported from global.d.ts

// Extend HTMLButtonElement to track intercept handler
interface ExtendedHTMLButtonElement extends HTMLButtonElement {
  __vueWeatherIntercept?: (e: MouseEvent) => void;
}

const DEFAULT_LOCATION: Location = {
  name: 'NYC',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
};

// Singleton state
const visible = ref(false);
const location = ref<Location>({ ...DEFAULT_LOCATION });
const timeString = ref('');
const weatherString = ref('');
const isDay = ref(true);
const weatherCode = ref<number | null>(null);
let timeTimer: ReturnType<typeof setInterval> | null = null;
let weatherTimer: ReturnType<typeof setInterval> | null = null;
let interceptAttached = false;

function loadLocation(): void {
  try {
    const obj = storage.mirror.getJSON(STORAGE_KEYS.WEATHER_PREFS) as Location | null;
    if (
      obj &&
      typeof obj.latitude === 'number' &&
      typeof obj.longitude === 'number' &&
      typeof obj.timezone === 'string'
    ) {
      location.value = {
        name: obj.name || DEFAULT_LOCATION.name,
        latitude: obj.latitude,
        longitude: obj.longitude,
        timezone: obj.timezone,
      };
      return;
    }
  } catch (_) {}
  // Restore defaults when nothing is saved or payload is invalid
  location.value = { ...DEFAULT_LOCATION };
}

// Listen for location change events from settings
let locationChangeListenerAttached = false;
function attachLocationChangeListener(): void {
  if (locationChangeListenerAttached) return;
  if (typeof window === 'undefined') return;
  useEventBus().on('weather:location-changed', () => {
    loadLocation();
    updateTime();
    updateWeather();
  });
  locationChangeListenerAttached = true;
}
attachLocationChangeListener();

function saveLocation(): void {
  storage.mirror.setJSON(STORAGE_KEYS.WEATHER_PREFS, location.value);
}

function updateTime(): void {
  try {
    const now = new Date();
    timeString.value = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: location.value.timezone,
    });
    // Optional dusk gradient hint (hour only) for theme parity
    try {
      const updateGradient = window.updateFragileThemeGradient || window.updateDuskThemeGradient;
      if (updateGradient) {
        const hourStr = now.toLocaleString('en-US', {
          hour: '2-digit',
          hour12: false,
          timeZone: location.value.timezone,
        });
        const h = parseInt(hourStr, 10);
        if (!Number.isNaN(h)) updateGradient(h);
      }
    } catch (_) {}
  } catch (_) {}
}

async function updateWeather(): Promise<void> {
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' +
      location.value.latitude +
      '&longitude=' +
      location.value.longitude +
      '&current_weather=true&daily=sunrise,sunset&timezone=' +
      encodeURIComponent(location.value.timezone);
    const res = await fetch(url);
    const data = (await res.json()) as WeatherResponse;
    const cw = data.current_weather;
    if (cw) {
      const codes: Record<number, string> = {
        0: 'Clear',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Rime fog',
        51: 'Light drizzle',
        53: 'Drizzle',
        55: 'Dense drizzle',
        56: 'Freez. drzl',
        57: 'Freez. drzl',
        61: 'Light rain',
        63: 'Rain',
        65: 'Heavy rain',
        66: 'Frz. rain',
        67: 'Frz. rain',
        71: 'Light snow',
        73: 'Snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Showers',
        81: 'Showers',
        82: 'Showers',
        85: 'Snow shw.',
        86: 'Snow shw.',
        95: 'Thunder',
        96: 'Thun. hail',
        99: 'Thun. hail',
      };
      const tempF = (cw.temperature * 9) / 5 + 32;
      weatherString.value = `${tempF.toFixed(1)}°F · ${codes[cw.weathercode] || ''}`;
      // Expose basic state for UI icons
      try {
        isDay.value = cw.is_day === 1;
      } catch (_) {
        isDay.value = true;
      }
      try {
        weatherCode.value = cw.weathercode ?? null;
      } catch (_) {
        weatherCode.value = null;
      }
      try {
        const updateGradient = window.updateFragileThemeGradient || window.updateDuskThemeGradient;
        if (updateGradient) {
          const sunriseISO = data.daily?.sunrise?.[0];
          const sunsetISO = data.daily?.sunset?.[0];
          if (sunriseISO && sunsetISO) {
            window._duskSunrise = sunriseISO;
            window._duskSunset = sunsetISO;
            updateGradient(new Date());
          }
        }
      } catch (_) {}
    } else {
      weatherString.value = 'Weather unavailable';
    }
  } catch (e) {
    logError('weather', 'fetch', e as Error);
    weatherString.value = 'Weather unavailable';
  }
}

function setVisible(v: boolean): void {
  visible.value = Boolean(v);
  // Reflect button active state
  try {
    const btn = document.getElementById('weather-widget-toggle-button');
    if (btn) btn.classList.toggle('active', visible.value);
  } catch (_) {}
  // When opening, reload location and refresh weather/time so changes from
  // the Settings panel (which still writes via the shim) are applied immediately.
  if (visible.value) {
    loadLocation();
    updateTime();
    updateWeather();
  }
}

function toggle(): void {
  setVisible(!visible.value);
}

function attachToggleInterceptor(): void {
  if (interceptAttached) return;
  const btn = document.getElementById(
    'weather-widget-toggle-button'
  ) as ExtendedHTMLButtonElement | null;
  if (!btn) return;
  const handler = (e: MouseEvent): void => {
    // Intercept when Vue weather is enabled to avoid legacy handler
    if (window.__flags && window.__flags.__VUE_WEATHER_ENABLED) {
      e.preventDefault();
      e.stopImmediatePropagation?.();
      e.stopPropagation();
      toggle();
    }
  };
  btn.addEventListener('click', handler, true /* capture */);
  btn.__vueWeatherIntercept = handler;
  interceptAttached = true;
}

function detachToggleInterceptor(): void {
  const btn = document.getElementById(
    'weather-widget-toggle-button'
  ) as ExtendedHTMLButtonElement | null;
  if (btn && btn.__vueWeatherIntercept) {
    btn.removeEventListener('click', btn.__vueWeatherIntercept, true);
    delete btn.__vueWeatherIntercept;
  }
  interceptAttached = false;
}

export function useWeatherTime(opts: UseWeatherTimeOptions = {}): UseWeatherTimeReturn {
  // Resolve options with config defaults
  const cfg = getConfig() as Config | null;
  const domHooks =
    typeof opts.domHooks === 'boolean' ? opts.domHooks : (cfg?.features?.domHooks ?? true);
  const interceptToggleSelector =
    typeof opts.interceptToggleSelector === 'string'
      ? opts.interceptToggleSelector
      : '#weather-widget-toggle-button';
  if (!timeTimer) {
    loadLocation();
    updateTime();
    timeTimer = setInterval(updateTime, 1000);
  }
  if (!weatherTimer) {
    updateWeather();
    weatherTimer = setInterval(updateWeather, 10 * 60 * 1000);
  }
  // Keep window helper for legacy callers that toggle programmatically
  if (domHooks) {
    try {
      const legacyToggle = window.toggleWeatherTimeWidget;
      window.toggleWeatherTimeWidget = () => {
        if (window.__flags && window.__flags.__VUE_WEATHER_ENABLED) return toggle();
        return typeof legacyToggle === 'function' ? legacyToggle() : undefined;
      };
    } catch (_) {}
  }

  onMounted(() => {
    if (!domHooks) return;
    // Update selector if caller provided a different toggle location
    try {
      if (interceptToggleSelector && interceptToggleSelector !== '#weather-widget-toggle-button') {
        const btn = document.querySelector(
          interceptToggleSelector
        ) as ExtendedHTMLButtonElement | null;
        if (btn) {
          const handler = (e: MouseEvent): void => {
            if (window.__flags && window.__flags.__VUE_WEATHER_ENABLED) {
              e.preventDefault();
              e.stopImmediatePropagation?.();
              e.stopPropagation();
              toggle();
            }
          };
          btn.addEventListener('click', handler, true);
          btn.__vueWeatherIntercept = handler;
          interceptAttached = true;
          return;
        }
      }
    } catch (_) {}
    attachToggleInterceptor();
  });
  onBeforeUnmount(() => {
    if (!domHooks) return;
    detachToggleInterceptor();
  });

  return {
    visible,
    location,
    timeString,
    weatherString,
    isDay,
    weatherCode,
    setVisible,
    toggle,
    saveLocation,
  };
}
