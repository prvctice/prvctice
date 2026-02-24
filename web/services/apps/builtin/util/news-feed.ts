/**
 * News Feed -- Live headlines by topic
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'news-feed',
  name: 'News',
  category: 'apps',
  icon: 'ph:newspaper',
  description: 'Live headlines by topic',
  permissions: ['connector:news'],
  defaultSize: { w: 380, h: 520 },
  minSize: { w: 280, h: 360 },
  load: () => import('./news-feed.build.js').then((m) => m.NEWS_HTML),
};

export default config;
