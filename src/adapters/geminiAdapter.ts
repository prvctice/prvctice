/*
 * Google Gemini (Generative AI) adapter.
 *
 * Implements the unified MCP streaming contract and function tools using the
 * official `@google/generative-ai` SDK when available, falling back to a
 * minimal HTTPS + SSE path otherwise.
 */

'use strict';

import { BaseAdapter } from './baseAdapter.js';
import type { ChatRequest, Tool, AnyTool } from '../../types/chat.js';
import type { ChatChunk } from '../../types/adapters.js';
import { normaliseError } from '../utils/errors.js';
import { postJSON } from '../utils/httpRequest.js';
import { parseSSE } from '../utils/sseFallback.js';
import { mcpToGeminiContents } from '../utils/geminiMapping.js';
import { toGeminiSchema } from '../utils/geminiSchema.js';
import type { IncomingMessage } from 'http';

// SDK types - define interfaces based on actual usage
interface GeminiModelClient {
  generateContentStream(params: { contents: GeminiContent[] }): Promise<GeminiStreamResult>;
}

interface GeminiStreamResult {
  stream: AsyncIterable<GeminiStreamChunk>;
  response: Promise<GeminiResponse>;
}

interface GeminiStreamChunk {
  text?: () => string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
    id?: string;
  };
  inlineData?: {
    mimeType?: string;
    data: string;
  };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GoogleGenerativeAI {
  getGenerativeModel(config: {
    model: string;
    tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
    systemInstruction?: { parts: Array<{ text: string }> };
    toolConfig?: { functionCallingConfig: { mode: string } };
  }): GeminiModelClient;
}

interface GenAIModule {
  GoogleGenerativeAI: new (apiKey: string) => GoogleGenerativeAI;
}

interface GenAIv2Constructor {
  new (config: { apiKey: string }): unknown;
}

interface GenAIv2Module {
  GoogleAI?: GenAIv2Constructor;
  GoogleGenAI?: GenAIv2Constructor;
  default?: GenAIv2Constructor;
}

// SDK imports with fallback (try/catch is intentional for optional SDKs)
let GenAI: GenAIModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  GenAI = require('@google/generative-ai') as GenAIModule;
} catch {
  GenAI = null;
}

let GenAIv2: GenAIv2Module | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  GenAIv2 = require('@google/genai') as GenAIv2Module;
} catch {
  GenAIv2 = null;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown> & { type?: string };
}

function toFunctionDeclarations(tools: Tool[] = []): GeminiFunctionDeclaration[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((t) => {
    const schema = toGeminiSchema(t.parameters || { type: 'object' }) || { type: 'object' };
    return {
      name: t.name,
      description: t.description || '-',
      parameters: schema as Record<string, unknown>,
    };
  });
}

export class GeminiAdapter extends BaseAdapter {
  private apiKey: string;
  private client: GoogleGenerativeAI | null;
  private genai: unknown;

  constructor({ apiKey }: { apiKey: string }) {
    super({ apiKey });
    this.apiKey = apiKey;
    // Older SDK (@google/generative-ai)
    this.client = GenAI ? new GenAI.GoogleGenerativeAI(apiKey) : null;
    // Newer SDK (@google/genai) – be resilient to export name changes
    this.genai = null;
    if (GenAIv2) {
      try {
        const Ctor =
          // Common naming in recent releases
          GenAIv2.GoogleAI ||
          // Some builds export GoogleGenAI
          GenAIv2.GoogleGenAI ||
          // Fallback to default export if it's a constructor
          (typeof GenAIv2.default === 'function' ? GenAIv2.default : null);
        if (typeof Ctor === 'function') {
          this.genai = new Ctor({ apiKey });
        }
      } catch (_) {
        this.genai = null;
      }
    }
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown> {
    interface ExtendedChatRequest extends ChatRequest {
      systemPrompt?: string;
    }
    const { model, messages = [], tools = [], systemPrompt } = req as ExtendedChatRequest;

    const contents = mcpToGeminiContents(messages) as GeminiContent[];
    // Filter out server-side tools (e.g., Anthropic web search) — not applicable to Gemini
    const functionTools = (tools as AnyTool[]).filter(
      (t): t is Tool => !('type' in t && t.type === 'web_search_20250305')
    );
    const functionDeclarations = toFunctionDeclarations(functionTools);
    // Ensure unique tool_call ids even when Gemini omits them
    let callSeq = 0;

    // Preferred path: SDK with native streaming
    if (this.client) {
      try {
        // Apply toolConfig for function calling mode when tool_choice is set (best-effort)
        const toolConfig =
          req.tool_choice && functionDeclarations
            ? { functionCallingConfig: { mode: 'ANY' } }
            : undefined;

        const modelClient = this.client.getGenerativeModel({
          model,
          tools: functionDeclarations ? [{ functionDeclarations }] : undefined,
          // systemInstruction is supported by the SDK
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          toolConfig,
        });

        const result = await modelClient.generateContentStream({ contents });

        // Accumulate function-calls to emit a single structured tool_call at completion
        for await (const chunk of result.stream) {
          try {
            const text = typeof chunk.text === 'function' ? chunk.text() : '';
            if (text) {
              yield { type: 'delta', content: text };
            }
          } catch (_) {
            // ignore text extraction errors
          }
        }

        // After the stream finishes, inspect the final response for function calls
        const resp = await result.response;
        const candidates = resp?.candidates || [];
        for (const cand of candidates) {
          const parts = cand?.content?.parts || [];
          for (const p of parts) {
            const fc = p?.functionCall;
            if (fc && fc.name) {
              let args: Record<string, unknown> = {};
              try {
                args = fc.args || {};
              } catch (_) {
                args = {};
              }
              const id = fc.id || `${fc.name}:${++callSeq}`;
              yield { type: 'tool_call', id, name: fc.name, arguments: args };
            }
            if (p?.inlineData && p.inlineData.data) {
              const mimeType = p.inlineData.mimeType || 'image/png';
              // Emit base64 image payload so the caller can render or save it
              yield { type: 'image', mimeType, data: p.inlineData.data };
            }
          }
        }

        yield { type: 'done' };
        return;
      } catch (err) {
        throw normaliseError('gemini', err as Error);
      }
    }

    // Fallback path – minimal HTTPS + SSE parser

    // Gemini public REST for streaming content generation
    const path = `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}`;
    // Apply toolConfig for function calling mode when tool_choice is set (best-effort)
    const restToolConfig =
      req.tool_choice && functionDeclarations
        ? { functionCallingConfig: { mode: 'ANY' } }
        : undefined;

    const body = {
      contents,
      tools: functionDeclarations ? [{ functionDeclarations }] : undefined,
      generationConfig: {},
      // System instruction for REST
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      toolConfig: restToolConfig,
    };

    let respStream: IncomingMessage;
    try {
      respStream = await postJSON({
        hostname: 'generativelanguage.googleapis.com',
        path,
        body,
        headers: { Accept: 'text/event-stream' },
      });
    } catch (err) {
      throw normaliseError('gemini', err as Error);
    }

    const normalise = (obj: unknown): ChatChunk[] => {
      const out: ChatChunk[] = [];
      const evt = obj as GeminiResponse;
      const cands = evt?.candidates || [];
      for (const c of cands) {
        const parts = c?.content?.parts || [];
        for (const part of parts) {
          if (part.text) {
            out.push({ type: 'delta', content: part.text });
          }
          if (part.functionCall && part.functionCall.name) {
            out.push({
              type: 'tool_call',
              id: part.functionCall.id || `${part.functionCall.name}:${++callSeq}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            });
          }
          if (part.inlineData && part.inlineData.data) {
            out.push({
              type: 'image',
              mimeType: part.inlineData.mimeType || 'image/png',
              data: part.inlineData.data,
            });
          }
        }
      }
      return out;
    };

    for await (const chunk of parseSSE(respStream, normalise)) {
      yield chunk;
    }
  }
}

// Export for CommonJS compatibility
module.exports = GeminiAdapter;
export default GeminiAdapter;
