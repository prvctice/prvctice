/**
 * Chat Error Classification
 *
 * Transforms raw errors into user-friendly messages with recovery actions.
 * Distinguishes between config errors (user can fix) and app bugs (report to dev).
 */

declare global {
  interface Window {
    openApiKeysModal?: () => void;
    openModelSelector?: () => void;
    openBugReport?: (error?: string) => void;
  }
}

export type ErrorCategory = 'config' | 'network' | 'provider' | 'app' | 'tool';

export interface ClassifiedError {
  category: ErrorCategory;
  title: string;
  message: string;
  recoverable: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
  code?: string | number;
  provider?: string;
  retriable?: boolean;
  status?: number;
}

/**
 * Known error patterns and their classifications
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp | ((err: ApiErrorResponse) => boolean);
  classify: (err: ApiErrorResponse) => ClassifiedError;
}> = [
  // Provider-specific API key patterns (most specific first)
  {
    pattern: /openai.*api[_\s]?key|openai.*unauthorized|openai.*401/i,
    classify: () => ({
      category: 'config',
      title: 'OpenAI API Key Required',
      message: 'Your OpenAI API key is missing or invalid. Add it in Settings.',
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  {
    pattern: /anthropic.*api[_\s]?key|anthropic.*unauthorized|anthropic.*401|claude.*api[_\s]?key/i,
    classify: () => ({
      category: 'config',
      title: 'Anthropic API Key Required',
      message: 'Your Anthropic API key is missing or invalid. Add it in Settings.',
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  {
    pattern: /gemini.*api[_\s]?key|google.*api[_\s]?key|gemini.*unauthorized|gemini.*401/i,
    classify: () => ({
      category: 'config',
      title: 'Google AI API Key Required',
      message: 'Your Google AI (Gemini) API key is missing or invalid. Add it in Settings.',
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  {
    pattern: /openrouter.*api[_\s]?key|openrouter.*unauthorized|openrouter.*401/i,
    classify: () => ({
      category: 'config',
      title: 'OpenRouter API Key Required',
      message: 'Your OpenRouter API key is missing or invalid. Add it in Settings.',
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  // Tool-specific API key patterns
  {
    pattern: /youtube.*api[_\s]?key|youtube.*unauthorized|youtube.*403/i,
    classify: () => ({
      category: 'tool',
      title: 'YouTube API Key Required',
      message: 'The YouTube tool requires an API key. Add it in Settings.',
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  {
    pattern: /tmdb.*api[_\s]?key|tmdb.*unauthorized|themoviedb/i,
    classify: () => ({
      category: 'tool',
      title: 'TMDB Unavailable',
      message: 'The movie/TV feature is temporarily unavailable. Please try again later.',
      recoverable: false,
    }),
  },
  {
    pattern: /discogs.*api[_\s]?key|discogs.*unauthorized|discogs.*token/i,
    classify: () => ({
      category: 'tool',
      title: 'Discogs API Key Required',
      message: 'The music tool requires a Discogs API key. Add it in Settings.',
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  // Tool execution failures
  {
    pattern: /tool.*failed|tool.*error|tool.*execution|function.*call.*failed/i,
    classify: (err) => ({
      category: 'tool',
      title: 'Tool Failed',
      message: err.message || 'A tool failed to execute. Try rephrasing your request.',
      recoverable: true,
    }),
  },
  // Tool timeout
  {
    pattern: /tool.*timeout|tool.*timed.*out|function.*timeout/i,
    classify: () => ({
      category: 'tool',
      title: 'Tool Timeout',
      message: 'The tool took too long to respond. Try again or simplify your request.',
      recoverable: true,
    }),
  },
  // Generic missing API key patterns (fallback)
  {
    pattern: /api[_\s]?key.*missing|no.*api[_\s]?key|invalid.*api[_\s]?key|unauthorized|401/i,
    classify: (err) => ({
      category: 'config',
      title: 'API Key Required',
      message: `Your ${err.provider || 'AI'} API key is missing or invalid.`,
      recoverable: true,
      action: {
        label: 'Open Settings',
        handler: () => window.openApiKeysModal?.(),
      },
    }),
  },
  // Rate limiting
  {
    pattern: (err) => err.code === 429 || err.status === 429,
    classify: (err) => ({
      category: 'provider',
      title: 'Rate Limited',
      message: `${err.provider || 'The AI provider'} is rate limiting requests. Wait a moment and try again.`,
      recoverable: true,
    }),
  },
  // Model not found / invalid model
  {
    pattern: /model.*not.*found|invalid.*model|does not exist/i,
    classify: () => ({
      category: 'config',
      title: 'Invalid Model',
      message: 'The selected model is not available. Check your model settings.',
      recoverable: true,
      action: {
        label: 'Change Model',
        handler: () => {
          if (typeof window.openModelSelector === 'function') {
            window.openModelSelector();
          }
        },
      },
    }),
  },
  // Quota exceeded
  {
    pattern: /quota.*exceeded|billing|insufficient.*credits|payment.*required/i,
    classify: (err) => ({
      category: 'config',
      title: 'Quota Exceeded',
      message: `Your ${err.provider || 'AI provider'} account has run out of credits or quota.`,
      recoverable: false,
    }),
  },
  // Network errors
  {
    pattern: /network|fetch|ECONNREFUSED|ETIMEDOUT|offline|connection/i,
    classify: () => ({
      category: 'network',
      title: 'Network Error',
      message: 'Could not connect to the server. Check your internet connection.',
      recoverable: true,
    }),
  },
  // Provider down / 5xx errors
  {
    pattern: (err) => {
      const code = typeof err.code === 'number' ? err.code : parseInt(String(err.code), 10);
      return code >= 500 && code < 600;
    },
    classify: (err) => ({
      category: 'provider',
      title: 'Provider Error',
      message: `${err.provider || 'The AI provider'} is experiencing issues. Try again in a moment.`,
      recoverable: true,
    }),
  },
  // Content policy / safety
  {
    pattern: /content.*policy|safety|blocked|filtered|moderation/i,
    classify: () => ({
      category: 'provider',
      title: 'Content Blocked',
      message: "The request was blocked by the AI provider's safety filters.",
      recoverable: false,
    }),
  },
  // Context length exceeded
  {
    pattern: /context.*length|too.*long|max.*tokens|token.*limit/i,
    classify: () => ({
      category: 'provider',
      title: 'Message Too Long',
      message: 'The conversation is too long. Start a new conversation or remove some messages.',
      recoverable: true,
    }),
  },
  // Streaming connection errors
  {
    pattern: /stream.*disconnect|stream.*closed|stream.*aborted|sse.*error|eventsource.*error/i,
    classify: () => ({
      category: 'network',
      title: 'Connection Lost',
      message: 'The streaming connection was interrupted. Check your connection and try again.',
      recoverable: true,
    }),
  },
  // Partial response / incomplete stream
  {
    pattern: /incomplete.*response|partial.*response|stream.*incomplete|truncated/i,
    classify: () => ({
      category: 'provider',
      title: 'Incomplete Response',
      message: 'The response was cut off unexpectedly. Try sending your message again.',
      recoverable: true,
    }),
  },
];

/**
 * Classify an error from an API response
 */
export function classifyError(err: ApiErrorResponse | string | Error): ClassifiedError {
  // Normalize input to ApiErrorResponse
  let normalized: ApiErrorResponse;

  if (typeof err === 'string') {
    normalized = { error: err, message: err };
  } else if (err instanceof Error) {
    normalized = {
      error: err.message,
      message: err.message,
      code: (err as unknown as { code?: string | number }).code,
    };
  } else {
    normalized = err;
  }

  const errorText = normalized.error || normalized.message || '';

  // Try to match known patterns
  for (const { pattern, classify } of ERROR_PATTERNS) {
    const matches = typeof pattern === 'function' ? pattern(normalized) : pattern.test(errorText);

    if (matches) {
      return classify(normalized);
    }
  }

  // Default: unknown error (likely app bug)
  return {
    category: 'app',
    title: 'Something Went Wrong',
    message: errorText || 'An unexpected error occurred.',
    recoverable: false,
    action: {
      label: 'Report Bug',
      handler: () => {
        // Could open bug report modal or copy error to clipboard
        if (typeof window.openBugReport === 'function') {
          window.openBugReport(errorText);
        } else {
          console.error('[Bug Report]', errorText);
        }
      },
    },
  };
}

/**
 * Format a classified error for display in chat
 */
export function formatErrorForChat(classified: ClassifiedError): string {
  let result = `**${classified.title}**\n\n${classified.message}`;

  if (classified.recoverable) {
    result += '\n\n*You can try again.*';
  }

  if (classified.action) {
    const actionId = classified.action.label.toLowerCase().replace(/\s+/g, '-');
    result += `\n\n[${classified.action.label}](#action:${actionId})`;
  }

  return result;
}

/**
 * Parse error from fetch response
 */
export async function parseResponseError(response: Response): Promise<ApiErrorResponse> {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return {
        error: json.error || json.message,
        message: json.message || json.error,
        code: json.code || response.status,
        provider: json.provider,
        retriable: json.retriable,
        status: response.status,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    error: `Request failed with status ${response.status}`,
    status: response.status,
    code: response.status,
  };
}
