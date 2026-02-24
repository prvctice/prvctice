/*
 * Anthropic (Claude 3 family) adapter – converts unified ChatRequest into
 * Anthropic Messages API calls and normalises the streaming response back into
 * ChatChunk objects.
 *
 * Implementation notes
 * • Uses the official `@anthropic-ai/sdk` which supports streaming with async
 *   iterators.  When the SDK is not installed we throw an informative error so
 *   the caller can prompt to install it.
 * • System messages are aggregated into the `system` field (Claude supports a
 *   single system prompt string).
 * • Tool calling is supported via Claude 3 "Tool Use" (tools array plus
 *   `tool_use` and `tool_result` messages).  We surface `tool_use` as
 *   {type:'tool_call', name, arguments} and forward the rest unchanged.
 */

import { BaseAdapter } from './baseAdapter.js';
import type { ChatRequest, ChatMessage, AnyTool } from '../../types/chat.js';
import type { ChatChunk } from '../../types/adapters.js';

import { normaliseError } from '../utils/errors.js';
import { postJSON } from '../utils/httpRequest.js';
import { parseSSE } from '../utils/sseFallback.js';
import type { IncomingMessage } from 'http';

// SDK types - define interfaces based on actual usage since SDK may not be installed
interface AnthropicClient {
  messages: {
    create(params: AnthropicCreateParams): Promise<AsyncIterable<AnthropicStreamEvent>>;
  };
}

interface AnthropicSDKModule {
  Anthropic: new (config: { apiKey: string }) => AnthropicClient;
}

// Anthropic web search tool definition (server-side, different shape from function tools)
interface AnthropicWebSearchToolDefinition {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses?: number;
}

interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// The tools array accepts both function tool definitions and web search tools
type AnthropicToolParam = AnthropicToolDefinition | AnthropicWebSearchToolDefinition;

interface AnthropicCreateParams {
  model: string;
  messages: AnthropicMessage[];
  stream: boolean;
  max_tokens: number;
  system?: string;
  tools?: AnthropicToolParam[];
  tool_choice?: { type: string } | undefined;
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    // web_search_tool_result fields
    search_results?: Array<{ title?: string; url?: string }>;
    // web_search_tool_result_error fields
    error_code?: string;
    error_message?: string;
  };
}

// SDK import with fallback (try/catch is intentional for optional SDK)
let AnthropicSDK: AnthropicSDKModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  AnthropicSDK = require('@anthropic-ai/sdk') as AnthropicSDKModule;
} catch {
  AnthropicSDK = null;
}

interface AnthropicImageSource {
  type: 'base64' | 'url';
  media_type?: string;
  data?: string;
  url?: string;
}

interface AnthropicImageBlock {
  type: 'image';
  source: AnthropicImageSource;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Server-side tool blocks (web search) — passed through unchanged in conversation history
interface AnthropicServerToolUseBlock {
  type: 'server_tool_use';
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

interface AnthropicWebSearchResultBlock {
  type: 'web_search_tool_result';
  tool_use_id?: string;
  content?: unknown;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolResultBlock
  | AnthropicToolUseBlock
  | AnthropicServerToolUseBlock
  | AnthropicWebSearchResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface PendingTool {
  id: string;
  name: string;
  partial: string;
}

// Input block types for conversion functions
interface OpenAIImageUrlBlock {
  type: 'image_url';
  image_url?: { url: string } | string;
}

interface CustomImageBlock {
  type: 'image';
  source?: AnthropicImageSource;
  data?: string;
  base64?: string;
  media_type?: string;
  mimeType?: string;
}

type InputImageBlock = OpenAIImageUrlBlock | CustomImageBlock | AnthropicImageBlock;

interface InputContentBlock {
  type: string;
  text?: string;
  image_url?: { url: string } | string;
  source?: AnthropicImageSource;
  data?: string;
  base64?: string;
  media_type?: string;
  mimeType?: string;
  tool_use_id?: string;
  content?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Convert an image block from OpenAI format to Anthropic format.
 * OpenAI uses: { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 * Anthropic uses: { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } }
 */
function convertImageBlock(block: InputImageBlock | null | undefined): AnthropicImageBlock | null {
  if (!block) return null;

  // Already in Anthropic format
  if (block.type === 'image' && block.source) {
    return block as AnthropicImageBlock;
  }

  // OpenAI format with data URL
  if (block.type === 'image_url') {
    const imageUrlBlock = block as OpenAIImageUrlBlock;
    const imageUrl = imageUrlBlock.image_url;
    if (!imageUrl) return null;
    const url = typeof imageUrl === 'string' ? imageUrl : imageUrl.url;
    const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: dataUrlMatch[1],
          data: dataUrlMatch[2],
        },
      };
    }
    // URL-based image (Anthropic also supports this)
    return {
      type: 'image',
      source: {
        type: 'url',
        url: url,
      },
    };
  }

  // Direct base64 data format (custom)
  if (block.type === 'image') {
    const customBlock = block as CustomImageBlock;
    if (!customBlock.data && !customBlock.base64) return null;
    const data = customBlock.data || customBlock.base64;
    const mediaType = customBlock.media_type || customBlock.mimeType || 'image/png';
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: typeof data === 'string' ? data.replace(/^data:[^;]+;base64,/, '') : data,
      },
    };
  }

  return null;
}

/**
 * Convert a content block to Anthropic format.
 * Handles text, images, and tool_result blocks.
 */
function convertContentBlock(
  block: string | InputContentBlock | null | undefined
): AnthropicContentBlock | null {
  if (!block) return null;

  // Plain string → text block
  if (typeof block === 'string') {
    return { type: 'text', text: block };
  }

  // Text block
  if (block.type === 'text') {
    return { type: 'text', text: block.text || '' };
  }

  // Image blocks
  if (block.type === 'image_url' || block.type === 'image') {
    return convertImageBlock(block as InputImageBlock);
  }

  // Tool result (pass through)
  if (block.type === 'tool_result') {
    return block as AnthropicToolResultBlock;
  }

  // Tool use (pass through)
  if (block.type === 'tool_use') {
    return block as AnthropicToolUseBlock;
  }

  // Server-side tool blocks (web search) — pass through for multi-turn history
  if (block.type === 'server_tool_use') {
    return block as unknown as AnthropicServerToolUseBlock;
  }

  if (block.type === 'web_search_tool_result') {
    return block as unknown as AnthropicWebSearchResultBlock;
  }

  return null;
}

interface ConvertedMessages {
  systemPrompt: string | undefined;
  converted: AnthropicMessage[];
}

function convertMessages(messages: ChatMessage[]): ConvertedMessages {
  const converted: AnthropicMessage[] = [];
  let systemPrompt = '';

  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt += `${m.content}\n`;
    }
    // Assistant or user messages – need special handling to keep tool_result
    // blocks isolated in their own user message.
    else if (m.role === 'assistant' || m.role === 'user') {
      // Normalise "content" into an array so we can inspect block types.
      const rawBlocks = Array.isArray(m.content) ? m.content : [m.content];

      // Convert all blocks to Anthropic format
      const blocks = rawBlocks
        .map((b) => convertContentBlock(b))
        .filter((b): b is AnthropicContentBlock => b !== null);

      // Split out any tool_result blocks found inside user messages.
      if (m.role === 'user') {
        const contentBlocks = blocks.filter((b) => b?.type !== 'tool_result');
        const resultBlocks = blocks.filter(
          (b): b is AnthropicToolResultBlock => b?.type === 'tool_result'
        );

        if (contentBlocks.length > 0) {
          // If only one text block, simplify to string
          const firstBlock = contentBlocks[0];
          const content: string | AnthropicContentBlock[] =
            contentBlocks.length === 1 && firstBlock?.type === 'text'
              ? (firstBlock as AnthropicTextBlock).text
              : contentBlocks;
          converted.push({ role: 'user', content });
        }
        for (const rb of resultBlocks) {
          converted.push({ role: 'user', content: [rb] });
        }
      } else {
        // Assistant messages – may *erroneously* include tool_result blocks.
        const contentBlocks = blocks.filter((b) => b?.type !== 'tool_result');
        const resultBlocks = blocks.filter(
          (b): b is AnthropicToolResultBlock => b?.type === 'tool_result'
        );

        if (contentBlocks.length > 0) {
          const firstBlock = contentBlocks[0];
          const content: string | AnthropicContentBlock[] =
            contentBlocks.length === 1 && firstBlock?.type === 'text'
              ? (firstBlock as AnthropicTextBlock).text
              : contentBlocks;
          converted.push({ role: 'assistant', content });
        }
        for (const rb of resultBlocks) {
          converted.push({ role: 'user', content: [rb] });
        }
      }
    } else if (m.role === 'function' || m.role === 'tool') {
      // Claude expects tool results to be wrapped in a *user* message whose
      // sole content block is {type:'tool_result', tool_use_id, content}.
      // Some upstream callers store the originating tool id under different
      // keys, so fall back through the common variants before giving up.
      interface ToolMessage extends ChatMessage {
        tool_use_id?: string;
        toolUseId?: string;
        tool_call_id?: string;
        id?: string;
        metadata?: { tool_use_id?: string; id?: string };
      }
      const msg = m as ToolMessage;
      const toolUseId =
        msg.tool_use_id ||
        msg.toolUseId ||
        msg.tool_call_id ||
        msg.id ||
        (msg.metadata && (msg.metadata.tool_use_id || msg.metadata.id));

      if (!toolUseId) {
        throw new Error(
          'Tool result message missing `tool_use_id`. ' +
            'Ensure you pass back the id you received in the prior tool_use.'
        );
      }

      converted.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          },
        ],
      });
    }
  }

  // Claude requires at least one user message; validation is done upstream.
  return { systemPrompt: systemPrompt.trim() || undefined, converted };
}

export class AnthropicAdapter extends BaseAdapter {
  private client: AnthropicClient | null;

  constructor({ apiKey }: { apiKey: string }) {
    super({ apiKey });
    // Official SDK is preferred when available for better error handling and
    // future-proof support.  However, requiring it made the whole Anthropic
    // path unusable when the dependency was not present.  Instead we fall
    // back to a minimal HTTPS streaming implementation so the MCP server
    // keeps functioning out-of-the-box.

    if (AnthropicSDK) {
      this.client = new AnthropicSDK.Anthropic({ apiKey });
    } else {
      this.client = null; // will use raw HTTPS path in streamChat()
    }
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown> {
    const { model, messages, tools = [] } = req;

    const { systemPrompt, converted } = convertMessages(messages);

    // Common payload shared by both the SDK and raw HTTPS paths.
    const payload: AnthropicCreateParams & { system?: string } = {
      model,
      messages: converted,
      stream: true,
      // Claude 3 requires max_tokens; default to 1024 if caller doesn't supply.
      max_tokens: typeof req.max_tokens === 'number' ? req.max_tokens : 4096,
    };

    if (systemPrompt) payload.system = systemPrompt;
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools.map((t: AnyTool): AnthropicToolParam => {
        // Web search tool — pass through as-is (server-side tool, not a function tool)
        if ('type' in t && t.type === 'web_search_20250305') {
          return { type: t.type, name: t.name, max_uses: t.max_uses };
        }
        // Standard function tool — convert to Anthropic format
        const ft = t as import('../../types/chat.js').Tool;
        const schema = { ...(ft.parameters || { type: 'object' }) };
        if (schema.type) schema.type = String(schema.type).toLowerCase();
        return {
          name: ft.name,
          description: ft.description || '-',
          input_schema: schema,
        };
      });
    }

    // Inject Anthropic native web search tool if not already present
    const hasWebSearch = (payload.tools || []).some(
      (t): t is AnthropicWebSearchToolDefinition => 'type' in t && t.type === 'web_search_20250305'
    );
    if (!hasWebSearch) {
      const maxUses = Math.max(
        1,
        Math.min(parseInt(process.env.ANTHROPIC_WEB_SEARCH_MAX_USES || '5', 10), 20)
      );
      if (!payload.tools) payload.tools = [];
      payload.tools.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: maxUses,
      });
    }

    // Apply tool_choice override when follow-up detection forces tool re-invocation
    if (req.tool_choice && typeof req.tool_choice === 'object' && 'type' in req.tool_choice) {
      payload.tool_choice = req.tool_choice as { type: string };
    }

    /* --------------------------------------------------------------------
       Preferred path – use official SDK when it is available.
       Handles pause_turn continuation: when web search pauses the turn,
       we re-submit with accumulated content blocks to let Claude continue.
    -------------------------------------------------------------------- */
    if (this.client) {
      const MAX_CONTINUATIONS = 3;
      let currentMessages = [...converted];

      for (let continuation = 0; continuation <= MAX_CONTINUATIONS; continuation++) {
        const currentPayload = { ...payload, messages: currentMessages };
        let stream: AsyncIterable<AnthropicStreamEvent>;
        try {
          stream = await this.client.messages.create(currentPayload);
        } catch (err) {
          throw normaliseError('anthropic', err as Error);
        }

        // Track in‑flight tool_use blocks so we can emit a complete tool_call
        // chunk once Claude finishes streaming the JSON input.
        // IMPORTANT: Only function tool_use blocks go in pendingTools.
        // server_tool_use blocks (web search) are tracked separately.
        const pendingTools = new Map<number, PendingTool>();
        // Track which indices are server_tool_use (web search) — do NOT add to pendingTools
        const serverToolIndices = new Set<number>();

        // Track content blocks for pause_turn continuation
        // Each entry: the raw content block to send back to the API
        const contentBlocks: Record<string, unknown>[] = [];
        // For text blocks, accumulate text by index
        const textByIndex = new Map<number, string>();
        // For server_tool_use blocks, accumulate input JSON by index
        const serverToolInputByIndex = new Map<
          number,
          { id: string; name: string; partial: string }
        >();

        let gotPauseTurn = false;

        try {
          for await (const part of stream) {
            const index = part.index ?? 0;
            switch (part.type) {
              // ========== content block lifecycle ==========
              case 'content_block_start':
                if (part.content_block?.type === 'tool_use') {
                  // Function tool — track in pendingTools
                  pendingTools.set(index, {
                    id: part.content_block.id || '',
                    name: part.content_block.name || '',
                    partial: '',
                  });
                } else if (part.content_block?.type === 'server_tool_use') {
                  // Server-side tool (web search) — emit status, do NOT add to pendingTools
                  serverToolIndices.add(index);
                  serverToolInputByIndex.set(index, {
                    id: part.content_block.id || '',
                    name: part.content_block.name || '',
                    partial: '',
                  });
                  yield {
                    type: 'web_search_status',
                    status: 'searching',
                    query: undefined,
                  };
                } else if (part.content_block?.type === 'web_search_tool_result') {
                  // Search results — store the full block for continuation
                  contentBlocks[index] = part.content_block as unknown as Record<string, unknown>;
                  // Extract URLs from search results for URL validation tracker
                  const searchResults = part.content_block.search_results;
                  if (Array.isArray(searchResults)) {
                    const urls = searchResults
                      .map((r) => r.url)
                      .filter((u): u is string => typeof u === 'string' && u.length > 0);
                    if (urls.length > 0) {
                      yield { type: 'web_search_urls', urls };
                    }
                  }
                } else if (part.content_block?.type === 'text') {
                  // Text block — initialize accumulator
                  textByIndex.set(index, '');
                }
                break;

              // ========== text deltas ==========
              case 'content_block_delta':
                if (part.delta?.type === 'text_delta' && part.delta.text) {
                  yield { type: 'delta', content: part.delta.text };
                  // Accumulate for pause_turn rebuild
                  const existing = textByIndex.get(index) ?? '';
                  textByIndex.set(index, existing + part.delta.text);
                }
                if (part.delta?.type === 'input_json_delta') {
                  // Accumulate for function tools
                  const tool = pendingTools.get(index);
                  if (tool) tool.partial += part.delta.partial_json || '';
                  // Accumulate for server tools (for continuation rebuild)
                  const serverTool = serverToolInputByIndex.get(index);
                  if (serverTool) serverTool.partial += part.delta.partial_json || '';
                }
                // citations_delta — ignored for v1 (text already contains URLs)
                break;

              case 'content_block_stop': {
                if (serverToolIndices.has(index)) {
                  // Server tool block finished — store for continuation, do NOT emit tool_call
                  const stool = serverToolInputByIndex.get(index);
                  if (stool) {
                    let input: Record<string, unknown> = {};
                    try {
                      input = stool.partial ? JSON.parse(stool.partial) : {};
                    } catch (_) {
                      /* empty */
                    }
                    contentBlocks[index] = {
                      type: 'server_tool_use',
                      id: stool.id,
                      name: stool.name,
                      input,
                    };
                  }
                  serverToolIndices.delete(index);
                  serverToolInputByIndex.delete(index);
                } else if (pendingTools.has(index)) {
                  // Function tool finished — emit tool_call
                  const tool = pendingTools.get(index)!;
                  let args: Record<string, unknown> = {};
                  try {
                    args = tool.partial ? JSON.parse(tool.partial) : {};
                  } catch (_) {
                    // leave args as empty object if JSON incomplete
                  }
                  contentBlocks[index] = {
                    type: 'tool_use',
                    id: tool.id,
                    name: tool.name,
                    input: args,
                  };
                  yield {
                    type: 'tool_call',
                    id: tool.id,
                    name: tool.name,
                    arguments: args,
                  };
                  pendingTools.delete(index);
                } else if (textByIndex.has(index)) {
                  // Text block finished — store for continuation
                  contentBlocks[index] = {
                    type: 'text',
                    text: textByIndex.get(index) || '',
                  };
                  textByIndex.delete(index);
                }
                break;
              }

              // ========== message lifecycle ==========
              case 'message_delta':
                if (part.delta?.stop_reason === 'pause_turn') {
                  gotPauseTurn = true;
                }
                break;

              case 'message_stop':
                if (!gotPauseTurn) {
                  yield { type: 'done' };
                }
                break;

              default:
                // Ignore other event types (ping, etc.)
                break;
            }
          }
        } catch (err) {
          throw normaliseError('anthropic', err as Error);
        }

        // If pause_turn, rebuild messages and continue
        if (gotPauseTurn) {
          // Build the assistant content blocks array (filter sparse array)
          const assistantContent = contentBlocks.filter(Boolean);
          if (assistantContent.length > 0) {
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: assistantContent } as unknown as AnthropicMessage,
            ];
          }
          // Loop will re-call the API with updated messages
          continue;
        }

        // Normal end — exit the continuation loop
        return;
      }

      // Exhausted continuation attempts — yield done
      yield { type: 'done' };
      return;
    }

    /* --------------------------------------------------------------------
       Fallback path – raw HTTPS + Server-Sent Events parser.  This keeps the
       adapter fully functional when the @anthropic-ai/sdk package is not
       installed (e.g. minimal or offline deployments).
    -------------------------------------------------------------------- */

    let responseStream: IncomingMessage;
    try {
      responseStream = await postJSON({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        body: payload as unknown as Record<string, unknown>,
        headers: {
          Accept: 'text/event-stream',
          'anthropic-version': '2025-03-05',
          'x-api-key': this.options.apiKey,
        },
      });
    } catch (err) {
      throw normaliseError('anthropic', err as Error);
    }

    const pendingTools = new Map<number, PendingTool>();
    const serverToolIndices = new Set<number>();
    const parseEvent = (part: unknown): ChatChunk[] => {
      const event = part as AnthropicStreamEvent;
      const out: ChatChunk[] = [];
      const index = event.index ?? 0;
      // replicate the same switch logic as the SDK path
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            out.push({ type: 'delta', content: event.delta.text });
          }
          if (event.delta?.type === 'input_json_delta') {
            const tool = pendingTools.get(index);
            if (tool) tool.partial += event.delta.partial_json || '';
          }
          break;
        case 'content_block_start':
          if (event.content_block?.type === 'tool_use') {
            pendingTools.set(index, {
              id: event.content_block.id || '',
              name: event.content_block.name || '',
              partial: '',
            });
          } else if (event.content_block?.type === 'server_tool_use') {
            serverToolIndices.add(index);
            out.push({ type: 'web_search_status', status: 'searching', query: undefined });
          } else if (event.content_block?.type === 'web_search_tool_result') {
            // Extract URLs from search results for URL validation tracker
            const searchResults = event.content_block.search_results;
            if (Array.isArray(searchResults)) {
              const urls = searchResults
                .map((r) => r.url)
                .filter((u): u is string => typeof u === 'string' && u.length > 0);
              if (urls.length > 0) {
                out.push({ type: 'web_search_urls', urls });
              }
            }
          } else if (event.content_block?.type === 'web_search_tool_result_error') {
            const errorCode = event.content_block.error_code || 'unknown';
            const errorMessage =
              event.content_block.error_message || `Web search error: ${errorCode}`;
            out.push({ type: 'web_search_error', error_code: errorCode, message: errorMessage });
          }
          break;
        case 'content_block_stop':
          if (serverToolIndices.has(index)) {
            serverToolIndices.delete(index);
          } else if (pendingTools.has(index)) {
            const tool = pendingTools.get(index)!;
            let args: Record<string, unknown> = {};
            try {
              args = tool.partial ? JSON.parse(tool.partial) : {};
            } catch (_) {}
            out.push({
              type: 'tool_call',
              id: tool.id,
              name: tool.name,
              arguments: args,
            });
            pendingTools.delete(index);
          }
          break;
        case 'message_delta':
          if (event.delta?.stop_reason === 'pause_turn') {
            out.push({ type: 'done' });
          }
          break;
        case 'message_stop':
          out.push({ type: 'done' });
          break;
        default:
          break;
      }
      return out;
    };

    for await (const c of parseSSE(responseStream, parseEvent)) {
      yield c;
    }
  }
}

// Export for CommonJS compatibility
module.exports = AnthropicAdapter;
export default AnthropicAdapter;
