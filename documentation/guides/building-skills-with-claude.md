# Building Skills

A guide for creating prvctice skills using an AI coding assistant. Works with any AI tool that can read and write files.

## What is a Skill?

A skill is a markdown file with YAML frontmatter that tells the AI how to behave when a user's message matches certain keywords. Drop the file in the right directory, restart the server, and it's live. No code changes needed.

There are two types:

| Type         | Directory               | Purpose                                                      | Example                                       |
| ------------ | ----------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| **Agent**    | `src/skills/agents/`    | Defines a persona with tools and goals                       | "Hunt sources, verify, synthesize"            |
| **Playbook** | `src/skills/playbooks/` | Defines a multi-step task workflow with a Definition of Done | "8-20 tracks with YouTube links + commentary" |

**When to use an agent:** You want a general capability. "Be a researcher." "Be a curator."
**When to use a playbook:** You want a specific output. "Give me a film program." "Build me a playlist."

## Prompts

Copy-paste these prompts into your AI coding assistant to create skills quickly.

### Simple: A modifier skill that changes response tone

```
Create a new prvctice agent skill that makes responses more concise and direct.
Put it in src/skills/agents/. Use the existing researcher.md as a reference for
the YAML frontmatter format. Keywords should include: concise, brief, short, direct, terse.
```

### Medium: A research playbook with tool routing

```
Create a new prvctice playbook skill for architecture research. It should use
web_search and wikipedia to find information about buildings, architects, and
movements. Put it in src/skills/playbooks/. Use film-research.md as a reference
for the format. The Definition of Done should specify 3-5 results with architect
credits and a connecting theme.
```

### Advanced: A domain-specific curation playbook

```
Create a new prvctice playbook skill for podcast curation. It should use
web_search and youtube_search to find podcast episodes around a theme. Put it in
src/skills/playbooks/. Use music-playlist.md as the format reference. DoD:
5-10 episodes with links + one-line descriptions + a framing paragraph explaining
the theme. Favor niche/independent podcasts over top-chart entries.
```

## Skill Format Reference

Every skill file has the same structure: YAML frontmatter between `---` delimiters, followed by a markdown body.

### Required Frontmatter Fields

```yaml
---
name: My Skill Name # Display name
version: 1.0.0 # Semver format (must match X.Y.Z)
category: research # One of: research, curation, workflow, tool, behavioral (or custom)
---
```

### Optional Frontmatter Fields

```yaml
---
name: My Skill Name
version: 1.0.0
category: research
description: One-line summary of what this skill does
triggers:
  keywords: [word1, word2, word3] # Words that activate this skill
  intent: 'When the user wants to...' # Natural language description
dependencies:
  - name: another-skill
    optional: true
model_hints:
  preferred_provider: anthropic
---
```

### Trigger Keywords

Keywords are how the skill registry matches user messages to skills. Tips:

- Include both formal and informal variants: `[film, movie, cinema, watch]`
- Multi-word keywords require all words present in the message
- More keyword matches = higher score = more likely to be selected
- The `intent` field is used for nuanced matching beyond keywords

### Body (Markdown)

For **agents**, the body typically includes a goal statement and available tools:

```markdown
**Goal:** Hunt sources, verify, synthesize

**Core Tools:** web_search, wikipedia_search, youtube_search
```

For **playbooks**, the body includes step-by-step workflow and a Definition of Done (DoD):

```markdown
**Workflow:**

1. Identify the user's theme or concept
2. Call film_search with appropriate filters
3. Organize results by connecting theme

**Definition of Done:**

- 3-6 film cards with crew credits
- One-line connecting theme
- Film results auto-display; provide context/commentary, not markdown links
```

## Available Tools

Skills can reference these tools in their body. The AI uses them when the skill is active:

| Tool               | What it does                                                           |
| ------------------ | ---------------------------------------------------------------------- |
| `web_search`       | Search the web with citations                                          |
| `wikipedia_search` | Search Wikipedia                                                       |
| `youtube_search`   | Search YouTube (batch)                                                 |
| `film_search`      | Search films by director, movement, era, genre, company                |
| `book_search`      | Search Open Library + Google Books                                     |
| `essay_search`     | Search Semantic Scholar                                                |
| `moodboard_search` | Aggregate images from Met, Art Institute Chicago, Europeana, Wikimedia |
| `vision_describe`  | Analyze images, extract colors                                         |
| `save_note`        | Persist text to notes                                                  |
| `batch_tools`      | Run 2+ tools in parallel                                               |

## Validation Checklist

The Zod parser (`web/types/skillSchema.ts`) checks:

- `name` is a non-empty string
- `version` matches semver format (`1.0.0`, `1.2.3-beta`)
- `category` is a non-empty string (or array of strings)
- If `triggers` is present, `keywords` is an array of strings and `intent` is a string
- If `dependencies` is present, each entry has a `name` string

If validation fails, the file is skipped with a console warning on server start.

## Testing

After creating a skill file:

1. Restart the dev server: `npm run web:dev`
2. Check the console for any `[skillRegistry] Skipping unparseable file` warnings
3. Send a message containing your trigger keywords
4. The skill should influence the AI response (check for the `skills_loaded` indicator in dev tools)

## Reference

- [Creating a Skill](./creating-skill.md) -- Detailed step-by-step guide
- [Skill Coordinator System](../SKILL_COORDINATOR_SYSTEM.md) -- Full system architecture
- `src/skills/agents/researcher.md` -- Simplest agent reference
- `src/skills/playbooks/music-playlist.md` -- Playbook reference with DoD
- `web/types/skillSchema.ts` -- Zod validation schema

---

_Last verified: 2026-02-20_
