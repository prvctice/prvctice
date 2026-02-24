/**
 * Media Handler Types
 *
 * Defines the context object and function signatures for extracted
 * media bridge handlers. Handlers are pure functions that receive
 * a HandlerContext -- they never own state directly.
 */

import type { AppInstance, BridgeResponse } from '@web/types/apps';
import type { AudioEngine } from '@web/services/apps/audioEngine';

/** Voice effects chain for host-side audio processing in voice modulator mode */
export interface VoiceEffectsChain {
  readonly inputGain: GainNode;
  readonly pitchDelay: DelayNode;
  pitchLFO: OscillatorNode | null;
  pitchLFOGain: GainNode | null;
  readonly distortion: WaveShaperNode;
  readonly reverbConvolver: ConvolverNode;
  readonly reverbMix: GainNode;
  readonly reverbDry: GainNode;
  readonly delayNode: DelayNode;
  readonly delayFeedback: GainNode;
  readonly delayMix: GainNode;
  readonly delayDry: GainNode;
  readonly outputGain: GainNode;
  readonly destNode: MediaStreamAudioDestinationNode;
}

/** Media state tracked per instance for microphone recording/visualization */
export interface MediaState {
  readonly stream: MediaStream;
  readonly audioContext: AudioContext;
  readonly analyser: AnalyserNode;
  readonly source: MediaStreamAudioSourceNode;
  recorder: MediaRecorder | null;
  readonly chunks: Blob[];
  rafId: number | null;
  voiceEffects?: VoiceEffectsChain;
}

/** Camera state tracked per instance for video stream frame capture */
export interface CameraState {
  readonly stream: MediaStream;
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  readonly canvasCtx: CanvasRenderingContext2D;
  rafId: number | null;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly fps: number;
  lastFrameTime: number;
}

/** Video player state tracked per instance + playerId */
export interface VideoPlayerState {
  readonly video: HTMLVideoElement;
  readonly blobUrl: string | null;
  readonly playerId: string;
}

/** GIF encoder state tracked per instance + encoderId */
export interface GifEncoderState {
  readonly encoderId: string;
  readonly worker: Worker;
  readonly width: number;
  readonly height: number;
  readonly quality: 'high' | 'medium' | 'low';
  frameCount: number;
}

/** Context passed to every handler -- provides access to appManager's state and services */
export interface HandlerContext {
  /** The app instance making the request */
  readonly instance: AppInstance;

  /** Respond to the bridge request */
  readonly respond: (response: BridgeResponse) => void;

  /** The request ID from the bridge message */
  readonly requestId: string;

  /** The request data payload */
  readonly data: Record<string, unknown>;

  /** Get media state for an instance (microphone streams, recorders) */
  readonly getMediaState: (instanceId: string) => MediaState | undefined;

  /** Set media state for an instance */
  readonly setMediaState: (instanceId: string, state: MediaState) => void;

  /** Delete media state for an instance */
  readonly deleteMediaState: (instanceId: string) => void;

  /** Send a message to an app instance via the bridge */
  readonly sendToApp: (instance: AppInstance, message: Record<string, unknown>) => void;

  /** Resolve an API URL path */
  readonly apiResolve: (path: string) => string;

  // ── Camera state accessors ──

  /** Get camera state for an instance */
  readonly getCameraState: (instanceId: string) => CameraState | undefined;

  /** Set camera state for an instance */
  readonly setCameraState: (instanceId: string, state: CameraState) => void;

  /** Delete camera state for an instance */
  readonly deleteCameraState: (instanceId: string) => void;

  // ── Video state accessors ──

  /** Get video player state for an instance + playerId */
  readonly getVideoState: (instanceId: string, playerId: string) => VideoPlayerState | undefined;

  /** Set video player state for an instance + playerId */
  readonly setVideoState: (instanceId: string, playerId: string, state: VideoPlayerState) => void;

  /** Delete video player state for an instance + playerId */
  readonly deleteVideoState: (instanceId: string, playerId: string) => void;

  /** Delete all video player states for an instance */
  readonly deleteAllVideoStates: (instanceId: string) => void;

  /** Iterate all video player states for an instance */
  readonly forEachVideoState: (instanceId: string, fn: (state: VideoPlayerState) => void) => void;

  // ── GIF encoder state accessors ──

  /** Get GIF encoder state for an instance + encoderId */
  readonly getGifState: (instanceId: string, encoderId: string) => GifEncoderState | undefined;

  /** Set GIF encoder state for an instance + encoderId */
  readonly setGifState: (instanceId: string, encoderId: string, state: GifEncoderState) => void;

  /** Delete GIF encoder state for an instance + encoderId */
  readonly deleteGifState: (instanceId: string, encoderId: string) => void;

  /** Delete all GIF encoder states for an instance */
  readonly deleteAllGifStates: (instanceId: string) => void;

  /** Iterate all GIF encoder states for an instance */
  readonly forEachGifState: (instanceId: string, fn: (state: GifEncoderState) => void) => void;

  // ── Audio engine ──

  /** Get the shared audio engine instance */
  readonly getAudioEngine: () => AudioEngine;

  // ── Mixer state accessors ──

  /** Get the mixer subscriber instanceId (the mixer app receiving push state) */
  readonly getMixerSubscriber: () => string | null;

  /** Set the mixer subscriber instanceId */
  readonly setMixerSubscriber: (instanceId: string | null) => void;

  /** Get an app instance by instanceId (for sending push messages) */
  readonly getAppInstance: (instanceId: string) => AppInstance | undefined;
}

/** A media handler function signature */
export type MediaHandler = (ctx: HandlerContext) => void;
