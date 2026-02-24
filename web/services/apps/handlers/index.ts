/**
 * Media Handler Dispatch
 *
 * Single entry point for all media-related bridge messages.
 * Routes to the appropriate handler based on message type.
 * appManager calls dispatchMediaMessage() instead of inline switch cases.
 */

import {
  handleMicrophoneStart,
  handleMicrophoneStop,
  handleMicrophoneParams,
  cleanupMicForInstance,
} from './mic';
import { handleAudioLoad } from './audio';
import { handleImageLoad } from './image';
import { handleDownload, handleSaveUrl, handleMediaToolsDownload } from './download';
import {
  handleCameraStart,
  handleCameraCapture,
  handleCameraStop,
  cleanupCameraForInstance,
} from './camera';
import {
  handleVideoLoad,
  handleVideoPlay,
  handleVideoPause,
  handleVideoSeek,
  handleVideoSeekAndCapture,
  handleVideoUnload,
  cleanupVideoForInstance,
} from './video';
import {
  handleGifCreate,
  handleGifAddFrame,
  handleGifFinish,
  handleGifCancel,
  cleanupGifForInstance,
} from './gif';
import {
  handleMixerConnect,
  handleMixerDisconnect,
  handleMixerNoteOn,
  handleMixerNoteOff,
  handleMixerTone,
  handleMixerSynthDrumVoice,
  handleMixerAllNotesOff,
  handleMixerGetState,
  handleMixerSetGain,
  handleMixerSetPan,
  handleMixerSetMute,
  handleMixerSetSolo,
  handleMixerSetMasterGain,
  handleMixerSetMasterMute,
  handleMixerStartRecording,
  handleMixerStopRecording,
  handleMixerSubscribeState,
  handleMixerSetReverbSend,
  handleMixerSetRecordArm,
  handleMixerSetBpm,
  handleMixerSetMetronome,
  handleMixerTransportPlay,
  handleMixerTransportStop,
  handleMixerSetVoiceFrequency,
  handleMixerSetVoiceGain,
  handleMixerGetAnalyserData,
  handleMixerPlayRecording,
  handleMixerPauseRecording,
  handleMixerStopPlayback,
  handleMixerSeekRecording,
  handleMixerClearRecording,
  handleMixerRemoveTrack,
  handleMixerSetTrackMute,
  handleMixerGetPeakLevels,
  handleMixerSetLoop,
  handleMixerClearAllTracks,
  handleMixerSeekTransport,
  handleMixerExportTrack,
  cleanupMixerForInstance,
} from './mixer';
import type { HandlerContext } from './types';

export type {
  HandlerContext,
  MediaState,
  CameraState,
  VideoPlayerState,
  GifEncoderState,
  MediaHandler,
} from './types';
export { cleanupMixerForInstance } from './mixer';

/** Mixer message types handled by the mixer dispatch */
const MIXER_TYPES = new Set([
  'mixer:connect',
  'mixer:disconnect',
  'mixer:noteOn',
  'mixer:noteOff',
  'mixer:tone',
  'mixer:synthDrumVoice',
  'mixer:allNotesOff',
  'mixer:setVoiceFrequency',
  'mixer:setVoiceGain',
  'mixer:getState',
  'mixer:setGain',
  'mixer:setPan',
  'mixer:setMute',
  'mixer:setSolo',
  'mixer:setMasterGain',
  'mixer:setMasterMute',
  'mixer:startRecording',
  'mixer:stopRecording',
  'mixer:subscribeState',
  'mixer:setReverbSend',
  'mixer:setRecordArm',
  'mixer:setBpm',
  'mixer:setMetronome',
  'mixer:transportPlay',
  'mixer:transportStop',
  'mixer:getAnalyserData',
  'mixer:playRecording',
  'mixer:pauseRecording',
  'mixer:stopPlayback',
  'mixer:seekRecording',
  'mixer:clearRecording',
  'mixer:removeTrack',
  'mixer:setTrackMute',
  'mixer:getPeakLevels',
  'mixer:setLoop',
  'mixer:clearAllTracks',
  'mixer:seekTransport',
  'mixer:exportTrack',
]);

/** Check if a message type is handled by the mixer dispatch */
export function isMixerMessage(type: string): boolean {
  return MIXER_TYPES.has(type);
}

/**
 * Dispatch a mixer bridge message to the appropriate handler.
 * Returns true if the message was handled, false otherwise.
 */
export function dispatchMixerMessage(type: string, ctx: HandlerContext): boolean {
  switch (type) {
    case 'mixer:connect':
      handleMixerConnect(ctx);
      return true;
    case 'mixer:disconnect':
      handleMixerDisconnect(ctx);
      return true;
    case 'mixer:noteOn':
      handleMixerNoteOn(ctx);
      return true;
    case 'mixer:noteOff':
      handleMixerNoteOff(ctx);
      return true;
    case 'mixer:tone':
      handleMixerTone(ctx);
      return true;
    case 'mixer:synthDrumVoice':
      handleMixerSynthDrumVoice(ctx);
      return true;
    case 'mixer:allNotesOff':
      handleMixerAllNotesOff(ctx);
      return true;
    case 'mixer:setVoiceFrequency':
      handleMixerSetVoiceFrequency(ctx);
      return true;
    case 'mixer:setVoiceGain':
      handleMixerSetVoiceGain(ctx);
      return true;
    case 'mixer:getState':
      handleMixerGetState(ctx);
      return true;
    case 'mixer:setGain':
      handleMixerSetGain(ctx);
      return true;
    case 'mixer:setPan':
      handleMixerSetPan(ctx);
      return true;
    case 'mixer:setMute':
      handleMixerSetMute(ctx);
      return true;
    case 'mixer:setSolo':
      handleMixerSetSolo(ctx);
      return true;
    case 'mixer:setMasterGain':
      handleMixerSetMasterGain(ctx);
      return true;
    case 'mixer:setMasterMute':
      handleMixerSetMasterMute(ctx);
      return true;
    case 'mixer:startRecording':
      handleMixerStartRecording(ctx);
      return true;
    case 'mixer:stopRecording':
      handleMixerStopRecording(ctx);
      return true;
    case 'mixer:subscribeState':
      handleMixerSubscribeState(ctx);
      return true;
    case 'mixer:setReverbSend':
      handleMixerSetReverbSend(ctx);
      return true;
    case 'mixer:setRecordArm':
      handleMixerSetRecordArm(ctx);
      return true;
    case 'mixer:setBpm':
      handleMixerSetBpm(ctx);
      return true;
    case 'mixer:setMetronome':
      handleMixerSetMetronome(ctx);
      return true;
    case 'mixer:transportPlay':
      handleMixerTransportPlay(ctx);
      return true;
    case 'mixer:transportStop':
      handleMixerTransportStop(ctx);
      return true;
    case 'mixer:getAnalyserData':
      handleMixerGetAnalyserData(ctx);
      return true;
    case 'mixer:playRecording':
      handleMixerPlayRecording(ctx);
      return true;
    case 'mixer:pauseRecording':
      handleMixerPauseRecording(ctx);
      return true;
    case 'mixer:stopPlayback':
      handleMixerStopPlayback(ctx);
      return true;
    case 'mixer:seekRecording':
      handleMixerSeekRecording(ctx);
      return true;
    case 'mixer:clearRecording':
      handleMixerClearRecording(ctx);
      return true;
    case 'mixer:removeTrack':
      handleMixerRemoveTrack(ctx);
      return true;
    case 'mixer:setTrackMute':
      handleMixerSetTrackMute(ctx);
      return true;
    case 'mixer:getPeakLevels':
      handleMixerGetPeakLevels(ctx);
      return true;
    case 'mixer:setLoop':
      handleMixerSetLoop(ctx);
      return true;
    case 'mixer:clearAllTracks':
      handleMixerClearAllTracks(ctx);
      return true;
    case 'mixer:seekTransport':
      handleMixerSeekTransport(ctx);
      return true;
    case 'mixer:exportTrack':
      handleMixerExportTrack(ctx);
      return true;
    default:
      return false;
  }
}

/** Media message types this dispatch handles */
const MEDIA_TYPES = new Set([
  'media:microphone:start',
  'media:microphone:stop',
  'media:microphone:params',
  'media:download',
  'media:saveUrl',
  'media-tools:download',
  'media:audio:load',
  'media:image:load',
  'media:camera:start',
  'media:camera:capture',
  'media:camera:stop',
  'media:video:load',
  'media:video:play',
  'media:video:pause',
  'media:video:seek',
  'media:video:seekAndCapture',
  'media:video:unload',
  'media:gif:create',
  'media:gif:addFrame',
  'media:gif:finish',
  'media:gif:cancel',
]);

/** Check if a message type is handled by the media dispatch */
export function isMediaMessage(type: string): boolean {
  return MEDIA_TYPES.has(type);
}

/**
 * Dispatch a media bridge message to the appropriate handler.
 * Returns true if the message was handled, false otherwise.
 */
export function dispatchMediaMessage(type: string, ctx: HandlerContext): boolean {
  switch (type) {
    case 'media:microphone:start':
      handleMicrophoneStart(ctx);
      return true;

    case 'media:microphone:stop':
      handleMicrophoneStop(ctx);
      return true;

    case 'media:microphone:params':
      handleMicrophoneParams(ctx);
      return true;

    case 'media:download':
      handleDownload(ctx);
      return true;

    case 'media:saveUrl':
      handleSaveUrl(ctx);
      return true;

    case 'media-tools:download':
      handleMediaToolsDownload(ctx);
      return true;

    case 'media:audio:load':
      handleAudioLoad(ctx);
      return true;

    case 'media:image:load':
      handleImageLoad(ctx);
      return true;

    // ── Camera ──

    case 'media:camera:start':
      handleCameraStart(ctx);
      return true;

    case 'media:camera:capture':
      handleCameraCapture(ctx);
      return true;

    case 'media:camera:stop':
      handleCameraStop(ctx);
      return true;

    // ── Video ──

    case 'media:video:load':
      handleVideoLoad(ctx);
      return true;

    case 'media:video:play':
      handleVideoPlay(ctx);
      return true;

    case 'media:video:pause':
      handleVideoPause(ctx);
      return true;

    case 'media:video:seek':
      handleVideoSeek(ctx);
      return true;

    case 'media:video:seekAndCapture':
      handleVideoSeekAndCapture(ctx);
      return true;

    case 'media:video:unload':
      handleVideoUnload(ctx);
      return true;

    // ── GIF ──

    case 'media:gif:create':
      handleGifCreate(ctx);
      return true;

    case 'media:gif:addFrame':
      handleGifAddFrame(ctx);
      return true;

    case 'media:gif:finish':
      handleGifFinish(ctx);
      return true;

    case 'media:gif:cancel':
      handleGifCancel(ctx);
      return true;

    default:
      return false;
  }
}

/**
 * Clean up all media resources for a given instance.
 * Called by appManager during instance teardown.
 */
export function cleanupMediaForInstance(ctx: HandlerContext, instanceId: string): void {
  cleanupMicForInstance(ctx, instanceId);
  cleanupCameraForInstance(ctx, instanceId);
  cleanupVideoForInstance(ctx, instanceId);
  cleanupGifForInstance(ctx, instanceId);
  cleanupMixerForInstance(ctx, instanceId);
}
