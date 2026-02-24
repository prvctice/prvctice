/**
 * Pinia store type definitions
 */

import type { ChatMessage } from './chat';
import type { Provider } from './adapters';

// Conversation metadata
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  provider?: Provider;
  model?: string;
}

// Chat store state
export interface ChatState {
  conversations: Map<string, Conversation>;
  activeConversationId: string | null;
  isStreaming: boolean;
  streamBuffer: string;
  error: string | null;
}

// Provider store state
export interface ProviderState {
  provider: Provider;
  model: string;
  availableModels: string[];
  capabilities: ProviderCapabilities;
}

// Provider capabilities (from config/capabilities.json)
export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  maxTokens: number;
}

// Config store state
export interface ConfigState {
  theme: string;
  fontSize: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

// Menu action types
export interface MenuAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
}

// Image modal state
export interface ImageModalState {
  isOpen: boolean;
  imageUrl: string | null;
  altText: string | null;
}
