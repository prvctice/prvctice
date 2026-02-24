# Prvctice Project Map

A comprehensive guide to understanding the codebase structure and architecture.

## Overview

**Prvctice** is an AI-driven research and productivity tool combining:

- Multi-provider chat interface (OpenAI, Anthropic Claude, Google Gemini, OpenRouter, LM Studio)
- Integrated notes/markdown editor with checklists
- Rich media support (image uploads, vision analysis, image generation, speech)
- Real-time streaming responses
- Runs as both a web app (Vite) and Electron desktop application
- Model Context Protocol (MCP) server support

---

## Directory Structure

```
/prvctice
├── public/                    # Static HTML shell and assets
│   ├── index.html            # Main HTML shell
│   ├── main.ts               # Vue app bootstrap
│   ├── vendor-libs.js        # Preloaded libraries (Three.js, DOMPurify)
│   └── images/               # Static images and icons
│
├── web/                       # Vue 3 frontend application (TypeScript)
│   ├── AppShell.vue          # Root component - page structure
│   ├── adapters/             # Input source adapters (gesture, voice, gamepad)
│   ├── components/           # Vue single-file components
│   │   ├── modals/           # Settings panes and modal content
│   │   ├── onboarding/       # Onboarding flow components
│   │   ├── shortcuts/        # Pill/shortcut system components
│   │   └── ui/               # Reusable UI primitives
│   ├── stores/               # Pinia state management
│   ├── composables/          # Vue composition API helpers (speech, gamepad, shortcuts, PDF)
│   ├── games/                # Mini-games (pong, block-breaking, slice-master)
│   ├── graphics/             # Three.js graphics (dotmatrix, hand tracking)
│   │   ├── dotmatrix/        # Particle system and hand tracking
│   │   └── shared/           # Shared graphics utilities
│   ├── styles/               # CSS (Vite-bundled, tokens, components)
│   ├── themes/               # Theme CSS files
│   ├── storage/              # IndexedDB/OPFS storage layer
│   ├── services/             # Frontend API services
│   ├── bridge/               # Platform bridge utilities
│   ├── constants/            # Application constants
│   ├── utils/                # Frontend utility functions
│   └── types/                # TypeScript type definitions
│
├── src/                       # Node.js/Express backend (TypeScript)
│   ├── server.ts             # HTTP + Socket.IO entry point
│   ├── app.ts                # Express app setup
│   ├── routes/               # API endpoints (/api/v1/*)
│   ├── services/             # Business logic & integrations
│   ├── adapters/             # LLM provider streaming adapters
│   ├── mcp/                  # Model Context Protocol server
│   ├── middleware/           # Express middleware
│   └── utils/                # Server utilities
│
├── documentation/            # System architecture documentation
│   ├── INTENT_COORDINATOR_SYSTEM.md  # Intent system deep dive
│   └── DOCUMENTATION_PLAN.md         # Documentation roadmap
│
├── docs/                     # Technical docs and planning
├── electron/                 # Electron desktop packaging assets
├── main.js                   # Electron main process entry
├── preload.js                # Electron preload/context bridge
├── config/                   # JSON config files
└── dist/                     # Production build output
```

---

## Key Entry Points

| Entry Point    | File                                   | Purpose                        |
| -------------- | -------------------------------------- | ------------------------------ |
| Web App        | [public/index.html](public/index.html) | Static HTML shell, mounts Vue  |
| Vue Bootstrap  | [public/main.ts](public/main.ts)       | Initializes Vue app and stores |
| Backend Server | [src/server.ts](src/server.ts)         | HTTP + Socket.IO server        |
| Express App    | [src/app.ts](src/app.ts)               | Middleware and routing setup   |
| Electron Main  | [main.js](main.js)                     | Desktop app entry point        |

---

## Frontend Architecture (Vue 3)

### Core Components

| Component            | File                                                                               | Purpose                                 |
| -------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| AppShell             | [web/AppShell.vue](web/AppShell.vue)                                               | Root layout, global UI orchestration    |
| ChatWindow           | [web/components/ChatWindow.vue](web/components/ChatWindow.vue)                     | Renders message list                    |
| ChatHistoryModal     | [web/components/ChatHistoryModal.vue](web/components/ChatHistoryModal.vue)         | Conversation history browser            |
| InputBar             | [web/components/InputBar.vue](web/components/InputBar.vue)                         | User input, attachments, model selector |
| MessageItem          | [web/components/MessageItem.vue](web/components/MessageItem.vue)                   | Single message display                  |
| RichContent          | [web/components/RichContent.vue](web/components/RichContent.vue)                   | Rich content rendering (markdown, code) |
| UserPromptBlock      | [web/components/UserPromptBlock.vue](web/components/UserPromptBlock.vue)           | User message display block              |
| SideMenu             | [web/components/SideMenu.vue](web/components/SideMenu.vue)                         | Navigation and options                  |
| ShortcutsDock        | [web/components/ShortcutsDock.vue](web/components/ShortcutsDock.vue)               | Pills/shortcuts dock UI                 |
| WeatherTimeWidget    | [web/components/WeatherTimeWidget.vue](web/components/WeatherTimeWidget.vue)       | Weather and time display                |
| GamesModal           | [web/components/GamesModal.vue](web/components/GamesModal.vue)                     | Games launcher modal                    |
| YouTubePlayer        | [web/components/YouTubePlayer.vue](web/components/YouTubePlayer.vue)               | Embedded YouTube player                 |
| ModelViewer          | [web/components/ModelViewer.vue](web/components/ModelViewer.vue)                   | 3D model viewer                         |
| UnifiedSettingsModal | [web/components/UnifiedSettingsModal.vue](web/components/UnifiedSettingsModal.vue) | Settings dialog                         |
| IntentDebugOverlay   | [web/components/IntentDebugOverlay.vue](web/components/IntentDebugOverlay.vue)     | Debug overlay for intent system         |

### Floating Widgets

| Component           | File                                                                             | Purpose                        |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| FloatingWidget      | [web/components/FloatingWidget.vue](web/components/FloatingWidget.vue)           | Base floating widget container |
| BaseSidePanel       | [web/components/BaseSidePanel.vue](web/components/BaseSidePanel.vue)             | Reusable side panel base       |
| FloatingNotesWidget | [web/components/FloatingNotesWidget.vue](web/components/FloatingNotesWidget.vue) | Floating notes editor (TipTap) |
| FloatingPdfWidget   | [web/components/FloatingPdfWidget.vue](web/components/FloatingPdfWidget.vue)     | Floating PDF viewer            |

### Input & Attachments

| Component             | File                                                                                 | Purpose                        |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| ApiKeySetup           | [web/components/ApiKeySetup.vue](web/components/ApiKeySetup.vue)                     | API key configuration UI       |
| AttachmentPreview     | [web/components/AttachmentPreview.vue](web/components/AttachmentPreview.vue)         | File attachment preview        |
| AttachmentStrip       | [web/components/AttachmentStrip.vue](web/components/AttachmentStrip.vue)             | Attachment strip in input bar  |
| DropOverlay           | [web/components/DropOverlay.vue](web/components/DropOverlay.vue)                     | Drag-and-drop overlay          |
| HandPositionIndicator | [web/components/HandPositionIndicator.vue](web/components/HandPositionIndicator.vue) | Hand tracking position display |
| TtsToolbar            | [web/components/TtsToolbar.vue](web/components/TtsToolbar.vue)                       | Text-to-speech controls        |
| VoiceCommandsPane     | [web/components/VoiceCommandsPane.vue](web/components/VoiceCommandsPane.vue)         | Voice command reference        |

### Settings Panes

| Component       | File                                                                                   | Purpose                      |
| --------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| AIPane          | [web/components/modals/AIPane.vue](web/components/modals/AIPane.vue)                   | AI behavior settings         |
| ApiKeysPane     | [web/components/modals/ApiKeysPane.vue](web/components/modals/ApiKeysPane.vue)         | API key management           |
| AppearancePane  | [web/components/modals/AppearancePane.vue](web/components/modals/AppearancePane.vue)   | Visual appearance settings   |
| EffectsPane     | [web/components/modals/EffectsPane.vue](web/components/modals/EffectsPane.vue)         | Visual effects configuration |
| KeysPane        | [web/components/modals/KeysPane.vue](web/components/modals/KeysPane.vue)               | Keyboard bindings            |
| ModelPane       | [web/components/modals/ModelPane.vue](web/components/modals/ModelPane.vue)             | Model selection settings     |
| PreferencesPane | [web/components/modals/PreferencesPane.vue](web/components/modals/PreferencesPane.vue) | General preferences          |
| ShortcutsPane   | [web/components/modals/ShortcutsPane.vue](web/components/modals/ShortcutsPane.vue)     | Pill shortcuts management    |
| SystemPane      | [web/components/modals/SystemPane.vue](web/components/modals/SystemPane.vue)           | System information           |
| ThemePane       | [web/components/modals/ThemePane.vue](web/components/modals/ThemePane.vue)             | Single theme customization   |
| ThemesPane      | [web/components/modals/ThemesPane.vue](web/components/modals/ThemesPane.vue)           | Theme selection              |

### Onboarding Components

| Component       | File                                                                                           | Purpose                      |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| OnboardingToast | [web/components/onboarding/OnboardingToast.vue](web/components/onboarding/OnboardingToast.vue) | Onboarding step toasts       |
| SessionTimer    | [web/components/onboarding/SessionTimer.vue](web/components/onboarding/SessionTimer.vue)       | Trial session timer          |
| SessionToast    | [web/components/onboarding/SessionToast.vue](web/components/onboarding/SessionToast.vue)       | Session status notifications |
| UnlockPrompt    | [web/components/onboarding/UnlockPrompt.vue](web/components/onboarding/UnlockPrompt.vue)       | API key unlock prompt        |
| UnlockSuccess   | [web/components/onboarding/UnlockSuccess.vue](web/components/onboarding/UnlockSuccess.vue)     | Successful unlock feedback   |

### State Management (Pinia)

| Store               | File                                                               | Purpose                              |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Chat Store          | [web/stores/chat.ts](web/stores/chat.ts)                           | Main chat state, messages, streaming |
| Provider Module     | [web/stores/chat/provider.ts](web/stores/chat/provider.ts)         | Provider/model selection             |
| Transport Module    | [web/stores/chat/transport.ts](web/stores/chat/transport.ts)       | Socket.IO & fetch handling           |
| Conversation Module | [web/stores/chat/conversation.ts](web/stores/chat/conversation.ts) | Conversation management              |
| Config Store        | [web/stores/config.ts](web/stores/config.ts)                       | App configuration                    |
| Image Modal Store   | [web/stores/imageModal.ts](web/stores/imageModal.ts)               | Image carousel state                 |
| Menu Action Store   | [web/stores/menuAction.ts](web/stores/menuAction.ts)               | Menu action state                    |

### Key Composables

| Composable             | File                                                                                   | Purpose                                         |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| useSpeech              | [web/composables/useSpeech.ts](web/composables/useSpeech.ts)                           | Speech recognition, voice commands, TTS         |
| useGamepad             | [web/composables/useGamepad.ts](web/composables/useGamepad.ts)                         | Controller/gamepad input handling               |
| useTheme               | [web/composables/useTheme.ts](web/composables/useTheme.ts)                             | Theme management                                |
| useShortcuts           | [web/composables/useShortcuts.ts](web/composables/useShortcuts.ts)                     | Legacy pill system                              |
| useShortcutCoordinator | [web/composables/useShortcutCoordinator.ts](web/composables/useShortcutCoordinator.ts) | V2 shortcuts central hub                        |
| useShortcutPhysics     | [web/composables/useShortcutPhysics.ts](web/composables/useShortcutPhysics.ts)         | Magnetic drag + pill combination                |
| useShortcutAnimations  | [web/composables/useShortcutAnimations.ts](web/composables/useShortcutAnimations.ts)   | Pill animation effects                          |
| useMotion              | [web/composables/useMotion.ts](web/composables/useMotion.ts)                           | Reduced motion detection, CSS timing            |
| useSessionGate         | [web/composables/useSessionGate.ts](web/composables/useSessionGate.ts)                 | API key validation                              |
| useIntentCoordinator   | [web/composables/useIntentCoordinator.ts](web/composables/useIntentCoordinator.ts)     | Input→action routing (gesture, voice, keyboard) |
| useDotmatrixInit       | [web/composables/useDotmatrixInit.ts](web/composables/useDotmatrixInit.ts)             | Dotmatrix graphics initialization               |
| useQualityTier         | [web/composables/useQualityTier.ts](web/composables/useQualityTier.ts)                 | Graphics quality tier detection                 |
| useOnboarding          | [web/composables/useOnboarding.ts](web/composables/useOnboarding.ts)                   | Onboarding flow state                           |
| useOnboardingToasts    | [web/composables/useOnboardingToasts.ts](web/composables/useOnboardingToasts.ts)       | Onboarding toast notifications                  |
| useOnboardingPulse     | [web/composables/useOnboardingPulse.ts](web/composables/useOnboardingPulse.ts)         | Pulsing attention effects                       |
| useFirstRun            | [web/composables/useFirstRun.ts](web/composables/useFirstRun.ts)                       | First-run experience detection                  |
| useFileAttachments     | [web/composables/useFileAttachments.ts](web/composables/useFileAttachments.ts)         | File upload handling                            |
| useDropTarget          | [web/composables/useDropTarget.ts](web/composables/useDropTarget.ts)                   | Drag-and-drop zones                             |
| useBarGestures         | [web/composables/useBarGestures.ts](web/composables/useBarGestures.ts)                 | Input bar gesture handling                      |
| useNotesEditor         | [web/composables/useNotesEditor.ts](web/composables/useNotesEditor.ts)                 | TipTap editor integration                       |
| useNotesTabs           | [web/composables/useNotesTabs.ts](web/composables/useNotesTabs.ts)                     | Notes tab management                            |
| useWeatherTime         | [web/composables/useWeatherTime.ts](web/composables/useWeatherTime.ts)                 | Weather/time widget state                       |
| usePillColors          | [web/composables/usePillColors.ts](web/composables/usePillColors.ts)                   | Dynamic pill color generation                   |
| useSideMenu            | [web/composables/useSideMenu.ts](web/composables/useSideMenu.ts)                       | Side menu state                                 |
| useSidePanel           | [web/composables/useSidePanel.ts](web/composables/useSidePanel.ts)                     | Side panel state management                     |
| useModal               | [web/composables/useModal.ts](web/composables/useModal.ts)                             | Modal dialog management                         |
| useNotifs              | [web/composables/useNotifs.ts](web/composables/useNotifs.ts)                           | Notification system                             |
| useCustomThemePhoto    | [web/composables/useCustomThemePhoto.ts](web/composables/useCustomThemePhoto.ts)       | Custom theme background images                  |
| useYouTubePlayer       | [web/composables/useYouTubePlayer.ts](web/composables/useYouTubePlayer.ts)             | YouTube embed control                           |
| useGamesModal          | [web/composables/useGamesModal.ts](web/composables/useGamesModal.ts)                   | Games modal state                               |
| useChatHistoryUi       | [web/composables/useChatHistoryUi.ts](web/composables/useChatHistoryUi.ts)             | Chat history UI state                           |
| useInputBarClamp       | [web/composables/useInputBarClamp.ts](web/composables/useInputBarClamp.ts)             | Input bar position clamping                     |
| useRippleEffect        | [web/composables/useRippleEffect.ts](web/composables/useRippleEffect.ts)               | Touch ripple effect                             |

### PDF System Composables

| Composable            | File                                                                                 | Purpose                         |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| usePdfRenderer        | [web/composables/usePdfRenderer.ts](web/composables/usePdfRenderer.ts)               | PDF.js rendering pipeline       |
| usePdfNavigation      | [web/composables/usePdfNavigation.ts](web/composables/usePdfNavigation.ts)           | PDF page navigation             |
| usePdfChatIntegration | [web/composables/usePdfChatIntegration.ts](web/composables/usePdfChatIntegration.ts) | PDF content to chat integration |
| usePdfHighlights      | [web/composables/usePdfHighlights.ts](web/composables/usePdfHighlights.ts)           | PDF text highlighting           |

### Floating Widget Composables

| Composable            | File                                                                                 | Purpose                        |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| useFloatingWidget     | [web/composables/useFloatingWidget.ts](web/composables/useFloatingWidget.ts)         | Floating widget positioning    |
| useMagneticAttachment | [web/composables/useMagneticAttachment.ts](web/composables/useMagneticAttachment.ts) | Magnetic snap attachment       |
| useMagneticConfig     | [web/composables/useMagneticConfig.ts](web/composables/useMagneticConfig.ts)         | Magnetic physics configuration |

### Storage Layer

| File                                             | Purpose                                      |
| ------------------------------------------------ | -------------------------------------------- |
| [web/storage/storage.ts](web/storage/storage.ts) | Unified storage interface (IndexedDB + OPFS) |

### Graphics System

Three.js-based graphics and MediaPipe hand tracking.

| File                                                                           | Purpose                             |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| [web/graphics/dotmatrix/index.ts](web/graphics/dotmatrix/index.ts)             | Dotmatrix module exports            |
| [web/graphics/dotmatrix/core.ts](web/graphics/dotmatrix/core.ts)               | Main dotmatrix animation system     |
| [web/graphics/dotmatrix/handtrack.ts](web/graphics/dotmatrix/handtrack.ts)     | MediaPipe hand tracking integration |
| [web/graphics/dotmatrix/shaders.ts](web/graphics/dotmatrix/shaders.ts)         | Custom GLSL shaders                 |
| [web/graphics/dotmatrix/constants.ts](web/graphics/dotmatrix/constants.ts)     | Animation constants and config      |
| [web/graphics/dotmatrix/perlin.ts](web/graphics/dotmatrix/perlin.ts)           | Perlin noise generation             |
| [web/graphics/dotmatrix/pointerGate.ts](web/graphics/dotmatrix/pointerGate.ts) | Pointer event filtering             |
| [web/graphics/dotmatrix/types.ts](web/graphics/dotmatrix/types.ts)             | Graphics type definitions           |

### Input Adapters

| File                                                                     | Purpose                           |
| ------------------------------------------------------------------------ | --------------------------------- |
| [web/adapters/createInputAdapter.ts](web/adapters/createInputAdapter.ts) | Factory for input source adapters |

### Shortcuts System (V2)

The evolved shortcuts/pills system with context awareness and combinable actions.

| File                                                                                     | Purpose                        |
| ---------------------------------------------------------------------------------------- | ------------------------------ |
| [web/types/shortcuts.ts](web/types/shortcuts.ts)                                         | TypeScript interfaces          |
| [web/services/shortcuts/builtinActions.ts](web/services/shortcuts/builtinActions.ts)     | Built-in actions and modifiers |
| [web/services/shortcuts/storage.ts](web/services/shortcuts/storage.ts)                   | IndexedDB persistence          |
| [web/services/shortcuts/migration.ts](web/services/shortcuts/migration.ts)               | V1→V2 format migration         |
| [web/components/shortcuts/ZoneHighlight.vue](web/components/shortcuts/ZoneHighlight.vue) | Drop zone indicators           |
| [web/components/shortcuts/MergePreview.vue](web/components/shortcuts/MergePreview.vue)   | Pill combination preview       |
| [web/components/shortcuts/CombinedPill.vue](web/components/shortcuts/CombinedPill.vue)   | Merged pill display            |

### Games System

Mini-games accessible via the games modal.

| Game           | Files                                                  | Description                       |
| -------------- | ------------------------------------------------------ | --------------------------------- |
| Pong           | [web/games/pong/](web/games/pong/)                     | Classic pong with paddle controls |
| Block Breaking | [web/games/block-breaking/](web/games/block-breaking/) | Breakout-style brick breaker      |
| Slice Master   | [web/games/slice-master/](web/games/slice-master/)     | Fruit ninja-style slicing game    |

Shared utilities in [web/games/shared/](web/games/shared/): easing, haptics, particles, shake effects.

---

## Backend Architecture (Node.js/Express)

### API Routes

| Route                   | File                                                 | Purpose                          |
| ----------------------- | ---------------------------------------------------- | -------------------------------- |
| POST /api/v1/chat       | [src/routes/chat/](src/routes/chat/)                 | Main chat endpoint (streaming)   |
| POST /api/v1/dispatch   | [src/routes/dispatch.ts](src/routes/dispatch.ts)     | Request classification & routing |
| /api/v1/thread/\*       | [src/routes/thread.ts](src/routes/thread.ts)         | Conversation management          |
| /api/v1/message/\*      | [src/routes/message.ts](src/routes/message.ts)       | Message operations               |
| POST /api/v1/upload     | [src/routes/upload.ts](src/routes/upload.ts)         | File upload handling             |
| POST /api/v1/transcribe | [src/routes/transcribe.ts](src/routes/transcribe.ts) | Audio transcription              |

### Chat Logic

| File                                                           | Purpose            |
| -------------------------------------------------------------- | ------------------ |
| [src/routes/chat/index.ts](src/routes/chat/index.ts)           | Core chat logic    |
| [src/routes/chat/streaming.ts](src/routes/chat/streaming.ts)   | Stream handling    |
| [src/routes/chat/tools.ts](src/routes/chat/tools.ts)           | Tool execution     |
| [src/routes/chat/validation.ts](src/routes/chat/validation.ts) | Request validation |

### LLM Provider Adapters

| Adapter    | File                                                                             | Provider              |
| ---------- | -------------------------------------------------------------------------------- | --------------------- |
| OpenAI     | [src/adapters/openaiResponsesAdapter.ts](src/adapters/openaiResponsesAdapter.ts) | OpenAI GPT models     |
| Anthropic  | [src/adapters/anthropicAdapter.ts](src/adapters/anthropicAdapter.ts)             | Claude models         |
| Gemini     | [src/adapters/geminiAdapter.ts](src/adapters/geminiAdapter.ts)                   | Google Gemini         |
| OpenRouter | [src/adapters/openrouterAdapter.ts](src/adapters/openrouterAdapter.ts)           | OpenRouter aggregator |
| LM Studio  | [src/adapters/lmstudioAdapter.ts](src/adapters/lmstudioAdapter.ts)               | Local LM Studio       |

### Services

| Service               | File                                                                       | Purpose                      |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| LLM Factory           | [src/services/llmProviderFactory.ts](src/services/llmProviderFactory.ts)   | Creates provider adapters    |
| Intent Classifier     | [src/services/intentClassifier.ts](src/services/intentClassifier.ts)       | Classifies request type      |
| Request Router        | [src/services/requestRouter.ts](src/services/requestRouter.ts)             | Routes based on intent       |
| Assistant Service     | [src/services/assistantService.ts](src/services/assistantService.ts)       | Core assistant logic         |
| Vision Service        | [src/services/visionService.ts](src/services/visionService.ts)             | Image analysis               |
| OpenAI Client         | [src/services/openaiClient.ts](src/services/openaiClient.ts)               | OpenAI API wrapper           |
| YouTube Service       | [src/services/youtubeService.ts](src/services/youtubeService.ts)           | YouTube search               |
| Wikipedia Service     | [src/services/wikipediaService.ts](src/services/wikipediaService.ts)       | Wikipedia search             |
| TMDB Service          | [src/services/tmdbService.ts](src/services/tmdbService.ts)                 | Movie database search        |
| Discogs Service       | [src/services/discogsService.ts](src/services/discogsService.ts)           | Music database search        |
| Tumblr Service        | [src/services/tumblrService.ts](src/services/tumblrService.ts)             | Tumblr integration           |
| Mood Board Service    | [src/services/moodBoardService.ts](src/services/moodBoardService.ts)       | Mood board generation        |
| Art Institute Service | [src/services/artInstituteService.ts](src/services/artInstituteService.ts) | Art Institute of Chicago API |
| Met Museum Service    | [src/services/metMuseumService.ts](src/services/metMuseumService.ts)       | Metropolitan Museum API      |
| Europeana Service     | [src/services/europeanaService.ts](src/services/europeanaService.ts)       | Europeana collections API    |

### MCP Server

| File                                       | Purpose                |
| ------------------------------------------ | ---------------------- |
| [src/mcp/index.ts](src/mcp/index.ts)       | WebSocket server setup |
| [src/mcp/session.ts](src/mcp/session.ts)   | Session handling       |
| [src/mcp/manifest.ts](src/mcp/manifest.ts) | Discovery metadata     |

---

## Data Flow

### Chat Request Flow

```
User Input (InputBar.vue)
    │
    ▼
Pinia Chat Store (web/stores/chat.ts)
    │ - Normalize images to base64
    │ - Assemble request
    │
    ▼
Transport Layer (web/stores/chat/transport.ts)
    │ - POST to /api/v1/chat or /api/v1/dispatch
    │
    ▼
Express Backend
    │
    ├─► Intent Classifier → Routes vision/image requests
    │
    ▼
Chat Handler (src/routes/chat/index.ts)
    │ - Get provider keys
    │ - Create adapter
    │
    ▼
LLM Adapter (src/adapters/*.ts)
    │ - Call provider SDK
    │ - Stream response
    │
    ▼
Tool Execution (if needed)
    │ - youtube_search, wikipedia_search, save_note
    │
    ▼
Streaming Response → Pinia Store → ChatWindow.vue
```

### Intent System

The intent system decouples input sources from UI targets, enabling gesture, voice, keyboard, and gamepad inputs to control various components through a unified routing layer.

```
Input Sources                    Intent Coordinator                    Targets
─────────────                    ─────────────────                    ───────
Hand gestures ─┐                 ┌─────────────────┐                 ┌─ InputBar
Voice commands ├──► emit() ───► │ Zone resolution │ ───► handler ──►├─ TimeWidget
Keyboard input ─┤                │ History logging │                 ├─ DotMatrix
Gamepad input ──┘                └─────────────────┘                 └─ SideMenu
```

| File                                                                               | Purpose                             |
| ---------------------------------------------------------------------------------- | ----------------------------------- |
| [web/composables/useIntentCoordinator.ts](web/composables/useIntentCoordinator.ts) | Central intent hub, zone resolution |
| [web/components/IntentDebugOverlay.vue](web/components/IntentDebugOverlay.vue)     | Visual debugger for zones & history |
| [web/graphics/dotmatrix/handtrack.ts](web/graphics/dotmatrix/handtrack.ts)         | MediaPipe hand tracking → intents   |
| [web/composables/useGamepad.ts](web/composables/useGamepad.ts)                     | Gamepad/controller input → intents  |

**Key concepts:**

- **Targets** register with zones (screen regions) and supported actions
- **Intents** include action type, source, optional position, and value
- Spatial intents resolve to the nearest target zone supporting that action
- Non-spatial intents can specify an explicit target ID

---

## Configuration

| File                                         | Purpose                         |
| -------------------------------------------- | ------------------------------- |
| [config/defaults.json](config/defaults.json) | Default provider/model settings |
| [src/config/index.ts](src/config/index.ts)   | Backend runtime config          |
| [vite.config.js](vite.config.js)             | Frontend build config           |
| [forge.config.js](forge.config.js)           | Electron packaging config       |
| .env                                         | Environment secrets (API keys)  |

---

## Key Technologies

### Frontend

- **Vue 3** - UI framework
- **Pinia** - State management
- **Vite 7** - Build tool
- **TypeScript** - Type safety (fully migrated)
- **TipTap** - Rich text editor
- **Three.js** - 3D graphics (dot matrix, particles)
- **MediaPipe** - Hand tracking & gesture recognition
- **Motion One** - Animation library
- **Web Gamepad API** - Controller input (PS5, Xbox, etc.)
- **Socket.IO Client** - Real-time communication

### Desktop

- **Electron 39** - Desktop shell
- **Electron Forge** - Build & packaging
- **electron-updater** - Auto-update support

### Backend

- **Node.js + TypeScript** - Fully typed backend
- **Express** - HTTP server
- **Socket.IO** - WebSocket server
- **Helmet** - Security headers
- **express-rate-limit** - Rate limiting

### AI Providers

- **openai** - OpenAI SDK
- **@anthropic-ai/sdk** - Anthropic Claude
- **@google/generative-ai** - Google Gemini
- **@openrouter/sdk** - OpenRouter

---

## Available Tools

Tools the AI can execute during chat:

| Tool             | Service          | Purpose                |
| ---------------- | ---------------- | ---------------------- |
| youtube_search   | youtubeService   | Search YouTube videos  |
| wikipedia_search | wikipediaService | Search Wikipedia       |
| save_note        | storage          | Save text to notes     |
| batch_tools      | -                | Execute multiple tools |

---

## Build Commands

```bash
# Development
npm run web:dev          # Vite dev server + backend
npm run desktop:dev      # Electron development

# Production
npm run web:build        # Build web assets
npm run desktop:make     # Create Electron installers

# Quality
npm run lint             # ESLint
npm run format           # Prettier
npm test                 # Run tests
```

---

## Frontend Utilities

| File                                                           | Purpose                        |
| -------------------------------------------------------------- | ------------------------------ |
| [web/utils/frameCoordinator.ts](web/utils/frameCoordinator.ts) | Central RAF loop consolidation |
| [web/utils/magnet.ts](web/utils/magnet.ts)                     | Magnetic snap utilities        |
| [web/utils/liquidMerge.ts](web/utils/liquidMerge.ts)           | Liquid merge visual effect     |
| [web/utils/shimmer.ts](web/utils/shimmer.ts)                   | Shimmer effect utilities       |
| [web/utils/visuals.ts](web/utils/visuals.ts)                   | Visual helper functions        |
| [web/utils/modalMotion.ts](web/utils/modalMotion.ts)           | Modal animation utilities      |
| [web/utils/debugLog.ts](web/utils/debugLog.ts)                 | Debug logging utilities        |
| [web/utils/iosViewport.ts](web/utils/iosViewport.ts)           | iOS viewport handling          |
| [web/utils/customOverlay.ts](web/utils/customOverlay.ts)       | Custom overlay utilities       |

---

## Quick Reference: Where to Find Things

| Looking for...             | Location                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Chat UI components         | [web/components/](web/components/)                                                                                       |
| Chat state management      | [web/stores/chat/](web/stores/chat/)                                                                                     |
| API endpoints              | [src/routes/](src/routes/)                                                                                               |
| LLM provider code          | [src/adapters/](src/adapters/)                                                                                           |
| External API integrations  | [src/services/](src/services/)                                                                                           |
| System prompts             | [src/services/systemInstructions.md](src/services/systemInstructions.md)                                                 |
| Tool definitions           | [src/services/toolInstructions.md](src/services/toolInstructions.md)                                                     |
| Styles/CSS                 | [web/styles/](web/styles/)                                                                                               |
| Theme CSS                  | [web/themes/](web/themes/)                                                                                               |
| Dot matrix graphics        | [web/graphics/dotmatrix/](web/graphics/dotmatrix/)                                                                       |
| Hand tracking & gestures   | [web/graphics/dotmatrix/handtrack.ts](web/graphics/dotmatrix/handtrack.ts)                                               |
| Gamepad/controller input   | [web/composables/useGamepad.ts](web/composables/useGamepad.ts)                                                           |
| Speech recognition & TTS   | [web/composables/useSpeech.ts](web/composables/useSpeech.ts)                                                             |
| Settings modal             | [web/components/UnifiedSettingsModal.vue](web/components/UnifiedSettingsModal.vue)                                       |
| Settings panes             | [web/components/modals/](web/components/modals/)                                                                         |
| Onboarding flow            | [web/components/onboarding/](web/components/onboarding/)                                                                 |
| Games                      | [web/games/](web/games/)                                                                                                 |
| Intent system              | [web/composables/useIntentCoordinator.ts](web/composables/useIntentCoordinator.ts)                                       |
| Intent system docs         | [documentation/INTENT_COORDINATOR_SYSTEM.md](documentation/INTENT_COORDINATOR_SYSTEM.md)                                 |
| Shortcuts V2 system        | [web/services/shortcuts/](web/services/shortcuts/)                                                                       |
| Motion/animation utilities | [web/composables/useMotion.ts](web/composables/useMotion.ts)                                                             |
| Graphics quality           | [web/composables/useQualityTier.ts](web/composables/useQualityTier.ts)                                                   |
| Storage layer              | [web/storage/storage.ts](web/storage/storage.ts)                                                                         |
| TypeScript types           | [web/types/](web/types/)                                                                                                 |
| About/help content         | [web/components/AboutPane.vue](web/components/AboutPane.vue), [web/components/HelpPane.vue](web/components/HelpPane.vue) |
| PDF viewer                 | [web/composables/usePdfRenderer.ts](web/composables/usePdfRenderer.ts)                                                   |
| Floating widgets           | [web/composables/useFloatingWidget.ts](web/composables/useFloatingWidget.ts)                                             |
| Magnetic attachment        | [web/composables/useMagneticAttachment.ts](web/composables/useMagneticAttachment.ts)                                     |
