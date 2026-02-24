# Contributing to Prvctice

Welcome! Prvctice is a productivity app with chat AI, notes, and visual effects. Whether you're fixing a bug, adding a feature, or extending a subsystem, this guide covers what you need to know.

---

## Development Setup

Quick start:

```bash
npm install
cp .env.example .env
npm run web:dev
```

This starts the Vite dev server on <http://localhost:5173> with the backend on port 3000.

For full setup details (prerequisites, environment variables, Electron development, troubleshooting), see [documentation/GETTING_STARTED.md](documentation/GETTING_STARTED.md).

---

## Code Style

The project follows conventions documented in [.claude/rules/coding-style.md](.claude/rules/coding-style.md). Key expectations:

- **Vue:** Composition API with `<script setup>`. Prefer `ref` over `reactive`. Clean up watchers and listeners.
- **TypeScript:** Explicit types for public APIs. Use `unknown` over `any`.
- **Small units:** Functions under 50 lines. Files under 800 lines. Single responsibility.
- **Immutability:** Create new objects (`{ ...obj, key: newValue }`) instead of mutating state.
- **Naming:** Descriptive names. Verbs for actions. Self-documenting code over comments.

Linting is configured in [.eslintrc.cjs](.eslintrc.cjs). Run before committing:

```bash
npm run lint
```

---

## Commit Convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by [commitlint](commitlint.config.cjs) via a husky pre-commit hook.

Format:

```
<type>: <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

Examples:

```
feat: add voice input adapter for gamepad
fix: prevent duplicate chat messages on reconnect
refactor: extract provider selection into composable
```

See [.claude/rules/git-workflow.md](.claude/rules/git-workflow.md) for the full workflow reference.

---

## Pull Request Process

Before submitting a PR:

```bash
npm run lint && npm run type-check
```

What a good PR looks like:

- **Focused scope** -- one logical change per PR
- **Descriptive title** -- follows commit convention (`feat: ...`, `fix: ...`)
- **Test coverage** -- new logic has tests; existing tests still pass
- **No unrelated changes** -- keep formatting fixes and refactors separate

---

## Testing

Tests use the Node.js built-in test runner. Full details in [.claude/rules/testing.md](.claude/rules/testing.md).

```bash
# Run all tests
npm test

# Run a specific test file
node --import tsx --test tests/path/to/test.ts
```

**Targets:** 80% coverage overall. 100% for auth, security, and core business logic.

**Structure:** Arrange, Act, Assert. Test happy paths, edge cases, and error paths.

**On failure:** Fix the implementation, not the test (unless the test is wrong).

---

## Extending Prvctice

The codebase has three primary extension points. Each has a step-by-step guide:

- [Adding an LLM Provider](documentation/guides/adding-llm-provider.md) -- integrate a new AI model provider
- [Creating a Skill](documentation/guides/creating-skill.md) -- build a composable skill pill
- [Adding an Input Adapter](documentation/guides/adding-input-adapter.md) -- connect a new input source to the intent coordinator

---

## Security

Security expectations are documented in [.claude/rules/security.md](.claude/rules/security.md). Key principles:

- **Input validation:** Use zod schemas for all user input
- **Output sanitization:** Use `{{ }}` template syntax, not `v-html`. When HTML is necessary, use `DOMPurify.sanitize()`
- **Secrets:** Environment variables only. Never hardcode credentials.
- **Electron:** `contextIsolation: true`, `nodeIntegration: false`. Validate IPC paths.

---

## Project Documentation

For architecture orientation, start with [documentation/CODEMAP.md](documentation/CODEMAP.md).

The full documentation index is in the [README](README.md#documentation).

---

_Last verified: 2026-02-08_
