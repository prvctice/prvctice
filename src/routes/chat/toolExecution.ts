/**
 * Tool execution utilities for chat route
 * - Unified tool execution with timeout
 * - Concurrency pool for parallel tool calls
 * - Tool argument parsing
 */

import type { Response } from 'express';
import type { ToolInputArgs, StreamChunk, ContentPart, ToolInstance, ToolMap } from './types';
import logger from '../../utils/logger.js';
import { streamToolImages, emitToolProgress, emitToolResult } from './streaming.js';
import { summariseToolEventPayload, sanitizeToolResultForModel } from './helpers.js';
import { ProviderError } from '../../utils/errors.js';

export type { ToolInputArgs, StreamChunk, ContentPart, ToolInstance, ToolMap };

/** Tool result message */
export interface ToolResultMessage {
  role: string;
  tool_use_id?: string;
  call_id?: string;
  name?: string;
  content: string | ContentPart[];
  arguments?: string;
  only_output?: boolean;
}

/** Tool use message */
export interface ToolUseMessage {
  role: string;
  content: ContentPart[];
}

/** URL tracker interface (avoids direct import of ConversationUrlTracker) */
interface UrlTracker {
  addToolResultUrls(toolName: string, resultContent: string): void;
}

/** Tool execution options */
export interface ToolExecutionOptions {
  provider: string;
  res: Response;
  executedCallIds: Set<string>;
  timeoutMs?: number;
  urlTracker?: UrlTracker;
}

/** Tool execution result */
export interface ToolExecutionResult {
  toolUseMessages: ToolUseMessage[];
  toolResultMessages: ToolResultMessage[];
}

/**
 * Promise with timeout wrapper
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout()), ms)),
  ]);
}

/**
 * Run tasks with concurrency pool
 */
export async function runConcurrencyPool(
  tasks: Array<() => Promise<void>>,
  maxConcurrency: number
): Promise<void> {
  let i = 0;
  const workers = new Array(Math.min(maxConcurrency, tasks.length)).fill(0).map(async () => {
    while (i < tasks.length) {
      const idx = i++;
      const task = tasks[idx];
      try {
        if (task) await task();
      } catch (_) {
        /* swallow per-call errors */
      }
    }
  });
  await Promise.all(workers);
}

/**
 * Parse tool arguments from string or object
 */
export function parseToolArgs(args: unknown): ToolInputArgs {
  if (args == null) return {};
  if (typeof args === 'object' && !Array.isArray(args)) {
    return args as ToolInputArgs;
  }
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as ToolInputArgs;
      }
    } catch (parseErr) {
      logger.warn('tool_args_parse_failed', {
        error: (parseErr as Error).message,
        rawArgs: String(args).slice(0, 100),
      });
    }
  }
  return {};
}

/**
 * Extract tool use ID from stream chunk
 */
export function getToolUseId(call: StreamChunk): string | undefined {
  return call.id || call.call_id || call.tool_call_id || call.tool_use_id || call.toolUseId;
}

/**
 * Execute a single tool call
 */
async function executeSingleToolCall(
  call: StreamChunk,
  toolMap: ToolMap,
  options: ToolExecutionOptions
): Promise<{ toolUseMessage: ToolUseMessage | null; toolResultMessage: ToolResultMessage | null }> {
  const { provider, res, executedCallIds, timeoutMs = 45000 } = options;
  const args = parseToolArgs(call.arguments);
  const toolUseId = getToolUseId(call);

  if (!toolUseId) {
    throw new ProviderError({
      provider: provider || 'openai',
      code: 400,
      message: 'No tool call id found to attach output',
    });
  }

  if (executedCallIds.has(toolUseId)) {
    return { toolUseMessage: null, toolResultMessage: null };
  }
  executedCallIds.add(toolUseId);

  // Execute the tool
  let toolResult: unknown;
  const run = async () => {
    const toolName = call.name || '';
    if (toolMap[toolName] && typeof toolMap[toolName].execute === 'function') {
      return await toolMap[toolName].execute(args);
    }
    return { error: 'Unknown tool' };
  };

  try {
    toolResult = await withTimeout(run(), timeoutMs, () => ({ error: 'tool timeout' }));
  } catch (e) {
    const msg = ((e as Error) && ((e as Error).message || String(e))) || 'tool failed';
    toolResult = { error: msg };
  }

  const toolUseMessage: ToolUseMessage = {
    role: 'assistant',
    content: [{ type: 'tool_use', id: toolUseId, name: call.name, input: args }],
  };

  // Populate URL tracker with URLs from raw tool results BEFORE sanitization
  // (sanitization strips image URLs that the model might reference in its text)
  if (options.urlTracker) {
    const rawSerialized = JSON.stringify(toolResult);
    options.urlTracker.addToolResultUrls(call.name || '', rawSerialized);
  }

  const serialized = JSON.stringify(sanitizeToolResultForModel(call.name || '', toolResult));

  const toolResultMessage: ToolResultMessage = {
    role: 'tool',
    tool_use_id: toolUseId,
    call_id: toolUseId,
    name: call.name,
    content: serialized,
    arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(args),
    only_output: true,
  };

  // Emit events to client
  const eventSummary = summariseToolEventPayload(call.name, toolResult);
  emitToolResult(res, toolUseId, call.name, eventSummary);
  await streamToolImages(res, call.name || '', toolResult);
  emitToolProgress(res, 'completed', toolUseId, call.name);

  return { toolUseMessage, toolResultMessage };
}

/**
 * Execute multiple tool calls with concurrency control
 */
export async function executeToolCalls(
  toolMap: ToolMap,
  toolCallChunks: StreamChunk[],
  options: ToolExecutionOptions
): Promise<ToolExecutionResult> {
  const toolUseMessages: ToolUseMessage[] = [];
  const toolResultMessages: ToolResultMessage[] = [];
  const maxConcurrency = parseInt(process.env.TOOL_CONCURRENCY || '3', 10);

  const tasks = toolCallChunks.map((call) => async () => {
    const result = await executeSingleToolCall(call, toolMap, options);
    if (result.toolUseMessage) {
      toolUseMessages.push(result.toolUseMessage);
    }
    if (result.toolResultMessage) {
      toolResultMessages.push(result.toolResultMessage);
    }
  });

  await runConcurrencyPool(tasks, maxConcurrency);

  return { toolUseMessages, toolResultMessages };
}
