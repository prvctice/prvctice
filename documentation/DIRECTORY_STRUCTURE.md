# Directory Structure

An overview of prvctice's codebase layout with brief purpose annotations. For conceptual understanding of what these directories contain and how they relate, see [CODEMAP.md](./CODEMAP.md).

## Top-Level Layout

```
prvctice/
├── web/                  # Vue 3 frontend application
├── src/                  # Express backend (TypeScript)
├── types/                # Shared TypeScript type definitions
├── public/               # Static assets (HTML shell, fonts, images, 3D models)
├── electron/             # Electron packaging configuration (icons, entitlements)
├── tests/                # Backend and integration test suites
├── documentation/        # System documentation (this file lives here)
├── config/               # Runtime configuration (capabilities, defaults)
├── scripts/              # Build and utility scripts
├── archive/              # Archived/deprecated code
├── main.js               # Electron main process entry point
├── preload.js            # Electron preload script (IPC bridge)
├── package.json          # Dependencies, scripts, metadata
├── vite.config.js        # Vite bundler configuration
├── forge.config.js       # Electron Forge packaging configuration
├── tsconfig.json         # TypeScript compiler options
├── postcss.config.cjs    # PostCSS configuration
├── commitlint.config.cjs # Commit message linting
└── .env.example          # Environment variable template
```

## Frontend (`web/`)

```
web/
├── index.ts              # SPA bootstrap and Vue app mount
├── AppShell.vue          # Root component (layout shell)
├── vite-env.d.ts         # Vite type declarations
│
├── components/           # Vue Single File Components
│   ├── ChatWindow.vue    #   Main chat interface
│   ├── InputBar.vue      #   Message input with attachments
│   ├── SkillsDock.vue    #   Skill pills dock
│   ├── SuggestionToast.vue #  Recursive learning suggestion UI
│   ├── SideMenu.vue      #   Navigation sidebar
│   ├── chat/             #   Chat-specific components
│   ├── modals/           #   Settings panes (AI, themes, keys, etc.)
│   ├── onboarding/       #   First-run and session gating
│   ├── skills/           #   Skill combination and zone UI
│   └── ui/               #   Base components (button, input, toggle, skeleton)
│
├── composables/          # Composition API logic (use*.ts)
│   ├── useSkillCoordinator.ts    # Skill lifecycle and execution
│   ├── useSkillPhysics.ts        # Physics-based skill animations
│   ├── useSkillAnimations.ts     # Skill visual transitions
│   ├── useSkillPreferences.ts    # User skill preferences
│   ├── useSuggestions.ts         # Recursive learning orchestration
│   ├── useIntentCoordinator.ts   # Input intent routing
│   ├── useFileAttachments.ts     # File upload handling
│   ├── useSessionGate.ts         # Trial/session management
│   ├── useTheme.ts               # Theme switching
│   ├── useSpeech.ts              # Speech recognition
│   ├── useDotmatrixInit.ts       # Graphics initialization
│   └── ...                       # (47 composables total)
│
├── stores/               # Pinia state management
│   ├── chat.ts           #   Chat state (messages, threads, provider)
│   ├── chat/             #   Chat store submodules
│   │   ├── transport.ts  #     HTTP/Socket.IO communication
│   │   ├── streaming.ts  #     Response streaming handling
│   │   ├── conversation.ts #   Conversation management
│   │   ├── provider.ts   #     Provider/model selection
│   │   └── ...           #     (9 submodules)
│   ├── config.ts         #   App configuration state
│   ├── imageModal.ts     #   Image carousel state
│   └── menuAction.ts     #   Menu action state
│
├── services/             # Frontend services and business logic
│   ├── actionObserver.ts #   Recursive learning: action observation
│   ├── patternDetector.ts #  Recursive learning: pattern detection
│   ├── suggestionEngine.ts # Recursive learning: conviction scoring
│   ├── eventBus.ts       #   Application-wide event bus
│   ├── socket.ts         #   Socket.IO client connection
│   ├── workspace.ts      #   Workspace management
│   ├── api.ts            #   HTTP API client
│   ├── pdf.ts            #   PDF rendering service
│   └── skills/           #   Skill system services
│       ├── skillParser.ts    # SKILL.md Zod parser
│       ├── skillCategories.ts # Skill categorization
│       ├── storage.ts        # IndexedDB skill persistence
│       ├── migration.ts      # Skill data migration
│       └── builtinActions.ts # Built-in skill actions
│
├── adapters/             # Input source adapters
│   └── createInputAdapter.ts # Factory for hand/voice/gamepad/gesture/keyboard
│
├── graphics/             # Three.js visual effects
│   ├── dotmatrix/        #   Dotmatrix particle system
│   │   ├── core.ts       #     Main renderer
│   │   ├── handtrack.ts  #     Hand tracking integration
│   │   ├── shaders.ts    #     WebGL shaders
│   │   ├── perlin.ts     #     Perlin noise generation
│   │   └── ...           #     (8 files)
│   └── shared/           #   Shared graphics utilities
│
├── games/                # Embedded mini-games
│   ├── pong/             #   Pong game
│   ├── block-breaking/   #   Block-breaking game
│   ├── slice-master/     #   Slice-master game
│   └── shared/           #   Shared game utilities
│
├── storage/              # Client-side persistence
│   └── storage.ts        #   IndexedDB/OPFS abstraction (kv, doc, blob)
│
├── styles/               # CSS and themes
│   ├── main.css          #   Global stylesheet entry
│   ├── tokens.css        #   Design tokens
│   ├── base/             #   Base/reset styles
│   ├── components/       #   Component-specific styles
│   ├── layout/           #   Layout styles
│   ├── utilities/        #   Utility classes
│   └── ...               #   (26 style files/directories)
│
├── themes/               # Theme CSS files
│   ├── light-theme.css, night-theme.css, eva-theme.css, ...
│   └── THEMES.md         #   Theme documentation
│
├── types/                # Frontend-specific TypeScript types
│   ├── skills.ts         #   SkillV2, SkillType definitions
│   ├── observation.ts    #   ACTION_ALLOWLIST, observation types
│   ├── suggestions.ts    #   Suggestion pipeline types
│   ├── events.ts         #   Event bus types
│   └── ...               #   (13 type files)
│
├── utils/                # Frontend utilities
│   ├── frameCoordinator.ts # RequestAnimationFrame management
│   ├── chatErrors.ts     #   Error formatting
│   ├── debugLog.ts       #   Development logging
│   └── ...               #   (12 utility files)
│
├── bridge/               # Electron/web bridge abstraction
├── config/               # Frontend app settings
├── constants/            # Frontend constants (storage keys)
├── data/                 # Static data (help tips)
├── directives/           # Vue custom directives (magnetic snap)
├── extensions/           # TipTap editor extensions
├── plugin/               # Vue plugin registration
├── sw/                   # Service worker registration
└── workers/              # Web Workers (hashing)
```

## Backend (`src/`)

```
src/
├── server.ts             # HTTP server entry point (binds port)
├── app.ts                # Express application configuration
├── socket.ts             # Socket.IO server setup
├── ipc.ts                # Electron IPC handler definitions
│
├── routes/               # API endpoint definitions
│   ├── index.ts          #   Versioned API root (/api/v1/*)
│   ├── chat/             #   Chat endpoints (streaming, message send)
│   │   └── index.ts      #     Main chat route
│   ├── suggest.ts        #   AI skill suggestion generation
│   ├── thread.ts         #   Conversation thread management
│   ├── message.ts        #   Message CRUD
│   ├── upload.ts         #   File upload handling
│   ├── trial.ts          #   Trial/session management
│   ├── config.ts         #   Runtime configuration endpoint
│   ├── storyboard.ts     #   Storyboard generation
│   ├── transcribe.ts     #   Audio transcription
│   ├── dispatch.ts       #   Intent dispatch endpoint
│   ├── files.ts          #   File serving
│   ├── bugReport.ts      #   Bug report submission
│   ├── lmstudio.ts       #   LM Studio proxy
│   └── openrouter.ts     #   OpenRouter model listing
│
├── services/             # Business logic and API integrations
│   ├── skillRegistry.ts       # SKILL.md file registry with keyword matching
│   ├── promptComposer.ts      # Token-budgeted prompt composition
│   ├── llmProviderFactory.ts  # LLM adapter factory
│   ├── providerCaller.ts      # Unified LLM provider caller
│   ├── circuitBreaker.ts      # External API resilience
│   └── ...                    # Search services (art, books, films, music, mood board)
│
├── adapters/             # LLM provider adapters
│   ├── baseAdapter.ts         # Abstract adapter interface
│   ├── anthropicAdapter.ts    # Anthropic Claude
│   ├── geminiAdapter.ts       # Google Gemini
│   ├── openrouterAdapter.ts   # OpenRouter
│   └── lmstudioAdapter.ts     # LM Studio (local)
│
├── middleware/            # Express middleware
│   ├── corsConfig.ts     #   CORS configuration
│   ├── sessionConfig.ts  #   Session management
│   ├── validate.ts       #   Zod schema validation
│   └── deduplicateRequests.ts # Request deduplication
│
├── mcp/                  # Model Context Protocol
│   ├── index.ts          #   MCP WebSocket server
│   ├── session.ts        #   MCP session management
│   └── manifest.ts       #   MCP tool manifest
│
├── tools/                # MCP tool definitions
│   └── index.ts          #   Tool implementations for LLMs
│
├── storage/              # Server-side persistence
│   └── node/
│       └── sqlite.js     #   SQLite wrapper
│
├── skills/               # SKILL.md definitions
│   ├── agents/           #   Agent skill files (curator, editor, producer, researcher)
│   └── playbooks/        #   Playbook skill files (research, film, music, image, moodboard)
│
├── schemas/              # Zod validation schemas
│   └── chatSchema.ts     #   Chat request validation
│
├── config/               # Backend configuration
│   ├── defaults.ts       #   Default settings
│   ├── index.ts          #   Configuration loader
│   └── capabilities.json #   Feature capabilities
│
├── utils/                # Backend utilities
│   ├── logger.js         #   Structured JSON logging
│   ├── errors.ts         #   Error types
│   ├── apiKey.ts         #   API key management
│   ├── systemPrompt.ts   #   System prompt construction
│   └── ...               #   (16 utility files)
│
└── docs/                 # Internal backend documentation
```

## Shared Types (`types/`)

```
types/
├── chat.d.ts             # Chat message and conversation types
├── adapters.d.ts         # LLM adapter interfaces
├── socket-events.d.ts    # Socket.IO event definitions
├── stores.d.ts           # Pinia store types
├── config.d.ts           # Configuration types
├── services.d.ts         # Service interfaces
├── express.d.ts          # Express request extensions
├── vue-shims.d.ts        # Vue SFC type declarations
└── index.d.ts            # Aggregated type exports
```

## Configuration and Build

| File                    | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `package.json`          | Dependencies, scripts, project metadata              |
| `vite.config.js`        | Frontend build configuration, path aliases, proxy    |
| `forge.config.js`       | Electron Forge packaging (makers, publishers)        |
| `tsconfig.json`         | TypeScript compiler options                          |
| `postcss.config.cjs`    | PostCSS plugins                                      |
| `commitlint.config.cjs` | Commit message format enforcement                    |
| `binding.gyp`           | Native addon build configuration (speech recognizer) |
| `.env.example`          | Environment variable template                        |
| `banned.example.json`   | Content filtering example config                     |
| `canon.example.json`    | System prompt customization example                  |

## Special Directories

These directories are generated at build or runtime and are **not committed** to the repository:

| Directory       | Generated By        | Purpose                                      |
| --------------- | ------------------- | -------------------------------------------- |
| `dist/`         | `npm run web:build` | Vite production build output                 |
| `out/`          | `npm run make`      | Electron packaging output                    |
| `build/`        | `node-gyp rebuild`  | Native addon compilation (speech recognizer) |
| `node_modules/` | `npm install`       | NPM dependencies                             |
| `blobs/`        | Runtime             | User-uploaded files (images, PDFs)           |
| `uploads/`      | Runtime             | Legacy upload storage                        |
| `coverage/`     | `npm test`          | Test coverage reports                        |
| `logs/`         | Runtime             | Application log files                        |
| `docs/`         | Build               | Generated documentation output               |

---

_Last verified: 2026-02-23_
