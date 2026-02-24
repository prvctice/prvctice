/**
 * Video Studio -- DAW-style timeline editor with multiple lanes
 * (video, audio, text overlay), trim/split, filters, and multi-format export.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'video-studio',
  name: 'Video Studio',
  category: 'creative',
  icon: 'ph:film-strip',
  description: 'Timeline editor with split, filters, text overlays, and GIF/MP4 export',
  permissions: [],
  defaultSize: { w: 760, h: 580 },
  minSize: { w: 640, h: 480 },
  load: () => import('./video-studio.build.js').then((m) => m.VIDEO_STUDIO_HTML),
};

export default config;
