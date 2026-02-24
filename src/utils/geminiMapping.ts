/*
 * Central conversion helpers turning the MCP unified message schema into the
 * Google Gemini / Generative AI SDK "contents" format and vice-versa.
 *
 * Exported so both the streaming SDK and raw HTTPS fallback paths share the
 * identical mapping logic – this avoids the drift that previously caused
 * function-call failures because the two code-paths disagreed about how to
 * encode tool results.
 */

'use strict';

// MCP message types
interface TextContent {
  type: 'text';
  text: string;
}

interface ImageUrlContent {
  type: 'image_url';
  image_url: { url: string } | string;
}

interface ImageSourceContent {
  type: 'image';
  source: {
    type: string;
    data: string;
    media_type?: string;
  };
}

type ContentPart = TextContent | ImageUrlContent | ImageSourceContent;

interface MCPMessage {
  role: string;
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
}

// Gemini types
interface GeminiTextPart {
  text: string;
}

interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type GeminiPart = GeminiTextPart | GeminiInlineDataPart | GeminiFunctionResponsePart;

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

/**
 * Convert multi-modal content to Gemini parts format.
 * Handles both string content and OpenAI-style content arrays.
 */
function contentToGeminiParts(content: string | ContentPart[]): GeminiPart[] {
  // Simple string content
  if (typeof content === 'string') {
    return [{ text: content }];
  }

  // Array content (multi-modal)
  if (Array.isArray(content)) {
    const parts: GeminiPart[] = [];
    for (const item of content) {
      if (!item) continue;

      // Text content
      if (item.type === 'text' && (item as TextContent).text) {
        parts.push({ text: String((item as TextContent).text) });
      }
      // Image content (OpenAI format: image_url)
      else if (item.type === 'image_url' && (item as ImageUrlContent).image_url) {
        const imageUrl = (item as ImageUrlContent).image_url;
        const url = typeof imageUrl === 'string' ? imageUrl : imageUrl.url;
        // Handle data URLs (base64)
        if (typeof url === 'string' && url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match && match[1] && match[2]) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
      // Anthropic format: image with source
      else if (item.type === 'image' && (item as ImageSourceContent).source) {
        const source = (item as ImageSourceContent).source;
        if (source.type === 'base64' && source.data) {
          parts.push({
            inlineData: {
              mimeType: source.media_type || 'image/png',
              data: source.data,
            },
          });
        }
      }
    }
    return parts.length > 0 ? parts : [{ text: '' }];
  }

  // Fallback
  return [{ text: String(content ?? '') }];
}

/**
 * Convert a single MCP message into a Gemini compatible "content" object.
 */
function messageToGeminiContent(m: MCPMessage): GeminiContent {
  // Gemini supports only the roles "user", "model" and "function".
  // – "user" stays "user".
  // – Everything the model said becomes "model".
  // – Tool/function results become role "function" with a functionResponse
  //   part as per the public API examples.

  if (m.role === 'user') {
    return {
      role: 'user',
      parts: contentToGeminiParts(m.content),
    };
  }

  if (m.role === 'tool' || m.role === 'function') {
    let responseObj: unknown;
    try {
      responseObj = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
    } catch (_) {
      responseObj = m.content;
    }

    // Gemini expects the functionResponse.response value to be a plain object.
    // When the tool returned an empty string (""), numbers or other
    // primitives we normalise that to an **empty** object so we always send a
    // valid payload.  This mirrors the behaviour of the OpenAI mapping util
    // and avoids runtime 400 errors from the Google API.
    if (responseObj === '' || typeof responseObj !== 'object' || responseObj === null) {
      responseObj = {};
    }
    const normalizedResponse = responseObj as Record<string, unknown>;

    return {
      role: 'function',
      parts: [
        {
          functionResponse: {
            name: m.name || m.tool_call_id || 'unknown',
            response: normalizedResponse,
          },
        },
      ],
    };
  }

  // Treat anything else as model (assistant) text.
  return {
    role: 'model',
    parts: contentToGeminiParts(m.content),
  };
}

/**
 * Convert entire array of MCP messages into Gemini contents[] payload.
 */
function mcpToGeminiContents(messages: MCPMessage[] = []): GeminiContent[] {
  return messages.map(messageToGeminiContent);
}

module.exports = {
  contentToGeminiParts,
  messageToGeminiContent,
  mcpToGeminiContents,
};

export { contentToGeminiParts, messageToGeminiContent, mcpToGeminiContents };
