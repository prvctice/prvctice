// Centralised application settings previously loaded via a legacy script.
// Exported so Vue components/composables can import instead of reaching for
// window.AppSettings while still keeping the global for compatibility.

// Types
interface ThemeStyle {
  background: string;
  circle: string;
}

interface AppSettingsType {
  defaultTheme: string;
  themeOrder: string[];
  themeCycleOrder: string[];
  themeDisplayNames: Record<string, string>;
  themeStyles: Record<string, ThemeStyle>;
  doubleTapDelay: number;
  magnetThreshold: number;
  dragThreshold: number;
  notesLocalMaxBytes: number;
  notifDismissDelay: number;
  notifDismissAnimationMs: number;
  speechSilenceThreshold: number;
  speechSilenceTimeout: number;
  audioCircleCount: number;
  weatherWidgetVideoMaxSecs: number;
  skillsGapAbove: number;
  skillsGapBelow: number;
  dotMatrixBaseColor: string;
  dotMatrixSecondaryColor: string;
  centerInputBarOnStart: boolean;
  setTheme?: (theme: string) => void;
  [key: string]: unknown;
}

// Extend window
declare global {
  interface Window {
    AppSettings?: AppSettingsType;
  }
}

const DEFAULT_SETTINGS: AppSettingsType = {
  defaultTheme: 'high-contrast',
  themeOrder: [
    'high-contrast',
    'eva',
    'fragile',
    'night',
    'vitti',
    'vera-baxter',
    'share-bear',
    'light',
    'custom',
  ],
  themeCycleOrder: [
    'high-contrast',
    'eva',
    'fragile',
    'night',
    'vitti',
    'vera-baxter',
    'share-bear',
    'light',
  ],
  themeDisplayNames: {
    light: 'Light',
    night: 'Night',
    'vera-baxter': 'Vera Baxter',
    vitti: 'Vitti',
    'share-bear': 'Share Bear',
    eva: 'EVA',
    custom: 'Custom',
    fragile: 'Fragile',
    'high-contrast': 'High Contrast',
  },
  themeStyles: {
    light: { background: '#0e0f09', circle: '#8de60ac4' },
    night: { background: '#0e0f09', circle: '#f2ab05' },
    'vera-baxter': { background: '#0e0f09', circle: '#d799ae' },
    vitti: { background: '#0e0f09', circle: '#517562' },
    'share-bear': { background: '#0e0f09', circle: '#6865c8' },
    eva: { background: '#0e0f09', circle: '#debb42' },
    custom: { background: '#0b1a2a', circle: '#00c5ff' },
    fragile: { background: '#0e0f09', circle: '#179cd5' },
    'high-contrast': { background: '#ffffff', circle: '#000000' },
  },
  doubleTapDelay: 300,
  magnetThreshold: 10,
  dragThreshold: 6,
  notesLocalMaxBytes: 5 * 1024 * 1024,
  notifDismissDelay: 3000,
  notifDismissAnimationMs: 300,
  speechSilenceThreshold: 5,
  speechSilenceTimeout: 60_000,
  audioCircleCount: 5,
  weatherWidgetVideoMaxSecs: 30,
  skillsGapAbove: 165,
  skillsGapBelow: 165,
  dotMatrixBaseColor: '#19f00a',
  dotMatrixSecondaryColor: '#b2d408',
  centerInputBarOnStart: true,
};

function mergePlain<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  if (!overrides || typeof overrides !== 'object') return { ...base };
  const merged = { ...base } as T;
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = base[key as keyof T];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      merged[key as keyof T] = mergePlain(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>
      ) as T[keyof T];
    } else {
      merged[key as keyof T] = value as T[keyof T];
    }
  }
  return merged;
}

let currentSettings: AppSettingsType = (() => {
  try {
    if (
      typeof window !== 'undefined' &&
      window.AppSettings &&
      typeof window.AppSettings === 'object'
    ) {
      return mergePlain(DEFAULT_SETTINGS, window.AppSettings);
    }
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
})();

// Hydrate input bar start position from storage (sync read before Vue mounts)
try {
  const pos = localStorage.getItem('inputBarStartPosition');
  if (pos === 'lowered') {
    currentSettings = { ...currentSettings, centerInputBarOnStart: false };
  }
} catch (_) {}

function syncWindow(settings: AppSettingsType): void {
  try {
    if (typeof window !== 'undefined') {
      window.AppSettings = settings;
    }
  } catch (_) {}
}

syncWindow(currentSettings);

export function getAppSettings(): AppSettingsType {
  return currentSettings;
}

export function setAppSettings(overrides: Partial<AppSettingsType> = {}): AppSettingsType {
  currentSettings = mergePlain(DEFAULT_SETTINGS, overrides || {});
  syncWindow(currentSettings);
  return currentSettings;
}

export const appSettings = currentSettings;

export default {
  getAppSettings,
  setAppSettings,
  appSettings: () => currentSettings,
};
