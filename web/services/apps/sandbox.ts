/**
 * Sandbox Creation Service
 *
 * Creates sandboxed iframes with CSP injection for isolated app execution.
 * Iframes use sandbox="allow-scripts" only (NEVER allow-same-origin).
 * CSP meta tag blocks all network access, forcing data through the bridge.
 */

import type { AppInstance } from '@web/types/apps';
import { getUIKitCSS, getUIKitJS } from './uikit/index.js';

export const CSP_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src blob: data:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

/**
 * Minimal base styles injected into every iframe.
 * Theme colors are applied dynamically by the SDK (bridgeSDK.ts) on
 * theme:update — it appends a <style> to body with higher specificity.
 */
const BASE_STYLES = 'body{margin:0}';

/**
 * Build the complete srcdoc string for a sandboxed iframe.
 *
 * LLM-generated apps are complete HTML documents (<!DOCTYPE html><html>...).
 * We inject CSP, base theme styles, and SDK into the app's existing <head>
 * to avoid nested document structures that break script and style scoping.
 *
 * If the app has no <head> tag, we wrap it in a complete document.
 *
 * Injection order (all in <head>):
 *   1. CSP meta tag (security boundary)
 *   2. UI Kit CSS (fonts, foundation, layout, components, interactive, media)
 *   3. Base styles (body margin reset)
 *   4. Bridge SDK script (establishes window.prvctice)
 *   5. UI Kit JS (extends window.prvctice.ui with component initializers)
 */
export function buildSrcdoc(html: string, sdkSource: string): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
  const uikitStyles = `<style id="prvctice-uikit">${getUIKitCSS()}</style>`;
  const baseStyles = `<style>${BASE_STYLES}</style>`;
  const sdkScript = `<script>${sdkSource}</` + 'script>';
  const uikitScript = `<script>${getUIKitJS()}</` + 'script>';
  const injection = cspMeta + uikitStyles + baseStyles + sdkScript + uikitScript;

  // Inject after the opening <head> tag if present (case-insensitive)
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + injection + html.slice(idx);
  }

  // No <head> tag — wrap in a full document
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
}

export interface CreateSandboxOptions {
  readonly appId: string;
  readonly html: string;
  readonly sdkSource: string;
  readonly nonce?: string;
  readonly permissions?: readonly string[];
}

/**
 * Create a sandboxed iframe for running an HTML app.
 *
 * The iframe is created with sandbox="allow-scripts" only.
 * CSP meta tag is injected to block all network access.
 * SDK source is prepended before app HTML.
 *
 * The returned AppInstance is not yet attached to the DOM --
 * the caller must append iframe to a container element.
 */
export function createSandbox(options: CreateSandboxOptions): AppInstance {
  const nonce = options.nonce ?? crypto.randomUUID();
  const instanceId = crypto.randomUUID();

  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-scripts');
  // NEVER add 'allow-same-origin' -- with both flags, iframe can remove its own sandbox
  // Only grant microphone/camera iframe permissions when the app declares them
  const allows = ['autoplay'];
  if (options.permissions?.includes('media:microphone')) allows.push('microphone');
  if (options.permissions?.includes('media:camera')) allows.push('camera');
  iframe.allow = allows.join('; ');
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.srcdoc = buildSrcdoc(options.html, options.sdkSource);

  return {
    instanceId,
    appId: options.appId,
    nonce,
    iframe,
    handshakeComplete: false,
    pending: new Map(),
    createdAt: Date.now(),
    grantedPermissions: new Set(),
    themeSubscribed: false,
    exportedActionIds: [],
  };
}

/**
 * Destroy a sandboxed app instance.
 *
 * Rejects all pending bridge requests, clears the pending map,
 * and removes the iframe from the DOM.
 */
export function destroySandbox(instance: AppInstance): void {
  // Reject all pending requests
  for (const [requestId, pending] of instance.pending) {
    clearTimeout(pending.timeoutId);
    pending.reject({ code: 'TIMEOUT', message: 'App closed' });
    instance.pending.delete(requestId);
  }

  // Remove iframe from DOM if attached
  if (instance.iframe.parentNode) {
    instance.iframe.parentNode.removeChild(instance.iframe);
  }
}
