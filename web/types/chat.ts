/**
 * Chat module type definitions
 * Types shared across chat store modules
 */

/** LLM Provider identifiers */
export type Provider = 'anthropic' | 'gemini' | 'google' | 'openrouter' | 'lmstudio';

/** API provider identifiers (includes non-LLM providers) */
export type ApiProvider = Provider | 'discogs' | 'youtube';

/** Message sender role */
export type MessageSender = 'user' | 'assistant' | 'system';

/** Image source kind */
export type ImageKind = 'user' | 'assistant' | 'moodboard';

/** Image reference for storage (stores blob hash, not data) */
export interface StoredImageRef {
  blobHash: string; // SHA-256 hash (key in OPFS blobs store)
  mimeType: string; // e.g., 'image/png'
  kind: ImageKind;
}

/** Notification kind */
export type NotificationKind = 'info' | 'success' | 'error' | 'warning';

/** Tool progress phases */
export type ToolPhase = 'started' | 'completed' | 'error';

/** Chat message in the store */
export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  createdAt: number;
  editedAt?: number;
  images?: ImageEntry[];
  loadedSkills?: string[];
  condensedSkills?: string[];
}

/** Image entry for display in chat */
export interface ImageEntry {
  src: string;
  kind: ImageKind;
  mimeType?: string;
  prompt?: string;
  model?: string;
  provider?: string;
  downloadName?: string;
  timestamp?: number;
  source?: string;
  imageId?: string;
  base64?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  artist?: string;
  date?: string;
}

/** Assistant image entry (generated/streamed images) */
export interface AssistantImageEntry extends ImageEntry {
  kind: 'assistant';
}

/** Moodboard image from external sources */
export interface MoodboardImage {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  sourceUrl?: string;
  artist?: string;
  date?: string;
}

/** Moodboard payload from stream */
export interface MoodboardPayload {
  images: MoodboardImage[];
  sources: string[];
  intent: string;
}

/** Book result from stream */
export interface BookResultItem {
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  publishYear: number | null;
  source: string;
  sourceUrl: string;
  isbn: string | null;
}

/** Essay result from stream */
export interface EssayResultItem {
  title: string;
  authors: string[];
  abstract: string;
  citationCount: number;
  year: number | null;
  isOpenAccess: boolean;
  pdfUrl: string | null;
  source: string;
  sourceUrl: string;
}

/** Book results payload from stream */
export interface BookResultsPayload {
  books: BookResultItem[];
  sources: string[];
}

/** Essay results payload from stream */
export interface EssayResultsPayload {
  essays: EssayResultItem[];
}

/** Film result from stream */
export interface FilmResultItem {
  tmdbId: number;
  title: string;
  year: number;
  posterUrl: string | null;
  synopsis: string;
  director: string;
  cinematographer: string;
  composer: string;
  writer: string;
  tmdbUrl: string;
  letterboxdUrl: string;
  matchNote?: string;
}

/** Film results payload from stream */
export interface FilmResultsPayload {
  films: FilmResultItem[];
  matchNotes: string[];
}

/** Conversation record in storage */
export interface Conversation {
  id: string;
  title: string;
  provider: Provider;
  model: string;
  createdAt: number;
  updatedAt?: number;
}

/** Message record in storage */
export interface StoredMessage {
  id: string;
  conversationId: string;
  sender: MessageSender;
  text: string;
  createdAt: number;
  editedAt?: number;
  imageRefs?: StoredImageRef[]; // References to persisted image blobs
}

/** Streaming state */
export interface StreamingState {
  active: boolean;
  buffer: string;
}

/** Nudge for provider switching */
export interface Nudge {
  type: 'ocr_provider' | string;
  message: string;
  suggested_provider?: string;
}

/** Tool progress event */
export interface ToolProgressEvent {
  id?: string;
  phase?: ToolPhase;
  name?: string;
}

/** Tool result event */
export interface ToolResultEvent {
  status?: 'error' | 'note' | 'success';
  summary?: string;
}

/** Stream event types */
export interface StreamEvent {
  type:
    | 'delta'
    | 'done'
    | 'tool_call'
    | 'tool_progress'
    | 'tool_result'
    | 'image'
    | 'moodboard'
    | 'book_results'
    | 'essay_results'
    | 'film_results'
    | 'web_search_status'
    | 'web_search_error'
    | 'skills_loaded'
    | 'error';
  content?: string;
  data?: string;
  mimeType?: string;
  filename?: string;
  images?: MoodboardImage[];
  books?: BookResultItem[];
  essays?: EssayResultItem[];
  films?: FilmResultItem[];
  matchNotes?: string[];
  sources?: string[];
  intent?: string;
  message?: string;
  id?: string;
  phase?: ToolPhase;
  name?: string;
  status?: string;
  summary?: string;
  code?: string;
  action?: string;
  skills?: string[];
  condensed?: string[];
}

/** Skills loaded payload from stream */
export interface SkillsLoadedPayload {
  skills: string[];
  condensed: string[];
}

/** Streaming response handlers */
export interface StreamHandlers {
  onChunk?: (content: string) => void;
  onDone?: () => void;
  onImage?: (entry: AssistantImageEntry) => void;
  onMoodboard?: (payload: MoodboardPayload) => void;
  onBookResults?: (payload: BookResultsPayload) => void;
  onEssayResults?: (payload: EssayResultsPayload) => void;
  onFilmResults?: (payload: FilmResultsPayload) => void;
  onSkillsLoaded?: (payload: SkillsLoadedPayload) => void;
  onError?: (error: string) => void;
  notify?: (kind: NotificationKind, message: string) => void;
}

/** Streaming context */
export interface StreamContext {
  text?: string;
  model?: string;
}

/** Socket event handlers */
export interface SocketHandlers {
  onUpdate?: (chunk: string) => void;
  onFinal?: (data: Record<string, unknown>) => void;
  onError?: (error: string) => void;
  onHideThinking?: () => void;
}

/** Image conversion options */
export interface ImageConversionOptions {
  onConverted?: (img: { data: string; mimeType: string }) => void;
  verbose?: boolean;
}

/** Image conversion result */
export interface ImageConversionResult {
  images: Array<{ data: string; mimeType: string }>;
  skipped: number;
  errors: number;
}

/** Image metadata for building entries */
export interface ImageMetadata {
  mimeType?: string;
  prompt?: string;
  model?: string;
  provider?: string;
  downloadName?: string;
  timestamp?: number;
  source?: string;
  imageId?: string;
  base64?: string;
}

/** Last image state for Pinia store */
export interface LastImageState {
  base64: string | null;
  mimeType: string | null;
  url: string | null;
}

/** Load conversation options */
export interface LoadConversationOptions {
  limit?: number;
  syncServer?: boolean;
}

// Window extensions are now centralized in global.d.ts
// This file only exports chat-related types

export {};
