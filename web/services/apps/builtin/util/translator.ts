/**
 * Translator -- Text and chat translation
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'translator',
  name: 'Translator',
  category: 'apps',
  icon: 'ph:translate',
  description: 'Text and chat translation',
  permissions: ['connector:ai'],
  defaultSize: { w: 420, h: 560 },
  minSize: { w: 320, h: 440 },
  load: () => import('../../translator.js').then((m) => m.TRANSLATOR_HTML),
};

export default config;
