# Theme System Documentation

> **Why this doc:** The Theme system controls visual appearance through CSS custom properties and supports custom photo backgrounds. Read this when working on theming, dark/light mode, or visual customization.
>
> **Related systems:** [DOTMATRIX_SYSTEM.md](./DOTMATRIX_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The Theme System manages visual appearance across prvctice, handling theme switching, CSS class injection, storage persistence, and custom background photos. It provides a singleton API for programmatic theme control and integrates with the IntentCoordinator for voice commands.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Contract and Invariants](#contract-and-invariants)
4. [Data Flow](#data-flow)
5. [Theme Resolution Algorithm](#theme-resolution-algorithm)
6. [Custom Photo Backgrounds](#custom-photo-backgrounds)
7. [DOM Manipulation](#dom-manipulation)
8. [Event System](#event-system)
9. [Configuration Reference](#configuration-reference)
10. [Failure Modes](#failure-modes)
11. [Code Examples](#code-examples)
12. [File Reference](#file-reference)
13. [Reference Mapping](#reference-mapping)
14. [Changelog](#changelog)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              THEME SOURCES                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │  User UI    │ │   Voice     │ │  Keyboard   │ │   Init      │                │
│  │ (ThemePane) │ │  Commands   │ │ (Double-tap)│ │ (Storage)   │                │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                │
│         │               │               │               │                       │
│         ▼               ▼               ▼               ▼                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         useTheme() COMPOSABLE                               ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              ││
│  │  │   setTheme()    │  │    cycle()      │  │    init()       │              ││
│  │  │  Apply theme    │  │  Rotate themes  │  │  Load from      │              ││
│  │  │  by name        │  │  forward/back   │  │  storage        │              ││
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              ││
│  │           │                    │                    │                       ││
│  │           ▼                    ▼                    ▼                       ││
│  │  ┌─────────────────────────────────────────────────────────────────────────┐││
│  │  │                    THEME APPLICATION PIPELINE                           │││
│  │  │  1. Resolve alias → canonical name                                      │││
│  │  │  2. Update CSS classes on <body> and <html>                             │││
│  │  │  3. Update meta theme-color                                             │││
│  │  │  4. Update circle accent color                                          │││
│  │  │  5. Set legacy window globals                                           │││
│  │  │  6. Apply logo variant (white/dark)                                     │││
│  │  │  7. Toggle custom background visibility                                 │││
│  │  │  8. Persist to storage                                                  │││
│  │  │  9. Emit events (eventBus + window)                                     │││
│  │  └─────────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              OUTPUT EFFECTS                                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
│  │   DOM Classes   │ │  CSS Variables  │ │  Window Globals │ │   Storage      │ │
│  │ .night-theme    │ │ --color-text    │ │ window.current  │ │ theme: 'night' │ │
│  │ on body/html    │ │ --color-bg etc  │ │ Theme, base*    │ │ (mirrored)     │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ └────────────────┘ │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                           EVENT SUBSCRIBERS                                 ││
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌────────────────────────────┐││
│  │  │ Custom Photo    │  │  Dotmatrix Graphics│  │   Third-party Integrations ││
│  │  │ (visibility)    │  │  (atmosphere)      │  │   (legacy themeChange)     │││
│  │  └─────────────────┘  └────────────────────┘  └────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Theme

A **Theme** is a visual style applied across the app via CSS class injection:

```typescript
// Available themes (from getThemes())
const themes = [
  'light', // Default light theme
  'night', // Dark theme (alias: 'dark')
  'vera-baxter', // Cool blue tones (alias: 'cool', 'blue')
  'vitti', // Minimal dark (aliases: 'focus', 'minimal')
  'share-bear', // Pink/paper tones (alias: 'paper')
  'eva', // Sunset colors (alias: 'sunset')
  'fragile', // Dusk purple (alias: 'dusk')
  'custom', // Custom background (alias: 'monday')
  'purple', // Deep purple
  'high-contrast', // Accessibility
  'dev', // Development theme
];
```

### Theme Styles

Each theme has associated colors for visual previews:

```typescript
interface ThemeStyles {
  background: string; // Background color (hex)
  circle: string; // Accent circle color (hex)
}
```

### Theme Aliases

Friendly names that map to canonical theme identifiers:

```typescript
const THEME_ALIASES = {
  dark: 'night',
  cool: 'vera-baxter',
  minimal: 'focus',
  paper: 'share-bear',
  sunset: 'eva',
  dusk: 'fragile',
  monday: 'custom',
  blue: 'vera-baxter',
};
```

---

## Contract and Invariants

### Guarantees Provided by useTheme

| Guarantee               | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| **Singleton**           | Only one instance exists; repeated calls return same object             |
| **Alias Resolution**    | All aliases resolve to canonical theme names                            |
| **Persistence**         | Theme persisted to storage after every `setTheme()` call                |
| **Event Emission**      | `theme:change` event emitted after every successful theme change        |
| **Scroll Preservation** | Chat container horizontal scroll position preserved during theme switch |
| **Fallback**            | Unknown themes fall back to 'light' with console warning                |

### DOM Side Effects (when domHooks=true)

| Effect                | Description                                                                        |
| --------------------- | ---------------------------------------------------------------------------------- |
| **Class Update**      | `<body>` and `<html>` receive `{theme}-theme` class                                |
| **Meta Theme Color**  | `<meta name="theme-color">` updated for mobile browsers                            |
| **Circle Color**      | `#theme-color-circle` element background updated                                   |
| **Logo Variant**      | `.site-logo` images switch between `/images/logo.png` and `/images/logo-white.png` |
| **Custom Background** | `#theme-bg-image` visibility toggled for 'custom' theme                            |

### Window Globals (Legacy Support)

```typescript
window.currentTheme = 'night'; // String theme name
window.baseCircleColor = '#f2ab05'; // Hex accent color
window.baseCircleRGB = { r: 242, g: 171, b: 5 }; // RGB object
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THEME CHANGE LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. TRIGGER                                                                 │
│     ┌──────────────────┐                                                    │
│     │ setTheme('night')│                                                    │
│     │ cycle(1)         │                                                    │
│     │ init()           │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  2. ALIAS RESOLUTION                                                        │
│     ┌──────────────────┐                                                    │
│     │ 'dark' → 'night' │                                                    │
│     │ 'cool' → 'vera-  │                                                    │
│     │         baxter'  │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  3. SCROLL PRESERVATION                                                     │
│     ┌──────────────────┐                                                    │
│     │ Save chat scroll │                                                    │
│     │ position         │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  4. CSS CLASS UPDATE                                                        │
│     ┌──────────────────┐                                                    │
│     │ Remove all       │                                                    │
│     │ *-theme classes  │                                                    │
│     │ Add night-theme  │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  5. COLOR UPDATES                                                           │
│     ┌──────────────────┐                                                    │
│     │ Update meta color│                                                    │
│     │ Update circle    │                                                    │
│     │ Set window.*     │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  6. VISUAL UPDATES                                                          │
│     ┌──────────────────┐                                                    │
│     │ Apply logo       │                                                    │
│     │ variant          │                                                    │
│     │ Toggle custom bg │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  7. PERSIST + NOTIFY                                                        │
│     ┌──────────────────┐                                                    │
│     │ storage.mirror.  │                                                    │
│     │   set('theme')   │                                                    │
│     │ eventBus.emit    │                                                    │
│     │ window.dispatch  │                                                    │
│     └────────┬─────────┘                                                    │
│              │                                                              │
│              ▼                                                              │
│  8. RESTORE SCROLL                                                          │
│     ┌──────────────────┐                                                    │
│     │ Restore chat     │                                                    │
│     │ scroll position  │                                                    │
│     └──────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Theme Resolution Algorithm

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     THEME RESOLUTION PRIORITY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  On init():                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  1. Check storage.mirror.get('theme')                                 │  │
│  │     → If exists, use it                                               │  │
│  │                                                                       │  │
│  │  2. Check AppSettings.defaultTheme                                    │  │
│  │     → If configured, use it                                           │  │
│  │                                                                       │  │
│  │  3. Fallback to 'light'                                               │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  On getCurrent():                                                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Priority (first non-null):                                           │  │
│  │  1. currentTheme.value (reactive ref)                                 │  │
│  │  2. storage.mirror.get('theme') (with alias resolution)               │  │
│  │  3. AppSettings.defaultTheme                                          │  │
│  │  4. 'light'                                                           │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  On setTheme(theme):                                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  1. If empty string: use defaultTheme or 'light'                      │  │
│  │  2. Check THEME_ALIASES[theme]                                        │  │
│  │     → If alias exists, use canonical name                             │  │
│  │  3. Apply theme (even if unknown - for extensibility)                 │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Custom Photo Backgrounds

The custom photo system manages user-uploaded backgrounds for the 'custom' theme.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CUSTOM PHOTO LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DOM ELEMENTS REQUIRED:                                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  #custom-add-photo-button    - Upload trigger                         │  │
│  │  #custom-remove-photo-button - Clear trigger                          │  │
│  │  #theme-bg-image             - Background <img> element               │  │
│  │                              - Must have data-default-src attribute   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  UPLOAD FLOW:                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  1. User clicks #custom-add-photo-button                              │  │
│  │     └── Creates hidden <input type="file" accept="image/*">           │  │
│  │                                                                       │  │
│  │  2. User selects file                                                 │  │
│  │     └── FileReader reads as Data URL                                  │  │
│  │                                                                       │  │
│  │  3. Data URL saved to storage                                         │  │
│  │     └── storage.mirror.set('customThemePhoto', dataURL)               │  │
│  │                                                                       │  │
│  │  4. Apply to #theme-bg-image                                          │  │
│  │     └── img.src = dataURL                                             │  │
│  │                                                                       │  │
│  │  5. Show remove button                                                │  │
│  │     └── removeBtn.style.display = 'inline'                            │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  VISIBILITY RULES:                                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Theme = 'custom' (or 'monday'):                                      │  │
│  │    - #theme-bg-image: visible                                         │  │
│  │    - #custom-add-photo-button: visible                                │  │
│  │    - #custom-remove-photo-button: visible only if photo saved         │  │
│  │                                                                       │  │
│  │  Theme = anything else:                                               │  │
│  │    - #theme-bg-image: hidden (display: none)                          │  │
│  │    - #custom-add-photo-button: hidden                                 │  │
│  │    - #custom-remove-photo-button: hidden                              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  CLEANUP:                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  initCustomThemePhoto() returns a cleanup function                    │  │
│  │  that unsubscribes from theme:change events                           │  │
│  │                                                                       │  │
│  │  Note: Data URLs are stored in localStorage - large images            │  │
│  │  can consume significant storage space (typically 5-10MB limit)       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## DOM Manipulation

### CSS Class Management

```typescript
// Removes all *-theme classes, then adds the new one
document.body.classList.add(`${theme}-theme`);
document.documentElement.classList.add(`${theme}-theme`);
```

### Logo Variant Selection

```typescript
// Themes that use white logo
const WHITE_LOGO_THEMES = new Set(['night', 'vera-baxter', 'custom', 'purple']);

// Applied to all img.site-logo elements
img.src = WHITE_LOGO_THEMES.has(theme) ? '/images/logo-white.png' : '/images/logo.png';
```

### Meta Theme Color

Updates the mobile browser theme color:

```html
<meta name="theme-color" content="#0e0f09" />
```

### Circle Accent Element

The `#theme-color-circle` element displays the theme's accent color. The actual color is resolved by:

1. Using the theme's configured `circle` color
2. Or reading `--color-text` from computed styles if available

---

## Event System

### Event Bus (Modern)

```typescript
// Emitted on every theme change
bus.emit('theme:change', { theme: 'night' });

// Subscribe
bus.on('theme:change', (event) => {
  console.log('Theme changed to:', event.theme);
});
```

### Window Events (Legacy)

For backwards compatibility with archive scripts and third-party integrations:

```typescript
window.dispatchEvent(
  new CustomEvent('themeChange', {
    detail: { theme: 'night' },
  })
);
document.dispatchEvent(
  new CustomEvent('themeChange', {
    detail: { theme: 'night' },
  })
);
```

---

## Configuration Reference

### Storage Keys

| Key                | Location                          | Description                          |
| ------------------ | --------------------------------- | ------------------------------------ |
| `theme`            | `STORAGE_KEYS.THEME`              | Current theme name                   |
| `customThemePhoto` | `STORAGE_KEYS.CUSTOM_THEME_PHOTO` | Base64 data URL of custom background |

### AppSettings Configuration

```typescript
interface AppSettings {
  themeOrder?: string[]; // Custom theme order for UI
  themeStyles?: Record<
    string,
    {
      // Override preview colors
      background: string;
      circle: string;
    }
  >;
  defaultTheme?: string; // Initial theme if no storage
  themeDisplayNames?: Record<string, string>; // UI labels
}
```

### Config Features

```typescript
interface Config {
  features?: {
    domHooks?: boolean; // Enable/disable DOM manipulation (default: true)
  };
}
```

### Theme Color Defaults

| Theme         | Background | Circle Accent |
| ------------- | ---------- | ------------- |
| light         | #7da7c1    | #02ad32       |
| night         | #0e0f09    | #f2ab05       |
| vera-baxter   | #8da1d4    | #0202b5       |
| focus         | #b8c2bb    | #121212       |
| share-bear    | #c7b9ec    | #0069ff       |
| eva           | #5ba9d4    | #debb42       |
| fragile       | #ebd4ee    | #6f8dca       |
| custom        | #0e0f09    | #f2ab05       |
| blue          | #3467eb    | #e8f48c       |
| high-contrast | #000000    | #ffffff       |
| purple        | #200e4b    | #e26bfa       |

---

## Failure Modes

| Scenario                   | Behavior                                   | How to Detect                                    |
| -------------------------- | ------------------------------------------ | ------------------------------------------------ |
| **Unknown theme**          | Applied generically; no error thrown       | Check console for theme class on body            |
| **Storage unavailable**    | Theme works in memory; won't persist       | Check `storage.mirror.get('theme')` returns null |
| **DOM elements missing**   | Silently skipped (try/catch)               | Missing `#theme-color-circle`, `.site-logo`      |
| **Large custom photo**     | May exceed localStorage quota              | `QuotaExceededError` in console                  |
| **Computed style fails**   | Falls back to theme's default circle color | Console warning (silent fallback)                |
| **EventBus not available** | Event emission skipped                     | No `theme:change` events fired                   |
| **Init before DOM ready**  | domHooks fail silently                     | Elements not updated                             |

### Debugging Checklist

1. **Theme not changing visually?**
   - Check body class: `document.body.classList`
   - Verify CSS file defines `.{theme}-theme` styles
   - Check `domHooks` option isn't disabled

2. **Theme not persisting?**
   - Check `localStorage.getItem('theme')`
   - Verify `storage.mirror` is operational

3. **Custom photo not showing?**
   - Verify `#theme-bg-image` exists in DOM
   - Check theme is 'custom' or 'monday'
   - Check localStorage for `customThemePhoto` key

4. **Circle color wrong?**
   - Check `--color-text` CSS variable
   - Verify `#theme-color-circle` element exists
   - Check `themeStyles` configuration

---

## Code Examples

### Basic Theme Usage

```typescript
import { useTheme } from '@web/composables/useTheme';

const { setTheme, getCurrent, cycle, init } = useTheme();

// Initialize from storage
init();

// Set specific theme
setTheme('night');

// Set with alias
setTheme('dark'); // Resolves to 'night'

// Get current theme
const current = getCurrent(); // 'night'

// Cycle to next theme
cycle(); // Forward
cycle(-1); // Backward
```

### Reactive Theme in Vue Component

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from '@web/composables/useTheme';

const { getCurrent, setTheme, themes } = useTheme();

const currentTheme = computed(() => getCurrent());
</script>

<template>
  <select :value="currentTheme" @change="setTheme($event.target.value)">
    <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
  </select>
</template>
```

### Subscribing to Theme Changes

```typescript
import { useEventBus } from '@web/services/eventBus';

const bus = useEventBus();

const cleanup = bus.on('theme:change', (event) => {
  console.log('Theme changed to:', event.theme);
  updateMyComponent(event.theme);
});

// Later, cleanup
cleanup();
```

### Custom Photo Integration

```typescript
import { initCustomThemePhoto, useCustomThemePhoto } from '@web/composables/useCustomThemePhoto';

// Full initialization (hooks up buttons and events)
const cleanup = initCustomThemePhoto();

// Or manual API usage
const { getSaved, save, clear } = useCustomThemePhoto();

// Check for saved photo
const photo = getSaved(); // Data URL or null

// Clear saved photo
clear();
```

### IntentCoordinator Integration

The theme system registers as a target for voice commands:

```typescript
// Registered automatically by useTheme()
registerTarget('theme', {
  zone: null,
  actions: ['set', 'cycle'],
  handler: (intent) => {
    if (intent.action === 'set' && intent.value) {
      setTheme(intent.value);
    } else if (intent.action === 'cycle') {
      cycle();
    }
  },
});

// Voice command: "set theme to night"
// → Intent: { target: 'theme', action: 'set', value: 'night' }
```

---

## File Reference

| File                                     | Lines | Purpose                                                |
| ---------------------------------------- | ----- | ------------------------------------------------------ |
| `web/composables/useTheme.ts`            | 316   | Core theme composable (singleton)                      |
| `web/composables/useCustomThemePhoto.ts` | 220   | Custom background photo handling                       |
| `web/components/modals/ThemesPane.vue`   | 212   | Theme selection UI (enhanced)                          |
| `web/components/modals/ThemePane.vue`    | 41    | Theme selection UI (simple)                            |
| `web/constants/storageKeys.ts`           | —     | Storage key constants (`THEME`, `CUSTOM_THEME_PHOTO`)  |
| `web/services/eventBus.ts`               | —     | Event bus with `theme:change` mapping                  |
| `web/types/global.d.ts`                  | —     | Window type extensions (`currentTheme`, `baseCircle*`) |

---

## Reference Mapping

This table maps documentation claims to their authoritative source locations.

| Doc Claim                | Source of Truth              | Location                         |
| ------------------------ | ---------------------------- | -------------------------------- |
| Theme aliases            | `THEME_ALIASES` constant     | `useTheme.ts:42-52`              |
| White logo themes        | `WHITE_LOGO_THEMES` Set      | `useTheme.ts:54`                 |
| Default theme list       | `getThemes()` function       | `useTheme.ts:66-85`              |
| Theme styles             | `getThemeStyles()` function  | `useTheme.ts:91-127`             |
| Meta theme color update  | `updateMetaThemeColor()`     | `useTheme.ts:129-139`            |
| Logo variant logic       | `applyLogoVariant()`         | `useTheme.ts:141-151`            |
| Custom bg toggle         | `toggleCustomBackground()`   | `useTheme.ts:153-166`            |
| setTheme pipeline        | `setTheme()` function        | `useTheme.ts:168-267`            |
| Scroll preservation      | `prevScrollLeft` logic       | `useTheme.ts:178-181, 261`       |
| Storage persistence      | `storage.mirror.set()` call  | `useTheme.ts:244`                |
| Event emission (bus)     | `bus.emit('theme:change')`   | `useTheme.ts:248-251`            |
| Legacy window events     | `dispatchEvent` calls        | `useTheme.ts:256-259`            |
| Intent registration      | `registerTarget('theme')`    | `useTheme.ts:296-311`            |
| Custom photo storage key | `LS_KEY` constant            | `useCustomThemePhoto.ts:9`       |
| Photo visibility logic   | `updateVisibilityForTheme()` | `useCustomThemePhoto.ts:82-93`   |
| File upload handler      | `addBtn click listener`      | `useCustomThemePhoto.ts:129-163` |

---

## Changelog

- **v1.0** - Initial theme system with light/dark modes
- **v1.1** - Added theme aliases for friendly names
- **v1.2** - Added custom photo background support
- **v1.3** - Integrated with IntentCoordinator for voice commands
- **v1.4** - Added scroll position preservation
- **v1.5** - Enhanced ThemesPane with visual previews
- **v1.6** - Documentation created (2025-01-25)

---

_Last verified: 2026-02-23_
