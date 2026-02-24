# Codemap

This document describes prvctice's system boundaries, data ownership, and key invariants. It explains what each major subsystem **does** and where its responsibilities begin and end -- not where individual files live. For the visual architecture overview, see [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md). For the physical file layout, see [DIRECTORY_STRUCTURE.md](./DIRECTORY_STRUCTURE.md).

## Bird's Eye View

prvctice is a three-tier application: a Vue 3 single-page frontend, an Express backend, and an optional Electron desktop shell. The frontend is not just a UI layer -- it contains a complete recursive learning pipeline that observes user behavior, detects repeated patterns, and proposes new skills. The backend orchestrates LLM communication through a provider adapter abstraction, manages skill definitions via a registry, and composes prompts with token budgeting. The Electron shell adds native features (speech recognition, auto-updates, file system access) without changing the web architecture.

Seven boundaries define how these systems interact. Understanding them tells you where to look, what each part owns, and what rules hold the system together.

## Boundaries

### Frontend / Backend

**What it owns:**

- The frontend owns UI state, user interactions, client-side persistence (IndexedDB/OPFS), and the entire recursive learning pipeline.
- The backend owns LLM provider communication, session management, server-side persistence (SQLite), skill file parsing, and prompt composition.

**What crosses it:**

- HTTP requests to `/api/v1/*` endpoints (chat, suggest, thread, message, upload, trial, storyboard, transcribe). Routers are mounted via `src/routes/index.ts`.
- Socket.IO events for real-time chat streaming. The server is configured in `src/socket.ts`; the client connects via `web/services/socket.ts`.
- TypeScript types in `types/` are shared at compile time only -- there is no shared runtime state.

**Key invariants:**

- The backend never pushes unsolicited data except through Socket.IO streaming responses to active requests.
- The frontend never bypasses the transport layer (`web/stores/chat/transport.ts`) for backend communication.
- Types in `types/` define the contract. Both sides must conform independently.

**Entry points:** `src/app.ts` (Express app setup), `web/stores/chat/transport.ts` (frontend HTTP/Socket.IO layer), `src/routes/index.ts` (API routing).

### LLM Provider

**What it owns:**

- Each adapter owns the translation between prvctice's internal message format and a specific provider's API (request shaping, streaming parsing, error normalization).
- `BaseAdapter` (`src/adapters/baseAdapter.ts`) owns the interface contract.
- `llmProviderFactory.ts` owns adapter selection via `createAdapter()`.

**What crosses it:**

- The chat route (`src/routes/chat/index.ts`) calls `createAdapter(provider, apiKey)` and then `adapter.streamChat()`.
- Streaming chunks flow back through Socket.IO to the frontend.

**Key invariants:**

- Adding a new LLM provider means creating one new file in `src/adapters/` that extends `BaseAdapter`, and registering the provider name in `llmProviderFactory.ts`. No other files need to change.
- Provider-specific code never leaks outside the adapter file. All provider SDKs are imported only within their adapter.
- Error normalization (`normaliseError` utility) ensures the frontend receives a consistent error shape regardless of provider.

**Entry points:** `src/adapters/baseAdapter.ts` (interface), `src/services/llmProviderFactory.ts` (factory), any adapter file (implementation).

### Skill System

This is the most architecturally complex boundary because skills exist on both sides of the frontend/backend divide, with different data models serving different purposes.

**Frontend skills** -- managed by `useSkillCoordinator` (`web/composables/useSkillCoordinator.ts`):

- Owns: UI pill rendering, drag-and-drop, execution pipeline, context management, physics-based animations.
- Data model: `SkillV2` with types `prompt | action | modifier | template | chain | trigger` (defined in `web/types/skills.ts`).
- Persisted to IndexedDB via `web/services/skills/storage.ts`.
- Categories managed by `web/services/skills/skillCategories.ts`.
- Preferences (favorites, ordering) via `web/composables/useSkillPreferences.ts`.

**Backend skills** -- managed by `createSkillRegistry()` (`src/services/skillRegistry.ts`):

- Owns: SKILL.md file parsing, keyword matching, usage-weighted scoring, and providing skills to the prompt composer.
- Data model: `RegisteredSkill` with `agents/` and `playbooks/` categories, loaded from `src/skills/`.
- Integrated into prompt composition via `src/services/promptComposer.ts` which calls `classifyWithKeywords()` and `composePrompt()`.

**Bridge -- Suggestion generation:**

- When the recursive learning pipeline produces an approved suggestion, the frontend calls `POST /api/v1/suggest` which uses AI to generate SKILL.md content.
- The result is validated through the Zod-based skill parser (`web/services/skills/skillParser.ts`).
- The frontend then creates a `SkillV2` from the parsed result via `useSkillCoordinator().createSkill()`.

**Bridge -- Usage history feedback loop:**

- The backend sends a `skills_loaded` NDJSON chunk before streaming each response (`src/routes/chat/index.ts`), listing which backend skills were selected for the system prompt.
- The frontend stores these as `loadedSkills` on the assistant message (`web/stores/chat.ts`).
- On each subsequent chat request, the frontend calls `buildSkillUsageHistory()` (`web/stores/chat.ts`) to aggregate `loadedSkills` across all messages into a `usageHistory` array (skill name, count, last-used timestamp), sent in the request body.
- The backend prompt composer calls `applyUsageBoost()` (`src/services/skillRegistry.ts`) with this usage history to boost scores for frequently and recently used skills via logarithmic usage and recency factors.
- `enrichUsageHistory()` (`src/services/skillRegistry.ts`) can further enrich the base usage history with pattern-derived boosts from the action observer, connecting the recursive learning pipeline to backend skill selection.

**Key invariants:**

- Frontend and backend skills have separate persistence. Neither reads the other's storage directly. However, skill usage data flows between them: the backend reports which skills were loaded, the frontend aggregates this into usage history, and sends it back to influence future skill selection.
- All SKILL.md content passes through the Zod parser before becoming a frontend skill.
- The backend skill registry automatically indexes all `.md` files in `src/skills/agents/` and `src/skills/playbooks/`.

**Entry points:** `web/composables/useSkillCoordinator.ts` (frontend), `src/services/skillRegistry.ts` (backend), `web/services/skills/skillParser.ts` (bridge validation).

### Recursive Learning

A three-layer pipeline that runs entirely in the frontend. Its job: observe what the user does, detect repeated patterns, and suggest new skills.

**Layer 1 -- Observation** (`web/services/actionObserver.ts`):

- Owns: an immutable ring buffer (500 max) of observed event type strings.
- Subscribes to the event bus via `bus.onAll()` and records only the event type string (e.g., `'skill:prompt'`), never the payload.
- Events are filtered through `ACTION_ALLOWLIST` (`web/types/observation.ts`), a `ReadonlySet<string>` that defines the exact boundary of what can be observed.

**Layer 2 -- Detection** (`web/services/patternDetector.ts`):

- Owns: n-gram sequence detection over the action history.
- `detectSequences()` runs the pipeline: filter by age, segment by session gaps and inactivity, deduplicate, count n-grams, filter, and sort.

**Layer 3 -- Suggestion** (`web/services/suggestionEngine.ts` + `web/composables/useSuggestions.ts`):

- `scoreConviction()` combines frequency (50%), recency (30%), and consistency (20%), minus a dismissal penalty. Default threshold: 0.7.
- When conviction passes threshold, `useSuggestions` orchestrates: calls `POST /api/v1/suggest` for AI generation, shows a toast UI (`SuggestionToast.vue`), and handles the approval flow.
- Approval calls `useSkillCoordinator().createSkill()`, completing the loop.

**What crosses layers:**

- Layer 1 feeds action strings to Layer 2.
- Layer 2 feeds detected patterns to Layer 3.
- Layer 3 crosses the frontend/backend boundary via `POST /api/v1/suggest` for AI generation.
- The approved skill crosses into the Skill System boundary.

**Key invariants:**

- Privacy: the action observer records event type strings only, never payloads. The `ACTION_ALLOWLIST` enforces this boundary.
- The conviction threshold gates AI calls, preventing noise from triggering expensive LLM requests.
- The observe-detect-score pipeline is synchronous and frontend-only. The generation step touches the backend via `POST /api/v1/suggest`. Additionally, the pipeline's output indirectly influences backend skill selection: `enrichUsageHistory()` (`src/services/skillRegistry.ts`) can enrich the usage history sent with each chat request using pattern-derived boosts from the action observer, so frequently observed action patterns increase the priority of related backend skills.

**Entry points:** `web/services/actionObserver.ts` (start here), `web/services/patternDetector.ts` (detection), `web/services/suggestionEngine.ts` (scoring), `web/composables/useSuggestions.ts` (orchestration).

### Input Adapters

**What it owns:**

- A normalization layer that converts diverse input sources (hand tracking, voice, gamepad, gesture, keyboard) into a uniform intent format.
- `createInputAdapter()` (`web/adapters/createInputAdapter.ts`) is the factory. Convenience constructors (`handTrackingAdapter()`, `voiceAdapter()`, `gamepadAdapter()`, `gestureAdapter()`, `keyboardAdapter()`) wrap it.

**What crosses it:**

- Each adapter emits intents via `useIntentCoordinator().emit()` (`web/composables/useIntentCoordinator.ts`).
- The intent coordinator resolves targets by zone (spatial, for hand tracking) or by ID (explicit, for keyboard/gamepad).
- Target handlers receive normalized intent data and perform actions (skill execution, UI interaction, etc.).

**Key invariants:**

- Adding a new input source means creating a new adapter configuration and calling `createInputAdapter()`. The intent coordinator and all target handlers work unchanged.
- Input adapters never directly manipulate the DOM or call into stores. They only emit intents.
- Zone resolution and ID resolution are the two target-matching strategies. Hand tracking uses zones; most other inputs use IDs.

**Entry points:** `web/adapters/createInputAdapter.ts` (factory), `web/composables/useIntentCoordinator.ts` (intent routing).

### Graphics

**What it owns:**

- The Three.js dotmatrix visual effect system: particle rendering, wave animations, perlin noise, shaders, pointer interaction, and hand tracking visualization.
- Self-contained in `web/graphics/dotmatrix/` with its own types, constants, and shader code.
- A shared utilities directory at `web/graphics/shared/`.

**What crosses it:**

- The frame coordinator (`web/utils/frameCoordinator.ts`) provides RAF timing. The dotmatrix subscribes via `window.frameCoordinator.subscribe()`.
- Hand tracking integration (`web/graphics/dotmatrix/handtrack.ts`) imports `useEventBus` from `web/services/eventBus` for event communication.
- Awareness states (idle, typing, listening, etc.) are set from external triggers and affect visual behavior (wave speed, particle response).

**Key invariants:**

- The graphics system does not import from Pinia stores. Its only service dependency is the event bus for hand tracking events.
- All configuration is internal (`constants.ts`, `types.ts`). External code controls behavior only through awareness state transitions and frame coordinator timing.
- The dotmatrix can be removed or replaced without affecting any business logic.

**Entry points:** `web/graphics/dotmatrix/core.ts` (renderer), `web/graphics/dotmatrix/handtrack.ts` (hand tracking bridge), `web/composables/useDotmatrixInit.ts` (Vue integration).

### Storage

**What it owns:**

- Two independent persistence layers, one per side.
- **Frontend:** IndexedDB and OPFS (Origin Private File System) via `web/storage/storage.ts`. Provides key-value (`kvGet`/`kvSet`), document (`docGet`/`docPut`/`docList`), and blob (`blobPut`/`blobGet`) storage. Skills are stored separately via `web/services/skills/storage.ts`.
- **Backend:** SQLite via `src/storage/node/sqlite.js`. Stores conversations, messages, and server-side state.

**What crosses it:**

- Nothing crosses directly. Each side manages its own persistence independently.
- The frontend and backend may store overlapping data (e.g., conversation history) but do not synchronize.
- Session state uses `express-session` with in-memory (dev) or Redis (production) stores, separate from both SQLite and IndexedDB.

**Key invariants:**

- No shared storage. The frontend never reads SQLite; the backend never reads IndexedDB.
- Frontend storage initialization must complete before the app renders (handled by `initializeStorage()`).
- Legacy storage keys are shimmed for backward compatibility (`installLegacyShim()`).

**Entry points:** `web/storage/storage.ts` (frontend), `src/storage/node/sqlite.js` (backend).

## Cross-Cutting Concerns

**Logging:** Structured JSON logs via `src/utils/logger.js`. Privacy-redacted for bug reports (`/api/bug-report`). Frontend uses `web/utils/debugLog.ts` for development logging.

**Validation:** Zod schemas in `src/schemas/` validate request bodies. `src/middleware/validate.ts` applies schemas to routes. Frontend skill content is validated through its own Zod-based parser.

**Authentication:** Session-based via `express-session` (`src/middleware/sessionConfig.ts`). Trial mode managed client-side with localStorage. Socket.IO middleware validates sessions in production.

**Rate Limiting:** Express rate-limit middleware applied globally to `/api/` and per-route for heavy endpoints. Request deduplication middleware (`src/middleware/deduplicateRequests.ts`) prevents duplicate concurrent requests.

**Error Handling:** Backend routes use try-catch with `logger.error()`. Frontend wraps async operations in try-catch with `useNotifs` for user-facing messages. Adapter errors are normalized. Circuit breaker pattern (`src/services/circuitBreaker.ts`) prevents cascading failures for external APIs.

**Security:** Helmet CSP headers (strict for web, relaxed for Electron). CORS configured via `src/middleware/corsConfig.ts`. No `eval()` or `unsafe-eval` in CSP.

## Where to Start Reading

**Adding a new LLM provider:**
Start at `src/adapters/baseAdapter.ts` to understand the interface, then look at any existing adapter (e.g., `src/adapters/anthropicAdapter.ts`) for the implementation pattern. Register the new provider in `src/services/llmProviderFactory.ts`. See the [LLM Provider boundary](#llm-provider).

**Understanding the chat flow:**
Start at `web/stores/chat.ts`, which dispatches to `web/stores/chat/transport.ts` for HTTP/Socket.IO communication. On the backend, `src/routes/chat/index.ts` receives the request, selects an adapter, and streams the response. See the [Frontend / Backend boundary](#frontend--backend).

**Creating or understanding skills:**
For frontend skills, start at `web/composables/useSkillCoordinator.ts`. For backend skills (SKILL.md files), start at `src/services/skillRegistry.ts`. For how they connect, read the bridge section under [Skill System](#skill-system).

**Understanding recursive learning:**
Start at `web/services/actionObserver.ts` and follow the pipeline through `patternDetector.ts` and `suggestionEngine.ts`. The orchestration lives in `web/composables/useSuggestions.ts`. See the [Recursive Learning boundary](#recursive-learning).

**Adding a new input source:**
Start at `web/adapters/createInputAdapter.ts` for the adapter factory, then `web/composables/useIntentCoordinator.ts` for how intents are routed to targets. See the [Input Adapters boundary](#input-adapters).

**Modifying graphics/visual effects:**
Start at `web/graphics/dotmatrix/core.ts` for the renderer. For hand tracking integration, see `web/graphics/dotmatrix/handtrack.ts`. For Vue integration, see `web/composables/useDotmatrixInit.ts`. See the [Graphics boundary](#graphics).

---

_Last verified: 2026-02-23_
