/**
 * Builtin App Config Types
 *
 * Defines the descriptor shape for all builtin apps. Each app exports
 * a BuiltinAppConfig with metadata and a lazy load() function that
 * dynamically imports the HTML build module only when the app is opened.
 */

import type { AppPermission } from '@web/types/apps';

/** Categories for organizing builtin apps in the gallery */
export type BuiltinCategory = 'apps' | 'games' | 'creative' | 'utilities';

export interface BuiltinAppConfig {
  /** Unique app identifier (kebab-case, e.g. 'piano-synth') */
  readonly id: string;

  /** Display name shown in gallery and title bar */
  readonly name: string;

  /** Category for gallery grouping */
  readonly category: BuiltinCategory;

  /** Iconify icon identifier (e.g. 'ph:piano-keys') */
  readonly icon: string;

  /** Short description for gallery cards */
  readonly description: string;

  /** Permissions the app requires (auto-granted for builtins) */
  readonly permissions: readonly AppPermission[];

  /** Default window dimensions */
  readonly defaultSize: { readonly w: number; readonly h: number };

  /** Minimum resize dimensions */
  readonly minSize: { readonly w: number; readonly h: number };

  /** Maximum resize dimensions (optional) */
  readonly maxSize?: { readonly w: number; readonly h: number };

  /** Hide titlebar -- content fills edge-to-edge */
  readonly chromeless?: boolean;

  /** Disable magnetic snap to input bar (default: enabled) */
  readonly magnetic?: false;

  /**
   * Lazy loader that returns the app's HTML string.
   * Called only when the user opens the app. Heavy build logic
   * lives in a separate .build.ts file loaded via dynamic import().
   */
  readonly load: () => Promise<string>;

  /**
   * Feature capabilities this app requires from the host.
   * Used for future gating (e.g. 'webAudio', 'microphone', 'camera').
   */
  readonly requires?: readonly string[];

  /** App ID of a companion app to auto-open alongside this one */
  readonly companion?: string;
}
