'use strict';

import pkg from '../../package.json';
import type { Request } from 'express';

const PROTOCOL_VERSION = '2025-11-25';

interface TransportEntry {
  type: string;
  url: string;
}

interface McpServerConfig {
  name: string;
  displayName: string;
  description: string;
  version: string;
  protocolVersion: string;
  transport: TransportEntry[];
  capabilities: {
    tools: { listChanged: boolean };
    resources: { subscribe: boolean; listChanged: boolean };
    prompts: { listChanged: boolean };
  };
}

interface Manifest {
  schemaVersion: string;
  mcpServers: {
    [identifier: string]: McpServerConfig;
  };
}

interface ManifestOptions {
  identifier?: string;
  displayName?: string;
  description?: string;
  host?: string;
  path?: string;
  baseUrl?: string;
  serverVersion?: string;
}

function deduceProtocol(req: Request): string {
  const forwarded = req.get && req.get('x-forwarded-proto');
  if (forwarded) {
    const first = String(forwarded).split(',')[0];
    return first?.trim().toLowerCase() ?? 'http';
  }
  if (req.protocol) return req.protocol;
  return 'http';
}

function buildManifest(req: Request, options: ManifestOptions = {}): Manifest {
  const identifier = options.identifier || 'prvctice';
  const displayName = options.displayName || 'Prvctice MCP';
  const description =
    options.description ||
    'Prvctice MCP server exposing tools (search, vision, notes), resources (conversations, skills, blobs), and prompt templates (agents and playbooks) via the Model Context Protocol.';
  const host = (req.get && req.get('host')) || options.host || 'localhost';
  const protocol = deduceProtocol(req);
  const secure = protocol === 'https';
  const httpScheme = secure ? 'https' : 'http';
  const wsScheme = secure ? 'wss' : 'ws';
  const mcpPath = options.path || '/mcp';

  return {
    schemaVersion: '0.1',
    mcpServers: {
      [identifier]: {
        name: displayName,
        displayName,
        description,
        version: options.serverVersion || pkg.version || '0.0.0',
        protocolVersion: PROTOCOL_VERSION,
        transport: [
          { type: 'streamable-http', url: `${httpScheme}://${host}${mcpPath}` },
          { type: 'websocket', url: `${wsScheme}://${host}${mcpPath}` },
        ],
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
      },
    },
  };
}

export { buildManifest };
module.exports = { buildManifest };
