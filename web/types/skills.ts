/**
 * Skill Coordinator Type Definitions
 * Based on docs/SKILLS_EVOLUTION.md specification
 *
 * Phase 1: Foundation types for action registry and zone system
 */

// ==================== CORE TYPES ====================

/** Skill type taxonomy */
export type SkillType = 'prompt' | 'action' | 'modifier' | 'template' | 'chain' | 'trigger';

/** Source of a skill */
export type SkillSource = 'builtin' | 'custom' | 'helptip' | 'generated' | 'combined';

/** How pills combine when dragged together */
export type CombineMode = 'chain' | 'pipe' | 'modify';

/** Types of data that can flow through the system */
export type PayloadType = 'text' | 'markdown' | 'json' | 'image' | 'file' | 'void';

// ==================== EXECUTION CONTEXT ====================

/** Selection state from UI */
export interface SelectionState {
  text: string;
  source: 'editor' | 'chat' | 'notes';
}

/** Attachment in the current context */
export interface AttachmentState {
  type: string;
  name: string;
  data: unknown;
}

/** Conversation state for context */
export interface ConversationState {
  id: string | null;
  messageCount: number;
  lastMessage?: {
    role: string;
    content: string;
    timestamp: number;
  };
  provider: string;
  model: string;
}

/** Temporal context */
export interface TimeState {
  hour: number;
  minute: number;
  dayOfWeek: number;
  date: string;
}

/**
 * Full execution context passed to handlers and evaluators
 * Contains all state needed to execute skills contextually
 */
export interface ExecutionContext {
  /** Current UI selection state */
  selection?: SelectionState;

  /** Files/images attached to input */
  attachments?: AttachmentState[];

  /** Clipboard contents (if available) */
  clipboard?: string;

  /** Current conversation state */
  conversation: ConversationState;

  /** Current time information */
  time: TimeState;

  /** Currently active panel */
  activePanel: 'chat' | 'notes' | 'settings' | null;

  /** Current theme name */
  theme: string;

  /** Extensible custom signals */
  signals: Record<string, unknown>;
}

// ==================== EXECUTION PAYLOAD & RESULT ====================

/**
 * Data flowing through the execution pipeline
 */
export interface ExecutionPayload {
  type: PayloadType;
  data: unknown;
  source: string; // skill ID that produced this
  timestamp: number;
}

/**
 * Result of executing a skill or action
 */
export interface ExecutionResult {
  success: boolean;
  payload?: ExecutionPayload;
  error?: string;
  duration: number;
}

// ==================== ACTION REGISTRY ====================

/** Parameter types for action configuration */
export type ParameterType = 'string' | 'number' | 'boolean' | 'select' | 'duration' | 'datetime';

/** Option for select-type parameters */
export interface ParameterOption {
  value: unknown;
  label: string;
}

/**
 * Definition for a configurable action parameter
 */
export interface ParameterDefinition {
  id: string;
  label: string;
  type: ParameterType;
  default?: unknown;
  required?: boolean;
  /** For select type */
  options?: ParameterOption[];
  /** Custom validation function */
  validation?: (value: unknown) => boolean | string;
}

/**
 * Handler function signature for actions
 */
export type ActionHandler = (
  payload: ExecutionPayload,
  params: Record<string, unknown>,
  ctx: ExecutionContext
) => Promise<ExecutionResult>;

/**
 * Definition of a registerable action
 * Actions are the verbs of the system - what actually happens when skills execute
 */
export interface ActionDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: string;

  /** What payload types this action can receive */
  accepts: PayloadType[];

  /** What payload type this action produces (for piping) */
  produces: PayloadType;

  /** Configurable parameters for this action */
  parameters?: ParameterDefinition[];

  /** The execution handler */
  handler: ActionHandler;

  /** Called when action is registered */
  onRegister?: () => void;

  /** Called when action is unregistered */
  onUnregister?: () => void;
}

// ==================== ZONE SYSTEM ====================

/** Zone definition can be a rect, selector, or function */
export type ZoneElement = string | HTMLElement;

/**
 * Handler called when a skill enters a zone during drag
 */
export type ZoneEnterHandler = (skill: SkillV2, position: { x: number; y: number }) => void;

/**
 * Handler called when a skill leaves a zone during drag
 */
export type ZoneLeaveHandler = (skill: SkillV2) => void;

/**
 * Handler called when a skill is dropped on a zone
 */
export type ZoneDropHandler = (skill: SkillV2, ctx: ExecutionContext) => Promise<ExecutionResult>;

/**
 * Custom function to compute magnet snap point for a zone
 */
export type MagnetPointGetter = (zoneRect: DOMRect, pillRect: DOMRect) => { x: number; y: number };

/**
 * Definition of a drop target zone where skills can be dragged
 */
export interface ZoneDefinition {
  id: string;
  label: string;
  element: ZoneElement;

  /** What skill types this zone accepts */
  accepts: SkillType[];

  /** CSS class to add when zone is highlighted */
  highlightClass?: string;

  /** Distance in px at which magnetic attraction starts (default 80) */
  magnetRadius?: number;

  /** Strength of magnetic snap 0-1 (default 0.8) */
  snapStrength?: number;

  /** Called when pill enters zone during drag */
  onEnter?: ZoneEnterHandler;

  /** Called when pill leaves zone during drag */
  onLeave?: ZoneLeaveHandler;

  /** Called when pill is dropped on zone */
  onDrop: ZoneDropHandler;

  /** Custom magnetic snap point calculation */
  getMagnetPoint?: MagnetPointGetter;
}

// ==================== SKILL CONFIGS ====================

/**
 * Configuration for prompt-type skills
 */
export interface PromptConfig {
  text: string;
  /** If true, append to existing input; if false, replace */
  appendToInput?: boolean;
  /** If true, immediately send to AI */
  autoSubmit?: boolean;
}

/**
 * Configuration for action-type skills
 */
export interface ActionConfig {
  /** ID of registered action */
  actionId: string;
  /** Pre-configured parameters */
  params?: Record<string, unknown>;
}

/**
 * Configuration for modifier-type skills
 */
export interface ModifierConfig {
  /** What the modifier transforms */
  modifies: 'input' | 'output' | 'both';

  /** Runtime transform function (not serialized) */
  transform: (payload: ExecutionPayload) => ExecutionPayload | Promise<ExecutionPayload>;

  /** Serializable transform type */
  transformType: 'prepend' | 'append' | 'wrap' | 'format' | 'custom';

  /** Arguments for the transform type */
  transformArgs?: Record<string, unknown>;
}

/**
 * Variable definition for template interpolation
 */
export interface VariableDefinition {
  /** Matches {{key}} in template */
  key: string;

  /** Where the value comes from */
  source: 'context' | 'input' | 'picker' | 'computed';

  /** For context source: path like "selection.text" */
  contextPath?: string;

  /** For input source: label shown in prompt */
  inputLabel?: string;

  /** For picker source: type of picker to show */
  pickerType?: string;

  /** For computed source: function to compute value */
  compute?: (ctx: ExecutionContext) => unknown;
}

/**
 * Configuration for template-type skills
 */
export interface TemplateConfig {
  /** Template string with {{variables}} */
  template: string;

  /** Variable definitions */
  variables: VariableDefinition[];

  /** If true, immediately send after resolution */
  autoSubmit?: boolean;
}

/**
 * Single step in a chain
 */
export interface ChainStep {
  /** Skill ID to execute */
  skillId: string;

  /** How to handle input: execute fresh or pipe from previous */
  mode: 'execute' | 'pipe';

  /** Optional condition to check before executing step */
  condition?: (ctx: ExecutionContext, prevResult?: ExecutionResult) => boolean;
}

/**
 * Configuration for chain-type skills
 */
export interface ChainConfig {
  /** Ordered steps to execute */
  steps: ChainStep[];

  /** If true, stop chain on first error (default true) */
  stopOnError?: boolean;

  /** If true, run steps in parallel instead of sequential */
  parallel?: boolean;
}

/**
 * Trigger condition types
 */
export type TriggerCondition =
  | { type: 'time'; hour: number; minute: number; days?: number[] }
  | { type: 'event'; event: string; filter?: Record<string, unknown> }
  | {
      type: 'context';
      path: string;
      operator: 'exists' | 'equals' | 'contains' | 'gt' | 'lt';
      value?: unknown;
    }
  | { type: 'interval'; ms: number };

/**
 * Configuration for trigger-type skills
 */
export interface TriggerConfig {
  /** Conditions that activate this trigger */
  conditions: TriggerCondition[];

  /** How conditions combine: all must match, or any */
  conditionMode: 'all' | 'any';

  /** Skill ID to execute when triggered */
  targetSkillId: string;

  /** Minimum ms between trigger activations */
  cooldown?: number;

  /** Whether trigger is currently active */
  enabled: boolean;
}

// ==================== CONTEXT & COMBINATION ====================

/**
 * Context requirements for a skill to be relevant
 */
export interface ContextRequirements {
  /** Context paths that must exist (e.g., "selection.text") */
  requires?: string[];

  /** Context paths that must NOT exist */
  excludes?: string[];

  /** Custom relevance scoring function (returns 0-1) */
  score?: (ctx: ExecutionContext) => number;

  /** Minimum score to show skill (default 0) */
  minScore?: number;
}

/**
 * Rules for how this skill can combine with others
 */
export interface CombinationRules {
  /** Skill types this can combine with */
  canCombineWith: SkillType[];

  /** Default combination mode when dragged together */
  preferredMode: CombineMode;

  /** Position in combined result */
  position: 'before' | 'after' | 'either';

  /** Maximum length of resulting chain */
  maxChainLength?: number;
}

// ==================== SKILL V2 ====================

/**
 * Full skill definition (V2 format)
 * The primary data structure for the evolved skills system
 */
export interface SkillV2 {
  id: string;
  title: string;
  type: SkillType;

  // Display
  icon?: string;
  color?: string;
  /** Small indicator badge (e.g., "3" for chain length) */
  badge?: string;

  // Source tracking
  source: SkillSource;
  /** For combined skills: which skills created this */
  parentIds?: string[];

  // Type-specific config (only one should be set based on type)
  promptConfig?: PromptConfig;
  actionConfig?: ActionConfig;
  modifierConfig?: ModifierConfig;
  templateConfig?: TemplateConfig;
  chainConfig?: ChainConfig;
  triggerConfig?: TriggerConfig;

  // Context requirements
  context?: ContextRequirements;

  // Combination rules
  combinable?: CombinationRules;

  // Metadata
  tags?: string[];
  usageCount: number;
  lastUsed: number;
  createdAt: number;
  hidden?: boolean;
  /** Whether this skill is pinned to the dock as a favorite */
  favorited?: boolean;
}

// ==================== LEGACY V1 COMPATIBILITY ====================

/**
 * Legacy skill format (V1) for migration
 */
export interface SkillV1 {
  id: string;
  title: string;
  type: 'prompt' | 'action';
  value: string;
  source: 'builtin' | 'custom' | 'helptip';
  hidden?: boolean;
}

// ==================== EVENTS ====================

/**
 * Events emitted by the coordinator
 */
export type SkillEvent =
  | 'skill:created'
  | 'skill:updated'
  | 'skill:deleted'
  | 'skill:executed'
  | 'skill:combined'
  | 'action:registered'
  | 'action:unregistered'
  | 'zone:registered'
  | 'zone:unregistered'
  | 'trigger:fired'
  | 'trigger:enabled'
  | 'trigger:disabled'
  | 'context:updated';

/**
 * Event handler type
 */
export type SkillEventHandler = (data: unknown) => void;

// ==================== COORDINATOR INTERFACE ====================

/**
 * Filter options for listing skills
 */
export interface SkillFilter {
  type?: SkillType;
  source?: SkillSource;
  tags?: string[];
  /** Filter by hidden status (undefined = all, true = hidden only, false = visible only) */
  hidden?: boolean;
}

/**
 * Input for creating a new skill (without auto-generated fields)
 */
export type SkillCreateInput = Omit<SkillV2, 'id' | 'usageCount' | 'lastUsed' | 'createdAt'>;

/**
 * Input for builtin skills (includes stable ID, excludes auto-generated metadata)
 * Used for skills shipped with the app that need predictable IDs
 */
export type BuiltinSkillInput = Omit<SkillV2, 'usageCount' | 'lastUsed' | 'createdAt'>;

/**
 * Main Skill Coordinator interface
 * Central hub for all skill operations
 */
export interface SkillCoordinator {
  // === Action Registry ===
  registerAction(action: ActionDefinition): void;
  unregisterAction(actionId: string): void;
  getAction(actionId: string): ActionDefinition | undefined;
  listActions(): ActionDefinition[];

  // === Zone Registry ===
  registerZone(zone: ZoneDefinition): void;
  unregisterZone(zoneId: string): void;
  getZone(zoneId: string): ZoneDefinition | undefined;
  listZones(): ZoneDefinition[];

  // === Skill CRUD ===
  createSkill(skill: SkillCreateInput): SkillV2;
  updateSkill(id: string, updates: Partial<SkillV2>): void;
  deleteSkill(id: string): void;
  getSkill(id: string): SkillV2 | undefined;
  listSkills(filter?: SkillFilter): SkillV2[];

  // === Execution ===
  execute(skillId: string, ctx?: Partial<ExecutionContext>): Promise<ExecutionResult>;
  executeChain(skillIds: string[], ctx?: Partial<ExecutionContext>): Promise<ExecutionResult[]>;

  // === Combination ===
  canCombine(skillA: SkillV2, skillB: SkillV2): CombineMode | false;
  combine(skillA: SkillV2, skillB: SkillV2, mode: CombineMode): SkillV2;
  uncombine(chainedSkill: SkillV2): SkillV2[];

  // === Context ===
  getContext(): ExecutionContext;
  updateContext(updates: Partial<ExecutionContext>): void;
  setSignal(key: string, value: unknown): void;

  // === Events ===
  on(event: SkillEvent, handler: SkillEventHandler): () => void;
}

// ==================== UTILITY TYPES ====================

/**
 * Helper to create a void payload (for actions that don't receive data)
 */
export function createVoidPayload(source: string): ExecutionPayload {
  return {
    type: 'void',
    data: null,
    source,
    timestamp: Date.now(),
  };
}

/**
 * Helper to create a text payload
 */
export function createTextPayload(text: string, source: string): ExecutionPayload {
  return {
    type: 'text',
    data: text,
    source,
    timestamp: Date.now(),
  };
}

/**
 * Helper to create a successful result
 */
export function createSuccessResult(payload?: ExecutionPayload, duration = 0): ExecutionResult {
  return {
    success: true,
    payload,
    duration,
  };
}

/**
 * Helper to create an error result
 */
export function createErrorResult(error: string, duration = 0): ExecutionResult {
  return {
    success: false,
    error,
    duration,
  };
}
