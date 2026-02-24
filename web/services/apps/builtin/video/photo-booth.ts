/**
 * Photo Booth -- Camera with filters, countdown capture, burst grids, gallery.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'photo-booth',
  name: 'Photo Booth',
  category: 'creative',
  icon: 'ph:camera',
  description: 'Camera with filters, burst grids, and animated GIFs',
  permissions: ['media:camera'],
  defaultSize: { w: 480, h: 620 },
  minSize: { w: 400, h: 520 },
  requires: ['camera'],
  load: () => import('./photo-booth.build.js').then((m) => m.PHOTO_BOOTH_HTML),
};

export default config;
