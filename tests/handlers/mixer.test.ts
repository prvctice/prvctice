import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleMixerConnect,
  handleMixerDisconnect,
  handleMixerNoteOn,
  handleMixerNoteOff,
  handleMixerGetState,
  handleMixerSetGain,
  handleMixerSetMute,
  handleMixerSetSolo,
  handleMixerSubscribeState,
  handleMixerSetReverbSend,
  handleMixerSetRecordArm,
  handleMixerSetBpm,
  handleMixerSetMetronome,
  handleMixerTransportPlay,
  handleMixerTransportStop,
  handleMixerGetAnalyserData,
  cleanupMixerForInstance,
} from '../../web/services/apps/handlers/mixer.js';
import { createAudioEngine, type AudioEngine } from '../../web/services/apps/audioEngine.js';
import type { HandlerContext } from '../../web/services/apps/handlers/types.js';
import type { AppInstance, BridgeResponse } from '../../web/types/apps.js';

// ============================================================================
// Mocks
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
(globalThis as Record<string, unknown>).AudioContext = MockAudioContext;

// ============================================================================
// Test helpers
// ============================================================================

function makeInstance(id: string): AppInstance {
  return {
    instanceId: id,
    appId: `app-${id}`,
    nonce: 'test-nonce',
    iframe: null as unknown as HTMLIFrameElement,
    handshakeComplete: true,
    pending: new Map(),
    createdAt: Date.now(),
    grantedPermissions: new Set(),
    themeSubscribed: false,
    exportedActionIds: [],
  };
}

interface TestCtxResult {
  ctx: HandlerContext;
  responses: BridgeResponse[];
  sentMessages: Array<{ instance: AppInstance; message: Record<string, unknown> }>;
  engine: AudioEngine;
}

function makeCtx(
  instanceId: string,
  data: Record<string, unknown> = {},
  overrides: Partial<{ mixerSubscriber: string | null; instances: Map<string, AppInstance> }> = {}
): TestCtxResult {
  const responses: BridgeResponse[] = [];
  const sentMessages: Array<{ instance: AppInstance; message: Record<string, unknown> }> = [];
  const engine = createAudioEngine();
  let mixerSub = overrides.mixerSubscriber ?? null;
  const instanceMap = overrides.instances ?? new Map<string, AppInstance>();

  const ctx: HandlerContext = {
    instance: makeInstance(instanceId),
    respond: (r) => responses.push(r),
    requestId: 'req-1',
    data,
    getMediaState: () => undefined,
    setMediaState: () => {},
    deleteMediaState: () => {},
    sendToApp: (inst, msg) => sentMessages.push({ instance: inst, message: msg }),
    apiResolve: (p) => p,
    getCameraState: () => undefined,
    setCameraState: () => {},
    deleteCameraState: () => {},
    getVideoState: () => undefined,
    setVideoState: () => {},
    deleteVideoState: () => {},
    deleteAllVideoStates: () => {},
    forEachVideoState: () => {},
    getGifState: () => undefined,
    setGifState: () => {},
    deleteGifState: () => {},
    deleteAllGifStates: () => {},
    forEachGifState: () => {},
    getAudioEngine: () => engine,
    getMixerSubscriber: () => mixerSub,
    setMixerSubscriber: (id) => {
      mixerSub = id;
    },
    getAppInstance: (id) => instanceMap.get(id),
  };

  return { ctx, responses, sentMessages, engine };
}

// ============================================================================
// Tests
// ============================================================================

describe('Mixer Handler', () => {
  describe('handleMixerConnect', () => {
    it('creates a channel and responds with channelId', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { name: 'Piano' });
      handleMixerConnect(ctx);

      assert.equal(responses.length, 1);
      assert.equal((responses[0]?.data as { channelId: string }).channelId, 'inst-1');
      assert.equal(engine.getState().channels.length, 1);
      assert.equal(engine.getState().channels[0]?.appName, 'Piano');
    });
  });

  describe('handleMixerDisconnect', () => {
    it('removes the channel', () => {
      const { ctx, responses, engine } = makeCtx('inst-1');
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');
      handleMixerDisconnect(ctx);

      assert.equal(responses.length, 1);
      assert.equal((responses[0]?.data as { disconnected: boolean }).disconnected, true);
      assert.equal(engine.getState().channels.length, 0);
    });
  });

  describe('handleMixerNoteOn', () => {
    it('creates a voice and responds with voiceId', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { freq: 440 });
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');
      handleMixerNoteOn(ctx);

      assert.equal(responses.length, 1);
      const voiceId = (responses[0]?.data as { voiceId: string }).voiceId;
      assert.ok(voiceId);
    });

    it('rejects invalid frequency', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { freq: -1 });
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');
      handleMixerNoteOn(ctx);

      assert.equal(responses.length, 1);
      assert.ok(responses[0]?.error);
    });
  });

  describe('handleMixerNoteOff', () => {
    it('stops a voice', () => {
      const { ctx: ctx1, engine } = makeCtx('inst-1', { freq: 440 });
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');
      const voiceId = engine.noteOn('inst-1', 440);

      const { ctx: ctx2, responses } = makeCtx('inst-1', { voiceId });
      // Share the same engine
      (ctx2 as { getAudioEngine: () => AudioEngine }).getAudioEngine = () => engine;
      handleMixerNoteOff(ctx2);

      assert.equal(responses.length, 1);
      assert.equal((responses[0]?.data as { stopped: boolean }).stopped, true);
    });
  });

  describe('handleMixerGetState', () => {
    it('returns engine state', () => {
      const { ctx, responses, engine } = makeCtx('inst-1');
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerGetState(ctx);

      assert.equal(responses.length, 1);
      const state = responses[0]?.data as { channels: unknown[] };
      assert.equal(state.channels.length, 1);
    });
  });

  describe('handleMixerSetGain', () => {
    it('updates channel gain', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { channelId: 'ch1', value: 0.5 });
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerSetGain(ctx);

      assert.equal(responses.length, 1);
      assert.equal(engine.getState().channels[0]?.gain, 0.5);
    });
  });

  describe('handleMixerSetMute / SetSolo', () => {
    it('toggles mute', () => {
      const { ctx, engine } = makeCtx('inst-1', { channelId: 'ch1', value: true });
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerSetMute(ctx);
      assert.equal(engine.getState().channels[0]?.mute, true);
    });

    it('toggles solo', () => {
      const { ctx, engine } = makeCtx('inst-1', { channelId: 'ch1', value: true });
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerSetSolo(ctx);
      assert.equal(engine.getState().channels[0]?.solo, true);
    });
  });

  describe('handleMixerSubscribeState', () => {
    it('sets mixer subscriber and responds with state', () => {
      const { ctx, responses, engine } = makeCtx('mixer-1');
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerSubscribeState(ctx);

      assert.equal(responses.length, 1);
      const state = responses[0]?.data as { channels: unknown[] };
      assert.equal(state.channels.length, 1);
    });
  });

  describe('state push to mixer', () => {
    it('pushes state to subscribed mixer instance on channel change', () => {
      const mixerInst = makeInstance('mixer-1');
      const instanceMap = new Map<string, AppInstance>();
      instanceMap.set('mixer-1', mixerInst);

      const { ctx, sentMessages, engine } = makeCtx(
        'inst-1',
        { name: 'Piano' },
        {
          mixerSubscriber: 'mixer-1',
          instances: instanceMap,
        }
      );

      handleMixerConnect(ctx);

      // Should have sent a state_update to the mixer
      const pushes = sentMessages.filter((m) => m.message.type === 'mixer:state_update');
      assert.ok(pushes.length > 0, 'Expected at least one mixer:state_update push');
    });
  });

  describe('cleanupMixerForInstance', () => {
    it('removes channel when instrument closes', () => {
      const { ctx, engine } = makeCtx('inst-1');
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');
      cleanupMixerForInstance(ctx, 'inst-1');
      assert.equal(engine.getState().channels.length, 0);
    });

    it('clears mixer subscriber and notifies instruments when mixer closes', () => {
      const pianoInst = makeInstance('inst-1');
      const instanceMap = new Map<string, AppInstance>();
      instanceMap.set('inst-1', pianoInst);

      const { ctx, sentMessages, engine } = makeCtx(
        'mixer-1',
        {},
        {
          mixerSubscriber: 'mixer-1',
          instances: instanceMap,
        }
      );
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');

      cleanupMixerForInstance(ctx, 'mixer-1');

      // Should notify connected instruments about mixer disconnect
      const disconnects = sentMessages.filter((m) => m.message.type === 'mixer:disconnected');
      assert.equal(disconnects.length, 1);
    });
  });

  // ── Phase 2 handlers ──

  describe('handleMixerSetReverbSend', () => {
    it('sets reverb send on channel', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { channelId: 'ch1', value: 0.5 });
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerSetReverbSend(ctx);
      assert.equal(responses.length, 1);
      assert.equal(engine.getState().channels[0]?.reverbSend, 0.5);
    });
  });

  describe('handleMixerSetRecordArm', () => {
    it('sets record arm on channel', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { channelId: 'ch1', value: true });
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerSetRecordArm(ctx);
      assert.equal(responses.length, 1);
      assert.equal(engine.getState().channels[0]?.recordArm, true);
    });
  });

  describe('handleMixerSetBpm', () => {
    it('sets BPM', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { value: 140 });
      handleMixerSetBpm(ctx);
      assert.equal(responses.length, 1);
      assert.equal(engine.getState().bpm, 140);
    });
  });

  describe('handleMixerSetMetronome', () => {
    it('enables metronome', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { value: true });
      handleMixerSetMetronome(ctx);
      assert.equal(responses.length, 1);
      assert.equal(engine.getState().metronomeEnabled, true);
    });
  });

  describe('handleMixerTransportPlay', () => {
    it('starts transport', () => {
      const { ctx, responses, engine } = makeCtx('inst-1');
      handleMixerTransportPlay(ctx);
      assert.equal(responses.length, 1);
      assert.equal(engine.getState().playing, true);
    });
  });

  describe('handleMixerTransportStop', () => {
    it('stops transport', () => {
      const { ctx, responses, engine } = makeCtx('inst-1');
      engine.transportPlay();
      handleMixerTransportStop(ctx);
      assert.equal(responses.length, 1);
      assert.equal(engine.getState().playing, false);
    });
  });

  describe('handleMixerGetAnalyserData', () => {
    it('returns analyser data for channel', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', { channelId: 'ch1' });
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerGetAnalyserData(ctx);
      assert.equal(responses.length, 1);
      assert.ok(responses[0]?.data);
    });

    it('returns master analyser when no channelId', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', {});
      engine.createChannel('ch1', 'piano', 'Piano');
      handleMixerGetAnalyserData(ctx);
      assert.equal(responses.length, 1);
      assert.ok(responses[0]?.data);
    });
  });

  describe('noteOn with extended options passthrough', () => {
    it('passes ADSR and filter options through', () => {
      const { ctx, responses, engine } = makeCtx('inst-1', {
        freq: 440,
        waveform: 'sawtooth',
        gain: 0.7,
        attack: 0.05,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
        filterFreq: 4000,
        filterQ: 3,
      });
      engine.createChannel('inst-1', 'app-inst-1', 'Piano');
      handleMixerNoteOn(ctx);
      assert.equal(responses.length, 1);
      assert.ok((responses[0]?.data as { voiceId: string }).voiceId);
    });
  });
});
