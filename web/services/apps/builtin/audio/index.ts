/**
 * Audio Category -- Builtin apps for audio production and playback
 */

import type { BuiltinAppConfig } from '../types';
import drumMachine from './drum-machine';
import theremin from './theremin';
import sampler from './sampler';
import mixer from './mixer';
import pianoSynthMixer from './piano-synth-mixer';
import voiceNotes from './voice-notes';

export const audioApps: readonly BuiltinAppConfig[] = [
  drumMachine,
  theremin,
  sampler,
  mixer,
  pianoSynthMixer,
  voiceNotes,
];
