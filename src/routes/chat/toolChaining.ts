/**
 * Tool chaining logic for chat route
 * - Multi-round tool execution
 * - Guard rails (timeout, round limits)
 * - Stream follow handling
 */

import type { Response } from 'express';
import type { StreamChunk, ToolMap, StreamAdapter } from './types';
import type { ToolResultMessage, ToolUseMessage } from './toolExecution';
import type { ChatMessage } from './messageBuilders';
import type { ConversationUrlTracker } from '../../services/urlValidator.js';
import logger from '../../utils/logger.js';
import { executeToolCalls } from './toolExecution.js';
import {
  buildFollowMessages,
  buildNextRoundMessages,
  initializeRollingMessages,
} from './messageBuilders.js';
import { emitToolProgress } from './streaming.js';
import { summariseToolOutputs } from './helpers.js';
import { UrlStreamAccumulator } from './urlStreamAccumulator.js';

/** Stream follow result */
interface StreamFollowResult {
  nextToolCalls: StreamChunk[];
  responseId: string | null;
  followBuffer: string;
}

/** URL tracker interface (avoids direct import of ConversationUrlTracker) */
interface UrlTracker {
  addToolResultUrls(toolName: string, resultContent: string): void;
  addWebSearchUrls(urls: string[]): void;
  isUrlValid(url: string): string;
  stripOrFlagUrl(markdownLink: string, rawUrl: string): string;
}

/** Tool chaining options */
export interface ToolChainingOptions {
  adapter: StreamAdapter;
  toolMap: ToolMap;
  provider: string;
  model: string;
  res: Response;
  finalMessages: ChatMessage[];
  assistantBuffer: string;
  toolUseMessages: ToolUseMessage[];
  toolResultMessages: ToolResultMessage[];
  toolCallChunks: StreamChunk[];
  providerTools: unknown[];
  effectiveReasoning: unknown;
  systemPrompt: string | null;
  initialResponseId: string | null;
  executedCallIds: Set<string>;
  chainStart: number;
  maxRounds?: number;
  chainTimeoutMs?: number;
  toolTimeoutMs?: number;
  urlTracker?: UrlTracker;
}

/** Tool chaining result */
export interface ToolChainingResult {
  abortedByGuard: boolean;
  guardReason: string;
  followBuffer: string;
  toolResultMessages: ToolResultMessage[];
  initialFollowStreamed: boolean;
}

/**
 * Create stream follow function for handling follow-up tool calls
 */
function createStreamFollow(
  adapter: StreamAdapter,
  res: Response,
  provider: string,
  urlTracker?: UrlTracker
): (params: Record<string, unknown>) => Promise<StreamFollowResult> {
  return async function streamFollow(params: Record<string, unknown>): Promise<StreamFollowResult> {
    logger.info('stream_follow_called', {
      provider: provider.toLowerCase(),
      messageCount: (params.messages as unknown[])?.length,
    });
    const nextToolCalls: StreamChunk[] = [];
    let lastResponseId: string | null = null;
    let followBuffer = '';
    let chunkCount = 0;
    let deltaCount = 0;

    // Create URL accumulator for this follow stream if tracker is available
    const followAccumulator = urlTracker
      ? new UrlStreamAccumulator(urlTracker as unknown as ConversationUrlTracker)
      : null;

    for await (const chunk of adapter.streamChat(params)) {
      chunkCount++;
      if (process.env.DEBUG_MCP === '1' || provider.toLowerCase() === 'anthropic') {
        logger.debug('stream_follow', { chunk: JSON.stringify(chunk) });
      }

      // Consume web_search_urls internally (do not forward to client)
      if (chunk.type === 'web_search_urls') {
        const chunkAny = chunk as unknown as { urls?: string[] };
        if (Array.isArray(chunkAny.urls) && urlTracker) {
          urlTracker.addWebSearchUrls(chunkAny.urls);
        }
        continue;
      }

      if (chunk.type === 'tool_call') {
        nextToolCalls.push(chunk);
        const toolId =
          chunk.id || chunk.call_id || chunk.tool_call_id || chunk.tool_use_id || chunk.toolUseId;
        logger.debug('follow_stream_tool_call', { name: chunk.name, id: toolId });
        if (toolId) {
          emitToolProgress(res, 'started', toolId, chunk.name);
        }
        continue;
      }

      if (chunk.type === 'response_id' && chunk.id) {
        lastResponseId = chunk.id;
      }

      if (chunk.type === 'delta' && chunk.content && followAccumulator) {
        deltaCount++;
        logger.debug('follow_stream_delta', { length: chunk.content?.length || 0 });
        // Filter delta content through URL accumulator
        const segments = followAccumulator.push(chunk.content);
        for (const segment of segments) {
          if (segment) {
            res.write(`${JSON.stringify({ type: 'delta', content: segment })}\n`);
          }
        }
      } else {
        if (chunk.type === 'delta') {
          deltaCount++;
          logger.debug('follow_stream_delta', { length: chunk.content?.length || 0 });
        }
        res.write(`${JSON.stringify(chunk)}\n`);
      }

      if (chunk.type === 'delta' && chunk.content) {
        followBuffer += chunk.content;
      }
    }

    // Flush any remaining URL buffer
    if (followAccumulator) {
      const flushed = followAccumulator.flush();
      for (const segment of flushed) {
        if (segment) {
          res.write(`${JSON.stringify({ type: 'delta', content: segment })}\n`);
        }
      }
    }

    logger.info('stream_follow_finished', {
      provider: provider.toLowerCase(),
      chunkCount,
      deltaCount,
      followBufferLength: followBuffer?.length || 0,
      nextToolCallsCount: nextToolCalls.length,
    });

    return { nextToolCalls, responseId: lastResponseId, followBuffer };
  };
}

/**
 * Handle tool chaining loop for multi-round tool execution
 */
export async function handleToolChaining(
  options: ToolChainingOptions
): Promise<ToolChainingResult> {
  const {
    adapter,
    toolMap,
    provider,
    model,
    res,
    finalMessages,
    assistantBuffer,
    toolUseMessages,
    toolResultMessages,
    toolCallChunks,
    providerTools,
    effectiveReasoning,
    systemPrompt,
    initialResponseId,
    executedCallIds,
    chainStart,
  } = options;

  const maxRounds =
    options.maxRounds ?? Math.max(1, parseInt(process.env.TOOL_CHAIN_MAX_ROUNDS || '3', 10));
  const chainTimeoutMs =
    options.chainTimeoutMs ??
    Math.max(5_000, parseInt(process.env.TOOL_CHAIN_TIMEOUT_MS || '45000', 10));
  const toolTimeoutMs =
    options.toolTimeoutMs ?? parseInt(process.env.TOOL_TIMEOUT_MS || '45000', 10);

  let abortedByGuard = false;
  let guardReason = '';
  let followBuffer = '';
  let initialFollowStreamed = false;
  const allToolResultMessages = [...toolResultMessages];

  // Track tool names that returned errors so the model can't retry them
  const failedToolNames = new Set<string>();
  for (const tr of toolResultMessages) {
    if (tr.name && isErrorResult(tr.content)) {
      failedToolNames.add(tr.name);
    }
  }

  // Build initial follow messages
  const messagesAfterTool = buildFollowMessages({
    provider,
    finalMessages,
    assistantBuffer,
    toolUseMessages,
    toolResultMessages,
    toolCallChunks,
    initialResponseId,
  });

  const followParams: Record<string, unknown> = {
    model,
    messages: messagesAfterTool,
    tools: providerTools,
    stream: true,
  };
  if (effectiveReasoning) followParams.reasoning = effectiveReasoning;
  if (systemPrompt && (provider === 'gemini' || provider === 'google')) {
    followParams.systemPrompt = systemPrompt;
  }

  // Initialize rolling messages
  let { rollingAnthropicMessages, rollingOpenRouterMessages } = initializeRollingMessages(
    provider,
    finalMessages,
    assistantBuffer,
    toolUseMessages,
    toolResultMessages,
    messagesAfterTool
  );

  const urlTracker = options.urlTracker;
  const streamFollow = createStreamFollow(adapter, res, provider, urlTracker);

  // Initial follow stream
  let rounds = 0;
  const result = await streamFollow(followParams);
  initialFollowStreamed = true;
  followBuffer = result.followBuffer;
  let pendingCalls = result.nextToolCalls;
  let currentResponseId = result.responseId;

  logger.info('initial_follow_complete', {
    provider: provider.toLowerCase(),
    followBufferLength: followBuffer?.length || 0,
    pendingCallsCount: pendingCalls?.length || 0,
    hasFollowContent: !!(followBuffer && followBuffer.trim()),
  });

  // Tool chaining loop
  while (pendingCalls && pendingCalls.length > 0) {
    // Check timeout guard
    if (Date.now() - chainStart > chainTimeoutMs) {
      abortedByGuard = true;
      guardReason = 'timeout';
      break;
    }

    // Check round limit guard
    rounds += 1;
    if (rounds > maxRounds) {
      abortedByGuard = true;
      guardReason = 'round_limit';
      break;
    }

    if (process.env.DEBUG_MCP === '1') {
      logger.debug('follow_tool_calls', {
        ids: pendingCalls.map((c) => c && (c.id || c.call_id || c.tool_call_id)),
      });
    }

    // Intercept retries of previously-failed tools with synthetic results
    const { live, synthetic } = interceptFailedRetries(
      pendingCalls,
      failedToolNames,
      provider,
      res
    );

    // Execute only non-failed pending tool calls
    const { toolUseMessages: moreToolUseMessages, toolResultMessages: moreToolResults } =
      live.length > 0
        ? await executeToolCalls(toolMap, live, {
            provider,
            res,
            executedCallIds,
            timeoutMs: toolTimeoutMs,
            urlTracker,
          })
        : { toolUseMessages: [], toolResultMessages: [] };

    // Merge synthetic results from intercepted retries
    moreToolUseMessages.push(...synthetic.toolUseMessages);
    moreToolResults.push(...synthetic.toolResultMessages);

    // Track newly failed tools
    for (const tr of moreToolResults) {
      if (tr.name && isErrorResult(tr.content)) {
        failedToolNames.add(tr.name);
      }
    }

    // Build next round messages
    const nextRoundResult = buildNextRoundMessages({
      provider,
      model,
      finalMessages,
      pendingCalls,
      moreToolUseMessages,
      moreToolResults,
      rollingAnthropicMessages,
      rollingOpenRouterMessages,
      providerTools,
      effectiveReasoning,
      systemPrompt,
      initialResponseId,
      currentResponseId,
    });

    rollingAnthropicMessages = nextRoundResult.rollingAnthropicMessages;
    rollingOpenRouterMessages = nextRoundResult.rollingOpenRouterMessages;
    const nextParams = nextRoundResult.nextParams;

    if (process.env.DEBUG_MCP === '1') {
      logger.debug('submitting_outputs_next', {
        ids: moreToolResults.map((m: ToolResultMessage) => m && (m.call_id || m.tool_use_id)),
      });
    }

    // Stream next round
    const followRes = await streamFollow(nextParams);
    pendingCalls = followRes.nextToolCalls;
    if (followRes.responseId) currentResponseId = followRes.responseId;
    followBuffer = followRes.followBuffer;

    // Track all tool results
    allToolResultMessages.push(...moreToolResults);
  }

  return {
    abortedByGuard,
    guardReason,
    followBuffer,
    toolResultMessages: allToolResultMessages,
    initialFollowStreamed,
  };
}

/**
 * Check if a tool result content string represents an error
 */
function isErrorResult(content: string | unknown[] | undefined): boolean {
  if (typeof content !== 'string') return false;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed) return false;
    if (parsed.error || parsed.code === 'missing_key' || parsed.code === 'missing_api_key')
      return true;
    // batch_tools: all sub-tasks failed — no successful results to work with
    if (
      parsed.type === 'batch_tools' &&
      Array.isArray(parsed.results) &&
      parsed.results.length > 0 &&
      (parsed.results as Record<string, unknown>[]).every((r) => r && !r.ok)
    )
      return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Separate tool calls into live (can execute) and synthetic (blocked retries).
 * Tools that already failed get a "do not retry" result instead of re-executing.
 */
function interceptFailedRetries(
  pendingCalls: StreamChunk[],
  failedToolNames: Set<string>,
  provider: string,
  res: Response
): {
  live: StreamChunk[];
  synthetic: { toolUseMessages: ToolUseMessage[]; toolResultMessages: ToolResultMessage[] };
} {
  const live: StreamChunk[] = [];
  const syntheticUse: ToolUseMessage[] = [];
  const syntheticResult: ToolResultMessage[] = [];

  for (const call of pendingCalls) {
    const name = call.name || '';
    const toolUseId =
      call.id || call.call_id || call.tool_call_id || call.tool_use_id || call.toolUseId;

    if (name && failedToolNames.has(name) && toolUseId) {
      logger.info('tool_retry_blocked', { tool: name, callId: toolUseId });
      emitToolProgress(res, 'completed', toolUseId, name);

      syntheticUse.push({
        role: 'assistant',
        content: [{ type: 'tool_use', id: toolUseId, name, input: {} }],
      });
      syntheticResult.push({
        role: 'tool',
        tool_use_id: toolUseId,
        call_id: toolUseId,
        name,
        content: JSON.stringify({
          error: `${name} failed earlier in this request. Do not retry — present the results you already have.`,
        }),
        only_output: true,
      });
    } else {
      live.push(call);
    }
  }

  return {
    live,
    synthetic: { toolUseMessages: syntheticUse, toolResultMessages: syntheticResult },
  };
}

/**
 * Generate synthetic summary when tool chaining is aborted by guard
 */
export function generateGuardAbortedSummary(
  toolResultMessages: ToolResultMessage[],
  guardReason: string
): string {
  const summary = summariseToolOutputs(
    toolResultMessages as unknown as Array<{
      name?: string;
      content?: string | Record<string, unknown>;
    }>
  );
  const reasonText = guardReason === 'timeout' ? 'time limit' : 'iteration limit';
  const footer = `_Tool execution interrupted (${reasonText} reached)._`;
  return summary && summary.trim() ? `${summary}\n\n${footer}` : footer;
}

/**
 * Generate synthetic summary when no follow buffer
 */
export function generateNoFollowSummary(
  toolResultMessages: ToolResultMessage[],
  toolCallCount: number
): string {
  let synthetic = summariseToolOutputs(
    toolResultMessages as unknown as Array<{
      name?: string;
      content?: string | Record<string, unknown>;
    }>
  );
  if (!synthetic || !synthetic.trim()) {
    synthetic =
      toolCallCount > 1
        ? 'Completed requested tool actions (no model text returned).'
        : 'Tool action completed (no model text returned).';
  }
  return synthetic;
}
