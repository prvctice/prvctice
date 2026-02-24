'use strict';

import path from 'node:path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSkillRegistry } from '../services/skillRegistry.js';
import { getSections } from './sdkIndex.js';

/**
 * Registers all MCP resource types on the given server instance.
 *
 * 6 resource types:
 *   1. Conversations (prvctice://conversations/{id}) -- includes messages when read
 *   2. Messages (prvctice://messages/{id}) -- direct message access
 *   3. Skills (prvctice://skills/{name}) -- SKILL.md content as text/markdown
 *   4. Blobs (prvctice://blobs/{id}) -- metadata only (discovered via conversation attachments)
 *   5. Config (prvctice://config) -- static resource with runtime configuration
 *   6. SDK (prvctice://sdk/{section}) -- SDK reference sections as text/markdown
 */
function registerResources(server: McpServer): void {
  // Lazy import storage to avoid circular dependencies and allow async init
  const getStorage = async () => (await import('../storage/node/sqlite.js')).default;

  // --- 1. Conversations ---------------------------------------------------
  server.registerResource(
    'conversations',
    new ResourceTemplate('prvctice://conversations/{id}', {
      list: async () => {
        try {
          const storage = await getStorage();
          const convos = await storage.conversations.list({ limit: 100 });
          return {
            resources: convos.map((c) => ({
              uri: `prvctice://conversations/${c.id}`,
              name: c.title || `Conversation ${c.id.slice(0, 8)}`,
              mimeType: 'application/json' as const,
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      title: 'Conversations',
      description: 'Chat conversation history with messages',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const storage = await getStorage();
        const convo = await storage.conversations.get(id as string);
        if (!convo) return { contents: [] };

        const messages = await storage.messages.list({
          index: { conversationId: id as string },
          limit: 500,
        });

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ ...convo, messages }, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  // --- 2. Messages --------------------------------------------------------
  server.registerResource(
    'messages',
    new ResourceTemplate('prvctice://messages/{id}', {
      list: async () => {
        try {
          const storage = await getStorage();
          const msgs = await storage.messages.list({ limit: 100 });
          return {
            resources: msgs.map((m) => ({
              uri: `prvctice://messages/${m.id}`,
              name: `${m.role || 'message'}: ${(m.content || '').slice(0, 60)}`,
              mimeType: 'application/json' as const,
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      title: 'Messages',
      description: 'Individual chat messages',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const storage = await getStorage();
        const msg = await storage.messages.get(id as string);
        if (!msg) return { contents: [] };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(msg, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  // --- 3. Skills ----------------------------------------------------------
  const skillsDir = path.join(__dirname, '..', 'skills');
  const registry = createSkillRegistry(skillsDir);

  server.registerResource(
    'skills',
    new ResourceTemplate('prvctice://skills/{name}', {
      list: async () => {
        try {
          return {
            resources: registry.skills.map((skill) => {
              const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
              return {
                uri: `prvctice://skills/${slug}`,
                name: skill.name,
                description: skill.description,
                mimeType: 'text/markdown' as const,
              };
            }),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      title: 'Skills',
      description: 'SKILL.md definitions (agents and playbooks)',
      mimeType: 'text/markdown',
    },
    async (uri, { name }) => {
      try {
        const nameSlug = (name as string).toLowerCase();
        const skill = registry.skills.find(
          (s) => s.name.toLowerCase().replace(/\s+/g, '-') === nameSlug
        );

        if (!skill) return { contents: [] };

        // Return the full skill content as markdown
        const frontmatter = [
          `name: ${skill.name}`,
          `category: ${Array.isArray(skill.category) ? skill.category.join(', ') : skill.category}`,
          `description: ${skill.description}`,
          skill.triggers.keywords.length > 0
            ? `keywords: ${skill.triggers.keywords.join(', ')}`
            : null,
          skill.triggers.intent ? `intent: ${skill.triggers.intent}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        const content = `---\n${frontmatter}\n---\n\n${skill.body}`;

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  // --- 4. Blobs -----------------------------------------------------------
  server.registerResource(
    'blobs',
    new ResourceTemplate('prvctice://blobs/{id}', {
      list: async () => {
        // Blobs are discovered through conversation message attachments,
        // not browsed directly. Return empty list.
        return { resources: [] };
      },
    }),
    {
      title: 'Blobs',
      description: 'File attachments (images, PDFs). Discovered via conversation messages.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const storage = await getStorage();
        const blob = await storage.blobs.getById(id as string);
        if (!blob) return { contents: [] };

        // Return metadata only -- binary content available via /api/v1/files/{id}
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  id: blob.id,
                  mime: blob.mime,
                  size: blob.size,
                  createdAt: blob.createdAt,
                  downloadUrl: `/api/v1/files/${blob.id}`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  // --- 5. Config ----------------------------------------------------------
  server.registerResource(
    'config',
    'prvctice://config',
    {
      title: 'Configuration',
      description: 'Runtime configuration and defaults',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const { loadDefaults } = await import('../config/defaults.js');
        const defaults = loadDefaults();

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(defaults, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );
  // --- 6. SDK Reference ----------------------------------------------------
  server.registerResource(
    'sdk',
    new ResourceTemplate('prvctice://sdk/{section}', {
      list: async () => {
        try {
          const sections = getSections();
          return {
            resources: sections.map((s) => ({
              uri: `prvctice://sdk/${s.slug}`,
              name: `${s.name} (${s.methods.length} methods)`,
              description: s.description.slice(0, 120),
              mimeType: 'text/markdown' as const,
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
    }),
    {
      title: 'SDK Reference',
      description: 'prvctice app SDK reference sections (prvctice.* namespaces)',
      mimeType: 'text/markdown',
    },
    async (uri, { section }) => {
      try {
        const slug = (section as string).toLowerCase();
        const sections = getSections();
        const match = sections.find((s) => s.slug === slug);

        if (!match) return { contents: [] };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `## ${match.name}\n\n${match.content}`,
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );
}

export { registerResources };
