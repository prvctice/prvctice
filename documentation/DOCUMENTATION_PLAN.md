# System Documentation Plan

> **Why this doc:** This is the meta-tracker for all system documentation. It lists every documented system, tracks completion status, and provides the documentation template. Read this to understand what is documented, what needs updating, and how to write a new system doc.
>
> **Related systems:** [SKILL_COORDINATOR_SYSTEM.md](./SKILL_COORDINATOR_SYSTEM.md) | [SKILL_PHYSICS_SYSTEM.md](./SKILL_PHYSICS_SYSTEM.md) | [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md) | [CHAT_STORE_SYSTEM.md](./CHAT_STORE_SYSTEM.md) | [DOTMATRIX_SYSTEM.md](./DOTMATRIX_SYSTEM.md) | [PDF_SYSTEM.md](./PDF_SYSTEM.md) | [SPEECH_SYSTEM.md](./SPEECH_SYSTEM.md) | [THEME_SYSTEM.md](./THEME_SYSTEM.md) | [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md) | [MAGNETIC_ATTACHMENT_SYSTEM.md](./MAGNETIC_ATTACHMENT_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

This plan tracks the creation of comprehensive system documentation for prvctice's core architectural components. Each system should follow the template established by [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md).

---

## Documentation Template

Each system doc should include:

1. **System Architecture** - ASCII diagram showing components and data flow
2. **Core Concepts** - Key types/interfaces with code blocks
3. **Contract and Invariants** - Guarantees, required fields, canonical data shapes
4. **Data Flow** - Step-by-step lifecycle diagram
5. **Algorithm Details** - Non-obvious logic with visual examples
6. **Configuration Reference** - All thresholds/settings with source locations
7. **Failure Modes** - What happens when things break + debugging checklist
8. **Code Examples** - Real usage patterns from the codebase
9. **File Reference** - All related files with purposes
10. **Reference Mapping** - Doc claims → source file line numbers
11. **Changelog** - Version history

---

## Progress Tracker

| Priority | System                    | Status   | Doc File                          | Assignee | Notes                            |
| -------- | ------------------------- | -------- | --------------------------------- | -------- | -------------------------------- |
| 1        | Skill Coordinator         | COMPLETE | `SKILL_COORDINATOR_SYSTEM.md`     | Claude   | 1,227 lines, 12 source files     |
| 2        | **Dotmatrix Graphics**    | COMPLETE | `DOTMATRIX_SYSTEM.md`             | Claude   | 6,190 lines, Three.js + shaders  |
| 3        | Chat Store Architecture   | COMPLETE | `CHAT_STORE_SYSTEM.md`            | Claude   | 12 modules, ~3100 lines          |
| 4        | Skill Physics             | COMPLETE | `SKILL_PHYSICS_SYSTEM.md`         | Claude   | 922 lines, spring physics        |
| 5        | PDF System                | COMPLETE | `PDF_SYSTEM.md`                   | Claude   | 4 composables + types + service  |
| 6        | Magnetic Attachment       | COMPLETE | `MAGNETIC_ATTACHMENT_SYSTEM.md`   | Claude   | RAF-based, 3 files               |
| 7        | Speech/Voice              | COMPLETE | `SPEECH_SYSTEM.md`                | Claude   | Dual-path (Electron/browser)     |
| 8        | Frame Coordinator         | COMPLETE | `FRAME_COORDINATOR_SYSTEM.md`     | Claude   | Small but critical               |
| 9        | Theme System              | COMPLETE | `THEME_SYSTEM.md`                 | Claude   | 785 lines, CSS variables         |
| —        | Intent Coordinator        | COMPLETE | `INTENT_COORDINATOR_SYSTEM.md`    |          | Reference implementation         |
| —        | Suggestion Engine         | COMPLETE | `SKILL_COORDINATOR_SYSTEM.md` §18 | Claude   | Covered in Skill Coordinator doc |
| —        | Skill Registry (Backend)  | COMPLETE | `SKILL_COORDINATOR_SYSTEM.md` §19 | Claude   | Covered in Skill Coordinator doc |
| —        | Prompt Composer (Backend) | COMPLETE | `SKILL_COORDINATOR_SYSTEM.md` §20 | Claude   | Covered in Skill Coordinator doc |
| —        | Getting Started           | COMPLETE | `GETTING_STARTED.md`              | Claude   | Developer onboarding guide       |

---

## System Details

### 1. Skill Coordinator System

**Source Files:**

- `web/composables/useSkillCoordinator.ts` - Main coordinator
- `web/types/skills.ts` - Type definitions
- `web/services/skills/skillParser.ts` - Skill parsing
- `web/services/skills/builtinActions.ts` - Built-in actions
- `web/services/skills/storage.ts` - Persistence layer
- `web/services/skills/migration.ts` - V1-to-V2 migration
- `web/composables/useSkillPreferences.ts` - Skill preferences
- `web/services/suggestionEngine.ts` - Suggestion engine
- `src/services/skillRegistry.ts` - Backend skill registry
- `src/services/promptComposer.ts` - Prompt composer
- `src/routes/suggest.ts` - Suggest API route

**Key Concepts to Document:**

- Action registry (register/unregister custom actions)
- Zone registry for multi-target drop zones
- Skill CRUD with persistent storage
- Execution pipeline with beforeExecute/afterExecute hooks
- Combination system (chain/pipe/modify modes)
- Context management (time, selection, theme, custom signals)
- Ordering rules for combinations

**Non-Obvious Behavior:**

- How combination ordering affects execution
- Context resolution priority
- Storage sync timing

**Verification Commands:**

```bash
# Find all usages
grep -r "useSkillCoordinator" web/ --include="*.ts" --include="*.vue"

# Count exports
grep -E "^export (const|function|interface|type)" web/composables/useSkillCoordinator.ts | wc -l
```

---

### 2. Dotmatrix Graphics System

**Source Files:**

- `web/graphics/dotmatrix/core.ts` (2,837 lines) - Main Three.js animation system
- `web/graphics/dotmatrix/handtrack.ts` (1,905 lines) - MediaPipe hand tracking
- `web/graphics/dotmatrix/constants.ts` (572 lines) - Config templates, presets
- `web/graphics/dotmatrix/shaders.ts` (665 lines) - WebGL/GLSL shaders
- `web/graphics/dotmatrix/pointerGate.ts` (226 lines) - Pointer input handling
- `web/graphics/dotmatrix/perlin.ts` (191 lines) - Perlin noise generation
- `web/graphics/dotmatrix/types.ts` (53 lines) - Type definitions
- `web/graphics/dotmatrix/index.ts` (55 lines) - Public API

**Key Concepts to Document:**

- Three.js scene setup and particle system
- Shader pipeline (vertex/fragment shaders)
- Awareness states and atmosphere presets
- Hand tracking integration with MediaPipe
- Pointer input gating and coordination
- Animation loop and performance optimization
- Configuration system (templates, state modifiers)

**Non-Obvious Behavior:**

- How awareness states affect particle behavior
- Shader uniform updates and timing
- Hand tracking coordinate transformation (camera → screen → normalized)
- Perlin noise texture generation and usage
- Integration with frameCoordinator priority system

**Verification Commands:**

```bash
# Find all usages
grep -r "getDotMatrixSystem\|initDotMatrix" web/ --include="*.ts" --include="*.vue"

# Check shader exports
grep "export" web/graphics/dotmatrix/shaders.ts
```

---

### 3. Chat Store Architecture

**Source Files:**

- `web/stores/chat.ts` - Main Pinia store
- `web/stores/chat/provider.ts` - API key/model selection
- `web/stores/chat/images.ts` - Image processing
- `web/stores/chat/utils.ts` - Common helpers
- `web/stores/chat/transport.ts` - Socket/fetch handling
- `web/stores/chat/conversation.ts` - Conversation CRUD
- `web/stores/chat/streaming.ts` - Stream response processing
- `web/stores/chat/gameLauncher.ts` - Game detection
- `web/stores/chat/imageProcessing.ts` - Image conversion
- `web/stores/chat/dispatchers/` - Provider-specific request builders

**Key Concepts to Document:**

- Module dependency graph
- Provider dispatch patterns (OpenAI vs generic)
- Stream handling with tool progress
- Image caching and URL revocation
- Conversation persistence strategy

**Non-Obvious Behavior:**

- Why dispatchers are split by provider type
- Image cache lifecycle and cleanup timing
- Stream reconnection logic

---

### 4. Skill Physics System

**Source Files:**

- `web/composables/useSkillPhysics.ts`
- `web/composables/useMagneticConfig.ts` - Shared thresholds

**Key Concepts to Document:**

- Spring physics model (stiffness, damping)
- State machine: idle → dragging → snapping → attached
- Pill combination detection (proximity algorithm)
- Snap-to-zone mechanics
- Merge preview rendering

**Non-Obvious Behavior:**

- How spring constants affect feel
- Merger detection radius vs snap radius
- RAF integration with frameCoordinator

---

### 5. PDF System

**Source Files:**

- `web/composables/usePdfRenderer.ts` (682 lines)
- `web/composables/usePdfNavigation.ts` (363 lines)
- `web/composables/usePdfChatIntegration.ts` (300 lines)
- `web/composables/usePdfHighlights.ts` (378 lines)

**Key Concepts to Document:**

- PDF.js worker setup and management
- Canvas rendering pipeline
- Text layer synchronization
- Zoom modes (fit-width, fit-page, percentage)
- Highlight coordinate transformation (screen → PDF page)
- Chat integration flow

**Non-Obvious Behavior:**

- Worker initialization timing
- Text layer vs canvas alignment
- Highlight persistence across zoom changes

---

### 6. Magnetic Attachment System

**Source Files:**

- `web/composables/useMagneticAttachment.ts` (~300 lines)
- `web/utils/magnet.ts` - Core magnet utilities
- `web/utils/frameCoordinator.ts` - RAF loop manager

**Key Concepts to Document:**

- RAF-based continuous position enforcement
- Multi-edge attachment (top/bottom)
- Integration with intent coordinator
- Spring-based smooth motion

**Non-Obvious Behavior:**

- Why RAF is needed (prevents drift during widget movement)
- Edge priority when multiple edges are valid
- frameCoordinator priority levels

---

### 7. Speech/Voice System

**Source Files:**

- `web/composables/useSpeech.ts` (1,285 lines)

**Key Concepts to Document:**

- Web Speech API usage
- Electron native bridge
- Audio context and visualizer integration
- Voice command handling
- Interim results processing
- Error recovery

**Non-Obvious Behavior:**

- Dual-path detection (how it chooses Electron vs browser)
- Audio context lifecycle (when it's created/destroyed)
- Fallback chain when recognition fails

---

### 8. Frame Coordinator

**Source Files:**

- `web/utils/frameCoordinator.ts` (~150 lines)

**Key Concepts to Document:**

- Central RAF loop consolidation
- Priority levels: TRACKING → PHYSICS → RENDER
- Delta time calculation with clamping
- Subscriber enable/disable pattern

**Non-Obvious Behavior:**

- Why priority order matters
- Delta time clamping values and why
- What happens if a subscriber blocks

---

### 9. Theme System

**Source Files:**

- `web/composables/useTheme.ts` (315 lines) - Main theme composable
- `web/composables/useCustomThemePhoto.ts` (219 lines) - Custom photo backgrounds
- `web/components/modals/ThemesPane.vue` (211 lines) - Theme selection UI
- `web/components/modals/ThemePane.vue` (40 lines) - Individual theme display

**Key Concepts to Document:**

- Light/dark/custom theme modes
- CSS custom property injection
- Pinia store integration
- LocalStorage persistence
- Custom photo background handling
- Theme switching transitions

**Non-Obvious Behavior:**

- How CSS variables are injected at runtime
- Custom photo URL lifecycle and cleanup
- Theme persistence across sessions
- Integration with system preference detection

**Verification Commands:**

```bash
# Find all usages
grep -r "useTheme" web/ --include="*.ts" --include="*.vue"

# Check CSS variable definitions
grep -r "--.*:" web/composables/useTheme.ts
```

---

## How to Use This Plan

### Starting a New Documentation Session

Give this prompt to a new Claude session:

```
I'm working on system documentation for prvctice. Read the documentation plan at:
documentation/DOCUMENTATION_PLAN.md

Then read the reference implementation:
documentation/INTENT_COORDINATOR_SYSTEM.md

I want to work on [SYSTEM NAME]. Please:
1. Read all the source files listed for that system
2. Draft the documentation following the template
3. Verify line numbers in the Reference Mapping section
4. Update the Progress Tracker when complete
```

### Marking Progress

Update the Progress Tracker table:

- `NOT STARTED` → `IN PROGRESS` when beginning
- `IN PROGRESS` → `REVIEW` when draft is complete
- `REVIEW` → `COMPLETE` after verification

### Quality Checklist

Before marking COMPLETE, verify:

- [ ] All source files read and referenced
- [ ] ASCII diagrams render correctly
- [ ] Code examples are from actual codebase (not invented)
- [ ] Line numbers in Reference Mapping are accurate
- [ ] Failure modes tested or verified from code
- [ ] No claims contradict actual implementation

---

## Estimated Effort

| System                 | Complexity | Est. Time |
| ---------------------- | ---------- | --------- |
| Skill Coordinator      | Very High  | 2-3 hours |
| **Dotmatrix Graphics** | Very High  | 3-4 hours |
| Chat Store             | High       | 2-3 hours |
| Skill Physics          | Very High  | 2 hours   |
| PDF System             | High       | 1.5 hours |
| Magnetic Attachment    | Medium     | 1 hour    |
| Speech/Voice           | High       | 1.5 hours |
| Frame Coordinator      | Low        | 30 min    |
| Theme System           | Low        | 45 min    |

---

## Changelog

- **2025-01-25** - Getting Started guide created (developer onboarding, setup, common tasks)
- **2025-01-25** - Magnetic Attachment System documentation completed (11 sections, RAF-based enforcement, dual implementation)
- **2025-01-25** - Frame Coordinator documentation completed (11 sections, priority system, delta time clamping)
- **2025-01-25** - Theme System documentation completed (14 sections, aliases, custom photos, DOM manipulation)
- **2025-01-25** - PDF System documentation completed (14 sections, rendering pipeline, coordinate systems, highlight storage)
- **2025-01-25** - Dotmatrix Graphics System documentation completed (13 sections, architecture diagrams, shader pipeline, hand tracking)
- **2025-01-25** - Added Theme System to plan (785 lines, 4 files)

- **2025-01-25** - Skill Physics System documentation completed
- **2025-01-25** - Chat Store Architecture documentation completed
- **2025-01-25** - Speech/Voice System documentation completed
- **2025-01-25** - Added Dotmatrix Graphics System to plan (6,190 lines, 8 files)
- **2025-01-25** - Skill Coordinator documentation completed
- **2025-01-24** - Initial plan created based on codebase analysis

---

_Last verified: 2026-02-23_
