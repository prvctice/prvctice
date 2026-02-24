## Design Philosophy

You are designing **solid, chunky, self-contained widgets** — not windows with header bars. Think Nothing OS, Teenage Engineering, Apple Watch complications, cockpit gauges, Dieter Rams. Every app should feel like a solid glass object you can pick up.

### Core Principles

1. **Terminal header first** — Every app starts with a `.p-terminal-header` containing a `.p-label-tech` title and an optional status indicator (`.p-status-live`, `.p-feed-meta`, or a small `.p-label-tech` secondary label). This is NOT a traditional header bar — it's a tiny, minimal instrument label row. Do NOT create large title bars, `<h3>` headings, or navigation chrome.
2. **Solid and chunky** — Content fills edge-to-edge inside the glass surface. Use `pad-2` on the body, then pack the rest dense. The widget should feel like one solid chunk — a cockpit instrument panel, not a window with separate sections.
3. **Data density** — Pack information tight. Widgets should be information-rich and spatially compact. No sprawling layouts. Think flight departure board, not PowerPoint slide.
4. **Typography as hierarchy** — Use massive mono numbers for primary data (`text-3xl`, `text-4xl` with `font-mono`), tiny uppercase labels for context (`text-xs`, `uppercase`, `tracking-wide`). Never use medium-sized text for everything.
5. **Monospace for data** — ALL numbers, times, scores, prices, measurements use `font-mono` + `tabular-nums`. This is non-negotiable.
6. **Color discipline** — `var(--p-primary)` is the main accent. Use the accent palette (`--p-accent-blue`, `--p-accent-amber`, `--p-accent-green`, `--p-accent-purple`) sparingly for indicators, dots, border glows, and arcs — never on text or buttons. Everything else is `--p-text`, `--p-text-secondary`, `--p-text-muted`, and surface colors.
7. **Technical labels** — Use ALL CAPS monospace labels with wide letter-spacing for category labels, status indicators. Like `STATUS`, `AUDIO_IN`, `44.1 kHz`.
8. **Dashed borders** — Use dashed/dotted borders for instrument-panel aesthetic. Solid borders for primary containers, dashed for sub-sections. No colored backgrounds.
9. **Footer metadata** — End with a `.p-split .p-feed-meta` row for status, counts, or timestamps. This anchors the bottom of the instrument.

### Anti-Patterns (NEVER do these)

- Large title bars or `<h3>App Name</h3>` as the first element — use `p-terminal-header` instead
- Custom header rows with `p-split` + title + badge — use `p-terminal-header` with `p-label-tech` + `p-status-live`
- Center-aligning everything — left-align data, right-align values in split layouts
- Shadows on every element — use shadows only for elevated interactive elements
- Bright colored backgrounds on cards — use transparent or surface colors
- Large paddings everywhere — keep it dense, compact, information-rich
- Multiple font families — only use `var(--p-font)` and `var(--p-font-mono)`
- Emoji as icons — use simple text symbols (→, ●, ◆, ▲, ■) or SVG
- Full-width buttons stacked vertically — compact button groups, horizontal layouts

## UI Kit

Every app has the prvctice UI Kit pre-loaded. Use `p-*` CSS classes and `prvctice.ui.*` JS components. Never write raw layout CSS or build clocks/timers from scratch.

### Design Tokens (CSS custom properties)

Colors: `--p-bg`, `--p-surface`, `--p-surface-raised`, `--p-surface-sunken`, `--p-text`, `--p-text-secondary`, `--p-text-muted`, `--p-primary`, `--p-secondary`, `--p-accent`, `--p-border`, `--p-border-subtle`, `--p-success`, `--p-warning`, `--p-danger`
Accent palette (indicators only, never on text or buttons): `--p-accent-blue` (#4488ff), `--p-accent-amber` (#ff6b2b), `--p-accent-green` (#2e7d42), `--p-accent-purple` (#A920B5)
Glass: `--p-glass-bg`, `--p-glass-border`, `--p-glass-blur` — for frosted glass surfaces
Shadows: `--p-shadow-sm` to `--p-shadow-xl`, `--p-shadow-glow` — for depth and emphasis
Typography: `--p-font` (Gothic A1), `--p-font-mono` (IBM Plex Mono). Sizes: `--p-text-xs` (11px) to `--p-text-4xl` (64px). Weights: `--p-weight-light` (300), `--p-weight-regular` (400), `--p-weight-medium` (500), `--p-weight-semi` (600), `--p-weight-bold` (700)
Spacing: `--p-1` (4px) to `--p-10` (40px). Use for padding, margin, gap.
Radius: `--p-radius-sm` (6px), `--p-radius-md` (8px), `--p-radius-lg` (12px), `--p-radius-xl` (28px), `--p-radius-pill` (999px). All buttons are pill-shaped (`--p-radius-pill`). Cards use `--p-radius-lg`. Modals/dialogs use `--p-radius-xl`. Never hardcode border-radius values.
Motion: `--p-ease`, `--p-ease-out`, `--p-ease-smooth` (premium cubic-bezier). Durations: `--p-duration-fast` (150ms), `--p-duration` (250ms), `--p-duration-slow` (400ms)

### Layout (CSS classes)

- `.p-grid` — CSS Grid. Set `style="--cols:3; --rows:2"`. Presets: `.p-grid-2x2`, `.p-grid-3x2`, `.p-grid-4x2`, `.p-grid-3x3`, `.p-grid-4x3`. Cell spanning: `.col-span-2`, `.row-span-2`, `.col-full`.
- `.p-stack` — Vertical flex with gap
- `.p-row` — Horizontal flex, items centered
- `.p-split` — Space-between (label left, value right)
- `.p-center` — Center content in both axes
- `.p-scroll` / `.p-scroll-y` — Scrollable with themed scrollbar
- Gap: `.gap-1` to `.gap-8`. Padding: `.pad-1` to `.pad-8`. Sizing: `.full`, `.full-height`, `.full-width`
- Flex: `.flex-1`, `.flex-grow`. Align: `.items-center`, `.justify-between`, `.text-center`

### Display Components (CSS classes)

- `.p-card` — Container: surface bg, border, rounded. Variants: `.p-card-flat` (no border), `.p-card-raised` (shadow), `.p-card-glass` (frosted glass, use for premium overlays), `.p-card-instrument` (dashed border, technical feel)
- `.p-stat` — Big number + label:
  ```html
  <div class="p-stat p-stat-left">
    <div class="p-stat-value">72°</div>
    <div class="p-stat-label">TEMPERATURE</div>
  </div>
  ```
  Sizes: `.p-stat-sm`, `.p-stat-lg`. Alignment: `.p-stat-left`, `.p-stat-right`
- `.p-clock-digital` — Styled monospace time container. Sizes: `.p-clock-digital-sm`, `.p-clock-digital-lg`
- `.p-clock-analog` — Container for SVG analog clock
- `.p-timer-display` — Countdown/stopwatch number display. Sizes: `-sm`, `-lg`
- `.p-progress` — Horizontal bar: `<div class="p-progress" style="--progress:0.65"></div>`. Variants: `.p-progress-success`, `.p-progress-warning`, `.p-progress-danger`
- `.p-badge` — Status pill. Variants: `.p-badge-primary`, `.p-badge-success`, `.p-badge-warning`, `.p-badge-danger`. Dot: `.p-badge-dot`
- `.p-list` + `.p-list-item` — Scrollable list with `.p-list-item-content`, `.p-list-item-title`, `.p-list-item-subtitle`, `.p-list-item-action`
- `.p-empty` — Empty state: `.p-empty-icon` + `.p-empty-message`
- `.p-divider` — Horizontal rule. `.p-divider-thick` for emphasis.

### Terminal Aesthetic Components (CSS classes)

Every app should use these components for the instrument-panel look:

- `.p-terminal-header` — Split header bar. First child is `.p-label-tech` title, second is status. Always the first element inside `#mainContent`.
  ```html
  <div class="p-terminal-header">
    <span class="p-label-tech">APP TITLE</span>
    <span class="p-status-live">LIVE</span>
  </div>
  ```
- `.p-status-live` — Green pulsing dot + uppercase label. Use for live/connected state.
- `.p-tab-bar` + `.p-tab` — Monospace uppercase tabs with blue active state. Use for category/mode switching:
  ```html
  <div class="p-tab-bar">
    <button class="p-tab active">GENERAL</button>
    <button class="p-tab">TECH</button>
    <button class="p-tab">SPORTS</button>
  </div>
  ```
  Or use `prvctice.ui.tabs(el, opts)` for programmatic control.
- `.p-feed-meta` + `.p-feed-time` — 10px mono metadata row. Timestamps in purple (`--p-accent-purple`):
  ```html
  <div class="p-split p-feed-meta" style="flex-shrink:0">
    <span class="p-label-tech" style="font-size:10px;opacity:0.7">STATUS</span>
    <span id="footerStats" class="text-muted">0 ITEMS</span>
  </div>
  ```
- `.p-card-instrument` — Dashed border, transparent background. Use for sub-sections and metric tiles.
- `.p-border-accent-blue`, `.p-border-accent-amber`, `.p-border-accent-green` — Subtle accent-tinted borders (12% opacity).
- `.p-glow-blue`, `.p-glow-amber`, `.p-glow-green` — Accent box-shadow glow on non-text elements.

**Standard app structure:**

1. `.p-terminal-header` — title + status indicator
2. Hero stat or main display area
3. `.p-card-instrument` sections for controls/data
4. Action buttons row
5. `.p-feed-meta` status footer

### Premium Utilities

- `.p-glass` — Glass morphism surface (backdrop-filter blur + semi-transparent bg)
- `.p-glow` — Subtle primary-colored glow shadow
- `.p-fade-in` — Smooth entrance animation (translateY + opacity)
- `.p-shimmer` — Loading shimmer effect
- `.p-dashed` — Dashed border style
- `.p-label-tech` — Monospace uppercase technical label (AUDIO_IN, STATUS, etc.)
- `.p-mono-value` — Monospace tabular-nums for data values
- `.tracking-tight` / `.tracking-wide` — Letter spacing control
- `.uppercase` — Text transform uppercase
- `.font-bold` — Bold weight (700)

### Interactive Components

**CSS-only:**

- `.p-btn` — Pill-shaped button (no drop shadows). Variants: `.p-btn-primary`, `.p-btn-danger`, `.p-btn-ghost`, `.p-btn-icon`. Sizes: `.p-btn-sm`, `.p-btn-lg`. Group: `.p-btn-group`. Full width: `.p-btn-block`. Never override border-radius on `.p-btn`.
- `.p-input` — Text input. With icon: `.p-input-group` + `.p-input-group-icon`. Textarea: `<textarea class="p-input">`
- `.p-label` — Uppercase label above input
- `.p-toggle` — Switch: `<label class="p-toggle"><input type="checkbox"><span class="p-toggle-track"></span></label>`
- `.p-slider` — Range: `<input type="range" class="p-slider">`
- `.p-tabs` + `.p-tab` — Segmented control (CSS container, use JS `prvctice.ui.tabs()` for behavior)
- `.p-select` — Styled `<select>` dropdown
- `.p-stepper` — +/− with value (CSS container, use JS `prvctice.ui.stepper()` for behavior)
- `.p-checkbox`, `.p-radio` — Styled checkbox/radio

**JS components** (call inside `prvctice.onReady()`):

- `prvctice.ui.clock(el, { format: '12h'|'24h', seconds: true, timezone: 'America/New_York' })` → `{ dispose(), setFormat(), setTimezone() }`
- `prvctice.ui.analogClock(el, { showSeconds: true, showNumbers: true, size: 200 })` → `{ dispose() }`
- `prvctice.ui.timer(el, { duration: 300000, mode: 'countdown'|'stopwatch', onTick: fn, onComplete: fn, autoStart: false })` → `{ start(), pause(), reset(), dispose(), isRunning(), setDuration() }`
- `prvctice.ui.stepper(el, { min: 0, max: 60, step: 5, value: 25, onChange: fn, format: fn })` → `{ getValue(), setValue(), dispose() }`
- `prvctice.ui.tabs(el, { tabs: [{id:'a', label:'Tab 1'}], active: 'a', onChange: fn })` → `{ getActive(), setActive(), dispose() }`
- `prvctice.ui.canvas(el, { retina: true, onReady: fn(ctx, canvas) })` → `{ ctx, canvas, resize(), toDataURL(), clear(), dispose() }`
- `prvctice.ui.dropzone(el, { accept: 'image/*', multiple: false, label: 'Drop image', onDrop: fn(files) })` → `{ dispose(), setLabel() }`
- `prvctice.ui.waveform(el, { color: '#6366f1', barWidth: 3 })` → `{ draw(data), connectAnalyser(node), dispose() }`
- `prvctice.ui.mediaPlayer(el, { src: url|Blob, type: 'audio'|'video', onEnd: fn })` → `{ play(), pause(), seek(t), setSrc(), dispose() }`
- `prvctice.ui.audioRecorder(el, { waveform: true, autoStart: false, onRecordingComplete: fn(result) })` → `{ start(), stop(), isRecording(), dispose() }`. Result: `{ audio: base64, mimeType, duration }`

### Audio Synthesis (in-iframe Web Audio API)

Apps can create and play audio directly within the sandboxed iframe. AudioContext works after user gesture.

**Synthesis helpers:**

- `prvctice.audio.tone(frequency, duration?, opts?)` — Play a tone. frequency in Hz (440 = A4), duration in ms (default 200). Options: type ('sine'|'square'|'sawtooth'|'triangle'), volume (0-1, default 0.3), attack (ms), release (ms).
- `prvctice.audio.sequence(notes, opts?)` — Play a sequence of notes. notes: `[{freq: 440, duration: 200}, {freq: 523, duration: 200}]`. Same opts as tone.

**Audio context and routing:**

- `prvctice.audio.createContext()` → AudioContext — Get/create the shared AudioContext (auto-resumes if suspended).
- `prvctice.audio.getMasterGain()` → GainNode — Get the master gain bus. All synthesis should route through this node. Also creates a master analyser automatically.
- `prvctice.audio.getAnalyser()` → AnalyserNode — Get the master bus analyser (tapped from master gain). Use this for visualization of all synth output.
- `prvctice.audio.createAnalyser(opts?)` → `{analyser, context}` — Create a standalone AnalyserNode. Options: fftSize (default 256), smoothing (default 0.8).

**Recording synth output:**

- `prvctice.audio.createRecorder()` → `{start(), stop(), isRecording(), dispose()}` — Records all audio flowing through the master gain bus. `stop()` returns `Promise<{blob: Blob, duration: number}>`.
- `prvctice.audio.encodeWAV(audioBuffer)` → Blob — Encode an AudioBuffer as a WAV file (16-bit PCM). Use with `renderOffline()` for offline rendering.
- `prvctice.audio.bufferToBase64(blob)` → `Promise<string>` — Convert a Blob to base64 string (without data URI prefix). Use for `prvctice.media.download()` or `prvctice.storage.set()`.

**IMPORTANT: For synth apps, use `prvctice.audio.createRecorder()` — not `prvctice.media.startMicrophone()` (that captures the mic, not synth output).**

### Audio Visualization (JS components, call inside `prvctice.onReady()`)

**ALWAYS use these components for audio visualization. Do NOT build custom canvas-based visualizers.**

- `prvctice.ui.oscilloscope(el, opts?)` → `{connectAnalyser(node), dispose()}` — Real-time waveform display on Canvas. Options: analyser (AnalyserNode), color (CSS color or token like '--p-primary'), lineWidth (default 2), fill (boolean). Handles theme colors and retina scaling automatically.
- `prvctice.ui.spectrogram(el, opts?)` → `{draw(data), connectAnalyser(node), dispose()}` — Frequency bar visualization. Options: analyser (AnalyserNode), bars (default 32), color, gap (default 2), gradient (boolean). Use `draw(data)` for manual data (e.g., bridge `onAudioData`), or `connectAnalyser(node)` for local audio.

**CRITICAL: Canvas 2D context does NOT support CSS custom properties.** Setting `canvasCtx.fillStyle = 'var(--p-primary)'` silently fails. The oscilloscope/spectrogram components handle this automatically via `getComputedStyle()`. If you must use raw `prvctice.ui.canvas()`, resolve colors first: `var color = getComputedStyle(document.documentElement).getPropertyValue('--p-primary').trim();`

**Example: Synth with Visualization, Recording, and Download**

```js
prvctice.onReady(function () {
  var ctx = prvctice.audio.createContext();
  var master = prvctice.audio.getMasterGain();
  var analyser = prvctice.audio.getAnalyser();
  var recorder = prvctice.audio.createRecorder();

  // Oscilloscope visualization — auto-handles theme colors and retina
  var scope = prvctice.ui.oscilloscope(document.getElementById('viz'), { fill: true });
  scope.connectAnalyser(analyser);

  // Play a note through the master bus
  function playNote(freq) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  // Record
  document.getElementById('recordBtn').onclick = function () {
    recorder.start();
  };

  // Stop + download
  document.getElementById('stopBtn').onclick = function () {
    recorder
      .stop()
      .then(function (result) {
        return prvctice.audio.bufferToBase64(result.blob);
      })
      .then(function (base64) {
        return prvctice.media.download(base64, 'recording.webm', 'audio/webm');
      })
      .then(function () {
        prvctice.ui.toast({ message: 'Downloaded', type: 'success' });
      });
  };

  prvctice.onDispose(function () {
    scope.dispose();
    recorder.dispose();
  });
});
```

### Media API (Microphone)

- `prvctice.media.startMicrophone({ mode: 'record'|'visualize'|'both' })` → Promise — Requests mic access from parent, starts recording/visualization
- `prvctice.media.stopMicrophone()` → Promise<{ audio: base64, mimeType, duration }> — Stops recording, returns audio data
- `prvctice.media.onAudioData(cb)` → unsubscribe fn — Real-time frequency data (32-element array of 0-1 values) for custom visualizations
- `prvctice.media.download(base64, filename, mimeType)` → Promise — Triggers file download from base64 data. Use for saving recordings, exports, generated files.
- `prvctice.media.saveUrl(url, filename)` → Promise — Save a server-hosted file to device. Use for files returned by `mediaTools.download()`, `mediaTools.convert()`, etc. Pass `result.url` and a filename with extension.

### Musical Input Components (JS components, call inside `prvctice.onReady()`)

**ALWAYS use these components for music/synth apps. Do NOT build custom keyboard layouts with buttons/divs — they always look wrong.**

- `prvctice.ui.piano(el, opts?)` → `{setOctave(n), noteOn(midi), noteOff(midi), dispose()}` — Realistic piano keyboard with white/black keys. Handles QWERTY keyboard mapping and mouse/touch glissando automatically. Options: startOctave (default 4), octaves (1-3, default 1), labels (boolean, default true), hints (boolean, default true), onNoteOn(cb), onNoteOff(cb). Callback receives `{ note, octave, frequency, midi, key }`.
- `prvctice.ui.pads(el, opts?)` → `{padOn(index), padOff(index), dispose()}` — MPC-style velocity pad grid. Handles QWERTY keyboard mapping automatically (1-4, Q-R, A-F, Z-V for 4x4). Options: cols (default 4), rows (default 4), pads (array of `{label, frequency?, midi?}`), hints (boolean, default true), onPadOn(cb), onPadOff(cb). Callback receives `{ index, label, frequency, midi, key }`.

**QWERTY mapping (piano):** A=C, W=C#, S=D, E=D#, D=E, F=F, T=F#, G=G, Y=G#, H=A, U=A#, J=B, K=C5.
**QWERTY mapping (pads):** 1-4 (top row), Q-R, A-F, Z-V (bottom row).

**Example: Synth with Piano Keyboard**

```js
prvctice.onReady(function () {
  var ctx = prvctice.audio.createContext();
  var activeNotes = {};

  var piano = prvctice.ui.piano(document.getElementById('keyboard'), {
    octaves: 1,
    onNoteOn: function (e) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = e.frequency;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      osc.start();
      activeNotes[e.midi] = { osc: osc, gain: gain };
    },
    onNoteOff: function (e) {
      var note = activeNotes[e.midi];
      if (!note) return;
      note.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      note.osc.stop(ctx.currentTime + 0.1);
      delete activeNotes[e.midi];
    },
  });

  var scope = prvctice.ui.oscilloscope(document.getElementById('viz'));

  prvctice.onDispose(function () {
    piano.dispose();
    scope.dispose();
  });
});
```

### Rotary Knob Control (JS component, call inside `prvctice.onReady()`)

- `prvctice.ui.knob(el, opts?)` → `{get(), set(v), dispose()}` — Rotary knob control for continuous parameters. Drag vertically to adjust value. Double-click to reset to default. Options: min (default 0), max (default 1), step (default 0.01), value (default equals min), label (string, displayed below knob), format (function(v) returning display string), size (px, default 48), color (CSS color or token, default '--p-accent-blue'), onChange(value).

**CSS:** Renders `.p-knob-wrap > .p-label-tech + .p-knob > .p-knob-dot`. The `.p-knob` draws a circular arc indicator. Use `.p-knob-wrap` for layout — it's an inline-flex column.

**Layout pattern — knob rows:**

```html
<div class="p-row gap-3 pad-2" style="justify-content:center">
  <div id="knob1"></div>
  <div id="knob2"></div>
  <div id="knob3"></div>
</div>
```

```js
prvctice.onReady(function () {
  var vol = prvctice.ui.knob(document.getElementById('knob1'), {
    min: 0,
    max: 1,
    value: 0.7,
    label: 'VOLUME',
    format: function (v) {
      return Math.round(v * 100) + '%';
    },
    onChange: function (v) {
      gainNode.gain.value = v;
    },
  });

  var freq = prvctice.ui.knob(document.getElementById('knob2'), {
    min: 20,
    max: 2000,
    value: 440,
    label: 'FREQ',
    format: function (v) {
      return Math.round(v) + ' Hz';
    },
    color: '--p-accent-amber',
  });

  prvctice.onDispose(function () {
    vol.dispose();
    freq.dispose();
  });
});
```

### Audio Production Components (JS, call inside `prvctice.onReady()`)

For apps that need BPM-synced playback, multitrack recording, or MIDI sequencing, use these production components. They work together: Transport provides the clock, TrackManager manages track states, and MidiRecorder records/plays back note events against the transport timeline.

**Transport (BPM-aware clock):**

- `prvctice.audio.createTransport(opts?)` → `{play(), stop(), pause(), record(), seek(beats), getState(), getPositionBeats(), getBpm(), setBpm(n), setLoop(enabled, start, end), getLoop(), onTick(cb), onBeat(cb), onStateChange(cb), dispose()}`
  - Options: bpm (default 120), loop (boolean), loopStart (beats), loopEnd (beats)
  - States: `'stopped'`, `'playing'`, `'paused'`, `'recording'`
  - `onTick(cb)` fires every animation frame with current beat position — use for playhead/ruler updates
  - `onBeat(cb)` fires on each beat boundary — use for metronome clicks
  - `onStateChange(cb)` fires when transport state changes — use for button UI updates

**Track Manager (multitrack state):**

- `prvctice.audio.createTrackManager(opts?)` → `{getTrack(idx), setMute(idx, val), setSolo(idx, val), setVolume(idx, vol), setArmed(idx, val), setLabel(idx, label), getEffectiveGain(idx), getArmedTracks(), getAllTracks(), getTrackCount()}`
  - Options: tracks (number, default 4), onChange(trackIdx, field, value)
  - `getEffectiveGain(idx)` returns 0-1 considering mute/solo logic across all tracks
  - `getArmedTracks()` returns array of armed track indices

**MIDI Recorder (note event recorder):**

- `prvctice.audio.createMidiRecorder(transport, opts?)` → `{noteOn(midi, vel), noteOff(midi), getEvents(), setEvents(arr), clear(), setArmed(val), isArmed(), setOverdub(val), hasEvents(), setPlaybackHandler(onNoteOn, onNoteOff), dispose()}`
  - First argument is a transport instance (from `createTransport`)
  - Options: overdub (boolean, default false)
  - Events are `{midi, velocity, startBeat, durationBeats}`
  - `setPlaybackHandler(onNoteOn, onNoteOff)` registers callbacks for MIDI playback — the recorder auto-triggers notes during transport playback

**Offline Rendering:**

- `prvctice.audio.renderOffline(duration, sampleRate, renderFn)` → `Promise<AudioBuffer>` — Render audio offline (not real-time). `renderFn(offlineCtx)` receives an OfflineAudioContext — build your audio graph on it, then the SDK renders and returns the buffer. Combine with `prvctice.audio.encodeWAV(audioBuffer)` to produce a downloadable WAV file.

**CSS patterns for transport controls:**

```html
<!-- Transport bar -->
<div class="p-row gap-1 pad-1" style="justify-content:center">
  <button class="p-btn p-btn-sm p-btn-ghost" id="stopBtn">&#9632;</button>
  <button class="p-btn p-btn-sm p-btn-primary" id="playBtn">&#9654;</button>
  <button class="p-btn p-btn-sm p-btn-ghost" id="recBtn" style="color:var(--p-danger)">
    &#9679;
  </button>
  <span class="font-mono text-xs" id="position" style="min-width:60px;text-align:center"
    >0:00.0</span
  >
  <input
    class="p-input"
    type="number"
    id="bpmInput"
    style="width:56px;text-align:center;font-size:11px"
    value="120"
  />
  <span class="p-label-tech" style="font-size:9px">BPM</span>
</div>
```

**CSS patterns for track strips:**

```html
<!-- Track strip row -->
<div
  class="p-row gap-1 pad-1"
  style="font-size:11px;border-bottom:1px solid var(--p-border-subtle)"
>
  <button
    class="p-btn p-btn-sm"
    style="width:20px;height:20px;padding:0;font-size:9px"
    data-action="arm"
  >
    R
  </button>
  <span class="p-label-tech flex-1" style="font-size:10px">TRACK 1</span>
  <button
    class="p-btn p-btn-sm p-btn-ghost"
    style="font-size:9px;padding:2px 4px"
    data-action="mute"
  >
    M
  </button>
  <button
    class="p-btn p-btn-sm p-btn-ghost"
    style="font-size:9px;padding:2px 4px"
    data-action="solo"
  >
    S
  </button>
  <input type="range" class="p-slider" style="width:48px" min="0" max="100" value="80" />
</div>
```

**CSS patterns for bar ruler (visual position indicator):**

```html
<div class="p-row gap-1" id="barRuler" style="height:6px">
  <!-- JS fills with bar segments: -->
  <!-- <div class="bar-seg" style="flex:1;height:100%;background:var(--p-border-subtle);border-radius:2px"></div> -->
</div>
```

**CSS patterns for preset slots (save/recall settings):**

```html
<div class="p-row gap-1" style="justify-content:center">
  <button
    class="p-btn p-btn-sm p-btn-ghost"
    style="width:28px;height:28px;padding:0;font-size:10px;font-family:var(--p-font-mono)"
  >
    1
  </button>
  <button
    class="p-btn p-btn-sm p-btn-ghost"
    style="width:28px;height:28px;padding:0;font-size:10px;font-family:var(--p-font-mono)"
  >
    2
  </button>
  <button
    class="p-btn p-btn-sm p-btn-ghost"
    style="width:28px;height:28px;padding:0;font-size:10px;font-family:var(--p-font-mono)"
  >
    3
  </button>
  <button
    class="p-btn p-btn-sm p-btn-ghost"
    style="width:28px;height:28px;padding:0;font-size:10px;font-family:var(--p-font-mono)"
  >
    4
  </button>
</div>
```

**Example: Simple sequencer with transport + MIDI recorder**

```js
prvctice.onReady(function () {
  var ctx = prvctice.audio.createContext();
  var master = prvctice.audio.getMasterGain();
  var transport = prvctice.audio.createTransport({ bpm: 120, loop: true, loopEnd: 16 });
  var recorder = prvctice.audio.createMidiRecorder(transport);
  var tracks = prvctice.audio.createTrackManager({ tracks: 4 });

  // Piano keyboard for input
  var piano = prvctice.ui.piano(document.getElementById('keyboard'), {
    onNoteOn: function (e) {
      playNote(e.midi, e.frequency, 0.8);
      recorder.noteOn(e.midi, 0.8);
    },
    onNoteOff: function (e) {
      recorder.noteOff(e.midi);
    },
  });

  // Playback handler — recorder triggers these during playback
  recorder.setPlaybackHandler(
    function (midi, vel) {
      playNote(midi, midiToFreq(midi), vel);
    },
    function (midi) {
      /* noteOff */
    }
  );

  // Transport controls
  document.getElementById('playBtn').onclick = function () {
    transport.play();
  };
  document.getElementById('stopBtn').onclick = function () {
    transport.stop();
  };

  // Update position display on each tick
  transport.onTick(function (beats) {
    var bar = Math.floor(beats / 4) + 1;
    var beat = Math.floor(beats % 4) + 1;
    document.getElementById('position').textContent = bar + ':' + beat;
  });

  function playNote(midi, freq, vel) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vel * 0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  prvctice.onDispose(function () {
    piano.dispose();
    recorder.dispose();
    transport.dispose();
  });
});
```

**Reference implementation:** The built-in Synth Studio app (`pianoSynth.ts`) demonstrates all production components working together: transport, 4-track recording with arm/mute/solo, MIDI recorder with overdub, preset slots, bar ruler, knob controls for synth parameters, and energy-reactive spectrum visualization.

### Host Mixer (mixer-routed instruments)

For instruments that want their audio mixed centrally (with per-channel gain, pan, mute/solo, reverb, and recording), use the host mixer instead of a local AudioContext. The Mixer companion app shows channel strips for every connected instrument.

**Connection lifecycle:**

- `prvctice.mixer.connect({ name: 'My Instrument' })` → `Promise<{ channelId }>` — Register as a mixer channel. The `name` appears on the channel strip.
- `prvctice.mixer.disconnect()` — Remove the channel. Always call in `prvctice.onDispose()`.
- `prvctice.mixer.onDisconnected(cb)` → unsubscribe fn — Fires if the host disconnects you (e.g. mixer reset).

**Note control (routed through your channel):**

- `prvctice.mixer.noteOn(freq, opts?)` → `Promise<{ voiceId }>` — Start a voice. Options: `{ waveform, gain, attack, decay, sustain, release, filterFreq, filterQ, vibratoDepth, vibratoRate, detune }`.
- `prvctice.mixer.noteOff(voiceId)` — Release a voice with its release envelope.
- `prvctice.mixer.tone(freq, duration, opts?)` — One-shot: noteOn + auto noteOff after duration (seconds).
- `prvctice.mixer.allNotesOff()` — Kill all voices on your channel.

**Channel controls (typically used by the Mixer app, but any app can call):**

- `prvctice.mixer.setGain(channelId, value)` — 0-1
- `prvctice.mixer.setPan(channelId, value)` — -1 to 1
- `prvctice.mixer.setMute(channelId, value)` / `.setSolo(channelId, value)` — boolean
- `prvctice.mixer.setReverbSend(channelId, value)` — 0-1
- `prvctice.mixer.setRecordArm(channelId, value)` — boolean

**Master + transport:**

- `prvctice.mixer.setMasterGain(value)` / `.setMasterMute(value)`
- `prvctice.mixer.setBpm(value)` / `.setMetronome(enabled)`
- `prvctice.mixer.transportPlay()` / `.transportStop()`

**State observation:**

- `prvctice.mixer.getState()` → `Promise<EngineState>` — Full state snapshot.
- `prvctice.mixer.subscribeState()` → `Promise<EngineState>` — Get initial state and start receiving pushes.
- `prvctice.mixer.onStateChange(cb)` → unsubscribe fn — Real-time state updates.
- `prvctice.mixer.getAnalyserData(channelId?)` → `Promise<{ timeDomain, frequency }>` — FFT data for visualization.

**Recording:**

- `prvctice.mixer.startRecording()` / `.stopRecording()` → `Promise<{ audio, mimeType, duration }>` — Record the master bus.

**Example: Mixer-routed keyboard**

```js
prvctice.onReady(function () {
  var activeVoices = {};
  prvctice.mixer.connect({ name: 'My Synth' }).then(function (result) {
    var piano = prvctice.ui.piano(document.getElementById('keys'), {
      octaves: 2,
      onNoteOn: function (ev) {
        prvctice.mixer.noteOn(ev.frequency, { waveform: 'sawtooth', gain: 0.5 }).then(function (r) {
          if (r && r.voiceId) activeVoices[ev.midi] = r.voiceId;
        });
      },
      onNoteOff: function (ev) {
        if (activeVoices[ev.midi]) {
          prvctice.mixer.noteOff(activeVoices[ev.midi]);
          delete activeVoices[ev.midi];
        }
      },
    });
    prvctice.onDispose(function () {
      for (var k in activeVoices) prvctice.mixer.noteOff(activeVoices[k]);
      prvctice.mixer.disconnect();
      piano.dispose();
    });
  });
});
```

### Keyboard Input API

- `prvctice.input.onKeyDown(cb)` → unsubscribe fn — Receives `{ key, code, altKey, ctrlKey, shiftKey, metaKey, repeat }` when a key is pressed while the app window is focused. Use for game controls, keyboard shortcuts. **For music apps, use `prvctice.ui.piano()` or `prvctice.ui.pads()` instead — they handle keyboard mapping automatically.**
- `prvctice.input.onKeyUp(cb)` → unsubscribe fn — Same payload, fired on key release.

Keyboard events work both when the iframe has focus (local listeners) and when the host window has focus (forwarded via postMessage). Events are NOT forwarded when the user is typing in the chat input.

**For keyboard-driven apps (games, shortcuts):** Always guard against key repeat with a tracking object:

```js
var activeKeys = {};
prvctice.input.onKeyDown(function (e) {
  if (activeKeys[e.key]) return; // prevent repeat triggers
  activeKeys[e.key] = true;
  // handle key press
});
prvctice.input.onKeyUp(function (e) {
  delete activeKeys[e.key];
  // handle key release
});
```

### Chart Components (JS, call inside `prvctice.onReady()`)

All chart components accept a container element and an options object. They return `{ update(newOpts), dispose() }`.

- `prvctice.ui.sparkline(el, { data: [1,2,3], color: '--p-primary', fill: true, smooth: true, animate: true })` — Inline mini line chart. Height: 40px default.
- `prvctice.ui.barChart(el, { labels: ['A','B','C'], values: [10,20,30], colors: ['--p-primary'], horizontal: false, showValues: true, animate: true, barRadius: 4 })` — Vertical or horizontal bar chart with optional labels and values.
- `prvctice.ui.lineChart(el, { labels: ['Mon','Tue','Wed'], values: [10,20,15], datasets: [{values:[10,20,15], color:'--p-primary'}], dots: true, grid: true, smooth: true, animate: true })` — Multi-series line chart. Use `values` for single series or `datasets` array for multiple series.
- `prvctice.ui.gauge(el, { value: 72, min: 0, max: 100, label: 'CPU', color: '--p-primary', showValue: true, thickness: 12, animate: true })` — Semi-circular gauge with label and value display.
- `prvctice.ui.pieChart(el, { segments: [{value:30,label:'A',color:'--p-primary'},{value:70,label:'B'}], donut: true, labels: true, animate: true })` — Pie or donut chart. Set `labels: false` to hide labels.
- `prvctice.ui.progressRing(el, { value: 65, max: 100, label: 'Done', color: '--p-primary', thickness: 8, animate: true })` — Circular progress ring with centered label.

Charts are SVG-based and theme-aware — they read `--p-*` CSS custom properties for colors. Call `update(newOpts)` to change data; the chart re-renders with animation. Call `dispose()` to clean up.

### Data Formatting (sync helpers)

- `prvctice.format.number(n)` — Abbreviate: 1200 → "1.2K", 1500000 → "1.5M"
- `prvctice.format.percent(n, decimals?)` — Decimal to percentage: 0.75 → "75%"
- `prvctice.format.currency(n, currency?)` — Format currency: 1234.5 → "$1,234.50"
- `prvctice.format.relativeTime(timestamp)` — Unix ms to relative: "3m ago", "2h ago", "just now"

### Trend Indicators (CSS classes)

- `.p-change-positive` — Green text with ↑ prefix (use for positive changes)
- `.p-change-negative` — Red text with ↓ prefix (use for negative changes)
- `.p-change-neutral` — Gray text with → prefix (use for no change)
- `.p-data` — Monospace tabular-nums for data cells

### Scheduled Refresh (for live data widgets)

- `prvctice.refresh.start(intervalMs)` — Start parent-managed refresh timer (min 5000ms, default 60000ms). Sends immediate first tick.
- `prvctice.refresh.stop()` — Stop the refresh timer
- `prvctice.refresh.requestNow()` — Request an immediate refresh tick
- `prvctice.refresh.onRefresh(callback)` → unsubscribe fn — Register a callback for each refresh tick. Use this to re-fetch data.
- `prvctice.onDispose(callback)` → unsubscribe fn — Register cleanup callback (fires before app:close)

**How to use:** In your `prvctice.onReady()` callback, fetch initial data, then register a refresh handler and start the timer:

```js
prvctice.onReady(function () {
  function loadData() {
    prvctice.weather.current({ location: 'NYC' }).then(function (w) {
      // update DOM with w.current
    });
  }
  loadData(); // initial fetch
  prvctice.refresh.onRefresh(loadData); // re-fetch on each tick
  prvctice.refresh.start(60000); // refresh every 60s
});
```

The parent pauses timers when the browser tab is hidden and resumes (with an immediate tick) when visible again. This is more efficient than in-iframe setInterval.

### Loading Skeletons (CSS classes)

- `.p-skeleton` — Base shimmer animation
- `.p-skeleton-text` — Text-shaped skeleton (14px height, 80% width)
- `.p-skeleton-circle` — Circle-shaped skeleton
- `.p-skeleton-value` — Value-shaped skeleton (32px height, 120px width)

### Overflow Prevention (CSS classes)

- `.p-text-clamp-1` / `.p-text-clamp-2` / `.p-text-clamp-3` — Line-clamped text
- `.p-text-truncate` — Single-line truncation with ellipsis
- `.p-overflow-fade` — Bottom fade-out gradient overlay

### Data Connectors Quick Reference

All data methods return Promises. Call inside `prvctice.onReady()`.

**News:** `prvctice.news.search(query)` → `{items}` | `.headlines(topic)` → `{items}` | `.fetch(feedUrl)` → `{items}`
**Wikipedia:** `prvctice.wikipedia.search(query)` → `{articles}` | `.images(query)` → `{images}`
**Books:** `prvctice.books.search(query)` → `{books}` (title, authors, coverUrl, publishYear)
**Academic:** `prvctice.academic.search(query)` → `{papers}` (title, authors, abstract, citationCount, year, pdfUrl)
**Movies:** `prvctice.movies.search(query)` → `{results}` (title, year, overview, posterUrl, rating) | `.trending()` → `{results}`
**Music:** `prvctice.music.search(query)` → `{results}` (title, artist, coverUrl)
**YouTube:** `prvctice.youtube.search(query)` → `{videos}` (title, videoId, url)
**Art:** `prvctice.art.search(query)` → `{artworks}` from Art Institute + Met Museum
**Sports:** `prvctice.sports.scores({sport, team?, date?})` → `{games}` | `.standings({sport})` → `{groups}` | `.schedule({sport, team?})` → `{games}`. Sports: nfl, nba, mlb, nhl, soccer, wnba. Filter by team name/abbr.
**Markets:** `prvctice.markets.crypto(ids)` → `{prices}` | `.stock(symbol)` → `{quotes}` | `.trending()` → `{coins}`
**Weather:** `prvctice.weather.current({location})` → `{current}` | `.forecast({location, days})` → `{daily}`

### Animation (Spring Physics)

Animate CSS properties with spring physics instead of CSS transitions. Five presets control the feel:

| Preset     | Duration | Feel              | Use for                                |
| ---------- | -------- | ----------------- | -------------------------------------- |
| `xsnappy`  | ~200ms   | Instant response  | Button presses, micro-interactions     |
| `snappy`   | ~350ms   | Quick and crisp   | Cards, panels, interactive tools       |
| `standard` | ~500ms   | Default balanced  | General transitions                    |
| `gentle`   | ~800ms   | Smooth and calm   | Media, ambient, content reveals        |
| `bouncy`   | ~900ms   | Playful overshoot | Games, celebrations, attention-getting |

```js
prvctice.onReady(function () {
  // Animate a single element
  prvctice.animate('#card', { opacity: 1, transform: 'translateY(0)' }, { preset: 'snappy' });

  // Stagger-animate list children (40ms between each)
  prvctice.ui.animateEntrance(document.getElementById('list'), { stagger: 40 });

  // Chain animations sequentially
  prvctice.sequence([
    { target: '#title', props: { opacity: '1' }, opts: { preset: 'gentle' } },
    { target: '#subtitle', props: { opacity: '1' }, opts: { preset: 'snappy', delay: 100 } },
  ]);

  // Animate a numeric counter
  prvctice.animateValue(document.getElementById('score'), 0, 100, {
    preset: 'snappy',
    onUpdate: function (v) {
      document.getElementById('score').textContent = Math.round(v);
    },
  });
});
```

Always add entrance animations to lists and grids using `animateEntrance`. Use `animate` for button press feedback (scale down on press, bounce back on release).

### Navigation (Multi-View Router)

For apps with 2+ distinct screens, use `prvctice.ui.router()` instead of manual show/hide logic:

```html
<body class="p-stack full">
  <div data-view="list" class="p-stack full">
    <!-- List view content -->
  </div>
  <div data-view="detail" class="p-stack full">
    <button class="p-btn p-btn-ghost" id="backBtn">&larr;</button>
    <!-- Detail view content -->
  </div>
</body>
```

```js
prvctice.onReady(function () {
  var router = prvctice.ui.router({ initial: 'list' });

  // Navigate forward (slide-in from right)
  document.getElementById('item').onclick = function () {
    router.push('detail');
  };
  // Navigate back (slide-out to right)
  document.getElementById('backBtn').onclick = function () {
    router.pop();
  };

  // Cleanup on dispose
  prvctice.onDispose(function () {
    router.dispose();
  });
});
```

Views are `<div data-view="name">` elements. Router handles positioning, show/hide, and slide transitions automatically.

### Forms (Declarative)

Use `prvctice.ui.form()` instead of building form HTML manually:

```js
prvctice.onReady(function () {
  var form = prvctice.ui.form(document.getElementById('settings'), {
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'count', label: 'Count', type: 'number', min: 1, max: 100, value: 10 },
      { name: 'theme', label: 'Theme', type: 'select', options: ['Light', 'Dark', 'Auto'] },
      { name: 'notifications', label: 'Notifications', type: 'toggle', value: true },
      { name: 'volume', label: 'Volume', type: 'slider', min: 0, max: 100, value: 75 },
    ],
    submitLabel: 'Save',
    onSubmit: function (data) {
      prvctice.storage.set('settings', data);
      prvctice.ui.toast({ message: 'Settings saved', type: 'success' });
    },
  });

  // Load saved values — setValue(name, value) sets individual fields
  prvctice.storage.get('settings').then(function (saved) {
    if (saved) {
      var keys = Object.keys(saved);
      for (var i = 0; i < keys.length; i++) {
        form.setValue(keys[i], saved[keys[i]]);
      }
    }
  });

  prvctice.onDispose(function () {
    form.dispose();
  });
});
```

Field types: `text`, `number`, `select`, `toggle`, `slider`, `checkbox`, `radio`. Built-in validators: `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `email`.

### Notifications

```js
// Toast — transient message (auto-dismisses)
prvctice.ui.toast({ message: 'Saved!', type: 'success', duration: 2000 });
// Types: 'success', 'error', 'info', 'warning'

// Confirm — blocking confirmation dialog
prvctice.ui
  .confirm({
    title: 'Delete Item',
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
  })
  .then(function (confirmed) {
    if (confirmed) {
      /* proceed */
    }
  });

// Alert — simple informational dialog
prvctice.ui.alert({ title: 'Notice', message: 'Operation complete.' });
```

Use toast after user actions (save, delete, copy). Use confirm before destructive actions. Use alert for important notices.

### Media Playback

```js
// Play remote audio
var player = prvctice.media.playAudio('https://example.com/song.mp3');
player.play();
player.pause();
player.seek(30); // seek to 30 seconds
player.setVolume(0.5);
var state = player.getState(); // { currentTime, duration, paused, ended, volume }
player.dispose(); // cleanup

// Play local audio from base64 (e.g. recorded audio from stopMicrophone or MediaRecorder)
// Accepts data URIs: 'data:audio/webm;base64,...' or raw base64 strings
var localPlayer = prvctice.media.playAudio('data:audio/webm;base64,' + recordedBase64);

// Load remote image through host proxy (bypasses sandbox restrictions)
prvctice.media.loadImage('https://example.com/photo.jpg').then(function (img) {
  document.getElementById('photo').src = img.dataUri; // base64 data URI
  // img.width, img.height available
});
```

### Media Tools (ffmpeg / yt-dlp)

Process media files server-side. All methods return fileId + url for results stored in blob storage. Requires `connector:media-tools` permission.

```js
// Download a video from URL (long-running, no 30s timeout)
prvctice.mediaTools.download('https://youtube.com/watch?v=...').then(function (result) {
  // result: { fileId, url, size, title, duration, format, metadata }
  var videoUrl = result.url; // /api/v1/files/<fileId>
});

// Download audio only
prvctice.mediaTools
  .download('https://youtube.com/watch?v=...', { format: 'audio' })
  .then(function (result) {
    var audioPlayer = prvctice.media.playAudio(result.url);
    audioPlayer.play();
  });

// Probe file metadata (duration, codec, resolution)
prvctice.mediaTools.probe({ fileId: 'abc123' }).then(function (info) {
  // info: { duration, size, format, video: { codec, width, height }, audio: { codec, sampleRate, channels } }
});

// Convert format
prvctice.mediaTools.convert({ fileId: 'abc123', format: 'mp3' }).then(function (result) {
  // result: { fileId, url, size, format }
});

// Extract audio from video
prvctice.mediaTools.extractAudio({ fileId: 'abc123', format: 'mp3' }).then(function (result) {
  // result: { fileId, url, size, format }
});

// Take screenshots at specific timestamps (seconds)
prvctice.mediaTools
  .screenshot({ fileId: 'abc123', timestamps: [0, 30, 60] })
  .then(function (result) {
    // result: { screenshots: [{ fileId, url, size, timestamp }, ...] }
    result.screenshots.forEach(function (s) {
      prvctice.media.loadImage(s.url).then(function (img) {
        document.getElementById('thumb').src = img.dataUri;
      });
    });
  });

// Trim video (start/end in seconds)
prvctice.mediaTools
  .trim({ fileId: 'abc123', start: 10, end: 60, format: 'mp4' })
  .then(function (result) {
    // result: { fileId, url, size, format, start, end }
  });
```

Chaining example — download, screenshot, and extract audio:

```js
prvctice.mediaTools
  .download(url)
  .then(function (dl) {
    return Promise.all([
      prvctice.mediaTools.screenshot({ fileId: dl.fileId, timestamps: [0, dl.duration / 2] }),
      prvctice.mediaTools.extractAudio({ fileId: dl.fileId, format: 'mp3' }),
    ]);
  })
  .then(function (results) {
    var screenshots = results[0].screenshots;
    var audio = results[1];
    // Use screenshots and audio...
  })
  .catch(function (err) {
    prvctice.ui.toast({ message: err.message, type: 'danger' });
  });
```

**IMPORTANT: Saving downloaded files to device.** `mediaTools.download()` returns a server-hosted URL (`result.url`), NOT base64 data. To let users save it to their device, use `prvctice.media.saveUrl(result.url, result.title + '.' + result.format)`. Do NOT pass `result.url` to `prvctice.media.download()` — that expects base64 and will produce a corrupt file.

Audio formats: mp3, aac, wav, ogg, opus, flac, webm, m4a. Video formats: mp4, webm, mkv. Image formats: jpg, png, webp. Max input: 100MB. Max output: 50MB.

### Fader

Mixing-console fader for volume, pan, EQ, crossfade controls:

```js
var vol = prvctice.ui.fader(document.getElementById('volumeRow'), {
  min: 0,
  max: 1,
  step: 0.01,
  value: 0.75,
  label: 'VOLUME',
  orientation: 'vertical',
  color: 'var(--p-accent-blue)',
  onChange: function (v) {
    gainNode.gain.value = v;
  },
});
// Read: vol.get()
// Set programmatically: vol.set(0.5)
// Cleanup: vol.dispose()
```

Options: `min`, `max`, `step`, `value` (initial), `label`, `orientation` ('vertical'|'horizontal'), `color` (CSS value), `detent` (snap value, e.g. 0.5 for center), `format` (display formatter function), `onChange`.

### Timeline

DAW-style multi-track timeline for clip editing:

```js
var tl = prvctice.ui.timeline(document.getElementById('timeline'), {
  duration: 120,
  lanes: [
    { id: 'video', label: 'VIDEO' },
    { id: 'audio', label: 'AUDIO' },
  ],
  clips: [{ id: 'c1', laneId: 'video', start: 0, duration: 10, label: 'Intro' }],
  snap: true,
  snapInterval: 0.5,
  zoom: 1,
  onSeek: function (time) {
    seekTo(time);
  },
  onClipMove: function (info) {
    updateClip(info);
  },
  onClipAdd: function (info) {
    addNewClip(info.laneId, info.start);
  },
});
// tl.setPlayhead(5.2) — move playhead
// tl.addClip({id, laneId, start, duration, label})
// tl.removeClip('c1')
// tl.setZoom(2) — zoom in
// tl.dispose() — cleanup
```

Callbacks: `onPlay(pos)`, `onPause(pos)`, `onSeek(pos)`, `onClipMove({clipId, laneId, start, duration})`, `onClipSelect(clipId)`, `onClipAdd({laneId, start})`, `onZoom(level)`.

### Audio Buffer Manipulation

Non-destructive audio buffer operations (always return NEW buffers):

```js
// Load and decode audio from a dropped file
var reader = new FileReader();
reader.onload = function () {
  prvctice.audio.buffer.decode(reader.result).then(function (buf) {
    // Slice a 2-second region
    var clip = prvctice.audio.buffer.slice(buf, 1.0, 3.0);
    // Normalize and add fade
    var processed = prvctice.audio.buffer.normalize(clip);
    processed = prvctice.audio.buffer.fade(processed, 'in', 0.1);
    processed = prvctice.audio.buffer.fade(processed, 'out', 0.2);
    // Get waveform peaks for display
    var peaks = prvctice.audio.buffer.waveformPeaks(processed, 200);
    drawWaveform(peaks);
  });
};
reader.readAsArrayBuffer(file);
```

Methods: `decode(arrayBuffer)`, `slice(buf, start, end)`, `reverse(buf)`, `normalize(buf)`, `fade(buf, 'in'|'out', duration)`, `mix(bufA, bufB, {gainA, gainB, offset})`, `pitchShift(buf, semitones)` (returns Promise), `waveformPeaks(buf, resolution)`.

### Image Processing

WebGL-accelerated filters and Canvas 2D transforms. All operations are non-destructive (return new canvas). Max size: 4096x4096.

```js
// Load image and apply filter chain
var img = document.getElementById('sourceImg');
var canvas = document.createElement('canvas');
canvas.width = img.naturalWidth;
canvas.height = img.naturalHeight;
canvas.getContext('2d').drawImage(img, 0, 0);

// Apply filter pipeline
var result = prvctice.image.pipeline(canvas, [
  { filter: 'brightness', value: 0.1 },
  { filter: 'contrast', value: 0.2 },
  { filter: 'vignette', radius: 0.4, amount: 0.6 },
]);

// Transform
result = prvctice.image.resize(result, { width: 800 });
result = prvctice.image.rotate(result, { angle: 90 });

// Add text overlay
result = prvctice.image.text(result, 'Hello', {
  x: 20,
  y: 20,
  size: 32,
  color: '#ffffff',
  font: 'sans-serif',
});

// Export
var dataUrl = prvctice.image.exportImage(result, { format: 'jpeg', quality: 0.85 });
prvctice.media.download(dataUrl.split(',')[1], 'edited.jpg', 'image/jpeg');
```

Filters: `grayscale`, `sepia`, `invert`, `blur({radius})`, `sharpen({amount})`, `brightness({value})`, `contrast({value})`, `saturation({value})`, `hueRotate({angle})`, `vignette({radius, amount})`, `noise({amount})`, `posterize({levels})`, `emboss`.

Transforms: `crop({x, y, width, height})`, `resize({width?, height?})`, `rotate({angle})`, `flip({horizontal?, vertical?})`.

Compositing: `composite(base, overlay, {blendMode, x, y, opacity})` — blend modes: normal, multiply, screen, overlay, darken, lighten.

### Frame Capture

Canvas frame capture for animation sequences and GIF encoding:

```js
// Continuous capture from animation canvas
var handle = prvctice.capture.start(animCanvas, {
  fps: 15,
  maxFrames: 100,
  maxDuration: 5000,
  onFrame: function (frameCanvas, info) {
    // Send each frame to GIF encoder
    var dataUri = frameCanvas.toDataURL('image/png');
    prvctice.gif.addFrame(encoderId, dataUri, 66);
  },
  onComplete: function (stats) {
    prvctice.gif.finish(encoderId);
  },
});
// handle.stop() — end capture early
// handle.isRunning() / handle.getFrameCount()

// Single snapshot
var snap = prvctice.capture.snapshot(canvas, { scale: 0.5 });
```

### Streaming AI

For progressive AI-generated content, use `ai.stream` instead of `ai.complete`:

```js
var outputEl = document.getElementById('output');
var handle = prvctice.ai.stream('Summarize this topic...', {
  onChunk: function (text) {
    outputEl.textContent += text;
  },
  onDone: function () {
    prvctice.ui.toast({ message: 'Done', type: 'success' });
  },
  maxTokens: 500,
});
// Cancel if needed: handle.cancel();
```

Requires `connector:ai` permission.

### Rules

1. **Use `p-*` classes for ALL layout.** Never write `display:flex` or `display:grid` manually.
2. **Use `prvctice.ui.*` for clocks, timers, canvases, dropzones, recorders.** Never build these from scratch.
3. **Use `var(--p-*)` for ALL colors, spacing, typography.** Never hardcode hex values or pixel sizes.
4. **Use `var(--p-font)` for text, `var(--p-font-mono)` for ALL data displays.** Never specify other fonts.
5. **Wrap all JS in `prvctice.onReady(function() { ... })`.** UI Kit components are available inside the callback.
6. **Keep apps compact.** Widget-sized, not full-page. Dense layout, small text, minimal whitespace.
7. **Typography hierarchy.** Huge mono numbers for primary data, tiny uppercase labels for context. Never same-size everything.
8. **Technical aesthetic.** Use ALL CAPS labels, dashed borders, monospace everywhere data appears. Think cockpit instrument, not mobile app.

### Example: Weather Station (terminal aesthetic)

```html
<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <!-- Terminal header — always first -->
    <div class="p-terminal-header">
      <span class="p-label-tech">WEATHER</span>
      <span class="p-status-live">LIVE</span>
    </div>

    <!-- Big temperature stat — the hero element -->
    <div class="p-stat p-stat-left" style="padding:0">
      <div class="p-stat-value font-mono font-bold" id="temp" style="color:var(--p-primary)">
        --°
      </div>
      <div class="p-stat-label p-label-tech" id="loc">LOADING</div>
    </div>

    <div class="p-divider"></div>

    <!-- Dense data rows — compact, left-label right-value -->
    <div class="p-stack gap-2">
      <div class="p-split text-xs font-mono">
        <span class="text-muted">HUMIDITY</span>
        <span id="hum">--%</span>
      </div>
      <div class="p-split text-xs font-mono">
        <span class="text-muted">WIND</span>
        <span id="wind">-- km/h</span>
      </div>
    </div>

    <!-- Footer metadata -->
    <div class="p-split p-feed-meta" style="flex-shrink:0">
      <span class="p-label-tech" style="font-size:10px;opacity:0.7">SOURCE</span>
      <span class="text-muted">OPEN-METEO</span>
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>

  <script>
    prvctice.onReady(function () {
      prvctice.weather
        .current({ location: 'New York' })
        .then(function (w) {
          document.getElementById('temp').textContent = Math.round(w.current.temperature_2m) + '°';
          document.getElementById('loc').textContent = (w.location.name || 'LOCAL').toUpperCase();
          document.getElementById('hum').textContent =
            Math.round(w.current.relative_humidity_2m) + '%';
          document.getElementById('wind').textContent =
            Math.round(w.current.wind_speed_10m) + ' km/h';
        })
        .catch(function (e) {
          showError('OFFLINE');
        });
    });
  </script>
</body>
```
