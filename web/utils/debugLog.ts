/**
 * Debug logging utility
 * Provides conditional logging that can be enabled per-category via window flags
 *
 * Usage:
 *   import { debugWarn, debugLog, logError } from '@web/utils/debugLog.js';
 *   debugWarn('chat', 'streaming', new Error('connection failed'));
 *   logError('chat', 'transport:sendMessage', new Error('network failure')); // Always logs
 *
 * Enable in browser console:
 *   window.__debugChat = true;    // Enable chat category
 *   window.__debugAll = true;     // Enable all categories
 *
 * Available functions:
 *   - logError: UNCONDITIONAL error logging (always logs to console.error)
 *   - debugWarn: Conditional warning logging (requires debug flag)
 *   - debugLog: Conditional debug logging (requires debug flag)
 */

// Extend window for debug flags
declare global {
  interface Window {
    __debugAll?: boolean;
    __debugChat?: boolean;
    __debugSpeech?: boolean;
    __debugDotmatrix?: boolean;
    __debugStorage?: boolean;
    __debugTheme?: boolean;
    __debugStream?: boolean;
    __debugBridge?: boolean;
    __debugImage?: boolean;
    __debugSkills?: boolean;
    __debugKeys?: boolean;
    __debugHandtrack?: boolean;
    __debugGamepad?: boolean;
    __DOTMATRIX_DEBUG?: boolean;
    [key: `__debug${string}`]: boolean | undefined;
  }
}

/**
 * Colors for each debug channel - visually distinguishable in browser console
 */
const CHANNEL_COLORS: Record<string, string> = {
  chat: '#4CAF50', // green
  stream: '#2196F3', // blue
  speech: '#FF9800', // orange
  skills: '#9C27B0', // purple
  dotmatrix: '#00BCD4', // cyan
  handtrack: '#E91E63', // pink
  gamepad: '#795548', // brown
  storage: '#607D8B', // blue-grey
  theme: '#FF5722', // deep orange
  image: '#009688', // teal
  bridge: '#673AB7', // deep purple
  keys: '#FFC107', // amber
  default: '#9E9E9E', // grey
};

/**
 * Log an error message unconditionally (not gated by debug flags).
 * Use for errors that should always be visible in the console.
 */
export function logError(category: string, context: string, error: Error | string): void {
  try {
    const prefix = `[${category}:${context}]`;
    if (error instanceof Error) {
      console.error(prefix, error.message, error);
    } else {
      console.error(prefix, error);
    }
  } catch (_) {
    // Silent fail - we don't want error logging to break the app
  }
}

/**
 * Log a warning message if debug is enabled for the category
 */
export function debugWarn(category: string, context: string, error: Error | string): void {
  try {
    if (!isDebugEnabled(category)) return;
    const color = CHANNEL_COLORS[category] || CHANNEL_COLORS.default;
    const prefix = `%c[${category}:${context}]`;
    const style = `color: ${color}; font-weight: bold`;
    if (error instanceof Error) {
      console.warn(prefix, style, error.message, error);
    } else {
      console.warn(prefix, style, error);
    }
  } catch (_) {
    // Silent fail - we don't want debug logging to break the app
  }
}

/**
 * Log a debug message if debug is enabled for the category
 */
export function debugLog(category: string, context: string, ...args: unknown[]): void {
  try {
    if (!isDebugEnabled(category)) return;
    const color = CHANNEL_COLORS[category] || CHANNEL_COLORS.default;
    // Use console.log instead of console.debug so output shows without Verbose level
    console.log(`%c[${category}:${context}]`, `color: ${color}; font-weight: bold`, ...args);
  } catch (_) {
    // Silent fail
  }
}

/**
 * Check if debug is enabled for a category
 */
export function isDebugEnabled(category: string): boolean {
  try {
    if (typeof window === 'undefined') return false;

    // Global debug flag enables all categories
    if (window.__debugAll === true) return true;

    // Category-specific flag (e.g., __debugChat, __debugSpeech)
    const flagName = `__debug${capitalize(category)}` as keyof Window;
    if ((window as Window)[flagName] === true) return true;

    // Legacy flags compatibility
    if (category === 'stream' && window.__debugStream === true) return true;
    if (category === 'dotmatrix' && window.__DOTMATRIX_DEBUG === true) return true;

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Available debug categories:
 * - chat: Chat store operations, message handling
 * - speech: Voice input/output
 * - dotmatrix: 3D animation background
 * - storage: IndexedDB/localStorage operations
 * - theme: Theme switching
 * - stream: Streaming response handling
 * - bridge: Vue-to-legacy bridge operations
 * - image: Image processing
 * - skills: Skill coordinator, physics, storage
 * - keys: Keyboard input handling
 * - handtrack: Hand tracking input
 * - gamepad: Gamepad input handling
 */
