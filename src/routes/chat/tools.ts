/**
 * Tool management for chat route
 * - Tool metadata loading and sanitization
 * - YouTube budget wrapper
 * - Batch tools wrapper
 */

import type { Request } from 'express';
import type { CustomSession, ToolMetadata } from './types';
import logger from '../../utils/logger.js';

/** Tool loader context */
interface ToolLoaderContext {
  session: Record<string, unknown>;
  apiKeys: { gemini?: string };
  provider: string;
}

/** Tool metadata loader function */
type ToolMetadataLoader = (context: ToolLoaderContext) => ToolMetadata[];

/** YouTube budget tracker */
interface YouTubeBudget {
  maxCalls: number;
  calls: number;
  cache: Map<string, Promise<unknown>>;
}

/** Tool execution function */
interface ToolExecutor {
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Tool map type */
type ToolMap = Record<string, ToolExecutor>;

/** YouTube search arguments */
interface YouTubeSearchArgs {
  query?: string;
  queries?: string[];
  limit?: number;
  perQuery?: number;
}

/** Batch tools arguments */
interface BatchToolsArgs {
  tasks?: BatchTask[];
  concurrency?: number;
}

/** Batch task */
interface BatchTask {
  name?: string;
  arguments?: Record<string, unknown>;
}

/** Batch result */
interface BatchResult {
  index: number;
  name: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Load tool metadata with optional overrides
 */
function loadToolMetadata(
  req: Request,
  geminiKeyFromBody: string | undefined,
  providerKey: string,
  getToolMetadataOverride: ToolMetadataLoader | undefined,
  getToolMetadata: ToolMetadataLoader
): ToolMetadata[] {
  try {
    const loader =
      typeof getToolMetadataOverride === 'function' ? getToolMetadataOverride : getToolMetadata;
    const session = req.session as CustomSession | undefined;
    return loader({
      session: session as unknown as Record<string, unknown>,
      apiKeys: { gemini: geminiKeyFromBody },
      provider: providerKey,
    });
  } catch (err) {
    logger.warn('tool_metadata_load_failed', { error: (err as Error).message });
    return [];
  }
}

/**
 * Sanitize tool metadata to avoid provider-side 400s
 */
function sanitizeToolMetadata(tools: unknown[]): ToolMetadata[] {
  if (!Array.isArray(tools)) return [];

  return tools
    .filter((t): t is ToolMetadata => t != null && typeof t === 'object')
    .map((t) => {
      // Anthropic native web search tool — pass through unchanged
      if (t.type === 'web_search_20250305') {
        return { type: t.type, name: t.name };
      }
      // Legacy OpenAI web search preview — pass through (will be filtered downstream)
      if (t.type === 'web_search_preview') {
        return { type: t.type };
      }
      return {
        name: String(t.name || '').trim(),
        description:
          typeof t.description === 'string' && t.description.trim()
            ? t.description.trim()
            : undefined,
        parameters:
          t.parameters && typeof t.parameters === 'object'
            ? t.parameters
            : { type: 'object', properties: {} },
        strict: typeof t.strict === 'boolean' ? t.strict : undefined,
      };
    })
    .filter((t) => t.type === 'web_search_20250305' || t.type === 'web_search_preview' || t.name);
}

/**
 * Configure tools based on provider and search mode
 */
function configureProviderTools(
  providerTools: ToolMetadata[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provider: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadToolMetadataFn: () => ToolMetadata[]
): ToolMetadata[] {
  // Filter out web_search_preview (no longer supported)
  return providerTools.filter(
    (t) => t && t.type !== 'web_search_preview' && t.name !== 'web_search_preview'
  );
}

/**
 * Create YouTube budget tracker for rate limiting.
 * Defaults are conservative to avoid hitting API quotas:
 * - YT_MAX_TOOL_CALLS_PER_REQUEST: max tool invocations per chat request (default: 2)
 * - YT_MAX_QUERIES_PER_CALL: max queries in a single multi-query call (default: 3)
 */
function createYouTubeBudget(): YouTubeBudget {
  return {
    maxCalls: Math.max(
      1,
      Math.min(parseInt(process.env.YT_MAX_TOOL_CALLS_PER_REQUEST || '2', 10), 10)
    ),
    calls: 0,
    cache: new Map(),
  };
}

/**
 * Wrap YouTube search tool with budget enforcement
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function wrapYouTubeSearch(toolMap: ToolMap, ytBudget: YouTubeBudget, provider: string): void {
  if (!toolMap['youtube_search'] || typeof toolMap['youtube_search'].execute !== 'function') {
    return;
  }

  const originalExec = toolMap['youtube_search'].execute;
  const QCAP = Math.max(1, Math.min(parseInt(process.env.YT_MAX_QUERIES_PER_CALL || '3', 10), 12));
  const fallbackTool = null;
  const norm = (s: unknown): string =>
    String(s || '')
      .toLowerCase()
      .trim();

  toolMap['youtube_search'].execute = async (args: Record<string, unknown>) => {
    const ytArgs = args as YouTubeSearchArgs;
    let signature: string;
    let willConsume = 1;

    try {
      if (ytArgs && Array.isArray(ytArgs.queries)) {
        const qs = Array.from(new Set(ytArgs.queries.map(norm)))
          .filter(Boolean)
          .sort();
        willConsume = Math.min(qs.length, QCAP);
        signature = JSON.stringify({
          qs,
          limit: ytArgs.limit || 0,
          perQuery: ytArgs.perQuery || 0,
        });
      } else {
        signature = JSON.stringify({
          q: norm(ytArgs && ytArgs.query),
          limit: ytArgs && ytArgs.limit,
          perQuery: ytArgs && ytArgs.perQuery,
        });
        willConsume = 1;
      }
    } catch (_) {
      signature = JSON.stringify(args || {});
    }

    if (ytBudget.cache.has(signature)) {
      return await ytBudget.cache.get(signature);
    }

    const remaining = ytBudget.maxCalls - ytBudget.calls;
    if (remaining <= 0) {
      const qlist =
        ytArgs && Array.isArray(ytArgs.queries)
          ? Array.from(new Set(ytArgs.queries.map(norm))).filter(Boolean)
          : [norm(ytArgs && ytArgs.query)].filter(Boolean);
      const suggested = qlist.map((q) => `site:youtube.com ${q}`);
      return fallbackTool
        ? {
            videos: [],
            error: 'YouTube search budget exceeded for this request.',
            fallback: { name: fallbackTool, queries: suggested },
            note: `Use ${fallbackTool} with the same queries and 'site:youtube.com'.`,
          }
        : {
            videos: [],
            error: 'YouTube search budget exceeded for this request.',
          };
    }

    let adjustedArgs: YouTubeSearchArgs = ytArgs;
    if (ytArgs && Array.isArray(ytArgs.queries)) {
      const deduped = Array.from(new Set(ytArgs.queries.map(norm))).filter(Boolean);
      const trimmed = deduped.slice(0, Math.min(QCAP, remaining));
      adjustedArgs = { ...ytArgs, queries: trimmed };
      willConsume = trimmed.length;
      if (willConsume <= 0) {
        const suggested = deduped.map((q) => `site:youtube.com ${q}`);
        return fallbackTool
          ? {
              videos: [],
              note: 'Queries trimmed to zero due to budget',
              fallback: { name: fallbackTool, queries: suggested },
            }
          : { videos: [], note: 'Queries trimmed to zero due to budget' };
      }
    } else {
      willConsume = 1;
    }

    ytBudget.calls += willConsume;
    const p = Promise.resolve(originalExec(adjustedArgs as Record<string, unknown>));
    ytBudget.cache.set(signature, p);

    try {
      return await p;
    } catch (e) {
      ytBudget.cache.delete(signature);
      const msg = ((e as Error) && ((e as Error).message || String(e))) || '';
      const lower = msg.toLowerCase();
      const quotaish = /quota|daily.*limit|rate.*limit|403/.test(lower);
      if (quotaish) {
        const qlist =
          ytArgs && Array.isArray(ytArgs.queries)
            ? Array.from(new Set(ytArgs.queries.map(norm))).filter(Boolean)
            : [norm(ytArgs && ytArgs.query)].filter(Boolean);
        const suggested = qlist.map((q) => `site:youtube.com ${q}`);
        return fallbackTool
          ? {
              videos: [],
              error: 'YouTube API quota or rate limit reached.',
              fallback: { name: fallbackTool, queries: suggested },
              note: `Use ${fallbackTool} with the same queries and 'site:youtube.com'.`,
            }
          : {
              videos: [],
              error: 'YouTube API quota or rate limit reached.',
            };
      }
      throw e;
    }
  };
}

/**
 * Wrap batch_tools with YouTube budget enforcement
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function wrapBatchTools(toolMap: ToolMap, ytBudget: YouTubeBudget, provider: string): void {
  if (!toolMap['batch_tools'] || typeof toolMap['batch_tools'].execute !== 'function') {
    return;
  }

  const norm = (s: unknown): string =>
    String(s || '')
      .toLowerCase()
      .trim();
  const QCAP = Math.max(1, Math.min(parseInt(process.env.YT_MAX_QUERIES_PER_CALL || '3', 10), 12));

  toolMap['batch_tools'].execute = async (args: Record<string, unknown>) => {
    const batchArgs = args as BatchToolsArgs;
    const { tasks = [], concurrency = 4 } = batchArgs;
    try {
      if (!Array.isArray(tasks) || tasks.length === 0) return { results: [] };

      const results: BatchResult[] = new Array(tasks.length);
      let i = 0;
      const MAX = Math.max(1, Math.min(16, Number(concurrency) || 4));

      async function worker(): Promise<void> {
        while (i < tasks.length) {
          const idx = i++;
          const task = tasks[idx] || {};
          const name = String(task.name || '').trim();
          let taskArgs = (task && task.arguments) || {};

          try {
            if (!name || !toolMap[name] || typeof toolMap[name].execute !== 'function') {
              results[idx] = { index: idx, name, error: 'unknown tool' };
              continue;
            }

            if (name === 'youtube_search') {
              const ytTaskArgs = taskArgs as YouTubeSearchArgs;
              const remaining = ytBudget.maxCalls - ytBudget.calls;
              if (remaining <= 0) {
                const fallbackTool2 = null;
                const qlist2 =
                  ytTaskArgs && Array.isArray(ytTaskArgs.queries)
                    ? Array.from(new Set(ytTaskArgs.queries.map(norm))).filter(Boolean)
                    : [norm(ytTaskArgs && ytTaskArgs.query)].filter(Boolean);
                const suggested2 = qlist2.map((q) => `site:youtube.com ${q}`);
                results[idx] = {
                  index: idx,
                  name,
                  result: fallbackTool2
                    ? {
                        videos: [],
                        error: 'YouTube search budget exceeded',
                        fallback: { name: fallbackTool2, queries: suggested2 },
                      }
                    : { videos: [], error: 'YouTube search budget exceeded' },
                };
                continue;
              }

              if (ytTaskArgs && Array.isArray(ytTaskArgs.queries)) {
                const deduped = Array.from(new Set(ytTaskArgs.queries.map(norm))).filter(Boolean);
                const trimmed = deduped.slice(0, Math.min(QCAP, remaining));
                if (trimmed.length <= 0) {
                  const fallbackTool2 = null;
                  const suggested2 = deduped.map((q) => `site:youtube.com ${q}`);
                  results[idx] = {
                    index: idx,
                    name,
                    result: fallbackTool2
                      ? {
                          videos: [],
                          note: 'Queries trimmed to zero due to budget',
                          fallback: { name: fallbackTool2, queries: suggested2 },
                        }
                      : { videos: [], note: 'Queries trimmed to zero due to budget' },
                  };
                  continue;
                }
                taskArgs = { ...ytTaskArgs, queries: trimmed };
                ytBudget.calls += trimmed.length;
              } else {
                ytBudget.calls += 1;
              }
            }

            const out = await Promise.resolve(
              toolMap[name].execute(taskArgs as Record<string, unknown>)
            );
            results[idx] = { index: idx, name, ok: true, result: out };
          } catch (e) {
            const msg = ((e as Error) && ((e as Error).message || String(e))) || 'task failed';
            results[idx] = { index: idx, name, error: msg };
          }
        }
      }

      const workers = new Array(Math.min(MAX, tasks.length)).fill(0).map(worker);
      await Promise.all(workers);
      return { results };
    } catch (e) {
      const msg = ((e as Error) && ((e as Error).message || String(e))) || 'batch failed';
      return { error: msg };
    }
  };
}

/**
 * Generate Anthropic tool hint for better tool usage
 */
function generateAnthropicToolHint(providerTools: ToolMetadata[]): string {
  const toolNames = providerTools
    .filter((t) => t.type !== 'web_search_20250305')
    .map((t) => t.name)
    .join(', ');
  let hint =
    `You have access to the following function tools: ${toolNames}. ` +
    `When the user requests an action that can be fulfilled by one of these tools, ` +
    `respond with a tool_use specifying the full JSON argument object without additional conversation. ` +
    'For example, when asked to create a playlist you should call create_playlist with appropriate arguments such as {\n  "artist": "Miles Davis",\n  "limit": 10\n}.\n' +
    'You also have native web search available. Use it when you need to verify facts, find current information, or look up URLs.';

  if (providerTools.some((t) => t && t.name === 'batch_tools')) {
    hint +=
      '\nYou can issue multiple tool_use blocks in a single response for parallel execution. Only use "batch_tools" if you need to coordinate results from many tools at once (5+).';
  }

  const hasYouTube = providerTools.some((t) => t && t.name === 'youtube_search');
  if (hasYouTube) {
    hint += `\nWhen assembling lists (e.g., playlists or film programs), prefer a SINGLE "youtube_search" call with a "queries" array of 6–12 distinct queries and a small "perQuery" (e.g., 2 or 3). Do NOT emit many sequential tool_use calls.`;
    hint += `\nCRITICAL: When user asks for video clips/scenes, ALWAYS use URLs from youtube_search results (format: https://www.youtube.com/watch?v=VIDEO_ID). Web search video links are fallback only when youtube_search returns empty.`;
    hint += `\nIf "youtube_search" returns a budget/quota error or the budget is reached, surface fewer items or inform the user.`;
  }

  hint +=
    '\nWhen the user asks for "more" or "add some" after tool results, you MUST call the relevant tool again. Never generate URLs from memory.';

  return hint;
}

/**
 * Generate OpenRouter tool hint for better tool usage
 */
function generateOpenRouterToolHint(providerTools: ToolMetadata[]): string {
  const toolNames = providerTools
    .map((t) => t.name)
    .filter(Boolean)
    .join(', ');
  let hint =
    `You have access to these tools: ${toolNames}. ` +
    `IMPORTANT: Make ONE tool call, then WAIT for the results and respond to the user. ` +
    `Do NOT make multiple sequential tool calls - gather what you need in a single call.`;

  if (providerTools.some((t) => t && t.name === 'batch_tools')) {
    hint += `\nIf you need multiple operations, use "batch_tools" with a "tasks" array containing all operations.`;
  }

  const hasYouTube = providerTools.some((t) => t && t.name === 'youtube_search');
  if (hasYouTube) {
    hint += `\nFor youtube_search: use the "queries" array parameter with multiple search terms in ONE call (e.g., queries: ["term1", "term2", "term3"]). Do NOT call youtube_search multiple times.`;
    hint += `\nCRITICAL: When user asks for video clips/scenes, ALWAYS use URLs from youtube_search results (format: https://www.youtube.com/watch?v=VIDEO_ID). Web search video links are fallback only when youtube_search returns empty.`;
    hint += `\nIf youtube_search returns empty results or an error, do NOT retry. Simply inform the user that the search didn't find results and offer alternatives.`;
  }

  hint +=
    '\nWhen the user asks for "more" or "add some" after tool results, you MUST call the relevant tool again. Never generate URLs from memory.';
  hint += `\nAfter receiving tool results, respond directly to the user with the information. Do not make additional tool calls unless absolutely necessary.`;

  return hint;
}

export {
  loadToolMetadata,
  sanitizeToolMetadata,
  configureProviderTools,
  createYouTubeBudget,
  wrapYouTubeSearch,
  wrapBatchTools,
  generateAnthropicToolHint,
  generateOpenRouterToolHint,
};
