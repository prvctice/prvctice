# Example Apps

## Overview

prvctice includes example apps demonstrating SDK capabilities. These serve as references for both developers building manual apps and the AI app generator. All examples use ES5 syntax, UIKit CSS classes, and the `prvctice.onReady()` lifecycle.

---

## Showcase Apps

Rich demonstrations combining multiple APIs from different namespaces.

### Music Studio

**File:** `src/prompts/templates/music-studio.html`
**APIs used:** `prvctice.audio` (tone, sequence, createRecorder, encodeWAV, bufferToBase64), `prvctice.media` (download), `prvctice.ui` (oscilloscope, form, tabs, toast, animateEntrance), `prvctice.animate`, `prvctice.storage`

A mini music creation app with an 8-pad virtual keyboard, 4 scale presets (Major, Minor, Pentatonic, Blues), oscilloscope visualization, audio recording with WAV export, configurable settings form (tempo, volume, wave type), and persistent settings.

**Key Patterns:**

- The pad grid dynamically remaps frequencies based on the selected scale without re-rendering button DOM. Only `data-freq` attributes update, avoiding DOM thrashing during scale switches.
- Settings form uses `prvctice.ui.form()` with slider and select field types, persisted to `prvctice.storage` on submit.
- Oscilloscope is a live waveform visualization component that requires an active audio context -- it renders only while audio is playing.

### Asteroid Dodge

**File:** `src/prompts/templates/asteroid-dodge.html`
**APIs used:** `prvctice.ui` (canvas, toast), `prvctice.animate`, `prvctice.animateValue`, `prvctice.audio` (tone), `prvctice.storage`

A canvas-based arcade game where the player dodges falling asteroids by tapping left/right. Features a game state machine (menu/playing/gameover), increasing difficulty, bonus star collectibles, explosion particle effects, animated score counter, persistent high scores, and sound effects.

**Key Patterns:**

- Game loop is RAF-driven with a state machine (menu, playing, gameover). All game objects (asteroids, stars, particles) are plain data structures updated per tick, then rendered from scratch each frame. No retained graphics state, which simplifies resets.
- Collision detection runs against the data structures, not DOM elements.
- High scores persist via `prvctice.storage.get/set()` across sessions.
- Sound effects use `prvctice.audio.tone()` with different frequencies for hits vs. pickups.

### Album Player

**File:** `src/prompts/templates/album-player.html`
**APIs used:** `prvctice.ui` (router, toast, confirm, animateEntrance), `prvctice.audio` (tone), `prvctice.animate`, `prvctice.storage`

A multi-view music player with three views (Library, Now Playing, Queue) using `prvctice.ui.router()`. Demonstrates navigation with push/pop transitions, album grid with stagger animations, playback controls with synthesized audio previews, queue management, and persistent queue state.

**Key Patterns:**

- Router is declarative: views are defined as DOM elements with `data-view` attributes. `router.push('view-name')` triggers iOS-style slide transitions via CSS. The DOM structure exists at mount time; visibility is CSS-driven, not mount/unmount.
- Track playback is simulated with `prvctice.audio.tone()` since apps can't load external audio files. Each track maps to a frequency.
- Queue state persists to storage so users don't lose their playlist across app restarts.

---

## Template Apps

Simpler templates demonstrating focused functionality.

### Weather Card

**File:** `src/prompts/templates/weather-card.html`
**APIs used:** `prvctice.weather` (current), `prvctice.refresh` (onRefresh, start)

A live weather display showing temperature, humidity, wind speed, and feels-like temperature with auto-refresh every 10 minutes.

**How It Works:** Calls `prvctice.weather.current()` on load (auto-geolocates if no location specified). Registers both `prvctice.refresh.onRefresh()` for manual pull-to-refresh gestures and `prvctice.refresh.start(600000)` for background polling. The dual approach gives responsive immediate updates plus background sync.

### Study Timer

**File:** `src/prompts/templates/timer.html`
**APIs used:** `prvctice.ui` (timer, stepper)

A countdown timer with configurable duration (5-120 minutes via stepper), start/pause/reset controls, progress bar, and status indicator.

**How It Works:** `prvctice.ui.timer()` manages countdown state internally, exposing `start()`, `pause()`, `reset()`, and `setDuration()`. The stepper control calls `timer.setDuration()` to allow mid-session duration changes without resetting elapsed time. Progress visualization uses a CSS custom property (`--progress`).

### Clock

**File:** `src/prompts/templates/clock.html`
**APIs used:** `prvctice.ui` (clock, analogClock)

Dual clock display showing both digital and analog clock components side by side.

**How It Works:** Both `prvctice.ui.clock()` and `prvctice.ui.analogClock()` are self-updating widgets that manage their own intervals. The date string updates on a separate 60-second interval. Each component owns its own update cadence with no centralized sync required.

### Bookmark List

**File:** `src/prompts/templates/list-app.html`
**APIs used:** `prvctice.storage` (get, set)

A simple bookmark list with add/remove functionality and persistent storage.

**How It Works:** Maintains a plain array in memory, re-renders the full list on every mutation. Uses `element.textContent` assignment (not `innerHTML`) to prevent XSS from user input. Event delegation on the list container handles dynamic delete buttons via `event.target.closest()`. State persists to `prvctice.storage` after each mutation.

### Voice Recorder

**File:** `src/prompts/templates/voice-recorder.html`
**APIs used:** `prvctice.ui` (audioRecorder, mediaPlayer, base64ToBlob)

An audio recorder with waveform visualization, recording list, and playback using the media player component.

**How It Works:** `prvctice.ui.audioRecorder()` captures audio and returns results as `{audio: base64, mimeType, duration}`. The app converts base64 back to a blob via `prvctice.ui.base64ToBlob()`, creates an ObjectURL, and passes it to `prvctice.ui.mediaPlayer()` for playback. Base64 encoding avoids large in-memory blob handling and allows serialization to storage.

### Canvas Editor

**File:** `src/prompts/templates/canvas-editor.html`
**APIs used:** `prvctice.ui` (canvas, dropzone, tabs)

A drawing canvas with file drop support, tool tabs, and brush/eraser functionality.

**How It Works:** Stores the original image as an Image DOM element and never mutates it. On every filter change, clears the canvas and re-draws the original with current transforms (rotation, flip, brightness/contrast/saturate via Canvas 2D `filter` CSS syntax). This non-destructive pipeline makes reset trivial -- just re-draw the original.

### Media Processor

**File:** `src/prompts/templates/media-processor.html`
**APIs used:** `prvctice.ui` (dropzone)

A file drop zone for processing media files with the dropzone component.

**How It Works:** Uses `prvctice.ui.dropzone()` to accept video files, creates blob URLs for `<video>` playback, and captures frames by drawing `<video>` onto a canvas at seek positions. Sequential seeking (set `currentTime`, wait for `onseeked`, capture, advance) prevents dropped frames at high frame rates.

---

## Recipes

Copy-paste patterns for common app tasks.

### How to Show Loading, Error, and Empty States

```html
<div id="content"></div>
<script>
  prvctice.onReady(function () {
    var el = document.getElementById('content');
    var dv = prvctice.ui.dataView(el, {
      load: function () {
        return prvctice.weather.current();
      },
      render: function (data, contentEl) {
        contentEl.innerHTML =
          '<div class="p-stat-value">' + Math.round(data.current.temperature_2m) + '\u00B0</div>';
      },
      errorMessage: 'Failed to load',
    });
  });
</script>
```

`prvctice.ui.dataView()` manages loading spinners, error messages with retry buttons, and empty states automatically.

### How to Persist State Across Restarts

```html
<script>
  prvctice.onReady(function () {
    var STATE_KEY = 'myapp-state';

    // Load on startup
    prvctice.storage.get(STATE_KEY).then(function (saved) {
      if (saved) {
        applyState(saved);
      }
    });

    // Save after changes
    function saveState(state) {
      prvctice.storage.set(STATE_KEY, state);
    }
  });
</script>
```

Storage is scoped per app. Each app gets its own isolated key-value store. Keys are strings, values are JSON-serializable.

### How to Add a Refresh Button with Background Polling

```html
<script>
  prvctice.onReady(function () {
    function refresh() {
      // your data-fetching logic here
    }

    // Manual refresh (pull-to-refresh gesture or button)
    prvctice.refresh.onRefresh(refresh);

    // Background polling every 5 minutes
    prvctice.refresh.start(300000);

    // Initial load
    refresh();
  });
</script>
```

### How to Use AI Completion in an App

```html
<script>
  prvctice.onReady(function () {
    var input = document.getElementById('prompt');
    var output = document.getElementById('result');

    document.getElementById('askBtn').addEventListener('click', function () {
      output.textContent = 'Thinking...';
      prvctice.ai
        .complete(input.value)
        .then(function (response) {
          output.textContent = response;
        })
        .catch(function (err) {
          output.textContent = 'Error: ' + err.message;
        });
    });
  });
</script>
```

For streaming responses, use `prvctice.ai.stream()` instead.

### How to Clean Up on Dispose

```html
<script>
  prvctice.onReady(function () {
    var interval = setInterval(tick, 1000);
    var router = prvctice.ui.router({ container: document.body, initial: 'main' });

    prvctice.onDispose(function () {
      clearInterval(interval);
      router.dispose();
    });
  });
</script>
```

Always clean up intervals, routers, recorders, and any listeners in `prvctice.onDispose()`. The host calls this when the app window closes.

### How to Build a Photo Booth with Camera

Use `prvctice.camera` to preview live frames and capture high-quality stills.

```javascript
prvctice.onReady(function () {
  var preview = document.getElementById('preview');
  var unsub;

  prvctice.camera.start({ resolution: 'high', facingMode: 'user' }).then(function (info) {
    document.getElementById('res').textContent =
      info.resolution.width + 'x' + info.resolution.height;

    unsub = prvctice.camera.onFrame(function (dataUri) {
      preview.src = dataUri;
    });
  });

  document.getElementById('capture-btn').addEventListener('click', function () {
    prvctice.camera.capture().then(function (photo) {
      document.getElementById('snapshot').src = photo.dataUri;
      // Download the photo
      var b64 = photo.dataUri.split(',')[1];
      prvctice.media.download(b64, 'photo.jpg', 'image/jpeg');
    });
  });

  prvctice.onDispose(function () {
    if (unsub) unsub();
    prvctice.camera.stop();
  });
});
```

**Key patterns:** Camera permission dialog appears on first `start()` call. Always call `camera.stop()` in `onDispose`. Use `onFrame` for preview, `capture` for high-quality stills.

### How to Build a Video Player with Timeline Thumbnails

Use `prvctice.video` to load a video and `seekAndCapture` for timeline thumbnails.

```javascript
prvctice.onReady(function () {
  var playerId;

  prvctice.video.load({ url: 'https://example.com/clip.mp4' }).then(function (info) {
    playerId = info.playerId;
    document.getElementById('duration').textContent = Math.round(info.duration) + 's';

    // Generate thumbnails every 5 seconds
    var times = [];
    for (var t = 0; t < info.duration; t += 5) times.push(t);

    function next(i) {
      if (i >= times.length) return;
      prvctice.video.seekAndCapture(playerId, times[i], 160, 90).then(function (frame) {
        var img = document.createElement('img');
        img.src = frame.dataUri;
        img.className = 'thumbnail';
        img.addEventListener('click', function () {
          prvctice.video.seek(playerId, times[i]);
        });
        document.getElementById('timeline').appendChild(img);
        next(i + 1);
      });
    }
    next(0);
  });

  document.getElementById('play-btn').addEventListener('click', function () {
    prvctice.video.play(playerId);
  });

  document.getElementById('pause-btn').addEventListener('click', function () {
    prvctice.video.pause(playerId);
  });

  prvctice.onDispose(function () {
    if (playerId) prvctice.video.unload(playerId);
  });
});
```

**Key patterns:** Multiple videos supported with different `playerId` values. Always `unload` in `onDispose`. Thumbnails generated sequentially to avoid overwhelming the host.

### How to Record a Camera-to-GIF Animation

Pipe camera frames directly into the GIF encoder for screen-recording-style animated GIFs.

```javascript
prvctice.onReady(function () {
  var encoderId;
  var frameUnsub;
  var recording = false;

  // Create encoder first
  prvctice.gif.create({ width: 320, height: 240, quality: 'medium' }).then(function (info) {
    encoderId = info.encoderId;

    // Subscribe to encoding progress
    prvctice.gif.onProgress(encoderId, function (percent) {
      document.getElementById('progress').textContent = 'Encoding: ' + percent + '%';
    });
  });

  // Start camera
  prvctice.camera.start({ resolution: 'low', fps: 10 });

  // Preview all frames
  var previewUnsub = prvctice.camera.onFrame(function (dataUri) {
    document.getElementById('preview').src = dataUri;
    // Record frames when recording is active
    if (recording && encoderId) {
      prvctice.gif.addFrame(encoderId, dataUri, 100);
    }
  });

  document.getElementById('record-btn').addEventListener('click', function () {
    recording = !recording;
    document.getElementById('record-btn').textContent = recording ? 'Stop' : 'Record';

    if (!recording && encoderId) {
      // Stop recording, finish encoding
      prvctice.gif.finish(encoderId).then(function (result) {
        document.getElementById('result').src = result.dataUri;
        // Download the GIF
        var b64 = result.dataUri.split(',')[1];
        prvctice.media.download(b64, 'animation.gif', 'image/gif');
      });
    }
  });

  prvctice.onDispose(function () {
    if (previewUnsub) previewUnsub();
    prvctice.camera.stop();
    if (encoderId) prvctice.gif.cancel(encoderId);
  });
});
```

**Key patterns:** Create the encoder before recording starts. Camera `onFrame` callback feeds frames to `gif.addFrame`. Use `low` resolution for GIFs (320x240 keeps file size reasonable). Cancel the encoder in `onDispose` if unfinished.

### How to Create a GIF from Canvas Frames

Use `prvctice.gif` without a camera -- capture canvas frames programmatically.

```javascript
prvctice.onReady(function () {
  var canvas = document.getElementById('animation-canvas');
  var ctx = canvas.getContext('2d');
  var frames = 30;
  var encoderId;

  prvctice.gif
    .create({ width: canvas.width, height: canvas.height, quality: 'high' })
    .then(function (info) {
      encoderId = info.encoderId;

      function renderAndCapture(i) {
        if (i >= frames) {
          // All frames added, finish encoding
          prvctice.gif.finish(encoderId).then(function (result) {
            document.getElementById('output').src = result.dataUri;
          });
          return;
        }

        // Draw frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'hsl(' + i * 12 + ', 80%, 50%)';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 20 + i * 2, 0, Math.PI * 2);
        ctx.fill();

        // Capture and add frame
        var dataUri = canvas.toDataURL('image/png');
        prvctice.gif.addFrame(encoderId, dataUri, 50).then(function () {
          renderAndCapture(i + 1);
        });
      }
      renderAndCapture(0);
    });
});
```

**Key patterns:** Any canvas content can be GIF-encoded. Sequential frame addition avoids memory pressure. PNG data URIs work (not just JPEG). Frame delay of 50ms = 20 FPS in the output GIF.

### How to Process Audio Buffers Non-Destructively

Use `prvctice.audio.buffer` for slicing, reversing, fading, and pitch-shifting audio without mutating the original.

```javascript
prvctice.onReady(function () {
  var original;

  // Decode audio from a base64 string or ArrayBuffer
  document.getElementById('load-btn').addEventListener('click', function () {
    prvctice.audio.buffer.decode(audioData).then(function (buf) {
      original = buf;
      document.getElementById('info').textContent =
        buf.duration.toFixed(1) + 's, ' + buf.sampleRate + ' Hz, ' + buf.numberOfChannels + ' ch';
      renderWaveform(buf);
    });
  });

  // Slice a 2-second segment starting at 1s
  document.getElementById('slice-btn').addEventListener('click', function () {
    if (!original) return;
    prvctice.audio.buffer.slice(original, 1.0, 3.0).then(function (sliced) {
      renderWaveform(sliced);
    });
  });

  // Chain: normalize, fade in/out, then reverse
  document.getElementById('process-btn').addEventListener('click', function () {
    if (!original) return;
    prvctice.audio.buffer
      .normalize(original)
      .then(function (normed) {
        return prvctice.audio.buffer.fade(normed, 'in', 0.3);
      })
      .then(function (fadedIn) {
        return prvctice.audio.buffer.fade(fadedIn, 'out', 0.5);
      })
      .then(function (fadedOut) {
        return prvctice.audio.buffer.reverse(fadedOut);
      })
      .then(function (result) {
        renderWaveform(result);
      });
  });

  // Pitch shift down one octave (semitones: -12)
  document.getElementById('pitch-btn').addEventListener('click', function () {
    if (!original) return;
    prvctice.audio.buffer.pitchShift(original, -12).then(function (shifted) {
      renderWaveform(shifted);
    });
  });

  function renderWaveform(buf) {
    var peaks = prvctice.audio.buffer.waveformPeaks(buf, 200);
    var canvas = document.getElementById('waveform');
    var ctx = canvas.getContext('2d');
    var w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--p-accent-blue');
    for (var i = 0; i < peaks.length; i++) {
      var x = (i / peaks.length) * w;
      var barW = w / peaks.length;
      var top = ((1 - peaks[i].max) / 2) * h;
      var bottom = ((1 - peaks[i].min) / 2) * h;
      ctx.fillRect(x, top, barW, bottom - top);
    }
  }

  prvctice.onDispose(function () {
    original = null;
  });
});
```

**Key patterns:** Every buffer operation returns a new AudioBuffer -- the original is never mutated. Chain `.then()` calls for multi-step processing. Use `waveformPeaks()` for visualization (mixes to mono, returns min/max pairs). `pitchShift` changes both pitch and tempo (uses playbackRate internally).

### How to Build an Image Filter Pipeline

Use `prvctice.image` for non-destructive filter chains, transforms, and export.

```javascript
prvctice.onReady(function () {
  var sourceCanvas;

  // Load an image from a data URI or URL
  document.getElementById('load-btn').addEventListener('click', function () {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      sourceCanvas = c;
      showPreview(c);
    };
    img.src = document.getElementById('img-input').value;
  });

  // Apply a single filter
  document.getElementById('grayscale-btn').addEventListener('click', function () {
    if (!sourceCanvas) return;
    var result = prvctice.image.grayscale(sourceCanvas);
    showPreview(result);
  });

  // Chain multiple filters with pipeline
  document.getElementById('cinematic-btn').addEventListener('click', function () {
    if (!sourceCanvas) return;
    var result = prvctice.image.pipeline(sourceCanvas, [
      { filter: 'contrast', amount: 1.3 },
      { filter: 'saturation', amount: 0.8 },
      { filter: 'vignette', amount: 0.6 },
      { filter: 'sepia', amount: 0.15 },
    ]);
    showPreview(result);
  });

  // Transform: resize then rotate
  document.getElementById('transform-btn').addEventListener('click', function () {
    if (!sourceCanvas) return;
    var resized = prvctice.image.resize(sourceCanvas, { width: 400, height: 300 });
    var rotated = prvctice.image.rotate(resized, { angle: 15 });
    showPreview(rotated);
  });

  // Export as JPEG blob
  document.getElementById('export-btn').addEventListener('click', function () {
    var preview = document.getElementById('preview-canvas');
    prvctice.image.exportBlob(preview, { format: 'jpeg', quality: 0.85 }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'processed.jpg';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  function showPreview(canvas) {
    var target = document.getElementById('preview-canvas');
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext('2d').drawImage(canvas, 0, 0);
  }
});
```

**Key patterns:** Every filter and transform returns a new canvas -- the source is never mutated. Use `pipeline()` to chain multiple filters in one call (more efficient than individual calls). The 13 built-in filters are: grayscale, sepia, blur, sharpen, brightness, contrast, saturation, invert, hueRotate, vignette, noise, posterize, emboss. WebGL is used automatically with Canvas 2D fallback. Max canvas size is 4096x4096.

### How to Build a Fader Mixer

Use `prvctice.ui.fader` for mixing-console-style vertical or horizontal sliders.

```javascript
prvctice.onReady(function () {
  var mixerEl = document.getElementById('mixer');
  var faders = [];
  var channels = [
    { label: 'Kick', color: 'var(--p-accent-blue)' },
    { label: 'Snare', color: 'var(--p-accent-amber)' },
    { label: 'HiHat', color: 'var(--p-accent-green)' },
    { label: 'Bass', color: 'var(--p-accent-blue)' },
  ];

  // Create a vertical fader for each channel
  channels.forEach(function (ch) {
    var wrap = document.createElement('div');
    wrap.className = 'p-stack gap-1 items-center';
    mixerEl.appendChild(wrap);

    var fader = prvctice.ui.fader(wrap, {
      orientation: 'vertical',
      min: 0,
      max: 100,
      value: 75,
      label: ch.label,
      color: ch.color,
      detent: null,
      onChange: function (val) {
        updateMix();
      },
    });
    faders.push(fader);
  });

  // Master fader with center detent (pan control)
  var masterWrap = document.getElementById('master');
  var masterFader = prvctice.ui.fader(masterWrap, {
    orientation: 'horizontal',
    min: -100,
    max: 100,
    value: 0,
    label: 'Pan',
    detent: 0,
    onChange: function (val) {
      document.getElementById('pan-display').textContent =
        val === 0 ? 'C' : val < 0 ? 'L' + Math.abs(val) : 'R' + val;
    },
  });

  function updateMix() {
    var levels = faders.map(function (f) {
      return f.get();
    });
    document.getElementById('levels').textContent = levels.join(' | ');
  }

  prvctice.onDispose(function () {
    faders.forEach(function (f) {
      f.dispose();
    });
    masterFader.dispose();
  });
});
```

**Key patterns:** Faders support both `vertical` and `horizontal` orientations. Use `detent: 0` for pan controls -- the thumb snaps to the detent value within 5% of the range. Double-click resets to default value. Each fader returns `{ get(), set(v), dispose() }`. Use the `color` option to match the instrument palette (`--p-accent-blue`, `--p-accent-amber`, `--p-accent-green`).

---

## API Coverage Matrix

| App             | storage | animate | audio | ui.router | ui.form | ui.toast | ui.canvas | connectors | refresh | audio.buffer | image | capture | ui.fader | ui.timeline |
| --------------- | ------- | ------- | ----- | --------- | ------- | -------- | --------- | ---------- | ------- | ------------ | ----- | ------- | -------- | ----------- |
| Music Studio    | x       | x       | x     |           | x       | x        |           |            |         |              |       |         |          |             |
| Asteroid Dodge  | x       | x       | x     |           |         | x        | x         |            |         |              |       |         |          |             |
| Album Player    | x       | x       | x     | x         |         | x        |           |            |         |              |       |         |          |             |
| Weather Card    |         |         |       |           |         |          |           | x          | x       |              |       |         |          |             |
| Study Timer     |         |         |       |           |         |          |           |            |         |              |       |         |          |             |
| Clock           |         |         |       |           |         |          |           |            |         |              |       |         |          |             |
| Bookmark List   | x       |         |       |           |         |          |           |            |         |              |       |         |          |             |
| Voice Recorder  |         |         |       |           |         |          |           |            |         |              |       |         |          |             |
| Canvas Editor   |         |         |       |           |         |          |           |            |         |              |       |         |          |             |
| Media Processor |         |         |       |           |         |          |           |            |         |              |       |         |          |             |

---

_Last verified: 2026-02-20_
