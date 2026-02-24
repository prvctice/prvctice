/**
 * LM Studio adapter for local LLM inference.
 *
 * LM Studio provides an OpenAI-compatible API at localhost:1234.
 * No API key required - runs entirely locally.
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

const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234';

import { normaliseError } from '../utils/errors.js';
import { parseSSEStream } from '../utils/parseSSEStream.js';

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
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface LMStudioMessage {
  role: string;
  content: string | ContentPart[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface LMStudioTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

// Extended ChatMessage with tool-related fields
interface ToolMessage extends ChatMessage {
  tool_use_id?: string;
  tool_call_id?: string;
  call_id?: string;
  id?: string;
}

/**
 * Convert messages to OpenAI chat format.
 */
function toLMStudioMessages(messages: ChatMessage[] = []): LMStudioMessage[] {
  const result: LMStudioMessage[] = [];

  for (const m of messages) {
    if (!m || !m.role) continue;

    const role = m.role;

    // Standard text messages
    if (role === 'user' || role === 'assistant' || role === 'system') {
      let content: string | ContentPart[];
      if (typeof m.content === 'string') {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        // LM Studio supports images in content array
        content = m.content as ContentPart[];
      } else {
        try {
          content = JSON.stringify(m.content);
        } catch (_) {
          content = String(m.content ?? '');
        }
      }

      const msg: LMStudioMessage = { role, content };

      // Include tool_calls if present
      if (role === 'assistant' && m.tool_calls) {
        msg.tool_calls = m.tool_calls as OpenAIToolCall[];
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

// Tool with optional type field
interface ExtendedTool extends Tool {
  type?: string;
}

/**
 * Convert tools to OpenAI format.
 */
function toLMStudioTools(tools: Tool[] = []): LMStudioTool[] {
  const result: LMStudioTool[] = [];

  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;

    // Skip built-in tools
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

export class LMStudioAdapter extends BaseAdapter {
  private baseUrl: string;

  constructor({ baseUrl }: { baseUrl?: string } = {}) {
    super({ apiKey: '' });
    this.baseUrl = baseUrl || process.env.LMSTUDIO_URL || DEFAULT_LMSTUDIO_URL;
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown> {
    const { model, messages = [], tools = [] } = req;

    const lmMessages = toLMStudioMessages(messages);
    // Filter out server-side tools (e.g., Anthropic web search) — not applicable to LM Studio
    const functionTools = (tools as AnyTool[]).filter(
      (t): t is Tool => !('type' in t && t.type === 'web_search_20250305')
    );
    const lmTools = toLMStudioTools(functionTools);

    interface LMStudioRequestBody {
      model: string;
      messages: LMStudioMessage[];
      stream: boolean;
      tools?: LMStudioTool[];
      tool_choice?: string;
    }

    const body: LMStudioRequestBody = {
      model: model || 'local-model',
      messages: lmMessages,
      stream: true,
    };

    // Only include tools if present
    if (lmTools.length > 0) {
      body.tools = lmTools;
      // Pass through tool_choice if provided (best-effort, LM Studio may not reliably honor this)
      if (typeof req.tool_choice === 'string') {
        body.tool_choice = req.tool_choice;
      }
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = errorText;

        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || errorData.error || errorText;
        } catch (_) {
          // Use raw text
        }

        const httpError = new Error(errorMessage) as Error & { status?: number };
        httpError.status = response.status;
        throw normaliseError('lmstudio', httpError);
      }
    } catch (err: unknown) {
      // Handle connection errors with helpful messages
      interface ErrorWithCode extends Error {
        code?: string;
        cause?: { code?: string };
        provider?: string;
        status?: number;
      }
      const error = err as ErrorWithCode;

      if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
        const connError = new Error(
          'LM Studio is not running. Start LM Studio and load a model.'
        ) as Error & { code?: string; status?: number };
        connError.code = 'ECONNREFUSED';
        connError.status = 503;
        throw normaliseError('lmstudio', connError);
      }

      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timed out. The model may be loading.') as Error & {
          code?: string;
          status?: number;
        };
        timeoutError.code = 'TIMEOUT';
        timeoutError.status = 408;
        throw normaliseError('lmstudio', timeoutError);
      }

      if (error.provider === 'lmstudio') throw err;

      throw normaliseError('lmstudio', error);
    }

    // Track pending tool calls for streaming
    const pendingToolCalls = new Map<number, PendingToolCall>();

    for await (const chunk of parseSSEStream<OpenAIStreamChunk>(response.body!)) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        yield { type: 'delta', content: delta.content };
      }

      // Tool calls (OpenAI format)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;

          // Initialize or update pending tool call
          if (!pendingToolCalls.has(index)) {
            pendingToolCalls.set(index, {
              id: tc.id || `call_${index}`,
              name: '',
              arguments: '',
            });
          }

          const pending = pendingToolCalls.get(index)!;

          if (tc.id) pending.id = tc.id;
          if (tc.function?.name) pending.name += tc.function.name;
          if (tc.function?.arguments) pending.arguments += tc.function.arguments;
        }
      }

      // Check for finish
      if (choice.finish_reason) {
        // Emit any pending tool calls
        for (const [, tc] of pendingToolCalls) {
          let args: Record<string, unknown> | string;
          try {
            args = tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {};
          } catch (_) {
            args = tc.arguments;
          }
          yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: args };
        }

        yield { type: 'done' };
        return;
      }
    }

    // Emit any remaining tool calls
    for (const [, tc] of pendingToolCalls) {
      let args: Record<string, unknown> | string;
      try {
        args = tc.arguments ? (JSON.parse(tc.arguments) as Record<string, unknown>) : {};
      } catch (_) {
        args = tc.arguments;
      }
      yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: args };
    }

    yield { type: 'done' };
  }
}

// Export for CommonJS compatibility
module.exports = LMStudioAdapter;
export default LMStudioAdapter;
