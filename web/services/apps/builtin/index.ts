/**
 * Builtin App Manifest
 *
 * Aggregates all category indexes into a single flat array of app configs.
 * This is the explicit manifest -- no auto-discovery. All apps are listed
 * by importing their category index files.
 *
 * To add a new builtin app:
 * 1. Create a config file in the appropriate category directory
 * 2. Import it in the category's index.ts
 * 3. That's it -- this file auto-aggregates from category indexes
 */

import type { BuiltinAppConfig } from './types';
import { audioApps } from './audio/index';
import { utilApps } from './util/index';
import { videoApps } from './video/index';

/** All builtin HTML app configs, aggregated from category indexes */
export const BUILTIN_APP_CONFIGS: readonly BuiltinAppConfig[] = [
  ...audioApps,
  ...videoApps,
  ...utilApps,
];

export type { BuiltinAppConfig, BuiltinCategory } from './types';
