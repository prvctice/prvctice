/**
 * prvctice SDK Type Declarations
 *
 * Describes the window.prvctice API available inside sandboxed app iframes.
 * The SDK is injected automatically -- apps just use window.prvctice.*.
 *
 * This file serves two purposes:
 * 1. Documents the API contract for our own development
 * 2. Future distribution to external app developers
 */

import type { ThemeColors } from '@web/types/apps';

export interface PrvcticeSDK {
  /**
   * Register a callback to run when the bridge handshake completes.
   * If called after handshake, the callback fires immediately.
   * Late registrations are safe -- the callback always fires.
   */
  onReady(callback: () => void): void;

  /** Key-value storage scoped to the app. */
  storage: {
    /** Get a value by key. Returns undefined if the key does not exist. */
    get<T = unknown>(key: string): Promise<T | undefined>;
    /** Set a value by key. Overwrites any existing value. */
    set(key: string, value: unknown): Promise<void>;
    /** Delete a key. No-op if the key does not exist. */
    delete(key: string): Promise<void>;
  };

  /** Theme integration for matching the host appearance. */
  theme: {
    /** Get the current theme colors. */
    get(): Promise<ThemeColors>;
    /** Subscribe to theme changes. Returns an unsubscribe function. */
    onChange(callback: (theme: ThemeColors) => void): () => void;
  };

  /** Window management for the app's container. */
  window: {
    /** Request a resize of the app window. */
    resize(width: number, height: number): void;
    /** Set the app window title. */
    setTitle(title: string): void;
    /** Subscribe to focus/blur events. Returns an unsubscribe function. */
    onFocus(callback: (focused: boolean) => void): () => void;
    /** Subscribe to the close event. Returns an unsubscribe function. */
    onClose(callback: () => void): () => void;
  };
}

export interface BridgeError extends Error {
  code:
    | 'PERMISSION_DENIED'
    | 'TIMEOUT'
    | 'INVALID_REQUEST'
    | 'CONNECTOR_ERROR'
    | 'PLATFORM_UNSUPPORTED';
}

// Note: The global Window augmentation for prvctice is declared in
// web/plugin/index.ts for the host context. Inside sandboxed iframes,
// window.prvctice is set by the injected SDK at runtime.
// This file documents the SDK contract without augmenting Window to
// avoid conflicts with the host-side declaration.
