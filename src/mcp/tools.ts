'use strict';

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTools } from '../tools/index.js';
import { searchSdk, formatSearchResults } from './sdkIndex.js';

// Build a map of existing tool instances (API keys resolve from env vars)
function getToolMap(): Map<
  string,
  { execute: (args: Record<string, unknown>) => Promise<unknown> }
> {
  const toolInstances = createTools({});
  return new Map(
    toolInstances.map((t) => [
      t.name,
      { execute: t.execute as (args: Record<string, unknown>) => Promise<unknown> },
    ])
  );
}

/**
 * Registers all curated MCP tools on the given server instance.
 *
 * 8 existing tools wrapped with Zod schemas and MCP annotations.
 * 2 new tools (search_messages, create_skill) with custom implementations.
 */
function registerTools(server: McpServer): void {
  const toolMap = getToolMap();

  // Helper: wrap an existing tool's execute function into MCP result format
  const wrapExisting = (
    toolName: string
  ): ((
    args: Record<string, unknown>
  ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>) => {
    return async (args: Record<string, unknown>) => {
      const tool = toolMap.get(toolName);
      if (!tool) {
        return { content: [{ type: 'text' as const, text: `Tool ${toolName} not found` }] };
      }
      const result = await tool.execute(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    };
  };

  // ─── 1. youtube_search ────────────────────────────────────────────────
  server.registerTool(
    'youtube_search',
    {
      title: 'YouTube Search',
      description:
        'Search YouTube for videos, music, documentaries, tutorials, and more. Use the "queries" array with specific, varied terms for diverse results.',
      inputSchema: {
        query: z.string().optional().describe('Single search query for YouTube videos'),
        queries: z.array(z.string()).optional().describe('Multiple specific queries to aggregate'),
        limit: z
          .number()
          .min(1)
          .max(20)
          .default(10)
          .optional()
          .describe('Max number of unique videos to return'),
        perQuery: z
          .number()
          .min(1)
          .max(10)
          .default(3)
          .optional()
          .describe('Max results per query when using multiple queries'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('youtube_search')(args as Record<string, unknown>)
  );

  // ─── 2. wikipedia_search ──────────────────────────────────────────────
  server.registerTool(
    'wikipedia_search',
    {
      title: 'Wikipedia Search',
      description:
        'Search Wikipedia for encyclopedic knowledge -- biographies, historical events, scientific concepts, cultural movements.',
      inputSchema: {
        query: z.string().describe('Search terms (names, concepts, events, places)'),
        limit: z.number().min(1).max(20).default(5).optional().describe('Number of results'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('wikipedia_search')(args as Record<string, unknown>)
  );

  // ─── 3. book_search ───────────────────────────────────────────────────
  server.registerTool(
    'book_search',
    {
      title: 'Book Search',
      description:
        'Search for books by title, author, or topic. Queries Open Library and Google Books in parallel.',
      inputSchema: {
        query: z.string().describe('Search terms (topic, title, or subject)'),
        author: z.string().optional().describe('Filter by author name'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('book_search')(args as Record<string, unknown>)
  );

  // ─── 4. essay_search ──────────────────────────────────────────────────
  server.registerTool(
    'essay_search',
    {
      title: 'Essay Search',
      description:
        'Search for academic essays and papers via Semantic Scholar. Returns papers with abstracts, citation counts, and open-access PDF links.',
      inputSchema: {
        query: z.string().describe('Academic search terms (topics, theories, or research areas)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('essay_search')(args as Record<string, unknown>)
  );

  // ─── 5. film_search ───────────────────────────────────────────────────
  server.registerTool(
    'film_search',
    {
      title: 'Film Search',
      description:
        'Search films by creative criteria: director, cinematographer, composer, actor, company, movement, decade, genre, language, or keywords.',
      inputSchema: {
        people: z
          .array(z.string())
          .optional()
          .describe('Person names (directors, actors, crew). AND logic.'),
        genres: z
          .array(z.string())
          .optional()
          .describe('Genre terms: action, comedy, drama, thriller, etc.'),
        keywords: z
          .array(z.string())
          .optional()
          .describe('Conceptual/mood keywords: existential, dreamlike, heist'),
        yearStart: z.number().optional().describe('Start year for release date range'),
        yearEnd: z.number().optional().describe('End year for release date range'),
        language: z.string().optional().describe('ISO 639-1 language code (fr, ja, ko, fa)'),
        companies: z
          .array(z.string())
          .optional()
          .describe('Production company names (A24, Studio Ghibli)'),
        movement: z
          .string()
          .optional()
          .describe('Film movement name (French New Wave, Film Noir, etc.)'),
        limit: z
          .number()
          .min(5)
          .max(8)
          .default(6)
          .optional()
          .describe('Number of films to return (5-8)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('film_search')(args as Record<string, unknown>)
  );

  // ─── 6. moodboard_search ──────────────────────────────────────────────
  server.registerTool(
    'moodboard_search',
    {
      title: 'Moodboard Search',
      description:
        'Create visual moodboards by searching cultural archives (Met Museum, Art Institute of Chicago, Europeana, Wikimedia Commons).',
      inputSchema: {
        query: z.string().describe('Search query -- be specific (e.g. "Bauhaus design posters")'),
        count: z
          .number()
          .min(4)
          .max(20)
          .default(10)
          .optional()
          .describe('Number of images to return (4-20)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('moodboard_search')(args as Record<string, unknown>)
  );

  // ─── 7. save_note ─────────────────────────────────────────────────────
  server.registerTool(
    'save_note',
    {
      title: 'Save Note',
      description:
        'Capture ideas, discoveries, summaries, or curated lists. The user can review and organize their notes later.',
      inputSchema: {
        text: z.string().describe('Content to save: ideas, findings, summaries, recommendations'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => wrapExisting('save_note')(args as Record<string, unknown>)
  );

  // ─── 8. vision_describe ───────────────────────────────────────────────
  server.registerTool(
    'vision_describe',
    {
      title: 'Vision Describe',
      description:
        'Analyze images with AI vision: describe contents, extract text, identify objects, understand layouts.',
      inputSchema: {
        message: z.string().optional().describe('What to analyse or ask about the image(s)'),
        fileIds: z
          .array(z.string())
          .optional()
          .describe('Previously-uploaded file IDs to include as vision inputs'),
        images: z
          .array(z.any())
          .optional()
          .describe('Inline base64 images or {data, detail?} objects'),
        attachments: z
          .array(
            z.object({
              data: z.string(),
              detail: z.string().optional(),
            })
          )
          .optional()
          .describe('Image attachments with base64 data'),
        provider: z
          .enum(['anthropic', 'gemini', 'openrouter'])
          .optional()
          .describe('Vision provider to use'),
        model: z.string().optional().describe('Optional vision-capable model override'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => wrapExisting('vision_describe')(args as Record<string, unknown>)
  );

  // ─── 9. search_messages (NEW) ─────────────────────────────────────────
  server.registerTool(
    'search_messages',
    {
      title: 'Search Messages',
      description:
        'Full-text search over conversation history. Returns matching message snippets with context.',
      inputSchema: {
        query: z.string().describe('Search query'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .optional()
          .describe('Maximum number of results'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      const storage = (await import('../storage/node/sqlite.js')).default;
      const results = await storage.search.searchMessages(query, {
        limit: limit ?? 20,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  // ─── 10. create_skill (NEW) ───────────────────────────────────────────
  server.registerTool(
    'create_skill',
    {
      title: 'Create Skill',
      description:
        'Create a new SKILL.md playbook file. The skill will be auto-discovered by the skill registry on next server start.',
      inputSchema: {
        name: z.string().describe('Display name for the skill'),
        category: z
          .string()
          .describe('Skill category (research, curation, workflow, tool, behavioral)'),
        description: z.string().describe('Short description of what the skill does'),
        keywords: z.array(z.string()).optional().describe('Trigger keywords for message matching'),
        intent: z
          .string()
          .optional()
          .describe('Natural language description of when to use this skill'),
        body: z.string().describe('Markdown body with instructions for the AI'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ name, category, description, keywords, intent, body }) => {
      // Build SKILL.md frontmatter
      const frontmatter: Record<string, unknown> = {
        name,
        version: '1.0.0',
        category,
        description,
      };

      if (keywords || intent) {
        const triggers: Record<string, unknown> = {};
        if (keywords) triggers.keywords = keywords;
        if (intent) triggers.intent = intent;
        frontmatter.triggers = triggers;
      }

      // Stringify frontmatter manually (gray-matter stringify adds unwanted whitespace)
      const yamlLines: string[] = [];
      for (const [key, value] of Object.entries(frontmatter)) {
        if (value === undefined) continue;
        if (typeof value === 'string') {
          yamlLines.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
          yamlLines.push(`${key}: [${value.map((v) => String(v)).join(', ')}]`);
        } else if (typeof value === 'object' && value !== null) {
          yamlLines.push(`${key}:`);
          for (const [subKey, subValue] of Object.entries(value)) {
            if (subValue === undefined) continue;
            if (Array.isArray(subValue)) {
              yamlLines.push(`  ${subKey}: [${subValue.map((v) => String(v)).join(', ')}]`);
            } else {
              yamlLines.push(`  ${subKey}: ${String(subValue)}`);
            }
          }
        }
      }

      const content = `---\n${yamlLines.join('\n')}\n---\n\n${body}\n`;

      // Slugify the name for the filename
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const filePath = path.join(__dirname, '..', 'skills', 'playbooks', `${slug}.md`);

      // Ensure the directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf8');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                created: true,
                path: `src/skills/playbooks/${slug}.md`,
                name,
                category,
                message: 'Skill created. Restart the server for auto-discovery.',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
  // ─── 11. search_sdk (NEW) ─────────────────────────────────────────────
  server.registerTool(
    'search_sdk',
    {
      title: 'Search SDK',
      description:
        'Search the prvctice app SDK reference. Query by namespace ("audio"), method name ("toast"), or keyword ("play sound"). Returns matching API sections with signatures, parameters, and examples.',
      inputSchema: {
        query: z.string().describe('Namespace, method name, or keyword to search for'),
        limit: z
          .number()
          .min(1)
          .max(10)
          .default(3)
          .optional()
          .describe('Maximum number of sections to return (1-10, default 3)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      const results = searchSdk(query, limit ?? 3);
      const text = formatSearchResults(results);
      return { content: [{ type: 'text' as const, text }] };
    }
  );
}

export { registerTools };
