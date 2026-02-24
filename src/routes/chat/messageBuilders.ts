/**
 * Message builders for chat route
 * - Provider-specific message construction
 * - Follow-up message formatting
 */

import type { StreamChunk, ContentPart, ChatMessage, ToolCallInfo } from './types';
import type { ToolResultMessage, ToolUseMessage } from './toolExecution';

export type { ChatMessage, ToolCallInfo };

/**
 * Build combined assistant message with text and tool uses for Anthropic
 */
export function buildAnthropicAssistantMessage(
  assistantBuffer: string,
  toolUseMessages: ToolUseMessage[]
): ChatMessage[] {
  const assistantContentBlocks: ContentPart[] = [];

  if (assistantBuffer && assistantBuffer.trim()) {
    assistantContentBlocks.push({ type: 'text', text: assistantBuffer.trim() });
  }

  for (const msg of toolUseMessages) {
    if (Array.isArray(msg.content)) {
      assistantContentBlocks.push(...msg.content);
    }
  }

  if (assistantContentBlocks.length > 0) {
    return [{ role: 'assistant', content: assistantContentBlocks }];
  }

  return toolUseMessages as unknown as ChatMessage[];
}

/**
 * Build tool_calls array for OpenAI/OpenRouter format
 */
export function buildToolCallsArray(toolCallChunks: StreamChunk[]): ToolCallInfo[] {
  return toolCallChunks.map((call) => {
    const toolUseId =
      call.id || call.call_id || call.tool_call_id || call.tool_use_id || call.toolUseId;
    const args = call.arguments || {};
    const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
    return {
      id: toolUseId || '',
      type: 'function',
      function: { name: call.name || '', arguments: argsStr },
    };
  });
}

/**
 * Build OpenRouter assistant message with tool_calls
 */
export function buildOpenRouterAssistantMessage(
  assistantBuffer: string,
  toolCallChunks: StreamChunk[]
): ChatMessage {
  const toolCallsArray = buildToolCallsArray(toolCallChunks);
  return {
    role: 'assistant',
    content: assistantBuffer && assistantBuffer.trim() ? assistantBuffer.trim() : '',
    tool_calls: toolCallsArray,
  };
}

/** Options for building follow messages */
export interface BuildFollowMessagesOptions {
  provider: string;
  finalMessages: ChatMessage[];
  assistantBuffer: string;
  toolUseMessages: ToolUseMessage[];
  toolResultMessages: ToolResultMessage[];
  toolCallChunks: StreamChunk[];
  initialResponseId: string | null;
}

/**
 * Build follow-up messages after tool execution
 * Different providers need different message formats
 */
export function buildFollowMessages(
  options: BuildFollowMessagesOptions
): (ChatMessage | ToolResultMessage)[] {
  const {
    provider,
    finalMessages,
    assistantBuffer,
    toolUseMessages,
    toolResultMessages,
    toolCallChunks,
    initialResponseId,
  } = options;

  const provLC = provider.toLowerCase();

  if (provLC === 'openai' && initialResponseId) {
    // OpenAI with response_id: just send tool results
    return [...toolResultMessages];
  }

  if (provLC === 'anthropic') {
    // Anthropic: combined assistant message + tool results
    const combinedAssistantMessage = buildAnthropicAssistantMessage(
      assistantBuffer,
      toolUseMessages
    );
    return [...finalMessages, ...combinedAssistantMessage, ...toolResultMessages];
  }

  if (provLC === 'openrouter') {
    // OpenRouter: OpenAI-compatible format with tool_calls array
    const assistantMessage = buildOpenRouterAssistantMessage(assistantBuffer, toolCallChunks);
    return [...finalMessages, assistantMessage, ...toolResultMessages];
  }

  // Default: text assistant message + tool results
  const assistantTextMessages: ChatMessage[] =
    assistantBuffer && assistantBuffer.trim()
      ? [{ role: 'assistant', content: assistantBuffer.trim() }]
      : [];
  return [...finalMessages, ...assistantTextMessages, ...toolResultMessages];
}

/** Options for building next round messages in chaining */
export interface BuildNextRoundMessagesOptions {
  provider: string;
  model: string;
  finalMessages: ChatMessage[];
  pendingCalls: StreamChunk[];
  moreToolUseMessages: ToolUseMessage[];
  moreToolResults: ToolResultMessage[];
  rollingAnthropicMessages: (ChatMessage | ToolResultMessage)[] | null;
  rollingOpenRouterMessages: (ChatMessage | ToolResultMessage)[] | null;
  providerTools: unknown[];
  effectiveReasoning: unknown;
  systemPrompt: string | null;
  initialResponseId: string | null;
  currentResponseId: string | null;
}

/** Result from building next round messages */
export interface NextRoundMessagesResult {
  nextParams: Record<string, unknown>;
  rollingAnthropicMessages: (ChatMessage | ToolResultMessage)[] | null;
  rollingOpenRouterMessages: (ChatMessage | ToolResultMessage)[] | null;
}

/**
 * Build messages for the next round of tool chaining
 */
export function buildNextRoundMessages(
  options: BuildNextRoundMessagesOptions
): NextRoundMessagesResult {
  const {
    provider,
    model,
    finalMessages,
    pendingCalls,
    moreToolUseMessages,
    moreToolResults,
    providerTools,
    effectiveReasoning,
    systemPrompt,
    initialResponseId,
    currentResponseId,
  } = options;

  let { rollingAnthropicMessages, rollingOpenRouterMessages } = options;

  let nextParams: Record<string, unknown>;
  const prov = provider.toLowerCase();

  if (prov === 'anthropic') {
    rollingAnthropicMessages = [
      ...(rollingAnthropicMessages || finalMessages),
      ...(moreToolUseMessages as unknown as ChatMessage[]),
      ...moreToolResults,
    ];
    nextParams = {
      model,
      messages: rollingAnthropicMessages,
      tools: providerTools,
      stream: true,
    };
  } else if (prov === 'openrouter') {
    // Build assistant message with tool_calls in OpenAI format
    const moreAssistantMessage = buildOpenRouterAssistantMessage('', pendingCalls);
    rollingOpenRouterMessages = [
      ...(rollingOpenRouterMessages || finalMessages),
      moreAssistantMessage,
      ...moreToolResults,
    ];
    nextParams = {
      model,
      messages: rollingOpenRouterMessages,
      tools: providerTools,
      stream: true,
    };
  } else if (prov === 'gemini' || prov === 'google') {
    nextParams = {
      model,
      messages: [...finalMessages, ...moreToolResults],
      tools: providerTools,
      stream: true,
    };
  } else {
    // OpenAI and others
    nextParams = {
      model,
      messages: moreToolResults,
      tools: providerTools,
      stream: true,
    };
  }

  if (effectiveReasoning) {
    nextParams.reasoning = effectiveReasoning;
  }
  if (prov === 'openai') {
    nextParams.previous_response_id = currentResponseId || initialResponseId;
  }
  if (systemPrompt && (prov === 'gemini' || prov === 'google')) {
    nextParams.systemPrompt = systemPrompt;
  }

  return {
    nextParams,
    rollingAnthropicMessages,
    rollingOpenRouterMessages,
  };
}

/**
 * Initialize rolling messages for tool chaining
 */
export function initializeRollingMessages(
  provider: string,
  finalMessages: ChatMessage[],
  assistantBuffer: string,
  toolUseMessages: ToolUseMessage[],
  toolResultMessages: ToolResultMessage[],
  messagesAfterTool: (ChatMessage | ToolResultMessage)[]
): {
  rollingAnthropicMessages: (ChatMessage | ToolResultMessage)[] | null;
  rollingOpenRouterMessages: (ChatMessage | ToolResultMessage)[] | null;
} {
  let rollingAnthropicMessages: (ChatMessage | ToolResultMessage)[] | null = null;
  let rollingOpenRouterMessages: (ChatMessage | ToolResultMessage)[] | null = null;

  if (provider.toLowerCase() === 'anthropic') {
    const combinedAssistantMessage = buildAnthropicAssistantMessage(
      assistantBuffer,
      toolUseMessages
    );
    rollingAnthropicMessages = [
      ...finalMessages,
      ...combinedAssistantMessage,
      ...toolResultMessages,
    ];
  }

  if (provider.toLowerCase() === 'openrouter') {
    rollingOpenRouterMessages = [...messagesAfterTool];
  }

  return { rollingAnthropicMessages, rollingOpenRouterMessages };
}
