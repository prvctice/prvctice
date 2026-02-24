/**
 * Helper functions for chat route
 * - Tool result parsing and summarization
 * - Payload analysis and formatting
 */

import type { ContentPart, ChatMessage, ToolEventSummary } from './types';
import * as path from 'path';

const TOOL_SUMMARY_LIMIT = 6;

/** Video reference from tool output */
interface VideoRef {
  title: string;
  url: string;
  videoId?: string;
}

/** Link reference from tool output */
interface LinkRef {
  title: string;
  url: string;
}

/** Analyzed tool payload info */
interface ToolPayloadInfo {
  name: string;
  label: string;
  videos: VideoRef[];
  links: LinkRef[];
  notes: string[];
  errors: string[];
  snippets: string[];
  errorCode: string | null;
}

/** Tool output entry */
interface ToolOutputEntry {
  name?: string;
  content?: string | Record<string, unknown>;
}

/**
 * Convert tool name to human-readable label
 */
function prettyToolLabel(name: string | undefined): string {
  if (!name) return 'Tool';
  try {
    return String(name)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch (_) {
    return String(name || 'tool');
  }
}

/**
 * Parse tool content from string or object
 */
function parseToolContent(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        return trimmed;
      }
    }
    return trimmed;
  }
  return raw;
}

/**
 * Analyze tool payload and extract structured information
 */
function analyseToolPayload(name: string | undefined, payload: unknown): ToolPayloadInfo {
  const info: ToolPayloadInfo = {
    name: name || 'tool',
    label: prettyToolLabel(name),
    videos: [],
    links: [],
    notes: [],
    errors: [],
    snippets: [],
    errorCode: null,
  };

  if (payload == null || payload === '') {
    return info;
  }

  if (typeof payload === 'string') {
    info.snippets.push(payload.trim());
    return info;
  }

  if (typeof payload !== 'object') {
    info.snippets.push(String(payload));
    return info;
  }

  const payloadObj = payload as Record<string, unknown>;

  if (payloadObj.error) {
    const err =
      typeof payloadObj.error === 'string'
        ? payloadObj.error.trim()
        : JSON.stringify(payloadObj.error);
    if (err) info.errors.push(err.slice(0, 240));
    // Capture error code for actionable UI (e.g., missing_key → show settings button)
    if (payloadObj.code) {
      info.errorCode = String(payloadObj.code);
    }
  }

  if (payloadObj.note) {
    const note =
      typeof payloadObj.note === 'string'
        ? payloadObj.note.trim()
        : JSON.stringify(payloadObj.note);
    if (note) info.notes.push(note.slice(0, 240));
  }

  if (payloadObj.job && typeof payloadObj.job === 'object') {
    const job = payloadObj.job as Record<string, unknown>;
    if (job.id) {
      const fragments: string[] = [];
      const jobId = String(job.id);
      fragments.push(`Job ${jobId}`);
      const status =
        (payloadObj.status && String(payloadObj.status)) ||
        (job.status && String(job.status)) ||
        null;
      if (status) fragments.push(`status: ${status}`);
      if (job.model) fragments.push(`model: ${job.model}`);
      if (job.seconds) fragments.push(`${job.seconds}s`);
      if (job.size) fragments.push(String(job.size));
      if (payloadObj.waited) fragments.push('waited');
      const summaryLine = fragments.join(' | ');
      if (summaryLine) info.notes.push(summaryLine.slice(0, 240));
    }
  }

  const downloads = Array.isArray(payloadObj.downloads) ? payloadObj.downloads : [];
  if (downloads.length) {
    for (const file of downloads) {
      if (!file) continue;
      const fileObj = file as Record<string, unknown>;
      if (fileObj.error) {
        info.errors.push(
          `Download ${fileObj.variant || 'asset'} failed: ${String(fileObj.error).slice(0, 160)}`
        );
        continue;
      }
      const target = (fileObj.path || fileObj.location || null) as string | null;
      if (target) {
        const rel = (() => {
          try {
            const cwd = process.cwd();
            return target.startsWith(cwd + path.sep) ? target.slice(cwd.length + 1) : target;
          } catch (_) {
            return target;
          }
        })();
        info.notes.push(`Saved ${fileObj.variant || 'asset'} to ${rel}`);
      }
    }
  }

  if (Array.isArray(payloadObj.images) && payloadObj.images.length) {
    const count = payloadObj.images.length;
    info.notes.push(`Generated ${count} image${count === 1 ? '' : 's'}.`);
  }

  if (Array.isArray(payloadObj.videos)) {
    for (const video of payloadObj.videos) {
      if (!video) continue;
      const videoObj = video as Record<string, unknown>;
      const title =
        typeof videoObj.title === 'string' && videoObj.title.trim()
          ? videoObj.title.trim()
          : 'Video';
      const url: string =
        (videoObj.url ? String(videoObj.url) : '') ||
        (videoObj.videoId ? `https://www.youtube.com/watch?v=${videoObj.videoId}` : '') ||
        '';
      if (!url) continue;
      info.videos.push({ title, url });
      if (info.videos.length >= TOOL_SUMMARY_LIMIT) break;
    }
  }

  if (Array.isArray(payloadObj.results)) {
    for (const item of payloadObj.results) {
      if (!item) continue;
      const itemObj = item as Record<string, unknown>;
      const title =
        typeof itemObj.title === 'string' && itemObj.title.trim() ? itemObj.title.trim() : 'Result';
      const url: string = itemObj.url ? String(itemObj.url) : '';
      info.links.push({ title, url });
      if (info.links.length >= TOOL_SUMMARY_LIMIT) break;
    }
  }

  const stringEntries = Object.entries(payloadObj).filter(([key, value]) => {
    if (key === 'error' || key === 'note' || key === 'videos' || key === 'results') return false;
    return typeof value === 'string' && value.trim();
  });
  for (const [, value] of stringEntries) {
    info.snippets.push(String(value).trim());
  }

  return info;
}

/**
 * Summarize tool event payload for streaming to client
 */
function summariseToolEventPayload(name: string | undefined, payload: unknown): ToolEventSummary {
  const info = analyseToolPayload(name, payload);
  if (info.errors.length > 0) {
    const errMsg = info.errors[0] || '';
    const result: ToolEventSummary = {
      status: 'error',
      summary: `${info.label} error: ${errMsg}`,
    };

    // Determine error code from explicit code or infer from error message
    let code = info.errorCode;
    if (!code) {
      // Infer error code from common patterns in error message
      const lowerErr = errMsg.toLowerCase();
      if (/api[_\s]?key|unauthorized|missing.*key|invalid.*key/i.test(lowerErr)) {
        code = 'missing_api_key';
      } else if (/timeout|timed?\s*out|deadline|took too long/i.test(lowerErr)) {
        code = 'timeout';
      } else if (/rate[_\s]?limit|too many requests|429|throttl/i.test(lowerErr)) {
        code = 'rate_limit';
      }
    }

    // Provide user-friendly message and action for known codes
    if (code) {
      result.code = code;
      if (code === 'missing_key' || code === 'missing_api_key') {
        result.summary = `${info.label} requires an API key. Add one in Settings.`;
        result.action = 'open_settings';
      } else if (code === 'timeout') {
        result.summary = `${info.label} timed out. Try a simpler query.`;
      } else if (code === 'rate_limit') {
        result.summary = `${info.label} hit rate limits. Wait a moment and try again.`;
      } else {
        // Generic tool_error or unknown code
        result.code = code;
      }
    }
    return result;
  }
  if (info.videos.length > 0) {
    return {
      status: 'ok',
      summary: `${info.label} found ${info.videos.length} video${info.videos.length === 1 ? '' : 's'}`,
      count: info.videos.length,
    };
  }
  if (info.links.length > 0) {
    return {
      status: 'ok',
      summary: `${info.label} produced ${info.links.length} result${info.links.length === 1 ? '' : 's'}`,
      count: info.links.length,
    };
  }
  if (info.notes.length > 0) {
    const firstNote = info.notes[0] ?? '';
    return {
      status: 'note',
      summary: firstNote,
      note: firstNote,
    };
  }
  if (info.snippets.length > 0) {
    return {
      status: 'ok',
      summary: `${info.label}: ${info.snippets[0]}`,
    };
  }
  return {
    status: 'ok',
    summary: `${info.label} completed.`,
  };
}

/** Group structure for summarizing tool outputs */
interface ToolGroup {
  label: string;
  videos: VideoRef[];
  links: LinkRef[];
  notes: string[];
  errors: string[];
  snippets: string[];
}

/**
 * Synthesize human-readable Markdown summary from tool outputs
 */
function summariseToolOutputs(msgs: ToolOutputEntry[] | undefined): string {
  try {
    const groups = new Map<string, ToolGroup>();
    for (const entry of msgs || []) {
      if (!entry) continue;
      const name = entry.name || 'tool';
      const payload = parseToolContent(entry.content);
      const info = analyseToolPayload(name, payload);
      if (!groups.has(name)) {
        groups.set(name, {
          label: info.label,
          videos: [],
          links: [],
          notes: [],
          errors: [],
          snippets: [],
        });
      }
      const group = groups.get(name)!;

      if (info.errors.length) {
        for (const err of info.errors) {
          if (!group.errors.includes(err)) group.errors.push(err);
        }
      }
      if (info.notes.length) {
        for (const note of info.notes) {
          if (!group.notes.includes(note)) group.notes.push(note);
        }
      }
      if (info.videos.length) {
        const seen = new Set(group.videos.map((v) => v.url));
        for (const video of info.videos) {
          if (!video.url || seen.has(video.url)) continue;
          group.videos.push(video);
          seen.add(video.url);
          if (group.videos.length >= TOOL_SUMMARY_LIMIT) break;
        }
      }
      if (info.links.length) {
        const seenLinks = new Set(group.links.map((l) => `${l.title}|${l.url}`));
        for (const link of info.links) {
          const key = `${link.title}|${link.url}`;
          if (seenLinks.has(key)) continue;
          group.links.push(link);
          seenLinks.add(key);
          if (group.links.length >= TOOL_SUMMARY_LIMIT) break;
        }
      }
      if (info.snippets.length) {
        for (const snippet of info.snippets) {
          if (!group.snippets.includes(snippet)) group.snippets.push(snippet);
        }
      }
    }

    if (groups.size === 0) return '';

    const lines = ["Here's what the tools reported:"];
    for (const group of groups.values()) {
      const { label, videos, links, notes, errors, snippets } = group;
      if (errors.length) {
        lines.push(`- **${label} error:** ${errors[0]}`);
        continue;
      }
      if (videos.length) {
        lines.push(`- **${label}:** top videos`);
        for (const video of videos.slice(0, TOOL_SUMMARY_LIMIT)) {
          lines.push(`  - [${video.title}](${video.url})`);
        }
      } else if (links.length) {
        lines.push(`- **${label}:** top results`);
        for (const link of links.slice(0, TOOL_SUMMARY_LIMIT)) {
          if (link.url) lines.push(`  - [${link.title}](${link.url})`);
          else lines.push(`  - ${link.title}`);
        }
      }
      if (!videos.length && !links.length && snippets.length) {
        lines.push(`- **${label}:** ${snippets[0]}`);
      }
      if (notes.length) {
        for (const note of notes.slice(0, 2)) {
          lines.push(`  - _${note}_`);
        }
      }
    }
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

/** Image metadata for sanitization */
interface ImageMeta {
  index?: number;
  mimeType?: string;
  type?: string;
  data?: string | Buffer;
  base64?: string;
  image?: string;
}

/**
 * Sanitize tool result for model consumption (strip large base64 data)
 */
function sanitizeToolResultForModel(toolName: string, payload: unknown): unknown {
  if (payload == null) return payload;
  if (typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeToolResultForModel(toolName, item));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === 'images' && Array.isArray(value)) {
      out.images = value
        .map((img: unknown, idx: number) => {
          if (!img || typeof img !== 'object') return null;
          const imgObj = img as ImageMeta;
          const mimeType =
            typeof imgObj.mimeType === 'string' && imgObj.mimeType.trim()
              ? imgObj.mimeType.trim()
              : typeof imgObj.type === 'string' && imgObj.type.trim()
                ? imgObj.type.trim()
                : 'image/png';
          let base64: string | Buffer | null = null;
          if (typeof imgObj.data === 'string') base64 = imgObj.data;
          else if (typeof imgObj.base64 === 'string') base64 = imgObj.base64;
          else if (typeof imgObj.image === 'string') base64 = imgObj.image;
          if (Buffer.isBuffer(base64)) base64 = base64.toString('base64');
          const cleaned = typeof base64 === 'string' ? base64.replace(/\s+/g, '') : '';
          const approxBytes = cleaned ? Math.floor((cleaned.length * 3) / 4) : null;
          return {
            index: imgObj.index != null ? imgObj.index : idx,
            mimeType,
            size: approxBytes != null ? approxBytes : undefined,
            truncated: true,
          };
        })
        .filter(Boolean);
      out._images_truncated = true;
    } else if (key === 'raw') {
      out.raw = '[omitted]';
    } else {
      out[key] = sanitizeToolResultForModel(toolName, value);
    }
  }
  return out;
}

/**
 * Heuristic to detect if a message likely needs tools.
 * Short conversational messages (greetings, acknowledgments) skip tool loading.
 */
const TOOL_KEYWORDS =
  /\b(search|find|look\s?up|recommend|suggest|discover|youtube|video|music|song|playlist|wikipedia|wiki|save|note|describe|analyze|analy[sz]e|image|moodboard|visual|what\s+is|who\s+is|when\s+did|where\s+is|how\s+(do|does|did|to|can)|tell\s+me\s+about|explain|show\s+me|films?\b|movies?\b|director|cinematograph|book|essay|paper)\b/i;

const GREETING_PATTERNS =
  /^(hi|hey|hello|yo|sup|what'?s\s+up|how'?s?\s+it\s+going|how\s+are\s+you|good\s+(morning|afternoon|evening)|thanks?|thank\s+you|ok(ay)?|got\s+it|cool|nice|great|awesome|sounds?\s+good|perfect|bye|goodbye|see\s+you|later|cheers)[!?.,\s]*$/i;

const FOLLOW_UP_PATTERNS =
  /\b(more|another|add\s+(some|a\s+few|more|\d+)|again|similar|like\s+that|keep\s+going|next|also\s+(find|search|look)|show\s+me\s+more|different\s+ones?|can\s+you\s+find)\b/i;

/**
 * Check if recent messages contain tool-related activity (tool results or tool_use blocks).
 * Looks at the last 6 messages for tool context.
 */
function hasRecentToolContext(messages: ChatMessage[]): boolean {
  const recentMessages = messages.slice(-6);
  return recentMessages.some(
    (m) =>
      m.role === 'tool' ||
      (Array.isArray(m.content) &&
        (m.content as ContentPart[]).some((p) => p.type === 'tool_use' || p.type === 'tool_result'))
  );
}

/**
 * Detect if the last user message is a follow-up request in a tool-use context.
 * Returns { needsToolReInvocation: true } when recent tool results exist
 * AND the user message contains follow-up language like "add 5 more" or "show me more".
 */
function detectFollowUp(messages: ChatMessage[]): { needsToolReInvocation: boolean } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { needsToolReInvocation: false };
  }

  // Find last user message text
  let lastUserContent = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') {
        lastUserContent = m.content.trim();
      } else if (Array.isArray(m.content)) {
        for (const part of m.content as ContentPart[]) {
          if (part && part.type === 'text' && typeof part.text === 'string') {
            lastUserContent = part.text.trim();
            break;
          }
        }
      }
      break;
    }
  }

  if (!lastUserContent) {
    return { needsToolReInvocation: false };
  }

  // Check for greeting/acknowledgment first — these are never follow-ups
  if (lastUserContent.length < 80 && GREETING_PATTERNS.test(lastUserContent)) {
    return { needsToolReInvocation: false };
  }

  const hasToolContext = hasRecentToolContext(messages);
  const hasFollowUpLanguage = FOLLOW_UP_PATTERNS.test(lastUserContent);

  return { needsToolReInvocation: hasToolContext && hasFollowUpLanguage };
}

function messageNeedsTools(messages: ChatMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length === 0) return false;

  // Find last user message
  let lastUserContent = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') {
        lastUserContent = m.content.trim();
      } else if (Array.isArray(m.content)) {
        // Handle multi-part content (e.g., with images)
        for (const part of m.content) {
          if (part && part.type === 'text' && typeof part.text === 'string') {
            lastUserContent = part.text.trim();
            break;
          }
        }
      }
      break;
    }
  }

  if (!lastUserContent) return false;

  // Short greetings/acknowledgments don't need tools
  if (lastUserContent.length < 80 && GREETING_PATTERNS.test(lastUserContent)) {
    return false;
  }

  // Context-aware follow-up detection: if recent messages contain tool results
  // and the user is asking for more, trigger tool loading
  if (hasRecentToolContext(messages) && FOLLOW_UP_PATTERNS.test(lastUserContent)) {
    return true;
  }

  // Check for tool-related keywords
  if (TOOL_KEYWORDS.test(lastUserContent)) {
    return true;
  }

  // Longer messages (likely substantive requests) may benefit from tools
  if (lastUserContent.length > 100) {
    return true;
  }

  // Short messages without tool keywords = conversational, skip tools
  return false;
}

/** Detect if the message is a recommendation/discovery request that should force tool usage */
const RECOMMENDATION_PATTERN =
  /\b(recommend|suggest|discover|pick\s+(me\s+)?(something|a\b)|find\s+me|put\s+me\s+on|show\s+me\s+something)\b/i;

function messageNeedsToolForce(messages: ChatMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      const text =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? (m.content.find((p) => p.type === 'text' && p.text) as ContentPart | undefined)
                ?.text || ''
            : '';
      return RECOMMENDATION_PATTERN.test(text);
    }
  }
  return false;
}

export {
  TOOL_SUMMARY_LIMIT,
  prettyToolLabel,
  parseToolContent,
  analyseToolPayload,
  summariseToolEventPayload,
  summariseToolOutputs,
  sanitizeToolResultForModel,
  messageNeedsTools,
  messageNeedsToolForce,
  detectFollowUp,
};
