/**
 * Solitaire -- Classic Klondike solitaire card game
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'solitaire',
  name: 'Solitaire',
  category: 'games',
  icon: 'ph:club',
  description: 'Classic Klondike solitaire card game',
  permissions: [],
  magnetic: false,
  defaultSize: { w: 700, h: 550 },
  minSize: { w: 500, h: 400 },
  load: () => import('../../solitaire.js').then((m) => m.SOLITAIRE_HTML),
};

export default config;
