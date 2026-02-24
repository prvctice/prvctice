/**
 * Host Audio Engine
 *
 * Singleton service that owns a single AudioContext with N channel strips
 * and a master bus. Instrument apps send note commands through the bridge;
 * the engine plays them on the correct channel. The Mixer app reads state
 * and adjusts gain/pan/mute/solo.
 *
 * Multi-track recording: each stopRecording() call auto-creates a TrackData
 * entry, enabling overdub and layered recording across multiple takes.
 *
 * No Vue dependencies — pure TypeScript service.
 */

// ==================== TYPES ====================

export interface ChannelState {
  readonly channelId: string; // = instanceId of the instrument app
  readonly appId: string;
  readonly appName: string;
  readonly gain: number; // 0-1
  readonly pan: number; // -1 to 1
  readonly mute: boolean;
  readonly solo: boolean;
  readonly reverbSend: number; // 0-1
  readonly recordArm: boolean; // visual indicator
}

export interface TrackState {
  readonly id: string;
  readonly name: string;
  readonly channelId: string | null;
  readonly duration: number; // seconds
  readonly startOffset: number; // seconds into timeline where clip starts
  readonly muted: boolean;
}

export interface EngineState {
  readonly channels: readonly ChannelState[];
  readonly masterGain: number;
  readonly masterMute: boolean;
  readonly recording: boolean;
  readonly bpm: number;
  readonly metronomeEnabled: boolean;
  readonly playing: boolean;
  readonly transportTime: number;
  readonly hasRecording: boolean;
  readonly playbackPlaying: boolean;
  readonly playbackCurrentTime: number;
  readonly playbackDuration: number;
  readonly tracks: readonly TrackState[];
  readonly loopEnabled: boolean;
  readonly loopStart: number;
  readonly loopEnd: number;
}

export interface NoteOptions {
  readonly waveform?: OscillatorType | 'noise';
  readonly gain?: number;
  readonly attack?: number;
  readonly release?: number;
  readonly detune?: number;
  readonly decay?: number; // seconds, peak to sustain (default 0)
  readonly sustain?: number; // 0-1, sustain level (default 1 = no decay)
  readonly filterFreq?: number; // Hz, lowpass cutoff (default 8000 = open)
  readonly filterQ?: number; // resonance Q (default 1)
  readonly vibratoDepth?: number; // 0-1 (default 0 = off)
  readonly vibratoRate?: number; // Hz (default 5)
}

export interface ToneOptions extends NoteOptions {
  readonly duration?: number;
}

type StateChangeCallback = (state: EngineState) => void;

// ==================== INTERNAL VOICE ====================

interface Voice {
  readonly oscillator: OscillatorNode | AudioBufferSourceNode;
  readonly gainNode: GainNode;
  readonly filter?: BiquadFilterNode;
  readonly lfo?: OscillatorNode;
  readonly lfoGain?: GainNode;
  readonly channelId: string;
  readonly attack: number;
  readonly release: number;
  readonly decay: number;
  readonly sustain: number;
}

// ==================== INTERNAL CHANNEL ====================

interface ChannelNodes {
  readonly gainNode: GainNode;
  readonly panNode: StereoPannerNode;
  readonly analyser: AnalyserNode;
  readonly reverbSendGain: GainNode;
  state: ChannelState;
}

// ==================== INTERNAL TRACK ====================

interface TrackData {
  id: string;
  name: string;
  channelId: string | null;
  blob: Blob;
  duration: number;
  startOffset: number; // seconds into timeline where this clip begins
  muted: boolean;
  audio: HTMLAudioElement | null;
  source: MediaElementAudioSourceNode | null;
  trackGainNode: GainNode | null;
  blobUrl: string | null;
}

// ==================== ENGINE ====================

export interface AudioEngine {
  // Channel lifecycle
  readonly createChannel: (channelId: string, appId: string, appName: string) => void;
  readonly removeChannel: (channelId: string) => void;
  readonly hasChannel: (channelId: string) => boolean;

  // Note control
  readonly synthDrumVoice: (channelId: string, voice: string, velocity: number) => void;
  readonly noteOn: (channelId: string, freq: number, opts?: NoteOptions) => string | null;
  readonly noteOff: (channelId: string, voiceId: string) => void;
  readonly setVoiceFrequency: (
    channelId: string,
    voiceId: string,
    freq: number,
    rampTime?: number
  ) => void;
  readonly setVoiceGain: (
    channelId: string,
    voiceId: string,
    gain: number,
    rampTime?: number
  ) => void;
  readonly tone: (channelId: string, freq: number, duration: number, opts?: ToneOptions) => void;
  readonly allNotesOff: (channelId: string) => void;

  // Channel controls
  readonly setChannelGain: (channelId: string, value: number) => void;
  readonly setPan: (channelId: string, value: number) => void;
  readonly setMute: (channelId: string, value: boolean) => void;
  readonly setSolo: (channelId: string, value: boolean) => void;
  readonly setReverbSend: (channelId: string, value: number) => void;
  readonly setRecordArm: (channelId: string, value: boolean) => void;

  // Master controls
  readonly setMasterGain: (value: number) => void;
  readonly setMasterMute: (value: boolean) => void;

  // Transport
  readonly setBpm: (value: number) => void;
  readonly setMetronome: (enabled: boolean) => void;
  readonly transportPlay: () => void;
  readonly transportStop: () => void;
  readonly getTransportTime: () => number;

  // Recording
  readonly startRecording: () => void;
  readonly stopRecording: () => Promise<{ blob: Blob; duration: number; trackId: string }>;

  // Multi-track
  readonly addTrack: (
    blob: Blob,
    duration: number,
    channelId: string | null,
    name: string,
    startOffset?: number
  ) => TrackState;
  readonly removeTrack: (id: string) => void;
  readonly setTrackMute: (id: string, muted: boolean) => void;
  readonly playTracks: () => void;
  readonly stopTracks: () => void;
  readonly seekTransport: (time: number) => void;
  readonly clearAllTracks: () => void;
  readonly getPeakLevels: () => { master: number; channels: Record<string, number> };
  readonly setLoop: (enabled: boolean, start?: number, end?: number) => void;
  readonly exportTrack: (id: string) => Promise<{ blob: Blob; duration: number } | null>;

  // Legacy playback shims (redirect to multi-track transport)
  readonly playRecording: () => void;
  readonly pauseRecording: () => void;
  readonly stopPlayback: () => void;
  readonly seekRecording: (time: number) => void;
  readonly clearRecording: () => void;

  // Analyser
  readonly getAnalyserData: (
    channelId?: string
  ) => { frequency: number[]; timeDomain: number[] } | null;

  // State
  readonly getState: () => EngineState;
  readonly onStateChange: (cb: StateChangeCallback) => () => void;

  // Cleanup
  readonly dispose: () => void;
}

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let masterGainNode: GainNode | null = null;
  let masterAnalyser: AnalyserNode | null = null;

  // Recording bus: armed channels -> recordBusGain -> recordStreamDest
  let recordBusGain: GainNode | null = null;
  let recordStreamDest: MediaStreamAudioDestinationNode | null = null;

  // Reverb bus
  let reverbConvolver: ConvolverNode | null = null;
  let reverbReturn: GainNode | null = null;

  const channels = new Map<string, ChannelNodes>();
  const voices = new Map<string, Voice>();
  const listeners: Set<StateChangeCallback> = new Set();

  let masterGain = 0.8;
  let masterMute = false;
  let recording = false;
  let recorder: MediaRecorder | null = null;
  let recordChunks: Blob[] = [];
  let recordStartTime = 0;
  let recordStartTransportTime = 0; // transport position when recording began

  // Multi-track state
  const tracks = new Map<string, TrackData>();
  let trackCounter = 0;
  let loopEnabled = false;
  let loopStart = 0;
  let loopEnd = 0;
  let loopCheckId: ReturnType<typeof setInterval> | null = null;

  // Transport state
  let bpm = 120;
  let metronomeEnabled = false;
  let playing = false;
  let transportBaseTime = 0; // accumulated seconds before current session
  let transportSessionStart = 0; // Date.now() when play started
  let metronomeIntervalId: ReturnType<typeof setInterval> | null = null;
  let metronomeBeat = 0;

  let voiceCounter = 0;

  // ── Procedural impulse response for plate reverb ──

  function buildImpulse(audioCtx: AudioContext): AudioBuffer {
    const rate = audioCtx.sampleRate;
    const length = Math.floor(rate * 2.5);
    const buffer = audioCtx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
    }
    return buffer;
  }

  // ── Lazy AudioContext init ──

  function ensureContext(): AudioContext {
    if (ctx) return ctx;

    ctx = new AudioContext();
    masterGainNode = ctx.createGain();
    masterGainNode.gain.value = masterMute ? 0 : masterGain;

    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;

    // Recording bus: separate from master so we can record only armed channels
    recordBusGain = ctx.createGain();
    recordBusGain.gain.value = 1;
    recordStreamDest = ctx.createMediaStreamDestination();
    recordBusGain.connect(recordStreamDest);

    masterGainNode.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);

    // Reverb bus: convolver -> reverbReturn -> masterGain
    reverbConvolver = ctx.createConvolver();
    reverbConvolver.buffer = buildImpulse(ctx);
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.7;
    reverbConvolver.connect(reverbReturn);
    reverbReturn.connect(masterGainNode);

    return ctx;
  }

  // ── State management ──

  function getTransportTime(): number {
    if (!playing) return transportBaseTime;
    return transportBaseTime + (Date.now() - transportSessionStart) / 1000;
  }

  function buildState(): EngineState {
    const channelStates: ChannelState[] = [];
    for (const ch of channels.values()) channelStates.push({ ...ch.state });

    const trackStates: TrackState[] = [];
    let maxDuration = 0;
    for (const t of tracks.values()) {
      trackStates.push({
        id: t.id,
        name: t.name,
        channelId: t.channelId,
        duration: t.duration,
        startOffset: t.startOffset,
        muted: t.muted,
      });
      if (t.duration > maxDuration) maxDuration = t.duration;
    }

    const currentTime = getTransportTime();
    return {
      channels: channelStates,
      masterGain,
      masterMute,
      recording,
      bpm,
      metronomeEnabled,
      playing,
      transportTime: currentTime,
      hasRecording: tracks.size > 0,
      playbackPlaying: playing,
      playbackCurrentTime: currentTime,
      playbackDuration: maxDuration,
      tracks: trackStates,
      loopEnabled,
      loopStart,
      loopEnd,
    };
  }

  function notifyStateChange(): void {
    const state = buildState();
    for (const cb of listeners) {
      try {
        cb(state);
      } catch {
        /* ignore */
      }
    }
  }

  // ── Solo logic ──

  function applySoloLogic(): void {
    const anySoloed = [...channels.values()].some((ch) => ch.state.solo);

    for (const ch of channels.values()) {
      const { state, gainNode } = ch;
      if (state.mute) {
        gainNode.gain.value = 0;
      } else if (anySoloed && !state.solo) {
        gainNode.gain.value = 0;
      } else {
        gainNode.gain.value = state.gain;
      }
    }
  }

  // ── Recording bus wiring ──
  // If any channel is armed, only armed channels feed the recording bus.
  // If none are armed, all channels feed the recording bus (record everything).

  function updateRecordBusConnections(): void {
    if (!recordBusGain) return;

    const armed = [...channels.values()].filter((ch) => ch.state.recordArm);
    const sources = armed.length > 0 ? armed : [...channels.values()];

    // Disconnect all channels from record bus first
    for (const ch of channels.values()) {
      try {
        ch.panNode.disconnect(recordBusGain);
      } catch {
        /* not connected */
      }
    }

    // Connect the selected set
    for (const ch of sources) {
      ch.panNode.connect(recordBusGain);
    }
  }

  // ── Channel lifecycle ──

  function createChannel(channelId: string, appId: string, appName: string): void {
    if (channels.has(channelId)) return;

    const audioCtx = ensureContext();

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.8;

    const panNode = audioCtx.createStereoPanner();
    panNode.pan.value = 0;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    // Reverb send gain for this channel (default 0 = no reverb)
    const reverbSendGain = audioCtx.createGain();
    reverbSendGain.gain.value = 0;

    // Chain: source -> gainNode -> panNode -> analyser -> masterGain
    gainNode.connect(panNode);
    panNode.connect(analyser);
    analyser.connect(masterGainNode!);

    // Reverb send: panNode -> reverbSendGain -> convolver
    panNode.connect(reverbSendGain);
    if (reverbConvolver) {
      reverbSendGain.connect(reverbConvolver);
    }

    const state: ChannelState = {
      channelId,
      appId,
      appName,
      gain: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      reverbSend: 0,
      recordArm: false,
    };

    channels.set(channelId, { gainNode, panNode, analyser, reverbSendGain, state });
    applySoloLogic();
    updateRecordBusConnections();
    notifyStateChange();
  }

  function removeChannel(channelId: string): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    // Kill all voices on this channel
    allNotesOff(channelId);

    // Disconnect audio nodes
    try {
      ch.gainNode.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      ch.panNode.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      ch.analyser.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      ch.reverbSendGain.disconnect();
    } catch {
      /* already disconnected */
    }

    channels.delete(channelId);
    applySoloLogic();
    updateRecordBusConnections();
    notifyStateChange();
  }

  function hasChannel(channelId: string): boolean {
    return channels.has(channelId);
  }

  // ── Drum voice synthesis (exact 808 recreation) ──

  function synthDrumVoice(channelId: string, voice: string, velocity: number): void {
    const ch = channels.get(channelId);
    if (!ch || !ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const dest = ch.gainNode;
    const time = ctx.currentTime;
    const vel = Math.max(0, Math.min(1, velocity));

    switch (voice) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(60, time + 0.1);
        gain.gain.setValueAtTime(vel * 0.9, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(time);
        osc.stop(time + 0.35);
        break;
      }
      case 'snare': {
        // Triangle oscillator body
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, time);
        oscGain.gain.setValueAtTime(vel * 0.5, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        osc.connect(oscGain);
        oscGain.connect(dest);
        osc.start(time);
        osc.stop(time + 0.1);
        // Noise
        const snBufSize = Math.floor(ctx.sampleRate * 0.15);
        const snBuffer = ctx.createBuffer(1, snBufSize, ctx.sampleRate);
        const snData = snBuffer.getChannelData(0);
        for (let i = 0; i < snBufSize; i++) {
          snData[i] = Math.random() * 2 - 1;
        }
        const snNoise = ctx.createBufferSource();
        snNoise.buffer = snBuffer;
        const snFilter = ctx.createBiquadFilter();
        snFilter.type = 'bandpass';
        snFilter.frequency.value = 3000;
        snFilter.Q.value = 1;
        const snNoiseGain = ctx.createGain();
        snNoiseGain.gain.setValueAtTime(vel * 0.6, time);
        snNoiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        snNoise.connect(snFilter);
        snFilter.connect(snNoiseGain);
        snNoiseGain.connect(dest);
        snNoise.start(time);
        snNoise.stop(time + 0.18);
        break;
      }
      case 'hihat-closed': {
        const hhcBufSize = Math.floor(ctx.sampleRate * 0.04);
        const hhcBuffer = ctx.createBuffer(1, hhcBufSize, ctx.sampleRate);
        const hhcData = hhcBuffer.getChannelData(0);
        for (let i = 0; i < hhcBufSize; i++) {
          hhcData[i] = Math.random() * 2 - 1;
        }
        const hhcNoise = ctx.createBufferSource();
        hhcNoise.buffer = hhcBuffer;
        const hhcHp = ctx.createBiquadFilter();
        hhcHp.type = 'highpass';
        hhcHp.frequency.value = 7000;
        const hhcGain = ctx.createGain();
        hhcGain.gain.setValueAtTime(vel * 0.35, time);
        hhcGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        hhcNoise.connect(hhcHp);
        hhcHp.connect(hhcGain);
        hhcGain.connect(dest);
        hhcNoise.start(time);
        hhcNoise.stop(time + 0.06);
        break;
      }
      case 'hihat-open': {
        const hhoBufSize = Math.floor(ctx.sampleRate * 0.3);
        const hhoBuffer = ctx.createBuffer(1, hhoBufSize, ctx.sampleRate);
        const hhoData = hhoBuffer.getChannelData(0);
        for (let i = 0; i < hhoBufSize; i++) {
          hhoData[i] = Math.random() * 2 - 1;
        }
        const hhoNoise = ctx.createBufferSource();
        hhoNoise.buffer = hhoBuffer;
        const hhoHp = ctx.createBiquadFilter();
        hhoHp.type = 'highpass';
        hhoHp.frequency.value = 5000;
        const hhoGain = ctx.createGain();
        hhoGain.gain.setValueAtTime(vel * 0.3, time);
        hhoGain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        hhoNoise.connect(hhoHp);
        hhoHp.connect(hhoGain);
        hhoGain.connect(dest);
        hhoNoise.start(time);
        hhoNoise.stop(time + 0.35);
        break;
      }
      case 'clap': {
        const clBufSize = Math.floor(ctx.sampleRate * 0.2);
        const clBuffer = ctx.createBuffer(1, clBufSize, ctx.sampleRate);
        const clData = clBuffer.getChannelData(0);
        for (let i = 0; i < clBufSize; i++) {
          clData[i] = Math.random() * 2 - 1;
        }
        const clNoise = ctx.createBufferSource();
        clNoise.buffer = clBuffer;
        const clBp = ctx.createBiquadFilter();
        clBp.type = 'bandpass';
        clBp.frequency.value = 1200;
        clBp.Q.value = 0.7;
        const clGain = ctx.createGain();
        // Multi-burst envelope for clap texture
        clGain.gain.setValueAtTime(0, time);
        clGain.gain.linearRampToValueAtTime(vel * 0.6, time + 0.002);
        clGain.gain.linearRampToValueAtTime(0.05, time + 0.008);
        clGain.gain.linearRampToValueAtTime(vel * 0.5, time + 0.012);
        clGain.gain.linearRampToValueAtTime(0.05, time + 0.018);
        clGain.gain.linearRampToValueAtTime(vel * 0.7, time + 0.025);
        clGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        clNoise.connect(clBp);
        clBp.connect(clGain);
        clGain.connect(dest);
        clNoise.start(time);
        clNoise.stop(time + 0.2);
        break;
      }
      case 'tom': {
        const tomOsc = ctx.createOscillator();
        const tomGain = ctx.createGain();
        tomOsc.type = 'sine';
        tomOsc.frequency.setValueAtTime(120, time);
        tomOsc.frequency.exponentialRampToValueAtTime(80, time + 0.12);
        tomGain.gain.setValueAtTime(vel * 0.7, time);
        tomGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        tomOsc.connect(tomGain);
        tomGain.connect(dest);
        tomOsc.start(time);
        tomOsc.stop(time + 0.25);
        break;
      }
      case 'rim': {
        const rimOsc = ctx.createOscillator();
        const rimGain = ctx.createGain();
        rimOsc.type = 'sine';
        rimOsc.frequency.setValueAtTime(800, time);
        rimGain.gain.setValueAtTime(vel * 0.4, time);
        rimGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
        rimOsc.connect(rimGain);
        rimGain.connect(dest);
        rimOsc.start(time);
        rimOsc.stop(time + 0.04);
        break;
      }
      case 'cowbell': {
        const cb1 = ctx.createOscillator();
        const cb2 = ctx.createOscillator();
        const cbGain = ctx.createGain();
        const cbBp = ctx.createBiquadFilter();
        cbBp.type = 'bandpass';
        cbBp.frequency.value = 700;
        cbBp.Q.value = 2;
        cb1.type = 'square';
        cb1.frequency.value = 587;
        cb2.type = 'square';
        cb2.frequency.value = 845;
        cbGain.gain.setValueAtTime(vel * 0.25, time);
        cbGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        cb1.connect(cbBp);
        cb2.connect(cbBp);
        cbBp.connect(cbGain);
        cbGain.connect(dest);
        cb1.start(time);
        cb2.start(time);
        cb1.stop(time + 0.1);
        cb2.stop(time + 0.1);
        break;
      }
      default:
        break;
    }
  }

  // ── Note control ──

  function noteOn(channelId: string, freq: number, opts?: NoteOptions): string | null {
    const ch = channels.get(channelId);
    if (!ch || !ctx) return null;

    // Resume context if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const voiceId = `v_${++voiceCounter}`;
    const waveform = opts?.waveform ?? 'sine';
    const gain = opts?.gain ?? 0.6;
    const attack = opts?.attack ?? 0.01;
    const release = opts?.release ?? 0.1;
    const decay = opts?.decay ?? 0;
    const sustain = opts?.sustain ?? 1;
    const filterFreq = opts?.filterFreq ?? 8000;
    const filterQ = opts?.filterQ ?? 1;
    const vibratoDepth = opts?.vibratoDepth ?? 0;
    const vibratoRate = opts?.vibratoRate ?? 5;
    const isNoise = waveform === 'noise';

    // Create audio source: oscillator or noise buffer
    let source: OscillatorNode | AudioBufferSourceNode;
    if (isNoise) {
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;
      source = noiseSrc;
    } else {
      const osc = ctx.createOscillator();
      osc.type = waveform as OscillatorType;
      osc.frequency.value = freq;
      if (opts?.detune) osc.detune.value = opts.detune;
      source = osc;
    }

    // Optional vibrato LFO -> oscillator detune (only for oscillators)
    let lfo: OscillatorNode | undefined;
    let lfoGain: GainNode | undefined;
    if (vibratoDepth > 0 && !isNoise) {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = vibratoRate;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = vibratoDepth * 100; // detune cents
      lfo.connect(lfoGain);
      lfoGain.connect((source as OscillatorNode).detune);
      lfo.start();
    }

    // Filter: always created for noise (bandpass at freq), optional lowpass for oscillators
    let filter: BiquadFilterNode | undefined;
    if (isNoise) {
      filter = ctx.createBiquadFilter();
      filter.type = freq > 5000 ? 'highpass' : 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = filterQ;
    } else if (filterFreq < 7999) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = filterQ;
    }

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    // ADSR envelope
    const now = ctx.currentTime;
    // Attack: ramp 0 -> gain
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(gain, now + attack);
    // Decay: ramp gain -> gain*sustain
    if (decay > 0 && sustain < 1) {
      voiceGain.gain.linearRampToValueAtTime(gain * sustain, now + attack + decay);
    }

    // Connect chain: source -> [filter] -> voiceGain -> channelGain
    if (filter) {
      source.connect(filter);
      filter.connect(voiceGain);
    } else {
      source.connect(voiceGain);
    }
    voiceGain.connect(ch.gainNode);
    source.start();

    voices.set(voiceId, {
      oscillator: source,
      gainNode: voiceGain,
      filter,
      lfo,
      lfoGain,
      channelId,
      attack,
      release,
      decay,
      sustain,
    });

    return voiceId;
  }

  function noteOff(channelId: string, voiceId: string): void {
    const voice = voices.get(voiceId);
    if (!voice || voice.channelId !== channelId || !ctx) return;

    const { oscillator, gainNode, release, filter, lfo, lfoGain } = voice;
    const now = ctx.currentTime;

    // Release ramp then stop
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(0, now, release);

    const stopTime = now + release * 5;
    try {
      oscillator.stop(stopTime);
    } catch {
      /* already stopped */
    }
    if (lfo) {
      try {
        lfo.stop(stopTime);
      } catch {
        /* */
      }
    }

    voices.delete(voiceId);

    // Clean up after release completes
    setTimeout(
      () => {
        try {
          oscillator.disconnect();
        } catch {
          /* */
        }
        try {
          gainNode.disconnect();
        } catch {
          /* */
        }
        if (filter) {
          try {
            filter.disconnect();
          } catch {
            /* */
          }
        }
        if (lfo) {
          try {
            lfo.disconnect();
          } catch {
            /* */
          }
        }
        if (lfoGain) {
          try {
            lfoGain.disconnect();
          } catch {
            /* */
          }
        }
      },
      release * 5 * 1000 + 100
    );
  }

  function setVoiceFrequency(
    channelId: string,
    voiceId: string,
    freq: number,
    rampTime?: number
  ): void {
    const voice = voices.get(voiceId);
    if (!voice || voice.channelId !== channelId || !ctx) return;
    // OscillatorNode has .frequency, AudioBufferSourceNode does not
    if ('frequency' in voice.oscillator) {
      voice.oscillator.frequency.setTargetAtTime(freq, ctx.currentTime, rampTime ?? 0.02);
    } else if (voice.filter) {
      // For noise sources, adjust the filter frequency instead
      voice.filter.frequency.setTargetAtTime(freq, ctx.currentTime, rampTime ?? 0.02);
    }
  }

  function setVoiceGain(channelId: string, voiceId: string, gain: number, rampTime?: number): void {
    const voice = voices.get(voiceId);
    if (!voice || voice.channelId !== channelId || !ctx) return;
    voice.gainNode.gain.setTargetAtTime(gain, ctx.currentTime, rampTime ?? 0.02);
  }

  function tone(channelId: string, freq: number, duration: number, opts?: ToneOptions): void {
    const voiceId = noteOn(channelId, freq, opts);
    if (!voiceId) return;

    const release = opts?.release ?? 0.1;
    setTimeout(
      () => {
        noteOff(channelId, voiceId);
      },
      (duration - release) * 1000
    );
  }

  function allNotesOff(channelId: string): void {
    for (const [voiceId, voice] of voices) {
      if (voice.channelId === channelId) {
        noteOff(channelId, voiceId);
      }
    }
  }

  // ── Channel controls ──

  function setChannelGain(channelId: string, value: number): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    const clamped = Math.max(0, Math.min(1, value));
    ch.state = { ...ch.state, gain: clamped };
    applySoloLogic();
    notifyStateChange();
  }

  function setPan(channelId: string, value: number): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    const clamped = Math.max(-1, Math.min(1, value));
    ch.state = { ...ch.state, pan: clamped };
    ch.panNode.pan.value = clamped;
    notifyStateChange();
  }

  function setMute(channelId: string, value: boolean): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    ch.state = { ...ch.state, mute: value };
    applySoloLogic();
    notifyStateChange();
  }

  function setSolo(channelId: string, value: boolean): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    ch.state = { ...ch.state, solo: value };
    applySoloLogic();
    notifyStateChange();
  }

  function setReverbSend(channelId: string, value: number): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    const clamped = Math.max(0, Math.min(1, value));
    ch.state = { ...ch.state, reverbSend: clamped };
    ch.reverbSendGain.gain.value = clamped;
    notifyStateChange();
  }

  function setRecordArm(channelId: string, value: boolean): void {
    const ch = channels.get(channelId);
    if (!ch) return;

    ch.state = { ...ch.state, recordArm: value };
    updateRecordBusConnections();
    notifyStateChange();
  }

  // ── Master controls ──

  function setMasterGainValue(value: number): void {
    masterGain = Math.max(0, Math.min(1, value));
    if (masterGainNode) {
      masterGainNode.gain.value = masterMute ? 0 : masterGain;
    }
    notifyStateChange();
  }

  function setMasterMuteValue(value: boolean): void {
    masterMute = value;
    if (masterGainNode) {
      masterGainNode.gain.value = masterMute ? 0 : masterGain;
    }
    notifyStateChange();
  }

  // ── Transport + Metronome ──

  function setBpmValue(value: number): void {
    bpm = Math.max(20, Math.min(300, Math.round(value)));
    // If metronome is running, restart with new tempo
    if (playing && metronomeEnabled && metronomeIntervalId !== null) {
      stopMetronomeLoop();
      startMetronomeLoop();
    }
    notifyStateChange();
  }

  function setMetronomeValue(enabled: boolean): void {
    metronomeEnabled = enabled;
    if (playing && enabled && metronomeIntervalId === null) {
      startMetronomeLoop();
    } else if (!enabled && metronomeIntervalId !== null) {
      stopMetronomeLoop();
    }
    notifyStateChange();
  }

  function transportPlay(): void {
    if (playing) return;
    playing = true;
    transportSessionStart = Date.now();
    metronomeBeat = 0;
    if (metronomeEnabled) startMetronomeLoop();
    playTracks();
    if (loopEnabled) startLoopCheck();
    notifyStateChange();
  }

  function transportStop(): void {
    if (!playing) return;
    transportBaseTime = getTransportTime();
    playing = false;
    stopMetronomeLoop();
    stopLoopCheck();
    stopTracks();
    notifyStateChange();
  }

  function startMetronomeLoop(): void {
    if (metronomeIntervalId !== null) return;
    const beatMs = 60000 / bpm;
    // Schedule first click immediately
    playMetronomeClick(true);
    metronomeBeat = 1;
    metronomeIntervalId = setInterval(() => {
      const isDownbeat = metronomeBeat % 4 === 0;
      playMetronomeClick(isDownbeat);
      metronomeBeat++;
    }, beatMs);
  }

  function stopMetronomeLoop(): void {
    if (metronomeIntervalId !== null) {
      clearInterval(metronomeIntervalId);
      metronomeIntervalId = null;
    }
  }

  function playMetronomeClick(isDownbeat: boolean): void {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = isDownbeat ? 1000 : 800;
    const g = ctx.createGain();
    g.gain.value = 0.15;
    osc.connect(g);
    g.connect(masterGainNode!);
    const dur = isDownbeat ? 0.03 : 0.02;
    const now = ctx.currentTime;
    osc.start(now);
    g.gain.setTargetAtTime(0, now + dur, 0.005);
    osc.stop(now + dur + 0.05);
  }

  // ── Multi-track ──

  function addTrack(
    blob: Blob,
    duration: number,
    channelId: string | null,
    name: string,
    startOffset = 0
  ): TrackState {
    const audioCtx = ensureContext();
    const id = `trk_${++trackCounter}`;
    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    const source = audioCtx.createMediaElementSource(audio);
    const trackGainNode = audioCtx.createGain();
    trackGainNode.gain.value = 1;
    source.connect(trackGainNode);
    trackGainNode.connect(masterGainNode!);

    const trackData: TrackData = {
      id,
      name,
      channelId,
      blob,
      duration,
      startOffset,
      muted: false,
      audio,
      source,
      trackGainNode,
      blobUrl,
    };
    tracks.set(id, trackData);
    notifyStateChange();
    return { id, name, channelId, duration, startOffset, muted: false };
  }

  function removeTrack(id: string): void {
    const track = tracks.get(id);
    if (!track) return;
    if (track.audio) track.audio.pause();
    if (track.source) {
      try {
        track.source.disconnect();
      } catch {
        /* */
      }
    }
    if (track.trackGainNode) {
      try {
        track.trackGainNode.disconnect();
      } catch {
        /* */
      }
    }
    if (track.blobUrl) URL.revokeObjectURL(track.blobUrl);
    tracks.delete(id);
    notifyStateChange();
  }

  function setTrackMute(id: string, muted: boolean): void {
    const track = tracks.get(id);
    if (!track) return;
    track.muted = muted;
    if (track.trackGainNode) track.trackGainNode.gain.value = muted ? 0 : 1;
    if (muted && track.audio) {
      track.audio.pause();
    } else if (!muted && playing && track.audio) {
      const clipTime = getTransportTime() - track.startOffset;
      if (clipTime >= 0 && clipTime < track.duration) {
        track.audio.currentTime = clipTime;
        void track.audio.play();
      }
    }
    notifyStateChange();
  }

  function playTracks(): void {
    const t = transportBaseTime;
    const audioCtx = ensureContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    for (const track of tracks.values()) {
      if (track.muted || !track.audio) continue;
      const clipTime = t - track.startOffset;
      if (clipTime < 0 || clipTime >= track.duration) continue; // not yet / already past
      track.audio.currentTime = clipTime;
      void track.audio.play();
    }
  }

  function stopTracks(): void {
    for (const track of tracks.values()) {
      if (!track.audio) continue;
      track.audio.pause();
    }
  }

  function seekTransport(time: number): void {
    transportBaseTime = Math.max(0, time);
    if (playing) transportSessionStart = Date.now();
    for (const track of tracks.values()) {
      if (!track.audio) continue;
      const clipTime = transportBaseTime - track.startOffset;
      if (clipTime < 0 || clipTime >= track.duration) {
        track.audio.pause();
        continue;
      }
      track.audio.currentTime = clipTime;
      if (playing && !track.muted) void track.audio.play();
    }
    notifyStateChange();
  }

  function clearAllTracks(): void {
    stopTracks();
    for (const track of tracks.values()) {
      if (track.source) {
        try {
          track.source.disconnect();
        } catch {
          /* */
        }
      }
      if (track.trackGainNode) {
        try {
          track.trackGainNode.disconnect();
        } catch {
          /* */
        }
      }
      if (track.audio) track.audio.pause();
      if (track.blobUrl) URL.revokeObjectURL(track.blobUrl);
    }
    tracks.clear();
    transportBaseTime = 0;
    notifyStateChange();
  }

  function getPeakLevels(): { master: number; channels: Record<string, number> } {
    const result: { master: number; channels: Record<string, number> } = {
      master: 0,
      channels: {},
    };
    if (masterAnalyser) {
      const data = new Uint8Array(masterAnalyser.frequencyBinCount);
      masterAnalyser.getByteTimeDomainData(data);
      let max = 0;
      for (let i = 0; i < data.length; i++) {
        const sample = data[i] ?? 128;
        const v = Math.abs(sample - 128) / 128;
        if (v > max) max = v;
      }
      result.master = max;
    }
    for (const [id, ch] of channels) {
      const data = new Uint8Array(ch.analyser.frequencyBinCount);
      ch.analyser.getByteTimeDomainData(data);
      let max = 0;
      for (let i = 0; i < data.length; i++) {
        const sample = data[i] ?? 128;
        const v = Math.abs(sample - 128) / 128;
        if (v > max) max = v;
      }
      result.channels[id] = max;
    }
    return result;
  }

  function setLoopValue(enabled: boolean, start?: number, end?: number): void {
    loopEnabled = enabled;
    if (typeof start === 'number') loopStart = Math.max(0, start);
    if (typeof end === 'number') loopEnd = Math.max(loopStart + 0.1, end);
    if (enabled && playing) startLoopCheck();
    else if (!enabled) stopLoopCheck();
    notifyStateChange();
  }

  function startLoopCheck(): void {
    if (loopCheckId !== null) return;
    loopCheckId = setInterval(() => {
      if (!playing || !loopEnabled || loopEnd <= loopStart) return;
      const t = getTransportTime();
      if (t >= loopEnd) {
        transportBaseTime = loopStart;
        transportSessionStart = Date.now();
        for (const track of tracks.values()) {
          if (!track.audio || track.muted) continue;
          track.audio.currentTime = loopStart;
          void track.audio.play();
        }
      }
    }, 50);
  }

  function stopLoopCheck(): void {
    if (loopCheckId !== null) {
      clearInterval(loopCheckId);
      loopCheckId = null;
    }
  }

  async function exportTrack(id: string): Promise<{ blob: Blob; duration: number } | null> {
    const track = tracks.get(id);
    if (!track) return null;
    return { blob: track.blob, duration: track.duration };
  }

  // ── Recording ──

  function startRecording(): void {
    if (recording || !recordStreamDest) return;

    ensureContext();
    updateRecordBusConnections();

    recordChunks = [];
    recorder = new MediaRecorder(recordStreamDest!.stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) recordChunks.push(e.data);
    };
    recorder.start(250);
    recordStartTime = Date.now();
    recordStartTransportTime = getTransportTime();
    recording = true;
    notifyStateChange();
  }

  function stopRecording(): Promise<{ blob: Blob; duration: number; trackId: string }> {
    return new Promise((resolve, reject) => {
      if (!recording || !recorder) {
        reject(new Error('Not recording'));
        return;
      }

      const duration = Date.now() - recordStartTime;

      recorder.onstop = () => {
        const blob = new Blob(recordChunks, { type: 'audio/webm' });
        recordChunks = [];
        recorder = null;
        recording = false;

        // Auto-add track from recording
        const armedChannels = [...channels.values()].filter((ch) => ch.state.recordArm);
        const firstArmed = armedChannels[0];
        const channelId =
          armedChannels.length === 1 && firstArmed ? firstArmed.state.channelId : null;
        const trackName =
          armedChannels.length > 0 ? armedChannels.map((ch) => ch.state.appName).join('+') : 'Mix';
        const newTrack = addTrack(
          blob,
          duration / 1000,
          channelId,
          `${trackName} ${tracks.size + 1}`,
          recordStartTransportTime
        );

        notifyStateChange();
        resolve({ blob, duration, trackId: newTrack.id });
      };

      recorder.stop();
    });
  }

  // ── Legacy playback shims ──

  function playRecording(): void {
    transportPlay();
  }

  function pauseRecording(): void {
    if (playing) {
      transportBaseTime = getTransportTime();
      playing = false;
      stopMetronomeLoop();
      stopLoopCheck();
      stopTracks();
      notifyStateChange();
    }
  }

  function stopPlayback(): void {
    transportStop();
    seekTransport(0);
  }

  function seekRecording(time: number): void {
    seekTransport(time);
  }

  function clearRecording(): void {
    clearAllTracks();
  }

  // ── Analyser ──

  function getAnalyserData(
    channelId?: string
  ): { frequency: number[]; timeDomain: number[] } | null {
    let analyser: AnalyserNode | null = null;
    if (channelId) {
      const ch = channels.get(channelId);
      if (ch) analyser = ch.analyser;
    } else {
      analyser = masterAnalyser;
    }
    if (!analyser) return null;

    const frequency = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequency);
    const timeDomain = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeDomain);
    return { frequency: Array.from(frequency), timeDomain: Array.from(timeDomain) };
  }

  // ── State ──

  function getState(): EngineState {
    return buildState();
  }

  function onStateChange(cb: StateChangeCallback): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }

  // ── Cleanup ──

  function dispose(): void {
    // Stop transport + metronome
    playing = false;
    stopMetronomeLoop();
    stopLoopCheck();

    // Stop recording if active
    if (recording && recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorder = null;
    recording = false;
    recordChunks = [];

    // Clear all tracks
    clearAllTracks();

    // Kill all voices
    for (const [voiceId, voice] of voices) {
      try {
        voice.oscillator.stop();
      } catch {
        /* */
      }
      try {
        voice.oscillator.disconnect();
      } catch {
        /* */
      }
      try {
        voice.gainNode.disconnect();
      } catch {
        /* */
      }
      if (voice.filter) {
        try {
          voice.filter.disconnect();
        } catch {
          /* */
        }
      }
      if (voice.lfo) {
        try {
          voice.lfo.stop();
        } catch {
          /* */
        }
      }
      if (voice.lfo) {
        try {
          voice.lfo.disconnect();
        } catch {
          /* */
        }
      }
      if (voice.lfoGain) {
        try {
          voice.lfoGain.disconnect();
        } catch {
          /* */
        }
      }
      voices.delete(voiceId);
    }

    // Disconnect all channels
    for (const [id, ch] of channels) {
      try {
        ch.gainNode.disconnect();
      } catch {
        /* */
      }
      try {
        ch.panNode.disconnect();
      } catch {
        /* */
      }
      try {
        ch.analyser.disconnect();
      } catch {
        /* */
      }
      try {
        ch.reverbSendGain.disconnect();
      } catch {
        /* */
      }
      channels.delete(id);
    }

    // Disconnect reverb bus
    if (reverbConvolver) {
      try {
        reverbConvolver.disconnect();
      } catch {
        /* */
      }
    }
    if (reverbReturn) {
      try {
        reverbReturn.disconnect();
      } catch {
        /* */
      }
    }
    reverbConvolver = null;
    reverbReturn = null;

    // Close audio context
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        /* */
      }
      ctx = null;
    }

    // Disconnect recording bus
    if (recordBusGain) {
      try {
        recordBusGain.disconnect();
      } catch {
        /* */
      }
    }
    recordBusGain = null;
    recordStreamDest = null;

    masterGainNode = null;
    masterAnalyser = null;
    listeners.clear();
  }

  return {
    createChannel,
    removeChannel,
    hasChannel,
    synthDrumVoice,
    noteOn,
    noteOff,
    setVoiceFrequency,
    setVoiceGain,
    tone,
    allNotesOff,
    setChannelGain,
    setPan,
    setMute,
    setSolo,
    setReverbSend,
    setRecordArm,
    setMasterGain: setMasterGainValue,
    setMasterMute: setMasterMuteValue,
    setBpm: setBpmValue,
    setMetronome: setMetronomeValue,
    transportPlay,
    transportStop,
    getTransportTime,
    startRecording,
    stopRecording,
    addTrack,
    removeTrack,
    setTrackMute,
    playTracks,
    stopTracks,
    seekTransport,
    clearAllTracks,
    getPeakLevels,
    setLoop: setLoopValue,
    exportTrack,
    playRecording,
    pauseRecording,
    stopPlayback,
    seekRecording,
    clearRecording,
    getAnalyserData,
    getState,
    onStateChange,
    dispose,
  };
}
