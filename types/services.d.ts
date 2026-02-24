/**
 * Service layer type definitions
 */

import type { Provider, AdapterConfig, LLMAdapter } from './adapters';

// Intent classification
export interface IntentResult {
  task: string;
  confidence: number;
  top: Array<{ task: string; score: number }>;
  schema_version: string;
}

// Factory interface
export interface LLMProviderFactory {
  createAdapter(provider: Provider, apiKey: string, options?: Partial<AdapterConfig>): LLMAdapter;
  getAvailableProviders(): Provider[];
}

// Vision service
export interface VisionResult {
  description: string;
  labels?: string[];
  objects?: Array<{ name: string; confidence: number }>;
}

// YouTube service
export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

// Wikipedia service
export interface WikipediaSearchResult {
  title: string;
  snippet: string;
  pageid: number;
  url: string;
}

// TMDB service
export interface TMDBSearchResult {
  id: number;
  title: string;
  overview: string;
  releaseDate: string;
  posterPath: string | null;
  voteAverage: number;
}

// Request routing
export interface RouteResult {
  provider: Provider;
  model: string;
  reason: string;
}

// System prompt context
export interface SystemPromptContext {
  timestamp: string;
  timezone: string;
  capabilities: string[];
  tools: string[];
}
