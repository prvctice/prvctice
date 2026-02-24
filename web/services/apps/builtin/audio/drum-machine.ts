/**
 * Drum Machine -- 16-step sequencer with 8 synthesized 808-style voices.
 * Swing, velocity, 8 pattern banks, transport, level meter, WAV export.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'drum-machine',
  name: 'Drum Machine',
  category: 'creative',
  icon: 'ph:waveform',
  description: '16-step sequencer with 8 synthesized drum voices',
  permissions: ['media:mixer'],
  defaultSize: { w: 480, h: 640 },
  minSize: { w: 420, h: 540 },
  requires: ['webAudio'],
  companion: 'mixer',
  load: () => import('./drum-machine.build.js').then((m) => m.DRUM_MACHINE_HTML),
};

export default config;
