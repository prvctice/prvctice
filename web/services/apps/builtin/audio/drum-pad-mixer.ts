/**
 * Drum Pad (Mixer) -- 8-pad percussion instrument routed through
 * the host audio engine. Auto-opens the Mixer companion app.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'drum-pad-mixer',
  name: 'Drum Pad',
  category: 'creative',
  icon: 'ph:grid-four',
  description: '8-pad drum machine routed through the host mixer',
  permissions: ['media:mixer'],
  defaultSize: { w: 380, h: 420 },
  minSize: { w: 340, h: 380 },
  requires: ['webAudio'],
  companion: 'mixer',
  load: () => import('./drum-pad-mixer.build.js').then((m) => m.DRUM_PAD_HTML),
};

export default config;
