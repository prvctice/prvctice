/**
 * Microphone Handler
 *
 * Handles media:microphone:start, media:microphone:stop, and
 * media:microphone:params bridge messages.
 * Manages getUserMedia streams, MediaRecorder instances, and frequency
 * data visualization relay via requestAnimationFrame.
 *
 * Voice mode (mode === 'voice') sets up a host-side effects chain
 * (pitch simulation, distortion, reverb, delay) and outputs processed
 * audio to speakers. This is required because Chrome blocks getUserMedia
 * from sandboxed iframes with opaque/null origins.
 */

import { logError } from '@web/utils/debugLog.js';
import type { HandlerContext, MediaState, VoiceEffectsChain } from './types';

interface VoiceParams {
  pitch?: number; // semitones, -12 to 12
  dist?: number; // 0-1
  reverb?: number; // 0-1
  delay?: number; // seconds
  delayFb?: number; // 0-1
  delayMix?: number; // 0-1
  vol?: number; // 0-1
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 44100;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  const deg = Math.max(1, amount * 100);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + deg) * x * 20 * (Math.PI / 180)) / (Math.PI + deg * Math.abs(x));
  }
  return curve;
}

function buildImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function buildVoiceChain(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  params: VoiceParams
): VoiceEffectsChain {
  const inputGain = ctx.createGain();
  const pitchDelay = ctx.createDelay(1);
  const distortion = ctx.createWaveShaper();
  const reverbConvolver = ctx.createConvolver();
  const reverbMix = ctx.createGain();
  const reverbDry = ctx.createGain();
  const delayNode = ctx.createDelay(2);
  const delayFeedback = ctx.createGain();
  const delayMix = ctx.createGain();
  const delayDry = ctx.createGain();
  const outputGain = ctx.createGain();
  const destNode = ctx.createMediaStreamDestination();

  // Apply initial params
  distortion.curve = makeDistortionCurve(params.dist ?? 0);
  distortion.oversample = '4x';
  reverbConvolver.buffer = buildImpulse(ctx, 2.5, 2.5);
  reverbMix.gain.value = params.reverb ?? 0;
  reverbDry.gain.value = 1 - (params.reverb ?? 0) * 0.5;
  delayNode.delayTime.value = Math.max(0.001, params.delay ?? 0.001);
  delayFeedback.gain.value = params.delayFb ?? 0.3;
  delayMix.gain.value = params.delayMix ?? 0;
  delayDry.gain.value = 1;
  outputGain.gain.value = params.vol ?? 0.8;

  // Wire: source -> inputGain -> pitchDelay -> distortion -> reverb split -> delay split -> output -> dest + speakers
  source.connect(inputGain);
  inputGain.connect(pitchDelay);
  pitchDelay.connect(distortion);
  distortion.connect(reverbDry);
  distortion.connect(reverbConvolver);
  reverbConvolver.connect(reverbMix);
  reverbDry.connect(delayDry);
  reverbMix.connect(delayDry);
  reverbDry.connect(delayNode);
  reverbMix.connect(delayNode);
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayMix);
  delayDry.connect(outputGain);
  delayMix.connect(outputGain);
  outputGain.connect(destNode);
  outputGain.connect(ctx.destination);

  return {
    inputGain,
    pitchDelay,
    pitchLFO: null,
    pitchLFOGain: null,
    distortion,
    reverbConvolver,
    reverbMix,
    reverbDry,
    delayNode,
    delayFeedback,
    delayMix,
    delayDry,
    outputGain,
    destNode,
  };
}

function applyVoiceParams(ctx: AudioContext, chain: VoiceEffectsChain, params: VoiceParams): void {
  const now = ctx.currentTime;

  // Distortion
  if (params.dist !== undefined) {
    chain.distortion.curve = makeDistortionCurve(params.dist);
  }

  // Reverb
  if (params.reverb !== undefined) {
    chain.reverbMix.gain.setTargetAtTime(params.reverb, now, 0.02);
    chain.reverbDry.gain.setTargetAtTime(1 - params.reverb * 0.5, now, 0.02);
  }

  // Delay
  if (params.delay !== undefined) {
    chain.delayNode.delayTime.setTargetAtTime(Math.max(0.001, params.delay), now, 0.02);
  }
  if (params.delayFb !== undefined) {
    chain.delayFeedback.gain.setTargetAtTime(params.delayFb, now, 0.02);
  }
  if (params.delayMix !== undefined) {
    chain.delayMix.gain.setTargetAtTime(params.delayMix, now, 0.02);
  }

  // Volume
  if (params.vol !== undefined) {
    chain.outputGain.gain.setTargetAtTime(params.vol, now, 0.02);
  }

  // Pitch shift (LFO-based approximation)
  if (params.pitch !== undefined) {
    if (params.pitch === 0) {
      if (chain.pitchLFO) {
        try {
          chain.pitchLFO.stop();
        } catch {
          /* ignore */
        }
        chain.pitchLFO.disconnect();
        chain.pitchLFO = null;
      }
      if (chain.pitchLFOGain) {
        chain.pitchLFOGain.disconnect();
        chain.pitchLFOGain = null;
      }
      chain.inputGain.gain.setTargetAtTime(1.0, now, 0.01);
    } else {
      const rate = Math.pow(2, Math.abs(params.pitch) / 12);
      const lfoFreq = params.pitch > 0 ? rate * 5 : 2;
      const depth = Math.abs(params.pitch) * 0.001;

      if (!chain.pitchLFO) {
        chain.pitchLFO = ctx.createOscillator();
        chain.pitchLFOGain = ctx.createGain();
        chain.pitchLFO.connect(chain.pitchLFOGain);
        chain.pitchLFOGain.connect(chain.pitchDelay.delayTime);
        chain.pitchLFO.start();
      }

      chain.pitchLFO.frequency.setTargetAtTime(lfoFreq, now, 0.01);
      chain.pitchLFOGain!.gain.setTargetAtTime(depth, now, 0.01);
      chain.pitchDelay.delayTime.setTargetAtTime(0.01, now, 0.01);
    }
  }
}

/**
 * Start a microphone session with optional recording and/or visualization.
 *
 * mode === 'voice': Sets up host-side effects chain (pitch, dist, reverb, delay),
 *   outputs to speakers, records the processed output, and sends visualization data.
 *   voiceParams in data sets initial effect parameters.
 *
 * mode === 'record' | 'both' | 'visualize': Standard modes (no effects chain).
 */
export function handleMicrophoneStart(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, setMediaState, sendToApp } = ctx;
  const mode = (data.mode as string) || 'both';
  const voiceParams = (data.voiceParams as VoiceParams | undefined) ?? {};

  // Stop any existing mic session for this instance
  cleanupMicForInstance(ctx, instance.instanceId);

  void (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;

      const state: MediaState = {
        stream,
        audioContext,
        analyser,
        source,
        recorder: null,
        chunks: [],
        rafId: null,
      };

      if (mode === 'voice') {
        // Build host-side effects chain
        const chain = buildVoiceChain(audioContext, source, voiceParams);
        state.voiceEffects = chain;

        // Tap analyser from the processed output for visualization
        chain.outputGain.connect(analyser);

        // Record the processed output (destNode.stream is the effects output)
        const recorder = new MediaRecorder(chain.destNode.stream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        recorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) state.chunks.push(e.data);
        };
        recorder.start(250);
        state.recorder = recorder;

        // Send both frequency bars and waveform samples for visualization
        const freqBuffer = new Uint8Array(analyser.frequencyBinCount);
        const waveBuffer = new Uint8Array(analyser.fftSize);

        function sendVoiceFrame(): void {
          analyser.getByteFrequencyData(freqBuffer);
          analyser.getByteTimeDomainData(waveBuffer);

          const bars = 32;
          const freqStep = freqBuffer.length / bars;
          const downsampled: number[] = [];
          for (let i = 0; i < bars; i++) {
            downsampled.push((freqBuffer[Math.floor(i * freqStep)] ?? 0) / 255);
          }

          const wavePoints = 128;
          const waveStep = waveBuffer.length / wavePoints;
          const waveform: number[] = [];
          for (let i = 0; i < wavePoints; i++) {
            waveform.push((waveBuffer[Math.floor(i * waveStep)] ?? 128) / 128.0 - 1.0);
          }

          sendToApp(instance, {
            type: 'media:audio_data',
            data: downsampled,
            waveform,
          });
          state.rafId = requestAnimationFrame(sendVoiceFrame);
        }
        state.rafId = requestAnimationFrame(sendVoiceFrame);
      } else {
        // Standard modes: source -> analyser (no effects)
        source.connect(analyser);

        if (mode === 'record' || mode === 'both') {
          const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
          recorder.ondataavailable = (e: BlobEvent) => {
            if (e.data.size > 0) state.chunks.push(e.data);
          };
          recorder.start(250);
          state.recorder = recorder;
        }

        if (mode === 'visualize' || mode === 'both') {
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          function sendAudioFrame(): void {
            analyser.getByteFrequencyData(dataArray);
            const bars = 32;
            const step = bufferLength / bars;
            const downsampled: number[] = [];
            for (let i = 0; i < bars; i++) {
              downsampled.push((dataArray[Math.floor(i * step)] ?? 0) / 255);
            }
            sendToApp(instance, {
              type: 'media:audio_data',
              data: downsampled,
            });
            state.rafId = requestAnimationFrame(sendAudioFrame);
          }
          state.rafId = requestAnimationFrame(sendAudioFrame);
        }
      }

      setMediaState(instance.instanceId, state);
      respond({ requestId, data: { active: true, mode } });
    } catch (err: unknown) {
      logError('bridge', 'media:microphone:start', err as Error);
      respond({
        requestId,
        error: (err as Error).message || 'Microphone access failed',
        code: 'PLATFORM_UNSUPPORTED',
      });
    }
  })();
}

/**
 * Update voice effects parameters for an active voice mode session.
 * No-op if no active mic session or not in voice mode.
 */
export function handleMicrophoneParams(ctx: HandlerContext): void {
  const { instance, respond, requestId, data, getMediaState } = ctx;
  const mediaState = getMediaState(instance.instanceId);

  if (!mediaState?.voiceEffects) {
    respond({ requestId, data: { updated: false } });
    return;
  }

  const params = (data.params as VoiceParams) ?? {};
  applyVoiceParams(mediaState.audioContext, mediaState.voiceEffects, params);
  respond({ requestId, data: { updated: true } });
}

/**
 * Stop a microphone session, collect recorded audio data, and return
 * the base64-encoded recording to the app.
 */
export function handleMicrophoneStop(ctx: HandlerContext): void {
  const { instance, respond, requestId, getMediaState } = ctx;
  const mediaState = getMediaState(instance.instanceId);

  if (!mediaState) {
    respond({ requestId, data: { stopped: true } });
    return;
  }

  void (async () => {
    try {
      let audioBase64: string | null = null;
      let mimeType: string | null = null;

      if (mediaState.recorder && mediaState.recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          mediaState.recorder!.onstop = () => resolve();
          mediaState.recorder!.stop();
        });

        if (mediaState.chunks.length > 0) {
          mimeType = mediaState.recorder.mimeType || 'audio/webm';
          const blob = new Blob(mediaState.chunks, { type: mimeType });
          const reader = new FileReader();
          audioBase64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1] || '');
            };
            reader.readAsDataURL(blob);
          });
        }
      }

      cleanupMicForInstance(ctx, instance.instanceId);

      respond({
        requestId,
        data: {
          stopped: true,
          audio: audioBase64,
          mimeType,
          duration: mediaState.chunks.length > 0 ? mediaState.chunks.length * 250 : 0,
        },
      });
    } catch (err: unknown) {
      logError('bridge', 'media:microphone:stop', err as Error);
      cleanupMicForInstance(ctx, instance.instanceId);
      respond({ requestId, error: 'Failed to stop recording', code: 'CONNECTOR_ERROR' });
    }
  })();
}

/**
 * Clean up all microphone resources for a given instance:
 * RAF loop, recorder, voice effects nodes, audio context, and stream tracks.
 */
export function cleanupMicForInstance(ctx: HandlerContext, instanceId: string): void {
  const state = ctx.getMediaState(instanceId);
  if (!state) return;

  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
  }

  if (state.recorder && state.recorder.state !== 'inactive') {
    try {
      state.recorder.stop();
    } catch {
      /* ignore */
    }
  }

  // Clean up voice effects nodes
  if (state.voiceEffects) {
    const chain = state.voiceEffects;
    if (chain.pitchLFO) {
      try {
        chain.pitchLFO.stop();
      } catch {
        /* ignore */
      }
      chain.pitchLFO.disconnect();
    }
    if (chain.pitchLFOGain) chain.pitchLFOGain.disconnect();
    try {
      chain.outputGain.disconnect(chain.destNode);
    } catch {
      /* ignore */
    }
    try {
      chain.outputGain.disconnect(state.audioContext.destination);
    } catch {
      /* ignore */
    }
  }

  try {
    void state.audioContext.close();
  } catch {
    /* ignore */
  }

  for (const track of state.stream.getTracks()) {
    track.stop();
  }

  ctx.deleteMediaState(instanceId);
}
