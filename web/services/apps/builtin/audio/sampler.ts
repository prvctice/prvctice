/**
 * Sampler -- Chop-to-pad sampler with transient detection,
 * flexible grid (4x4/4x2), mic recording, file drop,
 * per-pad pitch/volume/pan, WAV export.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'sampler',
  name: 'Sampler',
  category: 'creative',
  icon: 'ph:grid-four',
  description: 'Chop-to-pad sampler with transient detection',
  permissions: ['media:mixer'],
  companion: 'mixer',
  defaultSize: { w: 520, h: 640 },
  minSize: { w: 440, h: 540 },
  requires: ['webAudio'],
  load: () => import('./sampler.build.js').then((m) => m.SAMPLER_HTML),
};

export default config;
