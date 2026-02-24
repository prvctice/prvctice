/**
 * App Registry
 *
 * CRUD service for AppDefinition records persisted in IndexedDB.
 * The registry stores what apps exist; the window manager (useWindowManager)
 * tracks which are open.
 */

import { kvGet, kvSet } from '@web/storage/storage.js';
import type { AppDefinition } from '@web/types/apps';

const STORAGE_KEY = 'apps/definitions';

export interface AppRegistry {
  readonly getAll: () => Promise<readonly AppDefinition[]>;
  readonly get: (id: string) => Promise<AppDefinition | null>;
  readonly register: (definition: AppDefinition) => Promise<void>;
  readonly unregister: (id: string) => Promise<void>;
  readonly update: (
    id: string,
    patch: Partial<Omit<AppDefinition, 'id'>>
  ) => Promise<AppDefinition>;
}

/* ── Singleton state (shared across all createAppRegistry() callers) ── */

const map = new Map<string, AppDefinition>();
let loadPromise: Promise<void> | null = null;
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const stored = await kvGet<readonly AppDefinition[]>(STORAGE_KEY);
    if (Array.isArray(stored)) {
      for (const def of stored) {
        if (def && typeof def.id === 'string' && def.id.length > 0) {
          map.set(def.id, { ...def });
        }
      }
    }
    loaded = true;
  })();

  return loadPromise;
}

async function persist(): Promise<void> {
  // JSON round-trip strips Vue reactive proxies that can't be structured-cloned
  const plain = JSON.parse(JSON.stringify([...map.values()])) as AppDefinition[];
  await kvSet(STORAGE_KEY, plain);
}

/**
 * Returns an AppRegistry view over shared module-scoped state.
 * All callers share the same in-memory Map so writes are immediately
 * visible to readers (fixes stale-registry-on-relaunch bug).
 */
export function createAppRegistry(): AppRegistry {
  async function getAll(): Promise<readonly AppDefinition[]> {
    await ensureLoaded();
    return Object.freeze([...map.values()]);
  }

  async function get(id: string): Promise<AppDefinition | null> {
    await ensureLoaded();
    const entry = map.get(id);
    return entry ? { ...entry } : null;
  }

  async function register(definition: AppDefinition): Promise<void> {
    if (!definition.id || typeof definition.id !== 'string') {
      throw new Error('AppDefinition id must be a non-empty string');
    }
    await ensureLoaded();
    map.set(definition.id, { ...definition });
    await persist();
  }

  async function unregister(id: string): Promise<void> {
    await ensureLoaded();
    map.delete(id);
    await persist();
  }

  async function update(
    id: string,
    patch: Partial<Omit<AppDefinition, 'id'>>
  ): Promise<AppDefinition> {
    await ensureLoaded();
    const existing = map.get(id);
    if (!existing) {
      throw new Error(`AppDefinition not found: ${id}`);
    }
    const updated: AppDefinition = { ...existing, ...patch, id };
    map.set(id, updated);
    await persist();
    return { ...updated };
  }

  return {
    getAll,
    get,
    register,
    unregister,
    update,
  };
}
