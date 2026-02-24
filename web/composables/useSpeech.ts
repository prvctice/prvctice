// web/composables/useSpeech.ts
// Voice recognition with Electron native bridge + Web Speech API fallback
// Audio context, visualizer integration, and voice command handling

import { ref, type Ref } from 'vue';
import { shimmer } from '@web/utils/shimmer.js';
import { frameCoordinator, Priority } from '@web/utils/frameCoordinator.js';
import { useEventBus } from '@web/services/eventBus';
import { debugLog, debugWarn, logError } from '@web/utils/debugLog.js';

// ===========================================
// TYPE DEFINITIONS
// ===========================================

// Web Speech API types (not included in default TS lib)
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
  readonly isFinal: boolean;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLocal extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLocal extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionLocal extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  addEventListener(type: 'result', listener: (ev: SpeechRecognitionEventLocal) => void): void;
  addEventListener(type: 'error', listener: (ev: SpeechRecognitionErrorEventLocal) => void): void;
  addEventListener(
    type:
      | 'start'
      | 'end'
      | 'audiostart'
      | 'audioend'
      | 'soundstart'
      | 'soundend'
      | 'speechstart'
      | 'speechend',
    listener: () => void
  ): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLocal;

/** Speech recognition transcript from native or web API */
interface TranscriptEvent {
  text: string;
  isFinal?: boolean;
}

/** Voice intent emitted through intent coordinator */
interface VoiceIntent {
  source: 'voice';
  action: string;
  target: string;
  value?: unknown;
  timestamp: number;
}

/** Options for showing/hiding voice visualizer */
interface VisualizerOptions {
  withVisualizer?: boolean;
  keepStream?: boolean;
}

/** Electron speech bridge interface */
interface ElectronSpeechBridge {
  start: () => void;
  stop: () => void;
  requestAuthorization: () => Promise<string>;
  onTranscript: (callback: (event: TranscriptEvent) => void) => void;
}

/** Electron dictation menu interface */
interface ElectronDictationMenu {
  onToggle: (callback: (state: 'start' | 'stop') => void) => void;
}

type VoiceTransport = 'electron-native' | 'web-speech' | null;

// Window extension type for speech-specific properties
// Uses intersection type to avoid conflicts with other Window declarations
type SpeechWindow = Window & {
  electronSpeech?: ElectronSpeechBridge;
  electronDictationMenu?: ElectronDictationMenu;
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  sharedAudioStream?: MediaStream | null;
  __prvVoiceInputLocked?: boolean;
  showScreenSaver?: (opts?: VisualizerOptions) => void;
  hideScreenSaver?: (opts?: VisualizerOptions) => void;
  stopVoiceInput?: () => void;
  sendMessage?: () => Promise<void>;
  startNewChat?: () => void | Promise<void>;
  appendLastAssistantMessageToNotesFull?: () => void;
  setTheme?: (theme: string) => void;
  cycleTheme?: () => void;
  openHelpPane?: () => void;
  closeHelpPane?: () => void;
  openVoiceCommandsPane?: () => void;
  closeVoiceCommandsPane?: () => void;
  toggleVoiceCommandsPane?: () => void;
  AppSettings?: {
    speechSilenceThreshold?: number;
    speechSilenceTimeout?: number;
    [key: string]: unknown;
  };
  intentCoordinator?: {
    emit: (intent: Partial<VoiceIntent>) => unknown;
    registerTarget: (
      id: string,
      options: {
        zone?: unknown;
        actions: string[];
        handler: (intent: { action: string; value?: unknown }) => void;
      }
    ) => void;
  };
  appendNotifs?: (kind: string, text: string) => void;
  openApiKeysModal?: () => void;
  openSettingsModal?: () => void;
  handleMenuAction?: (action: string) => void;
};

// Helper to get typed window
const win = window as SpeechWindow;

// ===========================================
// CONSTANTS
// ===========================================

const isElectron = navigator.userAgent.toLowerCase().includes('electron');
const hasNativeWebSpeech =
  typeof win.SpeechRecognition === 'function' || typeof win.webkitSpeechRecognition === 'function';

// ===========================================
// MODULE STATE
// ===========================================

// Speech recognition
let recognition: SpeechRecognitionLocal | null = null;
const isListening = ref(false);
const isVoiceActive = ref(false);
const shouldListen = ref(false);
const pendingTranscripts: string[] = [];
let isProcessingSpeech = false;
let electronTranscriptDebounce: ReturnType<typeof setTimeout> | null = null;
let electronLastSentTranscript = '';
let activeVoiceTransport: VoiceTransport = null;

// Capability flags
let webSpeechAvailable = hasNativeWebSpeech;
let webSpeechBlockReason: string | null = null;

// Audio visualizer
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array | null = null;
let sharedAudioStream: MediaStream | null = null;
let visualizerAnimationId: number | null = null;
let visualizerSource: MediaStreamAudioSourceNode | null = null;
let visualizerSilence: GainNode | null = null;

// Silence detection
let silenceStartTime: number | null = null;
const silenceThreshold = win.AppSettings?.speechSilenceThreshold ?? 5;
const silenceDurationToStop = win.AppSettings?.speechSilenceTimeout ?? 60000;

// Voice input lock
let voiceInputLocked = Boolean(win.__prvVoiceInputLocked);

// ===========================================
// VOICE COMMAND HANDLER
// ===========================================

function emitVoiceIntent(intent: Omit<VoiceIntent, 'source' | 'timestamp'>): unknown {
  const fullIntent: VoiceIntent = { ...intent, source: 'voice', timestamp: Date.now() };
  if (win.intentCoordinator) {
    return win.intentCoordinator.emit(fullIntent);
  }
  debugWarn(
    'speech',
    'intent:no-coordinator',
    'Intent coordinator not ready, queuing: ' + JSON.stringify(fullIntent)
  );
  return null;
}

function handleVoiceCommand(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const text = raw.trim().toLowerCase();

  // Notes pane
  if (/^(open|show) (the )?notes?\b/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'notes', value: true });
    return true;
  }
  if (/^(close|hide) (the )?notes?\b/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'notes', value: false });
    return true;
  }

  // Help pane
  if (/^(open|show) (the )?(help|tips?|guide)\b/.test(text) || /^show me help$/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'help', value: true });
    return true;
  }
  if (/^(close|hide) (the )?(help|tips?|guide)\b/.test(text) || /^close help$/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'help', value: false });
    return true;
  }
  if (/^help$/.test(text) || /^tips?$/.test(text)) {
    emitVoiceIntent({ action: 'toggle', target: 'help' });
    return true;
  }

  // Voice commands pane
  if (/^(open|show) (the )?voice commands?\b/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'voiceCommands', value: true });
    return true;
  }
  if (/^(close|hide) (the )?voice commands?\b/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'voiceCommands', value: false });
    return true;
  }

  // What do you think?
  if (/^what do you think\??$/.test(text)) {
    const notesEditor = document.getElementById('notes-editor');
    if (notesEditor) {
      const sel = window.getSelection();
      let noteText = '';
      if (sel && sel.rangeCount && notesEditor.contains(sel.anchorNode)) {
        noteText = sel.toString().trim();
      }
      if (!noteText) {
        noteText = notesEditor.innerText.trim();
      }
      if (noteText) {
        emitVoiceIntent({ action: 'submit', target: 'inputBar', value: { text: noteText } });
      }
    }
    return true;
  }

  // Email notes
  if (/^(email|mail)( the)? notes?\b/.test(text)) {
    emitVoiceIntent({ action: 'activate', target: 'notesEmail' });
    return true;
  }

  // Attach image
  if (/attach (?:an |the )?image\b|add image\b/.test(text)) {
    emitVoiceIntent({ action: 'activate', target: 'upload' });
    return true;
  }

  // Workspace
  if (/^save workspace$/.test(text)) {
    emitVoiceIntent({ action: 'activate', target: 'workspace', value: 'save' });
    return true;
  }
  if (/^load workspace$/.test(text)) {
    emitVoiceIntent({ action: 'activate', target: 'workspace', value: 'load' });
    return true;
  }

  // Grid overlay
  if (/^(?:grid|show grid|hide grid|turn (?:on|off) grid|grid (?:on|off))$/.test(text)) {
    const turnOn = /(?:on|show)/.test(text) && !/off|hide/.test(text);
    emitVoiceIntent({ action: 'set', target: 'grid', value: turnOn });
    return true;
  }
  if (/^grid (on|off)$/.test(text)) {
    const desired = text.endsWith('on');
    emitVoiceIntent({ action: 'set', target: 'grid', value: desired });
    return true;
  }

  // New chat
  if (
    /^(i )?want (a )?new chat$/.test(text) ||
    /^new chat$/.test(text) ||
    /start (?:a )?new chat/.test(text)
  ) {
    emitVoiceIntent({ action: 'activate', target: 'newChat' });
    return true;
  }

  // Send to notes
  if (
    /^(?:please |can you |could you )?(send|save|add|put) (?:this|that|it|the (?:response|message|chat)|response|message|chat) (?:to|into|in) (?:my )?notes\b(?:\s*please)?\??$/.test(
      text
    )
  ) {
    emitVoiceIntent({ action: 'activate', target: 'sendToNotes' });
    return true;
  }

  // Theme switching
  if (/(?:switch to )?dark(?: mode| theme)?$/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'theme', value: 'dark' });
    return true;
  }
  if (/(?:switch to )?light(?: mode| theme)?$/.test(text)) {
    emitVoiceIntent({ action: 'set', target: 'theme', value: 'light' });
    return true;
  }
  if (
    /(?:reduce distractions|minimal(?: theme)?|switch to (?:the )?minimal(?: theme)?)$/.test(text)
  ) {
    emitVoiceIntent({ action: 'set', target: 'theme', value: 'minimal' });
    return true;
  }

  return false;
}

// ===========================================
// AUDIO CONTEXT & STREAM
// ===========================================

async function initializeAudioContext(): Promise<void> {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext && !analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }
  debugLog('speech', 'audio:init', 'AudioContext initialized');
}

async function getSharedAudioStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia is not implemented in this browser.');
  }
  debugLog('speech', 'audio:mic-request', 'Requesting microphone access...');
  if (!sharedAudioStream) {
    sharedAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    debugLog('speech', 'audio:mic-acquired', 'Microphone stream acquired');
    try {
      win.sharedAudioStream = sharedAudioStream;
    } catch {
      // ignore
    }
  }
  return sharedAudioStream;
}

function releaseSharedAudioStream(): void {
  if (!sharedAudioStream) return;
  try {
    sharedAudioStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
  sharedAudioStream = null;
  try {
    win.sharedAudioStream = null;
  } catch {
    // ignore
  }
}

// ===========================================
// AUDIO VISUALIZER
// ===========================================

function updateShimmerWithAudio(audioData: Uint8Array<ArrayBufferLike>): void {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] ?? 0;
  }
  const averageAmplitude = sum / audioData.length;
  const normalizedLevel = Math.min(1, Math.max(0, (averageAmplitude - 5) / 60));

  if (shimmer && typeof shimmer.updateAudio === 'function') {
    shimmer.updateAudio(normalizedLevel);
  }

  // Silence detection
  if (averageAmplitude < silenceThreshold) {
    if (!silenceStartTime) {
      silenceStartTime = Date.now();
    } else if (Date.now() - silenceStartTime > silenceDurationToStop) {
      if (isListening.value && recognition) {
        debugLog('speech', 'silence:detected', 'Stopping recognition');
        shouldListen.value = false;
        recognition.stop();
        isListening.value = false;
        deactivateVoiceVisualizer();
        silenceStartTime = null;
      }
    }
  } else {
    silenceStartTime = null;
  }
}

function visualizerUpdate(): void {
  if (!dataArray || !analyser) return;
  try {
    analyser.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);
    updateShimmerWithAudio(dataArray);
  } catch (err) {
    logError('speech', 'visualizer:error', err instanceof Error ? err : new Error(String(err)));
  }
}

function visualizerTick(): void {
  visualizerUpdate();
}

function drawVisualizer(): void {
  visualizerAnimationId = requestAnimationFrame(drawVisualizer);
  visualizerUpdate();
}

async function startVisualizer(): Promise<void> {
  try {
    await initializeAudioContext();
    if (audioContext && audioContext.state !== 'running') {
      try {
        await audioContext.resume();
      } catch {
        // ignore
      }
    }

    const stream = await getSharedAudioStream();
    if (!audioContext || !analyser) return;

    visualizerSource = audioContext.createMediaStreamSource(stream);
    visualizerSource.connect(analyser);
    visualizerSilence = audioContext.createGain();
    visualizerSilence.gain.value = 0;
    analyser.connect(visualizerSilence);
    visualizerSilence.connect(audioContext.destination);

    if (frameCoordinator) {
      frameCoordinator.subscribe('visualizer', visualizerTick, Priority.RENDER);
    } else {
      drawVisualizer();
    }
  } catch (error) {
    logError(
      'speech',
      'visualizer:init-error',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

function stopVisualizer(): void {
  if (frameCoordinator) {
    try {
      frameCoordinator.unsubscribe('visualizer');
    } catch {
      // ignore
    }
  }

  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
    visualizerAnimationId = null;
  }

  try {
    if (visualizerSource) {
      visualizerSource.disconnect();
      visualizerSource = null;
    }
    if (visualizerSilence) {
      visualizerSilence.disconnect();
      visualizerSilence = null;
    }
  } catch {
    // ignore
  }
}

function activateVoiceVisualizer(opts: VisualizerOptions = {}): void {
  const withVisualizer = opts.withVisualizer !== false;
  if (shimmer && typeof shimmer.show === 'function') {
    shimmer.show();
  }
  if (withVisualizer) {
    startVisualizer();
  }
}

function deactivateVoiceVisualizer(opts: VisualizerOptions = {}): void {
  stopVisualizer();
  if (shimmer && typeof shimmer.hide === 'function') {
    shimmer.hide();
  }
  if (!opts.keepStream) {
    releaseSharedAudioStream();
  }
}

// Legacy aliases
const showScreenSaver = activateVoiceVisualizer;
const hideScreenSaver = deactivateVoiceVisualizer;

function releaseMicForWebSpeech(): void {
  debugLog('speech', 'mic:release', {
    hasStream: !!sharedAudioStream,
    streamActive: sharedAudioStream ? sharedAudioStream.active : null,
    audioState: audioContext ? audioContext.state : null,
  });
  try {
    if (visualizerSource) {
      visualizerSource.disconnect();
      visualizerSource = null;
    }
    if (visualizerSilence) {
      visualizerSilence.disconnect();
      visualizerSilence = null;
    }
  } catch {
    // ignore
  }
  releaseSharedAudioStream();
  if (audioContext && audioContext.state === 'running') {
    try {
      audioContext.suspend();
    } catch {
      // ignore
    }
  }
}

function restoreMicAfterWebSpeech(): void {
  debugLog('speech', 'mic:restore', {
    audioState: audioContext ? audioContext.state : null,
  });
  if (audioContext && audioContext.state === 'suspended') {
    try {
      audioContext.resume();
    } catch {
      // ignore
    }
  }
}

// ===========================================
// SPEECH RECOGNITION
// ===========================================

function createRecognition(): SpeechRecognitionLocal | null {
  if (isElectron) return null;

  const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!SpeechRecognitionClass) {
    logError(
      'speech',
      'recognition:unsupported',
      'SpeechRecognition is not supported in this browser.'
    );
    return null;
  }

  const recog = new SpeechRecognitionClass();
  recog.lang = 'en-US';
  recog.interimResults = true;
  recog.continuous = true;
  recog.maxAlternatives = 3;

  recog.addEventListener('result', (event: SpeechRecognitionEventLocal) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      const firstAlt = result[0];
      if (!firstAlt) continue;
      if (result.isFinal) {
        let bestAlt = firstAlt;
        for (let j = 1; j < result.length; j++) {
          const alt = result[j];
          if (alt && alt.confidence > bestAlt.confidence) bestAlt = alt;
        }
        finalTranscript += bestAlt.transcript;
      } else {
        interimTranscript += firstAlt.transcript;
      }
    }
    const inputBox = document.getElementById('user-input') as HTMLInputElement | null;
    if (interimTranscript && inputBox) {
      inputBox.value = interimTranscript;
      inputBox.classList.add('interim');
    } else if (inputBox) {
      inputBox.classList.remove('interim');
    }
    if (finalTranscript && inputBox) {
      inputBox.value = '';
      inputBox.classList.remove('interim');
      enqueueTranscript(finalTranscript.trim());
    }
  });

  // Diagnostics
  recog.addEventListener('start', () => debugLog('speech', 'recognition:start', 'started'));
  recog.addEventListener('audiostart', () =>
    debugLog('speech', 'recognition:audiostart', 'audio started')
  );
  recog.addEventListener('soundstart', () =>
    debugLog('speech', 'recognition:soundstart', 'sound started')
  );
  recog.addEventListener('speechstart', () =>
    debugLog('speech', 'recognition:speechstart', 'speech started')
  );
  recog.addEventListener('speechend', () =>
    debugLog('speech', 'recognition:speechend', 'speech ended')
  );
  recog.addEventListener('soundend', () =>
    debugLog('speech', 'recognition:soundend', 'sound ended')
  );
  recog.addEventListener('audioend', () =>
    debugLog('speech', 'recognition:audioend', 'audio ended')
  );

  recog.addEventListener('end', () => {
    debugLog('speech', 'recognition:end', {
      shouldListen: shouldListen.value,
      isListening: isListening.value,
    });
    if (shouldListen.value) {
      setTimeout(() => {
        try {
          recog.start();
        } catch (e) {
          debugWarn(
            'speech',
            'recognition:restart-failed',
            e instanceof Error ? e.message : String(e)
          );
        }
      }, 120);
    } else {
      activeVoiceTransport = null;
      isListening.value = false;
      updateVoiceButtonUI(false);
      hideScreenSaver();
      restoreMicAfterWebSpeech();
    }
  });

  recog.addEventListener('error', (event: SpeechRecognitionErrorEventLocal) => {
    const err = event?.error || 'unknown';
    if (err === 'no-speech' || err === 'aborted') {
      debugWarn('speech', 'recognition:warning', err + ' - will retry');
      releaseMicForWebSpeech();
      return;
    }
    logError('speech', 'recognition:error', err);
    shouldListen.value = false;
    isListening.value = false;
    activeVoiceTransport = null;
    updateVoiceButtonUI(false);
    hideScreenSaver();
    restoreMicAfterWebSpeech();
    if (err === 'network') {
      markWebSpeechUnavailable('network');
      notifyVoiceUnavailable('network');
    }
  });

  return recog;
}

// ===========================================
// UI HELPERS
// ===========================================

function getVoiceInputButton(): HTMLElement | null {
  return document.getElementById('voice-input-button');
}

function updateVoiceButtonUI(listening: boolean): void {
  const btn = getVoiceInputButton();
  if (btn) {
    if (listening) {
      btn.classList.add('listening');
    } else {
      btn.classList.remove('listening');
    }
  }
}

function disableControls(): void {
  const sendBtn = document.getElementById('send-button') as HTMLButtonElement | null;
  if (sendBtn) {
    sendBtn.disabled = true;
    const sendIcon = sendBtn.querySelector('.send-icon') as HTMLElement | null;
    const spinner = sendBtn.querySelector('.spinner') as HTMLElement | null;
    if (sendIcon) sendIcon.hidden = true;
    if (spinner) spinner.hidden = false;
  }
}

function enableControls(): void {
  const sendBtn = document.getElementById('send-button') as HTMLButtonElement | null;
  if (sendBtn) {
    sendBtn.disabled = false;
    const sendIcon = sendBtn.querySelector('.send-icon') as HTMLElement | null;
    const spinner = sendBtn.querySelector('.spinner') as HTMLElement | null;
    if (sendIcon) sendIcon.hidden = false;
    if (spinner) spinner.hidden = true;
  }
}

function promptForVoiceKeys(): void {
  try {
    if (typeof win.openApiKeysModal === 'function') {
      win.openApiKeysModal();
      return;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof win.openSettingsModal === 'function') {
      win.openSettingsModal();
      return;
    }
    if (typeof win.handleMenuAction === 'function') {
      win.handleMenuAction('api-keys');
      return;
    }
  } catch {
    // ignore
  }
}

// ===========================================
// VOICE UNAVAILABLE HANDLING
// ===========================================

function markWebSpeechUnavailable(reason: string): void {
  if (!webSpeechAvailable) return;
  webSpeechAvailable = false;
  webSpeechBlockReason = reason || 'unknown';
  debugWarn(
    'speech',
    'webspeech:disabled',
    'Web Speech disabled for this session: ' + webSpeechBlockReason
  );
}

function voiceUnavailableMessage(reason: string | null = webSpeechBlockReason): string {
  if (reason === 'network') {
    return 'Voice dictation was blocked by a network or content filter in this browser.';
  }
  if (reason === 'native-missing') {
    return 'Voice dictation is unavailable in this desktop build (native speech bridge missing).';
  }
  if (reason === 'unsupported') {
    return 'Voice dictation is unavailable in this browser (Web Speech API missing).';
  }
  if (reason === 'denied') {
    return 'Microphone access was denied. Please allow microphone access and try again.';
  }
  if (!hasNativeWebSpeech) {
    return 'Voice dictation is unavailable in this browser (Web Speech API missing).';
  }
  return 'Voice dictation is currently unavailable. Please try again or switch browsers.';
}

function notifyVoiceUnavailable(reason: string): void {
  const message = voiceUnavailableMessage(reason);
  try {
    win.appendNotifs?.('error', message);
  } catch {
    // ignore
  }
}

// ===========================================
// TRANSPORT MANAGEMENT
// ===========================================

function stopActiveVoiceTransport(): void {
  switch (activeVoiceTransport) {
    case 'electron-native':
      try {
        if (win.electronSpeech?.stop) {
          win.electronSpeech.stop();
        }
      } catch {
        // ignore
      }
      break;
    case 'web-speech':
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }
      break;
    default:
      break;
  }
  activeVoiceTransport = null;
}

function forceStopVoiceInput(): void {
  stopActiveVoiceTransport();
  isVoiceActive.value = false;
  shouldListen.value = false;
  if (isListening.value) {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }
    isListening.value = false;
  }
  updateVoiceButtonUI(false);
  hideScreenSaver();
  enableControls();
}

// ===========================================
// SPEECH PROCESSING QUEUE
// ===========================================

function enqueueTranscript(text: string): void {
  pendingTranscripts.push(text);
  processSpeechQueue();
}

async function processSpeechQueue(): Promise<void> {
  if (isProcessingSpeech || pendingTranscripts.length === 0) return;
  isProcessingSpeech = true;
  disableControls();
  const transcript = pendingTranscripts.shift()!;

  if (handleVoiceCommand(transcript)) {
    enableControls();
    isProcessingSpeech = false;
    processSpeechQueue();
    return;
  }

  try {
    const inputBox = document.getElementById('user-input') as HTMLInputElement | null;
    if (inputBox) inputBox.value = transcript;
    await win.sendMessage?.();
    if (inputBox) {
      inputBox.value = '';
      inputBox.classList.remove('interim');
    }
  } catch (err) {
    logError('speech', 'message:send-error', err instanceof Error ? err : new Error(String(err)));
  } finally {
    enableControls();
    isProcessingSpeech = false;
    processSpeechQueue();
  }
}

// ===========================================
// ELECTRON TRANSCRIPT HANDLER
// ===========================================

function setupElectronTranscriptHandler(): void {
  if (!isElectron || !win.electronSpeech?.onTranscript) return;

  const eventBus = useEventBus();

  win.electronSpeech.onTranscript(({ text, isFinal }: TranscriptEvent) => {
    const raw = (text || '').trim();
    let delta = raw;
    if (electronLastSentTranscript && delta.startsWith(electronLastSentTranscript)) {
      delta = delta.slice(electronLastSentTranscript.length).trim();
    }

    // Emit transcript to InputBar via EventBus (preserves Vue reactivity)
    eventBus.emit('speech:transcript', { text: delta, isFinal: isFinal === true });

    if (electronTranscriptDebounce) clearTimeout(electronTranscriptDebounce);

    if (isFinal === true) {
      let finalDelta = text.trim();
      if (electronLastSentTranscript && finalDelta.startsWith(electronLastSentTranscript)) {
        finalDelta = finalDelta.slice(electronLastSentTranscript.length).trim();
      }
      if (finalDelta) {
        enqueueTranscript(finalDelta);
        electronLastSentTranscript = text.trim();
      }
      return;
    }

    electronTranscriptDebounce = setTimeout(() => {
      if (delta) {
        enqueueTranscript(delta);
        electronLastSentTranscript = raw;
      }
      // Clear input via event bus
      eventBus.emit('speech:transcript', { text: '', isFinal: false });
    }, 2500);
  });
}

// ===========================================
// DICTATION MENU HANDLER
// ===========================================

function setupDictationMenuHandler(): void {
  if (!win.electronDictationMenu?.onToggle) return;

  win.electronDictationMenu.onToggle((state: 'start' | 'stop') => {
    const starting = state === 'start';
    if (starting && !isVoiceActive.value) {
      isVoiceActive.value = true;
      activeVoiceTransport = 'electron-native';
      updateVoiceButtonUI(true);
      showScreenSaver();
      disableControls();
    } else if (!starting && isVoiceActive.value) {
      isVoiceActive.value = false;
      activeVoiceTransport = null;
      updateVoiceButtonUI(false);
      hideScreenSaver();
      enableControls();
    }
  });
}

// ===========================================
// VOICE INPUT BUTTON HANDLER
// ===========================================

async function handleVoiceButtonClick(event?: Event): Promise<void> {
  if (voiceInputLocked) {
    try {
      event?.preventDefault?.();
    } catch {
      // ignore
    }
    promptForVoiceKeys();
    return;
  }

  const isDesktop = navigator.userAgent.toLowerCase().includes('electron');

  if (isDesktop) {
    if (win.electronSpeech?.start) {
      try {
        let status = await win.electronSpeech.requestAuthorization();
        debugLog('speech', 'auth:initial', status);

        if (status === 'notDetermined') {
          try {
            win.appendNotifs?.('info', 'Please grant speech recognition permission when prompted.');
          } catch {
            // ignore
          }
          for (let i = 0; i < 10 && status === 'notDetermined'; i++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            status = await win.electronSpeech.requestAuthorization();
            debugLog('speech', 'auth:check', i + 1, status);
          }
        }

        if (status === 'denied' || status === 'restricted') {
          try {
            win.appendNotifs?.(
              'error',
              'Speech access denied. Enable in System Settings > Privacy & Security > Speech Recognition.'
            );
          } catch {
            // ignore
          }
          return;
        }

        if (status === 'notDetermined') {
          debugWarn(
            'speech',
            'auth:timeout',
            'Authorization still notDetermined after waiting - proceeding anyway'
          );
        }
      } catch (e) {
        logError('speech', 'auth:failed', e instanceof Error ? e : new Error(String(e)));
      }

      if (!isVoiceActive.value) {
        isVoiceActive.value = true;
        electronLastSentTranscript = '';
        win.electronSpeech.start();
        activeVoiceTransport = 'electron-native';
        updateVoiceButtonUI(true);
        showScreenSaver({ withVisualizer: true });
        disableControls();
      } else {
        isVoiceActive.value = false;
        win.electronSpeech.stop();
        activeVoiceTransport = null;
        updateVoiceButtonUI(false);
        hideScreenSaver();
        enableControls();
      }
      return;
    }

    notifyVoiceUnavailable('native-missing');
    return;
  }

  // Web build
  if (!webSpeechAvailable) {
    const reason = webSpeechBlockReason || (hasNativeWebSpeech ? 'network' : 'unsupported');
    notifyVoiceUnavailable(reason);
    return;
  }

  if (!recognition) recognition = createRecognition();
  shouldListen.value = !shouldListen.value;

  if (shouldListen.value) {
    debugLog('speech', 'webspeech:start', {
      shouldListen: shouldListen.value,
      isListening: isListening.value,
    });

    // Pre-request microphone permission before starting Web Speech
    // This ensures permission is granted before recognition.start() is called
    // Fixes issue where first-time permission grant doesn't start recognition
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release mic immediately so Web Speech API can use it
      stream.getTracks().forEach((track) => track.stop());
    } catch (permErr) {
      logError(
        'speech',
        'mic:denied',
        permErr instanceof Error ? permErr : new Error(String(permErr))
      );
      shouldListen.value = false;
      notifyVoiceUnavailable('denied');
      return;
    }

    try {
      recognition?.start();
    } catch (e) {
      debugWarn('speech', 'recognition:start-failed', e instanceof Error ? e.message : String(e));
    }
    isListening.value = true;
    activeVoiceTransport = 'web-speech';
    updateVoiceButtonUI(true);
    showScreenSaver({ withVisualizer: true });
    disableControls();
  } else {
    try {
      recognition?.stop();
    } catch {
      // ignore
    }
    isListening.value = false;
    activeVoiceTransport = null;
    updateVoiceButtonUI(false);
    hideScreenSaver();
    enableControls();
  }
}

// ===========================================
// INTENT TARGET REGISTRATION
// ===========================================

function registerVoiceTargets(): void {
  if (!win.intentCoordinator) {
    setTimeout(registerVoiceTargets, 100);
    return;
  }

  const { registerTarget } = win.intentCoordinator;

  // Notes panel
  registerTarget('notes', {
    zone: null,
    actions: ['toggle', 'set'],
    handler: (intent) => {
      const container = document.getElementById('notes-container');
      const btn = document.getElementById('notes-toggle-button');
      if (!btn) return;

      if (intent.action === 'toggle') {
        btn.click();
      } else if (intent.action === 'set') {
        const isHidden = container?.classList.contains('hidden');
        const shouldShow = intent.value === true;
        if ((shouldShow && isHidden) || (!shouldShow && !isHidden)) {
          btn.click();
        }
      }
    },
  });

  // Note: 'help' target moved to HelpPane.vue
  // Note: 'voiceCommands' target moved to VoiceCommandsPane.vue

  // Email notes
  registerTarget('notesEmail', {
    zone: null,
    actions: ['activate'],
    handler: () => {
      const btn = document.querySelector(
        '#notes-toolbar button[data-action="email"]'
      ) as HTMLElement | null;
      btn?.click();
    },
  });

  // Upload
  registerTarget('upload', {
    zone: null,
    actions: ['activate'],
    handler: () => {
      document.getElementById('upload-button')?.click();
    },
  });

  // Workspace
  registerTarget('workspace', {
    zone: null,
    actions: ['activate'],
    handler: (intent) => {
      if (intent.value === 'save') {
        document.getElementById('menu-save-workspace-button')?.click();
      } else if (intent.value === 'load') {
        document.getElementById('menu-load-workspace-button')?.click();
      }
    },
  });

  // Grid
  registerTarget('grid', {
    zone: null,
    actions: ['toggle', 'set'],
    handler: (intent) => {
      const overlay = document.getElementById('grid-overlay');
      const btn = document.getElementById('menu-grid-toggle-button');
      if (!btn) return;

      const isHidden = overlay?.classList.contains('hidden');

      if (intent.action === 'toggle') {
        btn.click();
      } else if (intent.action === 'set') {
        const shouldShow = intent.value === true;
        if ((shouldShow && isHidden) || (!shouldShow && !isHidden)) {
          btn.click();
        }
      }
    },
  });

  // Note: 'model3d' target moved to ModelViewer.vue

  // New chat
  registerTarget('newChat', {
    zone: null,
    actions: ['activate'],
    handler: () => {
      if (typeof win.startNewChat === 'function') {
        win.startNewChat();
      } else {
        document.getElementById('new-chat-button')?.click();
      }
    },
  });

  // Send to notes
  registerTarget('sendToNotes', {
    zone: null,
    actions: ['activate'],
    handler: () => {
      if (typeof win.appendLastAssistantMessageToNotesFull === 'function') {
        win.appendLastAssistantMessageToNotesFull();
      }
    },
  });

  // Note: 'theme' target moved to useTheme.ts

  debugLog('speech', 'targets:registered', 'Registered fallback intent targets');
}

// ===========================================
// INITIALIZATION
// ===========================================

function initSpeech(): void {
  // Set up Electron handlers
  setupElectronTranscriptHandler();
  setupDictationMenuHandler();

  // Listen for voice input lock events
  window.addEventListener('prv:voice-input-lock', ((event: CustomEvent<{ locked: boolean }>) => {
    voiceInputLocked = !!event?.detail?.locked;
    if (voiceInputLocked) {
      forceStopVoiceInput();
    }
  }) as EventListener);

  // Listen for voice toggle events from skills/actions
  const eventBus = useEventBus();
  eventBus.on('voice:toggle', () => handleVoiceButtonClick());

  // Register intent targets
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerVoiceTargets);
  } else {
    registerVoiceTargets();
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    releaseSharedAudioStream();
  });

  // Expose debug globals (dev only)
  if (import.meta.env.DEV) {
    win.showScreenSaver = showScreenSaver;
    win.hideScreenSaver = hideScreenSaver;
  }
  // stopVoiceInput is used at runtime by handtrack.ts
  win.stopVoiceInput = forceStopVoiceInput;
}

// ===========================================
// COMPOSABLE EXPORT
// ===========================================

export interface UseSpeechReturn {
  /** Whether voice input is currently listening */
  isListening: Ref<boolean>;
  /** Whether voice is actively capturing (electron or web) */
  isVoiceActive: Ref<boolean>;
  /** Whether recognition should continue after pauses */
  shouldListen: Ref<boolean>;
  /** Toggle voice input on/off */
  toggleVoice: (event?: Event) => Promise<void>;
  /** Force stop all voice input */
  forceStop: () => void;
  /** Initialize the speech system */
  init: () => void;
  /** Show voice visualizer */
  showVisualizer: (opts?: VisualizerOptions) => void;
  /** Hide voice visualizer */
  hideVisualizer: (opts?: VisualizerOptions) => void;
}

export function useSpeech(): UseSpeechReturn {
  return {
    isListening,
    isVoiceActive,
    shouldListen,
    toggleVoice: handleVoiceButtonClick,
    forceStop: forceStopVoiceInput,
    init: initSpeech,
    showVisualizer: activateVoiceVisualizer,
    hideVisualizer: deactivateVoiceVisualizer,
  };
}

// Auto-initialize for backwards compatibility
if (typeof window !== 'undefined') {
  initSpeech();
}

export default useSpeech;
