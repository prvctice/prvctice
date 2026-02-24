/**
 * Base interface for all Large Language Model (LLM) provider adapters.
 * Each adapter must expose a `streamChat` method that returns an
 * asynchronous iterator yielding ChatChunk objects in the common format
 * expected by the MCP backend.
 */

import type { ChatRequest } from '../../types/chat.js';
import type { ChatChunk, AdapterConfig } from '../../types/adapters.js';

export abstract class BaseAdapter {
  protected options: AdapterConfig;

  constructor(options: AdapterConfig) {
    this.options = options;
  }

  /**
   * Stream a chat completion back to the caller.
   * @param req Normalised ChatRequest: {model, messages, tools, stream}
   * @returns Async iterator of ChatChunk items
   */
  abstract streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown>;
}

export default BaseAdapter;

// CommonJS compatibility for mixed codebase
module.exports = { BaseAdapter, default: BaseAdapter };
