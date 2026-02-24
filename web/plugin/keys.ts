// Injection keys for the Prvctice Vue plugin
// Consumers can import these to provide/override behaviors.

import type { InjectionKey } from 'vue';

// Type definitions for injection values
export interface PrvcticeConfig {
  apiBase: string;
  features: {
    domHooks?: boolean;
  };
  socketFactory?: () => unknown;
  fetchImpl?: typeof fetch;
  markdownRenderer?: (markdown: string) => string;
  sanitizeHtml?: (html: string) => string;
}

export type MarkdownRenderer = (markdown: string) => string;
export type HtmlSanitizer = (html: string) => string;
export type SocketFactory = () => unknown;
export type FetchImpl = typeof fetch;

export const PRVCTICE_CONFIG: InjectionKey<PrvcticeConfig> = Symbol('PRVCTICE_CONFIG');
export const PRVCTICE_MARKDOWN_RENDERER: InjectionKey<MarkdownRenderer | undefined> = Symbol(
  'PRVCTICE_MARKDOWN_RENDERER'
);
export const PRVCTICE_SANITIZE_HTML: InjectionKey<HtmlSanitizer | undefined> =
  Symbol('PRVCTICE_SANITIZE_HTML');
export const PRVCTICE_SOCKET_FACTORY: InjectionKey<SocketFactory | undefined> =
  Symbol('PRVCTICE_SOCKET_FACTORY');
export const PRVCTICE_FETCH_IMPL: InjectionKey<FetchImpl | undefined> =
  Symbol('PRVCTICE_FETCH_IMPL');

export default {
  PRVCTICE_CONFIG,
  PRVCTICE_MARKDOWN_RENDERER,
  PRVCTICE_SANITIZE_HTML,
  PRVCTICE_SOCKET_FACTORY,
  PRVCTICE_FETCH_IMPL,
};
