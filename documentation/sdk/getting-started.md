# Getting Started with prvctice Apps

A step-by-step guide to creating your first prvctice app, building from Hello World to a multi-view app with data, animation, and persistence.

## 1. What is a prvctice app?

A prvctice app is a sandboxed HTML page that runs inside an iframe. Apps communicate with the host through the `prvctice` bridge SDK, which is automatically injected into every app.

Key facts:

- Apps are single HTML files with inline CSS and JavaScript
- All code runs in ES5 (transpiled automatically)
- The `window.prvctice` object provides access to data, storage, UI components, animation, and more
- Apps cannot access external URLs directly (use `prvctice.web.fetch` instead)
- The app body should have a transparent background -- the glass surface comes from the window chrome

## 2. Minimal Hello World

The smallest working app:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Hello</title>
  </head>
  <body class="p-stack pad-3 full gap-2">
    <div class="p-label-tech">Hello, prvctice!</div>
    <script>
      prvctice.onReady(function () {
        prvctice.window.setTitle('Hello World');
      });
    </script>
  </body>
</html>
```

Every app wraps its initialization in `prvctice.onReady()`. This ensures the bridge SDK is fully loaded before your code runs.

## 3. Adding UIKit Styling

prvctice apps use `p-*` CSS utility classes for layout and styling. These classes automatically inherit the active theme.

**Layout classes:**

```html
<!-- Vertical stack with padding and gap -->
<body class="p-stack pad-4 full gap-3">
  <!-- Horizontal row -->
  <div class="p-row gap-2">
    <span class="text-muted">Label</span>
    <span>Value</span>
  </div>

  <!-- Split row (space-between) -->
  <div class="p-split">
    <span>Left</span>
    <span>Right</span>
  </div>

  <!-- Card -->
  <div class="p-card">
    <div class="p-label-tech">SECTION</div>
    <div class="text-lg">Content inside a card</div>
  </div>

  <!-- Button -->
  <button class="p-btn p-btn-primary">Click Me</button>
</body>
```

**Common classes:**

| Class              | Purpose                  |
| ------------------ | ------------------------ |
| `p-stack`          | Vertical flex column     |
| `p-row`            | Horizontal flex row      |
| `p-split`          | Row with space-between   |
| `p-center`         | Center content both axes |
| `p-card`           | Bordered surface card    |
| `p-btn`            | Base button style        |
| `p-btn-primary`    | Primary colored button   |
| `pad-1` to `pad-8` | Padding scale            |
| `gap-1` to `gap-8` | Gap scale                |
| `full`             | Width and height 100%    |
| `flex-1`           | Flex grow                |
| `text-muted`       | Dimmed text color        |
| `font-mono`        | Monospace font           |

See the [UIKit Reference](./uikit.md) for the complete list.

## 4. Fetching Data

Use connectors to fetch live data. Here is a weather card:

```html
<body class="p-stack pad-4 full gap-3">
  <div id="content"></div>

  <script>
    prvctice.onReady(function () {
      var container = document.getElementById('content');

      var dv = prvctice.ui.dataView(container, {
        load: function () {
          return prvctice.weather.current();
        },
        render: function (w, contentEl) {
          var temp = Math.round(w.current.temperature_2m);
          contentEl.innerHTML = '<div class="p-stat-value">' + temp + '\u00B0</div>';
        },
        errorMessage: 'Failed to load weather',
      });
    });
  </script>
</body>
```

`prvctice.ui.dataView` handles loading, error, and empty states automatically. Use it for any data-fetching UI.

## 5. Adding Interactivity

Wire DOM events and use UI components for interactive controls:

```html
<body class="p-stack pad-4 full gap-3">
  <div class="p-center flex-1">
    <div class="p-stat-value font-mono" id="count">0</div>
  </div>

  <div id="stepper" class="self-center"></div>

  <div id="tabs"></div>
  <div id="tab-content" class="flex-1"></div>

  <script>
    prvctice.onReady(function () {
      var count = 0;

      // Stepper: numeric +/- control
      var stepper = prvctice.ui.stepper(document.getElementById('stepper'), {
        min: 0,
        max: 100,
        step: 1,
        value: 0,
        onChange: function (v) {
          count = v;
          document.getElementById('count').textContent = v;
        },
      });

      // Tabs: segmented control
      var tabs = prvctice.ui.tabs(document.getElementById('tabs'), {
        tabs: [
          { id: 'info', label: 'Info' },
          { id: 'settings', label: 'Settings' },
          { id: 'about', label: 'About' }
        ],
        active: 'info',
        onChange: function (tabId) {
          document.getElementById('tab-content').textContent = 'Selected: ' + tabId;
        },
      });
    });
  </script>
</body>
```

## 6. Adding Animation

Use `prvctice.animate()` for spring-based animations and `prvctice.ui.animateEntrance()` for staggered list entrances:

```html
<body class="p-stack pad-4 full gap-3">
  <div class="p-card" id="card" style="opacity:0; transform:translateY(20px)">
    <div class="p-label-tech">ANIMATED CARD</div>
    <div>This card springs into view</div>
  </div>

  <div id="list" class="p-stack gap-2"></div>

  <button class="p-btn p-btn-primary" id="addBtn">Add Item</button>

  <script>
    prvctice.onReady(function () {
      // Entrance animation with spring preset
      prvctice.animate(
        '#card',
        {
          opacity: 1,
          transform: 'translateY(0px)',
        },
        { preset: 'gentle' }
      );

      // Build a list and stagger-animate entries
      var list = document.getElementById('list');
      var items = ['Alpha', 'Beta', 'Gamma', 'Delta'];
      items.forEach(function (name) {
        var el = document.createElement('div');
        el.className = 'p-card';
        el.textContent = name;
        list.appendChild(el);
      });

      // Stagger entrance animation on all cards in the list
      prvctice.ui.animateEntrance(list, {
        stagger: 60,
      });

      // Button press animation
      var btn = document.getElementById('addBtn');
      btn.addEventListener('click', function () {
        prvctice
          .animate(btn, { transform: 'scale(0.95)' }, { preset: 'xsnappy' })
          .finished.then(function () {
            prvctice.animate(btn, { transform: 'scale(1)' }, { preset: 'snappy' });
          });
      });
    });
  </script>
</body>
```

**Spring presets:**

| Preset     | Duration | Feel                    | Use for                    |
| ---------- | -------- | ----------------------- | -------------------------- |
| `xsnappy`  | 200ms    | Instant, no bounce      | Button presses, toggles    |
| `snappy`   | 350ms    | Quick, slight overshoot | Interactive UI, menus      |
| `standard` | 500ms    | Balanced                | General transitions        |
| `gentle`   | 800ms    | Slow, smooth            | Entrance animations, media |
| `bouncy`   | 900ms    | Playful overshoot       | Games, celebrations        |

## 7. Adding Navigation

Use `prvctice.ui.router()` for multi-view apps with push/pop transitions:

```html
<body class="p-stack full" style="background:transparent">
  <!-- Define views with data-view attributes -->
  <div data-view="list" class="p-stack pad-4 full gap-3">
    <div class="p-label-tech">ITEMS</div>
    <div id="item-list" class="p-stack gap-2 flex-1 p-scroll-y"></div>
  </div>

  <div data-view="detail" class="p-stack pad-4 full gap-3">
    <button class="p-btn p-btn-sm self-start" id="backBtn">Back</button>
    <div id="detail-content" class="flex-1"></div>
  </div>

  <script>
    prvctice.onReady(function () {
      // Initialize router -- scans for data-view elements in the DOM
      var router = prvctice.ui.router({
        initial: 'list',
      });

      // Build list items
      var items = ['Mercury', 'Venus', 'Earth', 'Mars'];
      var listEl = document.getElementById('item-list');
      items.forEach(function (name) {
        var item = document.createElement('div');
        item.className = 'p-list-item';
        item.innerHTML =
          '<div class="p-list-item-content">' +
          '<div class="p-list-item-title">' +
          name +
          '</div>' +
          '</div>';
        item.addEventListener('click', function () {
          document.getElementById('detail-content').innerHTML =
            '<div class="p-stat-value">' +
            name +
            '</div>' +
            '<div class="text-muted">Planet details here</div>';
          router.push('detail');
        });
        listEl.appendChild(item);
      });

      // Back button
      document.getElementById('backBtn').addEventListener('click', function () {
        router.pop();
      });

      // Cleanup on dispose
      prvctice.onDispose(function () {
        router.dispose();
      });
    });
  </script>
</body>
```

The router handles iOS-style slide transitions automatically. Use `router.push(name)` to navigate forward and `router.pop()` to go back.

## 8. Using Forms

Use `prvctice.ui.form()` for declarative forms with built-in validation:

```html
<body class="p-stack pad-4 full gap-3">
  <div class="p-label-tech">SETTINGS</div>
  <div id="settings-form" class="flex-1 p-scroll-y"></div>

  <script>
    prvctice.onReady(function () {
      var form = prvctice.ui.form(document.getElementById('settings-form'), {
        fields: [
          {
            name: 'username',
            label: 'Username',
            type: 'text',
            placeholder: 'Enter name',
            required: true,
            minLength: 3,
          },
          {
            name: 'theme',
            label: 'Theme',
            type: 'select',
            options: [
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
              { label: 'Auto', value: 'auto' },
            ],
            value: 'auto',
          },
          { name: 'volume', label: 'Volume', type: 'slider', min: 0, max: 100, value: 75, step: 5 },
          { name: 'notifications', label: 'Enable Notifications', type: 'toggle', value: true },
        ],
        submitLabel: 'Save Settings',
        onSubmit: function (data) {
          prvctice.storage.set('settings', data).then(function () {
            prvctice.ui.toast({ message: 'Settings saved', type: 'success' });
          });
        },
      });

      // Load saved settings
      prvctice.storage.get('settings').then(function (saved) {
        if (saved) {
          Object.keys(saved).forEach(function(key) {
            form.setValue(key, saved[key]);
          });
        }
      });

      prvctice.onDispose(function () {
        form.dispose();
      });
    });
  </script>
</body>
```

**Field types:** `text`, `number`, `select`, `toggle`, `slider`, `checkbox`, `radio`

**Validators:** `required`, `{ minLength: N }`, `{ maxLength: N }`, `{ min: N }`, `{ max: N }`, `{ pattern: /regex/ }`, `email`

## 9. Persistence

Use `prvctice.storage` to save and load app state:

```html
<body class="p-stack pad-4 full gap-3">
  <div class="p-label-tech">NOTES</div>
  <textarea class="p-input flex-1" id="notes" placeholder="Type your notes..."></textarea>
  <div class="p-split">
    <span class="text-xs text-muted" id="saved-at">Not saved yet</span>
    <button class="p-btn p-btn-sm p-btn-primary" id="saveBtn">Save</button>
  </div>

  <script>
    prvctice.onReady(function () {
      var textarea = document.getElementById('notes');
      var savedAt = document.getElementById('saved-at');

      // Load saved notes on startup
      prvctice.storage.get('notes').then(function (data) {
        if (data) {
          textarea.value = data.text || '';
          savedAt.textContent = 'Last saved: ' + (data.time || 'unknown');
        }
      });

      // Save on button click
      document.getElementById('saveBtn').addEventListener('click', function () {
        var now = new Date().toLocaleTimeString();
        prvctice.storage
          .set('notes', {
            text: textarea.value,
            time: now,
          })
          .then(function () {
            savedAt.textContent = 'Last saved: ' + now;
            prvctice.ui.toast({ message: 'Saved', type: 'success' });
          });
      });
    });
  </script>
</body>
```

Storage is scoped per app. Each app gets its own isolated key-value store. Use `prvctice.storage.usage()` to check storage consumption.

## 10. Permissions and Constraints

**What apps CAN do:**

- Fetch data from connectors (weather, news, sports, markets, wikipedia, art, etc.)
- Use AI completion and streaming (`prvctice.ai.complete`, `prvctice.ai.stream`)
- Play audio (`prvctice.audio.tone`, `prvctice.media.playAudio`)
- Record audio (`prvctice.audio.createRecorder`)
- Process audio buffers (`prvctice.audio.buffer` -- slice, reverse, normalize, fade, pitch shift)
- Process images with WebGL filters (`prvctice.image` -- 13 filters, transforms, pipeline, composite)
- Capture canvas frames (`prvctice.capture` -- single snapshots or multi-frame sequences)
- Use mixing-console faders (`prvctice.ui.fader`) and DAW-style timelines (`prvctice.ui.timeline`)
- Store data persistently (`prvctice.storage`)
- Show notifications (`prvctice.ui.toast`, `prvctice.ui.confirm`, `prvctice.ui.alert`)
- Animate elements (`prvctice.animate`)
- Navigate between views (`prvctice.ui.router`)
- Render charts and visualizations (`prvctice.ui.sparkline`, `prvctice.ui.barChart`, etc.)
- Communicate with other apps (`prvctice.broadcast`)

**What apps CANNOT do:**

- Access external URLs directly (use `prvctice.web.fetch` as a proxy)
- Access the filesystem directly (use `prvctice.files` or `prvctice.vfs`)
- Use `eval()` or create `<script>` tags (CSP restriction)
- Access `localStorage` or `sessionStorage` (use `prvctice.storage` instead)
- Exceed storage limits per app
- Make unlimited API calls (rate limits apply)

**Best practices:**

- Always wrap initialization in `prvctice.onReady(function() { ... })`
- Always clean up in `prvctice.onDispose(function() { ... })` -- dispose routers, stop timers, cancel animations
- Use `p-*` CSS classes for styling, not custom colors (use `--p-*` CSS variables for theming)
- Use `.then().catch()` for error handling on async calls
- Keep body background transparent
- Use ES5 syntax: `var` not `const`/`let`, `function()` not arrows, `.then()` not `async`/`await`

## Next Steps

- [SDK API Reference](./reference.md) -- Complete method signatures for all `prvctice.*` namespaces
- [UIKit CSS Reference](./uikit.md) -- All `p-*` CSS classes and design tokens
- [Example Apps](./examples.md) -- Showcase and template apps demonstrating SDK capabilities

---

_Last verified: 2026-02-20_
