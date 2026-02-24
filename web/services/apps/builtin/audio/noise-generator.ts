/**
 * Noise Generator -- Ambient noise mixer with binaural beats.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'noise-generator',
  name: 'Noise Generator',
  category: 'creative',
  icon: 'ph:cloud',
  description: 'Ambient noise mixer with binaural beats',
  permissions: [],
  defaultSize: { w: 420, h: 560 },
  minSize: { w: 360, h: 480 },
  requires: ['webAudio'],
  load: () => import('./noise-generator.build.js').then((m) => m.NOISE_GEN_HTML),
};

export default config;
