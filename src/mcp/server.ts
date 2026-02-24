'use strict';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';
import pkg from '../../package.json';

/**
 * Creates a fully configured MCP server with tools, resources, and prompts registered.
 */
function createPrvcticeMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'Prvctice MCP Server', version: pkg.version },
    { capabilities: { logging: {} } }
  );

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}

export { createPrvcticeMcpServer };
