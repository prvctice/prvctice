/**
 * Piano Synth (Mixer) -- Lightweight keyboard instrument that routes
 * audio through the host audio engine instead of creating its own
 * AudioContext. Auto-opens the Mixer companion app.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'piano-synth-mixer',
  name: 'Synth',
  category: 'creative',
  icon: 'ph:piano-keys',
  description: 'Synth routed through the host mixer',
  permissions: ['media:mixer'],
  defaultSize: { w: 440, h: 500 },
  minSize: { w: 400, h: 500 },
  requires: ['webAudio'],
  companion: 'mixer',
  load: () => import('./piano-synth-mixer.build.js').then((m) => m.PIANO_SYNTH_MIXER_HTML),
};

export default config;
