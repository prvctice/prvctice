/**
 * Skill Storage Service
 *
 * Handles persistence of skills using IndexedDB via the storage facade.
 * Provides migration from V1 format and maintains backwards compatibility
 * with legacy localStorage data.
 *
 * Storage Strategy:
 * - V2 skills stored in IndexedDB 'kv' store under 'skills/v2' key
 * - Legacy data (customSkills, hiddenSkills, helpPinnedTips) kept in sync
 *   via localStorage mirror for backwards compatibility
 * - Migration runs automatically on first load if V1 data exists
 */

import { storage } from '@web/storage/storage.js';
import type { SkillV2, SkillV1 } from '@web/types/skills';
import {
  STORAGE_VERSION,
  migrateLegacyStorageData,
  migrateSkillV1ToV2,
  convertV2ToV1,
  isV1Format,
  isV2Format,
  type SkillStorageData,
  type LegacyStorageData,
} from './migration';
import { debugLog, debugWarn } from '@web/utils/debugLog';

// Storage keys
const V2_STORAGE_KEY = 'skills/v2';
const LEGACY_CUSTOM_KEY = 'customSkills';
const LEGACY_HIDDEN_KEY = 'hiddenSkills';
const LEGACY_PINNED_KEY = 'helpPinnedTips';

/**
 * In-memory cache of loaded skills
 */
let cachedData: SkillStorageData | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Load legacy data from localStorage mirror
 */
function loadLegacyData(): LegacyStorageData {
  const customSkills = storage.mirror.getJSON(LEGACY_CUSTOM_KEY, []) as SkillV1[] | null;
  const hiddenBuiltins = storage.mirror.getJSON(LEGACY_HIDDEN_KEY, []) as Array<
    { title: string } | string
  > | null;
  const pinnedTipIds = storage.mirror.getJSON(LEGACY_PINNED_KEY, []) as string[] | null;

  return {
    customSkills: Array.isArray(customSkills) ? customSkills : [],
    hiddenBuiltins: Array.isArray(hiddenBuiltins) ? hiddenBuiltins : [],
    pinnedTipIds: Array.isArray(pinnedTipIds) ? pinnedTipIds : [],
  };
}

/**
 * Save to legacy localStorage mirror for backwards compatibility
 */
function saveLegacyData(data: SkillStorageData): void {
  // Convert V2 skills back to V1 format for legacy consumers
  const customV1 = data.skills.filter((s) => s.source === 'custom').map(convertV2ToV1);

  // Remove source field before saving (it's added on load)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toSave = customV1.map(({ source: _source, ...rest }) => rest);

  storage.mirror.setJSON(LEGACY_CUSTOM_KEY, toSave);
  storage.mirror.setJSON(
    LEGACY_HIDDEN_KEY,
    data.hiddenBuiltins.map((title) => ({ title }))
  );
  storage.mirror.setJSON(LEGACY_PINNED_KEY, data.pinnedTipIds);
}

/**
 * Load V2 data from IndexedDB
 */
async function loadV2Data(): Promise<SkillStorageData | null> {
  try {
    const data = await storage.kv.get(V2_STORAGE_KEY);
    if (
      data &&
      typeof data === 'object' &&
      (data as Record<string, unknown>).version === STORAGE_VERSION
    ) {
      return data as SkillStorageData;
    }
    return null;
  } catch (err) {
    debugWarn('skills', 'loadV2Data', err instanceof Error ? err : String(err));
    return null;
  }
}

/**
 * Save V2 data to IndexedDB
 */
async function saveV2Data(data: SkillStorageData): Promise<void> {
  try {
    await storage.kv.set(V2_STORAGE_KEY, data);
  } catch (err) {
    debugWarn('skills', 'saveV2Data', err instanceof Error ? err : String(err));
  }
}

/**
 * Initialize storage and run migration if needed
 */
async function initializeStorage(): Promise<SkillStorageData> {
  // Try to load existing V2 data
  let v2Data = await loadV2Data();

  if (v2Data) {
    debugLog('skills', 'storage:init', `Loaded V2 data with ${v2Data.skills.length} skills`);
    return v2Data;
  }

  // No V2 data, check for legacy data to migrate
  const legacyData = loadLegacyData();
  const hasLegacyData =
    (legacyData.customSkills && legacyData.customSkills.length > 0) ||
    (legacyData.hiddenBuiltins && legacyData.hiddenBuiltins.length > 0) ||
    (legacyData.pinnedTipIds && legacyData.pinnedTipIds.length > 0);

  if (hasLegacyData) {
    debugLog('skills', 'storage:init', 'Migrating legacy data...');
    v2Data = migrateLegacyStorageData(legacyData);
    await saveV2Data(v2Data);
    debugLog(
      'skills',
      'storage:init',
      `Migration complete, ${v2Data.skills.length} skills migrated`
    );
    return v2Data;
  }

  // No data at all, return empty state
  v2Data = {
    version: STORAGE_VERSION,
    skills: [],
    hiddenBuiltins: [],
    pinnedTipIds: [],
  };
  await saveV2Data(v2Data);
  debugLog('skills', 'storage:init', 'Initialized empty storage');
  return v2Data;
}

/**
 * Ensure storage is initialized
 */
async function ensureInitialized(): Promise<SkillStorageData> {
  if (initialized && cachedData) {
    return cachedData;
  }

  if (initPromise) {
    await initPromise;
    return cachedData!;
  }

  initPromise = (async () => {
    cachedData = await initializeStorage();
    initialized = true;
  })();

  await initPromise;
  initPromise = null;
  return cachedData!;
}

/**
 * Save current cached data to storage
 */
async function saveData(): Promise<void> {
  if (!cachedData) return;

  await saveV2Data(cachedData);
  // Also save to legacy format for backwards compatibility
  saveLegacyData(cachedData);
}

// ==================== PUBLIC API ====================

/**
 * Load all skills from storage
 */
export async function loadSkills(): Promise<SkillV2[]> {
  const data = await ensureInitialized();
  return [...data.skills];
}

/**
 * Save all skills to storage
 */
export async function saveSkills(skills: SkillV2[]): Promise<void> {
  const data = await ensureInitialized();
  data.skills = [...skills];
  await saveData();
}

/**
 * Add a new skill
 */
export async function addSkill(skill: SkillV2): Promise<void> {
  const data = await ensureInitialized();
  // Remove existing with same ID if present
  const idx = data.skills.findIndex((s) => s.id === skill.id);
  if (idx >= 0) {
    data.skills[idx] = skill;
  } else {
    data.skills.push(skill);
  }
  await saveData();
}

/**
 * Update an existing skill
 */
export async function updateSkill(id: string, updates: Partial<SkillV2>): Promise<void> {
  const data = await ensureInitialized();
  const idx = data.skills.findIndex((s) => s.id === id);
  const existingSkill = data.skills[idx];
  if (idx >= 0 && existingSkill) {
    data.skills[idx] = { ...existingSkill, ...updates, id };
    await saveData();
  }
}

/**
 * Delete a skill
 */
export async function deleteSkill(id: string): Promise<void> {
  const data = await ensureInitialized();
  data.skills = data.skills.filter((s) => s.id !== id);
  await saveData();
}

/**
 * Get a single skill by ID
 */
export async function getSkill(id: string): Promise<SkillV2 | undefined> {
  const data = await ensureInitialized();
  return data.skills.find((s) => s.id === id);
}

/**
 * Get list of hidden builtin skill titles
 */
export async function getHiddenBuiltins(): Promise<string[]> {
  const data = await ensureInitialized();
  return [...data.hiddenBuiltins];
}

/**
 * Hide a builtin skill
 */
export async function hideBuiltin(title: string): Promise<void> {
  const data = await ensureInitialized();
  if (!data.hiddenBuiltins.includes(title)) {
    data.hiddenBuiltins.push(title);
    await saveData();
  }
}

/**
 * Show a previously hidden builtin skill
 */
export async function showBuiltin(title: string): Promise<void> {
  const data = await ensureInitialized();
  data.hiddenBuiltins = data.hiddenBuiltins.filter((t) => t !== title);
  await saveData();
}

/**
 * Get list of pinned help tip IDs
 */
export async function getPinnedTipIds(): Promise<string[]> {
  const data = await ensureInitialized();
  return [...data.pinnedTipIds];
}

/**
 * Pin a help tip
 */
export async function pinTip(tipId: string): Promise<void> {
  const data = await ensureInitialized();
  if (!data.pinnedTipIds.includes(tipId)) {
    data.pinnedTipIds.push(tipId);
    await saveData();
  }
}

/**
 * Unpin a help tip
 */
export async function unpinTip(tipId: string): Promise<void> {
  const data = await ensureInitialized();
  data.pinnedTipIds = data.pinnedTipIds.filter((id) => id !== tipId);
  await saveData();
}

/**
 * Get all storage data (for debugging/export)
 */
export async function getStorageData(): Promise<SkillStorageData> {
  const data = await ensureInitialized();
  return { ...data };
}

/**
 * Import skills from external data
 */
export async function importSkills(
  skills: Array<SkillV2 | SkillV1>,
  options: { merge?: boolean } = {}
): Promise<number> {
  const data = await ensureInitialized();

  // Convert any V1 skills to V2
  const v2Skills = skills
    .map((s) => {
      if (isV1Format(s)) {
        return migrateSkillV1ToV2(s);
      }
      if (isV2Format(s)) {
        return s;
      }
      // Unknown format, skip
      debugWarn(
        'skills',
        'importSkills',
        `Skipping unknown format skill: ${JSON.stringify(s).slice(0, 100)}`
      );
      return null;
    })
    .filter((s): s is SkillV2 => s !== null);

  if (options.merge) {
    // Merge: add new, update existing
    for (const skill of v2Skills) {
      const idx = data.skills.findIndex((s) => s.id === skill.id);
      if (idx >= 0) {
        data.skills[idx] = skill;
      } else {
        data.skills.push(skill);
      }
    }
  } else {
    // Replace all custom skills
    data.skills = data.skills.filter((s) => s.source !== 'custom');
    data.skills.push(...v2Skills.filter((s) => s.source === 'custom'));
  }

  await saveData();
  return v2Skills.length;
}

/**
 * Export skills as JSON
 */
export async function exportSkills(filter?: { source?: string }): Promise<SkillV2[]> {
  const data = await ensureInitialized();
  let result = [...data.skills];

  if (filter?.source) {
    result = result.filter((s) => s.source === filter.source);
  }

  return result;
}

/**
 * Clear all storage data (use with caution)
 */
export async function clearStorage(): Promise<void> {
  cachedData = {
    version: STORAGE_VERSION,
    skills: [],
    hiddenBuiltins: [],
    pinnedTipIds: [],
  };
  await saveV2Data(cachedData);
  storage.mirror.setJSON(LEGACY_CUSTOM_KEY, []);
  storage.mirror.setJSON(LEGACY_HIDDEN_KEY, []);
  storage.mirror.setJSON(LEGACY_PINNED_KEY, []);
  debugLog('skills', 'storage', 'Storage cleared');
}

/**
 * Force reload from storage (useful after external changes)
 */
export async function reloadFromStorage(): Promise<SkillStorageData> {
  initialized = false;
  cachedData = null;
  return ensureInitialized();
}

/**
 * Sync skills map to storage (for coordinator integration)
 * Takes a Map<string, SkillV2> and persists custom skills
 */
export async function syncFromMap(skillsMap: Map<string, SkillV2>): Promise<void> {
  const data = await ensureInitialized();

  // Only persist custom skills (builtins are defined in code)
  const customSkills = Array.from(skillsMap.values()).filter(
    (s) => s.source === 'custom' || s.source === 'combined' || s.source === 'generated'
  );

  data.skills = customSkills;
  await saveData();
}

/**
 * Load skills into a Map (for coordinator integration)
 */
export async function loadToMap(): Promise<Map<string, SkillV2>> {
  const skills = await loadSkills();
  return new Map(skills.map((s) => [s.id, s]));
}
