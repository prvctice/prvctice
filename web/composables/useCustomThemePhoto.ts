/**
 * Custom Theme Photo Composable
 * Handles custom background photo upload and removal for the Custom theme
 */
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';

const LS_KEY = STORAGE_KEYS.CUSTOM_THEME_PHOTO;

interface InitCustomThemePhotoOptions {
  useTheme?: () => { getCurrent: () => string };
  mirrorGetString?: (key: string) => string | null;
}

interface CustomThemePhotoAPI {
  getSaved: () => string | null;
  save: (dataURL: string) => void;
  clear: () => void;
  applySavedToImage: (img: HTMLImageElement, removeBtn: HTMLButtonElement) => void;
  resolveThemeKey: (theme: string) => string;
  updateVisibilityForTheme: (
    nextTheme: string,
    addBtn: HTMLButtonElement,
    removeBtn: HTMLButtonElement,
    img: HTMLImageElement
  ) => void;
  initCustomThemePhoto: (options?: InitCustomThemePhotoOptions) => (() => void) | null;
}

/**
 * Get the saved custom photo data URL
 */
function getSaved(): string | null {
  try {
    return storage.mirror.get(LS_KEY);
  } catch (_) {
    return null;
  }
}

/**
 * Save a photo data URL
 */
function save(dataURL: string): void {
  storage.mirror.set(LS_KEY, dataURL);
}

/**
 * Clear the saved custom photo
 */
function clear(): void {
  storage.mirror.remove(LS_KEY);
}

/**
 * Apply the saved photo to the background image element
 */
function applySavedToImage(img: HTMLImageElement, removeBtn: HTMLButtonElement): void {
  const saved = getSaved();
  if (saved) {
    img.src = saved;
    removeBtn.style.display = 'inline';
  } else {
    const def = img.dataset.defaultSrc || img.getAttribute('src') || '';
    if (def) img.src = def;
    removeBtn.style.display = 'none';
  }
}

/**
 * Resolve theme key to canonical form
 */
function resolveThemeKey(theme: string): string {
  if (theme === 'monday') return 'custom';
  return theme;
}

/**
 * Update button visibility based on current theme
 */
function updateVisibilityForTheme(
  nextTheme: string,
  addBtn: HTMLButtonElement,
  removeBtn: HTMLButtonElement,
  img: HTMLImageElement
): void {
  const canonical = resolveThemeKey(nextTheme);
  const isCustom = canonical === 'custom';
  addBtn.style.display = isCustom ? 'inline' : 'none';
  removeBtn.style.display = isCustom && !!getSaved() ? 'inline' : 'none';
  if (isCustom) applySavedToImage(img, removeBtn);
}

// Extend HTMLButtonElement to track hook state
interface ExtendedHTMLButtonElement extends HTMLButtonElement {
  __customPhotoHooked?: boolean;
}

/**
 * Initialize custom theme photo handling
 */
export function initCustomThemePhoto(
  options: InitCustomThemePhotoOptions = {}
): (() => void) | null {
  const { useTheme, mirrorGetString: getString } = options;

  const addBtn = document.getElementById(
    'custom-add-photo-button'
  ) as ExtendedHTMLButtonElement | null;
  const removeBtn = document.getElementById(
    'custom-remove-photo-button'
  ) as HTMLButtonElement | null;
  const img = document.getElementById('theme-bg-image') as HTMLImageElement | null;

  if (!addBtn || !removeBtn || !img || addBtn.__customPhotoHooked) {
    return null;
  }

  addBtn.__customPhotoHooked = true;

  // Ensure default source is recorded for resets
  if (!img.dataset.defaultSrc) {
    const def = img.getAttribute('src') || '';
    if (def) img.dataset.defaultSrc = def;
  }

  // Wire add action
  addBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    document.body.appendChild(input);

    input.addEventListener(
      'change',
      () => {
        const file = input.files && input.files[0];
        if (!file) {
          try {
            document.body.removeChild(input);
          } catch (_) {}
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataURL = reader.result;
          if (typeof dataURL === 'string') {
            save(dataURL);
            applySavedToImage(img, removeBtn);
          }
          try {
            document.body.removeChild(input);
          } catch (_) {}
        };
        reader.readAsDataURL(file);
      },
      { once: true }
    );
    input.click();
  });

  // Wire remove action
  removeBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    clear();
    applySavedToImage(img, removeBtn);
  });

  // Initial sync with current theme
  try {
    if (useTheme) {
      const theme = useTheme();
      const initial =
        typeof theme.getCurrent === 'function'
          ? theme.getCurrent()
          : resolveThemeKey((getString || storage.mirror.get)('theme') || 'light');
      updateVisibilityForTheme(initial, addBtn, removeBtn, img);
    } else {
      const initial = resolveThemeKey((getString || storage.mirror.get)('theme') || 'light');
      updateVisibilityForTheme(initial, addBtn, removeBtn, img);
    }
  } catch (_) {
    const initial = resolveThemeKey(storage.mirror.get('theme') || 'light');
    updateVisibilityForTheme(initial, addBtn, removeBtn, img);
  }

  // React to future theme changes
  const onThemeChange = (event: { theme: string }): void => {
    try {
      if (event.theme) updateVisibilityForTheme(event.theme, addBtn, removeBtn, img);
    } catch (_) {}
  };

  const bus = useEventBus();
  bus.on('theme:change', onThemeChange);

  // Return cleanup function
  return () => {
    bus.off('theme:change', onThemeChange);
  };
}

/**
 * Composable for custom theme photo handling
 */
export function useCustomThemePhoto(): CustomThemePhotoAPI {
  return {
    getSaved,
    save,
    clear,
    applySavedToImage,
    resolveThemeKey,
    updateVisibilityForTheme,
    initCustomThemePhoto,
  };
}
