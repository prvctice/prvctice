// "favorited" in code = "pinned" or "favorite" in the UI.
// These are skills shown as pills in the dock.

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { storage } from '@web/storage/storage.js';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { BUILTIN_CATEGORY_MAP } from '@web/services/skills/skillCategories';
import { logError } from '@web/utils/debugLog.js';

// ==================== TYPES ====================

export interface SkillPreference {
  enabled: boolean;
  favorited: boolean;
}

export interface UnifiedSkill {
  id: string;
  title: string;
  type: 'prompt' | 'action';
  value: string;
  source: 'builtin' | 'custom' | 'combined' | 'helptip';
  enabled: boolean;
  favorited: boolean;
  category: string;
  description: string;
  triggers: string[];
  usageCount: number;
  lastUsed: number;
}

// ==================== STORAGE ====================

const PREFERENCES_KEY = 'skills/preferences';

// ==================== SINGLETON STATE ====================

const preferences: Ref<Map<string, SkillPreference>> = ref(new Map());
let loaded = false;
let loadPromise: Promise<void> | null = null;

// ==================== HELPERS ====================

function getPreference(skillId: string): SkillPreference {
  const stored = preferences.value.get(skillId);
  if (stored) return stored;

  // Defaults: built-ins start enabled+favorited, everything else enabled+not-favorited
  const isBuiltin = skillId.startsWith('builtin-');
  return {
    enabled: true,
    favorited: isBuiltin,
  };
}

function serializePreferences(): Record<string, SkillPreference> {
  const obj: Record<string, SkillPreference> = {};
  for (const [key, val] of preferences.value) {
    obj[key] = { ...val };
  }
  return obj;
}

function deserializePreferences(data: unknown): Map<string, SkillPreference> {
  const map = new Map<string, SkillPreference>();
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        const v = val as Record<string, unknown>;
        map.set(key, {
          enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
          favorited: typeof v.favorited === 'boolean' ? v.favorited : false,
        });
      }
    }
  }
  return map;
}

// ==================== PERSISTENCE ====================

async function loadPreferences(): Promise<void> {
  if (loaded) return;
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = (async () => {
    try {
      const data = await storage.kv.get(PREFERENCES_KEY);
      if (data) {
        preferences.value = deserializePreferences(data);
      }
      loaded = true;
    } catch (err) {
      logError('skillPrefs', 'loadPreferences', err as Error);
      loaded = true;
    }
  })();
  await loadPromise;
  loadPromise = null;
}

function savePreferences(): void {
  storage.kv.set(PREFERENCES_KEY, serializePreferences()).catch((err: unknown) => {
    logError('skillPrefs', 'savePreferences', err as Error);
  });
}

// ==================== MUTATIONS ====================

function setPreference(skillId: string, updates: Partial<SkillPreference>): void {
  const current = getPreference(skillId);
  const updated = { ...current, ...updates };
  const next = new Map(preferences.value);
  next.set(skillId, updated);
  preferences.value = next;
  savePreferences();
}

// ==================== COMPOSABLE ====================

export interface UseSkillPreferencesReturn {
  allSkills: ComputedRef<UnifiedSkill[]>;
  enabledSkills: ComputedRef<UnifiedSkill[]>;
  favoritedSkills: ComputedRef<UnifiedSkill[]>;
  enabledNotFavorited: ComputedRef<UnifiedSkill[]>;
  toggleEnabled: (skillId: string) => void;
  toggleFavorited: (skillId: string) => void;
  getPreference: (skillId: string) => SkillPreference;
  loadPreferences: () => Promise<void>;
}

export function useSkillPreferences(): UseSkillPreferencesReturn {
  // Lazy-load preferences on first access
  if (!loaded && !loadPromise) {
    loadPreferences().catch((err: unknown) => {
      logError('skillPrefs', 'init', err as Error);
    });
  }

  const coordinator = useSkillCoordinator();

  // ---- Unified skill list ----

  const allSkills: ComputedRef<UnifiedSkill[]> = computed(() => {
    const result: UnifiedSkill[] = [];

    // All skills from coordinator, excluding modifiers (not user-facing in preferences)
    const allCoordinatorSkills = coordinator.listSkills();

    for (const skill of allCoordinatorSkills) {
      // Skip modifiers — they're not shown in the preferences UI
      if (skill.type === 'modifier') continue;

      const pref = getPreference(skill.id);

      // Determine display type
      const displayType: 'prompt' | 'action' =
        skill.type === 'prompt' || skill.type === 'template' ? 'prompt' : 'action';

      // Determine display value
      let displayValue = '';
      if (skill.type === 'prompt' && skill.promptConfig?.text) {
        displayValue = skill.promptConfig.text;
      } else if (skill.type === 'action' && skill.actionConfig?.actionId) {
        displayValue = skill.actionConfig.actionId;
      } else if (skill.type === 'chain') {
        displayValue = `chain:${skill.id}`;
      } else if (skill.type === 'template' && skill.templateConfig?.template) {
        displayValue = skill.templateConfig.template;
      }

      // Determine source for UI display
      const displaySource = skill.source as UnifiedSkill['source'];

      result.push({
        id: skill.id,
        title: skill.title,
        type: displayType,
        value: displayValue,
        source: displaySource,
        enabled: pref.enabled,
        favorited: pref.favorited,
        category: BUILTIN_CATEGORY_MAP[skill.id] ?? skill.tags?.[0] ?? 'workflow',
        description: skill.promptConfig?.text ?? displayValue,
        triggers: skill.tags ?? [],
        usageCount: skill.usageCount,
        lastUsed: skill.lastUsed,
      });
    }

    return result;
  });

  const enabledSkills: ComputedRef<UnifiedSkill[]> = computed(() =>
    allSkills.value.filter((s) => s.enabled)
  );

  const favoritedSkills: ComputedRef<UnifiedSkill[]> = computed(() =>
    allSkills.value.filter((s) => s.enabled && s.favorited)
  );

  const enabledNotFavorited: ComputedRef<UnifiedSkill[]> = computed(() =>
    allSkills.value.filter((s) => s.enabled && !s.favorited)
  );

  // ---- Toggle methods ----

  function toggleEnabled(skillId: string): void {
    const current = getPreference(skillId);
    setPreference(skillId, { enabled: !current.enabled });
  }

  function toggleFavorited(skillId: string): void {
    const current = getPreference(skillId);
    setPreference(skillId, { favorited: !current.favorited });
  }

  return {
    allSkills,
    enabledSkills,
    favoritedSkills,
    enabledNotFavorited,
    toggleEnabled,
    toggleFavorited,
    getPreference,
    loadPreferences,
  };
}
