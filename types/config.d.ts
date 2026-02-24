/**
 * Configuration type definitions
 */

import type { Provider } from './adapters';

// Default configuration structure
export interface DefaultsConfig {
  provider: Provider;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

// Provider capabilities configuration
export interface CapabilitiesConfig {
  [provider: string]: {
    streaming: boolean;
    tools: boolean;
    vision: boolean;
    reasoning: boolean;
    maxTokens: number;
    models: string[];
  };
}

// App settings (client-side)
export interface AppSettings {
  theme: string;
  themeOrder: string[];
  fontSize: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  modelPreferences: Record<Provider, string>;
}

// Environment configuration
export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  SESSION_SECRET: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

// MCP configuration
export interface MCPConfig {
  name: string;
  version: string;
  description: string;
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
  };
}
