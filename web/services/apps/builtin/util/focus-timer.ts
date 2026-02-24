/**
 * Focus Timer -- Minimal Reference Implementation
 *
 * Pomodoro-style countdown timer with 7-segment LED display.
 * Demonstrates the simplest BuiltinAppConfig pattern:
 * metadata + lazy load, no special requirements.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'focus-timer',
  name: 'Focus Timer',
  category: 'utilities',
  icon: 'ph:timer',
  description: 'Pomodoro-style countdown timer',
  permissions: [],
  defaultSize: { w: 340, h: 500 },
  minSize: { w: 280, h: 420 },
  load: () => import('../../focusTimer.js').then((m) => m.FOCUS_TIMER_HTML),
};

export default config;
