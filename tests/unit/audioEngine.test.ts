import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAudioEngine,
  type AudioEngine,
  type EngineState,
} from '../../web/services/apps/audioEngine.js';

// ============================================================================
// Mocks — We're testing logic, not Web Audio. Stub the browser APIs.
// ============================================================================

class MockGainNode {
  gain = {
    value: 1,
    setTargetAtTime: () => {},
    cancelScheduledValues: () => {},
    linearRampToValueAtTime: () => {},
    setValueAtTime: () => {},
  };
  connect() {
    return this;
  }
  disconnect() {}
}

class MockStereoPannerNode {
  pan = { value: 0 };
  connect() {
    return this;
  }
  disconnect() {}
}

class MockAnalyserNode {
  fftSize = 256;
  frequencyBinCount = 128;
  connect() {
    return this;
  }
  disconnect() {}
  getByteTimeDomainData(arr: Uint8Array) {
    arr.fill(128);
  }
  getByteFrequencyData(arr: Uint8Array) {
    arr.fill(0);
  }
}

class MockBiquadFilterNode {
  type = 'lowpass';
  frequency = { value: 350 };
  Q = { value: 1 };
  connect() {
    return this;
  }
  disconnect() {}
}

class MockConvolverNode {
  buffer: unknown = null;
  connect() {
    return this;
  }
  disconnect() {}
}

class MockOscillatorNode {
  type = 'sine';
  frequency = { value: 440 };
  detune = { value: 0 };
  connect() {
    return this;
  }
  disconnect() {}
  start() {}
  stop() {}
}

class MockMediaStreamDestinationNode {
  stream = { getTracks: () => [] };
}

class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
  }
  getChannelData() {
    return new Float32Array(this.length);
  }
}

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  createGain() {
    return new MockGainNode();
  }
  createStereoPanner() {
    return new MockStereoPannerNode();
  }
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createConvolver() {
    return new MockConvolverNode();
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }
  createMediaStreamDestination() {
    return new MockMediaStreamDestinationNode();
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

// Install global mocks
(globalThis as Record<string, unknown>).AudioContext = MockAudioContext;

// ============================================================================
// Tests
// ============================================================================

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = createAudioEngine();
  });

  // ── Channel lifecycle ──

  describe('createChannel / removeChannel', () => {
    it('creates a channel and reports it in state', () => {
      engine.createChannel('ch1', 'piano', 'Piano Synth');
      const state = engine.getState();
      assert.equal(state.channels.length, 1);
      assert.equal(state.channels[0]?.channelId, 'ch1');
      assert.equal(state.channels[0]?.appName, 'Piano Synth');
      assert.equal(state.channels[0]?.gain, 0.8);
      assert.equal(state.channels[0]?.pan, 0);
      assert.equal(state.channels[0]?.mute, false);
      assert.equal(state.channels[0]?.solo, false);
    });

    it('is idempotent for duplicate channelId', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.createChannel('ch1', 'piano', 'Piano Duplicate');
      assert.equal(engine.getState().channels.length, 1);
    });

    it('removes a channel', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.removeChannel('ch1');
      assert.equal(engine.getState().channels.length, 0);
    });

    it('removing non-existent channel is a no-op', () => {
      engine.removeChannel('ghost');
      assert.equal(engine.getState().channels.length, 0);
    });

    it('hasChannel returns correct values', () => {
      assert.equal(engine.hasChannel('ch1'), false);
      engine.createChannel('ch1', 'piano', 'Piano');
      assert.equal(engine.hasChannel('ch1'), true);
      engine.removeChannel('ch1');
      assert.equal(engine.hasChannel('ch1'), false);
    });
  });

  // ── Note control ──

  describe('noteOn / noteOff', () => {
    it('noteOn returns a voiceId', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const voiceId = engine.noteOn('ch1', 440);
      assert.ok(voiceId);
      assert.ok(voiceId!.startsWith('v_'));
    });

    it('noteOn with unknown channel returns null', () => {
      const voiceId = engine.noteOn('ghost', 440);
      assert.equal(voiceId, null);
    });

    it('noteOff does not throw for unknown voice', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.noteOff('ch1', 'nonexistent');
    });

    it('allNotesOff completes without error', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.noteOn('ch1', 440);
      engine.noteOn('ch1', 880);
      engine.allNotesOff('ch1');
    });
  });

  // ── Channel controls ──

  describe('setChannelGain / setPan / setMute / setSolo', () => {
    it('sets gain and clamps to 0-1', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setChannelGain('ch1', 0.5);
      assert.equal(engine.getState().channels[0]?.gain, 0.5);

      engine.setChannelGain('ch1', -0.5);
      assert.equal(engine.getState().channels[0]?.gain, 0);

      engine.setChannelGain('ch1', 2.0);
      assert.equal(engine.getState().channels[0]?.gain, 1);
    });

    it('sets pan and clamps to -1..1', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setPan('ch1', -0.5);
      assert.equal(engine.getState().channels[0]?.pan, -0.5);

      engine.setPan('ch1', -2);
      assert.equal(engine.getState().channels[0]?.pan, -1);
    });

    it('sets mute', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setMute('ch1', true);
      assert.equal(engine.getState().channels[0]?.mute, true);
    });

    it('sets solo', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setSolo('ch1', true);
      assert.equal(engine.getState().channels[0]?.solo, true);
    });
  });

  // ── Solo logic ──

  describe('solo logic', () => {
    it('when one channel is soloed, only that channel state shows solo', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.createChannel('ch2', 'drums', 'Drums');
      engine.setSolo('ch1', true);

      const state = engine.getState();
      assert.equal(state.channels[0]?.solo, true);
      assert.equal(state.channels[1]?.solo, false);
    });
  });

  // ── Master controls ──

  describe('masterGain / masterMute', () => {
    it('defaults to 0.8 gain and not muted', () => {
      const state = engine.getState();
      assert.equal(state.masterGain, 0.8);
      assert.equal(state.masterMute, false);
    });

    it('sets master gain', () => {
      engine.setMasterGain(0.5);
      assert.equal(engine.getState().masterGain, 0.5);
    });

    it('sets master mute', () => {
      engine.setMasterMute(true);
      assert.equal(engine.getState().masterMute, true);
    });
  });

  // ── State notifications ──

  describe('onStateChange', () => {
    it('fires callback on channel create', () => {
      const states: EngineState[] = [];
      engine.onStateChange((s) => states.push(s));
      engine.createChannel('ch1', 'piano', 'Piano');
      assert.equal(states.length, 1);
      assert.equal(states[0]?.channels.length, 1);
    });

    it('unsubscribe stops notifications', () => {
      const states: EngineState[] = [];
      const unsub = engine.onStateChange((s) => states.push(s));
      engine.createChannel('ch1', 'piano', 'Piano');
      unsub();
      engine.createChannel('ch2', 'drums', 'Drums');
      assert.equal(states.length, 1);
    });
  });

  // ── Dispose ──

  describe('dispose', () => {
    it('clears all channels and voices', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.noteOn('ch1', 440);
      engine.dispose();
      assert.equal(engine.getState().channels.length, 0);
    });
  });

  // ── Immutable state ──

  describe('getState immutability', () => {
    it('returns a new object each time', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const s1 = engine.getState();
      const s2 = engine.getState();
      assert.notEqual(s1, s2);
      assert.deepEqual(s1, s2);
    });
  });

  // ── ADSR / filter / vibrato options ──

  describe('noteOn with extended options', () => {
    it('accepts decay and sustain options', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const vid = engine.noteOn('ch1', 440, { decay: 0.3, sustain: 0.5 });
      assert.ok(vid, 'should return a voiceId');
    });

    it('accepts filter options', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const vid = engine.noteOn('ch1', 440, { filterFreq: 2000, filterQ: 5 });
      assert.ok(vid);
    });

    it('accepts vibrato options', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const vid = engine.noteOn('ch1', 440, { vibratoDepth: 0.5, vibratoRate: 6 });
      assert.ok(vid);
    });

    it('accepts full ADSR envelope', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const vid = engine.noteOn('ch1', 440, {
        attack: 0.05,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
        filterFreq: 4000,
        filterQ: 3,
        gain: 0.7,
        waveform: 'sawtooth',
      });
      assert.ok(vid);
    });
  });

  // ── Reverb send ──

  describe('setReverbSend', () => {
    it('updates channel reverbSend in state', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setReverbSend('ch1', 0.5);
      assert.equal(engine.getState().channels[0]?.reverbSend, 0.5);
    });

    it('clamps reverb send to 0-1', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setReverbSend('ch1', 2);
      assert.equal(engine.getState().channels[0]?.reverbSend, 1);
      engine.setReverbSend('ch1', -0.5);
      assert.equal(engine.getState().channels[0]?.reverbSend, 0);
    });

    it('is a no-op for unknown channel', () => {
      engine.setReverbSend('ghost', 0.5);
      assert.equal(engine.getState().channels.length, 0);
    });
  });

  // ── Record arm ──

  describe('setRecordArm', () => {
    it('updates channel recordArm in state', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      engine.setRecordArm('ch1', true);
      assert.equal(engine.getState().channels[0]?.recordArm, true);
      engine.setRecordArm('ch1', false);
      assert.equal(engine.getState().channels[0]?.recordArm, false);
    });
  });

  // ── BPM + Metronome ──

  describe('setBpm / setMetronome', () => {
    it('updates bpm in state', () => {
      engine.setBpm(140);
      assert.equal(engine.getState().bpm, 140);
    });

    it('clamps bpm to 20-300', () => {
      engine.setBpm(5);
      assert.equal(engine.getState().bpm, 20);
      engine.setBpm(500);
      assert.equal(engine.getState().bpm, 300);
    });

    it('updates metronomeEnabled in state', () => {
      engine.setMetronome(true);
      assert.equal(engine.getState().metronomeEnabled, true);
      engine.setMetronome(false);
      assert.equal(engine.getState().metronomeEnabled, false);
    });
  });

  // ── Transport ──

  describe('transport play / stop', () => {
    it('transportPlay sets playing to true', () => {
      engine.transportPlay();
      assert.equal(engine.getState().playing, true);
    });

    it('transportStop sets playing to false', () => {
      engine.transportPlay();
      engine.transportStop();
      assert.equal(engine.getState().playing, false);
    });

    it('getTransportTime returns a number', () => {
      const t = engine.getTransportTime();
      assert.equal(typeof t, 'number');
    });
  });

  // ── Analyser data ──

  describe('getAnalyserData', () => {
    it('returns null when no channel exists', () => {
      const data = engine.getAnalyserData('ghost');
      assert.equal(data, null);
    });

    it('returns data object for existing channel', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const data = engine.getAnalyserData('ch1');
      assert.ok(data);
      assert.ok(data!.timeDomain);
      assert.ok(data!.frequency);
    });

    it('returns master analyser data when no channelId given', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const data = engine.getAnalyserData();
      assert.ok(data);
    });
  });

  // ── Default state includes new fields ──

  describe('state includes phase 2 fields', () => {
    it('has bpm, metronome, playing, transportTime defaults', () => {
      const state = engine.getState();
      assert.equal(state.bpm, 120);
      assert.equal(state.metronomeEnabled, false);
      assert.equal(state.playing, false);
      assert.equal(typeof state.transportTime, 'number');
    });

    it('channel has reverbSend and recordArm defaults', () => {
      engine.createChannel('ch1', 'piano', 'Piano');
      const ch = engine.getState().channels[0];
      assert.equal(ch?.reverbSend, 0);
      assert.equal(ch?.recordArm, false);
    });
  });
});
