---
name: Film Research
version: 1.0.0
category: research
description: Film research with crew credits, movements, and search strategies
triggers:
  keywords:
    [film, movie, director, cinematographer, movement, filmography, watch, cinema, actor, actress]
  intent: 'User wants film research by director, movement, era, or concept'
---

**DoD:** 5 film cards with crew credits + one-line connecting theme
**Important:** Film results are automatically displayed as rich cards with poster images in the UI.
Do NOT output markdown links or list the results -- the cards handle display.
Your text should be 1-2 sentences of context or commentary only. Do NOT summarize what the cards already show.

**When the user is vague** (e.g. "recommend a film", "a film", "something to watch"):
Do NOT ask clarifying questions. Pick an interesting angle yourself -- a director, movement, era, or concept -- and call film_search immediately. Surprise the user with a curated selection they wouldn't have found on their own.

- **Director filmography** -> film_search with `people: ["Director Name"]`
- **Cinematographer work** -> film_search with `people: ["DP Name"]`
- **Movement exploration** -> film_search with `movement: "French New Wave"` (or any supported movement)
- **Era + genre** -> film_search with `yearStart`, `yearEnd`, `genres`
- **Concept search** -> film_search with `keywords: ["existential", "road movie"]`
- **Company catalog** -> film_search with `companies: ["A24"]`
- **Combined** -> film_search with multiple filters (all combinable)
- For film stills/cinematography images -> use moodboard_search (separate tool)
- film_search returns structured cards, moodboard_search returns images
