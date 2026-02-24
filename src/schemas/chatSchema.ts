/**
 * Minimal chat request body schema used by validation middleware.
 * The shape mirrors the main properties required by the chat endpoint while
 * remaining implementation-agnostic. Lightweight so it can run without
 * external dependencies (Zod etc.) in disconnected environments.
 */

interface ValidationIssue {
  message: string;
}

interface ValidationError {
  issues: ValidationIssue[];
}

interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: ValidationError;
}

interface ChatRequestBody {
  apiKey?: string;
  model: string;
  messages: unknown[];
  [key: string]: unknown;
}

function validate(data: unknown): SafeParseResult<ChatRequestBody> {
  const issues: ValidationIssue[] = [];

  if (typeof data !== 'object' || data === null) {
    issues.push({ message: 'body must be an object' });
    return { success: false, error: { issues } };
  }

  const body = data as Record<string, unknown>;

  // apiKey is optional at schema level – individual providers may enforce it
  // later inside the route handler. When present, it must be a non-empty string.
  if (body.apiKey !== undefined && typeof body.apiKey !== 'string') {
    issues.push({ message: 'apiKey must be a string when provided' });
  }

  if (!body.model || typeof body.model !== 'string') {
    issues.push({ message: 'model is required and must be a string' });
  }

  if (!Array.isArray(body.messages)) {
    issues.push({ message: 'messages must be an array' });
  }

  if (issues.length) {
    return { success: false, error: { issues } };
  }

  return { success: true, data: body as ChatRequestBody };
}

// Emulate the Zod API that the validate middleware expects.
export default {
  safeParse: validate,
};
