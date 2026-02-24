# How to: Create a Skill

> **Prerequisites:** Familiarity with YAML frontmatter and markdown
> **Time estimate:** 15-30 minutes
> **Difficulty:** Beginner

## Architecture Context

Skills in prvctice are markdown files with YAML frontmatter. The skill registry (`src/services/skillRegistry.ts`) auto-discovers all `.md` files inside `src/skills/agents/` and `src/skills/playbooks/` on server start. There is no manual registration step -- drop a file and restart.

Each skill's frontmatter is validated against `SkillFrontmatterSchema` (defined in `web/types/skillSchema.ts` using Zod). The registry parses trigger keywords and intent descriptions to match skills to user messages at runtime.

For the full system architecture including keyword scoring, usage-weighted ranking, and prompt composition, see [SKILL_COORDINATOR_SYSTEM.md](../SKILL_COORDINATOR_SYSTEM.md). For boundary definitions, see [CODEMAP.md](../CODEMAP.md) (Skill System boundary).

You will touch exactly **1 file**: a new markdown file. No code changes needed.

## Step-by-Step

### Step 1: Decide between agent and playbook

prvctice has two skill types:

| Type         | Directory               | Purpose                                | Example                                  |
| ------------ | ----------------------- | -------------------------------------- | ---------------------------------------- |
| **Agent**    | `src/skills/agents/`    | Defines a persona with tools and goals | Researcher, Curator, Editor              |
| **Playbook** | `src/skills/playbooks/` | Defines a multi-step task workflow     | Film research, Music playlist, Moodboard |

**Agents** answer "who should handle this?" -- they define capability profiles.
**Playbooks** answer "how should this task be done?" -- they define step sequences.

### Step 2: Create the markdown file

Create a `.md` file in the appropriate directory:

- Agent: `src/skills/agents/<your-skill>.md`
- Playbook: `src/skills/playbooks/<your-skill>.md`

### Step 3: Write YAML frontmatter matching SkillFrontmatterSchema

The frontmatter must pass validation against `SkillFrontmatterSchema` from `web/types/skillSchema.ts`. Here are the fields:

| Field               | Required | Type                   | Description                                 |
| ------------------- | -------- | ---------------------- | ------------------------------------------- |
| `name`              | Yes      | `string`               | Display name for the skill                  |
| `version`           | Yes      | `string` (semver)      | Version like `1.0.0`                        |
| `category`          | Yes      | `string` or `string[]` | One or more categories                      |
| `description`       | No       | `string`               | Short description of what the skill does    |
| `triggers`          | No       | `object`               | Keyword triggers and intent description     |
| `triggers.keywords` | No       | `string[]`             | Words that activate this skill              |
| `triggers.intent`   | No       | `string`               | Natural language description of when to use |
| `dependencies`      | No       | `array`                | References to other skills this one needs   |
| `model_hints`       | No       | `object`               | Provider-specific model preferences         |

The five built-in categories (defined in `web/services/skills/skillCategories.ts`):

| Category     | Description                                    |
| ------------ | ---------------------------------------------- |
| `research`   | Finding, gathering, and analyzing information  |
| `curation`   | Organizing, filtering, and selecting content   |
| `workflow`   | Multi-step processes and task automation       |
| `tool`       | Using specific tools and integrations          |
| `behavioral` | Modifying AI tone, style, or response patterns |

Custom categories beyond these five are also accepted.

### Step 4: Add trigger keywords and intent description

The `triggers` section controls how the skill registry matches user messages to skills. The registry (`src/services/skillRegistry.ts`) uses keyword matching: each keyword in the `keywords` array is checked against the user's words. Multi-word keywords require all words to be present.

```yaml
triggers:
  keywords: [research, search, find, verify, sources, synthesize]
  intent: 'User wants to find, verify, or synthesize information from multiple sources'
```

The `intent` field is a natural language description used for more nuanced matching. Be specific about when the skill should activate.

### Step 5: Write the markdown body

The body (everything after the `---` frontmatter delimiter) contains the skill's instructions. For agents, this typically includes a goal statement and available tools. For playbooks, this includes step-by-step task instructions.

### Step 6: Restart the server -- auto-discovery handles the rest

The skill registry auto-discovers files on server start. No imports, no registration code, no configuration changes. Run:

```bash
npm run web:dev
```

The registry scans `src/skills/agents/` and `src/skills/playbooks/`, parses each `.md` file with `gray-matter`, validates frontmatter, and indexes keywords for matching.

## Complete Example

Here is the simplest working skill -- the Researcher agent (`src/skills/agents/researcher.md`):

```yaml
---
name: Researcher
version: 1.0.0
category: research
description: Hunt sources, verify, and synthesize findings
triggers:
  keywords: [research, search, find, verify, sources, synthesize]
  intent: "User wants to find, verify, or synthesize information from multiple sources"
---

**Goal:** Hunt sources, verify, synthesize

**Core Tools:** web_search, wikipedia, youtube
```

This is a complete, functional skill. The frontmatter provides metadata for matching, the body provides instructions for the AI.

## Testing Your Changes

1. **Validate frontmatter:** Ensure `name`, `version` (semver format like `1.0.0`), and `category` are present. Missing or malformed fields will cause the file to be skipped with a console warning.

2. **Restart and verify discovery:** After starting the server, check the console for any `[skillRegistry] Skipping unparseable file` warnings related to your file.

3. **Test matching:** Send a message containing your trigger keywords. The skill should be matched and influence the AI response. Skills with more keyword matches score higher.

4. **Test category filtering:** Skills are also retrievable by category via `registry.getByCategory('your-category')`.

## Checklist

- [ ] Created `.md` file in `src/skills/agents/` or `src/skills/playbooks/`
- [ ] Frontmatter includes required fields: `name`, `version` (semver), `category`
- [ ] Added `triggers.keywords` for message matching
- [ ] Added `triggers.intent` for natural language matching
- [ ] Body contains clear instructions for the AI
- [ ] Server restarted and no parsing warnings in console
- [ ] Trigger keywords tested with a real message

## Reference

- [SKILL_COORDINATOR_SYSTEM.md](../SKILL_COORDINATOR_SYSTEM.md) -- full system architecture
- [CODEMAP.md](../CODEMAP.md) -- Skill System boundary definition
- `src/services/skillRegistry.ts` -- auto-discovery, parsing, keyword scoring
- `web/types/skillSchema.ts` -- `SkillFrontmatterSchema` (Zod validation)
- `web/services/skills/skillCategories.ts` -- built-in category definitions
- `src/skills/agents/researcher.md` -- simplest agent reference implementation
- `src/skills/playbooks/research-synthesis.md` -- playbook reference implementation

---

_Last verified: 2026-02-23_
