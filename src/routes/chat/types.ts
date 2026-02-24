/**
 * Shared type definitions for chat route modules
 *
 * Types that are used across multiple files in the chat route are
 * consolidated here to avoid duplication and ensure consistency.
 */

import type { Session } from 'express-session';

/** Message role */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Content part for multi-modal messages */
export interface ContentPart {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: ToolInputArgs;
  image_url?: { url: string };
}

/** Chat message with content variants */
export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
  tool_calls?: ToolCallInfo[];
}

/** Tool call info for OpenAI/OpenRouter format */
export interface ToolCallInfo {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

/** Tool input arguments - common args across tools */
export interface ToolInputArgs {
  query?: string;
  queries?: string[];
  limit?: number;
  perQuery?: number;
  text?: string;
  message?: string;
  count?: number;
  tasks?: Array<{ name: string; arguments?: ToolInputArgs }>;
  concurrency?: number;
  fileIds?: string[];
  images?: unknown[];
  attachments?: Array<{ data: string; detail?: string }>;
  provider?: string;
  model?: string;
}

/** Stream chunk from provider */
export interface StreamChunk {
  type: string;
  content?: string;
  id?: string;
  name?: string;
  call_id?: string;
  tool_call_id?: string;
  tool_use_id?: string;
  toolUseId?: string;
  arguments?: string | ToolInputArgs;
  urls?: string[];
}

/** Adapter interface for streaming chat */
export interface StreamAdapter {
  streamChat: (params: Record<string, unknown>) => AsyncIterable<StreamChunk>;
}

/** Tool instance */
export interface ToolInstance {
  name: string;
  execute: (args: ToolInputArgs) => Promise<unknown>;
}

/** Tool map type */
export type ToolMap = Record<string, ToolInstance>;

/** Tool metadata structure */
export interface ToolMetadata {
  name?: string;
  type?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

/** Tool parameter property schema (used for detailed tool metadata) */
export interface ToolParameterProperty {
  type: string | string[];
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

/** Session with custom properties */
export interface CustomSession extends Session {
  googleApiKey?: string;
  openrouterApiKey?: string;
  lmstudioBaseUrl?: string;
  discogsToken?: string;
  youtubeApiKey?: string;
  [key: string]: unknown;
}

/** Tool event summary */
export interface ToolEventSummary {
  status: string;
  summary: string;
  count?: number;
  note?: string;
  code?: string;
  action?: string;
}
