/**
 * Synth Studio -- Full-Complexity Reference Implementation
 *
 * 4-track multitrack MIDI synthesizer with recording, per-track knobs,
 * energy-reactive spectrum visualizer. Demonstrates the complete
 * BuiltinAppConfig pattern including lazy loading and audio requirements.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'piano-synth',
  name: 'Synth Studio',
  category: 'creative',
  icon: 'ph:piano-keys',
  description: '4-track multitrack synthesizer with recording',
  permissions: [],
  defaultSize: { w: 420, h: 620 },
  minSize: { w: 380, h: 520 },
  requires: ['webAudio'],
  load: () => import('../../pianoSynth.js').then((m) => m.PIANO_SYNTH_HTML),
};

export default config;
