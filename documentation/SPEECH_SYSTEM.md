# Speech/Voice System Documentation

> **Why this doc:** The Speech system handles voice input with dual-path support for Electron and browser environments. Read this when working on voice commands, transcript processing, or audio visualization.
>
> **Related systems:** [INTENT_COORDINATOR_SYSTEM.md](./INTENT_COORDINATOR_SYSTEM.md) | [CHAT_STORE_SYSTEM.md](./CHAT_STORE_SYSTEM.md) | [FRAME_COORDINATOR_SYSTEM.md](./FRAME_COORDINATOR_SYSTEM.md)
> **Architecture context:** [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) | [CODEMAP.md](./CODEMAP.md)

The Speech system provides voice input for prvctice, with dual-path support for Electron (native macOS speech) and browser (Web Speech API). It integrates audio visualization, voice command handling, and transcript processing.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Concepts](#core-concepts)
3. [Contract and Invariants](#contract-and-invariants)
4. [Data Flow](#data-flow)
5. [Transport Selection Algorithm](#transport-selection-algorithm)
6. [Audio Context and Visualizer](#audio-context-and-visualizer)
7. [Voice Command Handling](#voice-command-handling)
8. [Transcript Processing](#transcript-processing)
9. [Configuration Reference](#configuration-reference)
10. [Failure Modes](#failure-modes)
11. [Code Examples](#code-examples)
12. [File Reference](#file-reference)
13. [Reference Mapping](#reference-mapping)
14. [Changelog](#changelog)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERACTION                                   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │               Voice Input Button Click / Menu Toggle                        ││
│  └──────────────────────────────────┬──────────────────────────────────────────┘│
└─────────────────────────────────────┼───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TRANSPORT SELECTION                                    │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │    Is Electron?  ─── Yes ───▶  Has electronSpeech? ─── Yes ──▶ ELECTRON   │  │
│  │         │                              │                        NATIVE    │  │
│  │         │                              No                                 │  │
│  │         │                              │                                  │  │
│  │         │                              ▼                                  │  │
│  │         No                     Notify: native-missing                     │  │
│  │         │                              │                                  │  │
│  │         │                              ▼                                  │  │
│  │         │                           (abort)                               │  │
│  │         │                                                                 │  │
│  │         ▼                                                                 │  │
│  │    Has Web Speech API?  ─── Yes ───▶  webSpeechAvailable? ──▶ WEB SPEECH  │  │
│  │         │                                   │                             │  │
│  │         No                                  No (blocked by network)       │  │
│  │         │                                   │                             │  │
│  │         ▼                                   ▼                             │  │
│  │    Notify: unsupported              Notify: network                       │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────────┐
│       ELECTRON NATIVE PATH        │   │         WEB SPEECH API PATH           │
│                                   │   │                                       │
│  ┌─────────────────────────────┐  │   │  ┌─────────────────────────────────┐  │
│  │   window.electronSpeech     │  │   │  │    SpeechRecognition Object     │  │
│  │   (IPC to native bridge)    │  │   │  │    (browser-provided)           │  │
│  └──────────────┬──────────────┘  │   │  └──────────────┬──────────────────┘  │
│                 │                 │   │                 │                     │
│                 ▼                 │   │                 ▼                     │
│  ┌─────────────────────────────┐  │   │  ┌─────────────────────────────────┐  │
│  │  macOS Speech Recognition   │  │   │  │   Browser Speech Recognition    │  │
│  │  (System-level, offline)    │  │   │  │   (Cloud-based, requires net)   │  │
│  └──────────────┬──────────────┘  │   │  └──────────────┬──────────────────┘  │
│                 │                 │   │                 │                     │
│                 ▼                 │   │                 ▼                     │
│  ┌─────────────────────────────┐  │   │  ┌─────────────────────────────────┐  │
│  │     onTranscript(event)     │  │   │  │  addEventListener('result')     │  │
│  │     { text, isFinal }       │  │   │  │  { results[].transcript }       │  │
│  └──────────────┬──────────────┘  │   │  └──────────────┬──────────────────┘  │
│                 │                 │   │                 │                     │
└─────────────────┼─────────────────┘   └─────────────────┼─────────────────────┘
                  │                                       │
                  └───────────────────┬───────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TRANSCRIPT PROCESSING                                  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  1. Emit 'speech:transcript' to EventBus (for InputBar interim display)   │  │
│  │                                                                           │  │
│  │  2. On final transcript:                                                  │  │
│  │     ├── Check for voice command match (handleVoiceCommand)                │  │
│  │     │         ├── If match: emit VoiceIntent to IntentCoordinator         │  │
│  │     │         └── Return (don't send to chat)                             │  │
│  │     │                                                                     │  │
│  │     └── If no command match:                                              │  │
│  │               ├── Set text in input box                                   │  │
│  │               └── Call sendMessage() to send to AI                        │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AUDIO VISUALIZATION                                   │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  ┌─────────────────┐    ┌────────────────┐    ┌─────────────────────────┐ │  │
│  │  │ getUserMedia()  │───▶│ AudioContext   │───▶│   AnalyserNode          │ │  │
│  │  │ (microphone)    │    │ (Web Audio)    │    │   (FFT frequency data)  │ │  │
│  │  └─────────────────┘    └────────────────┘    └───────────┬─────────────┘ │  │
│  │                                                           │               │  │
│  │                                                           ▼               │  │
│  │                                                ┌─────────────────────────┐│  │
│  │                                                │   shimmer.updateAudio() ││  │
│  │                                                │   (edge glow effects)   ││  │
│  │                                                └───────────┬─────────────┘│  │
│  │                                                            │              │  │
│  │                                                            ▼              │  │
│  │                                                ┌─────────────────────────┐│  │
│  │                                                │   Silence Detection     ││  │
│  │                                                │   (auto-stop after 60s) ││  │
│  │                                                └─────────────────────────┘│  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Voice Transport

The system supports two speech recognition transports:

```typescript
type VoiceTransport = 'electron-native' | 'web-speech' | null;
```

| Transport         | Environment          | Characteristics                                                                  |
| ----------------- | -------------------- | -------------------------------------------------------------------------------- |
| `electron-native` | Electron desktop app | Uses macOS SFSpeechRecognizer via IPC, works offline, requires system permission |
| `web-speech`      | Browser              | Uses Web Speech API, cloud-based (Chrome), may be blocked by network filters     |

### TranscriptEvent

Both transports normalize to a common transcript format:

```typescript
interface TranscriptEvent {
  text: string; // The recognized speech text
  isFinal?: boolean; // true = complete utterance, false = interim result
}
```

### VoiceIntent

Voice commands are emitted as intents to the IntentCoordinator:

```typescript
interface VoiceIntent {
  source: 'voice'; // Always 'voice' for speech-originating intents
  action: string; // 'toggle', 'set', 'activate', 'submit'
  target: string; // Target ID: 'notes', 'help', 'theme', etc.
  value?: unknown; // Optional payload (e.g., { text: string } for submit)
  timestamp: number; // Auto-generated timestamp
}
```

### UseSpeechReturn

The composable's public interface:

```typescript
interface UseSpeechReturn {
  isListening: Ref<boolean>; // Web Speech currently capturing
  isVoiceActive: Ref<boolean>; // Voice active (either transport)
  shouldListen: Ref<boolean>; // Should auto-restart on end
  toggleVoice: (event?: Event) => Promise<void>; // Start/stop
  forceStop: () => void; // Force stop all voice input
  init: () => void; // Initialize the system
  showVisualizer: (opts?: VisualizerOptions) => void;
  hideVisualizer: (opts?: VisualizerOptions) => void;
}
```

---

## Contract and Invariants

### State Guarantees

| State                  | Guarantee                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| `isVoiceActive`        | True when either transport is actively capturing audio               |
| `isListening`          | True only for Web Speech API (not used for Electron)                 |
| `activeVoiceTransport` | Never transitions without calling `stopActiveVoiceTransport()` first |
| `pendingTranscripts`   | Processed in FIFO order, one at a time                               |

### Transport Mutual Exclusion

Only one transport is active at a time. The `activeVoiceTransport` variable tracks which:

```
                              ┌─────────────────────────┐
                              │  activeVoiceTransport   │
                              │                         │
              ┌───────────────┤  'electron-native'      │
              │               │         OR              │
              │               │  'web-speech'           │
              │               │         OR              │
              │               │  null (idle)            │
              │               └─────────────────────────┘
              │
              ▼
     ┌─────────────────────────────────────────────────┐
     │  Only ONE transport may be non-null at a time   │
     │                                                 │
     │  Before starting new transport:                 │
     │    stopActiveVoiceTransport()                   │
     │    (cleans up previous)                         │
     └─────────────────────────────────────────────────┘
```

### Transcript Processing Guarantees

| Guarantee            | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| **Sequential**       | Only one transcript processed at a time (`isProcessingSpeech` flag) |
| **Command Priority** | Voice commands checked before sending to chat                       |
| **Queue Drain**      | Queue continues processing after each transcript completes          |
| **Error Isolation**  | Failed sendMessage() doesn't break the queue                        |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SPEECH RECOGNITION LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER STARTS VOICE INPUT                                                 │
│     ┌──────────────────────┐                                                │
│     │ handleVoiceButton    │                                                │
│     │ Click() called       │                                                │
│     └────────┬─────────────┘                                                │
│              │                                                              │
│              ▼                                                              │
│  2. TRANSPORT SELECTION                                                     │
│     ┌──────────────────────┐                                                │
│     │ if (isElectron &&    │                                                │
│     │   electronSpeech)    │                                                │
│     │   → electron-native  │                                                │
│     │ else if (webSpeech)  │                                                │
│     │   → web-speech       │                                                │
│     │ else → notify error  │                                                │
│     └────────┬─────────────┘                                                │
│              │                                                              │
│              ▼                                                              │
│  3. PERMISSION CHECK                                                        │
│     ┌──────────────────────┐                                                │
│     │ Electron:            │                                                │
│     │   requestAuthorize() │                                                │
│     │   + polling loop     │                                                │
│     │                      │                                                │
│     │ Web:                 │                                                │
│     │   getUserMedia()     │                                                │
│     │   (pre-request mic)  │                                                │
│     └────────┬─────────────┘                                                │
│              │                                                              │
│              ▼                                                              │
│  4. START RECOGNITION                                                       │
│     ┌──────────────────────┐                                                │
│     │ activeVoiceTransport │                                                │
│     │   = chosen transport │                                                │
│     │                      │                                                │
│     │ isVoiceActive = true │                                                │
│     │ showScreenSaver()    │                                                │
│     │ disableControls()    │                                                │
│     └────────┬─────────────┘                                                │
│              │                                                              │
│              ▼                                                              │
│  5. TRANSCRIPT RECEIVED                                                     │
│     ┌──────────────────────┐                                                │
│     │ Interim:             │                                                │
│     │   → EventBus emit    │                                                │
│     │   → InputBar shows   │                                                │
│     │                      │                                                │
│     │ Final:               │                                                │
│     │   → enqueueTranscript│                                                │
│     └────────┬─────────────┘                                                │
│              │                                                              │
│              ▼                                                              │
│  6. PROCESS TRANSCRIPT                                                      │
│     ┌──────────────────────┐                                                │
│     │ if (handleVoice      │                                                │
│     │     Command())       │                                                │
│     │   → Intent emitted   │                                                │
│     │   → return           │                                                │
│     │                      │                                                │
│     │ else:                │                                                │
│     │   → sendMessage()    │                                                │
│     └────────┬─────────────┘                                                │
│              │                                                              │
│              ▼                                                              │
│  7. USER STOPS / SILENCE DETECTED                                           │
│     ┌──────────────────────┐                                                │
│     │ stopActiveVoice      │                                                │
│     │   Transport()        │                                                │
│     │ isVoiceActive = false│                                                │
│     │ hideScreenSaver()    │                                                │
│     │ enableControls()     │                                                │
│     └──────────────────────┘                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Transport Selection Algorithm

The transport selection follows a strict priority order:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRANSPORT SELECTION DECISION TREE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  handleVoiceButtonClick()                                                   │
│  │                                                                          │
│  ├── voiceInputLocked?                                                      │
│  │   └── Yes → promptForVoiceKeys() → ABORT                                 │
│  │                                                                          │
│  ├── isElectron? (from navigator.userAgent)                                 │
│  │   │                                                                      │
│  │   ├── Yes: ELECTRON PATH                                                 │
│  │   │   ├── window.electronSpeech?.start exists?                           │
│  │   │   │   ├── Yes → requestAuthorization() → wait for permission         │
│  │   │   │   │         └── If denied/restricted → notify → ABORT            │
│  │   │   │   │         └── If authorized → START electron-native            │
│  │   │   │   │                                                              │
│  │   │   │   └── No → notifyVoiceUnavailable('native-missing') → ABORT      │
│  │   │   │                                                                  │
│  │   │   └── (Note: Electron never falls back to Web Speech)                │
│  │   │                                                                      │
│  │   └── No: WEB PATH                                                       │
│  │       ├── webSpeechAvailable?                                            │
│  │       │   ├── Yes → Pre-request getUserMedia() for permission            │
│  │       │   │         └── If denied → notify('denied') → ABORT             │
│  │       │   │         └── If granted → recognition.start() → web-speech    │
│  │       │   │                                                              │
│  │       │   └── No → notifyVoiceUnavailable(reason) → ABORT                │
│  │       │           Reasons: 'network', 'unsupported'                      │
│  │                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Electron Authorization Flow

macOS requires explicit permission for speech recognition:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                  ELECTRON AUTHORIZATION STATE MACHINE                     │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│   requestAuthorization() → Returns status string:                         │
│                                                                           │
│   ┌──────────────────┐                                                    │
│   │  'authorized'    │ ────────────────────────────────▶ START RECOGNITION│
│   └──────────────────┘                                                    │
│                                                                           │
│   ┌──────────────────┐                                                    │
│   │ 'notDetermined'  │ ────▶ Show notification ────▶ Poll up to 10 times  │
│   └──────────────────┘       (500ms intervals)                            │
│           │                        │                                      │
│           │                        ▼                                      │
│           │               Status changed?                                 │
│           │               ├── 'authorized' → START RECOGNITION            │
│           │               ├── 'denied'/'restricted' → NOTIFY + ABORT      │
│           │               └── Still 'notDetermined' → Proceed anyway      │
│           │                                                               │
│   ┌──────────────────┐                                                    │
│   │    'denied'      │ ────────────────────────────────▶ NOTIFY + ABORT   │
│   └──────────────────┘                                                    │
│           │                                                               │
│           ▼                                                               │
│   Show error: "Enable in System Settings > Privacy & Security > Speech"   │
│                                                                           │
│   ┌──────────────────┐                                                    │
│   │   'restricted'   │ ────────────────────────────────▶ NOTIFY + ABORT   │
│   └──────────────────┘                                                    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Audio Context and Visualizer

The visualizer provides audio-reactive edge glow effects during voice input:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUDIO VISUALIZER ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AUDIO PIPELINE                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  getUserMedia({ audio: true })                                          ││
│  │         │                                                               ││
│  │         ▼                                                               ││
│  │  ┌─────────────────┐                                                    ││
│  │  │  MediaStream    │ ─────────────────────────────────┐                 ││
│  │  │  (microphone)   │                                  │                 ││
│  │  └────────┬────────┘                                  │                 ││
│  │           │                                           │                 ││
│  │           ▼                                           │                 ││
│  │  ┌─────────────────┐     ┌─────────────────┐    ┌────▼────────────────┐ ││
│  │  │  AudioContext   │ ──▶ │ MediaStreamAudio│ ──▶│   AnalyserNode      │ ││
│  │  │                 │     │ SourceNode      │    │   (fftSize: 1024)   │ ││
│  │  └─────────────────┘     └─────────────────┘    └──────────┬──────────┘ ││
│  │                                                            │            ││
│  │                                                            ▼            ││
│  │                                                 ┌─────────────────────┐ ││
│  │                                                 │  GainNode (0 gain)  │ ││
│  │                                                 │  (silence output)   │ ││
│  │                                                 └──────────┬──────────┘ ││
│  │                                                            │            ││
│  │                                                            ▼            ││
│  │                                                 ┌─────────────────────┐ ││
│  │                                                 │  destination        │ ││
│  │                                                 │  (speakers - muted) │ ││
│  │                                                 └─────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  VISUALIZATION LOOP (via frameCoordinator at RENDER priority)               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  visualizerTick() called each frame:                                    ││
│  │                                                                         ││
│  │  1. analyser.getByteFrequencyData(dataArray)                            ││
│  │     └── Fills Uint8Array[512] with frequency magnitudes (0-255)         ││
│  │                                                                         ││
│  │  2. Calculate average amplitude:                                        ││
│  │     sum = Σ dataArray[i] / length                                       ││
│  │                                                                         ││
│  │  3. Normalize to 0-1 range:                                             ││
│  │     normalizedLevel = clamp((avg - 5) / 60, 0, 1)                       ││
│  │                                                                         ││
│  │  4. shimmer.updateAudio(normalizedLevel)                                ││
│  │     └── Edge glow responds to voice volume                              ││
│  │                                                                         ││
│  │  5. Silence detection:                                                  ││
│  │     if (avg < silenceThreshold) {                                       ││
│  │       if (silenceStartTime == null) silenceStartTime = now              ││
│  │       if (now - silenceStartTime > 60000) STOP RECOGNITION              ││
│  │     } else {                                                            ││
│  │       silenceStartTime = null                                           ││
│  │     }                                                                   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Shimmer Integration

The shimmer module provides the visual effect:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         SHIMMER INTEGRATION                               │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  shimmer.show()                                                           │
│  ├── Creates canvas overlay (z-index: 800)                                │
│  ├── Subscribes to frameCoordinator at RENDER priority                    │
│  └── Starts breathing animation                                           │
│                                                                           │
│  shimmer.updateAudio(level)                                               │
│  ├── Normalizes level against dynamic peak (auto-gain)                    │
│  ├── Applies sensitivity curve: level^0.4                                 │
│  └── Drives edge glow reach + intensity                                   │
│                                                                           │
│  shimmer.hide()                                                           │
│  ├── Fades out canvas (300ms transition)                                  │
│  ├── Unsubscribes from frameCoordinator                                   │
│  └── Resets audio normalization state                                     │
│                                                                           │
│  Visual appearance:                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                                                                    │   │
│  │  ╭────────────────────────────────────────────────────────────────╮│   │
│  │  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░││   │
│  │  │░                                                              ░││   │
│  │  │░   ┌──────────────────────────────────────────────────────┐   ░││   │
│  │  │░   │                                                      │   ░││   │
│  │  │░   │           Application Content Area                   │   ░││   │
│  │  │░   │                                                      │   ░││   │
│  │  │░   │                                                      │   ░││   │
│  │  │░   └──────────────────────────────────────────────────────┘   ░││   │
│  │  │░                                                              ░││   │
│  │  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░││   │
│  │  ╰────────────────────────────────────────────────────────────────╯│   │
│  │                                                                    │   │
│  │  ░ = Edge glow blobs (theme-colored, audio-reactive)               │   │
│  │      - Reach expands with volume (0.7 → 0.99 of screen)            │   │
│  │      - Intensity increases with volume (0.4 → 1.0)                 │   │
│  │      - Organic wobble animation                                    │   │
│  │                                                                    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Voice Command Handling

Voice commands are regex-matched and routed to the IntentCoordinator:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VOICE COMMAND REGISTRY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  handleVoiceCommand(text) → boolean                                         │
│  Returns true if command matched (prevents sending to chat)                 │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Category    │ Pattern                      │ Intent                   │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ Notes       │ "open/show notes"            │ set notes true           │  │
│  │             │ "close/hide notes"           │ set notes false          │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ Help        │ "open/show help/tips/guide"  │ set help true            │  │
│  │             │ "close/hide help"            │ set help false           │  │
│  │             │ "help" (standalone)          │ toggle help              │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ Voice Cmds  │ "open voice commands"        │ set voiceCommands true   │  │
│  │             │ "close voice commands"       │ set voiceCommands false  │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ Chat        │ "what do you think?"         │ submit inputBar with     │  │
│  │             │                              │ selected/all notes text  │  │
│  │             │ "new chat" / "start new chat"│ activate newChat         │  │
│  │             │ "send to notes"              │ activate sendToNotes     │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ Actions     │ "email notes"                │ activate notesEmail      │  │
│  │             │ "attach image"               │ activate upload          │  │
│  │             │ "save workspace"             │ activate workspace save  │  │
│  │             │ "load workspace"             │ activate workspace load  │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ UI Toggles  │ "grid" / "show/hide grid"    │ set grid true/false      │  │
│  │             │ "where's lulu?"              │ toggle model3d           │  │
│  ├─────────────┼──────────────────────────────┼──────────────────────────┤  │
│  │ Theme       │ "dark mode/theme"            │ set theme 'dark'         │  │
│  │             │ "light mode/theme"           │ set theme 'light'        │  │
│  │             │ "minimal" / "reduce dist..."  │ set theme 'minimal'     │  │
│  └─────────────┴──────────────────────────────┴──────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Transcript Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TRANSCRIPT PROCESSING QUEUE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  QUEUE STATE                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  pendingTranscripts: string[] = []                                     │ │
│  │  isProcessingSpeech: boolean = false                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  enqueueTranscript(text)                                                    │
│  │                                                                          │
│  ├── pendingTranscripts.push(text)                                          │
│  └── processSpeechQueue()                                                   │
│                                                                             │
│  processSpeechQueue()                                                       │
│  │                                                                          │
│  ├── if (isProcessingSpeech || queue.length === 0) return                   │
│  │                                                                          │
│  ├── isProcessingSpeech = true                                              │
│  ├── disableControls()  (show spinner)                                      │
│  │                                                                          │
│  ├── transcript = queue.shift()                                             │
│  │                                                                          │
│  ├── if (handleVoiceCommand(transcript))                                    │
│  │   └── enableControls() → processSpeechQueue() → return                   │
│  │                                                                          │
│  ├── try:                                                                   │
│  │   ├── inputBox.value = transcript                                        │
│  │   ├── await window.sendMessage()                                         │
│  │   └── inputBox.value = ''                                                │
│  │                                                                          │
│  ├── finally:                                                               │
│  │   ├── enableControls()                                                   │
│  │   ├── isProcessingSpeech = false                                         │
│  │   └── processSpeechQueue()  (process next)                               │
│  │                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Electron Transcript Debouncing

Electron's native speech sends continuous interim results. Debouncing prevents sending incomplete phrases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ELECTRON TRANSCRIPT DEBOUNCE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  onTranscript({ text, isFinal })                                            │
│  │                                                                          │
│  ├── Calculate delta (remove previously sent prefix)                        │
│  │   raw = text.trim()                                                      │
│  │   delta = raw.startsWith(lastSent) ? raw.slice(lastSent.length) : raw    │
│  │                                                                          │
│  ├── EventBus.emit('speech:transcript', { text: delta, isFinal })           │
│  │   └── InputBar displays interim text                                     │
│  │                                                                          │
│  ├── clearTimeout(debounce)                                                 │
│  │                                                                          │
│  ├── if (isFinal):                                                          │
│  │   ├── enqueueTranscript(delta)                                           │
│  │   └── lastSent = text.trim()                                             │
│  │                                                                          │
│  └── else (interim):                                                        │
│      └── debounce = setTimeout(2500ms):                                     │
│          ├── enqueueTranscript(delta)                                       │
│          ├── lastSent = raw                                                 │
│          └── EventBus.emit('speech:transcript', { text: '', isFinal: false })│
│              └── Clear InputBar                                             │
│                                                                             │
│  TIMING DIAGRAM                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  User speaks: "Hello how are you"                                      │ │
│  │                                                                        │ │
│  │  Time ────────────────────────────────────────────────────▶            │ │
│  │                                                                        │ │
│  │  0ms     "Hello"          │ Interim → show in InputBar                 │ │
│  │  100ms   "Hello how"      │ Interim → update InputBar, reset debounce  │ │
│  │  300ms   "Hello how are"  │ Interim → update InputBar, reset debounce  │ │
│  │  500ms   "Hello how are you" │ isFinal=true → enqueue immediately      │ │
│  │                                                                        │ │
│  │  OR if no isFinal (speech pauses):                                     │ │
│  │  500ms   "Hello how are you" │ Interim, start 2500ms debounce          │ │
│  │  3000ms  (silence)           │ Debounce fires → enqueue + clear        │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

### Module-Level Constants

| Constant             | Value   | Source                 | Description                                                    |
| -------------------- | ------- | ---------------------- | -------------------------------------------------------------- |
| `isElectron`         | runtime | `useSpeech.ts:156`     | Detected from `navigator.userAgent.includes('electron')`       |
| `hasNativeWebSpeech` | runtime | `useSpeech.ts:157-158` | `window.SpeechRecognition` or `webkitSpeechRecognition` exists |

### Silence Detection

| Setting                 | Value   | Source             | Description                    |
| ----------------------- | ------- | ------------------ | ------------------------------ |
| `silenceThreshold`      | 5       | `useSpeech.ts:190` | Amplitude below this = silence |
| `silenceDurationToStop` | 60000ms | `useSpeech.ts:191` | Auto-stop after 60s silence    |

### Web Speech Configuration

| Setting           | Value   | Source             | Description                       |
| ----------------- | ------- | ------------------ | --------------------------------- |
| `lang`            | 'en-US' | `useSpeech.ts:596` | Recognition language              |
| `interimResults`  | true    | `useSpeech.ts:597` | Emit partial results              |
| `continuous`      | true    | `useSpeech.ts:598` | Don't stop after single utterance |
| `maxAlternatives` | 3       | `useSpeech.ts:599` | Number of transcript alternatives |

### Electron Debounce

| Setting          | Value  | Source             | Description                          |
| ---------------- | ------ | ------------------ | ------------------------------------ |
| Debounce timeout | 2500ms | `useSpeech.ts:914` | Wait before sending interim as final |

### Authorization Polling

| Setting       | Value | Source             | Description                         |
| ------------- | ----- | ------------------ | ----------------------------------- |
| Poll interval | 500ms | `useSpeech.ts:979` | Time between authorization checks   |
| Max polls     | 10    | `useSpeech.ts:979` | Maximum authorization poll attempts |

---

## Failure Modes

| Scenario                                  | Behavior                                                                  | Detection                                        |
| ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| **Microphone denied**                     | Web: `notifyVoiceUnavailable('denied')`, Electron: System Settings prompt | `getUserMedia` rejects or auth status = 'denied' |
| **Web Speech blocked by network**         | `webSpeechAvailable` set to false for session, user notified              | `error` event with `error === 'network'`         |
| **Web Speech not supported**              | `notifyVoiceUnavailable('unsupported')`                                   | `SpeechRecognition` undefined                    |
| **Electron native missing**               | `notifyVoiceUnavailable('native-missing')`                                | `window.electronSpeech` undefined                |
| **Recognition error (no-speech/aborted)** | Warning logged, mic released, will retry                                  | `error` event with `error === 'no-speech'`       |
| **AudioContext suspended**                | Attempts resume, visualizer may not work                                  | `audioContext.state === 'suspended'`             |
| **sendMessage() fails**                   | Error logged, queue continues with next                                   | try/catch in `processSpeechQueue`                |

### Debugging Checklist

1. **Voice button not responding?**
   - Check `voiceInputLocked` flag
   - Check browser console for permission errors
   - Verify Electron has `electronSpeech` bridge

2. **No transcripts appearing?**
   - Web: Check network connectivity (cloud-based)
   - Electron: Check macOS Speech Recognition permission
   - Look for `[SR]` prefixed console logs

3. **Visualizer not showing?**
   - Check `shimmer.isActive()`
   - Verify `sharedAudioStream` is not null
   - Check `audioContext.state` is 'running'

4. **Silence detection not working?**
   - Check `silenceThreshold` value matches mic levels
   - Verify visualizer is running (provides silence detection)

---

## Code Examples

### Basic Usage

```typescript
import { useSpeech } from '@web/composables/useSpeech';

// In component setup
const { isVoiceActive, toggleVoice, forceStop } = useSpeech();

// Toggle voice on button click
const handleMicClick = () => {
  toggleVoice();
};

// Force stop (e.g., on component unmount)
onBeforeUnmount(() => {
  if (isVoiceActive.value) {
    forceStop();
  }
});
```

### Listening for Transcripts

```typescript
import { useEventBus } from '@web/services/eventBus';

const bus = useEventBus();

// Display interim results in input
bus.on('speech:transcript', ({ text, isFinal }) => {
  if (!isFinal) {
    inputRef.value = text;
    inputRef.classList.add('interim');
  } else {
    inputRef.classList.remove('interim');
  }
});
```

### Custom Voice Target Registration

```typescript
// Register a custom voice-activated target
window.intentCoordinator?.registerTarget('myFeature', {
  zone: null, // Non-spatial (voice only)
  actions: ['toggle', 'set', 'activate'],
  handler: (intent) => {
    switch (intent.action) {
      case 'toggle':
        myFeatureVisible.value = !myFeatureVisible.value;
        break;
      case 'set':
        myFeatureVisible.value = intent.value === true;
        break;
      case 'activate':
        performMyFeatureAction();
        break;
    }
  },
});
```

### Adding a New Voice Command

```typescript
// In handleVoiceCommand function, add a new pattern:
if (/^(start|begin) recording$/.test(text)) {
  emitVoiceIntent({ action: 'activate', target: 'recording' });
  return true;
}
```

---

## File Reference

| File                            | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `web/composables/useSpeech.ts`  | Core speech composable (1,286 lines)                     |
| `web/utils/shimmer.ts`          | Audio-reactive edge glow visualizer                      |
| `web/services/eventBus.ts`      | Event bus for transcript emission                        |
| `web/types/events.ts`           | Event type definitions including `SpeechTranscriptEvent` |
| `web/components/InputBar.vue`   | Receives `speech:transcript` events for interim display  |
| `web/utils/frameCoordinator.ts` | RAF loop for visualizer updates                          |

### Electron Bridge (in main process)

| File                         | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `src/speech/speechBridge.ts` | IPC bridge exposing `electronSpeech` to renderer  |
| Native macOS bridge          | Uses `SFSpeechRecognizer` for offline recognition |

---

## Reference Mapping

| Doc Claim                 | Source of Truth              | Location                             |
| ------------------------- | ---------------------------- | ------------------------------------ |
| Transport type definition | `VoiceTransport`             | `useSpeech.ts:103`                   |
| Electron detection        | `isElectron` constant        | `useSpeech.ts:156`                   |
| Web Speech detection      | `hasNativeWebSpeech`         | `useSpeech.ts:157-158`               |
| Silence threshold         | `silenceThreshold`           | `useSpeech.ts:190`                   |
| Silence timeout           | `silenceDurationToStop`      | `useSpeech.ts:191`                   |
| Web Speech config         | `createRecognition()`        | `useSpeech.ts:596-599`               |
| Electron debounce         | `setTimeout(..., 2500)`      | `useSpeech.ts:914`                   |
| Authorization polling     | `for (let i = 0; i < 10...)` | `useSpeech.ts:979`                   |
| Voice command patterns    | `handleVoiceCommand()`       | `useSpeech.ts:209-343`               |
| Transcript event type     | `SpeechTranscriptEvent`      | `events.ts:112-115`                  |
| Shimmer audio update      | `shimmer.updateAudio()`      | `shimmer.ts:518-524`                 |
| Frame priority            | `Priority.RENDER`            | `useSpeech.ts:480`, `shimmer.ts:448` |

---

## Changelog

- **v1.0** - Initial dual-path speech implementation (Electron + Web Speech)
- **v1.1** - Added audio visualizer with shimmer integration
- **v1.2** - Added voice command handling with IntentCoordinator integration
- **v1.3** - Added transcript debouncing for Electron native path
- **v1.4** - Added EventBus integration for transcript events
- **v1.5** - Documentation created following template

---

_Last verified: 2026-02-23_
