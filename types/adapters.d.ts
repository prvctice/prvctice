/**
 * LLM Adapter type definitions
 */

import type { ChatRequest, ChatMessage, Tool, ToolCall } from './chat';

// Streaming chunk types (discriminated union)
export type ChatChunk =
  | { type: 'delta'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string | Record<string, unknown> }
  | { type: 'tool_result'; tool_call_id: string; content: string }
  | { type: 'usage'; prompt_tokens: number; completion_tokens: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'image'; mimeType: string; data: string }
  | { type: 'response_id'; id: string }
  | { type: 'web_search_status'; status: string; query?: string }
  | { type: 'web_search_error'; error_code: string; message: string }
  | { type: 'web_search_urls'; urls: string[] }
  | { type: 'pause_turn' }
  | { type: 'done' };

// Adapter configuration
export interface AdapterConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

// Base adapter interface
export interface LLMAdapter {
  streamChat(request: ChatRequest): AsyncGenerator<ChatChunk, void, unknown>;
}

// Adapter constructor type
export interface AdapterConstructor {
  new (config: AdapterConfig): LLMAdapter;
}

// Provider registry
export type Provider = 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio';

// Re-export chat types for convenience
export type { ChatRequest, ChatMessage, Tool, ToolCall };
