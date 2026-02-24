# Prvctice Design Tokens

Design tokens are the atomic building blocks of our visual language. They provide a single source of truth for colors, typography, spacing, motion, and more. By using tokens instead of hard-coded values, we ensure consistency across the application and make theme switching seamless.

**Source file:** `web/styles/tokens.css`

---

## Quick Start

```css
/* Always use tokens, never hard-code values */

/* BAD */
.my-component {
  color: #ffffff;
  padding: 16px;
  transition: opacity 0.2s ease;
}

/* GOOD */
.my-component {
  color: var(--color-text-primary);
  padding: var(--space-6);
  transition: opacity var(--duration-short) var(--motion-ease-standard);
}
```

---

## Color Tokens

### Semantic Text Colors

Use these for all text content. They automatically adjust for light/dark themes.

| Token                    | Dark Theme               | Light Theme        | Usage                              |
| ------------------------ | ------------------------ | ------------------ | ---------------------------------- |
| `--color-text-primary`   | `rgb(255 255 255 / 95%)` | `rgb(0 0 0 / 90%)` | Primary body text, headings        |
| `--color-text-secondary` | `rgb(255 255 255 / 70%)` | `rgb(0 0 0 / 65%)` | Secondary text, descriptions       |
| `--color-text-muted`     | `rgb(255 255 255 / 50%)` | `rgb(0 0 0 / 45%)` | Tertiary text, timestamps          |
| `--color-text-hint`      | `rgb(255 255 255 / 40%)` | `rgb(0 0 0 / 35%)` | Hints, placeholders                |
| `--color-text-on-accent` | `#071028`                | —                  | Text on accent-colored backgrounds |

```css
.heading {
  color: var(--color-text-primary);
}
.description {
  color: var(--color-text-secondary);
}
.timestamp {
  color: var(--color-text-muted);
}
```

### Status Colors

Semantic colors for feedback states. Use consistently across the app.

| Token                    | Value             | Usage                           |
| ------------------------ | ----------------- | ------------------------------- |
| `--color-status-success` | `#22c55e`         | Success messages, confirmations |
| `--color-status-warning` | `#f59e0b`         | Warnings, caution states        |
| `--color-status-error`   | `#ef4444`         | Errors, destructive actions     |
| `--color-status-info`    | `rgb(84 114 255)` | Informational messages          |

### Button Colors

Complete token set for button variants.

**Primary Button (filled)**
| Token | Value |
|-------|-------|
| `--color-btn-primary-bg` | `#fff` |
| `--color-btn-primary-bg-hover` | `#f0f4ff` |
| `--color-btn-primary-text` | `var(--color-text-on-accent)` |
| `--color-btn-primary-shadow` | `rgb(84 114 255 / 35%)` |
| `--color-btn-primary-border` | `rgb(255 255 255 / 40%)` |

**Secondary Button (outlined)**
| Token | Dark Theme | Light Theme |
|-------|------------|-------------|
| `--color-btn-secondary-text` | `rgb(255 255 255 / 92%)` | `rgb(0 0 0 / 85%)` |
| `--color-btn-secondary-border` | `rgb(255 255 255 / 35%)` | `rgb(0 0 0 / 25%)` |
| `--color-btn-secondary-bg-hover` | `rgb(255 255 255 / 8%)` | `rgb(0 0 0 / 6%)` |

**Ghost Button**
| Token | Dark Theme | Light Theme |
|-------|------------|-------------|
| `--color-btn-ghost-text` | `rgb(255 255 255 / 80%)` | `rgb(0 0 0 / 70%)` |
| `--color-btn-ghost-bg-hover` | `rgb(255 255 255 / 10%)` | `rgb(0 0 0 / 8%)` |

**Danger Button**
| Token | Value |
|-------|-------|
| `--color-btn-danger-bg` | `#dc2626` |
| `--color-btn-danger-bg-hover` | `#b91c1c` |
| `--color-btn-danger-text` | `#fff` |

### Form/Input Colors

| Token                        | Dark Theme               | Light Theme        | Usage                    |
| ---------------------------- | ------------------------ | ------------------ | ------------------------ |
| `--color-input-bg`           | `rgb(255 255 255 / 6%)`  | `rgb(0 0 0 / 4%)`  | Input background         |
| `--color-input-bg-focus`     | `rgb(255 255 255 / 8%)`  | `rgb(0 0 0 / 6%)`  | Focused input background |
| `--color-input-border`       | `rgb(255 255 255 / 12%)` | `rgb(0 0 0 / 12%)` | Input border             |
| `--color-input-border-focus` | `rgb(84 114 255 / 60%)`  | —                  | Focused input border     |
| `--color-input-border-error` | `#f87171`                | —                  | Error state border       |
| `--color-input-text`         | `rgb(255 255 255 / 95%)` | `rgb(0 0 0 / 90%)` | Input text               |
| `--color-input-placeholder`  | `rgb(255 255 255 / 40%)` | `rgb(0 0 0 / 40%)` | Placeholder text         |
| `--color-input-label`        | `rgb(255 255 255 / 90%)` | `rgb(0 0 0 / 80%)` | Form labels              |

### Surface & Background Colors

| Token                      | Value                 | Usage                                |
| -------------------------- | --------------------- | ------------------------------------ |
| `--color-surface-elevated` | `rgb(7 16 40 / 95%)`  | Elevated cards, modals               |
| `--color-surface-overlay`  | `rgb(25 25 25 / 85%)` | Overlay surfaces                     |
| `--color-backdrop`         | `rgb(4 7 18 / 85%)`   | Modal backdrops                      |
| `--color-backdrop-heavy`   | `rgb(0 0 0 / 75%)`    | Heavy overlay (e.g., video backdrop) |

### Focus & Accessibility

| Token                | Value                               | Usage                      |
| -------------------- | ----------------------------------- | -------------------------- |
| `--color-focus-ring` | `rgb(0 125 200 / 60%)`              | Focus ring color           |
| `--focus-ring`       | `0 0 0 2px var(--color-focus-ring)` | Complete focus ring shadow |

```css
.focusable:focus-visible {
  box-shadow: var(--focus-ring);
}
```

### Toggle Colors

| Token                   | Dark Theme               | Light Theme        |
| ----------------------- | ------------------------ | ------------------ |
| `--color-toggle-bg-off` | `rgb(255 255 255 / 15%)` | `rgb(0 0 0 / 12%)` |
| `--color-toggle-bg-on`  | `#3b82f6`                | —                  |
| `--color-toggle-thumb`  | `#fff`                   | —                  |

---

## Typography Tokens

### Font Families

All custom fonts are loaded from Google Fonts (`fonts.googleapis.com`).

| Token                   | Value                                              | Usage                                                       |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `--font-family-sans`    | `system-ui, -apple-system, 'Segoe UI', sans-serif` | Body text, UI elements                                      |
| `--font-family-display` | `'Gothic A1', sans-serif`                          | Headlines, assistant messages (weights: 300, 400, 500, 600) |
| `--font-family-serif`   | `'Crimson Pro', serif`                             | User messages, display text (weights: 300, 400)             |
| `--font-family-mono`    | `'IBM Plex Mono', monospace`                       | Code, technical content (weights: 400, 500)                 |

### Font Sizes

| Token              | Value      | Pixels | Usage                      |
| ------------------ | ---------- | ------ | -------------------------- |
| `--font-size-xs`   | `0.75rem`  | 12px   | Captions, badges, metadata |
| `--font-size-sm`   | `0.875rem` | 14px   | Secondary text, labels     |
| `--font-size-base` | `1rem`     | 16px   | Body text default          |
| `--font-size-md`   | `1.125rem` | 18px   | Emphasized body text       |
| `--font-size-lg`   | `1.25rem`  | 20px   | Section headings           |
| `--font-size-xl`   | `1.5rem`   | 24px   | Page headings              |
| `--font-size-2xl`  | `2rem`     | 32px   | Hero headings              |

**Legacy:** `--font-size-body: 12px` — Use `--font-size-xs` instead.

### Line Heights

| Token                   | Value | Usage                  |
| ----------------------- | ----- | ---------------------- |
| `--line-height-tight`   | `1.2` | Headings, short labels |
| `--line-height-body`    | `1.4` | Body text default      |
| `--line-height-relaxed` | `1.6` | Long-form content      |

```css
h1 {
  font-family: var(--font-family-display);
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
}

p {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-body);
}
```

---

## Spacing Scale

Our spacing scale follows a consistent progression. Use these tokens for all margins, padding, and gaps.

| Token        | Value  | Usage                     |
| ------------ | ------ | ------------------------- |
| `--space-1`  | `2px`  | Micro spacing, icon gaps  |
| `--space-2`  | `4px`  | Tight spacing             |
| `--space-3`  | `6px`  | Small component padding   |
| `--space-4`  | `8px`  | Default small spacing     |
| `--space-5`  | `12px` | Medium spacing            |
| `--space-6`  | `16px` | Default component spacing |
| `--space-7`  | `20px` | Large spacing             |
| `--space-8`  | `24px` | Section spacing           |
| `--space-10` | `32px` | Major section breaks      |

**Note:** `--space-9` is intentionally skipped to create a clearer jump.

```css
.card {
  padding: var(--space-6);
  gap: var(--space-4);
}

.section {
  margin-bottom: var(--space-10);
}
```

---

## Border Radius

| Token           | Value   | Usage                    |
| --------------- | ------- | ------------------------ |
| `--radius-sm`   | `6px`   | Small buttons, tags      |
| `--radius-md`   | `8px`   | Default component radius |
| `--radius-lg`   | `14px`  | Cards, larger surfaces   |
| `--radius-xl`   | `24px`  | Modals, large panels     |
| `--radius-pill` | `999px` | Pill buttons, badges     |

```css
.button {
  border-radius: var(--radius-md);
}
.card {
  border-radius: var(--radius-lg);
}
.badge {
  border-radius: var(--radius-pill);
}
```

---

## Motion Tokens

### Durations

| Token                            | Value           | Usage                                |
| -------------------------------- | --------------- | ------------------------------------ |
| `--duration-short`               | `0.2s` (200ms)  | Micro-interactions, hovers           |
| `--duration-medium`              | `0.25s` (250ms) | Standard transitions                 |
| `--duration-long`                | `0.6s` (600ms)  | Complex animations, page transitions |
| `--motion-duration-fade`         | `0.35s` (350ms) | Fade in/out effects                  |
| `--motion-duration-shimmer`      | `8s`            | Standard shimmer loops               |
| `--motion-duration-shimmer-fast` | `5s`            | Faster shimmer effect                |
| `--motion-duration-shimmer-slow` | `12s`           | Slower, subtle shimmer               |

### Easing Functions

| Token                    | Value                            | Usage                         |
| ------------------------ | -------------------------------- | ----------------------------- |
| `--easing-snap`          | `cubic-bezier(0.25, 1, 0.5, 1)`  | Snappy, responsive feel       |
| `--motion-ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)`   | Standard Material-like easing |
| `--motion-ease-emphasis` | `cubic-bezier(0.33, 1, 0.68, 1)` | Emphasized motion             |
| `--motion-ease-hover`    | `cubic-bezier(0.22, 1, 0.36, 1)` | Smooth hover transitions      |

```css
.button {
  transition:
    background-color var(--duration-short) var(--motion-ease-standard),
    transform var(--duration-short) var(--easing-snap);
}

.button:hover {
  transform: scale(1.02);
}
```

### Reduced Motion

The token system automatically respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
  }
}
```

**No additional work required** — all animations using tokens will respect this preference.

---

## Glass & Surface Effects

### Frosted Glass Tokens

Italian luxury boutique-inspired glass effects.

| Token                          | Usage                        |
| ------------------------------ | ---------------------------- |
| `--surface-glass-strong`       | Strong glass tint            |
| `--border-glass-strong`        | Glass border                 |
| `--glass-surface-gradient`     | Subtle surface gradient      |
| `--glass-border-subtle`        | Subtle glass border          |
| `--shadow-glass-inset`         | Inset shadow for depth       |
| `--shadow-glass-surface`       | Default glass surface shadow |
| `--shadow-glass-surface-hover` | Elevated hover shadow        |
| `--shadow-glass-glow`          | Soft ambient glow            |
| `--glass-shadow-idle`          | Idle state shadow            |
| `--glass-shadow-active`        | Active/focused state shadow  |

```css
.glass-card {
  background: var(--glass-surface-gradient);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-idle);
  transition: box-shadow var(--duration-medium) var(--motion-ease-hover);
}

.glass-card:hover {
  box-shadow: var(--glass-shadow-active);
}
```

---

## Component-Specific Tokens

### Skill Pills

Complete token set for the skill/command pill system.

| Token                       | Usage                       |
| --------------------------- | --------------------------- |
| `--color-pill-bg`           | Pill background             |
| `--color-pill-bg-hover`     | Hover state                 |
| `--color-pill-border`       | Border color                |
| `--color-pill-border-hover` | Hover border                |
| `--color-pill-icon`         | Icon color                  |
| `--color-pill-title`        | Title text                  |
| `--color-pill-badge`        | Badge text                  |
| `--color-pill-mode`         | Mode indicator              |
| `--color-pill-separator`    | Separator lines             |
| `--color-pill-divider`      | Section dividers            |
| `--color-pill-more-text`    | "More" indicator text       |
| `--color-pill-more-bg`      | "More" indicator background |

**Step tokens (for multi-step skills):**
| Token | Usage |
|-------|-------|
| `--color-step-bg` | Step background |
| `--color-step-number` | Step number |
| `--color-step-icon` | Step icon |
| `--color-step-title` | Step title |
| `--color-step-type` | Step type indicator |

**Chain mode accents:**
| Token | Value | Usage |
|-------|-------|-------|
| `--color-chain-accent` | `#64c8ff` | Chain mode (sequential) |
| `--color-pipe-accent` | `#c864ff` | Pipe mode (data flow) |
| `--color-modify-accent` | `#64ff96` | Modify mode |

### Skill Color Dots

12-color palette for skill categorization/identification:

| Token            | Color             |
| ---------------- | ----------------- |
| `--skill-dot-1`  | Red (#ef4444)     |
| `--skill-dot-2`  | Orange (#f97316)  |
| `--skill-dot-3`  | Yellow (#eab308)  |
| `--skill-dot-4`  | Green (#22c55e)   |
| `--skill-dot-5`  | Teal (#14b8a6)    |
| `--skill-dot-6`  | Cyan (#06b6d4)    |
| `--skill-dot-7`  | Blue (#3b82f6)    |
| `--skill-dot-8`  | Purple (#8b5cf6)  |
| `--skill-dot-9`  | Magenta (#d946ef) |
| `--skill-dot-10` | Pink (#ec4899)    |
| `--skill-dot-11` | Stone (#78716c)   |
| `--skill-dot-12` | Slate (#64748b)   |

### Merge Preview

Tokens for the skill merge/combine preview:

| Token                         | Usage                      |
| ----------------------------- | -------------------------- |
| `--color-merge-pill-bg`       | Preview pill background    |
| `--color-merge-pill-border`   | Preview border             |
| `--color-merge-pill-glow`     | Ambient glow               |
| `--color-merge-ready-border`  | Ready-to-merge border      |
| `--color-merge-ready-glow`    | Ready glow effect          |
| `--color-merge-source`        | Source indicator (#64c8ff) |
| `--color-merge-target`        | Target indicator (#64ff96) |
| `--color-merge-progress-fill` | Progress bar fill          |

### Zone Highlights

Tokens for drag-and-drop zone indicators:

| Token                              | Usage                       |
| ---------------------------------- | --------------------------- |
| `--color-zone-border`              | Default zone border         |
| `--color-zone-bg`                  | Default zone background     |
| `--color-zone-near-border`         | Near-proximity border       |
| `--color-zone-near-bg`             | Near-proximity background   |
| `--color-zone-active-border`       | Active drop zone border     |
| `--color-zone-active-bg`           | Active drop zone background |
| `--color-zone-active-glow`         | Active zone glow            |
| `--color-zone-incompatible-border` | Invalid drop zone           |
| `--color-zone-incompatible-bg`     | Invalid zone background     |

### Weather Widget

Day/night aware widget tokens:

**Day mode:**

- `--color-widget-day-surface`
- `--color-widget-day-border`
- `--color-widget-day-overlay`
- `--color-widget-day-glow-active`
- `--color-widget-day-glow-idle`
- `--color-widget-day-tint`

**Night mode:**

- `--color-widget-night-surface`
- `--color-widget-night-border`
- `--color-widget-night-overlay`
- `--color-widget-night-glow-active`
- `--color-widget-night-glow-idle`
- `--color-widget-night-tint`

**Shared:**

- `--color-widget-text`
- `--color-widget-header`
- `--color-widget-title`
- `--color-widget-btn`
- `--color-widget-resizer-border`

### YouTube Player

| Token                             | Usage                 |
| --------------------------------- | --------------------- |
| `--color-yt-backdrop`             | Video backdrop        |
| `--color-yt-card-border`          | Card border           |
| `--color-yt-card-border-attached` | Attached state border |
| `--color-yt-header-text`          | Header text           |
| `--color-yt-title`                | Video title           |
| `--color-yt-btn`                  | Button color          |
| `--color-yt-btn-hover`            | Button hover          |
| `--color-yt-frame-bg`             | Frame background      |

### Message Editing

| Token                          | Usage               |
| ------------------------------ | ------------------- |
| `--color-edit-textarea-border` | Textarea border     |
| `--color-edit-textarea-bg`     | Textarea background |
| `--color-edit-textarea-focus`  | Focus border        |
| `--color-edit-btn-bg-hover`    | Button hover        |
| `--color-edit-save-bg`         | Save button         |
| `--color-edit-cancel-bg`       | Cancel button       |

---

## Layout Tokens

### Z-Index Scale

| Token             | Value   | Usage               |
| ----------------- | ------- | ------------------- |
| `--z-input-bar`   | `900`   | Input bar           |
| `--z-floating-ui` | `9999`  | Tooltips, dropdowns |
| `--z-modal`       | `10000` | Modals, dialogs     |

### Layout Helpers

| Token                  | Value              | Usage               |
| ---------------------- | ------------------ | ------------------- |
| `--layout-edge-gutter` | `24px`             | Screen edge spacing |
| `--layout-footer-gap`  | `12px`             | Footer element gaps |
| `--layout-modal-width` | `min(440px, 92vw)` | Modal max width     |

### Breakpoints (Reference)

These are for reference in `@media` queries (CSS custom properties cannot be used in media queries):

| Token             | Value    |
| ----------------- | -------- |
| `--breakpoint-xs` | `480px`  |
| `--breakpoint-sm` | `768px`  |
| `--breakpoint-md` | `1024px` |
| `--breakpoint-lg` | `1280px` |
| `--breakpoint-xl` | `1440px` |

### Notes Pane Layout

| Token                         | Value                       |
| ----------------------------- | --------------------------- |
| `--notes-pane-top-offset`     | `clamp(68px, 10vh, 96px)`   |
| `--notes-pane-bottom-offset`  | `clamp(136px, 18vh, 200px)` |
| `--notes-pane-horizontal-gap` | `clamp(28px, 6vw, 88px)`    |
| `--notes-pane-row-gap`        | `clamp(14px, 2vh, 28px)`    |
| `--notes-toolbar-width`       | `52px`                      |
| `--notes-toolbar-gap`         | `14px`                      |

### Chat Layout

| Token                            | Value   |
| -------------------------------- | ------- |
| `--chat-window-max-width`        | `720px` |
| `--chat-window-min-width`        | `310px` |
| `--chat-content-max-width`       | `680px` |
| `--chat-content-optimal-measure` | `68ch`  |
| `--chat-window-padding-x`        | `10%`   |
| `--chat-window-padding-top`      | `70px`  |
| `--chat-input-offset`            | `90px`  |

---

## Theming

### How It Works

Themes override tokens by redefining them on `body.{theme-name}`. The token values cascade naturally.

**Dark themes (default):** Use `:root` values.

**Light themes:** Override text, button, input, and surface tokens:

- `body.light-theme`
- `body.vitti-theme`
- `body.share-bear-theme`
- `body.fragile-theme`
- `body.eva-theme`
- `body.high-contrast-theme`

**Dark themes with light pills:**

- `body.night-theme`
- `body.vera-baxter-theme`

### Creating a Theme

1. Create a theme file in `web/themes/`
2. Override only the tokens you need
3. The body class applies your overrides

```css
/* Example: custom-theme.css */
body.custom-theme {
  --color-text-primary: rgb(230 230 230 / 100%);
  --color-surface-elevated: rgb(20 20 30 / 95%);
  /* Only override what changes */
}
```

---

## Utility Classes

### Screen Reader Only

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

Use for content that should be announced by screen readers but not visible.

### Magnetic Snap Classes

For the magnetic drag-and-drop system:

| Class                       | Purpose                      |
| --------------------------- | ---------------------------- |
| `.magnetic-dragging`        | Applied while dragging       |
| `.magnetic-target-glow`     | Glow effect on valid targets |
| `.magnetic-attached`        | Base attached state          |
| `.magnetic-attached-top`    | Attached to top edge         |
| `.magnetic-attached-bottom` | Attached to bottom edge      |
| `.magnetic-attached-left`   | Attached to left edge        |
| `.magnetic-attached-right`  | Attached to right edge       |

---

## Best Practices

1. **Always use tokens** — Never hard-code colors, spacing, or timing values.

2. **Semantic over literal** — Use `--color-text-secondary` not `--color-gray-60`.

3. **Let themes do the work** — Components using tokens automatically support all themes.

4. **Motion tokens for consistency** — All transitions should use duration and easing tokens.

5. **Check reduced motion** — The global `prefers-reduced-motion` rule handles this, but avoid creating animations that bypass tokens.

6. **Surface hierarchy** — Use `--color-surface-elevated` for cards over backgrounds, `--color-surface-overlay` for overlays.

7. **Focus states are mandatory** — Always use `--focus-ring` or `--color-focus-ring` for keyboard focus.
