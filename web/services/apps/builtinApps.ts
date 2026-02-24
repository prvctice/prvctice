/**
 * Builtin App Definitions
 *
 * Bridge between the new BuiltinAppConfig manifest (builtin/index.ts)
 * and the existing AppDefinition/AppRegistry system. Converts config
 * objects to AppDefinitions and handles registration with IndexedDB.
 *
 * Vue-internal apps (weather, notes, pdf-viewer) and gallery shortcuts
 * (files, pong, brick-breaker) are defined directly here since they
 * don't follow the HTML app config pattern.
 */

import type { AppDefinition } from '@web/types/apps';
import type { AppRegistry } from '@web/services/apps/appRegistry';
import { BUILTIN_APP_CONFIGS, type BuiltinAppConfig } from './builtin/index';

// ==================== VUE-INTERNAL APPS ====================
// These run in-process via INTERNAL_COMPONENTS in AppWindow.vue.
// They have no HTML and don't go through the config system.

const VUE_INTERNAL_APPS: readonly AppDefinition[] = [
  {
    id: 'weather-time',
    name: 'Time and Weather',
    type: 'vue-internal',
    component: 'weather-time',
    icon: 'ph:sun-horizon',
    description: 'Live weather and clock widget',
    permissions: [],
    source: 'builtin',
    category: 'apps',
    chromeless: true,
    defaultSize: { w: 220, h: 120 },
    minSize: { w: 150, h: 100 },
  },
  {
    id: 'notes',
    name: 'Notes',
    type: 'vue-internal',
    component: 'notes',
    icon: 'ph:note',
    description: 'Rich text notes editor',
    permissions: [],
    source: 'builtin',
    category: 'apps',
    magnetic: false,
    defaultSize: { w: 490, h: 540 },
    minSize: { w: 320, h: 400 },
  },
  {
    id: 'pdf-viewer',
    name: 'PDF Viewer',
    type: 'vue-internal',
    component: 'pdf-viewer',
    icon: 'ph:file-pdf',
    description: 'Read and annotate PDF documents',
    permissions: [],
    source: 'builtin',
    category: 'utilities',
    defaultSize: { w: 620, h: 700 },
    minSize: { w: 400, h: 500 },
  },
] as const;

// ==================== CONFIG -> APP DEFINITION ====================

/** Convert a BuiltinAppConfig to an AppDefinition (without HTML -- loaded lazily) */
function configToDefinition(config: BuiltinAppConfig): AppDefinition {
  return {
    id: config.id,
    name: config.name,
    type: 'html',
    icon: config.icon,
    description: config.description,
    permissions: [...config.permissions],
    source: 'builtin',
    category: config.category,
    defaultSize: { ...config.defaultSize },
    minSize: { ...config.minSize },
    ...(config.maxSize ? { maxSize: { ...config.maxSize } } : {}),
    ...(config.chromeless ? { chromeless: config.chromeless } : {}),
    ...(config.magnetic === false ? { magnetic: false as const } : {}),
    ...(config.companion ? { companion: config.companion } : {}),
  };
}

// ==================== EXPORTED ARRAYS ====================

/**
 * All builtin app definitions (vue-internal + HTML app stubs).
 * HTML apps have no `html` field here -- HTML is loaded lazily
 * during registerBuiltinApps(). Synchronous consumers use this
 * for ID lookups on vue-internal apps.
 */
export const BUILTIN_APPS: readonly AppDefinition[] = [
  ...VUE_INTERNAL_APPS,
  ...BUILTIN_APP_CONFIGS.map(configToDefinition),
] as const;

// ==================== GALLERY SHORTCUTS ====================
// Display-only entries for the gallery. Not registered in IndexedDB --
// clicking them is intercepted in AppGalleryPane to launch native overlays/modals.

export const GALLERY_SHORTCUTS: readonly AppDefinition[] = [
  {
    id: 'files',
    name: 'Files',
    type: 'vue-internal',
    component: 'files',
    icon: 'ph:folder-open',
    description: 'Browse uploaded documents and files',
    permissions: [],
    source: 'builtin',
    category: 'utilities',
  },
  {
    id: 'pong',
    name: 'Pong',
    type: 'vue-internal',
    component: 'pong',
    icon: 'ph:tennis-ball',
    description: 'Classic pong game',
    permissions: [],
    source: 'builtin',
    category: 'games',
  },
  {
    id: 'brick-breaker',
    name: 'Brick Breaker',
    type: 'vue-internal',
    component: 'brick-breaker',
    icon: 'ph:squares-four',
    description: 'Break all the bricks',
    permissions: [],
    source: 'builtin',
    category: 'games',
  },
] as const;

// ==================== REGISTRATION ====================

/** Set of current builtin IDs for stale-entry detection */
const BUILTIN_IDS = new Set(BUILTIN_APPS.map((d) => d.id));

export async function registerBuiltinApps(registry: AppRegistry): Promise<void> {
  // Build a map of config ID -> loaded HTML for HTML apps
  const htmlMap = new Map<string, string>();
  const loadResults = await Promise.allSettled(
    BUILTIN_APP_CONFIGS.map(async (config) => {
      const html = await config.load();
      htmlMap.set(config.id, html);
    })
  );

  // Log any load failures (non-fatal -- app just won't have HTML)
  for (let i = 0; i < loadResults.length; i++) {
    const result = loadResults[i];
    if (result && result.status === 'rejected') {
      const config = BUILTIN_APP_CONFIGS[i];
      // eslint-disable-next-line no-console
      console.warn(`[builtinApps] Failed to load HTML for ${config?.id}:`, result.reason);
    }
  }

  // Register or re-sync current builtins (ensures name/icon/html stay current)
  for (const def of BUILTIN_APPS) {
    // For HTML apps, inject the loaded HTML
    const html = htmlMap.get(def.id);
    const fullDef: AppDefinition = html ? { ...def, html } : def;

    const existing = await registry.get(def.id);
    if (!existing) {
      await registry.register(fullDef);
    } else {
      // Re-sync mutable fields so code-side changes propagate over stale IndexedDB
      const needsUpdate =
        existing.name !== fullDef.name ||
        existing.icon !== fullDef.icon ||
        existing.description !== fullDef.description ||
        existing.html !== fullDef.html ||
        existing.category !== fullDef.category ||
        existing.magnetic !== fullDef.magnetic;
      if (needsUpdate) {
        await registry.update(def.id, {
          name: fullDef.name,
          icon: fullDef.icon,
          description: fullDef.description,
          html: fullDef.html,
          category: fullDef.category,
          magnetic: fullDef.magnetic,
        });
      }
    }
  }

  // Purge stale builtin entries (e.g. removed weather-time-html, pong-html)
  const all = await registry.getAll();
  for (const entry of all) {
    if (entry.source === 'builtin' && !BUILTIN_IDS.has(entry.id)) {
      await registry.unregister(entry.id);
    }
  }
}
