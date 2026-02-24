/**
 * Util Category -- Builtin productivity and utility apps
 */

import type { BuiltinAppConfig } from '../types';
import bookmarks from './bookmarks';
import calculator from './calculator';
import focusTimer from './focus-timer';
import newsFeed from './news-feed';
import pocketCalendar from './pocket-calendar';
import solitaire from './solitaire';
import translator from './translator';

export const utilApps: readonly BuiltinAppConfig[] = [
  bookmarks,
  calculator,
  focusTimer,
  newsFeed,
  pocketCalendar,
  solitaire,
  translator,
];
