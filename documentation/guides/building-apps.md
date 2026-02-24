# Building Apps

A guide for creating prvctice apps using an AI coding assistant.

## What is a prvctice App?

A prvctice app is a sandboxed HTML page that runs inside an iframe. It communicates with the host through the `window.prvctice` bridge SDK, which provides access to data connectors, storage, UI components, audio, AI completion, and more.

Key constraints: ES5 syntax only (`var`, `function()`, `.then()`), no `eval()`, no external script tags, transparent background.

## Prompt Examples

Copy-paste these prompts to create apps quickly.

### Simple: A single-screen data display

```
Create a prvctice app that shows the current weather with temperature, humidity,
and wind speed. Use prvctice.weather.current() for data and prvctice.ui.dataView()
for loading/error states. Add prvctice.refresh.start(600000) for auto-refresh.

Read documentation/sdk/getting-started.md and documentation/sdk/reference.md for
the API. Put the HTML file in src/prompts/templates/. Use p-* CSS classes for
styling, ES5 syntax, and prvctice.onReady() lifecycle.
```

### Medium: An interactive tool with persistence

```
Create a prvctice app for tracking a reading list. Features: add books by title,
mark as read/unread, delete entries, persist to prvctice.storage. Use
prvctice.ui.form() for the add form, event delegation for the list, and
prvctice.ui.toast() for feedback.

Read documentation/sdk/getting-started.md, documentation/sdk/examples.md (see
Bookmark List and Recipes sections), and documentation/sdk/reference.md. Put the
HTML in src/prompts/templates/. Use ES5 syntax and p-* CSS classes.
```

### Advanced: A multi-view app with audio

```
Create a prvctice app that's an ambient sound mixer. Three views via
prvctice.ui.router(): a sound library grid, a mixer view with volume sliders,
and a presets view. Use prvctice.audio.tone() for oscillator-based ambient
layers, prvctice.ui.form() with slider fields for volume controls, and
prvctice.storage for saving presets.

Read documentation/sdk/getting-started.md (especially Section 7: Navigation),
documentation/sdk/examples.md (see Music Studio and Album Player), and
documentation/sdk/reference.md. Put the HTML in src/prompts/templates/.
Remember: ES5 only, onReady/onDispose lifecycle, transparent background.
```

## Decision Tree

What kind of app are you building?

**Static display** (clock, stats, weather) -- Use data connectors + auto-refresh. No router needed. Reference: Weather Card, Clock.

**Interactive tool** (timer, list, editor) -- Use forms, storage, event delegation. Single view with controls. Reference: Study Timer, Bookmark List, Canvas Editor.

**Multi-view app** (player, manager, game with menus) -- Use `prvctice.ui.router()` with `data-view` attributes. Reference: Album Player.

**Canvas game** (arcade, drawing, visualization) -- Use `prvctice.ui.canvas()` with RAF game loop. Data structures per frame, not retained graphics. Reference: Asteroid Dodge.

**Audio app** (synth, recorder, player) -- Use `prvctice.audio.tone()` for synthesis, `prvctice.ui.audioRecorder()` for recording, `prvctice.ui.oscilloscope()` for visualization. Reference: Music Studio, Voice Recorder.

## Available APIs (Summary)

The full reference is at `documentation/sdk/reference.md`. Key namespaces:

| Namespace            | What it provides                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prvctice.storage`   | Per-app key-value persistence (`get`, `set`, `delete`, `usage`)                                                                                                                   |
| `prvctice.ui`        | Components: router, form, tabs, stepper, timer, clock, canvas, toast, confirm, dataView, sparkline, barChart, dropzone, audioRecorder, mediaPlayer, oscilloscope, knob, fader, timeline, animateEntrance |
| `prvctice.animate`   | Spring-based animation (`xsnappy`, `snappy`, `standard`, `gentle`, `bouncy` presets)                                                                                              |
| `prvctice.audio`     | Tone synthesis, sequence playback, recording, WAV encoding                                                                                                                        |
| `prvctice.ai`        | AI completion (`complete`, `stream`)                                                                                                                                              |
| `prvctice.weather`   | Current weather with auto-geolocation                                                                                                                                             |
| `prvctice.news`      | News headlines by category                                                                                                                                                        |
| `prvctice.sports`    | Live scores and standings                                                                                                                                                         |
| `prvctice.markets`   | Stock/crypto market data                                                                                                                                                          |
| `prvctice.wikipedia` | Wikipedia article search and summaries                                                                                                                                            |
| `prvctice.books`     | Book search (Open Library)                                                                                                                                                        |
| `prvctice.movies`    | Movie search (TMDB)                                                                                                                                                               |
| `prvctice.music`     | Music search (Discogs)                                                                                                                                                            |
| `prvctice.art`       | Art search (Met, Art Institute Chicago)                                                                                                                                           |
| `prvctice.youtube`   | YouTube video search                                                                                                                                                              |
| `prvctice.web`       | Proxied URL fetch                                                                                                                                                                 |
| `prvctice.refresh`   | Manual and polling refresh                                                                                                                                                        |
| `prvctice.media`     | File download                                                                                                                                                                     |
| `prvctice.broadcast` | Inter-app messaging                                                                                                                                                               |
| `prvctice.chat`      | Subscribe to chat events                                                                                                                                                          |
| `prvctice.files`     | File system access                                                                                                                                                                |
| `prvctice.calendar`  | Calendar events                                                                                                                                                                   |
| `prvctice.clipboard` | Read/write clipboard                                                                                                                                                              |

## Constraints and Gotchas

**ES5 only.** Use `var` (not `const`/`let`), `function()` (not arrows), `.then()` (not `async`/`await`). Code is transpiled automatically but ES6+ syntax causes parse errors.

**No eval, no dynamic scripts.** CSP restriction. All code must be inline in the HTML file.

**Transparent background.** The window chrome provides the glass surface. Set `body { background: transparent }` or omit background styles entirely.

**onReady is mandatory.** All SDK calls must happen inside `prvctice.onReady(function() { ... })`. The bridge handshake isn't complete until this fires.

**onDispose for cleanup.** Always register `prvctice.onDispose(function() { ... })` to clean up intervals, routers, recorders, and listeners. The host calls this when the window closes.

**Storage is scoped.** Each app has its own isolated key-value store. You can't access another app's storage.

**No direct fetch.** External URLs must go through `prvctice.web.fetch(url)`, not the browser's `fetch()`.

**Single HTML file.** No separate CSS or JS files. Everything is inline. Use `<style>` tags and `<script>` tags within the HTML.

## Design Standards

### Mandatory UI States

Every view that loads or displays data must handle all three states. Skipping any is a bug, not an omission.

- **Loading** -- Use `prvctice.ui.dataView({ state: 'loading' })`. Never show empty content while data is in flight.
- **Empty** -- Design the empty state intentionally. A label like "No items yet" with a clear call to action is required.
- **Error** -- Use `prvctice.ui.dataView({ state: 'error', message: '...' })`. Never silently swallow errors.

### Animation

Animate meaningful transitions, not decoration. A list item appearing, a view changing, a value updating -- these deserve animation. Background shimmer and idle spinning do not.

- Use `prvctice.animate` presets for element transitions: `snappy` for quick responses, `standard` for view changes, `gentle` for subtle reveals.
- Always clean up animation intervals in `onDispose`. Leaked RAF loops and `setInterval` calls persist after the window closes.
- Do not animate elements that haven't changed.

### Anti-Patterns (Common AI Tells)

These patterns make apps feel generic. Avoid them.

**Content quality:**

- No placeholder names (`John Doe`, `Jane Smith`, `User 1`)
- No fake metrics (`99.9% uptime`, `50 users`, `1,234 items`) unless the app is specifically about displaying user data
- No startup jargon in labels or headings (`Seamless`, `Elevate`, `Unleash`, `Powerful`, `Next-level`)
- No filler copy in empty states (`Nothing to see here!`, `You're all caught up!`)

**Visual:**

- No emoji anywhere -- use text symbols (→, ●, ◆) or SVG icons
- No hardcoded `border-radius` pixel values -- use `var(--p-radius-*)` tokens
- No white or light gray backgrounds (`#fff`, `#f5f5f5`) -- use theme tokens or transparent
- No outer glow or neon effects
- No stock blue accents (`#4a9eff`, cornflower blue) -- use `var(--p-accent-blue)` or `var(--p-primary)`

**Structure:**

- No generic 3-column card grids as the default layout
- No centered hero sections with a large heading and subheading as the main UI
- Do not reach for a card container when spacing and dividers suffice

## Pre-Flight Checklist

Before finalizing an app, verify:

- [ ] ES5 syntax throughout (`var`, `function()`, `.then()`) -- no `const`, `let`, arrow functions, or `async/await`
- [ ] All SDK calls are inside `prvctice.onReady(function() { ... })`
- [ ] `prvctice.onDispose` registered and cleans up all intervals, routers, and listeners
- [ ] External URLs use `prvctice.web.fetch()`, not `fetch()`
- [ ] No `body` background color set (transparent is the default)
- [ ] Every data-loading view has loading, empty, and error states
- [ ] No inline `eval()` or dynamically constructed `<script>` tags
- [ ] Storage keys are short, descriptive, and documented in a comment

## App File Location

Put app HTML files in `src/prompts/templates/`. The app system discovers them from this directory.

## Testing

After creating an app:

1. Restart the dev server if needed: `npm run web:dev`
2. The app should appear in the app launcher
3. Open it and verify the bridge handshake completes (check for `prvctice.onReady` firing)
4. Test data loading, interactions, and persistence
5. Close and reopen to verify storage works across restarts

## Reference

- [SDK Getting Started](../sdk/getting-started.md) -- Step-by-step tutorial from Hello World to multi-view app
- [SDK Examples](../sdk/examples.md) -- 10 reference apps with key patterns and recipes
- [SDK UIKit Reference](../sdk/uikit.md) -- All `p-*` CSS classes and design tokens
- [SDK API Reference](../sdk/reference.md) -- Complete method signatures for all namespaces
- `src/prompts/templates/weather-card.html` -- Simplest data display app
- `src/prompts/templates/list-app.html` -- Simple CRUD with persistence
- `src/prompts/templates/album-player.html` -- Multi-view with router
- `src/prompts/templates/music-studio.html` -- Audio + forms + visualization

---

_Last verified: 2026-02-22_
