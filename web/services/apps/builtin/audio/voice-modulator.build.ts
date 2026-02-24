/**
 * Voice Modulator HTML Build
 *
 * Real-time mic processing with effects chain (pitch shift, reverb,
 * delay, distortion), character + musical presets, waveform/spectrum
 * visualization, record processed output.
 *
 * Audio processing runs on the HOST side via bridge (mode: 'voice')
 * to bypass Chrome's getUserMedia block on sandboxed iframes with
 * opaque/null origins. The app sends parameter updates via bridge
 * messages and receives visualization data back.
 */

export const VOICE_MODULATOR_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* -- Viz -- */
.vm-viz-wrap {
  position: relative; height: 100px; border: 1px dashed var(--p-border);
  border-radius: var(--p-radius-md); overflow: hidden; flex-shrink: 0;
}
.vm-viz-toggle {
  position: absolute; top: 4px; right: 4px; z-index: 2;
}
.vm-viz-btn {
  all: unset; cursor: pointer; padding: 2px 6px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); background: rgba(0,0,0,0.3);
  border-radius: var(--p-radius-sm); border: 1px solid var(--p-border);
  transition: all 80ms ease;
}
.vm-viz-btn.active { color: var(--p-accent-blue); border-color: var(--p-accent-blue); }
.vm-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
}

/* -- Presets grid -- */
.vm-presets {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
  flex-shrink: 0;
}
.vm-preset-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 6px 4px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 9px; font-family: var(--p-font-mono);
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  text-align: center; transition: all 80ms ease;
}
.vm-preset-btn:hover { background: var(--p-surface-raised); color: var(--p-text); }
.vm-preset-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}

/* -- Knobs row -- */
.vm-knobs {
  display: flex; justify-content: space-around; align-items: flex-start; gap: 4px;
  flex-shrink: 0;
}

/* -- Controls -- */
.vm-controls {
  display: flex; gap: 4px; flex-wrap: wrap; align-items: center; flex-shrink: 0;
}

/* -- Status -- */
.vm-status {
  font-size: 10px; font-family: var(--p-font-mono); color: var(--p-text-muted);
}
.vm-status-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--p-text-muted); margin-right: 4px; vertical-align: middle;
}
.vm-status-dot.live { background: var(--p-accent-green); }
.vm-status-dot.rec { background: var(--p-accent-amber); animation: vm-pulse 1s infinite; }
@keyframes vm-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body class="p-stack pad-2 full gap-1">

<div class="p-terminal-header">
  <span class="p-label-tech">VOICE MODULATOR</span>
  <span class="vm-status" id="statusLabel"><span class="vm-status-dot" id="statusDot"></span>IDLE</span>
</div>

<!-- Visualization -->
<div class="vm-viz-wrap" id="vizWrap">
  <div class="vm-viz-toggle">
    <button class="vm-viz-btn active" id="vizWaveBtn">WAVE</button>
    <button class="vm-viz-btn" id="vizSpecBtn">SPEC</button>
  </div>
  <canvas class="vm-canvas" id="vizCanvas"></canvas>
  <div id="vizHint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--p-font-mono);color:var(--p-text-muted);text-transform:uppercase;letter-spacing:0.06em;pointer-events:none">TAP MIC ON TO START</div>
</div>

<!-- Presets -->
<div>
  <span style="font-size:9px;font-family:var(--p-font-mono);color:var(--p-text-muted);text-transform:uppercase;letter-spacing:0.08em">PRESETS</span>
  <div class="vm-presets" id="presetGrid"></div>
</div>

<!-- Effect knobs -->
<div class="vm-knobs" id="knobsRow"></div>

<!-- Controls -->
<div class="vm-controls">
  <button class="p-btn p-btn-ghost p-btn-sm" id="micBtn">MIC ON</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="exportBtn" disabled>EXPORT</button>
</div>

<!-- Usage hint -->
<div class="p-feed-meta" style="text-align:center">
  <span class="p-label-tech" style="color:var(--p-text-muted)">MIC ON &#8594; PRESET &#8594; KNOBS &#8594; MIC OFF &#8594; EXPORT</span>
</div>

<script>
prvctice.onReady(function() {

  // ---- State ----
  var micActive = false;
  var activePreset = null;
  var vizMode = 'wave';
  var lastAudioB64 = null;
  var lastMimeType = null;
  var unsub = null;

  // ---- Effect params ----
  var params = {
    pitch: 0, dist: 0, reverb: 0, delay: 0,
    delayFb: 0.3, delayMix: 0, vol: 0.8
  };

  // ---- Canvas viz ----
  var canvas = document.getElementById('vizCanvas');
  var canvasCtx = canvas.getContext('2d');

  function resizeCanvas() {
    var wrap = document.getElementById('vizWrap');
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
  }
  resizeCanvas();

  function drawWave(waveform) {
    if (!waveform || !waveform.length) return;
    var w = canvas.width, h = canvas.height;
    canvasCtx.clearRect(0, 0, w, h);
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = 'var(--p-accent-blue)';
    canvasCtx.lineWidth = 1.5;
    var sliceW = w / waveform.length;
    var x = 0;
    for (var i = 0; i < waveform.length; i++) {
      var y = (waveform[i] * 0.5 + 0.5) * h;
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
      x += sliceW;
    }
    canvasCtx.stroke();
  }

  function drawSpectrum(bars) {
    if (!bars || !bars.length) return;
    var w = canvas.width, h = canvas.height;
    canvasCtx.clearRect(0, 0, w, h);
    var barW = w / bars.length - 1;
    for (var i = 0; i < bars.length; i++) {
      var barH = bars[i] * h;
      var energy = bars[i];
      var r = Math.round(68 + (255 - 68) * energy * energy);
      var g = Math.round(136 * (1 - energy * energy));
      var b = Math.round(255 * (1 - energy * energy * 0.5));
      canvasCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      canvasCtx.fillRect(i * (barW + 1), h - barH, barW, barH);
    }
  }

  // ---- Audio data handler ----
  function handleAudioData(freqBars, waveform) {
    if (!micActive) return;
    if (vizMode === 'wave' && waveform) {
      drawWave(waveform);
    } else {
      drawSpectrum(freqBars);
    }
  }

  // ---- Viz toggle ----
  document.getElementById('vizWaveBtn').addEventListener('click', function() {
    vizMode = 'wave';
    document.getElementById('vizWaveBtn').classList.add('active');
    document.getElementById('vizSpecBtn').classList.remove('active');
  });
  document.getElementById('vizSpecBtn').addEventListener('click', function() {
    vizMode = 'spec';
    document.getElementById('vizSpecBtn').classList.add('active');
    document.getElementById('vizWaveBtn').classList.remove('active');
  });

  // ---- Presets ----
  var PRESETS = [
    { name: 'ROBOT', pitch: -5, dist: 0.6, reverb: 0.1, delay: 0.02, delayFb: 0.5, delayMix: 0.4 },
    { name: 'CHIPMUNK', pitch: 8, dist: 0, reverb: 0.05, delay: 0, delayFb: 0, delayMix: 0 },
    { name: 'DEEP', pitch: -7, dist: 0.1, reverb: 0.2, delay: 0, delayFb: 0, delayMix: 0 },
    { name: 'ECHO CAVE', pitch: 0, dist: 0, reverb: 0.6, delay: 0.3, delayFb: 0.5, delayMix: 0.5 },
    { name: 'ALIEN', pitch: 7, dist: 0.3, reverb: 0.3, delay: 0.05, delayFb: 0.6, delayMix: 0.3 },
    { name: 'RADIO', pitch: 0, dist: 0.4, reverb: 0, delay: 0, delayFb: 0, delayMix: 0 },
    { name: 'CHORUS', pitch: 0, dist: 0, reverb: 0.1, delay: 0.025, delayFb: 0.3, delayMix: 0.5 },
    { name: 'FLANGER', pitch: 0, dist: 0, reverb: 0, delay: 0.005, delayFb: 0.7, delayMix: 0.5 },
    { name: 'HALL', pitch: 0, dist: 0, reverb: 0.8, delay: 0.1, delayFb: 0.2, delayMix: 0.2 },
    { name: 'OCTAVE UP', pitch: 12, dist: 0, reverb: 0.1, delay: 0, delayFb: 0, delayMix: 0 },
    { name: 'OCTAVE DN', pitch: -12, dist: 0, reverb: 0.1, delay: 0, delayFb: 0, delayMix: 0 },
    { name: 'CLEAN', pitch: 0, dist: 0, reverb: 0, delay: 0, delayFb: 0, delayMix: 0 }
  ];

  var presetGrid = document.getElementById('presetGrid');

  function renderPresets() {
    presetGrid.innerHTML = '';
    for (var i = 0; i < PRESETS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'vm-preset-btn' + (activePreset === i ? ' active' : '');
      btn.textContent = PRESETS[i].name;
      btn.setAttribute('data-idx', i);
      presetGrid.appendChild(btn);
    }
  }

  presetGrid.addEventListener('click', function(e) {
    var btn = e.target.closest('.vm-preset-btn');
    if (!btn) return;
    applyPreset(parseInt(btn.getAttribute('data-idx'), 10));
  });

  function applyPreset(idx) {
    activePreset = idx;
    var p = PRESETS[idx];
    params.pitch = p.pitch;
    params.dist = p.dist;
    params.reverb = p.reverb;
    params.delay = p.delay;
    params.delayFb = p.delayFb;
    params.delayMix = p.delayMix;

    if (pitchKnob) pitchKnob.set(p.pitch);
    if (distKnob) distKnob.set(p.dist);
    if (reverbKnob) reverbKnob.set(p.reverb);
    if (delayKnob) delayKnob.set(p.delay);

    if (micActive) {
      prvctice.media.updateVoiceParams(params);
    }
    renderPresets();
  }

  // ---- Knobs ----
  var knobsRow = document.getElementById('knobsRow');
  var pitchKnob = null, distKnob = null, reverbKnob = null, delayKnob = null, volKnob = null;

  function buildKnobs() {
    var pw = document.createElement('div');
    knobsRow.appendChild(pw);
    pitchKnob = prvctice.ui.knob(pw, {
      min: -12, max: 12, value: 0, step: 1, label: 'PITCH',
      format: function(v) { return (v > 0 ? '+' : '') + v; },
      onChange: function(v) {
        params.pitch = v;
        if (micActive) prvctice.media.updateVoiceParams({ pitch: v });
        activePreset = null; renderPresets();
      }
    });

    var dw = document.createElement('div');
    knobsRow.appendChild(dw);
    distKnob = prvctice.ui.knob(dw, {
      min: 0, max: 1, value: 0, step: 0.01, label: 'DIST',
      format: function(v) { return Math.round(v * 100); },
      onChange: function(v) {
        params.dist = v;
        if (micActive) prvctice.media.updateVoiceParams({ dist: v });
        activePreset = null; renderPresets();
      }
    });

    var rw = document.createElement('div');
    knobsRow.appendChild(rw);
    reverbKnob = prvctice.ui.knob(rw, {
      min: 0, max: 1, value: 0, step: 0.01, label: 'REVERB',
      format: function(v) { return Math.round(v * 100); },
      onChange: function(v) {
        params.reverb = v;
        if (micActive) prvctice.media.updateVoiceParams({ reverb: v });
        activePreset = null; renderPresets();
      }
    });

    var dlw = document.createElement('div');
    knobsRow.appendChild(dlw);
    delayKnob = prvctice.ui.knob(dlw, {
      min: 0, max: 1, value: 0, step: 0.01, label: 'DELAY',
      format: function(v) { return Math.round(v * 1000) + 'ms'; },
      onChange: function(v) {
        params.delay = v;
        params.delayMix = v > 0.001 ? 0.5 : 0;
        if (micActive) prvctice.media.updateVoiceParams({ delay: v, delayMix: params.delayMix });
        activePreset = null; renderPresets();
      }
    });

    var vw = document.createElement('div');
    knobsRow.appendChild(vw);
    volKnob = prvctice.ui.knob(vw, {
      min: 0, max: 1, value: 0.8, step: 0.01, label: 'VOL',
      format: function(v) { return Math.round(v * 100); },
      onChange: function(v) {
        params.vol = v;
        if (micActive) prvctice.media.updateVoiceParams({ vol: v });
      }
    });
  }

  buildKnobs();

  // ---- Mic controls ----
  var micBtn = document.getElementById('micBtn');
  var exportBtn = document.getElementById('exportBtn');
  var statusDot = document.getElementById('statusDot');
  var statusLabel = document.getElementById('statusLabel');

  micBtn.addEventListener('click', function() {
    if (micActive) stopMic();
    else startMic();
  });

  function startMic() {
    statusLabel.innerHTML = '<span class="vm-status-dot"></span>CONNECTING...';
    micBtn.disabled = true;

    prvctice.media.startMicrophone({ mode: 'voice', voiceParams: params }).then(function() {
      micActive = true;
      micBtn.disabled = false;
      micBtn.textContent = 'MIC OFF';
      micBtn.style.color = 'var(--p-accent-green)';
      statusDot.classList.add('live');
      statusLabel.innerHTML = '<span class="vm-status-dot live"></span>LIVE';
      var hint = document.getElementById('vizHint');
      if (hint) hint.style.display = 'none';
      unsub = prvctice.media.onAudioData(handleAudioData);
    }).catch(function(err) {
      micBtn.disabled = false;
      statusLabel.innerHTML = '<span class="vm-status-dot"></span>MIC ERROR';
      prvctice.ui.toast('Microphone access denied or unavailable', 'error');
    });
  }

  function stopMic() {
    micActive = false;
    micBtn.disabled = true;
    statusLabel.innerHTML = '<span class="vm-status-dot"></span>STOPPING...';

    if (unsub) { unsub(); unsub = null; }

    prvctice.media.stopMicrophone().then(function(result) {
      micBtn.disabled = false;
      micBtn.textContent = 'MIC ON';
      micBtn.style.color = '';
      statusDot.classList.remove('live');
      statusLabel.innerHTML = '<span class="vm-status-dot"></span>IDLE';

      if (result && result.audio) {
        lastAudioB64 = result.audio;
        lastMimeType = result.mimeType || 'audio/webm';
        exportBtn.disabled = false;
      }

      // Clear canvas
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }).catch(function() {
      micBtn.disabled = false;
      micBtn.textContent = 'MIC ON';
      micBtn.style.color = '';
      statusLabel.innerHTML = '<span class="vm-status-dot"></span>IDLE';
    });
  }

  // ---- Export ----
  exportBtn.addEventListener('click', function() {
    if (!lastAudioB64) {
      prvctice.ui.toast('No recording available — use MIC ON then MIC OFF first', 'warning');
      return;
    }
    var ext = lastMimeType && lastMimeType.indexOf('ogg') !== -1 ? '.ogg' : '.webm';
    var filename = 'voice-recording' + ext;
    var mime = lastMimeType || 'audio/webm';
    prvctice.fs.saveBlob(lastAudioB64, mime, filename).then(function() {
      prvctice.ui.toast('Saved to Files');
    });
  });

  // ---- Init ----
  renderPresets();
  applyPreset(11); // Start with CLEAN

  // ---- Cleanup ----
  prvctice.onDispose(function() {
    if (micActive) {
      micActive = false;
      if (unsub) { unsub(); unsub = null; }
      prvctice.media.stopMicrophone();
    }
    if (pitchKnob) pitchKnob.dispose();
    if (distKnob) distKnob.dispose();
    if (reverbKnob) reverbKnob.dispose();
    if (delayKnob) delayKnob.dispose();
    if (volKnob) volKnob.dispose();
  });
});
<` +
  `/script>
</body>
</html>`;
