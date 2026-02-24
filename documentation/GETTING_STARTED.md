# Getting Started with Prvctice

> **Why this doc:** This is the entry point for new developers. It covers setup, project structure, common tasks, and links to all system documentation. Read this first when onboarding to the prvctice codebase.
>
> **Related systems:** [SKILL_COORDINATOR_SYSTEM.md](./SKILL_COORDINATOR_SYSTEM.md) | [SKILL_PHYSICS_SYSTEM.md](./SKILL_PHYSICS_SYSTEM.md) | [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md) | [CHAT_STORE_SYSTEM.md](./CHAT_STORE_SYSTEM.md) | [DOTMATRIX_SYSTEM.md](./DOTMATRIX_SYSTEM.md) | [PDF_SYSTEM.md](./PDF_SYSTEM.md) | [SPEECH_SYSTEM.md](./SPEECH_SYSTEM.md) | [THEME_SYSTEM.md](./THEME_SYSTEM.md) | [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md) | [MAGNETIC_ATTACHMENT_SYSTEM.md](./MAGNETIC_ATTACHMENT_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

A developer guide for setting up, running, and building on the prvctice codebase.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start](#2-quick-start)
3. [App Overview](#3-app-overview)
4. [Project Structure](#4-project-structure)
5. [Development Workflow](#5-development-workflow)
6. [Configuration](#6-configuration)
7. [Common Tasks](#7-common-tasks)
8. [Architecture Deep Dives](#8-architecture-deep-dives)
9. [Testing](#9-testing)
10. [Building for Production](#10-building-for-production)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

| Requirement | Version    | Check Command   |
| ----------- | ---------- | --------------- |
| Node.js     | 18+        | `node -v`       |
| npm         | 10+        | `npm -v`        |
| Git         | Any recent | `git --version` |

**Optional for desktop development:**

- macOS, Windows, or Linux for Electron builds
- Xcode Command Line Tools (macOS) for native modules

---

## 2. Quick Start

```bash
# Clone the repository
git clone https://github.com/prvctice/prvctice.git
cd prvctice

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run web:dev
```

Open <http://localhost:5173> in your browser. The backend auto-starts on port 3000.

**API Keys:** At least one LLM provider key is required. Add keys in `.env` or in-app via **Settings → API Keys**.

---

## 3. App Overview

Prvctice is an AI chat application with unique interaction modes:

### Core Features

| Feature                 | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| **Multi-Provider Chat** | Anthropic Claude, Gemini, OpenRouter, LM Studio (local)          |
| **Hand Tracking**       | Control the UI via webcam gestures (pinch to drag, fist for mic) |
| **Composable Skills**   | Drag-and-drop "pills" that combine into workflows                |
| **Floating Widgets**    | Notes editor and PDF viewer as floating panels                   |
| **Mini-Games**          | Pong, Block Breaking, Slice Master with gesture controls         |
| **Local-First Storage** | IndexedDB + OPFS, works offline                                  |

### Input Modes

The app supports multiple input sources through the Intent Coordinator:

```
┌──────────────────┐      ┌────────────────────┐      ┌──────────────┐
│  Input Sources   │      │ Intent Coordinator │      │   Targets    │
├──────────────────┤      ├────────────────────┤      ├──────────────┤
│ • Keyboard       │─────▶│ Zone Resolution    │─────▶│ • Input Bar  │
│ • Mouse/Touch    │      │ Action Routing     │      │ • Skills     │
│ • Hand Tracking  │      │                    │      │ • Widgets    │
│ • Gamepad        │      │                    │      │ • Side Menu  │
│ • Voice          │      │                    │      │ • Games      │
└──────────────────┘      └────────────────────┘      └──────────────┘
```

---

## 4. Project Structure

```
prvctice/
├── web/                    # Vue 3 frontend (TypeScript)
│   ├── components/         # Vue single-file components
│   │   ├── modals/        # Settings panes
│   │   ├── onboarding/    # First-run experience
│   │   └── skills/        # Pill/skill UI
│   ├── composables/       # Vue composition API hooks
│   ├── stores/            # Pinia state management
│   │   └── chat/          # Chat state modules
│   ├── graphics/          # Three.js particle system
│   │   └── dotmatrix/     # Hand tracking + visuals
│   ├── games/             # Mini-games
│   ├── services/          # Frontend services
│   ├── storage/           # IndexedDB/OPFS layer
│   ├── types/             # TypeScript definitions
│   └── utils/             # Utilities
│
├── src/                   # Node.js backend (TypeScript)
│   ├── routes/            # API endpoints
│   │   └── chat/          # Chat logic
│   ├── adapters/          # LLM provider adapters
│   ├── services/          # Business logic
│   ├── mcp/               # Model Context Protocol
│   └── middleware/        # Express middleware
│
├── public/                # Static assets
├── documentation/         # System architecture docs
├── electron/              # Desktop packaging
└── config/                # JSON configs
```

### Key Entry Points

| What              | Where              |
| ----------------- | ------------------ |
| Vue app bootstrap | `web/index.ts`     |
| Root component    | `web/AppShell.vue` |
| Backend server    | `src/server.ts`    |
| Electron main     | `main.js`          |

---

## 5. Development Workflow

### Available Commands

| Command               | Purpose                         |
| --------------------- | ------------------------------- |
| `npm run web:dev`     | Start Vite dev server + backend |
| `npm run desktop:dev` | Run Electron desktop app        |
| `npm run lint`        | Run ESLint                      |
| `npm run type-check`  | TypeScript validation           |
| `npm test`            | Run test suite                  |
| `npm run format`      | Prettier formatting             |

### Code Quality Checks

Before committing, always run:

```bash
npm run lint && npm run type-check
```

### Hot Module Replacement

The Vite dev server supports HMR. Most changes to Vue components and styles apply instantly without page refresh.

---

## 6. Configuration

### Environment Variables

Copy `.env.example` to `.env`. Key variables:

```bash
# Core (required for backend)
SESSION_SECRET=your-secret-here

# LLM Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
# LM Studio runs locally, no key needed

# Optional services
YOUTUBE_API_KEY=...
```

### In-App API Keys

Users can configure API keys without touching `.env`:

1. Open the app
2. Go to **Settings → API Keys**
3. Enter keys for desired providers
4. Keys are stored locally in the browser

### Config Files

| File                   | Purpose                         |
| ---------------------- | ------------------------------- |
| `config/defaults.json` | Default provider/model settings |
| `vite.config.js`       | Frontend build configuration    |
| `forge.config.js`      | Electron packaging              |
| `tsconfig.json`        | TypeScript configuration        |

---

## 7. Common Tasks

### Adding a New Vue Component

1. Create in `web/components/YourComponent.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <div class="your-component">
    <button @click="count++">{{ count }}</button>
  </div>
</template>

<style scoped>
.your-component {
  padding: 1rem;
}
</style>
```

2. Import where needed:

```vue
<script setup lang="ts">
import YourComponent from './YourComponent.vue';
</script>
```

### Adding a New Composable

Create in `web/composables/useYourFeature.ts`:

```typescript
import { ref, computed } from 'vue';

export function useYourFeature() {
  const state = ref<string>('');

  const derived = computed(() => state.value.toUpperCase());

  function doSomething(value: string) {
    state.value = value;
  }

  return {
    state,
    derived,
    doSomething,
  };
}
```

### Adding an API Endpoint

1. Create route in `src/routes/yourEndpoint.ts`:

```typescript
import { Router } from 'express';

const router = Router();

router.post('/your-endpoint', async (req, res) => {
  try {
    const { data } = req.body;
    // Handle request
    res.json({ success: true, result: data });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
```

2. Register in `src/routes/index.ts`:

```typescript
import yourEndpointRouter from './yourEndpoint.js';
router.use('/your-endpoint', yourEndpointRouter);
```

### Working with the Chat Store

The chat system uses a modular Pinia store:

```typescript
import { useChatStore } from '@/stores/chat';

const chat = useChatStore();

// Send a message
await chat.send('Hello!');

// Access messages
console.log(chat.messages);
```

### Registering an Intent Handler

Components can register as intent targets:

```typescript
import { useIntentCoordinator } from '@/composables/useIntentCoordinator';

const { registerTarget, unregisterTarget } = useIntentCoordinator();

onMounted(() => {
  registerTarget('my-widget', {
    actions: ['grab', 'tap'],
    zone: '#my-widget',
    handler: (intent) => {
      if (intent.action === 'grab') {
        // Handle grab
      }
    },
  });
});

onUnmounted(() => {
  unregisterTarget('my-widget');
});
```

---

## 8. Architecture Deep Dives

The `documentation/` folder contains detailed system documentation:

| System              | Doc File                        | Description                          |
| ------------------- | ------------------------------- | ------------------------------------ |
| Intent Coordinator  | `INTENT_COORDINATOR_SYSTEM.md`  | Input routing and zone resolution    |
| Skill Coordinator   | `SKILL_COORDINATOR_SYSTEM.md`   | Pill CRUD and execution              |
| Skill Physics       | `SKILL_PHYSICS_SYSTEM.md`       | Magnetic drag and combination        |
| Chat Store          | `CHAT_STORE_SYSTEM.md`          | Message handling and streaming       |
| Dotmatrix Graphics  | `DOTMATRIX_SYSTEM.md`           | Three.js particles and hand tracking |
| PDF System          | `PDF_SYSTEM.md`                 | PDF.js rendering and highlights      |
| Speech System       | `SPEECH_SYSTEM.md`              | Voice recognition and TTS            |
| Theme System        | `THEME_SYSTEM.md`               | CSS custom properties and theming    |
| Frame Coordinator   | `FRAME_COORDINATOR_SYSTEM.md`   | RAF loop consolidation               |
| Magnetic Attachment | `MAGNETIC_ATTACHMENT_SYSTEM.md` | Widget snapping                      |

Each doc includes:

- Architecture diagrams
- Core types and interfaces
- Data flow explanations
- Configuration reference
- Failure modes and debugging tips

---

## 9. Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --import tsx --test tests/path/to/test.ts

# Run with coverage
npm run test:coverage
```

### Test Structure

Tests use Node.js built-in test runner:

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('MyModule', () => {
  test('should do something', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

### Testing Guidelines

- Target 80% coverage, 100% for critical paths (auth, security)
- Structure: Arrange → Act → Assert
- Test happy paths, edge cases, and error paths
- Fix implementation bugs, not tests (unless test is wrong)

---

## 10. Building for Production

### Web Build

```bash
npm run web:build
```

Output goes to `dist/`. Serve with any static file server.

### Desktop Build

```bash
# Package without creating installers
npm run desktop:package

# Create installers (DMG, EXE, etc.)
npm run desktop:make
```

### Environment for Production

Set these in production:

```bash
NODE_ENV=production
SESSION_SECRET=<strong-random-secret>
# Add API keys as needed
```

---

## 11. Troubleshooting

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Node Modules Issues

```bash
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors

```bash
# Check all types
npm run type-check

# Watch mode for continuous feedback
npm run type-check:watch
```

### Native Module Errors (Electron)

```bash
# Rebuild native modules for Electron
npm run desktop:rebuild
```

### Hand Tracking Not Working

1. Ensure camera permissions are granted
2. Check browser console for MediaPipe errors
3. Try a different browser (Chrome recommended)
4. Ensure good lighting and camera angle

### Debugging Tips

- Use browser DevTools (F12) for frontend issues
- Check `src/utils/logger.js` output for backend logs
- Enable Intent Debug Overlay: look for debug toggle in Settings
- For graphics issues, check quality tier: Settings → Effects

---

## Next Steps

1. **Explore the codebase**: Start with `web/AppShell.vue` and follow the imports
2. **Try the features**: Hand tracking, voice commands, skills
3. **Read system docs**: Pick a system from [Architecture Deep Dives](#8-architecture-deep-dives)
4. **Make a change**: Start with something small in `web/components/`

For questions or issues, see:

- [README.md](../README.md) - Project overview
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [PROJECT_MAP.md](../PROJECT_MAP.md) - Complete file reference

---

_Last verified: 2026-02-23_
