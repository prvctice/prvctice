# prvctice App SDK

prvctice apps are sandboxed HTML pages that run inside iframes, communicating with the host through a `window.prvctice` bridge SDK. Apps can fetch live data, play audio, persist state, render charts, use AI completion, and more -- all through a single JavaScript namespace.

## Reading Order

1. **[Getting Started](./getting-started.md)** -- Build your first app from Hello World to a multi-view app with data, animation, and persistence. Start here.
2. **[Example Apps](./examples.md)** -- 10 reference apps with architectural breakdowns, plus copy-paste recipes for common patterns.
3. **[UIKit CSS Reference](./uikit.md)** -- All `p-*` layout classes, design tokens, and terminal-aesthetic components.
4. **[API Reference](./reference.md)** -- Complete method signatures for all `prvctice.*` namespaces (lifecycle, storage, UI, audio, AI, connectors, and more).

## Quick Facts

- All code uses ES5 syntax (`var`, `function()`, `.then()`)
- Apps initialize inside `prvctice.onReady(function() { ... })`
- Apps clean up inside `prvctice.onDispose(function() { ... })`
- Body background should be transparent (the window chrome provides the glass surface)
- Storage is scoped per app (isolated key-value store)
- External URLs go through `prvctice.web.fetch`, not direct `fetch()`

---

_Last verified: 2026-02-20_
