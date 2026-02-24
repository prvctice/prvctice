# Skill Coordinator System Documentation

> **Why this doc:** The Skill Coordinator is the largest composable in prvctice and the entry point for understanding how skills (drag-and-drop "pills") are created, combined, and executed. Read this when working on skill CRUD, the suggestion engine, or the backend skill registry.
>
> **Related systems:** [SKILL_PHYSICS_SYSTEM.md](./SKILL_PHYSICS_SYSTEM.md) | [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md) | [CHAT_STORE_SYSTEM.md](./CHAT_STORE_SYSTEM.md) | [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The Skill Coordinator is the central hub for prvctice's skills system. It manages skill CRUD operations, an open action registry, zone-based drop targets, execution pipelines, pill combination mechanics, and integrates with a backend skill registry and suggestion engine for recursive learning.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Skill Types and Categories](#skill-types-and-categories)
4. [Skill Parser](#skill-parser)
5. [Built-in Actions](#built-in-actions)
6. [Built-in Modifiers](#built-in-modifiers)
7. [Storage and Persistence](#storage-and-persistence)
8. [Migration (V1 to V2)](#migration-v1-to-v2)
9. [Skill Preferences](#skill-preferences)
10. [Contract and Invariants](#contract-and-invariants)
11. [Data Flow](#data-flow)
12. [Action Registry](#action-registry)
13. [Zone Registry](#zone-registry)
14. [Execution Pipeline](#execution-pipeline)
15. [Combination System](#combination-system)
16. [Context Management](#context-management)
17. [Event System](#event-system)
18. [Suggestion System / Recursive Learning Pipeline](#suggestion-system--recursive-learning-pipeline)
19. [Backend Skill Registry](#backend-skill-registry)
20. [Backend Prompt Composer](#backend-prompt-composer)
21. [Suggest API Route](#suggest-api-route)
22. [Configuration Reference](#configuration-reference)
23. [Failure Modes](#failure-modes)
24. [File Reference](#file-reference)
25. [Changelog](#changelog)

---

## System Architecture

```
                            SKILL SOURCES
 +-------------+ +----------+ +-----------+ +-----------+ +----------+
 |   Builtin   | |  Custom  | |  Helptip  | | Generated | | Combined |
 |  (actions)  | |  (user)  | |  (tips)   | |   (AI)    | | (merged) |
 +------+------+ +----+-----+ +-----+-----+ +-----+-----+ +----+-----+
        |              |             |             |              |
        v              v             v             v              v
 +----------------------------------------------------------------------+
 |                        SKILL REGISTRY                                 |
 |  Map<string, SkillV2>                                                 |
 |  Types: prompt | action | modifier | template | chain | trigger       |
 +-----------------------------------+----------------------------------+
                                     |
                                     v
 +----------------------------------------------------------------------+
 |                      SKILL COORDINATOR                               |
 |  useSkillCoordinator.ts (1,601 lines) -- singleton composable        |
 |                                                                      |
 |  +---------------------------+    +----------------------------+     |
 |  |     ACTION REGISTRY       |    |      ZONE REGISTRY         |     |
 |  |  Map<string, Action>      |    |  Map<string, Zone>         |     |
 |  |  32 builtin actions      |    |  Drop targets with         |     |
 |  |  7 builtin modifiers      |    |  magnetic attraction       |     |
 |  +---------------------------+    +----------------------------+     |
 |                                                                      |
 |  +---------------------------+    +----------------------------+     |
 |  |    EXECUTION ENGINE       |    |    CONTEXT MANAGER         |     |
 |  |  Resolve type -> handler  |    |  selection | attachments   |     |
 |  |  Execute -> update stats  |    |  conversation | time       |     |
 |  +---------------------------+    +----------------------------+     |
 |                                                                      |
 |  +---------------------------+    +----------------------------+     |
 |  |   COMBINATION SYSTEM      |    |     EVENT SYSTEM           |     |
 |  |  chain | pipe | modify    |    |  skill:created/executed    |     |
 |  |  MAX_COMBINED_SKILLS = 2  |    |  action/zone:registered    |     |
 |  +---------------------------+    +----------------------------+     |
 +----------------------------------------------------------------------+
                    |                               |
                    v                               v
 +-------------------------------+   +-------------------------------+
 |      PERSISTENCE LAYER        |   |   RECURSIVE LEARNING LOOP     |
 |  IndexedDB (V2 format)        |   |  actionObserver -> pattern    |
 |  localStorage mirror (compat) |   |  detector -> suggestion       |
 |  V1 -> V2 auto-migration      |   |  engine -> useSuggestions     |
 +-------------------------------+   +-------------------------------+
                                                    |
                                                    v
                                     +-------------------------------+
                                     |   BACKEND INTEGRATION          |
                                     |  POST /api/v1/suggest          |
                                     |  skillRegistry + promptComposer|
                                     +-------------------------------+
```

---

## Core Concepts

### SkillV2

The primary skill data structure supporting 6 types. Defined in `web/types/skills.ts`.

```typescript
interface SkillV2 {
  id: string;
  title: string;
  type: SkillType; // 'prompt' | 'action' | 'modifier' | 'template' | 'chain' | 'trigger'

  // Display
  icon?: string; // Iconify icon name
  color?: string; // Pill accent color
  badge?: string; // Small indicator (e.g., "3" for chain length)

  // Source tracking
  source: SkillSource; // 'builtin' | 'custom' | 'helptip' | 'generated' | 'combined'
  parentIds?: string[]; // For combined skills: which skills created this

  // Type-specific config (only one set based on type)
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
}
```

### ActionDefinition

Actions are the verbs of the system -- what actually happens when skills execute:

```typescript
interface ActionDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: string;

  accepts: PayloadType[]; // What payload types this action can receive
  produces: PayloadType; // What payload type this action produces

  parameters?: ParameterDefinition[]; // Configurable parameters

  handler: ActionHandler; // (payload, params, ctx) => Promise<ExecutionResult>

  onRegister?: () => void; // Called when action is registered
  onUnregister?: () => void; // Called when action is unregistered
}
```

### ZoneDefinition

Zones are drop targets where skill pills can be dragged:

```typescript
interface ZoneDefinition {
  id: string;
  label: string;
  element: string | HTMLElement; // CSS selector or element ref

  accepts: SkillType[]; // What skill types this zone accepts

  highlightClass?: string; // CSS class when zone is highlighted
  magnetRadius?: number; // Distance for magnetic attraction (default 80)
  snapStrength?: number; // Snap strength 0-1 (default 0.8)

  onEnter?: ZoneEnterHandler; // Called when pill enters zone during drag
  onLeave?: ZoneLeaveHandler; // Called when pill leaves zone during drag
  onDrop: ZoneDropHandler; // Called when pill is dropped on zone

  getMagnetPoint?: MagnetPointGetter; // Custom magnetic snap point
}
```

---

## Skill Types and Categories

### Skill Type Taxonomy

Six skill types form the type system. Defined in `web/types/skills.ts`:

| Type       | Config Object    | Purpose                                    |
| ---------- | ---------------- | ------------------------------------------ |
| `prompt`   | `promptConfig`   | Send text to AI chat                       |
| `action`   | `actionConfig`   | Execute a registered action handler        |
| `modifier` | `modifierConfig` | Transform adjacent pill's input or output  |
| `template` | `templateConfig` | Prompt with `{{variable}}` interpolation   |
| `chain`    | `chainConfig`    | Sequential execution of multiple skills    |
| `trigger`  | `triggerConfig`  | Scheduled/conditional execution (reserved) |

### Categories

Skills are categorized using a five-category taxonomy defined in `web/services/skills/skillCategories.ts` (71 lines):

```typescript
const DEFAULT_SKILL_CATEGORIES: readonly SkillCategoryDefinition[] = [
  { name: 'research', description: 'Finding, gathering, and analyzing information' },
  { name: 'curation', description: 'Organizing, filtering, and selecting content' },
  { name: 'workflow', description: 'Multi-step processes and task automation' },
  { name: 'tool', description: 'Using specific tools and integrations' },
  { name: 'behavioral', description: 'Modifying AI tone, style, or response patterns' },
];
```

Custom category strings are accepted without error -- the five defaults are guidelines, not constraints.

Built-in skills are mapped to categories via `BUILTIN_CATEGORY_MAP`, which assigns each `builtin-N` ID to one of the five categories. For example, "Recommend something" maps to `curation`, "Help me with my research" maps to `research`.

**Utility functions:**

| Function                  | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `isDefaultCategory(name)` | Returns `true` if name is one of the five defaults |
| `DEFAULT_CATEGORY_NAMES`  | Array of just the name strings                     |
| `BUILTIN_CATEGORY_MAP`    | Record mapping builtin skill IDs to categories     |

---

## Skill Parser

`web/services/skills/skillParser.ts` (108 lines) validates SKILL.md file content using gray-matter for YAML frontmatter extraction and Zod for schema validation.

### Parse Flow

1. Input: raw SKILL.md file content (string with `---` YAML frontmatter delimiters)
2. Validate frontmatter delimiters exist
3. Extract frontmatter via `gray-matter`
4. Validate extracted data against `SkillFrontmatterSchema` (Zod schema from `types/skillSchema.ts`)
5. Return `SkillDocument` with typed `frontmatter`, `body`, `filePath`, and `fileName`

### Public API

```typescript
// Parse and validate a complete SKILL.md file
parseSkillDocument(content: string, fileName: string): ParseResult
// { success: true, data: SkillDocument } | { success: false, error: string }

// Validate raw data against the frontmatter schema (standalone)
validateSkillFrontmatter(data: unknown): ValidateResult
// { success: true, data: SkillFrontmatter } | { success: false, error: string }
```

The parser is used by both the frontend (via IPC in Electron, direct import in web) and the backend suggest route (`src/routes/suggest.ts`) to validate AI-generated skill proposals before they become `SkillV2` objects.

---

## Built-in Actions

Defined in `web/services/skills/builtinActions.ts` (1,184 lines). The coordinator registers all built-in actions on module load via `registerBuiltinActions()`.

### Action Table (30 actions)

| Action ID               | Label          | Accepts              | Produces | Description                                |
| ----------------------- | -------------- | -------------------- | -------- | ------------------------------------------ |
| `send-to-ai`            | Send to AI     | text, markdown       | text     | Send text to AI conversation               |
| `save-to-notes`         | Save to Notes  | text, markdown       | void     | Append to current note                     |
| `copy-to-clipboard`     | Copy           | text, markdown, json | void     | Copy to system clipboard                   |
| `speak-aloud`           | Speak          | text                 | void     | Read aloud via Web Speech API              |
| `open-panel`            | Open Panel     | void                 | void     | Open notes/settings/help panel             |
| `change-theme`          | Change Theme   | void                 | void     | Switch visual theme                        |
| `schedule-reminder`     | Remind Me      | text                 | void     | Set a future reminder                      |
| `bind-to-gesture`       | Bind Gesture   | void                 | void     | Bind skill to hand gesture                 |
| `toggle-grid`           | Toggle Grid    | void                 | void     | Show/hide grid overlay                     |
| `save-chat-pdf`         | Save as PDF    | void                 | void     | Export chat as PDF                         |
| `email-chat`            | Email Chat     | void                 | void     | Email chat transcript                      |
| `toggle-gamepad`        | Gamepad        | void                 | void     | Toggle gamepad mode                        |
| `toggle-side-menu`      | Side Menu      | void                 | void     | Toggle side menu panel                     |
| `open-settings`         | Settings       | void                 | void     | Open settings panel                        |
| `open-chat-history`     | Chat History   | void                 | void     | Open chat history                          |
| `toggle-voice-input`    | Voice Input    | void                 | void     | Toggle microphone                          |
| `attach-image`          | Attach Image   | void                 | void     | Open image picker                          |
| `new-chat`              | New Chat       | void                 | void     | Start fresh conversation                   |
| `save-workspace`        | Save Workspace | void                 | void     | Save current workspace state               |
| `load-workspace`        | Load Workspace | void                 | void     | Load saved workspace                       |
| `email-notes`           | Email Notes    | void                 | void     | Email current notes                        |
| `cycle-theme-forward`   | Next Theme     | void                 | void     | Cycle to next theme                        |
| `cycle-theme-backward`  | Prev Theme     | void                 | void     | Cycle to previous theme                    |
| `toggle-model-viewer`   | Model Viewer   | void                 | void     | Toggle 3D model viewer                     |
| `toggle-weather-widget` | Weather        | void                 | void     | Toggle weather widget                      |
| `send-notes-to-chat`    | Notes to Chat  | void                 | void     | Send notes content to chat                 |
| `center-input-bar`      | Center Input   | void                 | void     | Center the input bar                       |
| `toggle-hand-tracking`  | Hand Tracking  | void                 | void     | Enable/disable hand gestures               |
| `open-help-pane`        | Help           | void                 | void     | Open help pane with optional tip highlight |

All actions follow the same pattern: receive an `ExecutionPayload`, return a `Promise<ExecutionResult>`, and communicate with UI via the event bus (`useEventBus().emit()`). Actions never directly manipulate DOM or stores.

### Exported Constants

| Export                | Type                            | Purpose                                              |
| --------------------- | ------------------------------- | ---------------------------------------------------- |
| `BUILTIN_ACTIONS`     | `ActionDefinition[]`            | Array of all 30 built-in actions                     |
| `BUILTIN_ACTIONS_MAP` | `Map<string, ActionDefinition>` | Map for O(1) lookup by ID                            |
| `BUILTIN_MODIFIERS`   | `Omit<SkillV2, ...>[]`          | Array of 7 built-in modifier skills                  |
| `parseDuration(str)`  | function                        | Parse duration strings ("1h", "30m") to milliseconds |

---

## Built-in Modifiers

Seven modifier skills ship with the coordinator. Modifiers are not executed directly -- they transform adjacent pills during combination.

| ID                    | Title        | Modifies | Transform Type | Effect                                 |
| --------------------- | ------------ | -------- | -------------- | -------------------------------------- |
| `mod-voice-output`    | Speak Result | output   | custom         | Speaks result aloud via Web Speech API |
| `mod-save-result`     | Save Result  | output   | custom         | Saves result to notes                  |
| `mod-format-markdown` | As Markdown  | input    | wrap           | Wraps in markdown code block           |
| `mod-formal-tone`     | Formal Tone  | input    | append         | Appends formal tone instruction        |
| `mod-casual-tone`     | Casual Tone  | input    | append         | Appends casual tone instruction        |
| `mod-concise`         | Be Concise   | input    | append         | Appends concise instruction            |
| `mod-detailed`        | Be Detailed  | input    | append         | Appends detailed instruction           |

Each modifier defines `CombinationRules` specifying which skill types it can combine with and its preferred position (`before` or `after`).

---

## Storage and Persistence

`web/services/skills/storage.ts` (428 lines) manages skill persistence using IndexedDB as the primary store with a localStorage mirror for backwards compatibility.

### Storage Architecture

```
 PRIMARY: IndexedDB (V2 format)
 +-----------------------------------------------------------+
 |  Key: 'skills/v2'                                          |
 |  Value: {                                                  |
 |    version: 2,                                             |
 |    skills: SkillV2[],                                      |
 |    hiddenBuiltins: string[],                               |
 |    pinnedTipIds: string[],                                 |
 |    migratedAt?: number                                     |
 |  }                                                         |
 +-----------------------------------------------------------+

 MIRROR: localStorage (backwards compatibility)
 +-----------------------------------------------------------+
 |  customSkills   -> V1 format array (for legacy consumers)  |
 |  hiddenSkills   -> Array of { title } objects               |
 |  helpPinnedTips -> string[] of tip IDs                      |
 +-----------------------------------------------------------+
```

### Initialization Flow

1. Attempt to load V2 data from IndexedDB (`skills/v2` key)
2. If V2 data exists and version matches `STORAGE_VERSION`, return cached
3. If no V2 data, check localStorage for legacy V1 data
4. If legacy data found, run migration (`migrateLegacyStorageData`), save to IndexedDB
5. If no data at all, initialize empty state

The storage module uses an in-memory cache (`cachedData`) with lazy initialization via `ensureInitialized()`. Concurrent initialization calls are deduplicated via a shared promise.

### Public API

| Function            | Signature                               | Description                 |
| ------------------- | --------------------------------------- | --------------------------- |
| `loadSkills`        | `() => Promise<SkillV2[]>`              | Load all skills             |
| `saveSkills`        | `(skills) => Promise<void>`             | Save all skills             |
| `addSkill`          | `(skill) => Promise<void>`              | Add or replace a skill      |
| `updateSkill`       | `(id, updates) => Promise<void>`        | Partial update by ID        |
| `deleteSkill`       | `(id) => Promise<void>`                 | Remove by ID                |
| `getSkill`          | `(id) => Promise<SkillV2 \| undefined>` | Get single skill            |
| `getHiddenBuiltins` | `() => Promise<string[]>`               | Hidden builtin titles       |
| `hideBuiltin`       | `(title) => Promise<void>`              | Hide a builtin              |
| `showBuiltin`       | `(title) => Promise<void>`              | Show a hidden builtin       |
| `getPinnedTipIds`   | `() => Promise<string[]>`               | Pinned tip IDs              |
| `pinTip`            | `(tipId) => Promise<void>`              | Pin a tip                   |
| `unpinTip`          | `(tipId) => Promise<void>`              | Unpin a tip                 |
| `importSkills`      | `(skills, opts) => Promise<number>`     | Import with merge/replace   |
| `exportSkills`      | `(filter?) => Promise<SkillV2[]>`       | Export with optional filter |
| `clearStorage`      | `() => Promise<void>`                   | Clear all storage           |
| `reloadFromStorage` | `() => Promise<SkillStorageData>`       | Force reload                |
| `syncFromMap`       | `(map) => Promise<void>`                | Sync from coordinator's Map |
| `loadToMap`         | `() => Promise<Map<string, SkillV2>>`   | Load as Map                 |

### Persistence Rules

Only skills with `source === 'custom' | 'combined' | 'generated'` are persisted to IndexedDB. Built-in and helptip skills are defined in code and reconstructed on load. The storage module also maintains a localStorage mirror by converting V2 skills back to V1 format for any legacy code that still reads `customSkills` from localStorage.

---

## Migration (V1 to V2)

`web/services/skills/migration.ts` (342 lines) handles automatic migration from the legacy skill format used by `useSkills.ts`.

### V1 Format (Legacy)

```typescript
interface SkillV1 {
  id: string;
  title: string;
  type: 'prompt' | 'action'; // Only 2 types in V1
  value: string; // Prompt text or action ID
  source: 'builtin' | 'custom' | 'helptip';
  hidden?: boolean;
}
```

### Migration Rules

1. **Prompt skills:** `value` becomes `promptConfig.text` with `appendToInput: false`, `autoSubmit: false`
2. **Action skills:** `value` is mapped through `ACTION_ID_MAP` to resolve V2 action IDs. Examples:
   - `'open-notes'` -> `{ actionId: 'open-panel', params: { panel: 'notes' } }`
   - `'toggle-help'` -> `{ actionId: 'open-panel', params: { panel: 'help' } }`
   - `'help-tip:tipId'` -> `{ actionId: 'open-help-tip', params: { tipId } }`
3. **New metadata:** `usageCount: 0`, `lastUsed: 0`, `createdAt: Date.now()`
4. **Source normalization:** Invalid sources default to `'custom'`

### Format Detection

```typescript
isV1Format(data); // Has 'value' field, no *Config fields
isV2Format(data); // Has 'usageCount' and 'createdAt' as numbers
needsMigration(data); // Checks version field and array formats
```

### V2 to V1 Back-conversion

`convertV2ToV1()` converts V2 skills back to V1 format for the localStorage mirror. This supports legacy code that reads `customSkills` from localStorage. Chain skills become `chain:{id}`, templates use their template string, and actions reverse-map through the action ID table.

### Storage Data Types

```typescript
interface SkillStorageData {
  version: number; // STORAGE_VERSION (2)
  skills: SkillV2[];
  hiddenBuiltins: string[];
  pinnedTipIds: string[];
  migratedAt?: number;
}

interface LegacyStorageData {
  customSkills?: SkillV1[];
  hiddenBuiltins?: Array<{ title: string } | string>;
  pinnedTipIds?: string[];
}
```

---

## Skill Preferences

`web/composables/useSkillPreferences.ts` (263 lines) manages per-skill user preferences (enabled/favorited state) and provides a unified skill list combining all sources.

### Data Model

```typescript
interface SkillPreference {
  enabled: boolean; // Whether skill appears in lists
  favorited: boolean; // Whether skill appears in dock as pill
}
```

Preferences are stored in IndexedDB under `skills/preferences` key as a serialized `Map<string, SkillPreference>`.

**Defaults:** Built-in skills (`builtin-*` IDs) start enabled and favorited. All other skills start enabled but not favorited.

### Unified Skill List

The composable merges skills from three sources into a single `UnifiedSkill[]`:

1. **Built-in skills** from `useSkills().BUILTIN_SKILLS` -- enriched with category from `BUILTIN_CATEGORY_MAP`
2. **Custom skills** from `useSkills().customSkills` -- enriched with V2 metadata from coordinator if available
3. **Combined skills** from `useSkillCoordinator().listSkills({ source: 'combined' })`

### Computed Properties

| Property              | Type                          | Description                         |
| --------------------- | ----------------------------- | ----------------------------------- |
| `allSkills`           | `ComputedRef<UnifiedSkill[]>` | All skills from all sources         |
| `enabledSkills`       | `ComputedRef<UnifiedSkill[]>` | Only enabled skills                 |
| `favoritedSkills`     | `ComputedRef<UnifiedSkill[]>` | Enabled + favorited (shown in dock) |
| `enabledNotFavorited` | `ComputedRef<UnifiedSkill[]>` | Enabled but not in dock             |

### Methods

| Method                     | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `toggleEnabled(skillId)`   | Toggle enabled state; syncs with V1 `hiddenBuiltins` for builtins |
| `toggleFavorited(skillId)` | Toggle favorited state                                            |
| `getPreference(skillId)`   | Get current preference (returns defaults if not stored)           |
| `loadPreferences()`        | Load from IndexedDB (called automatically on first access)        |

---

## Contract and Invariants

### Guarantees Provided by the Coordinator

| Guarantee                | Description                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| **Singleton State**      | All `useSkillCoordinator()` calls return the same instance -- module-level refs are shared |
| **Builtin Registration** | Builtin actions and modifier skills registered on module load via `initialize()`           |
| **ID Stability**         | Skill IDs never change after creation (`updateSkill` prevents ID overwrites)               |
| **Usage Tracking**       | `usageCount` and `lastUsed` updated after every successful execution                       |
| **Storage Sync**         | Custom/combined/generated skills persisted to IndexedDB async (fire-and-forget)            |
| **Event Emission**       | All CRUD and execution operations emit corresponding events                                |
| **Handler Isolation**    | Handler errors are caught and logged via `debugWarn`; they do not break the coordinator    |
| **Context Updates**      | Time context updated every 60 seconds automatically via `setInterval`                      |

### Required Fields by Type

| Type       | Required Config  | Required Fields                                       |
| ---------- | ---------------- | ----------------------------------------------------- |
| `prompt`   | `promptConfig`   | `text: string`                                        |
| `action`   | `actionConfig`   | `actionId: string`                                    |
| `modifier` | `modifierConfig` | `modifies`, `transform`, `transformType`              |
| `template` | `templateConfig` | `template: string`, `variables: VariableDefinition[]` |
| `chain`    | `chainConfig`    | `steps: ChainStep[]`                                  |
| `trigger`  | `triggerConfig`  | `conditions`, `targetSkillId`, `enabled`              |

### Combination Constraints

| Rule                               | Value | Description                     |
| ---------------------------------- | ----- | ------------------------------- |
| Max combined skills                | 2     | `MAX_COMBINED_SKILLS` constant  |
| Combined skills cannot merge again | -     | `source === 'combined'` check   |
| Self-combination prevented         | -     | `skillA.id === skillB.id` check |

---

## Data Flow

### Skill Execution Lifecycle

```
  1. EXECUTION REQUEST
     execute(id, ctx) or drop on zone

  2. SKILL LOOKUP
     skills.value.get(id) -> SkillV2
     (if not found -> error result)

  3. CONTEXT MERGE
     mergeContext(globalContext, ctxOverride)

  4. TYPE-SPECIFIC EXECUTION
     switch(skill.type):
       'prompt'   -> executePrompt()   -> emit 'skill:prompt' via eventBus
       'action'   -> executeAction()   -> call action.handler()
       'template' -> executeTemplate() -> resolve {{vars}}, emit 'skill:prompt'
       'chain'    -> executeChain()    -> sequential step execution
       'modifier' -> (applied during combination, not direct exec)
       'trigger'  -> (reserved, returns success)

  5. UPDATE USAGE STATS
     updateSkill(id, { usageCount++, lastUsed: Date.now() })

  6. EMIT EVENT & RETURN
     emitEvent('skill:executed', { skillId, skill, result })
```

---

## Action Registry

The action registry provides an open system for registering executable behaviors.

### Registration Flow

1. `registerAction(action)` validates that `action.id` exists
2. If existing action with same ID: calls `existing.onUnregister()`
3. Creates new `Map` with action added (immutable update via `new Map(...)`)
4. Calls `action.onRegister()` if defined
5. Emits `'action:registered'` event

### Unregistration

1. `unregisterAction(actionId)` checks action exists
2. Calls `action.onUnregister()` if defined
3. Removes from map (immutable update)
4. Emits `'action:unregistered'` event

### API

```typescript
registerAction(action: ActionDefinition): void
unregisterAction(actionId: string): void
getAction(actionId: string): ActionDefinition | undefined
listActions(): ActionDefinition[]
```

---

## Zone Registry

Zones define drop targets for skill pills with magnetic attraction.

### Zone Drop Behaviors

| Zone        | Prompt Pill      | Action Pill             | Chain Pill           |
| ----------- | ---------------- | ----------------------- | -------------------- |
| Input Bar   | Send to AI       | Execute                 | Execute sequence     |
| Notes       | Save prompt text | Execute and save result | Execute and save all |
| Time Widget | Schedule prompt  | Schedule action         | Schedule chain       |
| DotMatrix   | Bind to gesture  | Bind to gesture         | Bind sequence        |
| Trash Zone  | Delete           | Delete                  | Delete               |

### Zone Helper Functions

```typescript
getZoneRect(zoneId: string): ZoneRect | null
isPointInZone(zoneId: string, point: { x, y }): boolean
distanceToZone(zoneId: string, point: { x, y }): number
findAcceptingZones(skillType: SkillType): ZoneDefinition[]
findNearestZone(point, skillType, maxRadius = 200): ZoneDefinition | null
getAllZoneRects(): Array<{ zone: ZoneDefinition; rect: ZoneRect }>
```

### API

```typescript
registerZone(zone: ZoneDefinition): void
unregisterZone(zoneId: string): void
getZone(zoneId: string): ZoneDefinition | undefined
listZones(): ZoneDefinition[]
```

---

## Execution Pipeline

### Prompt Execution

Emits `skill:prompt` event via event bus for UI to handle:

```typescript
interface PromptConfig {
  text: string;
  appendToInput?: boolean; // true = append, false = replace
  autoSubmit?: boolean; // immediately send to AI
}
```

### Action Execution

Looks up action in registry, calls `action.handler(payload, params, ctx)`:

```typescript
interface ActionConfig {
  actionId: string;
  params?: Record<string, unknown>;
}
```

### Template Execution

Resolves `{{variable}}` placeholders from context before emitting as prompt:

```typescript
interface TemplateConfig {
  template: string;
  variables: VariableDefinition[];
  autoSubmit?: boolean;
}

interface VariableDefinition {
  key: string; // Matches {{key}} in template
  source: 'context' | 'input' | 'picker' | 'computed';
  contextPath?: string; // For context source: "selection.text"
  inputLabel?: string; // For input source: prompt label
  pickerType?: string; // For picker source: type of picker
  compute?: (ctx) => unknown; // For computed source
}
```

### Chain Execution

Sequential execution with AI response waiting:

```typescript
interface ChainConfig {
  steps: ChainStep[];
  stopOnError?: boolean; // default true
  parallel?: boolean; // run steps in parallel (default false)
}

interface ChainStep {
  skillId: string;
  mode: 'execute' | 'pipe'; // pipe = pass previous output as input
  condition?: (ctx, prevResult?) => boolean;
}
```

If a step is an auto-submit prompt and there are more steps, `waitForResponseComplete()` listens for `'skill:response-complete'` on the event bus before continuing (120s timeout).

---

## Combination System

Pills can be combined by dragging them together.

### Combine Modes

| Mode     | Separator | Description                     |
| -------- | --------- | ------------------------------- |
| `chain`  | `->`      | Sequential execution (A then B) |
| `pipe`   | `\|`      | Output of A feeds into B        |
| `modify` | `+`       | Modifier wraps target           |

### Combination Algorithm

```
canCombine(skillA, skillB):
  1. Check: skillA.id !== skillB.id            (no self-combine)
  2. Check: neither source === 'combined'       (no re-combining)
  3. Check: totalSteps <= MAX_COMBINED_SKILLS   (max 2)
  4. Check skillA.combinable.canCombineWith     (explicit rules)
  5. Check skillB.combinable.canCombineWith     (reversed)
  6. Default type-based logic:
     - modifier + prompt/template/action -> 'modify'
     - prompt/template + prompt/template -> 'chain'
     - action + action -> 'chain'
     - prompt/template + action -> 'chain'
     - chain + compatible type -> 'chain'
     - else -> false
```

### Ordering Rules

`orderSkillsForCombination()` determines execution order:

1. **Modify mode:** Modifier wraps target based on `modifies` field. `output` modifier executes after target; `input` modifier executes before.
2. **Position preferences:** Check `combinable.position` (`'after'` or `'before'`).
3. **Default:** A comes before B in drop order.

### Finding Existing Combinations

`findExistingCombination(parentIds)` checks if an identical combination already exists (same parent IDs, order-independent). Returns the existing skill if found, preventing duplicate combinations.

---

## Context Management

### ExecutionContext

Full context passed to handlers and evaluators:

```typescript
interface ExecutionContext {
  selection?: SelectionState; // { text, source }
  attachments?: AttachmentState[]; // Files/images attached
  clipboard?: string; // Clipboard contents
  conversation: ConversationState; // { id, messageCount, provider, model }
  time: TimeState; // { hour, minute, dayOfWeek, date }
  activePanel: 'chat' | 'notes' | 'settings' | null;
  theme: string;
  signals: Record<string, unknown>; // Extensible custom signals
}
```

Time context is updated automatically every 60 seconds via `setInterval(updateTime, 60000)`.

### Context API

```typescript
getContext(): ExecutionContext
updateContext(updates: Partial<ExecutionContext>): void
setSignal(key: string, value: unknown): void
setThemeContext(theme: string): void
```

---

## Event System

### Available Events

```typescript
type SkillEvent =
  | 'skill:created' // After createSkill()
  | 'skill:updated' // After updateSkill()
  | 'skill:deleted' // After deleteSkill()
  | 'skill:executed' // After execute()
  | 'skill:combined' // After combine()
  | 'action:registered' // After registerAction()
  | 'action:unregistered' // After unregisterAction()
  | 'zone:registered' // After registerZone()
  | 'zone:unregistered' // After unregisterZone()
  | 'trigger:fired' // When trigger activates
  | 'trigger:enabled' // When trigger enabled
  | 'trigger:disabled' // When trigger disabled
  | 'context:updated'; // After updateContext()
```

### Subscribing to Events

```typescript
const { on } = useSkillCoordinator();

const unsubscribe = on('skill:executed', (data) => {
  console.log('Executed:', data.skillId, data.result);
});

// Cleanup
onBeforeUnmount(() => unsubscribe());
```

---

## Suggestion System / Recursive Learning Pipeline

The suggestion system observes user behavior, detects repeated patterns, scores conviction, and uses AI to generate new skill proposals. It runs as a three-layer frontend pipeline that calls the backend only for AI generation.

### Pipeline Overview

```
Event Bus                                    Backend
  |                                            |
  v                                            |
Action Observer (actionObserver.ts)            |
  records event type strings only              |
  (privacy: never records payloads)            |
  |                                            |
  v                                            |
Pattern Detector (patternDetector.ts)          |
  n-gram sequence detection                    |
  filter by age, segment, deduplicate          |
  |                                            |
  v                                            |
Suggestion Engine (suggestionEngine.ts)        |
  scoreConviction():                           |
    frequency (50%) + recency (30%)            |
    + consistency (20%) - dismissal penalty    |
  default threshold: 0.7                       |
  |                                            |
  v                                            |
useSuggestions composable (546 lines)          |
  |--- checkAndGenerate() ----POST /api/v1/suggest ---> AI generation
  |                                            |
  |<-- proposal response (validated SKILL.md) -|
  |                                            |
  v
Toast UI (SuggestionToast.vue)
  approve -> coordinator.createSkill()
  dismiss -> record + penalty
  snooze  -> delay re-presentation
```

### useSuggestions Composable

`web/composables/useSuggestions.ts` (546 lines) is the singleton orchestrator for the suggestion lifecycle.

**Singleton State:**

- `proposals: Ref<ReadonlyArray<SkillProposal>>` -- all proposals (pending, shown, approved, dismissed, snoozed)
- `dismissals: Ref<ReadonlyArray<DismissalRecord>>` -- pattern-level dismissal tracking
- `activeSuggestion: Ref<SkillProposal | null>` -- currently displayed toast

**Constants:**

| Constant                | Value  | Purpose                                                         |
| ----------------------- | ------ | --------------------------------------------------------------- |
| `AUTO_DISMISS_MS`       | 10,000 | Toast auto-dismisses after 10s (returns to pending, no penalty) |
| `MIN_TOAST_INTERVAL_MS` | 30,000 | Minimum 30s between toasts                                      |
| `SNOOZE_DEFAULT_MS`     | 7 days | Default snooze duration                                         |
| `PERSIST_DEBOUNCE_MS`   | 5,000  | Debounce interval for IndexedDB persistence                     |

**Toast Guards:** Toasts are suppressed when:

- Another suggestion is already active
- User is typing (textarea/input focused)
- AI is streaming a response
- Less than 30s since last toast

**Core Flow (`checkAndGenerate`):**

1. Get detected patterns from action observer
2. Score conviction via `scoreConviction()`
3. Filter out patterns that already have pending/approved proposals
4. Generate proposal for highest-conviction pattern via `POST /api/v1/suggest`
5. Store proposal, show toast if conditions allow

**Approval Flow (`approve`):**

1. Extract category from SKILL.md frontmatter
2. Create skill via `coordinator.createSkill()` with `source: 'generated'`
3. Add to favorites via `useSkillPreferences().toggleFavorited()`
4. Mark pattern as addressed (high dismissal count prevents re-triggering)

**Dismissal Flow (`dismiss`):**

1. Mark proposal as dismissed
2. Increment pattern dismissal count
3. Record the dismissed approach name (for "suggest something different" on retry)

**Snooze Flow (`snooze`):**

1. Set `snoozedUntil` timestamp on proposal
2. On next initialization, expired snoozed proposals are moved back to `pending`

**Public API:**

| Method                            | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `initialize()`                    | Load proposals and dismissals from IndexedDB  |
| `checkAndGenerate()`              | Run the full detection-to-generation pipeline |
| `approve(proposalId)`             | Approve proposal, create skill, add to dock   |
| `dismiss(proposalId)`             | Dismiss with penalty, record approach         |
| `snooze(proposalId, durationMs?)` | Delay re-presentation (default 7 days)        |
| `patchProposal(id, patches)`      | Update proposal fields                        |
| `showNext()`                      | Show next pending proposal as toast           |
| `destroy()`                       | Clean up timers, flush persistence            |

---

## Backend Skill Registry

`src/services/skillRegistry.ts` (397 lines) discovers, parses, indexes, and scores SKILL.md files from the filesystem.

### Data Model

```typescript
interface RegisteredSkill {
  name: string;
  category: string | string[];
  description: string;
  body: string; // Full markdown body
  bodyTokens: number; // Token count for budget calculations
  triggers: {
    keywords: string[]; // Words that activate this skill
    intent: string; // Intent description
  };
  filePath: string;
  isAgent: boolean; // true if in agents/ directory
}
```

### Registry Factory

`createSkillRegistry(skillsDir)` returns a `SkillRegistry` interface:

| Method                    | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `skills` (getter)         | All registered skills (with cache invalidation on file change) |
| `getByKeywords(words)`    | Filter skills by keyword match                                 |
| `getByCategory(category)` | Filter skills by category                                      |
| `getAgents()`             | Get agent skills only                                          |
| `getPlaybooks()`          | Get playbook skills only                                       |
| `refresh()`               | Force cache invalidation and reload                            |

### File Discovery

The registry reads all `.md` files from `src/skills/agents/` and `src/skills/playbooks/`. Each file is parsed with `gray-matter` to extract frontmatter (name, category, description, triggers) and body content.

### Cache Invalidation

File fingerprints (path, size, mtime) are collected on each access. If the fingerprint key changes, the registry reloads from disk. This ensures new or modified SKILL.md files are picked up without restarts.

### Token Estimation

Body tokens are initially estimated using a `chars / 4` fallback. The `tokenx` library is lazily loaded via dynamic import; when available, it enriches token counts asynchronously (fire-and-forget).

### Scoring Functions

```typescript
// Score a single skill by keyword match density
scoreSkillByKeywords(
  userWords: Set<string>,
  skill: RegisteredSkill,
  context: { agentCategory?: string }
): number  // 0.0 to 1.0

// Apply logarithmic usage boost with recency bonus
applyUsageBoost(
  score: number,
  skillName: string,
  usageHistory: ReadonlyArray<UsageRecord>
): number  // capped at 1.0

// Enrich usage history with pattern-derived boosts (adaptive tuning)
enrichUsageHistory(
  baseHistory: ReadonlyArray<UsageRecord>,
  patternSummaries: ReadonlyArray<ActionPatternSummary>
): ReadonlyArray<UsageRecord>
```

**Scoring algorithm:**

1. Base score = keyword match density (matches / total keywords)
2. Specificity bonus = `matchCount * 0.05`
3. Agent context bias = 30% boost when skill category matches context
4. Usage boost = `log2(count + 1) * 0.02`
5. Recency boost = `+0.05` if used within last hour
6. All capped at 1.0

---

## Backend Prompt Composer

`src/services/promptComposer.ts` (355 lines) classifies user intent, selects relevant skills, and assembles them into a token-budgeted prompt.

### Token Budget Strategy

The prompt composer allocates 10% of the provider's context window to skill content (`SKILL_BUDGET_RATIO = 0.10`). The budget is calculated per-provider from `config/capabilities.json`:

```typescript
getProviderBudget(provider: string): ProviderBudget
// { contextWindow: number, skillBudget: number }
```

Default context window: 32,768 tokens (if provider not found in config).

### Classification Pipeline

`classifyWithKeywords()` is the entry point, called from `src/utils/systemPrompt.ts`:

1. Tokenize user text into lowercase words
2. Score all registry skills via `scoreSkillByKeywords()` + `applyUsageBoost()`
3. Pinned skills get score 1.0 (always included)
4. Determine confidence level:
   - High: top score >= 0.3
   - Medium: top score >= 0.15
   - Low: below 0.15 (falls back to base relevance ranking)
5. Return `ClassificationResult` with scored skills and confidence

### Prompt Assembly

`composePrompt()` assembles the final system prompt:

1. **Core section** (outside skill budget): core prompt + tool prompt + canon/banned lists
2. **Skill packing** (greedy within budget):
   - Sort: pinned first, agents next, then by score descending
   - For each skill: if full body fits in budget, load it; else try condensed (description only); else omit
3. **Skill section**: loaded skill bodies + condensed skill summaries

Returns `ComposedPrompt` with loaded/condensed/omitted skill lists, token estimate, and budget usage percentage.

### Integration Point

The prompt composer is called by `src/utils/systemPrompt.ts` during every chat request:

```
Chat Route -> getSystemPrompt() -> classifyWithKeywords() -> composePrompt()
```

This means every chat message gets a dynamically assembled system prompt based on the user's text, with only the most relevant skills included within the token budget.

---

## Suggest API Route

`src/routes/suggest.ts` (496 lines) provides the `POST /api/v1/suggest` endpoint for AI-generated skill proposals.

### Request Schema (Zod-validated)

```typescript
{
  patterns: Array<{
    actions: string[];     // Action codes from pattern detection
    count: number;         // How many times pattern occurred
    reasoning: string;     // Why this pattern was detected
  }>;
  existingSkills: string[];         // Names of existing skills (avoid duplication)
  provider: string;                 // 'anthropic' | 'gemini' | 'openrouter'
  apiKey: string;                   // Provider API key
  model?: string;                   // Optional model override
  previouslyDismissed?: Array<{     // Approaches user already rejected
    name: string;
    summary: string;
  }>;
}
```

### Response

```typescript
{
  ok: boolean;
  proposal?: {
    skillMd: string;       // Complete SKILL.md content
    name: string;          // Extracted from frontmatter
    summary: string;       // Description from frontmatter
    reasoning: string;     // Why this skill helps
    impact: string;        // Expected improvement
  };
  error?: string;          // Error code if generation failed
}
```

### Generation Flow

1. Validate request body via Zod schema
2. Resolve provider name to handler function
3. Build user message from patterns (only action codes -- no conversation content)
4. Call provider AI with `GENERATION_PROMPT` system message
5. Parse JSON response from AI output (handles raw JSON and markdown code blocks)
6. Validate generated SKILL.md through the Zod-based skill parser
7. If validation fails: retry once with corrective guidance
8. Return structured proposal or error

### Privacy Boundary

Only action codes (e.g., `'skill:prompt'`, `'skill:send-to-ai'`) and existing skill names are sent to the AI. No conversation content, no user text, no personal data crosses this boundary.

### Provider Support

| Provider     | Default Model               | Endpoint                                |
| ------------ | --------------------------- | --------------------------------------- |
| `anthropic`  | `claude-3-5-haiku-20241022` | `api.anthropic.com/v1/messages`         |
| `gemini`     | `gemini-2.0-flash-lite`     | `generativelanguage.googleapis.com`     |
| `openrouter` | `openai/gpt-4.1-nano`       | `openrouter.ai/api/v1/chat/completions` |

---

## Configuration Reference

### Combination Constants

| Constant                    | Value         | Location                     |
| --------------------------- | ------------- | ---------------------------- |
| `MAX_COMBINED_SKILLS`       | 2             | `useSkillCoordinator.ts:831` |
| `COMBINE_SEPARATORS.chain`  | `->` (U+2192) | `useSkillCoordinator.ts:825` |
| `COMBINE_SEPARATORS.pipe`   | `\|`          | `useSkillCoordinator.ts:826` |
| `COMBINE_SEPARATORS.modify` | `+`           | `useSkillCoordinator.ts:827` |

### Zone Defaults

| Setting        | Default | Description                          |
| -------------- | ------- | ------------------------------------ |
| `magnetRadius` | 80px    | Distance for magnetic attraction     |
| `snapStrength` | 0.8     | Snap strength (0-1)                  |
| `maxRadius`    | 200px   | Maximum radius for `findNearestZone` |

### Storage Constants

| Constant          | Value         | Location                |
| ----------------- | ------------- | ----------------------- |
| `STORAGE_VERSION` | 2             | `migration.ts:27`       |
| `V2_STORAGE_KEY`  | `'skills/v2'` | `storage.ts:30`         |
| `MAX_REMINDERS`   | 100           | `builtinActions.ts:275` |

### Prompt Composer Constants

| Constant                      | Value  | Description                             |
| ----------------------------- | ------ | --------------------------------------- |
| `SKILL_BUDGET_RATIO`          | 0.10   | 10% of context window for skills        |
| `DEFAULT_CONTEXT_WINDOW`      | 32,768 | Fallback if provider not in config      |
| `FALLBACK_SKILL_COUNT`        | 3      | Skills returned on low-confidence match |
| `HIGH_CONFIDENCE_THRESHOLD`   | 0.3    | Score threshold for high confidence     |
| `MEDIUM_CONFIDENCE_THRESHOLD` | 0.15   | Score threshold for medium confidence   |

### Suggestion Constants

| Constant                | Value       | Description                              |
| ----------------------- | ----------- | ---------------------------------------- |
| `AUTO_DISMISS_MS`       | 10,000      | Toast auto-dismiss timeout               |
| `MIN_TOAST_INTERVAL_MS` | 30,000      | Minimum gap between toasts               |
| `SNOOZE_DEFAULT_MS`     | 604,800,000 | 7-day snooze duration                    |
| `PERSIST_DEBOUNCE_MS`   | 5,000       | Debounce for IndexedDB writes            |
| Conviction threshold    | 0.7         | Minimum conviction to trigger generation |

### Time Tracking

| Setting         | Value    | Description                       |
| --------------- | -------- | --------------------------------- |
| Update interval | 60,000ms | Context time updates every minute |

---

## Failure Modes

| Scenario                      | Behavior                                         | How to Detect                                |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------- |
| **Skill not found**           | `execute()` returns error result                 | `result.success === false`                   |
| **Action not found**          | `executeAction()` returns error                  | Error: "Action not found: {id}"              |
| **Missing promptConfig**      | `executePrompt()` returns error                  | Error: "Prompt skill missing text"           |
| **Missing actionConfig**      | `executeAction()` returns error                  | Error: "Action skill missing actionId"       |
| **Chain step fails**          | Chain stops if `stopOnError !== false`           | Check individual step results                |
| **Handler throws**            | Error caught, logged via `debugWarn`             | Console warning, error result returned       |
| **Zone element not found**    | `getZoneRect()` returns null                     | Zone excluded from spatial candidates        |
| **Storage write fails**       | Logged via `debugWarn`, continues                | Console warning, in-memory state still valid |
| **Event handler throws**      | Error caught, other handlers still execute       | Console warning                              |
| **Combination not allowed**   | `canCombine()` returns false                     | Check return value before `combine()`        |
| **Suggest API fails**         | Returns `{ ok: false, error }`                   | Check `error` field for cause                |
| **SKILL.md validation fails** | Suggest route retries once with correction       | Error starts with `validation_failed:`       |
| **Skill parser unavailable**  | Suggest route returns `skill_parser_unavailable` | Server startup warning logged                |
| **AI response unparseable**   | Returns `parse_failed` error                     | Raw text did not contain valid JSON          |

---

## File Reference

| File                                     | Lines | Purpose                                                   |
| ---------------------------------------- | ----- | --------------------------------------------------------- |
| `web/composables/useSkillCoordinator.ts` | 1,601 | Main coordinator singleton composable                     |
| `web/types/skills.ts`                    | 604   | All TypeScript interfaces                                 |
| `web/services/skills/builtinActions.ts`  | 1,506 | 32 builtin actions + 7 modifiers                          |
| `web/services/skills/skillCategories.ts` | 71    | Five-category taxonomy and builtin mapping                |
| `web/services/skills/skillParser.ts`     | 108   | SKILL.md parser with Zod validation                       |
| `web/services/skills/storage.ts`         | 428   | IndexedDB persistence with V1 migration                   |
| `web/services/skills/migration.ts`       | 342   | V1 to V2 format conversion                                |
| `web/composables/useSkillPreferences.ts` | 263   | Per-skill enabled/favorited preferences                   |
| `web/composables/useSuggestions.ts`      | 619   | Suggestion lifecycle orchestrator                         |
| `web/services/actionObserver.ts`         | ~200  | Action observation ring buffer                            |
| `web/services/patternDetector.ts`        | ~150  | N-gram sequence detection                                 |
| `web/services/suggestionEngine.ts`       | ~150  | Conviction scoring                                        |
| `src/services/skillRegistry.ts`          | 397   | Backend skill file registry with scoring                  |
| `src/services/promptComposer.ts`         | 355   | Token-budgeted prompt assembly                            |
| `src/routes/suggest.ts`                  | 496   | Suggest API endpoint                                      |
| `web/components/SkillsDock.vue`          | -     | Pill carousel container                                   |
| `web/composables/useSkillPhysics.ts`     | -     | Multi-zone magnetic physics (see SKILL_PHYSICS_SYSTEM.md) |

---

## Changelog

- **v1.0** - Initial coordinator implementation with action registry
- **v1.1** - Added zone registry for multi-target drops
- **v1.2** - Added pill combination system (chain/pipe/modify modes)
- **v1.3** - Added context management with time tracking
- **v1.4** - Added V1 to V2 migration and IndexedDB storage
- **v1.5** - Added builtin modifiers (7 tone/format modifiers)
- **v1.6** - Added chain execution with AI response waiting
- **v2.0** - Terminology migration: composable renamed to useSkillCoordinator, types to SkillV2
- **v2.1** - Added skill categories, parser, and preferences subsystems
- **v2.2** - Added recursive learning pipeline (actionObserver, patternDetector, suggestionEngine)
- **v2.3** - Added backend skill registry with keyword matching and usage-weighted scoring
- **v2.4** - Added prompt composer with token budgeting
- **v2.5** - Added suggest API route with retry and validation
- **v3.0** - Documentation rebuilt from code analysis

---

_Last verified: 2026-02-23_
