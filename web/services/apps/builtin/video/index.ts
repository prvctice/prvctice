/**
 * Video Category -- Builtin apps for visual media creation and conversion
 */

import type { BuiltinAppConfig } from '../types';
import photoBooth from './photo-booth';
import mediaDownloader from './media-downloader';
import sketchPad from './sketch-pad';

export const videoApps: readonly BuiltinAppConfig[] = [photoBooth, mediaDownloader, sketchPad];
