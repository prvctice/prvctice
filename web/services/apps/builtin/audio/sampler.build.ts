/**
 * Sampler HTML Build
 *
 * Chop-to-pad sampler: load audio via file drop or mic recording,
 * auto-chop by transient detection, assign slices to 4x4 or 4x2 pad grid,
 * per-pad pitch/volume/pan controls, WAV export.
 * Loaded lazily by the sampler config via dynamic import.
 */

export const SAMPLER_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* -- Waveform -- */
.sp-waveform-wrap {
  position: relative; height: 80px; border: 1px dashed var(--p-border);
  border-radius: var(--p-radius-md); overflow: hidden; cursor: crosshair;
  flex-shrink: 0;
}
.sp-waveform-canvas { width: 100%; height: 100%; display: block; }
.sp-waveform-msg {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--p-text-muted); font-size: 11px; font-family: var(--p-font-mono);
  pointer-events: none;
}
.sp-chop-marker {
  position: absolute; top: 0; bottom: 0; width: 2px;
  background: var(--p-accent-amber); opacity: 0.8; pointer-events: none;
}

/* -- Controls -- */
.sp-controls {
  display: flex; gap: 4px; flex-wrap: wrap; align-items: center; flex-shrink: 0;
}

/* -- Pad grid -- */
.sp-pads {
  display: grid; gap: 4px; flex: 1; min-height: 0;
}
.sp-pad {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: var(--p-radius-md); background: var(--p-surface);
  border: 1px solid var(--p-border); cursor: pointer;
  transition: background 60ms ease, box-shadow 60ms ease;
  position: relative; overflow: hidden; min-height: 48px;
  user-select: none;
}
.sp-pad:hover { background: var(--p-surface-raised); }
.sp-pad.loaded {
  border-color: var(--p-accent-blue);
  box-shadow: inset 0 0 0 1px rgba(68, 136, 255, 0.15);
}
.sp-pad.active {
  background: var(--p-accent-blue);
  box-shadow: 0 0 8px rgba(68, 136, 255, 0.4);
}
.sp-pad.selected {
  border-color: var(--p-accent-amber);
  box-shadow: 0 0 6px rgba(255, 107, 43, 0.3);
}
.sp-pad-label {
  font-size: 10px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); text-transform: uppercase;
}
.sp-pad-hint {
  font-size: 8px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  opacity: 0.5; margin-top: 2px;
}
.sp-pad-mini-wave {
  position: absolute; bottom: 0; left: 0; right: 0; height: 16px;
  pointer-events: none; opacity: 0.4;
}

/* -- Pad controls -- */
.sp-pad-controls {
  display: flex; gap: 8px; justify-content: center; align-items: flex-start;
  flex-shrink: 0;
}

/* -- Section label -- */
.sp-section-label {
  font-size: 9px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}

/* -- Grid select -- */
.sp-grid-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 8px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 10px; font-family: var(--p-font-mono);
  font-weight: 600; transition: all 80ms ease;
}
.sp-grid-btn:hover { background: var(--p-border); color: var(--p-text); }
.sp-grid-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}

/* -- Connection button -- */
.sp-conn-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 8px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); letter-spacing: 0.5px;
  transition: all 100ms ease;
}
.sp-conn-btn:hover { background: var(--p-border); }
.sp-conn-btn.live { color: var(--p-accent-green); border-color: rgba(46, 125, 66, 0.3); }
</style>
</head>
<body class="p-stack pad-2 full gap-1">

<div class="p-terminal-header">
  <span class="p-label-tech">SAMPLER</span>
  <span class="p-label-tech" style="color:var(--p-text-muted)" id="infoLabel">DROP AUDIO FILE</span>
  <button class="sp-conn-btn" id="connBtn">...</button>
</div>

<!-- Waveform display -->
<div class="sp-waveform-wrap" id="waveWrap">
  <canvas class="sp-waveform-canvas" id="waveCanvas"></canvas>
  <div class="sp-waveform-msg" id="waveMsg">Drop audio file or record from mic</div>
</div>

<!-- Controls row -->
<div class="sp-controls">
  <button class="p-btn p-btn-ghost p-btn-sm" id="recBtn">REC</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="filesBtn">FILES</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="chopBtn" disabled>AUTO-CHOP</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="clearBtn">CLEAR</button>
  <div style="flex:1"></div>
  <span class="sp-section-label">GRID</span>
  <button class="sp-grid-btn active" id="grid44Btn" data-grid="4x4">4x4</button>
  <button class="sp-grid-btn" id="grid42Btn" data-grid="4x2">4x2</button>
  <div style="flex:1"></div>
  <button class="p-btn p-btn-ghost p-btn-sm" id="exportBtn">EXPORT</button>
</div>

<!-- Pad grid -->
<div class="sp-pads" id="padGrid"></div>

<!-- Per-pad controls -->
<div class="sp-pad-controls" id="padControls">
  <span class="sp-section-label" style="align-self:center" id="padCtrlLabel">SELECT A PAD</span>
</div>

<script>
prvctice.onReady(function() {
  var ctx = prvctice.audio.createContext();
  var mixerChannelId = null;
  var mixerConnected = false;
  var sourceBuffer = null; // Full loaded AudioBuffer
  var chopMarkers = [];    // Array of time positions (seconds)
  var padSlices = [];       // Array of AudioBuffer per pad
  var padParams = [];       // Array of { pitch, volume, pan }
  var gridRows = 4;
  var gridCols = 4;
  var selectedPad = -1;
  var activeSources = {};   // padIndex -> { source, gain, pan }
  var recording = false;
  var mediaRecorder = null;
  var recordChunks = [];

  // Knob instances for per-pad controls
  var pitchKnob = null;
  var volKnob = null;
  var panKnob = null;

  // Keyboard mapping
  var PAD_KEYS_16 = ['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v'];
  var PAD_KEYS_8 = ['1','2','3','4','q','w','e','r'];
  var activeKeyPads = {};

  // ---- Init pad params ----
  function initPadParams() {
    padParams = [];
    var total = gridRows * gridCols;
    for (var i = 0; i < total; i++) {
      padParams.push({ pitch: 0, volume: 1.0, pan: 0 });
    }
  }

  // ---- Waveform drawing ----
  var waveCanvas = document.getElementById('waveCanvas');
  var waveCtx = waveCanvas.getContext('2d');
  var waveMsg = document.getElementById('waveMsg');

  function resizeCanvas() {
    var rect = waveCanvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    waveCanvas.width = Math.round(rect.width * dpr);
    waveCanvas.height = Math.round(rect.height * dpr);
    waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaveform();
  }

  function drawWaveform() {
    var w = waveCanvas.width / (window.devicePixelRatio || 1);
    var h = waveCanvas.height / (window.devicePixelRatio || 1);
    waveCtx.clearRect(0, 0, w, h);

    if (!sourceBuffer) return;

    var peaks = prvctice.audio.buffer.waveformPeaks(sourceBuffer, Math.floor(w));
    var mid = h / 2;

    // Get theme color
    var cs = getComputedStyle(document.documentElement);
    var waveColor = cs.getPropertyValue('--p-accent-blue').trim() || '#4488ff';

    waveCtx.fillStyle = waveColor;
    for (var i = 0; i < peaks.length; i++) {
      var minY = mid + peaks[i].min * mid;
      var maxY = mid + peaks[i].max * mid;
      var barH = Math.max(1, maxY - minY);
      waveCtx.fillRect(i, minY, 1, barH);
    }

    // Draw chop markers
    if (chopMarkers.length > 0) {
      var dur = sourceBuffer.duration;
      for (var c = 0; c < chopMarkers.length; c++) {
        var x = (chopMarkers[c] / dur) * w;
        waveCtx.fillStyle = cs.getPropertyValue('--p-accent-amber').trim() || '#ff6b2b';
        waveCtx.fillRect(x - 1, 0, 2, h);
      }
    }
  }

  // ---- Transient detection ----
  function detectTransients(buffer, maxSlices) {
    var data = buffer.getChannelData(0);
    var sr = buffer.sampleRate;
    var windowSize = Math.floor(sr * 0.01); // 10ms window
    var hopSize = Math.floor(windowSize / 2);
    var energies = [];
    var times = [];

    // Compute RMS energy in windows
    for (var i = 0; i + windowSize < data.length; i += hopSize) {
      var sum = 0;
      for (var j = 0; j < windowSize; j++) {
        sum += data[i + j] * data[i + j];
      }
      energies.push(Math.sqrt(sum / windowSize));
      times.push(i / sr);
    }

    // Compute spectral flux (energy difference)
    var flux = [];
    for (var k = 1; k < energies.length; k++) {
      var diff = energies[k] - energies[k - 1];
      flux.push(diff > 0 ? diff : 0);
    }

    // Adaptive threshold: local mean + factor * local std
    var threshWindow = 20;
    var factor = 1.5;
    var peaks = [];

    for (var m = 0; m < flux.length; m++) {
      var start = Math.max(0, m - threshWindow);
      var end = Math.min(flux.length, m + threshWindow);
      var localSum = 0;
      var count = end - start;
      for (var n = start; n < end; n++) localSum += flux[n];
      var mean = localSum / count;
      var varSum = 0;
      for (var n2 = start; n2 < end; n2++) varSum += (flux[n2] - mean) * (flux[n2] - mean);
      var std = Math.sqrt(varSum / count);
      var threshold = mean + factor * std;

      if (flux[m] > threshold && flux[m] > 0.01) {
        peaks.push({ time: times[m + 1], energy: flux[m] });
      }
    }

    // Remove peaks too close together (minimum 50ms apart)
    var minGap = 0.05;
    var filtered = [];
    for (var p = 0; p < peaks.length; p++) {
      if (filtered.length === 0 || peaks[p].time - filtered[filtered.length - 1].time >= minGap) {
        filtered.push(peaks[p]);
      }
    }

    // Sort by energy, keep top N
    filtered.sort(function(a, b) { return b.energy - a.energy; });
    var topN = filtered.slice(0, maxSlices - 1);

    // Sort by time, add start
    topN.sort(function(a, b) { return a.time - b.time; });
    var markers = [0];
    for (var t = 0; t < topN.length; t++) {
      markers.push(topN[t].time);
    }

    return markers;
  }

  // ---- Load audio ----
  function loadAudioBuffer(buf) {
    sourceBuffer = buf;
    chopMarkers = [];
    padSlices = [];
    waveMsg.style.display = 'none';
    document.getElementById('chopBtn').disabled = false;
    document.getElementById('infoLabel').textContent =
      buf.duration.toFixed(1) + 's / ' + buf.sampleRate + 'Hz / ' + buf.numberOfChannels + 'ch';
    resizeCanvas();
    drawWaveform();
  }

  // ---- File drop ----
  var waveWrap = document.getElementById('waveWrap');

  waveWrap.addEventListener('dragover', function(e) {
    e.preventDefault();
    waveWrap.style.borderColor = 'var(--p-accent-blue)';
  });

  waveWrap.addEventListener('dragleave', function() {
    waveWrap.style.borderColor = '';
  });

  waveWrap.addEventListener('drop', function(e) {
    e.preventDefault();
    waveWrap.style.borderColor = '';
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return;
    var file = files[0];
    if (file.type.indexOf('audio') === -1 && file.name.indexOf('.wav') === -1 && file.name.indexOf('.mp3') === -1) {
      prvctice.ui.toast('Not an audio file', 'warning');
      return;
    }
    var reader = new FileReader();
    reader.onload = function() {
      prvctice.audio.buffer.decode(reader.result).then(function(buf) {
        loadAudioBuffer(buf);
      });
    };
    reader.readAsArrayBuffer(file);
  });

  // ---- Mic recording ----
  var recBtn = document.getElementById('recBtn');

  recBtn.addEventListener('click', function() {
    if (recording) {
      // Stop recording
      if (mediaRecorder) mediaRecorder.stop();
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      recording = true;
      recBtn.style.color = 'var(--p-accent-amber)';
      recBtn.textContent = 'STOP';
      recordChunks = [];

      var mimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        }
      }

      mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
      mediaRecorder.ondataavailable = function(ev) {
        if (ev.data && ev.data.size > 0) recordChunks.push(ev.data);
      };
      mediaRecorder.onstop = function() {
        recording = false;
        recBtn.style.color = '';
        recBtn.textContent = 'REC';
        stream.getTracks().forEach(function(t) { t.stop(); });

        var blob = new Blob(recordChunks, { type: mimeType });
        var reader = new FileReader();
        reader.onload = function() {
          prvctice.audio.buffer.decode(reader.result).then(function(buf) {
            loadAudioBuffer(buf);
          });
        };
        reader.readAsArrayBuffer(blob);
      };
      mediaRecorder.start(100);
    });
  });

  // ---- VFS file loading ----
  var filesPicker = prvctice.ui.filePicker({
    accept: 'audio/*',
    title: 'Load Audio',
    emptyMessage: 'No audio files yet',
    onSelect: function(result) {
      // Convert data URL to ArrayBuffer then decode
      var b64 = result.dataUrl.split(',')[1];
      var raw = atob(b64);
      var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      prvctice.audio.buffer.decode(arr.buffer).then(function(buf) {
        loadAudioBuffer(buf);
      }).catch(function(err) {
        prvctice.ui.toast('Failed to decode: ' + (err.message || err), 'error');
      });
    }
  });
  document.getElementById('filesBtn').addEventListener('click', function() {
    filesPicker.open();
  });

  // ---- Auto-chop ----
  document.getElementById('chopBtn').addEventListener('click', function() {
    if (!sourceBuffer) return;
    var total = gridRows * gridCols;
    chopMarkers = detectTransients(sourceBuffer, total);

    // Slice buffer at markers
    padSlices = [];
    for (var i = 0; i < chopMarkers.length; i++) {
      var startT = chopMarkers[i];
      var endT = (i + 1 < chopMarkers.length) ? chopMarkers[i + 1] : sourceBuffer.duration;
      padSlices.push(prvctice.audio.buffer.slice(sourceBuffer, startT, endT));
    }

    // Pad with nulls if fewer slices than pads
    while (padSlices.length < total) {
      padSlices.push(null);
    }

    drawWaveform();
    renderPads();
    prvctice.ui.toast(chopMarkers.length + ' slices detected', 'success');
  });

  // ---- Clear ----
  document.getElementById('clearBtn').addEventListener('click', function() {
    sourceBuffer = null;
    chopMarkers = [];
    padSlices = [];
    waveMsg.style.display = '';
    document.getElementById('chopBtn').disabled = true;
    document.getElementById('infoLabel').textContent = 'DROP AUDIO FILE';
    resizeCanvas();
    renderPads();
  });

  // ---- Grid layout ----
  document.getElementById('grid44Btn').addEventListener('click', function() {
    gridRows = 4; gridCols = 4;
    document.getElementById('grid44Btn').classList.add('active');
    document.getElementById('grid42Btn').classList.remove('active');
    initPadParams();
    padSlices = [];
    if (sourceBuffer && chopMarkers.length > 0) {
      // Re-slice
      document.getElementById('chopBtn').click();
    } else {
      renderPads();
    }
  });

  document.getElementById('grid42Btn').addEventListener('click', function() {
    gridRows = 2; gridCols = 4;
    document.getElementById('grid42Btn').classList.add('active');
    document.getElementById('grid44Btn').classList.remove('active');
    initPadParams();
    padSlices = [];
    if (sourceBuffer && chopMarkers.length > 0) {
      document.getElementById('chopBtn').click();
    } else {
      renderPads();
    }
  });

  // ---- Pad grid rendering ----
  var padGrid = document.getElementById('padGrid');

  function renderPads() {
    padGrid.innerHTML = '';
    padGrid.style.gridTemplateColumns = 'repeat(' + gridCols + ', 1fr)';
    padGrid.style.gridTemplateRows = 'repeat(' + gridRows + ', 1fr)';

    var total = gridRows * gridCols;
    var keys = total === 16 ? PAD_KEYS_16 : PAD_KEYS_8;

    for (var i = 0; i < total; i++) {
      var pad = document.createElement('div');
      pad.className = 'sp-pad';
      pad.setAttribute('data-idx', i);

      if (padSlices[i]) {
        pad.classList.add('loaded');
        // Draw mini waveform
        var miniCanvas = document.createElement('canvas');
        miniCanvas.className = 'sp-pad-mini-wave';
        miniCanvas.width = 80;
        miniCanvas.height = 16;
        drawMiniWave(miniCanvas, padSlices[i]);
        pad.appendChild(miniCanvas);
      }

      if (i === selectedPad) pad.classList.add('selected');

      var label = document.createElement('span');
      label.className = 'sp-pad-label';
      label.textContent = 'PAD ' + (i + 1);
      pad.appendChild(label);

      if (i < keys.length) {
        var hint = document.createElement('span');
        hint.className = 'sp-pad-hint';
        hint.textContent = keys[i].toUpperCase();
        pad.appendChild(hint);
      }

      padGrid.appendChild(pad);
    }
  }

  function drawMiniWave(canvas, buffer) {
    var mCtx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var peaks = prvctice.audio.buffer.waveformPeaks(buffer, w);
    var cs = getComputedStyle(document.documentElement);
    mCtx.fillStyle = cs.getPropertyValue('--p-accent-blue').trim() || '#4488ff';
    var mid = h / 2;
    for (var i = 0; i < peaks.length; i++) {
      var minY = mid + peaks[i].min * mid;
      var maxY = mid + peaks[i].max * mid;
      mCtx.fillRect(i, minY, 1, Math.max(1, maxY - minY));
    }
  }

  // ---- Play pad ----
  function playPad(index) {
    if (!padSlices[index]) return;

    // Stop any currently playing instance of this pad
    stopPad(index);

    var params = padParams[index] || { pitch: 0, volume: 1.0, pan: 0 };
    var rate = Math.pow(2, params.pitch / 12);

    var source = ctx.createBufferSource();
    source.buffer = padSlices[index];
    source.playbackRate.value = rate;

    var gainNode = ctx.createGain();
    gainNode.gain.value = params.volume;

    var panNode = ctx.createStereoPanner();
    panNode.pan.value = params.pan;

    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(ctx.destination);

    source.start(0);
    activeSources[index] = { source: source, gain: gainNode, pan: panNode };

    source.onended = function() {
      delete activeSources[index];
      var padEl = padGrid.querySelector('[data-idx="' + index + '"]');
      if (padEl) padEl.classList.remove('active');
    };

    // Visual feedback
    var padEl = padGrid.querySelector('[data-idx="' + index + '"]');
    if (padEl) padEl.classList.add('active');
  }

  function stopPad(index) {
    if (activeSources[index]) {
      try { activeSources[index].source.stop(); } catch (e) {}
      delete activeSources[index];
    }
  }

  // ---- Pad click handler ----
  padGrid.addEventListener('pointerdown', function(e) {
    var pad = e.target.closest('.sp-pad');
    if (!pad) return;
    var idx = parseInt(pad.getAttribute('data-idx'), 10);

    if (e.shiftKey) {
      // Select pad for editing
      selectedPad = idx;
      renderPads();
      renderPadControls();
    } else {
      playPad(idx);
      selectedPad = idx;
      renderPadControls();
      // Highlight selected
      var allPads = padGrid.querySelectorAll('.sp-pad');
      for (var p = 0; p < allPads.length; p++) allPads[p].classList.remove('selected');
      pad.classList.add('selected');
    }
  });

  padGrid.addEventListener('pointerup', function(e) {
    var pad = e.target.closest('.sp-pad');
    if (!pad) return;
    var idx = parseInt(pad.getAttribute('data-idx'), 10);
    pad.classList.remove('active');
  });

  // ---- Keyboard ----
  function handleKeyDown(e) {
    var key = e.key.toLowerCase();
    var keys = (gridRows * gridCols === 16) ? PAD_KEYS_16 : PAD_KEYS_8;
    var idx = keys.indexOf(key);
    if (idx !== -1 && !activeKeyPads[key]) {
      e.preventDefault();
      activeKeyPads[key] = true;
      playPad(idx);
    }
  }

  function handleKeyUp(e) {
    var key = e.key.toLowerCase();
    var keys = (gridRows * gridCols === 16) ? PAD_KEYS_16 : PAD_KEYS_8;
    var idx = keys.indexOf(key);
    if (idx !== -1) {
      e.preventDefault();
      delete activeKeyPads[key];
      var padEl = padGrid.querySelector('[data-idx="' + idx + '"]');
      if (padEl) padEl.classList.remove('active');
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  var bridgeUnsubs = [];
  if (prvctice.input) {
    bridgeUnsubs.push(prvctice.input.onKeyDown(handleKeyDown));
    bridgeUnsubs.push(prvctice.input.onKeyUp(handleKeyUp));
  }

  // ---- Per-pad controls ----
  var padCtrlEl = document.getElementById('padControls');
  var padCtrlLabel = document.getElementById('padCtrlLabel');

  function renderPadControls() {
    // Clean up old knobs
    if (pitchKnob) { pitchKnob.dispose(); pitchKnob = null; }
    if (volKnob) { volKnob.dispose(); volKnob = null; }
    if (panKnob) { panKnob.dispose(); panKnob = null; }

    padCtrlEl.innerHTML = '';

    if (selectedPad < 0 || !padParams[selectedPad]) {
      var lbl = document.createElement('span');
      lbl.className = 'sp-section-label';
      lbl.style.alignSelf = 'center';
      lbl.textContent = 'SELECT A PAD';
      padCtrlEl.appendChild(lbl);
      return;
    }

    var params = padParams[selectedPad];
    var titleEl = document.createElement('span');
    titleEl.className = 'sp-section-label';
    titleEl.style.alignSelf = 'center';
    titleEl.textContent = 'PAD ' + (selectedPad + 1);
    padCtrlEl.appendChild(titleEl);

    var pitchWrap = document.createElement('div');
    padCtrlEl.appendChild(pitchWrap);
    pitchKnob = prvctice.ui.knob(pitchWrap, {
      min: -12, max: 12, value: params.pitch, step: 1,
      label: 'PITCH',
      format: function(v) { return (v > 0 ? '+' : '') + v + 'st'; },
      onChange: function(v) { padParams[selectedPad].pitch = v; }
    });

    var volWrap = document.createElement('div');
    padCtrlEl.appendChild(volWrap);
    volKnob = prvctice.ui.knob(volWrap, {
      min: 0, max: 1, value: params.volume, step: 0.01,
      label: 'VOL',
      format: function(v) { return Math.round(v * 100); },
      onChange: function(v) { padParams[selectedPad].volume = v; }
    });

    var panWrap = document.createElement('div');
    padCtrlEl.appendChild(panWrap);
    panKnob = prvctice.ui.knob(panWrap, {
      min: -1, max: 1, value: params.pan, step: 0.01,
      label: 'PAN', detent: 0,
      format: function(v) {
        if (Math.abs(v) < 0.05) return 'C';
        return v < 0 ? 'L' + Math.round(Math.abs(v) * 100) : 'R' + Math.round(v * 100);
      },
      onChange: function(v) { padParams[selectedPad].pan = v; }
    });
  }

  // ---- WAV export ----
  document.getElementById('exportBtn').addEventListener('click', function() {
    var hasSlices = false;
    for (var i = 0; i < padSlices.length; i++) {
      if (padSlices[i]) { hasSlices = true; break; }
    }
    if (!hasSlices) {
      prvctice.ui.toast('No slices loaded', 'warning');
      return;
    }

    // Export the currently selected pad, or the full source
    if (selectedPad >= 0 && padSlices[selectedPad]) {
      var params = padParams[selectedPad];
      var slice = padSlices[selectedPad];

      if (params.pitch !== 0) {
        prvctice.audio.buffer.pitchShift(slice, params.pitch).then(function(shifted) {
          var normalized = prvctice.audio.buffer.normalize(shifted);
          var wav = prvctice.audio.encodeWAV(normalized);
          return prvctice.audio.bufferToBase64(wav);
        }).then(function(b64) {
          prvctice.fs.saveBlob(b64, 'audio/wav', 'pad-' + (selectedPad + 1) + '.wav').then(function() {
            prvctice.ui.toast('Saved to Files');
          });
        });
      } else {
        var wav = prvctice.audio.encodeWAV(slice);
        prvctice.audio.bufferToBase64(wav).then(function(b64) {
          prvctice.fs.saveBlob(b64, 'audio/wav', 'pad-' + (selectedPad + 1) + '.wav').then(function() {
            prvctice.ui.toast('Saved to Files');
          });
        });
      }
    } else if (sourceBuffer) {
      var wav2 = prvctice.audio.encodeWAV(sourceBuffer);
      prvctice.audio.bufferToBase64(wav2).then(function(b64) {
        prvctice.fs.saveBlob(b64, 'audio/wav', 'sampler-source.wav').then(function() {
          prvctice.ui.toast('Saved to Files');
        });
      });
    }
  });

  // ---- Connection button ----
  var spConnBtn = document.getElementById('connBtn');

  function setConnectedUI() {
    spConnBtn.textContent = 'LIVE';
    spConnBtn.className = 'sp-conn-btn live';
  }
  function setDisconnectedUI() {
    spConnBtn.textContent = 'CONNECT';
    spConnBtn.className = 'sp-conn-btn';
  }

  function doConnect() {
    prvctice.mixer.connect({ name: 'Sampler' }).then(function(result) {
      mixerConnected = true;
      mixerChannelId = result.channelId;
      setConnectedUI();
    }).catch(function() {
      setDisconnectedUI();
    });
  }

  function doDisconnect() {
    prvctice.mixer.disconnect();
    mixerConnected = false;
    mixerChannelId = null;
    setDisconnectedUI();
  }

  spConnBtn.addEventListener('click', function() {
    if (mixerConnected) { doDisconnect(); } else { doConnect(); }
  });

  prvctice.mixer.onDisconnected(function() {
    mixerConnected = false;
    mixerChannelId = null;
    setDisconnectedUI();
  });

  /* Auto-connect on load */
  doConnect();

  // ---- Resize observer ----
  var ro = new ResizeObserver(function() { resizeCanvas(); });
  ro.observe(waveCanvas.parentElement);

  // ---- Init ----
  initPadParams();
  renderPads();
  renderPadControls();
  resizeCanvas();

  // ---- Cleanup ----
  prvctice.onDispose(function() {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    for (var u = 0; u < bridgeUnsubs.length; u++) {
      if (typeof bridgeUnsubs[u] === 'function') bridgeUnsubs[u]();
    }
    if (pitchKnob) pitchKnob.dispose();
    if (volKnob) volKnob.dispose();
    if (panKnob) panKnob.dispose();
    ro.disconnect();
    // Stop any playing pads
    var keys = Object.keys(activeSources);
    for (var k = 0; k < keys.length; k++) {
      try { activeSources[keys[k]].source.stop(); } catch (e) {}
    }
    if (recording && mediaRecorder) {
      try { mediaRecorder.stop(); } catch(e) {}
    }
    if (mixerConnected) prvctice.mixer.disconnect();
  });
});
<` +
  `/script>
</body>
</html>`;
