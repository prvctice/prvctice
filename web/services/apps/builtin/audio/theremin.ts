/**
 * Theremin -- Full-window playing surface with scale lock and effects.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'theremin',
  name: 'Theremin',
  category: 'creative',
  icon: 'ph:wave-sine',
  description: 'Full-window theremin with scale lock',
  permissions: ['media:mixer'],
  defaultSize: { w: 420, h: 520 },
  minSize: { w: 340, h: 400 },
  requires: ['webAudio'],
  companion: 'mixer',
  load: () => import('./theremin.build.js').then((m) => m.THEREMIN_HTML),
};

export default config;
