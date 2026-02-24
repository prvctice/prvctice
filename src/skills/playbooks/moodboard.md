---
name: Moodboard
version: 1.0.0
category: curation
description: Visual mood boards from museum and gallery collections
triggers:
  keywords: [moodboard, mood board, visual, aesthetic, inspiration, visual research]
  intent: 'User wants a visual collection of images around a theme or aesthetic'
---

**DoD:** Call `moodboard_search` (8-15 images) + one-line connective motif + optional context links
**Important:** Moodboard images are automatically displayed as a visual grid in the UI. Do NOT output markdown image syntax (`![](url)`) in your text -- the images are already shown. Your text should only include the motif description and optional context links.
