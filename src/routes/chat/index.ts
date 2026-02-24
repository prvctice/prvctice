/**
 * Chat Route - Main orchestration
 * Refactored from monolithic chat.js into modular structure
 */

import type { Request, Response, Router as ExpressRouter } from 'express';
import type { PromptContext, PromptResult } from '../../utils/systemPrompt.js';
import type { CustomSession, ChatMessage, StreamChunk, ToolMetadata, ToolInstance } from './types';
import express from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../../utils/logger.js';
import validate from '../../middleware/validate.js';
import chatBodySchema from '../../schemas/chatSchema.js';
import { createAdapter } from '../../services/llmProviderFactory.js';
import { getSystemPrompt } from '../../utils/systemPrompt.js';
import { getToolMetadata, createTools } from '../../tools/index.js';
import type { ChatHistoryMessage } from '../../utils/mcpHistory.js';
import {
  normaliseProviderName,
  getHistoryForProvider,
  appendHistoryForProvider,
  trimHistoryForProvider,
} from '../../utils/mcpHistory.js';
import { supportsStreaming, supportsTools } from '../../utils/capabilities.js';
import {
  resolveApiKey,
  getLmStudioOptions,
  applyFreeTierFallback,
  overrideModelForVision,
  prepareMessages,
  embedImagesInMessages,
  setVerifyNudgeHeaders,
  getEffectiveReasoning,
} from './validation.js';
import {
  loadToolMetadata,
  sanitizeToolMetadata,
  configureProviderTools,
  createYouTubeBudget,
  wrapYouTubeSearch,
  wrapBatchTools,
  generateAnthropicToolHint,
  generateOpenRouterToolHint,
} from './tools.js';
import { createSyntheticDeltaWriter, emitToolProgress } from './streaming.js';
import { messageNeedsTools, messageNeedsToolForce, detectFollowUp } from './helpers.js';
import { executeToolCalls } from './toolExecution.js';
import {
  handleToolChaining,
  generateGuardAbortedSummary,
  generateNoFollowSummary,
} from './toolChaining.js';
import { normaliseError, ProviderError } from '../../utils/errors.js';
import { ConversationUrlTracker, extractUrlsFromText } from '../../services/urlValidator.js';
import { UrlStreamAccumulator } from './urlStreamAccumulator.js';

/** Reasoning config for extended thinking */
interface ReasoningConfig {
  effort?: string;
}

/** Stream chat parameters */
interface StreamChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolMetadata[];
  stream?: boolean;
  reasoning?: ReasoningConfig;
  systemPrompt?: string;
  tool_choice?: { type: string } | string | null;
}

/** Adapter interface (local: uses StreamChatParams for type safety) */
interface StreamAdapter {
  streamChat: (params: StreamChatParams) => AsyncIterable<StreamChunk>;
}

const router: ExpressRouter = express.Router();

const providerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', providerLimiter, validate(chatBodySchema), async (req: Request, res: Response) => {
  logger.debug('chat_endpoint_called', { timestamp: new Date().toISOString() });

  const {
    provider = 'anthropic',
    apiKey,
    discogsToken,
    youtubeApiKey,
    model: incomingModel,
    messages,
    images,
    tools = [],
    stream = true,
    includeSystem = true,
    skipHistory = false,
    reasoning,
    trialMessagesRemaining,
    usageHistory,
  } = req.body || {};

  let model = incomingModel;

  // Capability validation (using top-level imports)
  if (stream && !supportsStreaming(provider)) {
    return res.status(400).json({ error: `${provider} does not support streaming responses` });
  }

  if (Array.isArray(tools) && tools.length > 0 && !supportsTools(provider)) {
    return res.status(400).json({ error: `${provider} does not support function tools` });
  }

  if (process.env.DEBUG_MCP === '1') {
    logger.debug('chat_request', { provider, model });
  }

  // Session check
  if (!req.session) {
    return res
      .status(400)
      .json({ error: 'Session unavailable. Please reload the app to establish a session.' });
  }

  // Setup
  const providerKey = normaliseProviderName(provider);
  const historySlice = skipHistory
    ? []
    : (getHistoryForProvider(req.session, providerKey).slice(-20) as ChatMessage[]);
  const hasEmbeddedImages =
    Array.isArray(messages) &&
    messages.some(
      (m) =>
        Array.isArray(m?.content) &&
        m.content.some((p: { type?: string }) => p?.type === 'image_url')
    );
  const hasImages = (Array.isArray(images) && images.length > 0) || hasEmbeddedImages;

  // Override model for vision if needed
  model = overrideModelForVision(model, providerKey, hasImages, res);

  if (!model) {
    return res.status(400).json({ error: 'model is required' });
  }
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  // Trial message validation — only applies when user has no own API key
  // Users with their own API key (apiKey present) skip trial validation entirely
  const provLCForTrial = (provider || '').toLowerCase();
  const hasOwnKey = typeof apiKey === 'string' && apiKey.trim().length > 0;
  if (!hasOwnKey && provLCForTrial !== 'lmstudio') {
    const remaining = typeof trialMessagesRemaining === 'number' ? trialMessagesRemaining : -1; // missing = invalid
    if (remaining <= 0 || remaining > 15) {
      // Return 403 with a specific error code so client can distinguish from generic errors
      return res.status(403).json({
        error: 'trial_limit_reached',
        message: 'Trial message limit reached. Add your own API key to continue.',
      });
    }
  }

  // Derive boolean trialActive from trialMessagesRemaining for downstream functions
  const trialActive = typeof trialMessagesRemaining === 'number' && trialMessagesRemaining > 0;

  // Extract last user message text for intent classification
  const lastUserMessage = [...(messages as ChatMessage[])].reverse().find((m) => m.role === 'user');
  const userText: string = (() => {
    if (!lastUserMessage) return '';
    if (typeof lastUserMessage.content === 'string') return lastUserMessage.content;
    if (Array.isArray(lastUserMessage.content)) {
      const textPart = lastUserMessage.content.find((p) => p.type === 'text' && p.text);
      return textPart?.text ?? '';
    }
    return '';
  })();

  // Prepare messages — use dynamic composition when system prompt is included
  let systemPrompt: string | null = null;
  let skillsLoaded: string[] = [];
  let skillsCondensed: string[] = [];

  if (includeSystem && userText) {
    const promptContext: PromptContext = {
      provider: providerKey,
      userText,
      agentContext: undefined,
      pinnedSkills: [],
      usageHistory: Array.isArray(usageHistory) ? usageHistory : undefined,
      debug: process.env.DEBUG_SKILLS === '1',
    };
    const promptResult = getSystemPrompt(promptContext) as PromptResult;
    systemPrompt = promptResult.prompt;
    skillsLoaded = promptResult.loadedSkills;
    skillsCondensed = promptResult.condensedSkills;
  } else if (includeSystem) {
    systemPrompt = getSystemPrompt() as string;
  }

  let finalMessages: ChatMessage[] = prepareMessages(
    messages,
    historySlice,
    systemPrompt,
    includeSystem,
    provider
  );
  finalMessages = embedImagesInMessages(finalMessages, images);

  // Create adapter
  const factoryFn = req.app.get('createAdapterOverride') || createAdapter;
  const createToolsOverride = req.app.get('createToolsOverride');
  const getToolMetadataOverride = req.app.get('getToolMetadataOverride');

  const geminiKeyFromBody =
    typeof req.body.geminiApiKey === 'string' && req.body.geminiApiKey.trim()
      ? req.body.geminiApiKey.trim()
      : undefined;

  const session = req.session as CustomSession | undefined;
  const restrictedToolNames = new Set<string>();

  const loadToolMetadataFn = (): ToolMetadata[] =>
    loadToolMetadata(
      req,
      geminiKeyFromBody,
      providerKey,
      getToolMetadataOverride,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getToolMetadata as any
    );

  let adapter: StreamAdapter;
  let adapterOptions: Record<string, unknown> = {};

  try {
    const provLC = (provider || '').toLowerCase();

    if (provLC === 'lmstudio') {
      adapterOptions = getLmStudioOptions(req) as unknown as Record<string, unknown>;
    }

    let effectiveKey = resolveApiKey(provider, req, apiKey, trialActive);
    const freeTierResult = applyFreeTierFallback(effectiveKey, provider, trialActive);
    effectiveKey = freeTierResult.key;

    if (
      provLC !== 'lmstudio' &&
      (!effectiveKey || typeof effectiveKey !== 'string' || effectiveKey.trim() === '')
    ) {
      return res.status(400).json({ error: 'apiKey is required' });
    }

    adapter = factoryFn(provider, effectiveKey, adapterOptions);
  } catch (err) {
    logger.error('adapter_creation_failed', { error: (err as Error).message });
    return res.status(400).json({ error: (err as Error).message });
  }

  // Load and configure tools
  let providerTools: ToolMetadata[] = [];
  const shouldLoadTools = messageNeedsTools(finalMessages);
  if (Array.isArray(tools) && tools.length > 0) {
    providerTools = tools;
  } else if (
    shouldLoadTools &&
    ['anthropic', 'gemini', 'openrouter', 'lmstudio'].includes(providerKey)
  ) {
    providerTools = loadToolMetadataFn();
  }
  if (!shouldLoadTools) {
    logger.debug('tools_skipped', { reason: 'conversational_message' });
  }

  // Ensure essential tools are loaded
  if (shouldLoadTools) {
    try {
      const registry = loadToolMetadataFn();
      const have = new Set(
        (providerTools || []).map((t) => (t && (t.name || t.type)) || '').filter(Boolean)
      );
      for (const needed of ['batch_tools', 'wikipedia_search']) {
        if (!have.has(needed)) {
          const meta = (registry || []).find((r) => r && r.name === needed);
          if (meta) providerTools.push(meta);
        }
      }
    } catch (registryErr) {
      logger.debug('tool_registry_load_failed', { error: (registryErr as Error).message });
    }
  }

  providerTools = sanitizeToolMetadata(providerTools);

  // Remove function tools named 'web_search_preview'
  if (Array.isArray(providerTools) && providerTools.length) {
    providerTools = providerTools.filter((t) => !(t && t.name === 'web_search_preview'));
  }

  providerTools = configureProviderTools(providerTools, provider, loadToolMetadataFn);

  if (restrictedToolNames.size && Array.isArray(providerTools) && providerTools.length) {
    providerTools = providerTools.filter((t) => !(t && restrictedToolNames.has(t.name || '')));
  }

  // Detect follow-up requests that need tool re-invocation
  let toolChoiceOverride: { type: string } | string | null | undefined;
  if (providerTools.length > 0) {
    const { needsToolReInvocation } = detectFollowUp(finalMessages);
    const forceTools = needsToolReInvocation || messageNeedsToolForce(finalMessages);
    if (forceTools) {
      const provLC = (provider || '').toLowerCase();
      if (provLC === 'anthropic') {
        toolChoiceOverride = { type: 'any' };
      } else if (provLC === 'openrouter') {
        toolChoiceOverride = 'required';
      }
      // Gemini and LM Studio: rely on system prompt (tool_choice unreliable)
      logger.debug('tool_force_detected', {
        provider: provLC,
        toolChoiceOverride,
        followUp: needsToolReInvocation,
        recommendation: !needsToolReInvocation,
      });
    }
  }

  // Add provider-specific tool hints
  if (provider === 'anthropic' && providerTools.length > 0) {
    const hint = generateAnthropicToolHint(providerTools);
    finalMessages.unshift({ role: 'system', content: hint });
  }

  if (provider.toLowerCase() === 'openrouter' && providerTools.length > 0) {
    const hint = generateOpenRouterToolHint(providerTools);
    finalMessages.unshift({ role: 'system', content: hint });
  }

  // URL validation tracker — seeded from conversation history
  const urlTracker = new ConversationUrlTracker(finalMessages);

  // Non-streaming path
  if (!stream) {
    try {
      const effectiveReasoning = getEffectiveReasoning(reasoning, provider);

      const params: StreamChatParams = {
        model,
        messages: finalMessages,
        tools: providerTools,
        stream: true,
        reasoning: effectiveReasoning || undefined,
        systemPrompt:
          systemPrompt && (provider === 'gemini' || provider === 'google')
            ? systemPrompt
            : undefined,
        tool_choice: toolChoiceOverride || undefined,
      };

      let assistantText = '';
      const chunkTypes: string[] = [];
      for await (const chunk of adapter.streamChat(params)) {
        chunkTypes.push(chunk.type);
        if (chunk.type === 'delta' && chunk.content) assistantText += chunk.content;
        if (chunk.type === 'web_search_urls' && Array.isArray(chunk.urls)) {
          urlTracker.addWebSearchUrls(chunk.urls);
        }
        if (chunk.type === 'web_search_error') {
          logger.warn('web_search_error_in_nonstream', { chunk: JSON.stringify(chunk) });
        }
      }

      // Validate URLs in non-streaming response
      const foundUrls = extractUrlsFromText(assistantText);
      for (const url of foundUrls) {
        if (urlTracker.isUrlValid(url) === 'unknown') {
          // Check for markdown link containing this URL
          const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const mdRegex = new RegExp(`\\[([^\\]]*)\\]\\(${escaped}\\)`, 'g');
          const hasMdLink = mdRegex.test(assistantText);
          if (hasMdLink) {
            // Reset lastIndex for replacement
            mdRegex.lastIndex = 0;
            assistantText = assistantText.replace(
              mdRegex,
              (_match, linkText) => `${linkText} _(link removed: unverified source)_`
            );
          } else {
            assistantText = assistantText.replace(
              new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              '[link removed: unverified source]'
            );
          }
        }
      }

      logger.info('nonstream_complete', {
        provider: providerKey,
        chunkTypes: chunkTypes.join(','),
        textLength: assistantText.length,
      });
      return res.json({ ok: true, text: assistantText });
    } catch (err) {
      const msg = ((err as Error) && ((err as Error).message || String(err))) || 'chat error';
      return res.status(500).json({ ok: false, error: msg });
    }
  }

  // Streaming path
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');

  setVerifyNudgeHeaders(res, provider, messages);

  // Emit skills_loaded metadata chunk before streaming starts
  if (skillsLoaded.length > 0) {
    try {
      res.write(
        JSON.stringify({
          type: 'skills_loaded',
          skills: skillsLoaded,
          condensed: skillsCondensed,
        }) + '\n'
      );
    } catch (_) {
      // Non-critical: skill metadata is informational
    }
  }

  try {
    const userOnly = (messages as ChatMessage[]).filter((m) => m.role === 'user');
    appendHistoryForProvider(req.session, providerKey, userOnly as unknown as ChatHistoryMessage[]);

    let assistantBuffer = '';
    let initialResponseId: string | null = null;
    const toolCallChunks: StreamChunk[] = [];
    const executedCallIds = new Set<string>();
    const chainStart = Date.now();

    const effectiveReasoning = getEffectiveReasoning(reasoning, provider);

    const streamParams: StreamChatParams = {
      model,
      messages: finalMessages,
      tools: providerTools,
      stream,
      reasoning: effectiveReasoning || undefined,
      systemPrompt:
        systemPrompt && (provider === 'gemini' || provider === 'google') ? systemPrompt : undefined,
      tool_choice: toolChoiceOverride || undefined,
    };

    try {
      const eff = (effectiveReasoning && effectiveReasoning.effort) || '-';
      logger.debug('chat_config', { reasoning: eff });
    } catch (_) {}

    // URL stream accumulator for validating URLs in streaming output
    const urlAccumulator = new UrlStreamAccumulator(urlTracker);

    // Initial stream pass
    let sawToolCall = false;
    for await (const chunk of adapter.streamChat(streamParams)) {
      if (process.env.DEBUG_MCP === '1' || provider.toLowerCase() === 'anthropic') {
        logger.debug('stream_initial', { chunk: JSON.stringify(chunk) });
      }

      // Consume web_search_urls internally (do not forward to client)
      if (chunk.type === 'web_search_urls' && Array.isArray(chunk.urls)) {
        urlTracker.addWebSearchUrls(chunk.urls);
        continue;
      }

      if (chunk.type === 'tool_call') {
        sawToolCall = true;
        const toolId =
          chunk.id || chunk.call_id || chunk.tool_call_id || chunk.tool_use_id || chunk.toolUseId;
        logger.debug('initial_stream_tool_call', { name: chunk.name, id: toolId });
        if (toolId) {
          emitToolProgress(res, 'started', toolId, chunk.name);
        }
        try {
          res.write(`${JSON.stringify(chunk)}\n`);
        } catch (_) {}
      } else if (chunk.type === 'done' && sawToolCall) {
        logger.debug('suppressing_done_saw_tool_call');
      } else if (chunk.type === 'delta' && chunk.content) {
        // Filter delta content through URL accumulator
        logger.debug('initial_stream_delta', { length: chunk.content?.length || 0 });
        const segments = urlAccumulator.push(chunk.content);
        for (const segment of segments) {
          if (segment) {
            res.write(`${JSON.stringify({ type: 'delta', content: segment })}\n`);
          }
        }
      } else {
        res.write(`${JSON.stringify(chunk)}\n`);
      }

      if (chunk.type === 'delta' && chunk.content) {
        assistantBuffer += chunk.content;
      }

      if (chunk.type === 'response_id') {
        initialResponseId = chunk.id || null;
      }

      if (chunk.type === 'tool_call') {
        assistantBuffer = assistantBuffer.replace(/\[tool_call[^\n]*$/m, '').trimEnd();
        toolCallChunks.push(chunk);
      }

      if (chunk.type === 'done') {
        // Flush any remaining buffered URL content
        const flushed = urlAccumulator.flush();
        for (const segment of flushed) {
          if (segment) {
            res.write(`${JSON.stringify({ type: 'delta', content: segment })}\n`);
          }
        }
        break;
      }
    }

    // Tool execution
    if (toolCallChunks.length > 0) {
      if (process.env.DEBUG_MCP === '1') {
        logger.debug('initial_tool_calls', {
          ids: toolCallChunks.map((c) => c && (c.id || c.call_id || c.tool_call_id)),
        });
      }

      // Create tool instances
      const toolMap = createToolInstances(
        req,
        session,
        createToolsOverride,
        geminiKeyFromBody,
        discogsToken,
        youtubeApiKey,
        providerKey,
        trialActive
      );

      // Apply YouTube budget wrapper
      const ytBudget = createYouTubeBudget();
      wrapYouTubeSearch(toolMap, ytBudget, provider);
      wrapBatchTools(toolMap, ytBudget, provider);

      // Execute initial tool calls
      const { toolUseMessages, toolResultMessages } = await executeToolCalls(
        toolMap,
        toolCallChunks,
        { provider, res, executedCallIds, urlTracker }
      );

      const writeSyntheticDelta = createSyntheticDeltaWriter(res);

      // Short-circuit when all tools failed with missing API keys.
      // The LLM produces garbage follow-ups ("let me continue searching...")
      // when given missing_key errors, so we bypass chaining entirely and
      // emit a clear, actionable message instead.
      const missingKeyInfo = extractMissingKeyErrors(toolResultMessages);
      if (missingKeyInfo.allFailed) {
        logger.info('tool_missing_key_shortcircuit', {
          tools: missingKeyInfo.toolNames,
        });
        const message = formatMissingKeyMessage(missingKeyInfo.toolNames);
        writeSyntheticDelta(message);
        res.write(`${JSON.stringify({ type: 'done' })}\n`);
        appendHistoryForProvider(req.session, providerKey, [
          { role: 'assistant', content: message },
        ]);
      } else {
        try {
          logger.info('tool_follow_start', {
            provider: provider.toLowerCase(),
            toolResultCount: toolResultMessages?.length || 0,
          });

          // Handle tool chaining
          const chainingResult = await handleToolChaining({
            adapter: adapter as unknown as {
              streamChat: (params: Record<string, unknown>) => AsyncIterable<StreamChunk>;
            },
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
            urlTracker,
          });

          // Handle result based on chaining outcome
          if (chainingResult.abortedByGuard) {
            const synthetic = generateGuardAbortedSummary(
              chainingResult.toolResultMessages,
              chainingResult.guardReason
            );
            const wrote = writeSyntheticDelta(synthetic);
            res.write(`${JSON.stringify({ type: 'done' })}\n`);
            if (wrote) {
              appendHistoryForProvider(req.session, providerKey, [
                { role: 'assistant', content: synthetic },
              ]);
            }
          } else if (chainingResult.followBuffer.trim()) {
            logger.info('has_follow_buffer', { length: chainingResult.followBuffer.length });
            appendHistoryForProvider(req.session, providerKey, [
              { role: 'assistant', content: chainingResult.followBuffer },
            ]);
          } else {
            logger.info('no_follow_buffer', {
              toolResultCount: chainingResult.toolResultMessages?.length,
              generating: 'synthetic_summary',
            });
            const synthetic = generateNoFollowSummary(
              chainingResult.toolResultMessages,
              toolCallChunks.length
            );
            const wrote = writeSyntheticDelta(synthetic);
            res.write(`${JSON.stringify({ type: 'done' })}\n`);
            if (wrote) {
              appendHistoryForProvider(req.session, providerKey, [
                { role: 'assistant', content: synthetic },
              ]);
            }
          }
        } catch (e) {
          handleToolChainingError(
            e,
            provider,
            initialResponseId,
            toolResultMessages,
            toolCallChunks,
            writeSyntheticDelta,
            res,
            req.session,
            providerKey
          );
        }
      }
    } else {
      if (assistantBuffer.trim()) {
        appendHistoryForProvider(req.session, providerKey, [
          { role: 'assistant', content: assistantBuffer },
        ]);
      }
    }

    trimHistoryForProvider(req.session, providerKey, 40);
    res.end();
  } catch (err) {
    logger.error('chat_error', { error: (err as Error).message });
    const errPayload = JSON.stringify({ type: 'error', message: (err as Error).message });
    try {
      res.write(`${errPayload}\n`);
    } catch (_) {}
    res.end();
  }
});

/** Tool result message shape (minimal, for missing-key check) */
interface ToolResultContent {
  code?: string;
  do_not_fallback?: boolean;
  error?: string;
}

/**
 * Check if all tool results are missing-key / do-not-fallback errors.
 * Returns the tool names that failed so we can generate a specific message.
 */
function extractMissingKeyErrors(
  toolResultMessages: Array<{ name?: string; content?: string | unknown }>
): { allFailed: boolean; toolNames: string[] } {
  if (!toolResultMessages || toolResultMessages.length === 0) {
    return { allFailed: false, toolNames: [] };
  }

  const failedTools: string[] = [];

  for (const msg of toolResultMessages) {
    let parsed: ToolResultContent | null = null;
    try {
      const raw = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parsed = JSON.parse(raw) as ToolResultContent;
    } catch (_) {
      // Not JSON — not a missing-key error
      return { allFailed: false, toolNames: [] };
    }

    const isMissingKey =
      parsed &&
      (parsed.code === 'missing_key' ||
        parsed.code === 'missing_api_key' ||
        parsed.do_not_fallback === true);

    if (!isMissingKey) {
      return { allFailed: false, toolNames: [] };
    }

    failedTools.push(msg.name || 'Unknown tool');
  }

  return { allFailed: true, toolNames: failedTools };
}

/** Human-friendly tool name map for missing-key messages */
const TOOL_KEY_LABELS: Record<string, string> = {
  youtube_search: 'YouTube API key',
  vision_describe: 'API key for the selected provider',
};

/**
 * Generate a clear, actionable message when tools fail due to missing API keys.
 */
function formatMissingKeyMessage(toolNames: string[]): string {
  const unique = [...new Set(toolNames)];
  const parts = unique.map((name) => {
    const label = TOOL_KEY_LABELS[name];
    const pretty = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return label ? `**${pretty}** requires a ${label}` : `**${pretty}** requires an API key`;
  });

  const joined = parts.length === 1 ? parts[0] : parts.join(' and ');
  return `${joined}. Add it in **Settings → API Keys** to use this feature.`;
}

/**
 * Create tool instances with all necessary API keys
 */
function createToolInstances(
  req: Request,
  session: CustomSession | undefined,
  createToolsOverride: unknown,
  geminiKeyFromBody: string | undefined,
  discogsToken: string | undefined,
  youtubeApiKey: string | undefined,
  providerKey: string,
  trialActive: boolean
): Record<string, ToolInstance> {
  const createToolsFn =
    typeof createToolsOverride === 'function' ? createToolsOverride : createTools;

  const tmdbKey = process.env.TMDB_API_KEY || null;
  const discogsKey = discogsToken || (session?.discogsToken as string) || null;
  const youtubeKey = youtubeApiKey || (session?.youtubeApiKey as string) || null;

  if (process.env.DEBUG_MCP === '1') {
    logger.debug('moodboard_keys', { tmdb: !!tmdbKey, discogs: !!discogsKey });
  }

  const toolInstances: ToolInstance[] = createToolsFn({
    session: req.session,
    apiKeys: {
      gemini: geminiKeyFromBody,
      tmdb: tmdbKey,
      discogs: discogsKey,
      youtube: youtubeKey,
    },
    getApiKey: (name: string) => {
      if (!name) return undefined;
      const low = String(name).toLowerCase();
      if (low === 'gemini' || low === 'google') return geminiKeyFromBody;
      if (low === 'tmdb') return tmdbKey;
      if (low === 'discogs') return discogsKey;
      if (low === 'youtube') return youtubeKey;
      return undefined;
    },
    provider: providerKey,
    trialActive,
  });

  return Object.fromEntries(toolInstances.map((t) => [t.name, t]));
}

/**
 * Handle errors during tool chaining.
 * Extra params kept for call-site compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleToolChainingError(e: unknown, provider: string, ...rest: unknown[]): void {
  const perr = normaliseError(provider, e as Error);
  throw new ProviderError({
    provider: provider,
    code: perr.code || 400,
    message: `Tool chaining failed: ${perr.message || 'chaining error'}`,
  });
}

export default router;
