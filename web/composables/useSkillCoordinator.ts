/**
 * Skill Coordinator - Central hub for the evolved skills system
 *
 * Provides:
 * - Open action registry (registerAction/unregisterAction)
 * - Zone registry for multi-target drops
 * - Skill CRUD operations
 * - Execution pipeline
 * - Basic context management
 * - Event system
 *
 * Based on docs/SKILLS_EVOLUTION.md specification
 */

import { ref, shallowRef, readonly, type Ref, type ShallowRef, type DeepReadonly } from 'vue';
import type {
  ActionDefinition,
  ZoneDefinition,
  SkillV2,
  SkillType,
  SkillCreateInput,
  SkillFilter,
  ExecutionContext,
  ExecutionResult,
  ExecutionPayload,
  CombineMode,
  SkillEvent,
  SkillEventHandler,
  ConversationState,
  TimeState,
} from '@web/types/skills';
import {
  createVoidPayload,
  createTextPayload,
  createSuccessResult,
  createErrorResult,
} from '@web/types/skills';
import {
  BUILTIN_ACTIONS,
  BUILTIN_MODIFIERS,
  BUILTIN_PROMPT_SKILLS,
} from '@web/services/skills/builtinActions';
import * as skillStorage from '@web/services/skills/storage';
import { storage } from '@web/storage/storage.js';
import { useEventBus } from '@web/services/eventBus';
import { debugLog, debugWarn } from '@web/utils/debugLog';

// ==================== SINGLETON STATE ====================

/** Registry of available actions */
const actions: ShallowRef<Map<string, ActionDefinition>> = shallowRef(new Map());

/** Registry of drop target zones */
const zones: ShallowRef<Map<string, ZoneDefinition>> = shallowRef(new Map());

/** All skills (V2 format) */
const skills: Ref<Map<string, SkillV2>> = ref(new Map());

/** Current execution context */
const context: Ref<ExecutionContext> = ref(createDefaultContext());

/** Event listeners */
const eventListeners: Map<SkillEvent, Set<SkillEventHandler>> = new Map();

/** Track if builtin actions have been registered */
let builtinsRegistered = false;

/** Track if skills have been loaded from storage */
let storageLoaded = false;

/** Promise for storage load (to prevent duplicate loads) */
let storageLoadPromise: Promise<void> | null = null;

/** Interval ID for time tracking (for cleanup) */
let timeTrackingIntervalId: ReturnType<typeof setInterval> | null = null;

// ==================== USAGE STATS PERSISTENCE ====================

const USAGE_STATS_KEY = 'skills/usageStats';

interface PersistedUsageStats {
  usageCount: number;
  lastUsed: number;
}

/** Cached usage stats loaded from storage */
let cachedUsageStats: Map<string, PersistedUsageStats> | null = null;

/** Load usage stats from KV storage */
async function loadUsageStats(): Promise<Map<string, PersistedUsageStats>> {
  if (cachedUsageStats) return cachedUsageStats;
  try {
    const raw = await storage.kv.get(USAGE_STATS_KEY);
    const map = new Map<string, PersistedUsageStats>();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
        if (val && typeof val === 'object') {
          const v = val as Record<string, unknown>;
          if (typeof v.usageCount === 'number' && typeof v.lastUsed === 'number') {
            map.set(id, { usageCount: v.usageCount, lastUsed: v.lastUsed });
          }
        }
      }
    }
    cachedUsageStats = map;
    return map;
  } catch (err) {
    debugWarn('skills', 'loadUsageStats', err instanceof Error ? err : String(err));
    cachedUsageStats = new Map();
    return cachedUsageStats;
  }
}

/** Persist usage stats for a single skill */
function saveUsageStats(skillId: string, usageCount: number, lastUsed: number): void {
  if (!cachedUsageStats) cachedUsageStats = new Map();
  cachedUsageStats.set(skillId, { usageCount, lastUsed });

  // Serialize and save (fire-and-forget)
  const obj: Record<string, PersistedUsageStats> = {};
  for (const [id, stats] of cachedUsageStats) {
    obj[id] = { ...stats };
  }
  storage.kv.set(USAGE_STATS_KEY, obj).catch((err: unknown) => {
    debugWarn('skills', 'saveUsageStats', err instanceof Error ? err : String(err));
  });
}

// ==================== CONTEXT HELPERS ====================

/**
 * Create a default execution context
 */
function createDefaultContext(): ExecutionContext {
  const now = new Date();
  return {
    selection: undefined,
    attachments: [],
    clipboard: undefined,
    conversation: {
      id: null,
      messageCount: 0,
      provider: '',
      model: '',
    },
    time: {
      hour: now.getHours(),
      minute: now.getMinutes(),
      dayOfWeek: now.getDay(),
      date: now.toISOString().split('T')[0] ?? '',
    },
    activePanel: null,
    theme: '',
    signals: {},
  };
}

/**
 * Merge partial context into full context
 */
function mergeContext(
  base: ExecutionContext,
  partial?: Partial<ExecutionContext>
): ExecutionContext {
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    conversation: {
      ...base.conversation,
      ...(partial.conversation || {}),
    } as ConversationState,
    time: {
      ...base.time,
      ...(partial.time || {}),
    } as TimeState,
    signals: {
      ...base.signals,
      ...(partial.signals || {}),
    },
  };
}

// ==================== EVENT SYSTEM ====================

/**
 * Emit an event to all listeners
 */
function emitEvent(event: SkillEvent, data: unknown): void {
  const listeners = eventListeners.get(event);
  if (listeners) {
    for (const handler of listeners) {
      try {
        handler(data);
      } catch (err) {
        debugWarn('skills', `event:${event}`, err instanceof Error ? err : String(err));
      }
    }
  }
}

/**
 * Subscribe to an event
 */
function on(event: SkillEvent, handler: SkillEventHandler): () => void {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(handler);

  // Return unsubscribe function
  return () => {
    const listeners = eventListeners.get(event);
    if (listeners) {
      listeners.delete(handler);
    }
  };
}

// ==================== ACTION REGISTRY ====================

/**
 * Register a new action
 */
function registerAction(action: ActionDefinition): void {
  if (!action.id) {
    debugWarn('skills', 'registerAction', 'Cannot register action without id');
    return;
  }

  const map = new Map(actions.value);
  const existing = map.get(action.id);

  // Call onUnregister for existing if being replaced
  if (existing?.onUnregister) {
    try {
      existing.onUnregister();
    } catch (err) {
      debugWarn('skills', `onUnregister:${action.id}`, err instanceof Error ? err : String(err));
    }
  }

  map.set(action.id, action);
  actions.value = map;

  // Call onRegister for new action
  if (action.onRegister) {
    try {
      action.onRegister();
    } catch (err) {
      debugWarn('skills', `onRegister:${action.id}`, err instanceof Error ? err : String(err));
    }
  }

  debugLog('skills', 'registerAction', action.id);
  emitEvent('action:registered', { actionId: action.id, action });
}

/**
 * Unregister an action
 */
function unregisterAction(actionId: string): void {
  const map = new Map(actions.value);
  const action = map.get(actionId);

  if (!action) {
    debugWarn('skills', 'unregisterAction', `Action not found: ${actionId}`);
    return;
  }

  // Call onUnregister
  if (action.onUnregister) {
    try {
      action.onUnregister();
    } catch (err) {
      debugWarn('skills', `onUnregister:${actionId}`, err instanceof Error ? err : String(err));
    }
  }

  map.delete(actionId);
  actions.value = map;

  debugLog('skills', 'unregisterAction', actionId);
  emitEvent('action:unregistered', { actionId });
}

/**
 * Get an action by ID
 */
function getAction(actionId: string): ActionDefinition | undefined {
  return actions.value.get(actionId);
}

/**
 * List all registered actions
 */
function listActions(): ActionDefinition[] {
  return Array.from(actions.value.values());
}

// ==================== ZONE REGISTRY ====================

/**
 * Register a drop target zone
 */
function registerZone(zone: ZoneDefinition): void {
  if (!zone.id) {
    debugWarn('skills', 'registerZone', 'Cannot register zone without id');
    return;
  }

  const map = new Map(zones.value);
  map.set(zone.id, zone);
  zones.value = map;

  debugLog('skills', 'registerZone', zone.id);
  emitEvent('zone:registered', { zoneId: zone.id, zone });
}

/**
 * Unregister a zone
 */
function unregisterZone(zoneId: string): void {
  const map = new Map(zones.value);
  if (!map.has(zoneId)) {
    debugWarn('skills', 'unregisterZone', `Zone not found: ${zoneId}`);
    return;
  }

  map.delete(zoneId);
  zones.value = map;

  debugLog('skills', 'unregisterZone', zoneId);
  emitEvent('zone:unregistered', { zoneId });
}

/**
 * Get a zone by ID
 */
function getZone(zoneId: string): ZoneDefinition | undefined {
  return zones.value.get(zoneId);
}

/**
 * List all registered zones
 */
function listZones(): ZoneDefinition[] {
  return Array.from(zones.value.values());
}

// ==================== SKILL CRUD ====================

/**
 * Generate a unique ID
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Create a new skill
 */
function createSkill(input: SkillCreateInput): SkillV2 {
  const now = Date.now();
  const skill: SkillV2 = {
    ...input,
    id: generateId(),
    usageCount: 0,
    lastUsed: 0,
    createdAt: now,
  };

  const map = new Map(skills.value);
  map.set(skill.id, skill);
  skills.value = map;

  // Persist to storage (async, fire-and-forget)
  skillStorage.addSkill(skill).catch((err) => {
    debugWarn('skills', 'createSkill', err instanceof Error ? err : String(err));
  });

  debugLog('skills', 'createSkill', `${skill.id} (${skill.title})`);
  emitEvent('skill:created', { skill });
  useEventBus().emit('skill:created', { id: skill.id, title: skill.title });

  return skill;
}

/**
 * Register an existing skill without persisting to storage
 * Used for V1 skills that are already persisted in legacy store
 */
function registerSkill(skill: SkillV2): void {
  const map = new Map(skills.value);
  map.set(skill.id, skill);
  skills.value = map;
}

/**
 * Update an existing skill
 */
function updateSkill(id: string, updates: Partial<SkillV2>): void {
  const map = new Map(skills.value);
  const existing = map.get(id);

  if (!existing) {
    debugWarn('skills', 'updateSkill', `Skill not found: ${id}`);
    return;
  }

  const updated: SkillV2 = {
    ...existing,
    ...updates,
    id, // Prevent ID from being changed
  };

  map.set(id, updated);
  skills.value = map;

  // Persist full skill to storage for custom/combined/generated
  if (
    updated.source === 'custom' ||
    updated.source === 'combined' ||
    updated.source === 'generated'
  ) {
    skillStorage.updateSkill(id, updates).catch((err) => {
      debugWarn('skills', 'updateSkill', err instanceof Error ? err : String(err));
    });
  }

  // Persist usage stats for ALL skills (including builtins)
  if (updates.usageCount !== undefined || updates.lastUsed !== undefined) {
    saveUsageStats(id, updated.usageCount, updated.lastUsed);
  }

  debugLog('skills', 'updateSkill', id);
  emitEvent('skill:updated', { skill: updated, changes: updates });
}

/**
 * Delete a skill
 */
function deleteSkill(id: string): void {
  const map = new Map(skills.value);
  const skill = map.get(id);

  if (!skill) {
    debugWarn('skills', 'deleteSkill', `Skill not found: ${id}`);
    return;
  }

  // If trigger skill, unregister from scheduler
  if (skill.type === 'trigger' && skill.triggerConfig) {
    import(/* @vite-ignore */ '@web/services/triggers/scheduler')
      .then(({ useTriggerScheduler }) => {
        const scheduler = useTriggerScheduler();
        scheduler.unregister(id);
      })
      .catch(() => {
        // Scheduler may not be initialized -- that's OK during deletion
      });
  }

  map.delete(id);
  skills.value = map;

  // Persist to storage (async, fire-and-forget)
  skillStorage.deleteSkill(id).catch((err) => {
    debugWarn('skills', 'deleteSkill', err instanceof Error ? err : String(err));
  });

  debugLog('skills', 'deleteSkill', id);
  emitEvent('skill:deleted', { skillId: id, skill });
  useEventBus().emit('skill:deleted', { id });
}

/**
 * Get a skill by ID
 */
function getSkill(id: string): SkillV2 | undefined {
  return skills.value.get(id);
}

/**
 * List skills with optional filter
 */
function listSkills(filter?: SkillFilter): SkillV2[] {
  let result = Array.from(skills.value.values());

  if (filter) {
    if (filter.type) {
      result = result.filter((s) => s.type === filter.type);
    }
    if (filter.source) {
      result = result.filter((s) => s.source === filter.source);
    }
    if (filter.tags && filter.tags.length > 0) {
      const filterTags = new Set(filter.tags);
      result = result.filter((s) => s.tags?.some((t) => filterTags.has(t)));
    }
    if (filter.hidden !== undefined) {
      result = result.filter((s) => (s.hidden ?? false) === filter.hidden);
    }
  }

  return result;
}

/**
 * List visible skills (not hidden)
 * Convenience method for UI rendering
 */
function listVisibleSkills(filter?: Omit<SkillFilter, 'hidden'>): SkillV2[] {
  return listSkills({ ...filter, hidden: false });
}

// ==================== EXECUTION ====================

/**
 * Execute a single skill
 */
async function execute(
  skillId: string,
  ctxOverride?: Partial<ExecutionContext>
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const skill = skills.value.get(skillId);

  if (!skill) {
    return createErrorResult(`Skill not found: ${skillId}`, Date.now() - startTime);
  }

  const ctx = mergeContext(context.value, ctxOverride);

  try {
    let result: ExecutionResult;

    switch (skill.type) {
      case 'prompt':
        result = await executePrompt(skill, ctx);
        break;
      case 'action':
        result = await executeAction(skill, ctx);
        break;
      case 'template':
        result = await executeTemplate(skill, ctx);
        break;
      case 'chain':
        result = await executeChainSkill(skill, ctx);
        break;
      case 'modifier':
        // Modifiers are applied during combination, not executed directly
        result = createSuccessResult(undefined, 0);
        break;
      case 'trigger': {
        if (skill.triggerConfig) {
          const { useTriggerScheduler } = await import(
            /* @vite-ignore */ '@web/services/triggers/scheduler'
          );
          const scheduler = useTriggerScheduler();

          // Build TriggerDefinition from skill's triggerConfig
          const triggerDef = {
            id: skill.id,
            name: skill.title,
            conditions: skill.triggerConfig.conditions,
            conditionMode: skill.triggerConfig.conditionMode,
            action: { type: 'execute-skill' as const, skillId: skill.triggerConfig.targetSkillId },
            cooldownMs: skill.triggerConfig.cooldown ?? 60000,
            enabled: skill.triggerConfig.enabled,
            createdAt: skill.createdAt,
          };

          if (skill.triggerConfig.enabled) {
            scheduler.register(triggerDef);
          } else {
            scheduler.unregister(skill.id);
          }
        }
        result = createSuccessResult(undefined, 0);
        break;
      }
      default:
        result = createErrorResult(`Unknown skill type: ${(skill as SkillV2).type}`, 0);
    }

    // Update usage stats
    updateSkill(skillId, {
      usageCount: skill.usageCount + 1,
      lastUsed: Date.now(),
    });

    emitEvent('skill:executed', { skillId, skill, result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    debugWarn('skills', `execute:${skillId}`, err instanceof Error ? err : error);
    return createErrorResult(error, Date.now() - startTime);
  }
}

/**
 * Execute a prompt skill
 */
async function executePrompt(
  skill: SkillV2,
  _ctx: ExecutionContext // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const config = skill.promptConfig;

  if (!config?.text) {
    return createErrorResult('Prompt skill missing text', Date.now() - startTime);
  }

  const payload = createTextPayload(config.text, skill.id);

  // Emit event for UI to handle
  useEventBus().emit('skill:prompt', {
    text: config.text,
    appendToInput: config.appendToInput ?? false,
    autoSubmit: config.autoSubmit ?? false,
    skillId: skill.id,
  });

  return createSuccessResult(payload, Date.now() - startTime);
}

/**
 * Execute an action skill
 */
async function executeAction(skill: SkillV2, ctx: ExecutionContext): Promise<ExecutionResult> {
  const startTime = Date.now();
  const config = skill.actionConfig;

  if (!config?.actionId) {
    return createErrorResult('Action skill missing actionId', Date.now() - startTime);
  }

  const action = actions.value.get(config.actionId);
  if (!action) {
    return createErrorResult(`Action not found: ${config.actionId}`, Date.now() - startTime);
  }

  // Create payload based on what the action accepts
  const payload: ExecutionPayload = action.accepts.includes('void')
    ? createVoidPayload(skill.id)
    : createTextPayload('', skill.id);

  const params = config.params || {};

  return action.handler(payload, params, ctx);
}

/**
 * Execute a template skill
 */
async function executeTemplate(skill: SkillV2, ctx: ExecutionContext): Promise<ExecutionResult> {
  const startTime = Date.now();
  const config = skill.templateConfig;

  if (!config?.template) {
    return createErrorResult('Template skill missing template', Date.now() - startTime);
  }

  // Resolve variables
  let resolved = config.template;

  for (const varDef of config.variables || []) {
    const placeholder = `{{${varDef.key}}}`;
    let value = '';

    switch (varDef.source) {
      case 'context':
        if (varDef.contextPath) {
          value = getNestedValue(ctx, varDef.contextPath) ?? '';
        }
        break;
      case 'computed':
        if (varDef.compute) {
          value = String(varDef.compute(ctx) ?? '');
        }
        break;
      // input and picker sources require UI interaction
      default:
        value = '';
    }

    resolved = resolved.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  const payload = createTextPayload(resolved, skill.id);

  // Emit event for UI to handle
  useEventBus().emit('skill:prompt', {
    text: resolved,
    appendToInput: false,
    autoSubmit: config.autoSubmit ?? false,
    skillId: skill.id,
  });

  return createSuccessResult(payload, Date.now() - startTime);
}

/**
 * Execute a chain skill
 */
async function executeChainSkill(skill: SkillV2, ctx: ExecutionContext): Promise<ExecutionResult> {
  const startTime = Date.now();
  const config = skill.chainConfig;

  if (!config?.steps || config.steps.length === 0) {
    return createErrorResult('Chain skill has no steps', Date.now() - startTime);
  }

  const results = await executeChain(
    config.steps.map((s) => s.skillId),
    ctx
  );

  const failed = results.find((r) => !r.success);
  if (failed && config.stopOnError !== false) {
    return createErrorResult(failed.error || 'Chain step failed', Date.now() - startTime);
  }

  const lastResult = results[results.length - 1];
  return {
    success: !failed,
    payload: lastResult?.payload,
    duration: Date.now() - startTime,
  };
}

/**
 * Wait for AI response to complete (with timeout)
 */
function waitForResponseComplete(timeoutMs = 120000): Promise<void> {
  return new Promise((resolve) => {
    const bus = useEventBus();
    const handler = (): void => {
      clearTimeout(timeout);
      bus.off('skill:response-complete', handler);
      resolve();
    };

    const timeout = setTimeout(() => {
      bus.off('skill:response-complete', handler);
      debugWarn('skills', 'waitForResponse', 'Timed out waiting for AI response');
      resolve();
    }, timeoutMs);

    bus.on('skill:response-complete', handler);
  });
}

/**
 * Check if a skill is a prompt that auto-submits
 */
function isAutoSubmitPrompt(skillId: string): boolean {
  const skill = skills.value.get(skillId);
  if (!skill) return false;

  if (skill.type === 'prompt' && skill.promptConfig?.autoSubmit) {
    return true;
  }
  if (skill.type === 'template' && skill.templateConfig?.autoSubmit) {
    return true;
  }
  return false;
}

/**
 * Execute multiple skills in sequence
 * Waits for AI response to complete after auto-submit prompts before continuing
 */
async function executeChain(
  skillIds: string[],
  ctxOverride?: Partial<ExecutionContext>
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (let i = 0; i < skillIds.length; i++) {
    const id = skillIds[i];
    if (!id) continue;
    const hasMoreSteps = i < skillIds.length - 1;

    // Check if this is an auto-submit prompt before executing
    const willAutoSubmit = isAutoSubmitPrompt(id);

    const result = await execute(id, ctxOverride);
    results.push(result);

    // If this was an auto-submit prompt and there are more steps,
    // wait for the AI response to complete before continuing
    if (willAutoSubmit && hasMoreSteps && result.success) {
      debugLog('skills', 'executeChain', 'Waiting for AI response before next chain step');
      await waitForResponseComplete();
      debugLog('skills', 'executeChain', 'AI response complete, continuing chain');
    }
  }

  return results;
}

/**
 * Get nested value from object by path
 */
function getNestedValue(obj: unknown, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return '';
    if (typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }

  return current === null || current === undefined ? '' : String(current);
}

// ==================== COMBINATION ====================

/** Separator characters for different combine modes */
const COMBINE_SEPARATORS: Record<CombineMode, string> = {
  chain: '\u2192', // Right arrow
  pipe: '|',
  modify: '+',
};

/** Maximum number of skills that can be combined into a single chain */
const MAX_COMBINED_SKILLS = 2;

/**
 * Count the number of skills in a skill (1 for regular, step count for chains)
 */
function countSkillSteps(skill: SkillV2): number {
  if (skill.type === 'chain' && skill.chainConfig?.steps) {
    return skill.chainConfig.steps.length;
  }
  return 1;
}

/**
 * Check if two skills can be combined
 * Returns the preferred combine mode if compatible, false otherwise
 */
function canCombine(skillA: SkillV2, skillB: SkillV2): CombineMode | false {
  // Prevent combining with self
  if (skillA.id === skillB.id) {
    return false;
  }

  // Prevent merging already-combined skills (merged skills can't merge again)
  if (skillA.source === 'combined' || skillB.source === 'combined') {
    return false;
  }

  // Check if combining would exceed the maximum of 3 skills
  const totalSteps = countSkillSteps(skillA) + countSkillSteps(skillB);
  if (totalSteps > MAX_COMBINED_SKILLS) {
    return false;
  }

  // Check if A has combination rules that allow combining with B
  if (skillA.combinable) {
    if (skillA.combinable.canCombineWith.includes(skillB.type)) {
      return skillA.combinable.preferredMode;
    }
  }

  // Check if B has combination rules that allow combining with A (reversed)
  if (skillB.combinable) {
    if (skillB.combinable.canCombineWith.includes(skillA.type)) {
      return skillB.combinable.preferredMode;
    }
  }

  // Default combination logic based on types
  // Modifiers can combine with prompts, templates, and actions
  if (skillA.type === 'modifier') {
    if (['prompt', 'template', 'action'].includes(skillB.type)) {
      return 'modify';
    }
  }
  if (skillB.type === 'modifier') {
    if (['prompt', 'template', 'action'].includes(skillA.type)) {
      return 'modify';
    }
  }

  // Prompts and templates can chain together
  if (
    ['prompt', 'template'].includes(skillA.type) &&
    ['prompt', 'template'].includes(skillB.type)
  ) {
    return 'chain';
  }

  // Actions can chain together
  if (skillA.type === 'action' && skillB.type === 'action') {
    return 'chain';
  }

  // Prompts/templates can chain with actions
  if (['prompt', 'template'].includes(skillA.type) && skillB.type === 'action') {
    return 'chain';
  }
  if (skillA.type === 'action' && ['prompt', 'template'].includes(skillB.type)) {
    return 'chain';
  }

  // Chains can extend with compatible types
  if (skillA.type === 'chain') {
    if (['prompt', 'template', 'action', 'chain'].includes(skillB.type)) {
      // Note: MAX_COMBINED_SKILLS check above already handles length limit
      return 'chain';
    }
  }

  return false;
}

/**
 * Determine skill order based on combination rules
 * Returns [first, second] ordered pair
 */
function orderSkillsForCombination(
  skillA: SkillV2,
  skillB: SkillV2,
  mode: CombineMode
): [SkillV2, SkillV2] {
  // For modify mode, modifier always wraps the target
  if (mode === 'modify') {
    if (skillA.type === 'modifier') {
      // Modifier wraps B, but B executes first
      if (skillA.modifierConfig?.modifies === 'output') {
        return [skillB, skillA]; // B first, then modifier on output
      }
      return [skillA, skillB]; // Modifier modifies input, so A first
    }
    if (skillB.type === 'modifier') {
      if (skillB.modifierConfig?.modifies === 'output') {
        return [skillA, skillB]; // A first, then modifier on output
      }
      return [skillB, skillA]; // Modifier modifies input
    }
  }

  // Check position preferences
  if (skillA.combinable?.position === 'after') {
    return [skillB, skillA];
  }
  if (skillA.combinable?.position === 'before') {
    return [skillA, skillB];
  }
  if (skillB.combinable?.position === 'after') {
    return [skillA, skillB];
  }
  if (skillB.combinable?.position === 'before') {
    return [skillB, skillA];
  }

  // Default: A comes before B
  return [skillA, skillB];
}

/**
 * Create chain steps from two skills
 */
function createChainSteps(
  first: SkillV2,
  second: SkillV2,
  mode: CombineMode
): import('@web/types/skills').ChainStep[] {
  const steps: import('@web/types/skills').ChainStep[] = [];

  // Handle if first is already a chain (extend it)
  if (first.type === 'chain' && first.chainConfig?.steps) {
    steps.push(...first.chainConfig.steps);
  } else {
    steps.push({ skillId: first.id, mode: 'execute' });
  }

  // Handle if second is already a chain (flatten it)
  if (second.type === 'chain' && second.chainConfig?.steps) {
    for (const step of second.chainConfig.steps) {
      steps.push({
        ...step,
        mode: mode === 'pipe' ? 'pipe' : step.mode,
      });
    }
  } else {
    steps.push({
      skillId: second.id,
      mode: mode === 'pipe' ? 'pipe' : 'execute',
    });
  }

  return steps;
}

/**
 * Generate title for combined skill
 */
function generateCombinedTitle(first: SkillV2, second: SkillV2, mode: CombineMode): string {
  const separator = COMBINE_SEPARATORS[mode];
  return `${first.title} ${separator} ${second.title}`;
}

/**
 * Generate badge for combined skill (shows step count)
 */
function generateCombinedBadge(steps: import('@web/types/skills').ChainStep[]): string | undefined {
  if (steps.length > 2) {
    return String(steps.length);
  }
  return undefined;
}

/**
 * Find an existing combined skill with the same parent IDs
 * Returns the existing skill if found, null otherwise
 */
function findExistingCombination(parentIds: string[]): SkillV2 | null {
  // Sort parent IDs to ensure order-independent comparison
  const sortedParentIds = [...parentIds].sort();

  for (const skill of skills.value.values()) {
    if (skill.source !== 'combined' || !skill.parentIds) continue;

    // Compare sorted parent ID arrays
    const sortedExistingIds = [...skill.parentIds].sort();
    if (sortedExistingIds.length !== sortedParentIds.length) continue;

    const isMatch = sortedExistingIds.every((id, index) => id === sortedParentIds[index]);
    if (isMatch) {
      return skill;
    }
  }

  return null;
}

/**
 * Combine two skills into a new combined skill
 * If an identical combination already exists, returns the existing skill
 */
function combine(skillA: SkillV2, skillB: SkillV2, mode: CombineMode): SkillV2 {
  // Determine order
  const [first, second] = orderSkillsForCombination(skillA, skillB, mode);

  // Create chain steps
  const steps = createChainSteps(first, second, mode);

  // Collect parent IDs (flatten nested chains)
  const parentIds: string[] = [];
  if (first.source === 'combined' && first.parentIds) {
    parentIds.push(...first.parentIds);
  } else {
    parentIds.push(first.id);
  }
  if (second.source === 'combined' && second.parentIds) {
    parentIds.push(...second.parentIds);
  } else {
    parentIds.push(second.id);
  }

  // Check if an identical combination already exists
  const existing = findExistingCombination(parentIds);
  if (existing) {
    debugLog('skills', 'combine', `Found existing: ${existing.id} (${existing.title})`);
    emitEvent('skill:combined', {
      combined: existing,
      skillA,
      skillB,
      mode,
      isExisting: true,
    });
    return existing;
  }

  // Determine icon (use first non-chain icon, or first icon)
  const icon = first.icon ?? second.icon;

  // Determine color (blend or use first)
  const color = first.color ?? second.color;

  const combined = createSkill({
    title: generateCombinedTitle(first, second, mode),
    type: 'chain',
    source: 'combined',
    icon,
    color,
    badge: generateCombinedBadge(steps),
    parentIds,
    chainConfig: {
      steps,
      stopOnError: true,
      parallel: false,
    },
    // Inherit combinable from first if it allows chaining
    combinable: first.combinable ?? {
      canCombineWith: ['prompt', 'template', 'action', 'modifier', 'chain'],
      preferredMode: 'chain',
      position: 'before',
      maxChainLength: 10,
    },
  });

  // Note: createSkill already adds to skills map and persists to storage

  debugLog(
    'skills',
    'combine',
    `${first.title} ${COMBINE_SEPARATORS[mode]} ${second.title} -> ${combined.id}`
  );
  emitEvent('skill:combined', { combined, skillA, skillB, mode, isExisting: false });
  return combined;
}

/**
 * Uncombine a chain skill back to its components
 * Returns the original skills that were combined
 */
function uncombine(chainedSkill: SkillV2): SkillV2[] {
  if (chainedSkill.type !== 'chain' || !chainedSkill.parentIds) {
    return [chainedSkill];
  }

  const components = chainedSkill.parentIds
    .map((id) => skills.value.get(id))
    .filter((s): s is SkillV2 => s !== undefined);

  // Delete the combined skill
  deleteSkill(chainedSkill.id);

  return components;
}

/**
 * Get the visual separator for a combine mode
 */
function getCombineSeparator(mode: CombineMode): string {
  return COMBINE_SEPARATORS[mode];
}

// ==================== CONTEXT MANAGEMENT ====================

/**
 * Get current execution context
 */
function getContext(): ExecutionContext {
  return { ...context.value };
}

/**
 * Update execution context
 */
function updateContext(updates: Partial<ExecutionContext>): void {
  context.value = mergeContext(context.value, updates);
  emitEvent('context:updated', { context: context.value });
}

/**
 * Set a single context signal
 */
function setSignal(key: string, value: unknown): void {
  context.value = {
    ...context.value,
    signals: {
      ...context.value.signals,
      [key]: value,
    },
  };
}

/**
 * Update theme context
 */
function setThemeContext(theme: string): void {
  context.value = {
    ...context.value,
    theme,
  };
}

// ==================== INITIALIZATION ====================

/**
 * Register all built-in actions
 */
function registerBuiltinActions(): void {
  if (builtinsRegistered) return;

  for (const action of BUILTIN_ACTIONS) {
    registerAction(action);
  }

  builtinsRegistered = true;
  debugLog('skills', 'init', `Registered ${BUILTIN_ACTIONS.length} built-in actions`);
}

/**
 * Register built-in modifier skills
 * These are added to the skills map with stable IDs
 */
function registerBuiltinSkills(): void {
  const map = new Map(skills.value);
  let addedCount = 0;

  // Register modifier skills from builtinActions
  for (const modifierInput of BUILTIN_MODIFIERS) {
    if (map.has(modifierInput.id)) continue;

    const skill: SkillV2 = {
      ...modifierInput,
      usageCount: 0,
      lastUsed: 0,
      createdAt: 0,
    };
    map.set(skill.id, skill);
    addedCount++;
  }

  // Register builtin prompt/action skills
  for (const promptInput of BUILTIN_PROMPT_SKILLS) {
    if (map.has(promptInput.id)) continue;

    const skill: SkillV2 = {
      ...promptInput,
      usageCount: 0,
      lastUsed: 0,
      createdAt: 0,
    };
    map.set(skill.id, skill);
    addedCount++;
  }

  skills.value = map;

  if (addedCount > 0) {
    debugLog('skills', 'init', `Registered ${addedCount} built-in skills`);
  }

  // Restore persisted usage stats (async, non-blocking)
  loadUsageStats()
    .then((stats) => {
      if (stats.size === 0) return;

      const currentMap = new Map(skills.value);
      let restoredCount = 0;

      for (const [id, { usageCount, lastUsed }] of stats) {
        const skill = currentMap.get(id);
        if (skill && (usageCount > skill.usageCount || lastUsed > skill.lastUsed)) {
          currentMap.set(id, {
            ...skill,
            usageCount: Math.max(skill.usageCount, usageCount),
            lastUsed: Math.max(skill.lastUsed, lastUsed),
          });
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        skills.value = currentMap;
        debugLog('skills', 'init', `Restored usage stats for ${restoredCount} skills`);
      }
    })
    .catch((err) => {
      debugWarn('skills', 'restoreUsageStats', err instanceof Error ? err : String(err));
    });
}

/**
 * Load skills from storage
 */
async function loadSkillsFromStorage(): Promise<void> {
  if (storageLoaded) return;

  if (storageLoadPromise) {
    await storageLoadPromise;
    return;
  }

  storageLoadPromise = (async () => {
    try {
      const loaded = await skillStorage.loadSkills();
      const map = new Map(skills.value);

      for (const skill of loaded) {
        map.set(skill.id, skill);
      }

      skills.value = map;
      storageLoaded = true;
      debugLog('skills', 'loadFromStorage', `Loaded ${loaded.length} skills`);
    } catch (err) {
      debugWarn('skills', 'loadFromStorage', err instanceof Error ? err : String(err));
      storageLoaded = true; // Mark as loaded to prevent retries
    }
  })();

  await storageLoadPromise;
  storageLoadPromise = null;
}

/**
 * Initialize the coordinator
 */
function initialize(): void {
  registerBuiltinActions();
  registerBuiltinSkills();

  // Clear any existing time tracking interval (for HMR)
  if (timeTrackingIntervalId !== null) {
    clearInterval(timeTrackingIntervalId);
    timeTrackingIntervalId = null;
  }

  // Set up time tracking
  const updateTime = (): void => {
    const now = new Date();
    context.value = {
      ...context.value,
      time: {
        hour: now.getHours(),
        minute: now.getMinutes(),
        dayOfWeek: now.getDay(),
        date: now.toISOString().split('T')[0] ?? '',
      },
    };
  };

  // Update time every minute
  updateTime();
  timeTrackingIntervalId = setInterval(updateTime, 60000);

  // Load skills from storage (async, non-blocking)
  loadSkillsFromStorage().catch((err) => {
    debugWarn('skills', 'initialize', err instanceof Error ? err : String(err));
  });
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initialize();
}

// ==================== ZONE HELPERS ====================

/** Position in screen coordinates */
interface ZonePosition {
  x: number;
  y: number;
}

/** Rectangle for zone bounds */
interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Get the bounding rectangle for a zone's element
 */
function getZoneRect(zoneId: string): ZoneRect | null {
  const zone = zones.value.get(zoneId);
  if (!zone?.element) return null;

  const element =
    typeof zone.element === 'string' ? document.querySelector(zone.element) : zone.element;

  if (!element) return null;

  const domRect = element.getBoundingClientRect();
  return {
    x: domRect.left,
    y: domRect.top,
    width: domRect.width,
    height: domRect.height,
  };
}

/**
 * Check if a point is inside a zone
 */
function isPointInZone(zoneId: string, point: ZonePosition): boolean {
  const rect = getZoneRect(zoneId);
  if (!rect) return false;

  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Calculate distance from a point to the nearest edge of a zone
 * Returns 0 if point is inside the zone
 */
function distanceToZone(zoneId: string, point: ZonePosition): number {
  const rect = getZoneRect(zoneId);
  if (!rect) return Infinity;

  if (isPointInZone(zoneId, point)) return 0;

  // Clamp point to rect bounds to find nearest point on rect
  const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));

  return Math.sqrt(Math.pow(point.x - nearestX, 2) + Math.pow(point.y - nearestY, 2));
}

/**
 * Find zones that accept a given skill type
 */
function findAcceptingZones(skillType: SkillType): ZoneDefinition[] {
  return Array.from(zones.value.values()).filter((zone) => zone.accepts.includes(skillType));
}

/**
 * Find the nearest zone to a point that accepts a skill type
 * Returns null if no zone is within the specified radius
 */
function findNearestZone(
  point: ZonePosition,
  skillType: SkillType,
  maxRadius = 200
): ZoneDefinition | null {
  const accepting = findAcceptingZones(skillType);
  if (accepting.length === 0) return null;

  let nearestZone: ZoneDefinition | null = null;
  let nearestDistance = Infinity;

  for (const zone of accepting) {
    const distance = distanceToZone(zone.id, point);
    if (distance < nearestDistance && distance < maxRadius) {
      nearestDistance = distance;
      nearestZone = zone;
    }
  }

  return nearestZone;
}

/**
 * Get all zone rects (for debug visualization)
 */
function getAllZoneRects(): Array<{ zone: ZoneDefinition; rect: ZoneRect }> {
  const result: Array<{ zone: ZoneDefinition; rect: ZoneRect }> = [];

  for (const zone of zones.value.values()) {
    const rect = getZoneRect(zone.id);
    if (rect) {
      result.push({ zone, rect });
    }
  }

  return result;
}

// ==================== COMPOSABLE EXPORT ====================

export interface UseSkillCoordinatorReturn {
  // Reactive state (readonly)
  actions: DeepReadonly<ShallowRef<Map<string, ActionDefinition>>>;
  zones: DeepReadonly<ShallowRef<Map<string, ZoneDefinition>>>;
  skills: DeepReadonly<Ref<Map<string, SkillV2>>>;
  context: DeepReadonly<Ref<ExecutionContext>>;

  // Action Registry
  registerAction: typeof registerAction;
  unregisterAction: typeof unregisterAction;
  getAction: typeof getAction;
  listActions: typeof listActions;

  // Zone Registry
  registerZone: typeof registerZone;
  unregisterZone: typeof unregisterZone;
  getZone: typeof getZone;
  listZones: typeof listZones;

  // Zone Helpers
  getZoneRect: typeof getZoneRect;
  isPointInZone: typeof isPointInZone;
  distanceToZone: typeof distanceToZone;
  findAcceptingZones: typeof findAcceptingZones;
  findNearestZone: typeof findNearestZone;
  getAllZoneRects: typeof getAllZoneRects;

  // Skill CRUD
  createSkill: typeof createSkill;
  registerSkill: typeof registerSkill;
  updateSkill: typeof updateSkill;
  deleteSkill: typeof deleteSkill;
  getSkill: typeof getSkill;
  listSkills: typeof listSkills;
  listVisibleSkills: typeof listVisibleSkills;

  // Execution
  execute: typeof execute;
  executeChain: typeof executeChain;

  // Combination
  canCombine: typeof canCombine;
  combine: typeof combine;
  uncombine: typeof uncombine;
  getCombineSeparator: typeof getCombineSeparator;

  // Context
  getContext: typeof getContext;
  updateContext: typeof updateContext;
  setSignal: typeof setSignal;
  setThemeContext: typeof setThemeContext;

  // Events
  on: typeof on;

  // Storage
  loadFromStorage: typeof loadSkillsFromStorage;
}

/**
 * Composable to access the Skill Coordinator
 * Returns the singleton coordinator instance
 */
export function useSkillCoordinator(): UseSkillCoordinatorReturn {
  return {
    // Reactive state (readonly)
    actions: readonly(actions) as DeepReadonly<ShallowRef<Map<string, ActionDefinition>>>,
    zones: readonly(zones) as DeepReadonly<ShallowRef<Map<string, ZoneDefinition>>>,
    skills: readonly(skills) as DeepReadonly<Ref<Map<string, SkillV2>>>,
    context: readonly(context) as DeepReadonly<Ref<ExecutionContext>>,

    // Action Registry
    registerAction,
    unregisterAction,
    getAction,
    listActions,

    // Zone Registry
    registerZone,
    unregisterZone,
    getZone,
    listZones,

    // Zone Helpers
    getZoneRect,
    isPointInZone,
    distanceToZone,
    findAcceptingZones,
    findNearestZone,
    getAllZoneRects,

    // Skill CRUD
    createSkill,
    registerSkill,
    updateSkill,
    deleteSkill,
    getSkill,
    listSkills,
    listVisibleSkills,

    // Execution
    execute,
    executeChain,

    // Combination
    canCombine,
    combine,
    uncombine,
    getCombineSeparator,

    // Context
    getContext,
    updateContext,
    setSignal,
    setThemeContext,

    // Events
    on,

    // Storage
    loadFromStorage: loadSkillsFromStorage,
  };
}

// ==================== WINDOW EXPORT FOR DEVELOPMENT ====================

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as Window & { skillCoordinator?: UseSkillCoordinatorReturn }).skillCoordinator =
    useSkillCoordinator();
}

export default useSkillCoordinator;
