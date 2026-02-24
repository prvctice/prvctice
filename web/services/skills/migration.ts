/**
 * Skill Migration - V1 to V2 Format Migration
 *
 * Handles migration of legacy skill data (V1 format from localStorage)
 * to the new V2 format used by the Skill Coordinator.
 *
 * V1 Format (legacy localStorage):
 * {
 *   id: string;
 *   title: string;
 *   type: 'prompt' | 'action';
 *   value: string;
 *   source: 'builtin' | 'custom' | 'helptip';
 *   hidden?: boolean;
 * }
 *
 * V2 Format (SkillV2):
 * Uses type-specific config objects (promptConfig, actionConfig, etc.)
 * with additional metadata (usageCount, lastUsed, createdAt).
 */

import type { SkillV2, SkillV1, SkillSource } from '@web/types/skills';

/**
 * Storage format version tracking
 */
export const STORAGE_VERSION = 2;

/**
 * Map of legacy action values to new action IDs
 * Some V1 actions need to be mapped to V2 registry actions
 */
const ACTION_ID_MAP: Record<string, { actionId: string; params?: Record<string, unknown> }> = {
  // V1 action value -> V2 actionId + params
  'open-notes': { actionId: 'open-panel', params: { panel: 'notes' } },
  'toggle-help': { actionId: 'open-panel', params: { panel: 'help' } },
  'voice-commands': { actionId: 'open-panel', params: { panel: 'help' } },
  'change-theme': { actionId: 'change-theme' },
  'set-theme-custom': { actionId: 'change-theme', params: { theme: 'custom' } },
  'toggle-grid': { actionId: 'toggle-grid' },
};

/**
 * Check if a skill is in V1 format
 */
export function isV1Format(data: unknown): data is SkillV1 {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // V1 has 'value' field, V2 uses *Config fields
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    (obj.type === 'prompt' || obj.type === 'action') &&
    typeof obj.value === 'string' &&
    !('promptConfig' in obj) &&
    !('actionConfig' in obj)
  );
}

/**
 * Check if a skill is in V2 format
 */
export function isV2Format(data: unknown): data is SkillV2 {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.usageCount === 'number' &&
    typeof obj.createdAt === 'number'
  );
}

/**
 * Migrate action parameters based on V1 action value
 */
function migrateActionParams(v1Value: string): Record<string, unknown> | undefined {
  const mapping = ACTION_ID_MAP[v1Value];
  return mapping?.params;
}

/**
 * Get the V2 action ID for a V1 action value
 */
function getV2ActionId(v1Value: string): string {
  const mapping = ACTION_ID_MAP[v1Value];
  if (mapping) {
    return mapping.actionId;
  }

  // Handle help-tip actions: "help-tip:tipId" -> custom handler
  if (v1Value.startsWith('help-tip:')) {
    return 'open-help-tip';
  }

  // Pass through unknown action values as-is
  return v1Value;
}

/**
 * Migrate a single skill from V1 to V2 format
 */
export function migrateSkillV1ToV2(old: SkillV1): SkillV2 {
  const now = Date.now();

  // Normalize source field
  const source: SkillSource =
    old.source === 'builtin' || old.source === 'custom' || old.source === 'helptip'
      ? old.source
      : 'custom';

  const base: Omit<SkillV2, 'promptConfig' | 'actionConfig'> = {
    id: old.id,
    title: old.title,
    type: old.type,
    source,

    // New metadata fields with defaults
    usageCount: 0,
    lastUsed: 0,
    createdAt: now,
    hidden: old.hidden,
  };

  if (old.type === 'prompt') {
    return {
      ...base,
      promptConfig: {
        text: old.value,
        appendToInput: false,
        autoSubmit: false,
      },
    };
  }

  if (old.type === 'action') {
    const actionId = getV2ActionId(old.value);
    const params = migrateActionParams(old.value);

    // Handle help-tip actions specially
    if (old.value.startsWith('help-tip:')) {
      const tipId = old.value.replace('help-tip:', '');
      return {
        ...base,
        actionConfig: {
          actionId: 'open-help-tip',
          params: { tipId },
        },
      };
    }

    return {
      ...base,
      actionConfig: {
        actionId,
        ...(params && { params }),
      },
    };
  }

  // Fallback for unknown types (shouldn't happen with V1)
  return {
    ...base,
    type: 'prompt',
    promptConfig: {
      text: old.value || old.title,
      appendToInput: false,
      autoSubmit: false,
    },
  };
}

/**
 * Migrate an array of V1 skills to V2 format
 */
export function migrateSkillsV1ToV2(skills: SkillV1[]): SkillV2[] {
  return skills.map(migrateSkillV1ToV2);
}

/**
 * Storage data format with version tracking
 */
export interface SkillStorageData {
  version: number;
  skills: SkillV2[];
  hiddenBuiltins: string[];
  pinnedTipIds: string[];
  migratedAt?: number;
}

/**
 * Legacy storage format (from localStorage)
 */
export interface LegacyStorageData {
  customSkills?: SkillV1[];
  hiddenBuiltins?: Array<{ title: string; type?: string; value?: string } | string>;
  pinnedTipIds?: string[];
}

/**
 * Normalize hidden builtins array (handle both string and object formats)
 */
function normalizeHiddenBuiltins(
  hidden: Array<{ title: string; type?: string; value?: string } | string> | undefined
): string[] {
  if (!hidden || !Array.isArray(hidden)) return [];

  return hidden.map((item) => {
    if (typeof item === 'string') return item;
    return item.title;
  });
}

/**
 * Migrate legacy storage data to V2 format
 */
export function migrateLegacyStorageData(legacy: LegacyStorageData): SkillStorageData {
  const customSkills = legacy.customSkills || [];
  const migratedSkills = migrateSkillsV1ToV2(customSkills);

  return {
    version: STORAGE_VERSION,
    skills: migratedSkills,
    hiddenBuiltins: normalizeHiddenBuiltins(legacy.hiddenBuiltins),
    pinnedTipIds: legacy.pinnedTipIds || [],
    migratedAt: Date.now(),
  };
}

/**
 * Check if storage data needs migration
 */
export function needsMigration(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // If it has a version field and it's current, no migration needed
  if (typeof obj.version === 'number' && obj.version >= STORAGE_VERSION) {
    return false;
  }

  // If it has customSkills array with V1 items, needs migration
  if (Array.isArray(obj.customSkills)) {
    const first = obj.customSkills[0];
    if (first && isV1Format(first)) {
      return true;
    }
  }

  // If it has skills array with V1 items, needs migration
  if (Array.isArray(obj.skills)) {
    const first = obj.skills[0];
    if (first && isV1Format(first)) {
      return true;
    }
  }

  return false;
}

/**
 * Convert V2 skill back to V1 format for backwards compatibility
 * Used when existing code still expects the old format
 */
export function convertV2ToV1(skill: SkillV2): SkillV1 {
  let value: string;

  switch (skill.type) {
    case 'prompt':
      value = skill.promptConfig?.text || skill.title;
      break;
    case 'action':
      // Reverse map the action ID back to V1 value
      value = reverseMapActionId(skill.actionConfig?.actionId || '', skill.actionConfig?.params);
      break;
    case 'template':
      value = skill.templateConfig?.template || skill.title;
      break;
    case 'chain':
      // Chains don't have a simple V1 equivalent
      value = `chain:${skill.id}`;
      break;
    default:
      value = skill.title;
  }

  return {
    id: skill.id,
    title: skill.title,
    type: skill.type === 'action' ? 'action' : 'prompt',
    value,
    source:
      skill.source === 'builtin' || skill.source === 'custom' || skill.source === 'helptip'
        ? skill.source
        : 'custom',
    hidden: skill.hidden,
  };
}

/**
 * Reverse map V2 action ID back to V1 action value
 */
function reverseMapActionId(actionId: string, params?: Record<string, unknown>): string {
  // Handle open-panel with specific panel params
  if (actionId === 'open-panel' && params?.panel) {
    switch (params.panel) {
      case 'notes':
        return 'open-notes';
      case 'help':
        return 'toggle-help';
      case 'settings':
        return 'open-settings';
    }
  }

  // Handle change-theme with custom theme
  if (actionId === 'change-theme' && params?.theme === 'custom') {
    return 'set-theme-custom';
  }

  // Handle help-tip actions
  if (actionId === 'open-help-tip' && params?.tipId) {
    return `help-tip:${params.tipId}`;
  }

  // Default: return the action ID as-is
  return actionId;
}

/**
 * Convert array of V2 skills to V1 format
 */
export function convertV2ArrayToV1(skills: SkillV2[]): SkillV1[] {
  return skills.map(convertV2ToV1);
}
