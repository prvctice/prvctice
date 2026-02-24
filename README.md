# Prvctice

Prvctice is a one-of-a-kind research tool built for creative work.

I built Prvctice for my own work as a Creative Director and Artist. Crafted around a unique cultural knowledge base and methodology, it delivers a more thoughtful and useful approach than my old methods.

The app has it's own app SDK that builds apps for you as you work. For Desktop and web.

[View demo](https://prvctice.com/type-a) | [Learn more](https://prvctice.com) 



---

<img src="gifs/prvctice search.gif" width="100%">
<img src="gifs/prvctice search_3.gif" width="100%">


---

## At a Glance

| | |
|---|---|
| **Recursive Learning** | Observes action patterns, scores conviction, proposes new skills automatically. Privacy-first: records event types only, never content. |
| **Skill System** | 6 skill types (prompt, action, modifier, template, chain, trigger). 3 combination modes (chain, pipe, modify). 11 built-in skills across 4 agents and 7 playbooks. Drop a markdown file to add more. |
| **App SDK** | 60+ namespace SDK: storage, audio synthesis, AI completion, data connectors, charts, camera, GIF encoding, and more. 22 built-in apps. |
| **Input Sources** | Keyboard, voice, hand tracking (MediaPipe), gamepad, gesture -- all routed through a unified intent coordinator. |
| **Spatial UI** | Skill pills with spring physics, magnetic snap, drag-to-combine. Hand tracking lets you pinch and drag with your webcam. |
| **Themes** | 8 themes + custom photo backgrounds. High-contrast accessibility theme included. |
| **Graphics** | GPU-accelerated Three.js particle system with GLSL shaders, Perlin noise, and awareness states that respond to application activity. |
| **Games** | Pong, Solitare, and Brick Breaker. |
| **Editor** | TipTap rich text with markdown, PDF workspace, floating notes. |
| **Storage** | Offline-first. IndexedDB + OPFS on the client, SQLite on the server. No account required. |
| **MCP Server** | Model Context Protocol server with tools, resources, and prompts for external agent integration. Swap between any model you want (Claude, Gemini, OpenRouter, LM Studio) |

---

## Quick Start

```bash
git clone https://github.com/prvctice/prvctice.git
cd prvctice
npm install
cp .env.example .env   # Add your API keys
npm run web:dev         # http://localhost:5173
```

API keys are required. Copy `.env.example` to `.env` and add at least one provider key (Anthropic, Gemini, OpenRouter), or configure a local model with LM Studio. Keys can also be entered in-app at Settings > API Keys.

For Electron:

```bash
npm run desktop:rebuild   # Rebuild native modules after npm install
npm run desktop:dev       # Launch desktop app
```

| Command | Description |
|---|---|
| `npm run web:dev` | Dev server (Vite + backend on 5173/3000) |
| `npm run desktop:dev` | Electron dev mode |
| `npm run desktop:rebuild` | Rebuild native modules for Electron |
| `npm run desktop:make` | Build installers |
| `npm test` | Run test suite |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript validation |

---

## Documentation


### For Beginners

| Document | What You Get |
|---|---|
| [Getting Started](documentation/GETTING_STARTED.md) | Set up the project, run your first session |
| [Building Skills](documentation/guides/building-skills-with-claude.md) | Copy-paste prompts to create skills with any AI coding assistant |
| [Building Apps](documentation/guides/building-apps.md) | Create sandboxed apps with the SDK -- includes prompt examples and a decision tree |
| [Contributing](CONTRIBUTING.md) | How to contribute |

Open an AI coding assistant in the repo and ask for what you want:

```
"Create a prvctice skill for podcast curation. Put it in src/skills/playbooks/."
```
```
"Create a prvctice app that tracks my reading list with persistence."
```
```
"Add Mistral support. Follow the adding-llm-provider guide."
```
---

<img src="gifs/prvctice search_6.gif" width="100%">



### SDK Reference

The App SDK has 60+ API namespaces. Full documentation:

| Document | Description |
|---|---|
| [SDK Getting Started](documentation/sdk/getting-started.md) | Build your first app from Hello World to multi-view |
| [SDK Examples](documentation/sdk/examples.md) | 10 reference apps with architecture breakdowns and recipes |
| [SDK UIKit](documentation/sdk/uikit.md) | All `p-*` CSS classes and design tokens |
| [SDK API Reference](documentation/sdk/reference.md) | Complete method signatures for every namespace |

### Architecture (Deep Dives)

Every diagram is backed by verified code path references with file and line numbers.

| Document | Scope |
|---|---|
| [Architecture Overview](documentation/ARCHITECTURE_OVERVIEW.md) | System diagrams, request/response flow, recursive learning loop, input-to-intent resolution |
| [Codemap](documentation/CODEMAP.md) | 7 system boundaries, data ownership, key invariants |
| [Directory Structure](documentation/DIRECTORY_STRUCTURE.md) | Full codebase layout with annotations |

### System Documentation

| Document | Scope |
|---|---|
| [Skill Coordinator](documentation/SKILL_COORDINATOR_SYSTEM.md) | Skill CRUD, execution, combinations, registry, suggestion pipeline |
| [Skill Physics](documentation/SKILL_PHYSICS_SYSTEM.md) | Spring physics engine for skill pills |
| [Intent Coordinator](documentation/INTENT_COORDINATOR_SYSTEM.md) | Unified input routing across all input sources |
| [Chat Store](documentation/CHAT_STORE_SYSTEM.md) | Chat state management, streaming, message pipeline |
| [Dotmatrix](documentation/DOTMATRIX_SYSTEM.md) | Three.js particle system, GPU shaders, hand tracking integration |
| [Speech](documentation/SPEECH_SYSTEM.md) | Voice recognition (native + Web Speech API), text-to-speech |
| [PDF](documentation/PDF_SYSTEM.md) | PDF rendering and workspace |
| [Theme](documentation/THEME_SYSTEM.md) | Theme system, CSS variables |
| [Frame Coordinator](documentation/FRAME_COORDINATOR_SYSTEM.md) | RequestAnimationFrame management |
| [Magnetic Attachment](documentation/MAGNETIC_ATTACHMENT_SYSTEM.md) | Magnetic snap behavior |

### Extension Guides

| Guide | What You Build |
|---|---|
| [Adding an LLM Provider](documentation/guides/adding-llm-provider.md) | New provider adapter (3 files) |
| [Creating a Skill](documentation/guides/creating-skill.md) | New skill from a single markdown file |
| [Adding an Input Adapter](documentation/guides/adding-input-adapter.md) | New input source (MIDI, eye tracking, etc.) |

---

<img src="gifs/prvctice search_5.gif" width="100%">

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3, Pinia, TypeScript, Vite |
| Graphics | Three.js, GLSL, MediaPipe |
| Editor | TipTap |
| Desktop | Electron |
| Backend | Node.js, Express, Socket.IO |
| Storage | IndexedDB, OPFS, SQLite |

## Project Structure

```
web/              Vue 3 frontend
  adapters/       Input source adapters (gesture, voice, gamepad, hand tracking)
  composables/    57 composables (skills, intents, speech, PDF, themes, ...)
  graphics/       Three.js particle system, shaders, hand tracking
  games/          Pong, Block Breaking
  services/       Action observer, pattern detector, suggestion engine, event bus
  stores/         Pinia state management (chat, config, 8 chat submodules)
src/              Node.js backend
  adapters/       LLM provider implementations (Anthropic, Gemini, OpenRouter, LM Studio)
  skills/         11 SKILL.md files (4 agents, 7 playbooks)
  routes/         14 API endpoints
  mcp/            Model Context Protocol server
documentation/    30 docs: architecture, systems, SDK, guides
```

---

<img src="gifs/prvctice search_4.gif" width="100%">

## License

Apache 2.0 -- see [LICENSE](LICENSE).

## Author

Built by [Tim Moore](https://timmoore.xyz).

Prvctice is free, open-source, and built by one person. If it's useful to you, consider buying me a coffee.

[Buy me a coffee](https://buymeacoffee.com/timmoore)
