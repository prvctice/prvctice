/**
 * Sketch Pad -- Canvas drawing tool with smooth bezier brush,
 * 5 tools, opacity control, and PNG export.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'sketch-pad',
  name: 'Sketch Pad',
  category: 'creative',
  icon: 'ph:pencil-line',
  description: 'Drawing canvas with smooth brush, line tools, and export',
  permissions: [],
  defaultSize: { w: 520, h: 620 },
  minSize: { w: 380, h: 440 },
  load: () => import('./sketch-pad.build.js').then((m) => m.SKETCH_PAD_HTML),
};

export default config;
