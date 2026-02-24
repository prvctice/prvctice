'use strict';

import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSkillRegistry, type RegisteredSkill } from '../services/skillRegistry.js';

interface PromptSchemaConfig {
  readonly schema: Record<string, z.ZodType>;
  readonly primaryParam: string;
}

/**
 * Builds the predefined prompt schemas map.
 * Each entry maps a slugified skill name to its Zod schema and primary parameter.
 */
function buildPromptSchemas(): Map<string, PromptSchemaConfig> {
  const schemas = new Map<string, PromptSchemaConfig>();

  // Agents
  schemas.set('researcher', {
    schema: {
      topic: z.string().describe('What to research'),
      sources: z.string().optional().describe('Preferred sources'),
    },
    primaryParam: 'topic',
  });

  schemas.set('curator', {
    schema: {
      theme: z.string().describe('Theme to curate around'),
      type: z.enum(['playlist', 'program', 'moodboard']).optional().describe('Collection type'),
    },
    primaryParam: 'theme',
  });

  schemas.set('editor', {
    schema: {
      content: z.string().describe('Content to structure'),
      format: z.enum(['outline', 'beats', 'quotes']).optional().describe('Output format'),
    },
    primaryParam: 'content',
  });

  schemas.set('producer', {
    schema: {
      concept: z.string().describe('Visual concept'),
      references: z.string().optional().describe('Cultural references'),
    },
    primaryParam: 'concept',
  });

  // Playbooks
  schemas.set('research-synthesis', {
    schema: {
      topic: z.string().describe('Topic to research and synthesize'),
    },
    primaryParam: 'topic',
  });

  schemas.set('film-program', {
    schema: {
      theme: z.string().describe('Theme for film program'),
      count: z.number().min(3).max(10).default(5).optional().describe('Number of films'),
    },
    primaryParam: 'theme',
  });

  schemas.set('film-research', {
    schema: {
      query: z.string().describe('Film research query'),
      criteria: z.string().optional().describe('Filter criteria'),
    },
    primaryParam: 'query',
  });

  schemas.set('music-playlist', {
    schema: {
      mood: z.string().describe('Mood or vibe'),
      genre: z.string().optional().describe('Genre preference'),
    },
    primaryParam: 'mood',
  });

  schemas.set('moodboard', {
    schema: {
      aesthetic: z.string().describe('Aesthetic direction'),
      count: z.number().min(4).max(20).default(10).optional().describe('Number of images'),
    },
    primaryParam: 'aesthetic',
  });

  schemas.set('image-vision', {
    schema: {
      image_url: z.string().describe('Image URL to analyze'),
      question: z.string().optional().describe('Specific question about the image'),
    },
    primaryParam: 'image_url',
  });

  schemas.set('book-essay-research', {
    schema: {
      topic: z.string().describe('Research topic'),
      type: z.enum(['book', 'essay', 'both']).optional().describe('Source type'),
    },
    primaryParam: 'topic',
  });

  return schemas;
}

const PROMPT_SCHEMAS = buildPromptSchemas();

/**
 * Extracts the primary input value from prompt arguments based on the schema config.
 */
function extractPrimaryInput(args: Record<string, unknown>, primaryParam: string): string {
  const value = args[primaryParam];
  return typeof value === 'string' ? value : '';
}

/**
 * Registers all backend skills as MCP prompts on the given server instance.
 *
 * Each skill file in src/skills/ (agents + playbooks) becomes an MCP prompt
 * with a parameter schema tailored to the skill's purpose. Unknown skills
 * fall back to a generic { topic: string } schema.
 */
function registerPrompts(server: McpServer): void {
  const skillsDir = path.join(__dirname, '..', 'skills');
  const registry = createSkillRegistry(skillsDir);

  for (const skill of registry.skills) {
    const promptName = skill.name.toLowerCase().replace(/\s+/g, '-');
    const knownSchema = PROMPT_SCHEMAS.get(promptName);

    const schema = knownSchema?.schema ?? {
      topic: z.string().describe(skill.triggers.intent || `Input for ${skill.name}`),
    };

    const primaryParam = knownSchema?.primaryParam ?? 'topic';

    server.registerPrompt(
      promptName,
      {
        title: skill.name,
        description: skill.description || `${skill.name} workflow`,
        argsSchema: schema,
      },
      (args: Record<string, unknown>) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: buildPromptText(args, primaryParam, skill),
            },
          },
        ],
      })
    );
  }
}

/**
 * Builds the prompt message text from arguments and skill content.
 */
function buildPromptText(
  args: Record<string, unknown>,
  primaryParam: string,
  skill: RegisteredSkill
): string {
  const mainInput = extractPrimaryInput(args, primaryParam);

  // Build additional parameters string (exclude the primary param)
  const extras = Object.entries(args)
    .filter(([key]) => key !== primaryParam && args[key] !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');

  const extraSection = extras ? `\n${extras}` : '';

  return `${mainInput}${extraSection}\n\n---\nSkill: ${skill.name}\n${skill.body}`;
}

export { registerPrompts };
