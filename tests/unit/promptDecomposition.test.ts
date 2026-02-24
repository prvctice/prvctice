import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { parseSkillDocument } from '../../web/services/skills/skillParser.js';

// ============================================================
// Original monolithic prompt snapshots (captured before decomposition)
// These are the ground truth for content-equivalence testing.
// ============================================================

/**
 * Snapshot of systemInstructions.md before agent extraction (Plan 02-01).
 * Covers: identity, tone, memory, fact-check, output, routing, agents table.
 */
const ORIGINAL_SYSTEM_INSTRUCTIONS_SNAPSHOT = `# System Instructions

## Role
You are **prvctice** — a sharp collaborator for creatives. Find, verify, and assemble culture: films, music, photography, design, essays. Culturally fluent (Debord, Daney, Sontag, Barthes, Bazin, Bourdieu) but speak plainly. Not a ghostwriter; no essays or thesis ideas.

- Start immediately. Don't ask for clarification.
- Non-culture requests: answer practically, no forced artistic connections.

## Tone
Casual, sharp, grounded. Specific nouns over adjectives. No academic tone, verbosity, filler. Hold taste; use it.

**Never say:** "Artistic vision", "Striking visuals", "Oeuvre", "A quintessential example of", "Musings"

## Memory
**canon.json** = preferred creators. **banned.json** = never recommend.

Internal rubric (never reveal lists):
1. **Banned** → refuse, pivot to three canon-adjacent alternatives: "Not the right lane for me. Try these instead:"
2. **Canon** → prefer confidently, add one cross-movement pairing
3. **Neutral** → include only if strengthens canon thread

## Fact-Check (Claim Tiers — internal only)
- **T1** (dates, authors, releases): Must cite via tool
- **T2** (movements, influence): Cite if novel/contested
- **T3** (taste/vibe): No citation needed

Fallback: web_search → wikipedia_search → "I can't verify that."

Only surface URLs returned by tools. Never fabricate.

## Output
- No plans or tool narration
- Optional micro-status once per turn: \`Status: searching → synthesizing → compiling\`

## Routing
- **chat_text**: Normal answer, follow tiers, cite when required
- **chat_vision**: Only describe images when explicitly asked or required for the question. Don't auto-analyze every turn.

## Agents
Workflow categories (not separate prompts):

| Agent | Goal | Core Tools |
|-------|------|------------|
| Researcher | Hunt sources, verify, synthesize | web_search, wikipedia, youtube |
| Curator | Assemble sets (programs, playlists, moodboards) | youtube, web_search, moodboard |
| Editor | Structure (outlines, beat maps, quotes), not prose | save_note, wikipedia |
| Producer | PG-13 visual drafts tied to references | video_generate, youtube |

Chain as needed: Researcher → Curator → Editor → Producer. Never narrate hand-offs.`;

/**
 * Snapshot of toolInstructions.md playbook section before extraction (Plan 02-02).
 * The core tool sections (Tool Registry, Provider Behavior, When to Call Tools,
 * Follow-Up Requests, URL Integrity, When Tools Fail, Budgets) remain in
 * toolInstructions.md and are loaded directly -- no snapshot needed for those.
 * This snapshot captures only the extracted playbook content.
 */
const ORIGINAL_PLAYBOOK_CONTENT_SNAPSHOT = `## Playbooks (Definitions of Done)

### Research Synthesis
**DoD:** 3–8 verified links + 5–10 bullets + 1 novelty insight connecting sources

### Film Program
**DoD:** Call \`film_search\` for structured film cards + opening framing paragraph + connective theme. Use \`youtube_search\` only for trailers/clips after film_search results.

### Music Playlist
**DoD:** 8–20 tracks with inline YouTube URLs + one-line commentary each. Favor live/deep cuts.

### Moodboard
**DoD:** Call \`moodboard_search\` (8–15 images) + one-line connective motif + optional context links
**Important:** Moodboard images are automatically displayed as a visual grid in the UI. Do NOT output markdown image syntax (\`![](url)\`) in your text — the images are already shown. Your text should only include the motif description and optional context links.

### Book & Essay Research
**DoD:** 3-5 results with source badges + one-line connecting theme
**Important:** Book and essay results are automatically displayed as cards in the UI.
Do NOT output markdown links for the results -- the cards handle display.
Your text should provide context, connections, or commentary on the results.

### Film Research Playbook
**DoD:** 3-6 film cards with crew credits + one-line connecting theme
**Important:** Film results are automatically displayed as cards in the UI.
Do NOT output markdown links for the results -- the cards handle display.
Your text should provide context, connections, or commentary on the results.
- **Director filmography** -> film_search with \`people: ["Director Name"]\`
- **Cinematographer work** -> film_search with \`people: ["DP Name"]\`
- **Movement exploration** -> film_search with \`movement: "French New Wave"\` (or any supported movement)
- **Era + genre** -> film_search with \`yearStart\`, \`yearEnd\`, \`genres\`
- **Concept search** -> film_search with \`keywords: ["existential", "road movie"]\`
- **Company catalog** -> film_search with \`companies: ["A24"]\`
- **Combined** -> film_search with multiple filters (all combinable)
- For film stills/cinematography images -> use moodboard_search (separate tool)
- film_search returns structured cards, moodboard_search returns images

### Image/Vision
**DoD:** Read prompt first -> identify context -> never guess identity -> up to 8 hex swatches -> answer the prompt`;

// ============================================================
// Helpers
// ============================================================

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Normalize text for content comparison: trim each line, remove empties.
 */
function normalize(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Check if a line is a markdown table row (starts/ends with |).
 */
function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|');
}

/**
 * Check if a line is a table separator row (e.g. |---|---|---|).
 */
function isTableSeparator(line: string): boolean {
  return isTableRow(line) && /^\|[\s-]+(\|[\s-]+)*\|$/.test(line);
}

/**
 * Check if a line is a table header row (contains only known headers).
 */
function isTableHeader(line: string): boolean {
  const cells = line
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const headerKeywords = ['agent', 'goal', 'core tools'];
  return cells.every((cell) => headerKeywords.includes(cell.toLowerCase()));
}

/**
 * Extract semantic values from a table data row.
 * Returns the cell values trimmed and non-empty.
 */
function extractTableCellValues(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Lines from systemInstructions.md that represent structural changes during
 * decomposition (renamed headers, table formatting) are not required to appear
 * verbatim. Instead, their semantic content must be present.
 */
function isSystemDecomposedStructureLine(line: string): boolean {
  if (line === '## Agents') return true;
  if (isTableSeparator(line)) return true;
  if (isTableHeader(line)) return true;
  if (isTableRow(line)) return true;
  return false;
}

/**
 * Lines from toolInstructions.md playbooks that represent section headers
 * removed during decomposition. The content (DoD lines) must still appear
 * in the reassembled prompt.
 */
function isPlaybookStructureLine(line: string): boolean {
  // Section header removed from core (content moved to skill bodies)
  if (line === '## Playbooks (Definitions of Done)') return true;
  // Individual playbook headers replaced by skill file structure
  if (
    /^### (Research Synthesis|Film Program|Music Playlist|Moodboard|Book & Essay Research|Film Research Playbook|Image\/Vision)$/.test(
      line
    )
  )
    return true;
  return false;
}

/**
 * Normalize a line for fuzzy content matching.
 * Handles minor character differences (en-dash vs hyphen, smart quotes, etc.)
 */
function normalizeForMatching(line: string): string {
  return line
    .replace(/\u2013/g, '-') // en-dash to hyphen
    .replace(/\u2014/g, '--') // em-dash to double hyphen
    .replace(/\u2018|\u2019/g, "'") // smart single quotes
    .replace(/\u201c|\u201d/g, '"'); // smart double quotes
}

function loadList(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function loadSkillBodies(skillsDir: string): string[] {
  const bodies: string[] = [];
  if (!fs.existsSync(skillsDir)) return bodies;

  const categories = fs.readdirSync(skillsDir).sort();
  for (const category of categories) {
    const categoryPath = path.join(skillsDir, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(categoryPath, file), 'utf8');
      const parsed = matter(content);
      const body = parsed.content.trim();
      if (body) bodies.push(body);
    }
  }

  return bodies;
}

function buildReassembledPrompt(): string {
  const basePath = path.join(ROOT, 'src', 'services', 'systemInstructions.md');
  const toolsPath = path.join(ROOT, 'src', 'services', 'toolInstructions.md');
  const skillsDir = path.join(ROOT, 'src', 'skills');
  const canonPath = path.join(ROOT, 'canon.json');
  const bannedPath = path.join(ROOT, 'banned.json');

  const base = fs.readFileSync(basePath, 'utf8');
  const tools = fs.readFileSync(toolsPath, 'utf8');
  const skillBodies = loadSkillBodies(skillsDir);

  const sections: string[] = [base, tools, ...skillBodies];

  const canonList = loadList(canonPath);
  const bannedList = loadList(bannedPath);

  if (Array.isArray(canonList) && canonList.length) {
    sections.push('## Preferred Creators\n' + canonList.map((c) => `- ${c}`).join('\n'));
  }

  if (Array.isArray(bannedList) && bannedList.length) {
    sections.push('## Banned Creators\n' + bannedList.map((c) => `- ${c}`).join('\n'));
  }

  return sections.join('\n\n');
}

function getAllSkillFiles(): string[] {
  const skillsDir = path.join(ROOT, 'src', 'skills');
  const files: string[] = [];
  if (!fs.existsSync(skillsDir)) return files;

  const categories = fs.readdirSync(skillsDir).sort();
  for (const category of categories) {
    const categoryPath = path.join(skillsDir, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const mdFiles = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const file of mdFiles) {
      files.push(path.join(categoryPath, file));
    }
  }

  return files;
}

// ============================================================
// Tests
// ============================================================

describe('prompt decomposition fidelity — system instructions', () => {
  it('reassembled prompt contains all original non-structural content from systemInstructions', () => {
    const reassembled = buildReassembledPrompt();
    const originalLines = normalize(ORIGINAL_SYSTEM_INSTRUCTIONS_SNAPSHOT);
    const reassembledLines = normalize(reassembled);

    const missing: string[] = [];
    for (const line of originalLines) {
      if (isSystemDecomposedStructureLine(line)) continue;

      if (!reassembledLines.includes(line)) {
        missing.push(line);
      }
    }

    assert.equal(
      missing.length,
      0,
      `Missing ${missing.length} lines from systemInstructions:\n${missing.join('\n')}`
    );
  });

  it('reassembled prompt preserves all agent information from table rows', () => {
    const reassembled = buildReassembledPrompt();
    const originalLines = normalize(ORIGINAL_SYSTEM_INSTRUCTIONS_SNAPSHOT);

    const tableDataRows = originalLines.filter(
      (line) => isTableRow(line) && !isTableSeparator(line) && !isTableHeader(line)
    );

    assert.ok(
      tableDataRows.length === 4,
      `Expected 4 agent table rows, found ${tableDataRows.length}`
    );

    for (const row of tableDataRows) {
      const cellValues = extractTableCellValues(row);
      for (const value of cellValues) {
        assert.ok(
          reassembled.includes(value),
          `Agent table value "${value}" not found in reassembled prompt`
        );
      }
    }
  });

  it('reassembled prompt contains the agent chaining rule', () => {
    const reassembled = buildReassembledPrompt();
    assert.ok(reassembled.includes('Chain as needed: Researcher'), 'Missing agent chaining rule');
    assert.ok(reassembled.includes('Never narrate hand-offs.'), 'Missing hand-off rule');
  });

  it('reassembled prompt contains the agent workflow header', () => {
    const reassembled = buildReassembledPrompt();
    assert.ok(
      reassembled.includes('## Agent Workflow'),
      'Missing "## Agent Workflow" header (renamed from "## Agents")'
    );
  });
});

describe('prompt decomposition fidelity — tool playbooks', () => {
  it('reassembled prompt contains all original playbook content', () => {
    const reassembled = buildReassembledPrompt();
    const originalLines = normalize(ORIGINAL_PLAYBOOK_CONTENT_SNAPSHOT);
    const reassembledNormalized = normalize(reassembled);

    const missing: string[] = [];
    for (const line of originalLines) {
      if (isPlaybookStructureLine(line)) continue;

      // Try exact match first
      if (reassembledNormalized.includes(line)) continue;

      // Try fuzzy match (en-dash vs hyphen differences)
      const normalizedLine = normalizeForMatching(line);
      const found = reassembledNormalized.some((rl) => normalizeForMatching(rl) === normalizedLine);

      if (!found) {
        missing.push(line);
      }
    }

    assert.equal(
      missing.length,
      0,
      `Missing ${missing.length} playbook content lines:\n${missing.join('\n')}`
    );
  });

  it('all 7 playbook DoD instructions are present in reassembled prompt', () => {
    const reassembled = buildReassembledPrompt();

    // Key content markers from each playbook (using the actual content in skill bodies)
    const playbookMarkers = [
      'verified links', // Research Synthesis
      'film_search` for structured film cards', // Film Program
      'inline YouTube URLs', // Music Playlist
      'moodboard_search', // Moodboard
      'source badges', // Book & Essay Research
      'film cards with crew credits', // Film Research
      'never guess identity', // Image Vision
    ];

    for (const marker of playbookMarkers) {
      assert.ok(
        reassembled.includes(marker),
        `Playbook marker "${marker}" not found in reassembled prompt`
      );
    }
  });
});

describe('core prompt contains no extracted content', () => {
  it('systemInstructions.md contains no agent table rows', () => {
    const basePath = path.join(ROOT, 'src', 'services', 'systemInstructions.md');
    const content = fs.readFileSync(basePath, 'utf8');
    const lines = normalize(content);

    const tableDataRows = lines.filter(
      (line) => isTableRow(line) && !isTableSeparator(line) && !isTableHeader(line)
    );

    assert.equal(
      tableDataRows.length,
      0,
      `systemInstructions.md still contains agent table data rows:\n${tableDataRows.join('\n')}`
    );
  });

  it('systemInstructions.md contains no "## Agents" header', () => {
    const basePath = path.join(ROOT, 'src', 'services', 'systemInstructions.md');
    const content = fs.readFileSync(basePath, 'utf8');

    assert.ok(
      !content.includes('## Agents\n'),
      'systemInstructions.md still contains "## Agents" header'
    );
  });

  it('toolInstructions.md contains no playbook sections', () => {
    const toolsPath = path.join(ROOT, 'src', 'services', 'toolInstructions.md');
    const content = fs.readFileSync(toolsPath, 'utf8');

    const playbookHeaders = [
      '## Playbooks',
      '### Research Synthesis',
      '### Film Program',
      '### Music Playlist',
      '### Moodboard',
      '### Book & Essay Research',
      '### Film Research',
      '### Image/Vision',
    ];

    for (const header of playbookHeaders) {
      assert.ok(!content.includes(header), `toolInstructions.md still contains "${header}"`);
    }
  });

  it('toolInstructions.md still contains tool registry and core rules', () => {
    const toolsPath = path.join(ROOT, 'src', 'services', 'toolInstructions.md');
    const content = fs.readFileSync(toolsPath, 'utf8');

    const requiredSections = [
      '## Tool Registry',
      '## Provider Behavior',
      '## When to Call Tools',
      '## Follow-Up Requests',
      '## URL Integrity',
      '## When Tools Fail',
      '## Budgets',
    ];

    for (const section of requiredSections) {
      assert.ok(
        content.includes(section),
        `toolInstructions.md missing required section "${section}"`
      );
    }
  });
});

describe('skill files', () => {
  const skillFiles = getAllSkillFiles();

  it('exactly 11 built-in skill files exist', () => {
    assert.equal(
      skillFiles.length,
      11,
      `Expected 11 skill files (4 agents + 7 playbooks), found ${skillFiles.length}:\n${skillFiles.map((f) => path.relative(ROOT, f)).join('\n')}`
    );
  });

  it('4 agent skill files exist', () => {
    const agentFiles = skillFiles.filter((f) => f.includes('/agents/'));
    assert.equal(agentFiles.length, 4, `Expected 4 agent skill files, found ${agentFiles.length}`);
  });

  it('7 playbook skill files exist', () => {
    const playbookFiles = skillFiles.filter((f) => f.includes('/playbooks/'));
    assert.equal(
      playbookFiles.length,
      7,
      `Expected 7 playbook skill files, found ${playbookFiles.length}`
    );
  });

  it('all 11 skill files parse successfully', () => {
    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const result = parseSkillDocument(content, path.basename(file));
      assert.equal(
        result.success,
        true,
        `Failed to parse ${path.relative(ROOT, file)}: ${result.success ? '' : result.error}`
      );
    }
  });

  it('all skill bodies are non-empty', () => {
    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const result = parseSkillDocument(content, path.basename(file));
      assert.equal(result.success, true);
      if (!result.success) continue;
      assert.ok(result.data.body.length > 0, `Skill ${path.basename(file)} has empty body`);
    }
  });
});
