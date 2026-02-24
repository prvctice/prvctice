/**
 * Mixer -- Host audio engine control surface with per-channel faders,
 * pan, mute/solo, master controls, and recording.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'mixer',
  name: 'Mixer',
  category: 'creative',
  icon: 'ph:sliders-horizontal',
  description: 'Audio mixer with per-channel controls and recording',
  permissions: ['media:mixer'],
  defaultSize: { w: 560, h: 460 },
  minSize: { w: 400, h: 380 },
  requires: ['webAudio'],
  load: () => import('./mixer.build.js').then((m) => m.MIXER_HTML),
};

export default config;
