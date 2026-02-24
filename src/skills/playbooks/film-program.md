---
name: Film Program
version: 1.0.0
category: curation
description: Curated film programs with structured cards and connective themes
triggers:
  keywords: [film program, double feature, screening, film series, movie night, marathon, watchlist]
  intent: 'User wants a curated set of films organized around a theme or concept'
---

**DoD:** Call `film_search` for structured film cards + opening framing paragraph + connective theme. Use `youtube_search` only for trailers/clips after film_search results.
