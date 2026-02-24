/**
 * Chat-related type definitions
 */

// Message roles
export type Role = 'user' | 'assistant' | 'system' | 'tool' | 'function' | 'developer';

// Content can be text or multipart
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export type MessageContent = string | ContentPart[];

// Chat message structure
export interface ChatMessage {
  role: Role;
  content: MessageContent;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

// Tool definitions - using index signature for compatibility with Record<string, unknown>
export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  required?: string[];
  [key: string]: unknown;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter;
}

// Anthropic native web search tool (server-side, not a function tool)
export interface WebSearchTool {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses?: number;
}

// Union of all tool types (function tools + server-side tools)
export type AnyTool = Tool | WebSearchTool;

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Chat request shape
export interface ChatRequest {
  provider: string;
  model: string;
  messages: ChatMessage[];
  tools?: AnyTool[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  reasoning?: boolean;
  apiKey?: string;
  tool_choice?: { type: string } | string | null;
}

// Chat response shape
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: UsageStats;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Tool execution types
export interface ToolArguments {
  query?: string;
  queries?: string[];
  limit?: number;
  perQuery?: number;
  text?: string;
  tasks?: ToolTask[];
  concurrency?: number;
  message?: string;
  fileIds?: string[];
  images?: unknown[];
  attachments?: ImageAttachment[];
  provider?: string;
  model?: string;
  count?: number;
}

export interface ToolTask {
  name: string;
  arguments?: ToolArguments;
}

export interface ImageAttachment {
  data: string;
  detail?: string;
}

// Streaming/adapter params
export interface StreamChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: AnyTool[];
  stream?: boolean;
  reasoning?: ReasoningConfig;
  systemPrompt?: string;
  tool_choice?: { type: string } | string | null;
}

export interface ReasoningConfig {
  effort?: string;
}

// Tool metadata for provider configuration
export interface ToolMetadata {
  name?: string;
  type?: string;
  description?: string;
  parameters?: ToolParameter;
}
