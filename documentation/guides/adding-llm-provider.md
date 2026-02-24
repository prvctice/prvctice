# How to: Add an LLM Provider

> **Prerequisites:** TypeScript, familiarity with async generators, access to the provider's API docs
> **Time estimate:** 1-2 hours
> **Difficulty:** Intermediate

## Architecture Context

prvctice supports multiple LLM providers through an adapter pattern. Each provider implements a `BaseAdapter` abstract class that normalizes streaming responses into a common `ChatChunk` format. The factory function `createAdapter()` in `src/services/llmProviderFactory.ts` selects the correct adapter at runtime based on the provider name from the request.

All adapter code lives within the **LLM Adapters boundary** defined in [CODEMAP.md](../CODEMAP.md). The boundary invariant is: adapter changes stay within this boundary and do not leak provider-specific types into the rest of the codebase. For overall system context, see [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md).

You will touch exactly **3 files**: a new adapter file, the factory, and the type definitions.

## Step-by-Step

### Step 1: Create the adapter file

Create `src/adapters/<yourProvider>Adapter.ts`. Extend `BaseAdapter` and implement the `streamChat` method.

The base class is minimal -- it stores config and requires one abstract method:

```typescript
// src/adapters/baseAdapter.ts (for reference -- do not modify)
export abstract class BaseAdapter {
  protected options: AdapterConfig;

  constructor(options: AdapterConfig) {
    this.options = options;
  }

  abstract streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown>;
}
```

Your adapter skeleton:

```typescript
// src/adapters/exampleAdapter.ts
import { BaseAdapter } from './baseAdapter.js';
import type { ChatRequest } from '../../types/chat.js';
import type { ChatChunk } from '../../types/adapters.js';
import { normaliseError } from '../utils/errors.js';

export class ExampleAdapter extends BaseAdapter {
  constructor({ apiKey }: { apiKey: string }) {
    super({ apiKey });
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<ChatChunk, void, unknown> {
    const { model, messages, tools = [] } = req;

    // Your provider-specific streaming logic here

    yield { type: 'done' };
  }
}

export default ExampleAdapter;
```

For a real-world SDK-based adapter, see `src/adapters/anthropicAdapter.ts`. For a simpler HTTP-based adapter (no SDK dependency), see `src/adapters/lmstudioAdapter.ts`.

### Step 2: Implement `streamChat` returning `AsyncGenerator<ChatChunk>`

`streamChat` must yield `ChatChunk` objects. `ChatChunk` is a discriminated union defined in `types/adapters.d.ts`. The key chunk types you will use:

| Chunk type                                            | When to yield                                | Example                                                                                   |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `{ type: 'delta', content: string }`                  | Each text fragment as it streams in          | `yield { type: 'delta', content: 'Hello' }`                                               |
| `{ type: 'tool_call', id, name, arguments }`          | When the model invokes a tool                | `yield { type: 'tool_call', id: 'call_1', name: 'search', arguments: { query: 'test' } }` |
| `{ type: 'tool_result', tool_call_id, content }`      | Returning tool results to the model          | `yield { type: 'tool_result', tool_call_id: 'call_1', content: '...' }`                   |
| `{ type: 'usage', prompt_tokens, completion_tokens }` | Token usage stats (if provider reports them) | `yield { type: 'usage', prompt_tokens: 100, completion_tokens: 50 }`                      |
| `{ type: 'error', message, code? }`                   | Non-fatal errors during streaming            | `yield { type: 'error', message: 'Rate limited', code: '429' }`                           |
| `{ type: 'done' }`                                    | **Required.** Signal end of stream           | `yield { type: 'done' }`                                                                  |

Additional chunk types (`reasoning`, `image`, `response_id`, `web_search_status`, `web_search_error`, `web_search_urls`, `pause_turn`) exist for provider-specific features. See `types/adapters.d.ts` for the full union.

Every `streamChat` call **must** eventually yield `{ type: 'done' }`.

### Step 3: Use `normaliseError` for error handling

All provider errors should go through `normaliseError()` from `src/utils/errors.ts`. This wraps errors in a `ProviderError` with consistent fields (`provider`, `message`, `code`, `retriable`).

```typescript
import { normaliseError } from '../utils/errors.js';

// In your streamChat method:
try {
  // ... make API call
} catch (err) {
  throw normaliseError('yourprovider', err as Error);
}
```

`normaliseError` automatically detects retriable errors (HTTP 429 rate limits, 5xx server errors) so upstream code can retry without provider-specific logic.

### Step 4: Add the provider to the `Provider` union type

In `types/adapters.d.ts`, add your provider name to the `Provider` union:

```typescript
// Before:
export type Provider = 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio';

// After:
export type Provider = 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio' | 'yourprovider';
```

### Step 5: Import the adapter in the factory

In `src/services/llmProviderFactory.ts`, add an import for your adapter:

```typescript
import YourProviderAdapter from '../adapters/yourProviderAdapter.js';
```

### Step 6: Add a case to the `createAdapter` switch

In the same file, add your provider to the switch statement. If your provider requires an API key (most do):

```typescript
switch (providerLower) {
  case 'anthropic':
    return new AnthropicAdapter({ apiKey });
  // ... existing cases ...
  case 'yourprovider':
    return new YourProviderAdapter({ apiKey });
  default:
    throw new Error(`Unsupported provider: ${provider}`);
}
```

If your provider does not require an API key (like LM Studio), add it before the API key check, following the `lmstudio` pattern.

## Testing Your Changes

1. **Unit test:** Create `tests/adapters/yourProviderAdapter.test.ts`. Mock the provider API and verify your adapter yields correct `ChatChunk` sequences for: a normal text response, a tool call response, and an error response.

2. **Integration test:** Start the dev server (`npm run web:dev`), select your provider in the UI, and send a message. Verify streaming text appears incrementally.

3. **Error path:** Test with an invalid API key. Confirm you get a `ProviderError` with the correct provider name, not a raw SDK error leaking to the client.

4. **Lint and type-check:**

```bash
npm run lint && npm run type-check
```

## Checklist

- [ ] Created `src/adapters/<provider>Adapter.ts` extending `BaseAdapter`
- [ ] `streamChat` yields proper `ChatChunk` objects and ends with `{ type: 'done' }`
- [ ] Errors wrapped with `normaliseError('<provider>', err)`
- [ ] Added provider name to `Provider` union in `types/adapters.d.ts`
- [ ] Imported adapter in `src/services/llmProviderFactory.ts`
- [ ] Added case to `createAdapter()` switch
- [ ] Tests written and passing
- [ ] `npm run lint && npm run type-check` passes

## Reference

- [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) -- system-level context
- [CODEMAP.md](../CODEMAP.md) -- LLM Adapters boundary definition
- `src/adapters/baseAdapter.ts` -- abstract base class
- `src/services/llmProviderFactory.ts` -- adapter factory and registration
- `types/adapters.d.ts` -- `ChatChunk`, `AdapterConfig`, `Provider` types
- `src/adapters/anthropicAdapter.ts` -- SDK-based reference implementation
- `src/adapters/lmstudioAdapter.ts` -- HTTP-based reference implementation (no SDK)
- `src/utils/errors.ts` -- `normaliseError` and `ProviderError`

---

_Last verified: 2026-02-23_
