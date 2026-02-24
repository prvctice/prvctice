# Changelog

All notable changes to Prvctice will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.14] - 2026-01-20

### Added

- Open source release preparation
- Configurable API URL via `PRVCTICE_API_URL` environment variable
- Comprehensive security policy (SECURITY.md)
- This changelog

### Changed

- API URL now defaults to `localhost:3000` for self-hosted deployments
- Packaged desktop builds use `desktop-env.json` for production URL

### Fixed

- 107 TypeScript type safety improvements (removed `any` types)
- Migration test compatibility with TypeScript codebase
- Motion preferences test storage mocking

## [1.1.0] - 2026-01 (January 2026 Release)

### Added

- **TypeScript Migration**: Full codebase migrated from JavaScript to TypeScript
- **CSS Migration**: Styles moved to Vite-bundled CSS for better optimization
- **Magnetic System**: Draggable UI elements with magnetic snap behavior
- **Workspace Save/Load**: Persist notes tabs, preferences, and conversations
- **Accessibility**: WCAG 2.1 AA compliance improvements
- **Games**: Brick breaker game with gamepad support

### Changed

- Storage unified into single facade module
- Event system migrated to typed event bus
- Rate limits tightened for security (chat 20→15 req/min)
- Settings UI reorganized with AI settings in dedicated pane

### Fixed

- Double-click background to move input bar (Chrome)
- Sphere size setting updates immediately
- YouTube API key errors now surface to user
- Theme background preserved during hand tracking and games
- Light theme support for games HUD

## [1.0.0] - 2025 (Initial Release)

### Core Features

- **Multi-Provider Chat**: OpenAI, Anthropic, Google Gemini, OpenRouter, LM Studio
- **Rich Text Editor**: TipTap-based notes with markdown support
- **Voice Interface**: Speech-to-text input and text-to-speech output
- **Image Support**: Upload, paste, drag-drop with vision analysis
- **DotMatrix Visualization**: Three.js animated background
- **Hand Tracking**: MediaPipe gesture recognition
- **Keyboard Shortcuts**: Customizable pills/shortcuts system
- **Offline-First**: IndexedDB storage with OPFS blob deduplication

### Platform Support

- Web application (Vite + Express)
- macOS desktop app (Electron)
- Windows desktop app (Electron)
- Linux desktop app (Electron)

### Integrations

- YouTube search and summaries
- Wikipedia lookups
- TMDB movie/TV information
- Mood board generation
- MCP server support

---

## Version History Summary

| Version | Date       | Highlights                                 |
| ------- | ---------- | ------------------------------------------ |
| 1.1.14  | 2026-01-20 | Open source release, configurable API URL  |
| 1.1.x   | 2026-01    | TypeScript migration, accessibility, games |
| 1.0.x   | 2025       | Initial release with all core features     |

---

_For detailed commit history, see [GitHub commits](https://github.com/prvctice/prvctice/commits/main)_
