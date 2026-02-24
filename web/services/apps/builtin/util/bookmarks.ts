/**
 * Bookmarks -- Save and organize web bookmarks with categories
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'bookmarks',
  name: 'Bookmarks',
  category: 'utilities',
  icon: 'ph:bookmark-simple',
  description: 'Save and organize web bookmarks by category',
  permissions: [],
  defaultSize: { w: 380, h: 520 },
  minSize: { w: 300, h: 400 },
  load: () => import('./bookmarks.build.js').then((m) => m.BOOKMARKS_HTML),
};

export default config;
