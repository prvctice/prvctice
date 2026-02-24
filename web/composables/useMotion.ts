import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

const reduceMotion: Ref<boolean> = ref(false);
let mediaQuery: MediaQueryList | null = null;
let mediaQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;
let listenerCount = 0;

function setupMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!mediaQuery) {
    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.value = !!mediaQuery.matches;
  }
  return mediaQuery;
}

function attachListener(): void {
  const mq = setupMediaQuery();
  if (!mq) return;
  if (!mediaQueryHandler) {
    mediaQueryHandler = (event: MediaQueryListEvent) => {
      reduceMotion.value = !!event.matches;
    };
  }
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', mediaQueryHandler);
  } else if (typeof mq.addListener === 'function') {
    // Legacy browsers
    mq.addListener(mediaQueryHandler);
  }
}

function detachListener(): void {
  if (!mediaQuery || !mediaQueryHandler) return;
  if (typeof mediaQuery.removeEventListener === 'function') {
    mediaQuery.removeEventListener('change', mediaQueryHandler);
  } else if (typeof mediaQuery.removeListener === 'function') {
    // Legacy browsers
    mediaQuery.removeListener(mediaQueryHandler);
  }
  if (listenerCount === 0) {
    mediaQuery = null;
    mediaQueryHandler = null;
  }
}

interface MotionPreferences {
  reduceMotion: Ref<boolean>;
}

export function useMotionPreferences(): MotionPreferences {
  onMounted(() => {
    listenerCount += 1;
    attachListener();
  });

  onBeforeUnmount(() => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) {
      detachListener();
    }
  });

  // Ensure initial value is populated even before mount
  setupMediaQuery();

  return { reduceMotion };
}

export function prefersReducedMotion(): boolean {
  setupMediaQuery();
  return reduceMotion.value;
}

function parseTime(value: string, fallback: number): number {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed) / 1000;
  if (trimmed.endsWith('s')) return Number.parseFloat(trimmed);
  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getComputedValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

function getDuration(name: string, fallback: number): number {
  return parseTime(getComputedValue(name), fallback);
}

function getEasing(name: string, fallback: string): string {
  const value = getComputedValue(name);
  return value && value.trim().length ? value.trim() : fallback;
}

interface Durations {
  short: number;
  medium: number;
  long: number;
  fade: number;
}

export function motionDurations(): Durations {
  return {
    short: getDuration('--duration-short', 0.2),
    medium: getDuration('--duration-medium', 0.25),
    long: getDuration('--duration-long', 0.6),
    fade: getDuration('--motion-duration-fade', 0.35),
  };
}

interface Easings {
  standard: string;
  emphasis: string;
  snap: string;
}

export function motionEasings(): Easings {
  return {
    standard: getEasing('--motion-ease-standard', 'cubic-bezier(0.4, 0, 0.2, 1)'),
    emphasis: getEasing('--motion-ease-emphasis', 'cubic-bezier(0.33, 1, 0.68, 1)'),
    snap: getEasing('--easing-snap', 'cubic-bezier(0.25, 1, 0.5, 1)'),
  };
}
