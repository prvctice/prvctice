# Milestone: Media Apps Suite

Build a suite of media apps so polished that people won't believe they run inside a sandboxed iframe with ES5 JavaScript. These aren't demos — they're the apps that make developers at Notion, Figma, and Apple say "how the fuck did one person do this." Every app ships with the craft level of a standalone product, powered by an SDK that makes the impossible feel obvious.

## Current State

The SDK already has strong audio infrastructure (Web Audio API, transport, MIDI recorder, track manager, piano/pads/knobs, offline rendering, WAV export, microphone bridge). The Synth Studio proves complex audio apps work. CSS UIKit has media components (canvas, dropzone, waveform, thumbnail grid, media player, video container, recording indicator, audio meter, oscilloscope, spectrogram, level meter, piano, pads, knobs).

**What's missing for the full vision:**

- Camera/webcam bridge (mic is bridged, camera is not)
- Video playback bridge (audio has blob injection pattern, video doesn't)
- GIF encoding bridge (pure JS encoder too heavy for ES5 sandbox)
- Canvas-to-frames pipeline for video export
- Image processing helpers (filter kernels, blend modes)
- Sample/audio buffer slicing and manipulation helpers
- Drag-reorder for sequencer lanes/timeline

## SDK Extensions (build first, apps consume)

### S1. Camera Bridge

Add `prvctice.media.startCamera(opts)` / `stopCamera()` / `onVideoFrame(cb)` to the bridge SDK. Host-side captures via `getUserMedia({ video: true })`, streams frames as base64 data URIs to the iframe at configurable FPS (default 15). Same pattern as `startMicrophone()` but for video.

**Host side (appManager.ts):**

- `media:camera:start` — calls `getUserMedia({ video: constraints })`, creates `<video>` on host, draws to offscreen canvas, sends `media:video_frame` push messages at target FPS
- `media:camera:stop` — stops tracks, cleans up

**Bridge SDK side (bridgeSDK.ts):**

- `prvctice.media.startCamera({ width, height, fps, facingMode })` — returns Promise `{ active: true }`
- `prvctice.media.stopCamera()` — stops stream
- `prvctice.media.onVideoFrame(cb)` — callback receives `{ dataUri, width, height, timestamp }`

**Permission:** New `camera` permission in AppPermission type.

### S2. Video Playback Bridge

Extend `prvctice.media.playVideo(url)` following the same blob-injection pattern as `playAudio()`. Host proxies video URL, base64 encodes, sends to iframe, iframe decodes to blob URL and sets on a `<video>` element.

**Also add:** `prvctice.media.loadVideo(url)` — returns `{ blobUrl, width, height, duration }` for apps that want to manage their own `<video>` element.

### S3. GIF Encoder Bridge

Add `prvctice.media.encodeGIF(frames, opts)` — takes array of `{ dataUri, delay }`, returns base64 GIF. Encoding runs on the host side (or backend) since the ES5 sandbox can't efficiently run a GIF encoder. Options: `width`, `height`, `quality`, `loop`.

**Host side:** Use a worker or the backend ffmpeg path to encode frames into GIF.

### S4. Canvas Frame Capture Helper

Add `prvctice.ui.frameCapture(canvas, opts)` — captures canvas frames at a target FPS into an internal buffer. Methods: `start()`, `stop()`, `getFrames()`, `exportGIF(opts)` (uses S3), `exportVideo(opts)` (uses mediaTools.convert or host-side MediaRecorder on a canvas stream).

### S5. Image Processing Helpers

Add `prvctice.image.*` namespace:

- `prvctice.image.applyFilter(canvas, filter)` — filter: `'grayscale' | 'sepia' | 'invert' | 'blur' | 'sharpen' | 'brightness' | 'contrast' | 'saturate'` with intensity param
- `prvctice.image.crop(canvas, { x, y, w, h })` — returns new canvas
- `prvctice.image.resize(canvas, { width, height, fit })` — returns new canvas
- `prvctice.image.rotate(canvas, degrees)` — returns new canvas
- `prvctice.image.flip(canvas, axis)` — `'horizontal' | 'vertical'`
- `prvctice.image.composite(canvasA, canvasB, { mode, opacity, x, y })` — blend modes: normal, multiply, screen, overlay
- `prvctice.image.getPixel(canvas, x, y)` / `setPixel()` — pixel access
- `prvctice.image.histogram(canvas)` — returns `{ r[], g[], b[], luminance[] }`

All pure Canvas2D operations — no bridge needed, just a UIKit JS module.

### S6. Audio Buffer Helpers

Add to `prvctice.audio.*`:

- `prvctice.audio.decodeAudio(base64, mimeType)` — decode audio file to AudioBuffer
- `prvctice.audio.sliceBuffer(buffer, startSec, endSec)` — returns new AudioBuffer
- `prvctice.audio.reverseBuffer(buffer)` — returns reversed AudioBuffer
- `prvctice.audio.normalizeBuffer(buffer)` — peak normalization
- `prvctice.audio.mixBuffers(buffers[], gains[])` — mix down to single buffer
- `prvctice.audio.pitchShift(buffer, semitones)` — basic pitch shift via playback rate
- `prvctice.audio.fadeIn(buffer, duration)` / `fadeOut(buffer, duration)`
- `prvctice.audio.detectBPM(buffer)` — onset detection + autocorrelation BPM estimation

### S7. Timeline / Sequencer UI Component

Add `prvctice.ui.timeline(container, opts)` — a horizontal scrolling timeline with:

- Ruler with beat/bar/time markers
- Multiple lanes (tracks)
- Draggable clips within lanes
- Playhead position indicator synced to transport
- Zoom in/out
- Snap to grid (beat, bar, free)
- `onClipMove(cb)`, `onClipResize(cb)`, `onSelect(cb)` callbacks

CSS: `.p-timeline`, `.p-timeline-ruler`, `.p-timeline-lane`, `.p-timeline-clip`, `.p-timeline-playhead`

### S8. Slider / Fader UI Component

Add `prvctice.ui.fader(container, opts)` — vertical or horizontal slider styled as a mixing console fader. Complements the knob component for linear controls. `min`, `max`, `value`, `step`, `label`, `orientation`, `onChange`.

CSS: `.p-fader`, `.p-fader-track`, `.p-fader-thumb`, `.p-fader-label`

---

## Apps

### A1. Drum Machine

**What it is:** 16-step sequencer with 8 drum voices, pattern-based beat programming, swing, per-step velocity, kit selection. Think TR-808/MPC hybrid.

**SDK dependencies:** Existing audio, transport, pads, knobs, track-manager. New: timeline (S7), fader (S8).

**Features:**

- 8 instrument lanes: kick, snare, closed hat, open hat, clap, tom, rim, crash
- 16-step grid per lane — click to toggle, drag to paint
- Per-step velocity (click+drag up/down)
- Swing control (0-75%)
- 3 synth kits (808, 909, acoustic) — all Web Audio synthesis, no samples
- Synthesis per voice: kick uses sine+pitch envelope, snare uses noise+bandpass, hats use filtered noise+envelope, etc.
- Pattern bank: 8 patterns, copy/paste between them
- Chain mode: queue patterns to play in sequence
- A/B fill variation per pattern
- Master tempo, volume, reverb send
- Spectrum visualizer (reuse synth pattern)
- Export pattern as WAV
- Storage: save/load kits + patterns

**Window:** 600x520, min 480x400

### A2. Sampler

**What it is:** Load audio, slice it into pads, play chromatically or as one-shots. MPC-style sampling workflow.

**SDK dependencies:** Existing audio, pads, knobs, transport, midi-recorder. New: audio buffer helpers (S6), timeline (S7), fader (S8).

**Features:**

- Drop audio file or record from mic
- Waveform display with draggable start/end markers per slice
- Auto-slice by transient detection or equal divisions (4, 8, 16, 32)
- Manual slice placement
- 16 pad grid — each pad triggers a slice
- Per-pad controls: volume, pan, pitch, attack, release, reverse, one-shot/gate
- Chromatic mode: hold pad + play piano keyboard to pitch-shift the slice across notes
- Layer mode: stack multiple samples on one pad with velocity switching
- Effects per pad: filter (LP/HP/BP), drive, bit crush
- Master reverb + delay sends
- Record pad performances to MIDI recorder
- Export arrangement as WAV
- Storage: save/load sample kits

**Window:** 680x560, min 520x440

### A3. Voice Modulator

**What it is:** Real-time voice effects processor. Mic input through an effects chain with presets and visualization.

**SDK dependencies:** Existing mic bridge, audio, knobs, oscilloscope, spectrogram, level meter. New: fader (S8).

**Features:**

- Mic input via `prvctice.media.startMicrophone({ mode: 'both' })`
- Real-time audio graph: mic source -> effects chain -> master output
- Effects rack (reorderable):
  - Pitch shift (playback rate detune on DelayNode or granular approach)
  - Ring modulator (multiply with oscillator)
  - Vocoder (bank of bandpass filters)
  - Distortion (WaveShaperNode with multiple curves: soft clip, hard clip, fuzz)
  - Chorus (modulated delay)
  - Delay (feedback delay with sync option)
  - Reverb (ConvolverNode with generated impulses: room, hall, plate, cathedral)
  - EQ (3-band parametric: low/mid/high BiquadFilters)
  - Compressor (DynamicsCompressorNode)
- Presets: Robot, Chipmunk, Deep, Radio, Alien, Echo, Cathedral, Custom
- Dual visualization: oscilloscope (time domain) + spectrogram (frequency)
- Input/output level meters
- Dry/wet mix per effect
- Record processed output to WAV
- Bypass toggle per effect

**Window:** 560x520, min 440x400

### A4. Video Studio

**What it is:** Timeline-based video editor for trimming, compositing, and exporting. Not Premiere — more like a focused clip editor.

**SDK dependencies:** New: camera bridge (S1), video playback bridge (S2), GIF encoder (S3), frame capture (S4), timeline (S7).

**Features:**

- Import: drop video file, record from camera, or paste URL (via mediaTools.download)
- Video preview canvas — renders current frame via `<video>` + drawImage
- Timeline with video track + audio track
- Trim: drag in/out points on timeline
- Split: cut clip at playhead
- Reorder clips on timeline
- Text overlay: position, font, color, duration
- Basic transitions: fade, crossfade (canvas alpha blending between frames)
- Frame capture: screenshot current frame as PNG
- Filters: grayscale, sepia, invert, brightness/contrast (canvas pixel manipulation per-frame)
- Audio: mute video audio, add background track from file
- Export:
  - Frame sequence (PNG zip via canvas captures)
  - GIF (via S3 encoder bridge)
  - Video (via mediaTools.convert on backend)
- Thumbnail strip: visual timeline scrubber

**Window:** 800x600, min 640x480

### A5. Photo Booth

**What it is:** Camera app with real-time filters, stickers, and capture.

**SDK dependencies:** New: camera bridge (S1), image processing (S5), GIF encoder (S3), frame capture (S4).

**Features:**

- Live camera feed rendered to canvas via `onVideoFrame`
- Real-time filter pipeline (applied per frame on canvas):
  - Color: grayscale, sepia, warm, cool, vintage, noir, pop art
  - Distortion: mirror, kaleidoscope, fisheye, pixelate, ASCII
  - Artistic: posterize, edge detect, emboss, thermal, night vision
- Sticker/stamp overlay: position draggable elements on the canvas
- Text overlay with customizable font/color/size
- Timer: 3s/5s/10s countdown before capture
- Burst mode: capture 4 frames in rapid succession, display as grid
- Animated GIF capture: record N seconds of filtered feed, export as GIF
- Gallery: captured photos stored in app storage, displayed as thumbnail grid
- Export: download individual photos or entire gallery
- Flip/mirror controls for selfie vs rear camera (`facingMode`)

**Window:** 560x620, min 440x500

### A6. Image Editor

**What it is:** Full-featured image editor with layers, tools, and filters. Think mini-Photoshop.

**SDK dependencies:** New: image processing (S5). Existing: canvas, dropzone.

**Features:**

- Import: drop image, paste from clipboard, load from URL, or blank canvas
- Canvas with zoom/pan (scroll to zoom, drag to pan)
- Tool palette:
  - Brush: size, opacity, hardness, color
  - Eraser: same controls
  - Line / rectangle / ellipse / polygon
  - Text: font, size, color, bold/italic
  - Fill (flood fill)
  - Color picker / eyedropper
  - Selection: rectangle, lasso (freehand)
  - Move: reposition selection or layer
  - Crop: drag region, apply
- Layer system:
  - Add/delete/duplicate layers
  - Layer opacity and blend mode (normal, multiply, screen, overlay)
  - Layer visibility toggle
  - Layer reorder (drag)
  - Flatten visible
- Filters (from S5):
  - Blur, sharpen, brightness, contrast, saturation, hue rotate
  - Grayscale, sepia, invert, posterize
  - Edge detect, emboss
- Adjustments:
  - Levels: histogram display with black/white point sliders
  - Curves: draggable bezier curve (simplified)
- Transform: resize canvas, rotate 90/180/270, flip H/V
- Undo/redo: 50-step history stack
- Export: PNG, JPEG (quality slider), download via bridge
- Storage: save/load projects (layers preserved as JSON + base64 images)

**Window:** 800x600, min 640x480

### A7. Media Converter

**What it is:** Swiss-army-knife file converter. Drop media in, get a different format out.

**SDK dependencies:** Existing: mediaTools (probe, convert, extractAudio, screenshot, trim), dropzone. New: video playback bridge (S2) for preview.

**Features:**

- Tabbed interface: Image | Audio | Video
- **Image tab:**
  - Drop image -> preview
  - Convert: PNG <-> JPEG <-> WebP <-> BMP
  - JPEG quality slider
  - Resize: preset dimensions or custom
  - Batch: drop multiple images, convert all
- **Audio tab:**
  - Drop audio file -> waveform preview + metadata display
  - Convert: MP3 <-> WAV <-> OGG <-> FLAC <-> AAC
  - Bitrate selection for lossy formats
  - Trim: in/out point sliders on waveform
  - Extract: if video file dropped, extract audio track
  - Normalize volume
- **Video tab:**
  - Drop video -> thumbnail preview + metadata (resolution, codec, duration, size)
  - Convert: MP4 <-> WebM <-> MOV <-> GIF
  - Resolution presets: 1080p, 720p, 480p, custom
  - Trim: in/out point selection
  - Extract frames: every Ns or specific timestamps
  - Extract audio track
- Progress indicator during conversion
- Batch queue: convert multiple files sequentially
- Output history: list of completed conversions with download links

**Window:** 600x520, min 480x400

### A8. DJ Mixer

**What it is:** Dual-deck DJ controller with crossfader, EQ, effects, and beat sync.

**SDK dependencies:** Existing: audio, transport, knobs, media-playback, spectrogram, level meter. New: fader (S8), audio buffer helpers (S6).

**Features:**

- Two decks (A/B), each with:
  - Load track: drop audio file or browse
  - Waveform display with playhead and beat grid
  - Play/pause/cue buttons
  - Pitch fader (+/- 8% tempo adjustment via playbackRate)
  - 3-band EQ (low/mid/high) via BiquadFilters
  - Volume fader
  - Filter knob (LP sweep)
  - Loop: 1/2/1/2/4/8 beat loop
  - Hot cues: 4 cue points per deck
- Crossfader between decks (gain balance)
- Master section:
  - Master volume
  - Headphone cue (preview deck in one ear — if stereo output available)
  - BPM display per deck
  - Sync button: match deck B tempo to deck A
- Effects section:
  - Delay, reverb, filter sweep, flanger
  - Assignable to deck A, B, or master
  - Wet/dry knob per effect
- Dual spectrogram visualization
- Record mix: capture master output to WAV

**Window:** 800x500, min 640x400

### A9. Drum Pad / Finger Drumming

**What it is:** Performance-focused MPC pad instrument. Distinct from the drum machine (A1) which is a step sequencer — this is for live playing.

**SDK dependencies:** Existing: audio, pads, knobs, transport, midi-recorder. New: audio buffer helpers (S6).

**Features:**

- 4x4 MPC pad grid (uses `prvctice.ui.pads()`)
- 3 kit modes:
  - Synth drums: each pad synthesized via Web Audio (kick, snare, hats, toms, perc)
  - Chromatic: all 16 pads play the same sample at different pitches
  - Sliced: load a sample, auto-slice into 16 segments
- Velocity sensitivity: harder tap = louder (via pointer pressure or click duration)
- Pad assignment editor: choose sound per pad
- Per-pad tuning, volume, pan, decay
- FX bus: reverb, delay, bit crush — applied to master or per-pad
- Finger drumming recording: quantize to grid, record to MIDI
- Playback with transport integration
- Pattern sequencing: record multiple patterns, chain playback
- Visualizer: pad flash + spectrum
- Export performance as WAV

**Window:** 560x560, min 440x440

### A10. Noise Generator / Ambient Soundscape

**What it is:** Layered ambient sound generator for focus/relaxation. Multiple sound sources mixed together.

**SDK dependencies:** Existing: audio, knobs, fader (S8).

**Features:**

- 6-8 sound layers, each independently controllable:
  - White noise / pink noise / brown noise (generated via AudioBuffer)
  - Rain (filtered noise bursts with randomized timing)
  - Thunder (low frequency burst + long reverb, random interval)
  - Wind (bandpass-filtered noise with LFO modulation)
  - Birds (oscillator chirps with randomized pitch/timing)
  - Fire/crackle (noise bursts through highpass filter)
  - Stream/water (filtered noise with slow LFO)
  - Cafe/murmur (layered filtered noise at speech frequencies)
- Per-layer: volume fader, on/off toggle, pan knob
- Master volume + master reverb
- Presets: Forest, Ocean, Rainy Cafe, Campfire, Deep Space, White Noise
- Timer: auto-stop after 15/30/60/90 min
- Binaural beats mode: configurable frequency differential between L/R channels
- Visualization: abstract animated canvas (gentle particle drift or wave patterns)
- Minimal, calm UI — dark with subtle accent glows

**Window:** 480x400, min 380x320

### A11. Audio Waveform Editor

**What it is:** Destructive audio editor for trimming, splicing, and processing recordings. Audacity-lite.

**SDK dependencies:** Existing: audio, mic bridge. New: audio buffer helpers (S6), timeline (S7).

**Features:**

- Import: drop audio file or record from mic
- Zoomable waveform display with time ruler
- Selection: click+drag to select range, shift-click to extend
- Edit operations on selection:
  - Cut / copy / paste / delete
  - Silence selection
  - Fade in / fade out
  - Normalize
  - Reverse
  - Change speed (resample)
  - Change pitch (without changing speed — granular or WSOLA approach)
- Effects:
  - EQ (3-band parametric)
  - Compressor
  - Noise gate
  - Reverb
  - Delay
  - Distortion
- Generate:
  - Silence (insert)
  - Tone (sine/square/saw at configurable freq + duration)
  - Noise (white/pink/brown)
- Undo/redo: 30-step history
- Markers: place named markers on timeline
- Export: WAV, MP3 (via mediaTools.convert)
- Metadata display: duration, sample rate, channels, bit depth

**Window:** 700x480, min 560x380

### A12. Theremin

**What it is:** Virtual theremin — pointer X controls pitch, Y controls volume. Eerie, expressive instrument.

**SDK dependencies:** Existing: audio, oscilloscope.

**Features:**

- Full-window playing surface (chromeless option)
- X axis: pitch (logarithmic, 2-3 octave range, configurable)
- Y axis: volume (linear)
- Waveform selector: sine (classic theremin), triangle, sawtooth
- Vibrato: natural hand wobble translated to subtle pitch modulation
- Portamento: smooth glide between pitches (configurable rate)
- Reverb: built-in plate reverb for the classic theremin sound
- Delay: feedback echo for ambient playing
- Visual feedback: frequency/amplitude shown as animated rings or waves emanating from cursor
- Octave range selector
- Scale lock: quantize pitch to selected scale (chromatic, major, minor, pentatonic, whole tone)
- Record performance + WAV export
- Dual-hand mode: if two pointer inputs detected, second controls filter cutoff

**Window:** 560x400, min 400x300

### A13. Morse Code Trainer

**What it is:** Learn and practice Morse code. Encode/decode with audio feedback.

**SDK dependencies:** Existing: audio (tone), knobs.

**Features:**

- Two modes: Encode (text to morse) and Decode (listen and type)
- **Encode mode:**
  - Type text, see dots/dashes, hear audio playback
  - Adjustable WPM (words per minute) via knob
  - Adjustable tone frequency (400-1000 Hz) via knob
  - Character-by-character highlight as it plays
- **Decode mode:**
  - System plays random characters/words in morse
  - User types what they hear
  - Scoring: accuracy %, streak counter
  - Progressive difficulty: letters -> numbers -> words -> sentences
- Reference chart: full alphabet + numbers displayed
- Practice keyer: tap spacebar as a straight key, system decodes your input
- Prosign support (AR, SK, BT, etc.)
- Stats: accuracy over time, most-confused characters, session history
- Farnsworth timing option (extra space between characters for beginners)

**Window:** 520x460, min 420x380

---

## Phase Sequence

### Phase 1: SDK Foundation Extensions

Build S5 (image processing), S6 (audio buffer helpers), S7 (timeline), S8 (fader). These are pure UIKit JS modules — no bridge changes, no host-side work. Unblocks most apps.

### Phase 2: Bridge Extensions

Build S1 (camera bridge), S2 (video playback bridge), S3 (GIF encoder bridge). These require host-side changes to appManager.ts, bridge.ts, bridgeSDK.ts, and new permissions. Unblocks video/camera apps.

### Phase 3: Audio Apps Wave 1

Build A1 (drum machine), A3 (voice modulator), A10 (noise generator). These are the most straightforward audio apps — rely on existing audio infrastructure + phase 1 SDK additions.

### Phase 4: Audio Apps Wave 2

Build A2 (sampler), A8 (DJ mixer), A9 (drum pad), A11 (waveform editor), A12 (theremin). These are more complex audio apps requiring the buffer helpers and timeline from phase 1.

### Phase 5: Visual / Video Apps

Build A5 (photo booth), A4 (video studio), A6 (image editor). These require the camera and video bridges from phase 2.

### Phase 6: Utility Apps

Build A7 (media converter), A13 (morse code trainer). These round out the suite with practical tools.

### Phase 7: S4 (Frame Capture Helper)

Build after video apps stabilize — the exact API depends on patterns discovered during A4/A5 development.

---

## Quality Bar: Scare-the-Industry Grade

The bar isn't "does it work." The bar is "does it make someone stop scrolling and send the link to their entire team." Every app should feel like a standalone product that happens to run inside prvctice.

### Design

- **Terminal instrument aesthetic, not toy UI.** Every app looks like it belongs on a mixing console or flight deck. `.p-terminal-header`, `.p-card-instrument`, mono type, accent glows. No stock-blue buttons, no white cards, no emoji. When someone opens any app, the immediate reaction should be "this looks expensive."
- **Micro-interactions everywhere.** Knobs have momentum. Pads flash on hit with decay. Buttons have tactile press states. Waveforms pulse. Nothing feels dead — every interactive element communicates that it's alive and responsive.
- **Energy-reactive visuals.** Audio apps shift from cool blue at rest to hot amber at high energy (quadratic interpolation). Spectrum visualizers bloom. Level meters glow. The UI breathes with the content.
- **Responsive at every size.** `p-compact` / `p-standard` / `p-expanded` size tiers. At minimum window size, nothing breaks — controls reflow, labels abbreviate, non-essential elements hide. At maximum size, the extra space is used for richer visualizations, not just padding.
- **Dark-mode native.** All apps assume the instrument-dark context. If the app needs forced-dark, override all theme text color vars at the root (the known dark-on-dark bug pattern).

### Audio Excellence

- **Sub-10ms latency.** No perceptible delay between input and sound. Oscillator/gain node creation is pre-pooled or instant. No audio glitches.
- **Synthesis, not samples.** Every sound is generated via Web Audio API: oscillators, noise buffers, filters, envelopes. No loaded sample files. This means the apps work offline, load instantly, and the quality is deterministic. Kick drums use sine waves with exponential pitch envelopes. Snares use noise through bandpass filters. Hats are filtered high-frequency noise with sharp envelopes. Every voice has parameter knobs that actually change the sound in meaningful ways.
- **Musical intelligence.** Swing isn't just "delay odd steps" — it's a percentage-based timing shift that makes patterns groove. Velocity affects not just volume but filter cutoff and envelope shape. Quantization snaps but preserves feel. BPM sync actually syncs. These details are what separate a toy from an instrument.
- **Real-time visualization that means something.** Spectrum analyzers show actual frequency content, not random bars. Oscilloscopes show the real waveform. Level meters follow proper RMS/peak conventions. A musician looking at the visuals should be able to read the sound.

### Visual Excellence

- **Canvas rendering at native resolution.** Retina displays get retina canvases. No blurry pixels. `devicePixelRatio` scaling on every canvas.
- **Smooth at 30fps minimum, 60fps target.** Canvas apps use `requestAnimationFrame` properly — no setTimeout-based animation. Heavy operations (filter application, histogram calculation) run asynchronously and show progress, never freeze the UI.
- **Professional image processing.** Filters use proper convolution kernels, not CSS shortcuts. Blur uses Gaussian, not box blur. Sharpening uses unsharp mask. Color adjustments operate in proper color space. The histogram is real.

### Architecture

- **State persistence.** Close and reopen — everything is exactly where you left it. Drum patterns, sample assignments, effect settings, layer stacks, edit history. Via `prvctice.storage` per-app isolation.
- **Export everything.** Every app that creates content exports it: WAV for audio, PNG/JPEG for images, GIF for animations, ZIP for multi-file exports. Export quality matches or exceeds the preview quality. WAV exports use 44.1kHz/16-bit minimum. Image exports preserve full resolution.
- **Undo/redo.** Every destructive operation is undoable. 30+ step history minimum. Ctrl+Z just works.
- **Clean disposal.** `prvctice.onDispose()` tears down everything — AudioContext, running timers, rAF handles, MediaRecorder, event listeners, object URLs. Zero leaks. Open 10 apps, close 10 apps, memory is flat.
- **ES5 compliance.** `var`, `function()`, `.then()`, no arrow functions, no template literals, no destructuring. This constraint is non-negotiable — it's the sandbox security model. But the code should still be clean: well-named functions, logical grouping, consistent patterns.
- **Graceful degradation.** If mic isn't available, show a clear message. If audio context is suspended, resume on first interaction. If a feature requires a bridge capability that's not present, hide the button — don't show an error.

### The "How Did They Do This" Factor

Each app should have at least one moment that makes people double-take:

| App             | The moment                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drum machine    | The swing knob. Turn it and the pattern starts grooving. People will spend 10 minutes just turning that knob.                                                 |
| Sampler         | Auto-slice a breakbeat, then pitch it across the piano keyboard. Instant hip-hop production.                                                                  |
| Voice modulator | Talk in your normal voice, hear yourself as a robot/chipmunk/alien in real-time with zero lag.                                                                |
| Video studio    | Trim, add text, export GIF — all from inside a chat app. Timeline scrubbing feels native.                                                                     |
| Photo booth     | Real-time kaleidoscope/thermal/ASCII filters on the camera feed at smooth FPS.                                                                                |
| Image editor    | Functional layers with blend modes. In an iframe. In ES5.                                                                                                     |
| Media converter | Drop a video, get an MP3 in 5 seconds. Drop 10 images, get 10 WebPs. Just works.                                                                              |
| DJ mixer        | Crossfade between two tracks with EQ and effects. In a browser. In a chat app.                                                                                |
| Drum pad        | Velocity-sensitive pads that feel like hitting real rubber. The synthesis responds to how hard you hit.                                                       |
| Noise generator | Layer rain + thunder + fire and it sounds like an actual place, not a white noise machine. Each layer has enough parameter depth that the soundscape evolves. |
| Waveform editor | Select a region, reverse it, apply reverb, export. Audacity in an iframe.                                                                                     |
| Theremin        | Move the mouse and it sounds like a real theremin — portamento, vibrato, the whole eerie thing.                                                               |
| Morse code      | Tap spacebar as a straight key and the app decodes your morse in real-time.                                                                                   |
