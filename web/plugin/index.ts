// Prvctice Vue plugin: registers directives and provides runtime config
// for composables/stores to consume without hard-coding globals.

import type { App, Directive } from 'vue';
import type { Pinia } from 'pinia';
import { magnet as vMagnet } from '@web/directives/magnet.js';
import {
  PRVCTICE_CONFIG,
  PRVCTICE_MARKDOWN_RENDERER,
  PRVCTICE_SANITIZE_HTML,
  PRVCTICE_SOCKET_FACTORY,
  PRVCTICE_FETCH_IMPL,
} from '@web/plugin/keys.js';
import { setConfig as _setConfig } from '@web/stores/config.js';

// Types
type MarkdownRenderer = (markdown: string) => string;
type HtmlSanitizer = (html: string) => string;
type SocketFactory = () => unknown;
type FetchImpl = typeof fetch;

interface PluginFeatures {
  domHooks?: boolean;
}

interface PluginOptions {
  apiBase?: string;
  features?: PluginFeatures;
  socketFactory?: SocketFactory;
  fetchImpl?: FetchImpl;
  markdownRenderer?: MarkdownRenderer;
  sanitizeHtml?: HtmlSanitizer;
  installPinia?: boolean;
  pinia?: Pinia;
}

interface NormalizedConfig {
  apiBase: string;
  features: PluginFeatures;
  socketFactory?: SocketFactory;
  fetchImpl?: FetchImpl;
  markdownRenderer?: MarkdownRenderer;
  sanitizeHtml?: HtmlSanitizer;
}

// Extend window for vendor libs
declare global {
  interface Window {
    API_BASE_URL?: string;
    prvctice?: { apiBaseUrl?: string };
    marked?: { parse: (markdown: string) => string };
    DOMPurify?: { sanitize: (html: string) => string };
  }
}

function readWindowApiBase(): string {
  try {
    if (typeof window !== 'undefined') {
      return window.API_BASE_URL || (window.prvctice && window.prvctice.apiBaseUrl) || '';
    }
  } catch (_) {}
  return '';
}

function readDefaultMarkdownRenderer(): MarkdownRenderer | undefined {
  try {
    if (
      typeof window !== 'undefined' &&
      window.marked &&
      typeof window.marked.parse === 'function'
    ) {
      return window.marked.parse.bind(window.marked);
    }
  } catch (_) {}
  return undefined;
}

function readDefaultSanitizer(): HtmlSanitizer | undefined {
  try {
    if (
      typeof window !== 'undefined' &&
      window.DOMPurify &&
      typeof window.DOMPurify.sanitize === 'function'
    ) {
      return window.DOMPurify.sanitize.bind(window.DOMPurify);
    }
  } catch (_) {}
  return undefined;
}

function normalizeOptions(options: PluginOptions = {}): Readonly<NormalizedConfig> {
  const apiBase = typeof options.apiBase === 'string' ? options.apiBase : readWindowApiBase();
  const features: PluginFeatures = {
    domHooks:
      options.features && typeof options.features.domHooks === 'boolean'
        ? options.features.domHooks
        : true,
  };
  const socketFactory =
    typeof options.socketFactory === 'function' ? options.socketFactory : undefined;
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : undefined;
  const markdownRenderer =
    typeof options.markdownRenderer === 'function'
      ? options.markdownRenderer
      : readDefaultMarkdownRenderer();
  const sanitizeHtml =
    typeof options.sanitizeHtml === 'function' ? options.sanitizeHtml : readDefaultSanitizer();
  return Object.freeze({
    apiBase,
    features,
    socketFactory,
    fetchImpl,
    markdownRenderer,
    sanitizeHtml,
  });
}

export function createPrvcticePlugin(options: PluginOptions = {}) {
  const normalized = normalizeOptions(options);
  return {
    install(app: App): void {
      // Optional Pinia install for consumers that pass it
      try {
        if (options.installPinia && options.pinia && typeof app.use === 'function') {
          app.use(options.pinia);
        }
      } catch (_) {}

      // Register directives
      try {
        app.directive('magnet', vMagnet as Directive);
      } catch (_) {}

      // Provide config + helpers
      try {
        app.provide(PRVCTICE_CONFIG, normalized);
        app.provide(PRVCTICE_MARKDOWN_RENDERER, normalized.markdownRenderer);
        app.provide(PRVCTICE_SANITIZE_HTML, normalized.sanitizeHtml);
        app.provide(PRVCTICE_SOCKET_FACTORY, normalized.socketFactory);
        app.provide(PRVCTICE_FETCH_IMPL, normalized.fetchImpl);
      } catch (_) {}

      // Store a copy for modules that import outside of setup()
      try {
        _setConfig(normalized as unknown as Parameters<typeof _setConfig>[0]);
      } catch (_) {}
    },
  };
}

// Re-export the directive for direct registration when not using the plugin
export { vMagnet };
