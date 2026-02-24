/**
 * Mixer Handler
 *
 * Handles all mixer:* bridge messages for instrument apps and the Mixer
 * control surface app. Routes note commands to the audio engine, channel
 * controls to the engine's mixer, and manages push state subscriptions.
 *
 * Pure functions following the HandlerContext pattern.
 */

import { debugLog, logError } from '@web/utils/debugLog.js';
import type { HandlerContext } from './types';

// ── Instrument messages ──

export function handleMixerConnect(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();
  const name = (data.name as string) || instance.appId;

  engine.createChannel(instance.instanceId, instance.appId, name);

  respond({ requestId, data: { channelId: instance.instanceId } });
  pushStateToMixer(ctx);

  debugLog('mixer', 'connect', { channelId: instance.instanceId, name });
}

export function handleMixerDisconnect(ctx: HandlerContext): void {
  const { instance, respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.removeChannel(instance.instanceId);

  respond({ requestId, data: { disconnected: true } });
  pushStateToMixer(ctx);

  debugLog('mixer', 'disconnect', { channelId: instance.instanceId });
}

export function handleMixerNoteOn(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const freq = data.freq as number;
  if (typeof freq !== 'number' || freq <= 0) {
    respond({ requestId, error: 'Invalid frequency', code: 'INVALID_REQUEST' });
    return;
  }

  const voiceId = engine.noteOn(instance.instanceId, freq, {
    waveform: (data.waveform as OscillatorType) ?? undefined,
    gain: (data.gain as number) ?? undefined,
    attack: (data.attack as number) ?? undefined,
    release: (data.release as number) ?? undefined,
    detune: (data.detune as number) ?? undefined,
    decay: (data.decay as number) ?? undefined,
    sustain: (data.sustain as number) ?? undefined,
    filterFreq: (data.filterFreq as number) ?? undefined,
    filterQ: (data.filterQ as number) ?? undefined,
    vibratoDepth: (data.vibratoDepth as number) ?? undefined,
    vibratoRate: (data.vibratoRate as number) ?? undefined,
  });

  if (voiceId) {
    respond({ requestId, data: { voiceId } });
  } else {
    respond({ requestId, error: 'Channel not found', code: 'INVALID_REQUEST' });
  }
}

export function handleMixerNoteOff(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const voiceId = data.voiceId as string;
  if (!voiceId) {
    respond({ requestId, error: 'voiceId required', code: 'INVALID_REQUEST' });
    return;
  }

  engine.noteOff(instance.instanceId, voiceId);
  respond({ requestId, data: { stopped: true } });
}

export function handleMixerTone(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const freq = data.freq as number;
  const duration = (data.duration as number) || 0.5;

  if (typeof freq !== 'number' || freq <= 0) {
    respond({ requestId, error: 'Invalid frequency', code: 'INVALID_REQUEST' });
    return;
  }

  engine.tone(instance.instanceId, freq, duration, {
    waveform: (data.waveform as OscillatorType) ?? undefined,
    gain: (data.gain as number) ?? undefined,
    attack: (data.attack as number) ?? undefined,
    release: (data.release as number) ?? undefined,
    decay: (data.decay as number) ?? undefined,
    sustain: (data.sustain as number) ?? undefined,
    filterFreq: (data.filterFreq as number) ?? undefined,
    filterQ: (data.filterQ as number) ?? undefined,
    vibratoDepth: (data.vibratoDepth as number) ?? undefined,
    vibratoRate: (data.vibratoRate as number) ?? undefined,
  });

  respond({ requestId, data: { ok: true } });
}

export function handleMixerSetVoiceFrequency(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  engine.setVoiceFrequency(
    instance.instanceId,
    data.voiceId as string,
    data.freq as number,
    (data.rampTime as number) ?? undefined
  );
  respond({ requestId, data: { ok: true } });
}

export function handleMixerSetVoiceGain(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  engine.setVoiceGain(
    instance.instanceId,
    data.voiceId as string,
    data.gain as number,
    (data.rampTime as number) ?? undefined
  );
  respond({ requestId, data: { ok: true } });
}

export function handleMixerSynthDrumVoice(ctx: HandlerContext): void {
  const { instance, respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const voice = data.voice as string;
  const velocity = data.velocity as number;

  if (!voice || typeof velocity !== 'number') {
    respond({ requestId, error: 'voice and velocity required', code: 'INVALID_REQUEST' });
    return;
  }

  engine.synthDrumVoice(instance.instanceId, voice, velocity);
  respond({ requestId, data: { ok: true } });
}

export function handleMixerAllNotesOff(ctx: HandlerContext): void {
  const { instance, respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.allNotesOff(instance.instanceId);
  respond({ requestId, data: { ok: true } });
}

// ── Mixer control messages ──

export function handleMixerGetState(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  respond({ requestId, data: engine.getState() });
}

export function handleMixerSetGain(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = data.channelId as string;
  const value = data.value as number;

  engine.setChannelGain(channelId, value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetPan(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = data.channelId as string;
  const value = data.value as number;

  engine.setPan(channelId, value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetMute(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = data.channelId as string;
  const value = data.value as boolean;

  engine.setMute(channelId, value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetSolo(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = data.channelId as string;
  const value = data.value as boolean;

  engine.setSolo(channelId, value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetMasterGain(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const value = data.value as number;
  engine.setMasterGain(value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetMasterMute(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const value = data.value as boolean;
  engine.setMasterMute(value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerStartRecording(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.startRecording();
  respond({ requestId, data: { recording: true } });
  pushStateToMixer(ctx);
}

export function handleMixerStopRecording(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  void engine
    .stopRecording()
    .then(({ blob, duration, trackId }) => {
      // Convert to base64 for bridge transfer
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        respond({
          requestId,
          data: {
            recording: false,
            audio: base64,
            mimeType: 'audio/webm',
            duration,
            trackId,
          },
        });
        pushStateToMixer(ctx);
      };
      reader.readAsDataURL(blob);
    })
    .catch((err: unknown) => {
      logError('mixer', 'stopRecording', err as Error);
      respond({ requestId, error: 'Recording stop failed', code: 'CONNECTOR_ERROR' });
    });
}

export function handleMixerSubscribeState(ctx: HandlerContext): void {
  const { instance, respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  ctx.setMixerSubscriber(instance.instanceId);
  respond({ requestId, data: engine.getState() });

  debugLog('mixer', 'subscribeState', { instanceId: instance.instanceId });
}

// ── New Phase 2 handlers ──

export function handleMixerSetReverbSend(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = data.channelId as string;
  const value = data.value as number;

  engine.setReverbSend(channelId, value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetRecordArm(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = data.channelId as string;
  const value = data.value as boolean;

  engine.setRecordArm(channelId, value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetBpm(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const value = data.value as number;
  engine.setBpm(value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetMetronome(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const value = data.value as boolean;
  engine.setMetronome(value);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerTransportPlay(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.transportPlay();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerTransportStop(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.transportStop();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerGetAnalyserData(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const channelId = (data.channelId as string) || undefined;
  const result = engine.getAnalyserData(channelId);
  respond({ requestId, data: result });
}

// ── Recording playback handlers ──

export function handleMixerPlayRecording(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.playRecording();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerPauseRecording(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.pauseRecording();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerStopPlayback(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.stopPlayback();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSeekRecording(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();

  const time = data.time as number;
  engine.seekRecording(time);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerClearRecording(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();

  engine.clearRecording();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

// ── Multi-track handlers ──

export function handleMixerRemoveTrack(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();
  engine.removeTrack(data.trackId as string);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSetTrackMute(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();
  engine.setTrackMute(data.trackId as string, data.value as boolean);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerGetPeakLevels(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();
  respond({ requestId, data: engine.getPeakLevels() });
}

export function handleMixerSetLoop(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();
  engine.setLoop(
    data.enabled as boolean,
    data.start as number | undefined,
    data.end as number | undefined
  );
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerClearAllTracks(ctx: HandlerContext): void {
  const { respond, requestId } = ctx;
  const engine = ctx.getAudioEngine();
  engine.clearAllTracks();
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerSeekTransport(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();
  engine.seekTransport(data.time as number);
  respond({ requestId, data: { ok: true } });
  pushStateToMixer(ctx);
}

export function handleMixerExportTrack(ctx: HandlerContext): void {
  const { respond, requestId, data } = ctx;
  const engine = ctx.getAudioEngine();
  const trackId = data.trackId as string;
  void engine
    .exportTrack(trackId)
    .then((result) => {
      if (!result) {
        respond({ requestId, error: 'Track not found', code: 'INVALID_REQUEST' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = reader.result as string;
        const base64 = r.split(',')[1] || '';
        respond({
          requestId,
          data: { trackId, audio: base64, mimeType: 'audio/webm', duration: result.duration },
        });
      };
      reader.readAsDataURL(result.blob);
    })
    .catch((err: unknown) => {
      logError('mixer', 'exportTrack', err as Error);
      respond({ requestId, error: 'Export failed', code: 'CONNECTOR_ERROR' });
    });
}

// ── Push helpers ──

function pushStateToMixer(ctx: HandlerContext): void {
  const subscriberId = ctx.getMixerSubscriber();
  if (!subscriberId) return;

  const inst = ctx.getAppInstance(subscriberId);
  if (!inst) return;

  const engine = ctx.getAudioEngine();
  ctx.sendToApp(inst, {
    type: 'mixer:state_update',
    state: engine.getState(),
  });
}

// ── Cleanup ──

/**
 * Clean up mixer resources when an instance closes.
 * If it's an instrument, remove its channel.
 * If it's the mixer, unsubscribe and notify instruments.
 */
export function cleanupMixerForInstance(ctx: HandlerContext, instanceId: string): void {
  const engine = ctx.getAudioEngine();

  // If this was an instrument channel, remove it
  if (engine.hasChannel(instanceId)) {
    engine.removeChannel(instanceId);
    pushStateToMixer(ctx);
    debugLog('mixer', 'cleanup:channel', { instanceId });
  }

  // If this was the mixer subscriber, clear subscription
  if (ctx.getMixerSubscriber() === instanceId) {
    ctx.setMixerSubscriber(null);

    // Notify all connected instruments that mixer disconnected
    const state = engine.getState();
    for (const ch of state.channels) {
      const inst = ctx.getAppInstance(ch.channelId);
      if (inst) {
        ctx.sendToApp(inst, { type: 'mixer:disconnected' });
      }
    }

    debugLog('mixer', 'cleanup:subscriber', { instanceId });
  }
}
