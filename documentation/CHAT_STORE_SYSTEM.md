# Chat Store System Documentation

> **Why this doc:** The Chat Store manages all message state, streaming responses, and multi-provider LLM dispatch. Read this when working on message handling, adding a new LLM provider, or debugging stream processing.
>
> **Related systems:** [SKILL_COORDINATOR_SYSTEM.md](./SKILL_COORDINATOR_SYSTEM.md) | [SPEECH_SYSTEM.md](./SPEECH_SYSTEM.md) | [PDF_SYSTEM.md](./PDF_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The Chat Store is the central state management system for chat functionality in prvctice. It orchestrates message handling, streaming responses, image processing, conversation persistence, and multi-provider LLM integration through a modular architecture.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Module Dependency Graph](#module-dependency-graph)
4. [Contract and Invariants](#contract-and-invariants)
5. [Data Flow](#data-flow)
6. [Provider Dispatch Patterns](#provider-dispatch-patterns)
7. [Stream Handling](#stream-handling)
8. [Image Processing Pipeline](#image-processing-pipeline)
9. [Conversation Persistence](#conversation-persistence)
10. [Configuration Reference](#configuration-reference)
11. [Failure Modes](#failure-modes)
12. [Code Examples](#code-examples)
13. [File Reference](#file-reference)
14. [Reference Mapping](#reference-mapping)
15. [Changelog](#changelog)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │   InputBar.vue  │  │  ChatPanel.vue  │  │  File Attachments (composable)  │  │
│  │  (text input)   │  │  (message list) │  │  useFileAttachments             │  │
│  └────────┬────────┘  └────────▲────────┘  └──────────────┬──────────────────┘  │
│           │                    │                          │                      │
│           ▼                    │                          ▼                      │
└───────────┼────────────────────┼──────────────────────────┼──────────────────────┘
            │                    │                          │
            ▼                    │                          │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CHAT STORE (Pinia)                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         chat.ts - Main Orchestrator                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │  messages   │  │  streaming  │  │   sending   │  │    nudge    │      │  │
│  │  │  Ref<[]>    │  │  Ref<State> │  │  Ref<bool>  │  │  Ref<Nudge> │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  │                                                                           │  │
│  │  Actions: send() | stop() | appendMessage() | loadConversation()         │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│  ┌───────────────────────────────────┼───────────────────────────────────────┐  │
│  │                          MODULES                                           │  │
│  │                                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │  provider.ts │  │ transport.ts │  │ streaming.ts │  │conversation.ts│  │  │
│  │  │  API keys    │  │  fetch/sock  │  │  NDJSON      │  │  CRUD/persist │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   images.ts  │  │   utils.ts   │  │gameLauncher.ts│ │imageProcessing│  │  │
│  │  │  base64/blob │  │  uuid/notif  │  │  game detect │  │  attach->b64  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    dispatchers/                                      │  │  │
│  │  │  ┌─────────────────────────────────────────────┐                   │  │  │
│  │  │  │   nonOpenai.ts                              │                   │  │  │
│  │  │  │  Anthropic/Gemini/OpenRouter/LM Studio reqs │                   │  │  │
│  │  │  └─────────────────────────────────────────────┘                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND API                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │    /chat        │  │/api/v1/dispatch │  │    /api/thread/*                │  │
│  │  (streaming)    │  │  (multi-modal)  │  │  (history sync)                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LLM PROVIDERS                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   OpenAI    │  │   Gemini    │  │  Anthropic  │  │ OpenRouter  │  │ LMStudio │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### ChatMessage

A **ChatMessage** represents a single message in the conversation:

```typescript
interface ChatMessage {
  id: string; // Unique identifier (UUID)
  sender: 'user' | 'assistant' | 'system'; // Message author
  text: string; // Message content
  createdAt: number; // Unix timestamp (ms)
  editedAt?: number; // Edit timestamp (optional)
  images?: ImageEntry[]; // Attached images (optional)
}
```

### ImageEntry

An **ImageEntry** represents an image attached to a message:

```typescript
interface ImageEntry {
  src: string; // Object URL or data URL for display
  kind: 'user' | 'assistant' | 'moodboard'; // Image source type
  mimeType?: string; // MIME type (image/png, image/jpeg, image/webp)
  base64?: string; // Base64 data for API requests
  downloadName?: string; // Suggested filename for download
  prompt?: string; // Generation prompt (for assistant images)
  model?: string; // Model that generated the image
  provider?: string; // Provider that generated the image
  timestamp?: number; // Unix timestamp for image creation
  source?: string; // Source identifier (e.g., 'discogs', 'tmdb')
  imageId?: string; // External ID from source system
  thumbnailUrl?: string; // URL to thumbnail version
  sourceUrl?: string; // URL to original source page
  artist?: string; // Artist/creator name (for moodboard images)
  date?: string; // Date string (for moodboard images)
}
```

### StreamingState

The **StreamingState** tracks active streaming:

```typescript
interface StreamingState {
  active: boolean; // Whether streaming is in progress
  buffer: string; // Accumulated text from stream chunks
}
```

### Provider

Supported LLM **Provider** types:

```typescript
type Provider = 'anthropic' | 'gemini' | 'openrouter' | 'lmstudio';
```

### Nudge

A **Nudge** is a server suggestion (e.g., switch providers for better OCR):

```typescript
interface Nudge {
  type: 'ocr_provider' | string; // Nudge category (extensible)
  message: string; // User-facing message
  suggested_provider?: string; // Recommended provider to switch to
}
```

---

## Internal State

The chat store maintains several internal refs that are not directly exposed but are critical for coordinating behavior across message flows:

### Prompt and Image Tracking

| Ref                  | Type                      | Purpose                                            |
| -------------------- | ------------------------- | -------------------------------------------------- |
| `lastPrompt`         | `Ref<string>`             | Stores the last user prompt for nudge resubmission |
| `workingImage`       | `Ref<ImageEntry \| null>` | Current image being processed in the pipeline      |
| `lastImageTimestamp` | `Ref<number>`             | Timestamp of the most recent image activity        |
| `lastAssistantImage` | `Ref<LastImageState>`     | Metadata for the last AI-generated image           |
| `lastSourceImage`    | `Ref<LastImageState>`     | Metadata for the last user-provided image          |

### LastImageState Structure

```typescript
interface LastImageState {
  base64: string | null; // Base64 data for API requests
  mimeType: string | null; // MIME type
  url: string | null; // Object URL for display
}
```

These refs enable features like:

- **Nudge resubmission**: Resending the last prompt with a different provider
- **Image edit detection**: Tracking the working image for edit operations
- **Image continuity**: Maintaining context when chaining image operations

---

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MODULE DEPENDENCIES                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                              ┌─────────────┐                                     │
│                              │   chat.ts   │ ← Main Store                        │
│                              │  (1,116 loc)│                                     │
│                              └──────┬──────┘                                     │
│                                     │                                            │
│         ┌───────────┬───────────┬───┴───┬───────────┬───────────┐               │
│         ▼           ▼           ▼       ▼           ▼           ▼               │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│  │provider.ts│ │transport.ts│ │streaming.ts│ │conversation│ │dispatchers│         │
│  │  (149)    │ │  (225)    │ │  (482)    │ │  (575)    │ │  (270)    │          │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘          │
│        │             │             │             │             │                 │
│        │             │             ▼             │             ▼                 │
│        │             │      ┌───────────┐        │      ┌───────────┐           │
│        │             │      │ images.ts │        │      │nonOpenai.ts│          │
│        │             │      │   (96)    │        │      │           │           │
│        │             │      └─────┬─────┘        │      └─────┬─────┘           │
│        │             │            │              │            │                  │
│        └─────────────┴────────────┼──────────────┴────────────┘                  │
│                                   ▼                                              │
│                            ┌───────────┐                                         │
│                            │  utils.ts │ ← Shared Utilities                      │
│                            │   (83)    │                                         │
│                            └───────────┘                                         │
│                                                                                  │
│  Standalone (no internal deps):                                                  │
│  ┌───────────┐  ┌───────────────┐                                               │
│  │gameLauncher│  │imageProcessing│                                               │
│  │   (73)    │  │    (102)      │                                               │
│  └───────────┘  └───────────────┘                                               │
│                                                                                  │
│  Legend: (N) = Lines of code                                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Contract and Invariants

### Guarantees Provided by the Store

| Guarantee                    | Description                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------- |
| **Message IDs**              | Every message receives a unique UUID via `uuid()`                             |
| **Immutable Updates**        | Message array is always replaced, never mutated                               |
| **Streaming Buffer**         | Buffer is normalized with citations before display                            |
| **Conversation Persistence** | Messages are persisted to IndexedDB after append (best-effort; errors logged) |
| **Image Memory Management**  | Object URLs are tracked and revoked on conversation switch                    |
| **Abort Control**            | Previous requests are aborted when new requests start                         |

### Required Fields by Action

| Action               | Required Fields                                                       | Optional Fields                      |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `send(text)`         | `text: string` (required; attachments alone prompt for clarification) | attachments via `useFileAttachments` |
| `appendMessage()`    | `sender: MessageSender`, `text: string \| null`                       | `imagePayload`                       |
| `loadConversation()` | `conversationId: string`                                              | `options: LoadConversationOptions`   |
| `editMessage()`      | `messageId: string`, `newText: string`                                | —                                    |

### Canonical Data Shapes

**Base64 Image (for API requests):**

```typescript
{
  data: string;
  mimeType: string;
}
```

**Conversation Message (for multi-turn):**

```typescript
{
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}
```

**Stream Event Types:**

| Type            | Payload                           | Description                 |
| --------------- | --------------------------------- | --------------------------- |
| `delta`         | `{ content: string }`             | Text chunk                  |
| `done`          | —                                 | Stream complete             |
| `tool_call`     | `{ name, id }`                    | Tool invocation started     |
| `tool_progress` | `{ id, name, phase }`             | Tool execution phase update |
| `tool_result`   | `{ status, summary, action? }`    | Tool execution result       |
| `image`         | `{ data, mimeType, filename? }`   | Base64 image from assistant |
| `moodboard`     | `{ images[], sources[], intent }` | URL-based image collection  |
| `error`         | `{ message }`                     | Error message               |

---

## Data Flow

### Send Message Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SEND MESSAGE LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. USER INPUT                                                                   │
│     ┌──────────────────┐                                                        │
│     │ User types text, │                                                        │
│     │ attaches images  │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                   │
│              ▼                                                                   │
│  2. VALIDATION & SETUP                                                           │
│     ┌──────────────────┐                                                        │
│     │ check game launch│ ──(game detected)──▶ Launch game, return early          │
│     │ pick provider    │                                                        │
│     │ pick model       │                                                        │
│     │ get API key      │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                   │
│              ▼                                                                   │
│  3. CONVERSATION SETUP                                                           │
│     ┌──────────────────┐                                                        │
│     │ ensureConversation│                                                        │
│     │ (create if none) │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                   │
│              ▼                                                                   │
│  4. ECHO USER MESSAGE                                                            │
│     ┌──────────────────┐                                                        │
│     │ appendMessage    │                                                        │
│     │ 'user', text     │                                                        │
│     │ + attachments    │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                   │
│              ▼                                                                   │
│  5. DISPATCH BASED ON PROVIDER                                                   │
│     ┌──────────────────────────────────────────────────────────────────┐        │
│     │                                                                   │        │
│     │  ┌─────────────────────┐      ┌─────────────────────┐           │        │
│     │  │  provider === 'openai'     │  provider !== 'openai'          │        │
│     │  │                     │      │                     │           │        │
│     │  ▼                     │      ▼                     │           │        │
│     │  ┌─────────────────┐   │      ┌─────────────────┐   │           │        │
│     │  │ Has images?     │   │      │ Process images  │   │           │        │
│     │  │   ▼ Yes  ▼ No   │   │      │ or use history  │   │           │        │
│     │  │   │      │      │   │      └────────┬────────┘   │           │        │
│     │  │   ▼      ▼      │   │               │            │           │        │
│     │  │dispatch /chat   │   │               ▼            │           │        │
│     │  │or streaming     │   │      ┌─────────────────┐   │           │        │
│     │  └─────────────────┘   │      │dispatch ndjson  │   │           │        │
│     │                        │      │or JSON response │   │           │        │
│     └────────────────────────┘      └─────────────────┘   │           │        │
│                                                                        │        │
│     └──────────────────────────────────────────────────────────────────┘        │
│              │                                                                   │
│              ▼                                                                   │
│  6. PROCESS RESPONSE                                                             │
│     ┌──────────────────┐                                                        │
│     │ Streaming:       │                                                        │
│     │  onChunk → buffer│                                                        │
│     │  onDone → final  │                                                        │
│     │  onImage → append│                                                        │
│     │                  │                                                        │
│     │ Non-streaming:   │                                                        │
│     │  JSON → append   │                                                        │
│     └────────┬─────────┘                                                        │
│              │                                                                   │
│              ▼                                                                   │
│  7. FINALIZE                                                                     │
│     ┌──────────────────┐                                                        │
│     │finalizeStreaming │                                                        │
│     │clear attachments │                                                        │
│     │emit event        │                                                        │
│     └──────────────────┘                                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Provider Dispatch Patterns

### Why Dispatchers are Split by Provider Type

The dispatchers are split into `openai.ts` and `nonOpenai.ts` because:

1. **Different Streaming Behaviors**: OpenAI uses SSE format, others use NDJSON
2. **Different API Key Handling**: Each provider has specific key validation patterns
3. **Different Request Schemas**: OpenAI vision uses a different message format
4. **Multi-turn Handling**: Non-OpenAI providers support full conversation context with images

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        PROVIDER DISPATCH DECISION                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  send(text)                                                                      │
│       │                                                                          │
│       ▼                                                                          │
│  ┌───────────────────┐                                                          │
│  │ provider === 'openai' ?                                                      │
│  └─────────┬─────────┘                                                          │
│            │                                                                     │
│     ┌──────┴──────┐                                                             │
│     │ YES         │ NO                                                          │
│     ▼             ▼                                                             │
│  ┌──────────┐  ┌──────────┐                                                     │
│  │ Has      │  │ Has      │                                                     │
│  │ images?  │  │ images?  │                                                     │
│  └────┬─────┘  └────┬─────┘                                                     │
│       │             │                                                            │
│  ┌────┴────┐   ┌────┴────┐                                                      │
│  │YES │ NO │   │YES │ NO │                                                      │
│  ▼    ▼    │   ▼    ▼    │                                                      │
│ Dispatch  /chat  Dispatch   /api/v1/dispatch                                    │
│ to        stream to        (NDJSON or JSON)                                     │
│ dispatch  only   dispatch                                                       │
│ (JSON)           w/images                                                       │
│                  or history                                                     │
│                                                                                  │
│  Response handling:                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ OpenAI text-only: /chat endpoint, SSE streaming                            │ │
│  │ OpenAI with images: /api/v1/dispatch, JSON response                        │ │
│  │ Non-OpenAI: /api/v1/dispatch, NDJSON streaming or JSON response            │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Stream Handling

### NDJSON Stream Processing

The streaming module processes newline-delimited JSON from the server:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STREAM EVENT PROCESSING                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  HTTP Response (NDJSON)                                                          │
│       │                                                                          │
│       ▼                                                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    handleStreamingResponse()                               │  │
│  │                                                                            │  │
│  │  reader = resp.body.getReader()                                            │  │
│  │  decoder = new TextDecoder()                                               │  │
│  │  buf = ''                                                                  │  │
│  │                                                                            │  │
│  │  while (true):                                                             │  │
│  │    { done, value } = await reader.read()                                   │  │
│  │    if done: break                                                          │  │
│  │                                                                            │  │
│  │    buf += decoder.decode(value, { stream: true })                          │  │
│  │                                                                            │  │
│  │    while (newline found in buf):                                           │  │
│  │      line = extract line from buf                                          │  │
│  │      evt = JSON.parse(line)                                                │  │
│  │      route by evt.type ───────────────────────────────────────────────┐    │  │
│  │                                                                       │    │  │
│  └───────────────────────────────────────────────────────────────────────│────┘  │
│                                                                          │       │
│  ┌───────────────────────────────────────────────────────────────────────▼────┐  │
│  │                           EVENT ROUTING                                    │  │
│  │                                                                            │  │
│  │  'delta'        → onChunk(evt.content)                                     │  │
│  │                   → Signal AI response start (particles)                   │  │
│  │                                                                            │  │
│  │  'done'         → If hasToolActivity && !hasContent: continue waiting      │  │
│  │                   → Otherwise: onDone(), break loop                        │  │
│  │                                                                            │  │
│  │  'tool_call'    → Set hasToolActivity = true                               │  │
│  │                                                                            │  │
│  │  'tool_progress'→ handleToolProgress(evt, notify)                          │  │
│  │                   → Show "Tool started..." / "Tool finished."              │  │
│  │                                                                            │  │
│  │  'tool_result'  → If error: show notification with optional action         │  │
│  │                   → If note: show info notification                        │  │
│  │                                                                            │  │
│  │  'image'        → Decode base64 → Create blob → Create object URL          │  │
│  │                   → onImage(entry)                                         │  │
│  │                   → Pin URL for cleanup                                    │  │
│  │                                                                            │  │
│  │  'moodboard'    → onMoodboard({ images, sources, intent })                 │  │
│  │                                                                            │  │
│  │  'error'        → onError(evt.message), break loop                         │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  KEY BEHAVIOR: Intermediate 'done' events (after tool_call but before content)  │
│  are ignored to allow tool execution to complete before finalizing.             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Tool Progress Tracking

```typescript
// Tool progress map tracks active tool executions
const toolProgressMap = new Map<string, string>();

// On 'started': map.set(toolId, name) → notify "Tool started..."
// On 'completed': map.delete(toolId) → notify "Tool finished."
```

---

## Image Processing Pipeline

### Image Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           IMAGE LIFECYCLE                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  USER ATTACHMENT                                                                 │
│  ┌──────────────────┐                                                           │
│  │ File/Blob from   │                                                           │
│  │ file picker or   │                                                           │
│  │ paste            │                                                           │
│  └────────┬─────────┘                                                           │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    processAttachedImages()                                │   │
│  │                                                                           │   │
│  │  1. Filter: Only PNG, JPEG, WEBP allowed                                  │   │
│  │  2. Convert: arrayBuffer → Uint8Array → btoa → base64                     │   │
│  │  3. Validate: base64.length >= 100                                        │   │
│  │  4. Return: { images, skipped, errors }                                   │   │
│  │                                                                           │   │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────┐                                                           │
│  │ Send to API as   │                                                           │
│  │ { data, mimeType}│                                                           │
│  └────────┬─────────┘                                                           │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────┐                                                           │
│  │ Store in message │                                                           │
│  │ with base64 ref  │                                                           │
│  └────────┬─────────┘                                                           │
│           │                                                                      │
│           ▼                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    persistMessageToStorage()                              │   │
│  │                                                                           │   │
│  │  1. For each image with base64 or blob URL:                               │   │
│  │     - Convert to Blob                                                     │   │
│  │     - Store via storage.blobs.put(blob, mimeType)                         │   │
│  │     - Save hash reference                                                 │   │
│  │                                                                           │   │
│  │  2. Store message with imageRefs: [{ blobHash, mimeType, kind }]          │   │
│  │                                                                           │   │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  CONVERSATION LOAD                                                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    loadConversation()                                     │   │
│  │                                                                           │   │
│  │  1. Revoke previous conversation's object URLs                            │   │
│  │  2. For each message with imageRefs:                                      │   │
│  │     - Fetch blob by hash: blobGetByHash(ref.blobHash)                     │   │
│  │     - Create object URL: URL.createObjectURL(blob)                        │   │
│  │     - Pin URL for cleanup tracking                                        │   │
│  │     - Convert blob to base64 for API use                                  │   │
│  │                                                                           │   │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  MEMORY CLEANUP                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    revokeConversationUrls()                               │   │
│  │                                                                           │   │
│  │  window.pinnedObjectUrls.forEach(url => URL.revokeObjectURL(url))         │   │
│  │  window.pinnedObjectUrls.clear()                                          │   │
│  │                                                                           │   │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Window API

The chat store uses several window properties for cross-module communication and debugging:

| Property                              | Type          | Purpose                                                           |
| ------------------------------------- | ------------- | ----------------------------------------------------------------- |
| `window.__debugStream`                | `boolean`     | Enable verbose NDJSON stream logging                              |
| `window.pinnedObjectUrls`             | `Set<string>` | Tracks object URLs for cleanup on conversation switch             |
| `window.onDotMatrixAIResponseStart()` | `() => void`  | Hook called when AI starts responding (triggers particle effects) |
| `window.onDotMatrixAIResponseEnd()`   | `() => void`  | Hook called when AI stops responding                              |
| `window.lastImageAt`                  | `number`      | Timestamp of the most recent image (user or assistant)            |
| `window.__holdAttachmentsForNudge`    | `boolean`     | Flag to prevent clearing attachments during nudge resubmission    |

**Usage examples:**

```typescript
// Enable stream debugging
window.__debugStream = true;

// Check when last image was processed
console.log('Last image:', new Date(window.lastImageAt));

// Prevent attachment clearing during nudge
window.__holdAttachmentsForNudge = true;
```

### Image Edit Detection

The `looksLikeImageEdit()` function detects when a user prompt implies image editing:

```typescript
// Detected patterns:
// - Resize: "enlarge", "upscale", "4k", "2x"
// - Geometry: "crop", "rotate", "flip", "extend canvas"
// - Enhance: "sharpen", "denoise", "brighten"
// - Object manipulation: "remove hat", "add glasses", "change background"
```

---

## Conversation Persistence

### Storage Strategy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CONVERSATION STORAGE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  IndexedDB Tables:                                                               │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  conversations                                                           │    │
│  │  ├── id: string (UUID)                                                   │    │
│  │  ├── title: string                                                       │    │
│  │  ├── provider: Provider                                                  │    │
│  │  ├── model: string                                                       │    │
│  │  ├── createdAt: number                                                   │    │
│  │  └── updatedAt: number (auto-updated on touch)                           │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  messages                                                                │    │
│  │  ├── id: string (UUID)                                                   │    │
│  │  ├── conversationId: string (FK)                                         │    │
│  │  ├── sender: 'user' | 'assistant'                                        │    │
│  │  ├── text: string                                                        │    │
│  │  ├── createdAt: number                                                   │    │
│  │  ├── editedAt?: number                                                   │    │
│  │  └── imageRefs?: StoredImageRef[]                                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  blobs                                                                   │    │
│  │  ├── hash: string (content hash - primary key)                           │    │
│  │  ├── mimeType: string                                                    │    │
│  │  └── data: Blob                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Pruning: MAX_CONVERSATIONS = 20                                                 │
│  Oldest conversations beyond limit are auto-deleted with their messages          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Server History Sync

When loading a conversation, message history is synced to the backend:

```typescript
// Sync up to MAX_SYNC_MESSAGES (40) most recent messages
await syncServerHistoryFromRows(orderedMessages);

// If no messages, clear server history
await fetch('/api/thread/clear', { method: 'POST', body: { provider } });
```

---

## Configuration Reference

### Constants (utils.ts)

| Constant            | Value      | Description                                 |
| ------------------- | ---------- | ------------------------------------------- |
| `MAX_CONVERSATIONS` | 20         | Maximum stored conversations before pruning |
| `MAX_SYNC_MESSAGES` | 40         | Maximum messages to sync to server history  |
| `TITLE_FALLBACK`    | "New chat" | Default title for new conversations         |

### Image Processing (images.ts)

| Setting               | Value                                            | Description                               |
| --------------------- | ------------------------------------------------ | ----------------------------------------- |
| `ALLOWED_IMAGE_TYPES` | `Set(['image/png', 'image/jpeg', 'image/webp'])` | Accepted MIME types                       |
| Min base64 length     | 100 chars                                        | Validation threshold for converted images |

### Provider Defaults (provider.ts)

| Provider     | Default Model               |
| ------------ | --------------------------- |
| `openai`     | `gpt-5.2`                   |
| `anthropic`  | `claude-sonnet-4-5`         |
| `gemini`     | `gemini-3-flash-preview`    |
| `lmstudio`   | `local-model`               |
| `openrouter` | `xiaomi/mimo-v2-flash:free` |

### API Key Validation (provider.ts)

| Provider | Pattern                      |
| -------- | ---------------------------- |
| Gemini   | `/^AIza[0-9A-Za-z_-]{20,}$/` |

### Debug and Local Development

| Setting           | Storage Key               | Description                                               |
| ----------------- | ------------------------- | --------------------------------------------------------- |
| Debug Keys        | `localStorage.DEBUG_KEYS` | Log API key presence for debugging                        |
| LMStudio Base URL | `lmstudio:baseUrl`        | Local model server URL (default: `http://localhost:1234`) |

---

## Failure Modes

### Error Handling Matrix

| Scenario                    | Behavior                                  | Detection                        |
| --------------------------- | ----------------------------------------- | -------------------------------- |
| **No API key**              | Request fails, "Request failed." appended | Check stored keys before send    |
| **AbortError**              | Silently ignored (user cancelled)         | `err.name === 'AbortError'`      |
| **Stream parse error**      | Malformed chunk skipped, continues        | Try-catch around JSON.parse      |
| **Image conversion fail**   | Skipped with warning, continues           | `errors` count in result         |
| **Unsupported image type**  | Skipped with info message                 | `skipped` count in result        |
| **HTTP error**              | Error message appended to chat            | `!resp.ok` check                 |
| **Blob storage fail**       | Console warning, message still saved      | Try-catch, best-effort           |
| **Object URL revoke fail**  | Silently ignored                          | Try-catch, silent                |
| **Intermediate done event** | Ignored when tool activity pending        | `hasToolActivity && !hasContent` |
| **Image MIME fallback**     | Defaults to `image/png` if missing        | Silent fallback                  |
| **Image-only message**      | Merged with previous same-sender message  | No new message created           |

### Debugging Checklist

1. **Message not sending?**
   - Check `sending.value` isn't stuck true
   - Check `pickApiKey(provider)` returns a key
   - Check network tab for failed requests

2. **Streaming not working?**
   - Check response content-type includes `ndjson`
   - Enable `window.__debugStream = true` for logs
   - Check `streaming.active` state

3. **Images not showing?**
   - Check object URL creation succeeded
   - Verify blob was stored: `storage.blobs.get(hash)`
   - Check `window.pinnedObjectUrls` contains URL

4. **Conversation not loading?**
   - Verify conversation exists: `storage.conversations.get(id)`
   - Check messages indexed by conversationId
   - Look for console warnings about blob retrieval

5. **Provider not working?**
   - Enable `localStorage.DEBUG_KEYS = 'true'`
   - Check dispatched request body in network tab
   - Verify `pickProvider()` returns expected value

---

## Code Examples

### Basic Message Send

```typescript
import { useChatStore } from '@web/stores/chat';

const chatStore = useChatStore();

// Send a text message
await chatStore.send('What is the weather like?');

// Access messages
console.log(chatStore.messages); // Array of ChatMessage
```

### Working with Images

```typescript
import { useChatStore } from '@web/stores/chat';
import { useFileAttachments } from '@web/composables/useFileAttachments';

const chatStore = useChatStore();
const { addFile, getFilesForSubmit, clearAttachments } = useFileAttachments();

// Add an image attachment
addFile(imageFile);

// Send with the attachment
await chatStore.send('What is in this image?');

// The composable auto-clears after send unless nudge is pending
```

### Loading a Conversation

```typescript
import { useChatStore } from '@web/stores/chat';

const chatStore = useChatStore();

// List available conversations
const conversations = await chatStore.listConversations();

// Load a specific conversation
const success = await chatStore.loadConversation(conversations[0].id);

if (success) {
  console.log('Loaded', chatStore.messages.length, 'messages');
}
```

### Handling Streaming State

```vue
<script setup lang="ts">
import { useChatStore } from '@web/stores/chat';
import { computed } from 'vue';

const chatStore = useChatStore();

// Show streaming text in real-time
const displayText = computed(() => {
  if (chatStore.streaming.active) {
    return chatStore.streaming.buffer;
  }
  const lastMsg = chatStore.messages[chatStore.messages.length - 1];
  return lastMsg?.text || '';
});
</script>

<template>
  <div>
    <div v-if="chatStore.streaming.active" class="streaming">
      {{ displayText }}
      <span class="cursor">▌</span>
    </div>
    <button @click="chatStore.stop()" v-if="chatStore.streaming.active">Stop</button>
  </div>
</template>
```

### Switching Providers

```typescript
import { pickProvider, pickModel, pickApiKey } from '@web/stores/chat';
import { storage } from '@web/storage/storage';

// Get current provider
const provider = pickProvider(); // 'openai' | 'gemini' | etc.

// Switch provider
await storage.mirror.set('llmProvider', 'gemini');

// Get model for new provider
const model = pickModel('gemini'); // 'gemini-3-flash-preview'
```

---

## File Reference

| File                                       | Lines  | Purpose                                                |
| ------------------------------------------ | ------ | ------------------------------------------------------ |
| `web/stores/chat.ts`                       | ~1,200 | Main Pinia store orchestrating all chat functionality  |
| `web/stores/chat/provider.ts`              | ~100   | API key retrieval, provider/model selection            |
| `web/stores/chat/transport.ts`             | ~218   | Socket.IO connection, fetch with abort control         |
| `web/stores/chat/streaming.ts`             | ~369   | NDJSON stream parsing, tool progress tracking          |
| `web/stores/chat/conversation.ts`          | ~461   | Conversation CRUD, persistence, image blob handling    |
| `web/stores/chat/images.ts`                | ~227   | Base64/blob conversion, image validation               |
| `web/stores/chat/utils.ts`                 | ~74    | UUID generation, citation normalization, notifications |
| `web/stores/chat/gameLauncher.ts`          | ~73    | Game launch detection from user input                  |
| `web/stores/chat/imageProcessing.ts`       | ~102   | Attachment to base64 conversion wrapper                |
| `web/stores/chat/dispatchers/index.ts`     | ~22    | Re-export barrel for dispatchers                       |
| `web/stores/chat/dispatchers/openai.ts`    | ~124   | OpenAI request building                                |
| `web/stores/chat/dispatchers/nonOpenai.ts` | ~126   | Non-OpenAI provider request building                   |

---

## Reference Mapping

| Doc Claim                      | Source of Truth             | Location                           |
| ------------------------------ | --------------------------- | ---------------------------------- |
| ChatMessage interface          | Type definition             | `web/types/chat.ts`                |
| Streaming buffer normalization | `normalizeCitations()`      | `utils.ts:37-44`                   |
| MAX_CONVERSATIONS constant     | Constant export             | `utils.ts:60`                      |
| MAX_SYNC_MESSAGES constant     | Constant export             | `utils.ts:61`                      |
| ALLOWED_IMAGE_TYPES            | Set definition              | `images.ts:133`                    |
| Gemini key regex               | GEMINI_KEY_REGEX            | `provider.ts:9`                    |
| Default models by provider     | `pickModel()` fallbacks     | `provider.ts:79-85`                |
| Stream event routing           | Switch in pump loop         | `streaming.ts:175-288`             |
| Tool progress map              | Module-level Map            | `streaming.ts:18`                  |
| Object URL pinning             | Window property             | `streaming.ts:260-264`             |
| Conversation pruning           | `pruneOldConversations()`   | `conversation.ts:73-100`           |
| Message persistence with blobs | `persistMessageToStorage()` | `conversation.ts:209-264`          |
| Blob restoration on load       | `loadConversation()`        | `conversation.ts:354-442`          |
| Game detection patterns        | `checkGameLaunchRequest()`  | `gameLauncher.ts:42-72`            |
| OpenAI text request builder    | `buildOpenAITextRequest()`  | `dispatchers/openai.ts:51-70`      |
| Non-OpenAI request builder     | `buildNonOpenAIRequest()`   | `dispatchers/nonOpenai.ts:48-91`   |
| Nudge HTML generation          | `handleNudgeResponse()`     | `dispatchers/nonOpenai.ts:108-125` |

---

## Changelog

- **v1.0** - Initial monolithic chat store
- **v2.0** - Modularized into separate files for maintainability
- **v2.1** - Added image blob persistence to IndexedDB
- **v2.2** - Added multi-provider support (Anthropic, Gemini, OpenRouter)
- **v2.3** - Added NDJSON streaming for non-OpenAI providers
- **v2.4** - Added tool progress tracking and notifications
- **v2.5** - Added moodboard image support
- **v2.6** - Added conversation pruning (MAX_CONVERSATIONS limit)
- **v2.7** - Added object URL cleanup on conversation switch
- **v2.8** - Documentation created following template
- **v2.9** - Documentation expanded with internal state, window APIs, and additional config options

---

_Last verified: 2026-02-23_
