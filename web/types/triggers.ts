/**
 * Trigger Runtime Types
 *
 * Extends the base TriggerCondition and TriggerConfig types from skills.ts
 * with full runtime definitions for persistence, state tracking, worker
 * communication, and firing history.
 */

// Re-export base types from skills.ts
export type { TriggerCondition, TriggerConfig } from '@web/types/skills';

import type { TriggerCondition } from '@web/types/skills';

// ==================== TRIGGER DEFINITION ====================

/**
 * What happens when a trigger fires.
 */
export type TriggerAction =
  | { type: 'launch-app'; appId: string }
  | { type: 'execute-skill'; skillId: string }
  | { type: 'emit-event'; event: string; payload?: Record<string, unknown> };

/**
 * Full trigger definition with persistence fields.
 * Conditions come from the base TriggerCondition type (time, event, context, interval).
 */
export interface TriggerDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly conditions: ReadonlyArray<TriggerCondition>;
  readonly conditionMode: 'all' | 'any';
  readonly action: TriggerAction;
  readonly cooldownMs: number;
  readonly maxFirings?: number;
  readonly enabled: boolean;
  readonly createdAt: number;
}

// ==================== TRIGGER STATE ====================

/**
 * Mutable runtime state (persisted separately from definition).
 * Tracked per trigger for cooldown, firing count, and runtime enable/disable.
 */
export interface TriggerState {
  readonly triggerId: string;
  readonly firingCount: number;
  readonly lastFired: number;
  readonly enabled: boolean;
}

// ==================== FIRING HISTORY ====================

/**
 * Individual firing record for audit/debug purposes.
 */
export interface TriggerFiring {
  readonly triggerId: string;
  readonly timestamp: number;
  readonly success: boolean;
  readonly reason?: 'cooldown' | 'max_firings' | 'disabled' | 'recursion_limit';
}

// ==================== WORKER MESSAGES ====================

/**
 * Message sent from main thread to worker to register an interval trigger.
 */
export interface WorkerRegisterMsg {
  readonly type: 'register';
  readonly id: string;
  readonly intervalMs: number;
}

/**
 * Message sent from main thread to worker to unregister a trigger.
 */
export interface WorkerUnregisterMsg {
  readonly type: 'unregister';
  readonly id: string;
}

/**
 * Message sent from worker to main thread when a trigger is due to fire.
 */
export interface WorkerFireMsg {
  readonly type: 'fire';
  readonly id: string;
  readonly timestamp: number;
}

/**
 * Union of messages the worker accepts (main -> worker).
 */
export type WorkerInbound = WorkerRegisterMsg | WorkerUnregisterMsg;

/**
 * Union of messages the worker sends (worker -> main).
 */
export type WorkerOutbound = WorkerFireMsg;
