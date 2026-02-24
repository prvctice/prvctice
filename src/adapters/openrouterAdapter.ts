/**
 * OpenRouter adapter using the OpenAI-compatible chat completions API.
 *
 * ChatChunk standardised shape:
 *   { type: 'delta', content: string }
 *   { type: 'tool_call', id: string, name: string, arguments: object|string }
 *   { type: 'done' }
 */

'use strict';

import { BaseAdapter } from './baseAdapter.js';
import type { ChatRequest, ChatMessage, Tool, AnyTool } from '../../types/chat.js';
import type { ChatChunk } from '../../types/adapters.js';
import { normaliseError } from '../utils/errors.js';
import { parseSSEStream } from '../utils/parseSSEStream.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// OpenAI-compatible content part types
interface TextContentPart {
  type: 'text';
  text: string;
}

interface ImageUrlContentPart {
  type: 'image_url';
  image_url: { url: string; detail?: string };
}

type ContentPart = TextContentPart | ImageUrlContentPart;

// OpenAI-compatible tool call format
interface OpenAIToolCallRef {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIMessage {
  role: string;
  content: string | null | ContentPart[];
  tool_calls?: OpenAIToolCallRef[];
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface PendingToolCall {
  name: string;
  args: string;
}

// Extended ChatMessage with tool-related fields
interface ToolMessage extends ChatMessage {
  tool_use_id?: string;
  tool_call_id?: string;
  call_id?: string;
  id?: string;
}

// Tool with optional type field
interface ExtendedTool extends Tool {
  type?: string;
}

/**
 * Convert messages to OpenAI chat completions format.
 */
function toOpenAIMessages(messages: ChatMessage[] = []): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const m of messages) {
    if (!m || !m.role) continue;

    const role = m.role;

    // Standard text messages
    if (role === 'user' || role === 'assistant' || role === 'system') {
      let content: string | null | ContentPart[];
      if (typeof m.content === 'string') {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        // Handle multi-part content (text + images)
        content = m.content as ContentPart[];
      } else if (m.content === null || m.content === undefined) {
        // Keep null as null (important for assistant messages with tool_calls)
        content = null;
      } else {
        try {
          content = JSON.stringify(m.content);
        } catch (_) {
          content = String(m.content ?? '');
        }
      }

      const msg: OpenAIMessage = { role, content };

      // Include tool_calls if present (for assistant messages)
      if (role === 'assistant' && m.tool_calls) {
        msg.tool_calls = m.tool_calls as OpenAIToolCallRef[];
      }

      result.push(msg);
      continue;
    }

    // Tool results
    if (role === 'tool' || role === 'function') {
      const msg = m as ToolMessage;
      const toolCallId = msg.tool_use_id || msg.tool_call_id || msg.call_id || msg.id;
      let content: string;
      try {
        content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      } catch (_) {
        content = String(m.content ?? '');
      }

      result.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content,
      });
      continue;
    }
  }

  return result;
}

/**
 * Convert tools to OpenAI function format.
 */
function toOpenAITools(tools: Tool[] = []): OpenAITool[] {
  const result: OpenAITool[] = [];

  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;

    // Skip built-in tools that OpenRouter doesn't support
    if ((t as ExtendedTool).type === 'web_search_preview') continue;

    const name = t.name && String(t.name).trim();
    if (!name) continue;

    result.push({
      type: 'function',
      function: {
        name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    });
  }

  return result;
}

// OpenAI-compatible streaming chunk format
interface OpenAIStreamChunk {
  type?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export class OpenRouterAdapter extends BaseAdapter {
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;

  constructor({
    apiKey,
    siteUrl,
    siteName,
  }: {
    apiKey: string;
    siteUrl?: string;
    siteName?: string;
  }) {
    super({ apiKey });
    this.apiKey = apiKey;
    this.siteUrl = siteUrl || 'http://localhost:3000';
    this.siteName = siteName || 'Prvctice';
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown> {
    const { model, messages = [], tools = [] } = req;

    const openaiMessages = toOpenAIMessages(messages);
    // Filter out server-side tools (e.g., Anthropic web search) — not applicable to OpenRouter
    const functionTools = (tools as AnyTool[]).filter(
      (t): t is Tool => !('type' in t && t.type === 'web_search_20250305')
    );
    const openaiTools = toOpenAITools(functionTools);

    interface OpenRouterRequestBody {
      model: string;
      messages: OpenAIMessage[];
      stream: boolean;
      tools?: OpenAITool[];
      tool_choice?: string;
    }

    const body: OpenRouterRequestBody = {
      model,
      messages: openaiMessages,
      stream: true,
    };

    if (openaiTools.length > 0) {
      body.tools = openaiTools;
      body.tool_choice = (typeof req.tool_choice === 'string' ? req.tool_choice : null) || 'auto';
    }

    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        interface ErrorResponse {
          error?: { message?: string; code?: string };
        }
        let errorData: ErrorResponse;
        try {
          errorData = JSON.parse(errorText) as ErrorResponse;
        } catch (_) {
          errorData = { error: { message: errorText } };
        }

        const httpError = new Error(errorData.error?.message || errorText) as Error & {
          status?: number;
          code?: string;
        };
        httpError.status = response.status;
        if (errorData.error?.code) httpError.code = errorData.error.code;
        throw normaliseError('openrouter', httpError);
      }
    } catch (err: unknown) {
      interface ErrorWithProvider extends Error {
        provider?: string;
      }
      const error = err as ErrorWithProvider;
      if (error.provider === 'openrouter') throw err;
      throw normaliseError('openrouter', error);
    }

    // Track pending tool calls
    const pendingToolCalls = new Map<string, PendingToolCall>();

    for await (const chunk of parseSSEStream<OpenAIStreamChunk>(response.body!, {
      yieldDoneMarker: true,
    })) {
      if (chunk.type === 'done') {
        // Emit any pending tool calls
        for (const [id, tc] of pendingToolCalls) {
          let argsObj: Record<string, unknown> | string;
          try {
            argsObj = JSON.parse(tc.args) as Record<string, unknown>;
          } catch (_) {
            argsObj = tc.args;
          }
          yield { type: 'tool_call', id, name: tc.name, arguments: argsObj };
        }
        yield { type: 'done' };
        return;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        yield { type: 'delta', content: delta.content };
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const id = tc.id || `call_${idx}`;

          if (!pendingToolCalls.has(id) && tc.id) {
            pendingToolCalls.set(id, { name: tc.function?.name || '', args: '' });
          }

          const pending = pendingToolCalls.get(id) || pendingToolCalls.get(`call_${idx}`);
          if (pending) {
            if (tc.function?.name) pending.name = tc.function.name;
            if (tc.function?.arguments) pending.args += tc.function.arguments;
          } else if (tc.id) {
            pendingToolCalls.set(tc.id, {
              name: tc.function?.name || '',
              args: tc.function?.arguments || '',
            });
          }
        }
      }

      // Check for finish reason
      if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
        // Emit pending tool calls
        for (const [id, tc] of pendingToolCalls) {
          let argsObj: Record<string, unknown> | string;
          try {
            argsObj = JSON.parse(tc.args) as Record<string, unknown>;
          } catch (_) {
            argsObj = tc.args;
          }
          yield { type: 'tool_call', id, name: tc.name, arguments: argsObj };
        }
        pendingToolCalls.clear();
      }
    }

    yield { type: 'done' };
  }
}

// Export for CommonJS compatibility
module.exports = OpenRouterAdapter;
export default OpenRouterAdapter;
