/**
 * Calculator -- Basic calculator with keyboard support
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'calculator',
  name: 'Calculator',
  category: 'apps',
  icon: 'ph:calculator',
  description: 'Basic calculator with keyboard support',
  permissions: [],
  defaultSize: { w: 320, h: 480 },
  minSize: { w: 260, h: 400 },
  load: () => import('./calculator.build.js').then((m) => m.CALC_HTML),
};

export default config;
