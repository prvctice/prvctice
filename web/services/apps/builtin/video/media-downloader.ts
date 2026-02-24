/**
 * Media Downloader -- Download videos and audio from URLs via yt-dlp backend.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'media-downloader',
  name: 'Media Downloader',
  category: 'utilities',
  icon: 'ph:download-simple',
  description: 'Download videos and audio from URLs to your device',
  permissions: ['connector:media-tools'],
  defaultSize: { w: 360, h: 400 },
  minSize: { w: 320, h: 360 },
  chromeless: true,
  load: () => import('./media-downloader.build.js').then((m) => m.MEDIA_DOWNLOADER_HTML),
};

export default config;
