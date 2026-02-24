# UIKit CSS Reference

prvctice apps use the UIKit CSS framework for consistent styling. All classes use the `p-` prefix and automatically inherit the active theme via CSS custom properties.

## Design Tokens

The foundation layer defines all design tokens as CSS custom properties on `:root`.

### Colors

| Token                | Default                          | Description            |
| -------------------- | -------------------------------- | ---------------------- |
| `--p-bg`             | `var(--prvctice-background)`     | Page background        |
| `--p-surface`        | `var(--prvctice-surface)`        | Card/panel background  |
| `--p-text`           | `var(--prvctice-text)`           | Primary text color     |
| `--p-text-secondary` | `var(--prvctice-text-secondary)` | Secondary text         |
| `--p-text-muted`     | 60% of secondary                 | Muted/dimmed text      |
| `--p-primary`        | `var(--prvctice-primary)`        | Primary brand color    |
| `--p-secondary`      | `var(--prvctice-secondary)`      | Secondary brand color  |
| `--p-accent`         | `var(--prvctice-accent)`         | Accent highlight color |
| `--p-border`         | `var(--prvctice-border)`         | Border color           |
| `--p-border-subtle`  | 50% of border                    | Subtle border          |
| `--p-surface-raised` | Surface + white                  | Elevated surface       |
| `--p-surface-sunken` | Surface + black                  | Recessed surface       |
| `--p-success`        | `#22c55e`                        | Success/positive       |
| `--p-warning`        | `#f59e0b`                        | Warning/caution        |
| `--p-danger`         | `#ef4444`                        | Danger/error           |
| `--p-info`           | Same as accent                   | Informational          |

#### Instrument Accent Colors

Four accent colors for indicators, arcs, displays, and data readouts. These create a terminal/instrument-gauge aesthetic. **Never use on button fills.**

| Token               | Value     | Use for                                                                  |
| ------------------- | --------- | ------------------------------------------------------------------------ |
| `--p-accent-blue`   | `#4488ff` | Control indicators, active tabs, focus glows, data values, input borders |
| `--p-accent-amber`  | `#ff6b2b` | Readout displays, status indicators, terminal-glow headings              |
| `--p-accent-green`  | `#2e7d42` | Live/sync indicators, saved states, completion, presets                  |
| `--p-accent-purple` | `#A920B5` | Timestamps in feed metadata (`.p-feed-time`)                             |

### Typography

| Token                 | Value                                | Description           |
| --------------------- | ------------------------------------ | --------------------- |
| `--p-font`            | `'Gothic A1', system-ui, sans-serif` | Body font family      |
| `--p-font-mono`       | `'IBM Plex Mono', ui-monospace`      | Monospace font family |
| `--p-text-xs`         | 11px                                 | Extra small text      |
| `--p-text-sm`         | 13px                                 | Small text            |
| `--p-text-base`       | 15px                                 | Base text size        |
| `--p-text-lg`         | 18px                                 | Large text            |
| `--p-text-xl`         | 24px                                 | Extra large           |
| `--p-text-2xl`        | 32px                                 | Display size          |
| `--p-text-3xl`        | 48px                                 | Hero size             |
| `--p-text-4xl`        | 64px                                 | Jumbo size            |
| `--p-weight-light`    | 300                                  | Light weight          |
| `--p-weight-regular`  | 400                                  | Regular weight        |
| `--p-weight-medium`   | 500                                  | Medium weight         |
| `--p-weight-semi`     | 600                                  | Semibold weight       |
| `--p-weight-bold`     | 700                                  | Bold weight           |
| `--p-leading-tight`   | 1.15                                 | Tight line height     |
| `--p-leading-normal`  | 1.4                                  | Normal line height    |
| `--p-leading-relaxed` | 1.6                                  | Relaxed line height   |

### Spacing

4px base scale:

| Token    | Value |
| -------- | ----- |
| `--p-1`  | 4px   |
| `--p-2`  | 8px   |
| `--p-3`  | 12px  |
| `--p-4`  | 16px  |
| `--p-5`  | 20px  |
| `--p-6`  | 24px  |
| `--p-7`  | 28px  |
| `--p-8`  | 32px  |
| `--p-9`  | 36px  |
| `--p-10` | 40px  |

### Radius

| Token             | Value | Use for                       |
| ----------------- | ----- | ----------------------------- |
| `--p-radius-sm`   | 6px   | Small elements, pills, badges |
| `--p-radius-md`   | 8px   | Inputs, small cards, tabs     |
| `--p-radius-lg`   | 12px  | Cards, inner panels           |
| `--p-radius-xl`   | 28px  | Windows, modals, dialogs      |
| `--p-radius-pill` | 999px | Buttons, toggles, badges      |

### Shadows

| Token             | Description                       |
| ----------------- | --------------------------------- |
| `--p-shadow-sm`   | Small shadow (subtle elevation)   |
| `--p-shadow-md`   | Medium shadow                     |
| `--p-shadow-lg`   | Large shadow                      |
| `--p-shadow-xl`   | Extra large with border highlight |
| `--p-shadow-glow` | Primary color glow                |

### Glass

| Token              | Description              |
| ------------------ | ------------------------ |
| `--p-glass-bg`     | 60% surface transparency |
| `--p-glass-border` | 60% border transparency  |
| `--p-glass-blur`   | 12px blur radius         |

### Motion

| Token               | Value                              | Description          |
| ------------------- | ---------------------------------- | -------------------- |
| `--p-ease`          | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Standard easing      |
| `--p-ease-out`      | `cubic-bezier(0, 0, 0.2, 1)`       | Ease out             |
| `--p-ease-smooth`   | `cubic-bezier(0.16, 1, 0.3, 1)`    | Smooth easing        |
| `--p-duration-fast` | 150ms                              | Fast transitions     |
| `--p-duration`      | 250ms                              | Standard transitions |
| `--p-duration-slow` | 400ms                              | Slow transitions     |

### Spring Easing

CSS spring presets using `linear()`:

| Preset                | Duration Token          | Duration | Feel                    |
| --------------------- | ----------------------- | -------- | ----------------------- |
| `--p-spring-xsnappy`  | `--p-spring-xsnappy-t`  | 200ms    | Instant, no bounce      |
| `--p-spring-snappy`   | `--p-spring-snappy-t`   | 350ms    | Quick, slight overshoot |
| `--p-spring-standard` | `--p-spring-standard-t` | 500ms    | Balanced                |
| `--p-spring-gentle`   | `--p-spring-gentle-t`   | 800ms    | Slow, smooth            |
| `--p-spring-bouncy`   | `--p-spring-bouncy-t`   | 900ms    | Playful overshoot       |

Usage in custom CSS:

```css
.my-element {
  transition: transform var(--p-spring-snappy-t) var(--p-spring-snappy);
}
```

All spring animations are disabled when `prefers-reduced-motion: reduce` is active.

---

## Layout Classes

From `layout.css`.

### Flex Layouts

| Class      | Description                             |
| ---------- | --------------------------------------- |
| `p-stack`  | Vertical flex column with default gap   |
| `p-row`    | Horizontal flex row with centered items |
| `p-split`  | Horizontal row with `space-between`     |
| `p-center` | Center content on both axes             |
| `p-wrap`   | Enable flex wrapping                    |

### Grid

| Class        | Description                  |
| ------------ | ---------------------------- |
| `p-grid`     | CSS grid (default 2 columns) |
| `p-grid-2x2` | 2 columns, 2 rows            |
| `p-grid-3x2` | 3 columns, 2 rows            |
| `p-grid-4x2` | 4 columns, 2 rows            |
| `p-grid-3x3` | 3 columns, 3 rows            |
| `p-grid-4x3` | 4 columns, 3 rows            |

Grid spanning: `col-span-2`, `col-span-3`, `col-span-4`, `row-span-2`, `row-span-3`, `col-full`

Set custom columns with `style="--cols: 3"`.

### Spacing

| Class              | Property              |
| ------------------ | --------------------- |
| `pad-1` to `pad-8` | Padding (4px to 32px) |
| `gap-1` to `gap-8` | Gap (4px to 32px)     |

### Sizing

| Class         | Description           |
| ------------- | --------------------- |
| `full`        | Width and height 100% |
| `full-width`  | Width 100%            |
| `full-height` | Height 100%           |

### Flex Helpers

| Class           | Description               |
| --------------- | ------------------------- |
| `flex-1`        | `flex: 1` (grow to fill)  |
| `flex-none`     | `flex: none` (fixed size) |
| `flex-grow`     | `flex-grow: 1`            |
| `flex-shrink-0` | Prevent shrinking         |

### Alignment

| Class             | Description          |
| ----------------- | -------------------- |
| `items-start`     | Align items to start |
| `items-center`    | Align items center   |
| `items-end`       | Align items to end   |
| `items-stretch`   | Stretch items        |
| `justify-start`   | Justify to start     |
| `justify-center`  | Justify center       |
| `justify-end`     | Justify to end       |
| `justify-between` | Space between        |
| `self-start`      | Align self start     |
| `self-center`     | Align self center    |
| `self-end`        | Align self end       |
| `self-stretch`    | Stretch self         |
| `text-left`       | Left align text      |
| `text-center`     | Center align text    |
| `text-right`      | Right align text     |

### Scrolling

| Class        | Description            |
| ------------ | ---------------------- |
| `p-scroll`   | Scrollable both axes   |
| `p-scroll-y` | Vertical scroll only   |
| `p-scroll-x` | Horizontal scroll only |

### Overflow

| Class             | Description                        |
| ----------------- | ---------------------------------- |
| `overflow-hidden` | Hide overflow                      |
| `truncate`        | Ellipsis on overflow (single line) |

### Position

| Class      | Description          |
| ---------- | -------------------- |
| `relative` | `position: relative` |
| `absolute` | `position: absolute` |
| `inset-0`  | All sides 0          |

### Widget Sizes

| Class          | Aspect Ratio     |
| -------------- | ---------------- |
| `p-widget-1x1` | 1:1 square       |
| `p-widget-2x1` | 2:1 wide         |
| `p-widget-1x2` | 1:2 tall         |
| `p-widget-2x2` | 2:2 large square |

---

## Component Classes

From `components.css`.

### Cards

| Class               | Description                   |
| ------------------- | ----------------------------- |
| `p-card`            | Standard card with border     |
| `p-card-flat`       | Card without border           |
| `p-card-raised`     | Card with shadow              |
| `p-card-glass`      | Frosted glass card            |
| `p-card-instrument` | Dashed border, technical feel |
| `p-card-compact`    | Reduced padding card          |

### Stat Display

```html
<div class="p-stat">
  <div class="p-stat-value">42</div>
  <div class="p-stat-label">ITEMS</div>
  <div class="p-stat-unit">units</div>
</div>
```

| Class            | Description                   |
| ---------------- | ----------------------------- |
| `p-stat`         | Centered stat container       |
| `p-stat-value`   | Large mono number             |
| `p-stat-label`   | Uppercase label               |
| `p-stat-unit`    | Unit suffix                   |
| `p-stat-sm`      | Smaller stat value            |
| `p-stat-lg`      | Larger stat value             |
| `p-stat-left`    | Left-aligned stat             |
| `p-stat-right`   | Right-aligned stat            |
| `p-stat-compact` | Compact stat for small spaces |

### Clock and Timer

| Class                | Description                         |
| -------------------- | ----------------------------------- |
| `p-clock-digital`    | Digital clock display (mono, large) |
| `p-clock-digital-sm` | Small digital clock                 |
| `p-clock-digital-lg` | Large digital clock                 |
| `p-clock-analog`     | Analog clock container              |
| `p-timer-display`    | Timer countdown display             |
| `p-timer-display-sm` | Small timer                         |
| `p-timer-display-lg` | Large timer                         |

### Progress Bar

```html
<div class="p-progress" style="--progress: 0.75"></div>
```

| Class                | Description                              |
| -------------------- | ---------------------------------------- |
| `p-progress`         | Base progress bar (set `--progress` 0-1) |
| `p-progress-success` | Green fill                               |
| `p-progress-warning` | Yellow fill                              |
| `p-progress-danger`  | Red fill                                 |
| `p-progress-accent`  | Accent fill                              |
| `p-progress-md`      | Medium height (10px)                     |
| `p-progress-lg`      | Large height (16px)                      |

### Badge

| Class             | Description         |
| ----------------- | ------------------- |
| `p-badge`         | Base badge/pill     |
| `p-badge-primary` | Primary color badge |
| `p-badge-success` | Success color badge |
| `p-badge-warning` | Warning color badge |
| `p-badge-danger`  | Danger color badge  |
| `p-badge-accent`  | Accent color badge  |
| `p-badge-dot`     | Adds dot indicator  |

### List

```html
<div class="p-list">
  <div class="p-list-item">
    <div class="p-list-item-content">
      <div class="p-list-item-title">Title</div>
      <div class="p-list-item-subtitle">Subtitle</div>
    </div>
    <div class="p-list-item-action">
      <button class="p-btn p-btn-sm">Action</button>
    </div>
  </div>
</div>
```

| Class                  | Description               |
| ---------------------- | ------------------------- |
| `p-list`               | List container            |
| `p-list-item`          | List row with hover state |
| `p-list-item-content`  | Flex-1 content area       |
| `p-list-item-title`    | Item title text           |
| `p-list-item-subtitle` | Item subtitle text        |
| `p-list-item-action`   | Right-side action slot    |
| `p-list-compact`       | Compact list variant      |

### Empty State

```html
<div class="p-empty">
  <div class="p-empty-icon">📭</div>
  <div class="p-empty-message">No items yet</div>
</div>
```

### Error State

```html
<div class="p-error">
  <div class="p-error-icon">⚠</div>
  <div class="p-error-message">Something went wrong</div>
  <div class="p-error-action">
    <button class="p-btn p-btn-sm" onclick="retry()">Retry</button>
  </div>
</div>
```

### Divider

| Class             | Description     |
| ----------------- | --------------- |
| `p-divider`       | Horizontal rule |
| `p-divider-thick` | Thicker divider |

### Widget Structure

| Class                   | Description                                   |
| ----------------------- | --------------------------------------------- |
| `p-widget-header`       | Widget header bar                             |
| `p-widget-header-title` | Header title text                             |
| `p-widget-header-icon`  | Header icon                                   |
| `p-widget-body`         | Widget content area (container query enabled) |

The widget body has container queries that auto-adjust content at three breakpoints:

- **Compact** (<250px): Hides headings, reduces stat/card sizes
- **Standard** (250-399px): Default layout
- **Expanded** (400px+): Larger headings and spacing

### Staleness Badge

```html
<span class="p-stale-badge">5m ago</span>
```

### Terminal Header

App-level header with amber glow title and optional status indicator.

```html
<div class="p-terminal-header">
  <span class="p-label-tech">APP TITLE</span>
  <span class="p-status-live">LIVE</span>
</div>
```

| Class               | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `p-terminal-header` | Split header bar with amber glow on `.p-label-tech` children |
| `p-status-live`     | Green pulsing dot + label (for live/sync indicators)         |

### Tab Bar

Terminal-style navigation tabs with monospace uppercase labels.

```html
<div class="p-tab-bar">
  <button class="p-tab active">GENERAL</button>
  <button class="p-tab">TECH</button>
  <button class="p-tab">SPORTS</button>
</div>
```

| Class          | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| `p-tab-bar`    | Horizontal tab container with bottom border, auto-hides scrollbar |
| `p-tab`        | Individual tab button (mono, 10px, uppercase)                     |
| `p-tab.active` | Active tab highlighted with `--p-accent-blue`                     |

### Feed Metadata

Compact monospace metadata line for list items, timestamps, and data labels.

| Class         | Description                                    |
| ------------- | ---------------------------------------------- |
| `p-feed-meta` | 10px mono text, wide tracking, secondary color |
| `p-feed-time` | Purple-colored timestamp (`--p-accent-purple`)  |

```html
<div class="p-feed-meta">Reuters &#8226; <span class="p-feed-time">2H AGO</span></div>
```

### Accent Border

Subtle accent-tinted borders for containers and panels.

| Class                   | Description                        |
| ----------------------- | ---------------------------------- |
| `p-border-accent-blue`  | Blue-tinted border at 12% opacity  |
| `p-border-accent-amber` | Amber-tinted border at 12% opacity |
| `p-border-accent-green` | Green-tinted border at 12% opacity |

### Box Glow

Accent-colored box shadows for indicators and active states.

| Class          | Description           |
| -------------- | --------------------- |
| `p-glow-blue`  | Blue box-shadow glow  |
| `p-glow-amber` | Amber box-shadow glow |
| `p-glow-green` | Green box-shadow glow |

---

## Interactive Classes

From `interactive.css`.

### Buttons

| Class           | Description                         |
| --------------- | ----------------------------------- |
| `p-btn`         | Base button (pill-shaped, outlined) |
| `p-btn-primary` | Primary filled button               |
| `p-btn-danger`  | Danger filled button                |
| `p-btn-ghost`   | Transparent button                  |
| `p-btn-icon`    | Icon-only button                    |
| `p-btn-sm`      | Small button                        |
| `p-btn-lg`      | Large button                        |
| `p-btn-block`   | Full-width button                   |

Buttons have spring-based press animations:

- Hover: `scale(1.02)` with standard spring
- Active: `scale(0.97)` with xsnappy spring

**Button group:**

```html
<div class="p-btn-group">
  <button class="p-btn">One</button>
  <button class="p-btn">Two</button>
  <button class="p-btn">Three</button>
</div>
```

### Input

| Class           | Description        |
| --------------- | ------------------ |
| `p-input`       | Text input field   |
| `p-input-error` | Error state border |

**Input group with icon:**

```html
<div class="p-input-group">
  <span class="p-input-group-icon">&#9906;</span>
  <input class="p-input" placeholder="Search..." />
</div>
```

Textarea: `<textarea class="p-input"></textarea>`

### Label

| Class     | Description                         |
| --------- | ----------------------------------- |
| `p-label` | Form field label (uppercase, small) |

### Toggle/Switch

```html
<label class="p-toggle">
  <input type="checkbox" checked />
  <span class="p-toggle-track"></span>
  <span>Enable feature</span>
</label>
```

### Slider

```html
<input type="range" class="p-slider" min="0" max="100" value="50" />
```

### Select

```html
<select class="p-select">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Tabs

```html
<div class="p-tabs">
  <button class="p-tab active">Tab 1</button>
  <button class="p-tab">Tab 2</button>
  <button class="p-tab">Tab 3</button>
</div>
```

### Stepper

```html
<div class="p-stepper">
  <button class="p-stepper-btn">-</button>
  <span class="p-stepper-value">5</span>
  <button class="p-stepper-btn">+</button>
</div>
```

### Checkbox / Radio

```html
<label class="p-checkbox"> <input type="checkbox" /> Option A </label>
<label class="p-radio"> <input type="radio" name="group" /> Option B </label>
```

### Form Validation

| Class           | Description                     |
| --------------- | ------------------------------- |
| `p-form-group`  | Form field wrapper with spacing |
| `p-field-error` | Error message text              |
| `p-input-error` | Input error border state        |

### Fader

Mixing-console fader control. Created via `prvctice.ui.fader()` but CSS classes are documented here for custom layouts.

| Class                      | Description                                     |
| -------------------------- | ----------------------------------------------- |
| `p-fader-wrap`             | Outer wrapper (vertical flex, centered)         |
| `p-fader-wrap--horizontal` | Horizontal orientation modifier                 |
| `p-fader`                  | Fader container (holds track, fill, thumb)      |
| `p-fader--vertical`        | Vertical fader (32px wide, 120px tall)          |
| `p-fader--horizontal`      | Horizontal fader (120px wide, 32px tall)        |
| `p-fader-track`            | Background track groove                         |
| `p-fader-fill`             | Filled portion (color via `--p-fader-color`)    |
| `p-fader-thumb`            | Draggable thumb element                         |
| `p-fader--grabbing`        | Applied during drag (changes cursor, adds glow) |
| `p-fader-val`              | Value readout (mono font, accent color)         |

**CSS custom property:** `--p-fader-color` (default: `var(--p-accent-blue)`)

**Size tiers:** Faders respond to `.p-compact` (80px/80px) and `.p-expanded` (160px/160px).

### Knob

Rotary knob control with conic-gradient arc. Created via `prvctice.ui.knob()` but CSS classes are documented here for custom layouts.

| Class              | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `p-knob-wrap`      | Outer wrapper (vertical flex, centered, label + knob)    |
| `p-knob`           | Knob element (circular, conic-gradient arc fill)         |
| `p-knob--grabbing` | Applied during drag (grabbing cursor, blue glow)         |
| `p-knob-dot`       | Indicator dot showing current rotation                   |
| `p-knob-val`       | Value readout below knob (mono font, accent color)       |

**CSS custom properties:**
- `--p-knob-size` (default: `44px`) -- knob diameter
- `--p-knob-color` (default: `var(--p-accent-blue)`) -- arc and dot color
- `--p-knob-fill` (default: `0deg`) -- arc fill angle (set by JS, max 270deg)

### Timeline

DAW-style timeline component. Created via `prvctice.ui.timeline()`.

| Class                       | Description                                |
| --------------------------- | ------------------------------------------ |
| `p-timeline`                | Outer container                            |
| `p-timeline-header`         | Controls bar (play button, time, zoom)     |
| `p-timeline-play-btn`       | Circular play/pause button                 |
| `p-timeline-time`           | Time display (tabular-nums mono)           |
| `p-timeline-zoom`           | Zoom slider                                |
| `p-timeline-body`           | Body area (sidebar + scroll)               |
| `p-timeline-sidebar`        | Lane labels column (80px)                  |
| `p-timeline-sidebar-lane`   | Individual lane label                      |
| `p-timeline-scroll`         | Horizontal scroll container                |
| `p-timeline-ruler`          | Time ruler with markers                    |
| `p-timeline-ruler-mark`     | Ruler tick mark                            |
| `p-timeline-ruler-label`    | Ruler time label                           |
| `p-timeline-lanes`          | Lanes container                            |
| `p-timeline-lane`           | Individual lane (48px height)              |
| `p-timeline-clip`           | Clip element (positioned with `transform`) |
| `p-timeline-clip.selected`  | Selected clip state                        |
| `p-timeline-clip--dragging` | During drag (grabbing cursor, z-index)     |
| `p-timeline-clip-label`     | Clip label text                            |
| `p-timeline-clip-handle`    | Resize handle (`.left` or `.right`)        |
| `p-timeline-playhead`       | Vertical playhead line (red)               |

**Clip type colors** (via `data-type` attribute):

| Type | Color |
|------|-------|
| `audio` | `--p-accent-blue` (40% mix) |
| `video` | `--p-accent-amber` (40% mix) |
| `text` | `--p-accent-green` (40% mix) |
| (default) | `--p-primary` (30% mix) |

**Size tiers:** Lanes respond to `.p-compact` (32px) and `.p-expanded` (64px).

---

## Typography Classes

From `components.css`.

### Font Size

| Class       | Size |
| ----------- | ---- |
| `text-xs`   | 11px |
| `text-sm`   | 13px |
| `text-base` | 15px |
| `text-lg`   | 18px |
| `text-xl`   | 24px |
| `text-2xl`  | 32px |
| `text-3xl`  | 48px |

### Font Weight

| Class          | Weight |
| -------------- | ------ |
| `font-light`   | 300    |
| `font-regular` | 400    |
| `font-medium`  | 500    |
| `font-semi`    | 600    |
| `font-bold`    | 700    |

### Font Style

| Class            | Description          |
| ---------------- | -------------------- |
| `font-mono`      | Monospace font       |
| `tabular-nums`   | Fixed-width numbers  |
| `tracking-tight` | Tight letter spacing |
| `tracking-wide`  | Wide letter spacing  |
| `uppercase`      | Uppercase transform  |

### Text Color

| Class               | Color                                 |
| ------------------- | ------------------------------------- |
| `text-primary`      | Primary brand color                   |
| `text-secondary`    | Secondary text                        |
| `text-muted`        | Muted/dimmed text                     |
| `text-success`      | Green success                         |
| `text-warning`      | Yellow warning                        |
| `text-danger`       | Red danger                            |
| `text-accent`       | Accent color                          |
| `text-accent-blue`  | Instrument blue (`--p-accent-blue`)   |
| `text-accent-amber` | Instrument amber (`--p-accent-amber`) |
| `text-accent-green` | Instrument green (`--p-accent-green`) |

### Headings

| Element/Class | Size | Weight  |
| ------------- | ---- | ------- |
| `h1` / `.h1`  | 32px | Light   |
| `h2` / `.h2`  | 24px | Light   |
| `h3` / `.h3`  | 18px | Regular |
| `h4` / `.h4`  | 15px | Medium  |

---

## Utility Classes

From `foundation.css`.

### Opacity

| Class         | Value |
| ------------- | ----- |
| `opacity-0`   | 0     |
| `opacity-50`  | 0.5   |
| `opacity-75`  | 0.75  |
| `opacity-100` | 1     |

### Transitions

| Class             | Description                 |
| ----------------- | --------------------------- |
| `transition`      | Standard transition (250ms) |
| `transition-fast` | Fast transition (150ms)     |

### Glass and Effects

| Class       | Description                                  |
| ----------- | -------------------------------------------- |
| `p-glass`   | Frosted glass effect (blur + transparent bg) |
| `p-glow`    | Primary color glow shadow                    |
| `p-fade-in` | Entrance fade-up animation                   |
| `p-shimmer` | Loading shimmer animation                    |
| `p-dashed`  | Dashed border style                          |

### Technical Labels

| Class          | Description                                        |
| -------------- | -------------------------------------------------- |
| `p-label-tech` | Mono uppercase label (tiny, dimmed, wide tracking) |
| `p-mono-value` | Monospace tabular number display                   |
| `p-data`       | Data display (mono, tabular)                       |

### Trend Indicators

| Class               | Description                  |
| ------------------- | ---------------------------- |
| `p-change-positive` | Green with up arrow prefix   |
| `p-change-negative` | Red with down arrow prefix   |
| `p-change-neutral`  | Gray with right arrow prefix |

### Loading Skeletons

| Class               | Description                |
| ------------------- | -------------------------- |
| `p-skeleton`        | Base skeleton with shimmer |
| `p-skeleton-text`   | Text line placeholder      |
| `p-skeleton-circle` | Circle placeholder         |
| `p-skeleton-value`  | Large value placeholder    |

### Text Overflow

| Class             | Description                  |
| ----------------- | ---------------------------- |
| `p-text-truncate` | Single-line ellipsis         |
| `p-text-clamp-1`  | 1-line clamp                 |
| `p-text-clamp-2`  | 2-line clamp                 |
| `p-text-clamp-3`  | 3-line clamp                 |
| `p-overflow-fade` | Bottom gradient fade overlay |

---

## Media Classes

From `media.css`.

### Canvas

| Class              | Description                         |
| ------------------ | ----------------------------------- |
| `p-canvas`         | Canvas container (rounded, dark bg) |
| `p-canvas-toolbar` | Overlay toolbar at bottom           |

### Dropzone

```html
<div class="p-dropzone">
  <div class="p-dropzone-icon">📁</div>
  <div class="p-dropzone-label">Drop files here</div>
  <div class="p-dropzone-hint">or click to browse</div>
</div>
```

| Class                            | Description                      |
| -------------------------------- | -------------------------------- |
| `p-dropzone`                     | Dashed-border drop target        |
| `p-dropzone-active` / `dragover` | Active state (primary highlight) |
| `p-dropzone-compact`             | Horizontal compact layout        |

### File Picker

The file picker is created via `prvctice.ui.filePicker(opts)` (see API reference). It uses these CSS classes internally:

| Class                     | Description                    |
| ------------------------- | ------------------------------ |
| `p-file-overlay`          | Full-screen backdrop with blur |
| `p-file-picker`           | Modal picker container         |
| `p-file-picker-header`    | Mono uppercase header bar      |
| `p-file-picker-close`     | Close button                   |
| `p-file-picker-list`      | Scrollable file list           |
| `p-file-picker-item`      | Clickable file row             |
| `p-file-picker-item-icon` | MIME type badge (AU, IM, VD)   |
| `p-file-picker-item-name` | Truncated file name            |
| `p-file-picker-meta`      | Size metadata                  |
| `p-file-picker-empty`     | Empty state message            |
| `p-file-picker-loading`   | Loading state message          |

### Waveform

| Class                 | Description                      |
| --------------------- | -------------------------------- |
| `p-waveform`          | Waveform container (80px height) |
| `p-waveform-sm`       | Small (48px)                     |
| `p-waveform-lg`       | Large (120px)                    |
| `p-waveform-position` | Playback position indicator line |

### Thumbnail Grid

```html
<div class="p-thumbnail-grid">
  <div class="p-thumbnail">
    <img src="..." />
    <div class="p-thumbnail-label">001</div>
  </div>
</div>
```

### Media Player

```html
<div class="p-media-player">
  <button class="p-media-player-btn">▶</button>
  <input type="range" class="p-slider p-media-player-seek" />
  <span class="p-media-player-time">0:00 / 3:45</span>
</div>
```

### Image Container

| Class             | Description                      |
| ----------------- | -------------------------------- |
| `p-image`         | Image container (rounded, cover) |
| `p-image-contain` | Contain fit instead of cover     |

### Audio Recorder

| Class                        | Description              |
| ---------------------------- | ------------------------ |
| `p-audio-recorder`           | Recorder container       |
| `p-audio-recorder.recording` | Active recording state   |
| `p-recording`                | Recording text indicator |
| `p-recording-dot`            | Pulsing red dot          |

### Audio Visualization

| Class            | Default Height | Description         |
| ---------------- | -------------- | ------------------- |
| `p-oscilloscope` | 80px           | Oscilloscope canvas |
| `p-spectrogram`  | 100px          | Spectrogram canvas  |
| `p-audio-meter`  | 4px            | Simple level bar    |

---

## Chart Classes

From `charts.css`.

| Class                   | Default Height | Description          |
| ----------------------- | -------------- | -------------------- |
| `p-chart`               | auto           | Base chart container |
| `p-chart-sparkline`     | 40px           | Sparkline chart      |
| `p-chart-bar`           | 160px          | Bar chart            |
| `p-chart-line`          | 160px          | Line chart           |
| `p-chart-gauge`         | 140px          | Gauge/dial chart     |
| `p-chart-pie`           | 180px          | Pie chart            |
| `p-chart-progress-ring` | 120px          | Progress ring        |

Charts auto-resize with the `p-compact` and `p-expanded` size tier classes.

---

## Layout Patterns

### Card with Header

```html
<div class="p-card p-stack gap-2">
  <div class="p-label-tech">SECTION TITLE</div>
  <div>Card content here</div>
</div>
```

### Two-Column Split

```html
<div class="p-row gap-3 full">
  <div class="flex-1 p-card">Left panel</div>
  <div class="flex-1 p-card">Right panel</div>
</div>
```

### Scrollable List

```html
<div class="p-stack full">
  <div class="p-label-tech pad-3">ITEMS</div>
  <div class="p-list flex-1 p-scroll-y">
    <div class="p-list-item">
      <div class="p-list-item-content">
        <div class="p-list-item-title">Item 1</div>
      </div>
    </div>
    <!-- more items -->
  </div>
</div>
```

### Stat Dashboard

```html
<div class="p-grid-2x2 gap-3 pad-3">
  <div class="p-card p-stat">
    <div class="p-stat-value">42</div>
    <div class="p-stat-label">TOTAL</div>
  </div>
  <div class="p-card p-stat">
    <div class="p-stat-value p-change-positive">+12%</div>
    <div class="p-stat-label">GROWTH</div>
  </div>
  <div class="p-card p-stat">
    <div class="p-stat-value">98.2</div>
    <div class="p-stat-label">UPTIME</div>
  </div>
  <div class="p-card p-stat">
    <div class="p-stat-value">1.2s</div>
    <div class="p-stat-label">LATENCY</div>
  </div>
</div>
```

### Navigation Bar

```html
<div class="p-stack full">
  <div class="p-row pad-3 gap-2" style="border-bottom: 1px solid var(--p-border-subtle)">
    <button class="p-btn p-btn-icon p-btn-sm" id="backBtn">←</button>
    <span class="p-label-tech flex-1">PAGE TITLE</span>
    <button class="p-btn p-btn-icon p-btn-sm">⋯</button>
  </div>
  <div class="flex-1 p-scroll-y pad-3">
    <!-- page content -->
  </div>
</div>
```

### Terminal Feed App

The standard layout for data/feed apps: terminal header, tab bar, scrollable list. This is the recommended pattern for all prvctice apps.

```html
<body class="p-stack pad-2 full gap-1">
  <!-- Terminal header: amber title + live status -->
  <div class="p-terminal-header">
    <span class="p-label-tech">APP TITLE</span>
    <span class="p-status-live">LIVE</span>
  </div>

  <!-- Tab navigation -->
  <div class="p-tab-bar">
    <button class="p-tab active">TAB ONE</button>
    <button class="p-tab">TAB TWO</button>
  </div>

  <!-- Scrollable content with accent border -->
  <div
    class="p-scroll flex-1"
    style="border:1px solid rgba(68,136,255,0.08);border-radius:var(--p-radius-sm)"
  >
    <div class="p-list-item">
      <div class="p-list-item-content">
        <div class="p-list-item-title">Item Title</div>
        <div class="p-feed-meta">Source &#8226; <span class="p-feed-time">2H AGO</span></div>
      </div>
    </div>
  </div>
</body>
```

### Terminal Instrument App

The standard layout for control/instrument apps: terminal header, instrument cards with controls, action buttons, status footer.

```html
<body class="p-stack pad-2 full gap-2">
  <!-- Terminal header: title + readout -->
  <div class="p-terminal-header">
    <span class="p-label-tech">INSTRUMENT</span>
    <span class="font-mono text-xs font-bold">120 BPM</span>
  </div>

  <!-- Main display -->
  <div class="p-center" style="flex:1">
    <div class="p-stat-value font-mono">25:00</div>
  </div>

  <!-- Controls in instrument cards -->
  <div class="p-card-instrument pad-2">
    <div class="p-stack gap-2">
      <span class="p-label-tech">CONTROL LABEL</span>
      <!-- controls here -->
    </div>
  </div>

  <!-- Action buttons -->
  <div class="p-row gap-2">
    <button class="p-btn p-btn-primary flex-1">START</button>
    <button class="p-btn p-btn-ghost flex-1">RESET</button>
  </div>

  <!-- Status footer -->
  <div class="p-split p-feed-meta">
    <span class="p-label-tech">STATUS</span>
    <span class="p-status-live">ACTIVE</span>
  </div>
</body>
```

**Reference implementations:** News (`builtinApps.ts`), Calculator (`builtinApps.ts`), World Clock (`worldClock.ts`), Translator (`translator.ts`), Focus Timer (`focusTimer.ts`), Metronome (`metronome.ts`), Synth Studio (`pianoSynth.ts`)

---

## Media Patterns

Patterns extracted from the 5 audio builtin apps (drum machine, drum pad, theremin, noise generator, morse trainer). These are documentation-only -- the patterns are inline CSS in each app's build file. Use them as reference for building future audio/media apps.

### 1. Step Sequencer Grid

**Origin:** Drum Machine (`drum-machine.build.ts`)

A grid of toggleable step cells arranged as rows (voices) x columns (steps). Each cell has active/inactive and current-playback states.

**HTML structure:**

```html
<div
  class="dm-grid"
  style="grid-template-columns: 40px repeat(16, 1fr); grid-template-rows: repeat(8, 28px)"
>
  <!-- For each voice row: -->
  <div class="dm-voice-label">KICK</div>
  <div class="dm-step" data-v="0" data-s="0"></div>
  <div class="dm-step on" data-v="0" data-s="1"></div>
  <!-- ... more steps ... -->
</div>
```

**Key CSS:**

| Property             | Value                                                                                                                                   | Purpose                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Grid layout          | `display: grid; gap: 3px`                                                                                                               | Step cells in rows and columns              |
| Voice label          | `font-size: 9px; font-family: var(--p-font-mono); font-weight: 600; color: var(--p-text-muted); text-transform: uppercase`              | Row labels for each voice                   |
| Step cell (inactive) | `min-width: 24px; min-height: 24px; border-radius: var(--p-radius-sm); background: var(--p-surface); border: 1px solid var(--p-border)` | Default off state                           |
| Step cell (active)   | `background: var(--p-accent-blue); border-color: var(--p-accent-blue); box-shadow: 0 0 6px rgba(68, 136, 255, 0.3)`                     | On state with blue glow                     |
| Step cell (current)  | `background: var(--p-accent-amber); border-color: var(--p-accent-amber); box-shadow: 0 0 8px rgba(255, 107, 43, 0.4)`                   | Current playback position                   |
| Velocity opacity     | `.vel-75 { opacity: 0.8 }`, `.vel-50 { opacity: 0.6 }`, `.vel-25 { opacity: 0.4 }`                                                      | Visual velocity indication via cell opacity |

**Usage notes:**

- Use `grid-template-columns` with a label column + `repeat(N, 1fr)` for flexible step counts (8/12/16/32).
- Use event delegation on the grid container for click handling.
- Alt+click for velocity cycling is a good pattern for step sequencers.
- Step count can be changed dynamically by re-rendering the grid with a different column count.

### 2. Transport Bar

**Origin:** Drum Machine (`drum-machine.build.ts`), Drum Pad (`drum-pad.build.ts`)

A compact control bar with play/stop/record buttons, BPM input, and position display.

**HTML structure:**

```html
<div class="dm-transport">
  <button class="p-btn p-btn-ghost p-btn-sm" id="playBtn">PLAY</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="stopBtn">STOP</button>
  <input class="dm-bpm-input" type="number" min="40" max="300" value="120" />
  <span class="dm-section-label">BPM</span>
  <span class="dm-position" id="posDisplay">--</span>
  <div style="flex:1"></div>
  <button class="p-btn p-btn-ghost p-btn-sm" id="exportBtn">EXPORT</button>
</div>
```

**Key CSS:**

| Property          | Value                                                                                                                                                                                                                           | Purpose                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Layout            | `display: flex; align-items: center; gap: 6px; flex-wrap: wrap`                                                                                                                                                                 | Horizontal button row          |
| BPM input         | `width: 44px; padding: 3px 4px; text-align: center; border-radius: var(--p-radius-sm); border: 1px solid var(--p-border); background: var(--p-surface); color: var(--p-text); font-size: 11px; font-family: var(--p-font-mono)` | Compact numeric input          |
| BPM input focus   | `border-color: var(--p-accent-blue); box-shadow: 0 0 8px rgba(68, 136, 255, 0.2)`                                                                                                                                               | Focus glow                     |
| Position display  | `font-size: 11px; font-family: var(--p-font-mono); font-weight: 600; font-variant-numeric: tabular-nums; min-width: 36px; text-align: center`                                                                                   | Fixed-width numeric readout    |
| Active play state | `style.color = 'var(--p-accent-blue)'`                                                                                                                                                                                          | Highlight active button via JS |
| Record indicator  | `width: 8px; height: 8px; border-radius: 50%; background: var(--p-accent-amber); animation: rec-pulse 1s ease-in-out infinite`                                                                                                  | Pulsing amber dot              |
| Section label     | `font-size: 9px; font-family: var(--p-font-mono); color: var(--p-text-muted); text-transform: uppercase; letter-spacing: 0.08em`                                                                                                | Small label next to controls   |

**Usage notes:**

- Use `p-btn p-btn-ghost p-btn-sm` for transport buttons -- consistent with terminal aesthetic.
- Position display uses `tabular-nums` for non-shifting numeric readouts.
- Record dot animation: `@keyframes rec-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`.
- Active button highlighting is done via inline `style.color` in JS, not CSS classes, to avoid class proliferation.

### 3. Waveform / Oscilloscope Display

**Origin:** Morse Trainer (`morse-trainer.build.ts`), Theremin (`theremin.build.ts`)

Real-time audio visualization using the SDK oscilloscope component or custom canvas drawing.

**SDK oscilloscope usage (Morse Trainer):**

```javascript
var toneAnalyser = ctx.createAnalyser();
toneAnalyser.fftSize = 2048;
// Connect tone source -> analyser -> destination
toneGain.connect(toneAnalyser);
toneAnalyser.connect(ctx.destination);

// Create oscilloscope in container
var oscInstance = prvctice.ui.oscilloscope(container, {
  analyser: toneAnalyser,
  color: 'var(--p-accent-blue)',
  lineWidth: 2,
});
```

**Container CSS:**

```css
.mt-waveform {
  height: 60px;
}
```

**Custom canvas overlay (Theremin):**

The theremin uses a full-area canvas with note markers and crosshair visualization drawn via `requestAnimationFrame`:

```javascript
// Note markers when scale lock active
canvasCtx.strokeStyle = 'rgba(68, 136, 255, 0.15)';
canvasCtx.lineWidth = 1;
// Draw vertical lines at note frequencies

// Crosshair at pointer position
canvasCtx.strokeStyle = 'rgba(68, 136, 255, 0.3)';
// Vertical + horizontal lines

// Ring indicator at pointer (size scales with volume)
canvasCtx.fillStyle = 'rgba(68, 136, 255, 0.3)';
canvasCtx.arc(pointerX, pointerY, 6 + vol * 20, 0, Math.PI * 2);
```

**Usage notes:**

- Connect a dedicated `AnalyserNode` to the tone source before the master bus.
- Use `fftSize: 2048` for time-domain waveform display.
- Container height of 60-80px works well for waveform strips.
- For canvas overlays, use `devicePixelRatio` scaling for crisp rendering.
- Accent-blue at 0.15-0.3 alpha for subtle grid lines and markers.

### 4. FX Chain Layout

**Origin:** Drum Pad (`drum-pad.build.ts`)

A horizontal row of effect knobs, each controlling one parameter of an audio effect.

**HTML structure:**

```html
<div>
  <span class="dp-section-label">FX BUS</span>
  <div class="dp-fx-row" id="fxRow">
    <!-- Knobs are added dynamically -->
  </div>
</div>
```

**JavaScript pattern:**

```javascript
var reverbKnob = prvctice.ui.knob(revWrap, {
  min: 0,
  max: 1,
  value: 0,
  step: 0.01,
  label: 'REVERB',
  format: function (v) {
    return Math.round(v * 100);
  },
  onChange: function (v) {
    reverbGain.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.02);
  },
});
// Repeat for DELAY, FILTER, DIST...
```

**Key CSS:**

```css
.dp-fx-row {
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  padding: 4px 0;
}
```

**Audio routing pattern:**

```
voice output -> filter -> dry gain -> destination
                       -> wet bus -> reverb -> reverb gain -> destination
                                  -> delay (+ feedback loop) -> delay gain -> destination
                                  -> distortion -> dist gain -> destination
```

**Usage notes:**

- Use `justify-content: space-around` for even knob spacing.
- Each effect uses a wet/dry gain node pattern -- dry signal passes through, wet signal mixes in.
- Use `setTargetAtTime` (not `setValueAtTime`) for smooth parameter changes.
- Common FX chain: filter -> reverb -> delay -> distortion. Filter first controls what feeds the chain.

### 5. Vertical Fader / Mixer Channel

**Origin:** Noise Generator (`noise-generator.build.ts`)

Vertical fader strips with labels and toggle buttons, laid out in a horizontal mixer row.

**HTML structure:**

```html
<div class="ng-channels">
  <!-- Repeat for each channel -->
  <div class="ng-channel">
    <div class="ng-channel-label">WHITE</div>
    <input class="ng-fader" type="range" min="0" max="100" value="0" data-fader="0" />
    <button class="ng-toggle" data-toggle="0">&#x25CF;</button>
  </div>
</div>
```

**Key CSS:**

```css
/* Mixer row */
.ng-channels {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  gap: 4px;
  flex: 1;
}

/* Channel strip */
.ng-channel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* Vertical fader (range input) */
.ng-fader {
  -webkit-appearance: none;
  appearance: none;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 28px;
  height: 120px;
  background: transparent;
}
.ng-fader::-webkit-slider-track {
  width: 4px;
  background: var(--p-surface-sunken);
  border-radius: 2px;
}
.ng-fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 10px;
  background: var(--p-text-secondary);
  border-radius: 2px;
  border: 1px solid var(--p-border);
  cursor: grab;
}
/* Repeat for ::-moz-range-track and ::-moz-range-thumb */

/* Toggle button */
.ng-toggle {
  all: unset;
  cursor: pointer;
  width: 16px;
  height: 16px;
  border-radius: var(--p-radius-sm);
  background: var(--p-surface);
  border: 1px solid var(--p-border);
}
.ng-toggle.on {
  background: rgba(68, 136, 255, 0.15);
  border-color: var(--p-accent-blue);
  color: var(--p-accent-blue);
}
```

**Usage notes:**

- `writing-mode: vertical-lr; direction: rtl` makes the range input vertical with high values at top.
- Both webkit and moz pseudo-elements must be styled for cross-browser support.
- Channel labels: 8-9px mono, uppercase, muted color.
- Toggle below fader: small square with accent-blue when on.
- Use `input` event (not `change`) on faders for real-time updates during drag.

### 6. Audio App Layout

**Origin:** All 5 audio apps share this common structure.

The standard layout structure for audio/media apps: terminal header, controls area, main content, footer.

**HTML structure:**

```html
<body class="p-stack pad-2 full gap-1">
  <!-- 1. Terminal header -->
  <div class="p-terminal-header">
    <span class="p-label-tech">APP NAME</span>
    <span class="p-label-tech" style="color:var(--p-text-muted)">STATUS</span>
  </div>

  <!-- 2. Controls strip (buttons, selectors, knobs) -->
  <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center">
    <!-- mode buttons, bank selectors, step count, etc. -->
  </div>

  <!-- 3. Main content area (fills remaining space) -->
  <div style="flex:1; min-height:0">
    <!-- step grid / pad grid / playing surface / faders / modes -->
  </div>

  <!-- 4. Footer (stats or status) -->
  <div style="height:10px">
    <!-- stats row or status text -->
  </div>
</body>
```

**Shared patterns across all apps:**

| Pattern         | CSS/JS                                                                                                  | Description                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Body shell      | `class="p-stack pad-2 full gap-1"`                                                                      | Vertical flex, padded, full viewport, 4px gap |
| Terminal header | `class="p-terminal-header"` with two `p-label-tech` spans                                               | App name left, status/mode right              |
| Button groups   | `display: flex; gap: 2-3px` with small styled buttons                                                   | Mode selectors, bank selectors, step count    |
| Active button   | `color: var(--p-accent-blue); border-color: var(--p-accent-blue); background: rgba(68, 136, 255, 0.08)` | Selected state for toggle buttons             |
| Knobs row       | `display: flex; justify-content: space-around; align-items: flex-start`                                 | Row of `prvctice.ui.knob()` instances         |
| Stats row       | `font-size: 10px; font-family: var(--p-font-mono); font-variant-numeric: tabular-nums`                  | Numeric readout footer                        |

**Button styling pattern (small toggle buttons):**

```css
.app-btn {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: var(--p-radius-sm);
  background: var(--p-surface);
  border: 1px solid var(--p-border);
  color: var(--p-text-muted);
  font-size: 9-10px;
  font-family: var(--p-font-mono);
  font-weight: 600;
  letter-spacing: 0.05em;
  transition: all 80-100ms ease;
}
.app-btn:hover {
  background: var(--p-border);
  color: var(--p-text);
}
.app-btn.active {
  color: var(--p-accent-blue);
  border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}
```

**Lifecycle pattern:**

```javascript
prvctice.onReady(function () {
  var ctx = prvctice.audio.createContext();
  // Build UI, wire events, init state

  prvctice.onDispose(function () {
    // Stop audio, clear intervals/timeouts, dispose knobs/meters/oscilloscopes
  });
});
```

**Reference implementations:** Drum Machine (`drum-machine.build.ts`), Drum Pad (`drum-pad.build.ts`), Theremin (`theremin.build.ts`), Noise Generator (`noise-generator.build.ts`), Morse Trainer (`morse-trainer.build.ts`)

---

_Last verified: 2026-02-20_
