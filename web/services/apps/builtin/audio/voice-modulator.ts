/**
 * Voice Modulator -- Real-time mic processing with effects chain.
 * Pitch shift, reverb, delay, distortion. Character and musical presets.
 * Switchable oscilloscope/spectrum visualization. Record processed output.
 */

import type { BuiltinAppConfig } from '../types';

const config: BuiltinAppConfig = {
  id: 'voice-modulator',
  name: 'Voice Modulator',
  category: 'creative',
  icon: 'ph:microphone-stage',
  description: 'Real-time voice effects with presets',
  permissions: ['media:microphone'],
  defaultSize: { w: 440, h: 580 },
  minSize: { w: 380, h: 480 },
  requires: ['webAudio'],
  load: () => import('./voice-modulator.build.js').then((m) => m.VOICE_MODULATOR_HTML),
};

export default config;
