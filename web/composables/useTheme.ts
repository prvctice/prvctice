import { ref, type Ref } from 'vue';
import { getConfig } from '@web/stores/config.js';
import { getAppSettings } from '@web/config/appSettings.js';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import { logError } from '@web/utils/debugLog.js';

interface ThemeStyles {
  background: string;
  circle: string;
}

interface AppSettings {
  themeOrder?: string[];
  themeStyles?: Record<string, ThemeStyles>;
  defaultTheme?: string;
}

interface Config {
  features?: {
    domHooks?: boolean;
  };
}

interface UseThemeOptions {
  domHooks?: boolean;
}

interface UseThemeReturn {
  currentTheme: Ref<string | null>;
  setTheme: (theme: string) => string;
  init: () => void;
  themes: string[];
  cycle: (step?: number) => string;
  getCurrent: () => string;
}

// Window types imported from global.d.ts

const THEME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  dark: 'night',
  cool: 'vera-baxter',
  minimal: 'vitti',
  focus: 'vitti',
  paper: 'share-bear',
  sunset: 'eva',
  dusk: 'fragile',
  monday: 'custom',
  blue: 'vera-baxter',
});

const WHITE_LOGO_THEMES = new Set(['night', 'vera-baxter', 'custom', 'purple']);

function getSettings(): AppSettings {
  try {
    return getAppSettings() || {};
  } catch (_) {}
  return {};
}

// Themes excluded from cycling (only accessible via settings menu)
const NON_CYCLEABLE_THEMES = new Set(['custom']);

function getThemes(): string[] {
  const s = getSettings();
  // Use configured order if available; otherwise provide a superset.
  return (
    s.themeOrder || [
      'light',
      'night',
      'vera-baxter',
      'vitti',
      'share-bear',
      'eva',
      'fragile',
      'custom',
      'purple',
      'high-contrast',
      'blue',
      'dev',
    ]
  );
}

function getCycleableThemes(): string[] {
  return getThemes().filter((t) => !NON_CYCLEABLE_THEMES.has(t));
}

function getThemeStyles(): Record<string, ThemeStyles> {
  const s = getSettings();
  if (s.themeStyles) {
    const remapped: Record<string, ThemeStyles> = {};
    for (const [key, value] of Object.entries(s.themeStyles)) {
      const canonical = THEME_ALIASES[key] || key;
      remapped[canonical] = value;
      if (canonical !== key && !(key in remapped)) remapped[key] = value;
    }
    return remapped;
  }
  // Minimal fallbacks matching existing look (background + circle accent)
  const base: Record<string, ThemeStyles> = {
    light: { background: '#7da7c1', circle: '#02ad32' },
    night: { background: '#0e0f09', circle: '#f2ab05' },
    'vera-baxter': { background: '#8da1d4', circle: '#0202b5' },
    vitti: { background: '#b8c2bb', circle: '#121212' },
    'share-bear': { background: '#c7b9ec', circle: '#0069ff' },
    eva: { background: '#5ba9d4', circle: '#debb42' },
    fragile: { background: '#ebd4ee', circle: '#6f8dca' },
    custom: { background: '#0e0f09', circle: '#f2ab05' },
    blue: { background: '#3467eb', circle: '#e8f48c' },
    'high-contrast': { background: '#000000', circle: '#ffffff' },
    purple: { background: '#200e4b', circle: '#e26bfa' },
  };
  const defaultStyle: ThemeStyles = { background: '#000000', circle: '#ffffff' };
  return {
    ...base,
    dark: base.night ?? defaultStyle,
    cool: base['vera-baxter'] ?? defaultStyle,
    minimal: base.vitti ?? defaultStyle,
    paper: base['share-bear'] ?? defaultStyle,
    sunset: base.eva ?? defaultStyle,
    dusk: base.fragile ?? defaultStyle,
    monday: base.custom ?? defaultStyle,
  };
}

function updateMetaThemeColor(newColor: string): void {
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', newColor);
  } catch (_) {}
}

function applyLogoVariant(theme: string): void {
  try {
    const canonical = THEME_ALIASES[theme] || theme;
    const logoSrc = WHITE_LOGO_THEMES.has(canonical)
      ? import.meta.env.BASE_URL + 'images/logo-white.png'
      : import.meta.env.BASE_URL + 'images/logo.png';
    document.querySelectorAll('img.site-logo').forEach((img) => {
      (img as HTMLImageElement).src = logoSrc;
    });
  } catch (_) {}
}

function toggleCustomBackground(theme: string): void {
  try {
    const bg = document.getElementById('theme-bg-image') as HTMLImageElement | null;
    if (!bg) return;
    const canonical = THEME_ALIASES[theme] || theme;
    if (canonical === 'custom') {
      bg.style.display = '';
      const src = bg.getAttribute('data-default-src') || bg.getAttribute('src');
      if (src) bg.setAttribute('src', src);
    } else {
      bg.style.display = 'none';
    }
  } catch (_) {}
}

let singleton: UseThemeReturn | undefined;

export function useTheme(opts: UseThemeOptions = {}): UseThemeReturn {
  if (singleton) return singleton;
  const themes = getThemes();
  const styles = getThemeStyles();

  const currentTheme = ref<string | null>(null);

  function setTheme(theme: string): string {
    const cfg = getConfig() as Config | null;
    const domHooks =
      typeof opts.domHooks === 'boolean' ? opts.domHooks : (cfg?.features?.domHooks ?? true);
    try {
      // Accept any known theme key; if unknown, still apply generically.
      if (!theme) theme = getSettings().defaultTheme || 'light';
      const alias = THEME_ALIASES[theme];
      if (alias) theme = alias;

      // Preserve horizontal scroll position for chat/notes container
      const chatContainer = domHooks ? document.getElementById('chat-container') : null;
      const prevScrollLeft = chatContainer ? chatContainer.scrollLeft : 0;

      // Remove any existing `*-theme` classes to avoid stale theme residue.
      if (domHooks) {
        const removeThemeClasses = (el: Element): void => {
          try {
            const toRemove = Array.from(el.classList).filter((c) => /-theme$/.test(c));
            toRemove.forEach((c) => el.classList.remove(c));
          } catch (_) {}
        };
        removeThemeClasses(document.body);
        removeThemeClasses(document.documentElement);
        document.body.classList.add(`${theme}-theme`);
        document.documentElement.classList.add(`${theme}-theme`);
      }

      const resolved = styles[theme] ||
        styles.light || { background: '#0e0f09', circle: '#f2ab05' };
      const bg = resolved.background || '#0e0f09';
      if (domHooks) updateMetaThemeColor(bg);

      const circle = domHooks ? document.getElementById('theme-color-circle') : null;
      let circleColor: string | undefined = resolved.circle;
      if (domHooks) {
        try {
          const computedCircleColor = getComputedStyle(document.body).getPropertyValue(
            '--color-text'
          );
          if (computedCircleColor) circleColor = computedCircleColor.trim() || circleColor;
        } catch (_) {}
      }
      if (!circleColor) circleColor = '#f2ab05';
      if (circle) (circle as HTMLElement).style.backgroundColor = circleColor;
      // Maintain legacy globals some modules read
      try {
        const normalizedCircleColor = circleColor.trim();
        window.baseCircleColor = normalizedCircleColor;
        const hexMatch = normalizedCircleColor.match(/^#?([0-9a-fA-F]{6})$/);
        if (hexMatch && hexMatch[1]) {
          const hex = hexMatch[1];
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          window.baseCircleRGB = { r, g, b };
        } else {
          const rgbMatch = normalizedCircleColor
            .replace(/\s+/g, '')
            .match(/^rgba?\((\d+),(\d+),(\d+)/i);
          if (rgbMatch) {
            window.baseCircleRGB = {
              r: Number(rgbMatch[1]),
              g: Number(rgbMatch[2]),
              b: Number(rgbMatch[3]),
            };
          } else {
            window.baseCircleRGB = null;
          }
        }
      } catch (_) {}

      if (domHooks) applyLogoVariant(theme);
      if (domHooks) toggleCustomBackground(theme);

      // Persist + announce
      storage.mirror.set(STORAGE_KEYS.THEME, theme);
      window.currentTheme = theme;
      currentTheme.value = theme;
      // Emit via typed event bus
      try {
        const bus = useEventBus();
        bus.emit('theme:change', { theme });
      } catch (_) {}
      // Legacy event dispatch for backwards compatibility with archive scripts
      // and third-party integrations. The eventBus bridge also handles this,
      // but direct dispatch ensures reliability. Can be removed when all
      // legacy code is confirmed migrated.
      try {
        window.dispatchEvent(new CustomEvent('themeChange', { detail: { theme } }));
        document.dispatchEvent(new CustomEvent('themeChange', { detail: { theme } }));
      } catch (_) {}

      if (chatContainer) chatContainer.scrollLeft = prevScrollLeft;
      return theme;
    } catch (e) {
      logError('theme', 'setTheme', e as Error);
      return theme;
    }
  }

  function init(): void {
    let initial = storage.mirror.get(STORAGE_KEYS.THEME);
    if (!initial) initial = getSettings().defaultTheme || 'light';
    setTheme(initial);
  }

  function getCurrent(): string {
    const stored = storage.mirror.get(STORAGE_KEYS.THEME);
    const canonicalStored = stored ? THEME_ALIASES[stored] || stored : stored;
    return currentTheme.value || canonicalStored || getSettings().defaultTheme || 'light';
  }

  function cycle(step: number = 1): string {
    try {
      const list = getCycleableThemes();
      const cur = getCurrent();
      let idx = list.indexOf(cur);
      // If current theme isn't in cycleable list (e.g., 'custom'), start from beginning
      if (idx === -1) idx = 0;
      const next =
        list[(idx + (step % list.length) + list.length) % list.length] || list[0] || 'light';
      return setTheme(next);
    } catch (e) {
      logError('theme', 'cycle', e as Error);
      return setTheme('light');
    }
  }

  // Register with intent coordinator for voice commands
  try {
    const { registerTarget } = useIntentCoordinator();
    registerTarget('theme', {
      zone: null,
      actions: ['set', 'cycle'],
      handler: (intent) => {
        if (intent.action === 'set' && intent.value) {
          setTheme(intent.value as string);
        } else if (intent.action === 'cycle') {
          cycle();
        }
      },
    });
  } catch (_) {
    // Intent coordinator may not be available in all contexts
  }

  singleton = { currentTheme, setTheme, init, themes, cycle, getCurrent };
  return singleton;
}
