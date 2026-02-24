/**
 * Voice Notes -- Luxury voice recorder with waveform display and note list.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'voice-notes',
  name: 'Voice Notes',
  category: 'apps',
  icon: 'ph:microphone',
  description: 'Record, organize, and play back voice notes',
  permissions: ['media:microphone'],
  defaultSize: { w: 380, h: 560 },
  minSize: { w: 340, h: 460 },
  requires: ['webAudio'],
  load: () => import('./voice-notes.build.js').then((m) => m.VOICE_NOTES_HTML),
};

export default config;
