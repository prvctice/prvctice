# Theme CSS Conventions

This folder contains app theme styles. The visual look-and-feel is locked and must not change. Any edits should be mechanical (formatting, comments, structure), preserving selector order and property values.

## Golden Rules

- Preserve selector order: do not reorder rules across the file.
- Preserve property order inside rules (fallbacks and overrides rely on order).
- Do not modify color values, gradients, shadows, sizes, or timing.
- Only add non-functional comments and headers; avoid renaming selectors.
- If adding new selectors, scope under the body theme class, e.g., `body.light-theme ...`.

## File Structure

Each theme file follows this structure:

1. Header comment block with theme name and intent
2. `body.<theme>` block with CSS variables and base colors
3. Theme-scoped controls (e.g., `#bar`, `.skills-toggle`, button states)
4. Links, message content, and utility elements under `body.<theme> ...`
5. Optional shimmer overlay `#bar::before` referencing the shared `shimmer-pan` keyframe
6. `@media (prefers-reduced-motion: reduce)` to disable animations

## Required Variables

Inside `body.<theme>` define these tokens to ensure component consistency:

- `--skill-power-color`
- `--skill-power-color-shadow`
- `--link-color`
- `--input-button-color`
- `--bar-background`
- `--menu-background`

## Preview

Open `index.html` in this folder to switch between themes and verify scoped styles. The preview uses IDs/classes from the app and does not alter theme CSS.

## Adding a New Theme

1. Copy an existing file as a starting point.
2. Update the header block with the theme name and file.
3. Adjust only the variable values and selectors for the new theme.
4. Keep order consistent and test via `index.html`.
