/**
 * Pocket Calendar -- Monthly calendar with event tracking
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'pocket-calendar',
  name: 'Pocket Calendar',
  category: 'apps',
  icon: 'ph:calendar',
  description: 'Monthly calendar with event tracking',
  permissions: [],
  defaultSize: { w: 340, h: 520 },
  minSize: { w: 280, h: 420 },
  load: () => import('../../pocketCalendar.js').then((m) => m.POCKET_CALENDAR_HTML),
};

export default config;
