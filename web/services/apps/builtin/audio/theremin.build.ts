/**
 * Theremin HTML Build
 *
 * Full-window playing surface with continuous pitch (X) and volume (Y),
 * scale lock modes, note markers, waveform selection, portamento,
 * reverb (via mixer send), canvas visualization, all routed through
 * the host audio engine.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const THEREMIN_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* -- Controls Strip -- */
.th-controls {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
  padding: 4px 8px; flex-shrink: 0;
}
.th-btn-group { display: flex; gap: 2px; }
.th-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 6px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 9px; font-family: var(--p-font-mono);
  font-weight: 600; letter-spacing: 0.05em;
  transition: all 80ms ease;
}
.th-btn:hover { background: var(--p-border); color: var(--p-text); }
.th-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}
.th-knobs {
  display: flex; gap: 4px; align-items: flex-start;
}
.th-section-label {
  font-size: 8px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  text-transform: uppercase; letter-spacing: 0.1em;
}
/* -- Connection button -- */
.th-conn-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 8px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); letter-spacing: 0.5px;
  transition: all 100ms ease;
}
.th-conn-btn:hover { background: var(--p-border); }
.th-conn-btn.live { color: var(--p-accent-green); border-color: rgba(46, 125, 66, 0.3); }
</style>
</head>
<body class="p-stack full" style="padding:0;overflow:hidden">

<!-- Terminal header -->
<div class="p-terminal-header" style="padding:6px 12px;flex-shrink:0">
  <span class="p-label-tech">THEREMIN</span>
  <span class="p-label-tech" id="noteDisplay" style="color:var(--p-accent-blue)">--</span>
  <button class="th-conn-btn" id="connBtn">...</button>
</div>

<!-- Controls strip -->
<div class="th-controls">
  <div>
    <span class="th-section-label">WAVE</span>
    <div class="th-btn-group" id="waveGroup"></div>
  </div>
  <div>
    <span class="th-section-label">SCALE</span>
    <div class="th-btn-group" id="scaleGroup"></div>
  </div>
  <div>
    <span class="th-section-label">RANGE</span>
    <div class="th-btn-group" id="rangeGroup"></div>
  </div>
</div>

<!-- Knobs row -->
<div class="th-controls" style="padding-top:0">
  <div class="th-knobs" id="knobsRow"></div>
</div>

<!-- Playing surface canvas -->
<canvas id="surface" style="flex:1;width:100%;cursor:crosshair"></canvas>

<script>
prvctice.onReady(function() {
  var NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  var SCALES = {
    OFF: null,
    CHROM: [0,1,2,3,4,5,6,7,8,9,10,11],
    MAJ: [0,2,4,5,7,9,11],
    MIN: [0,2,3,5,7,8,10],
    PENT: [0,2,4,7,9],
    BLUES: [0,3,5,6,7,10]
  };
  var WAVE_TYPES = ['sine', 'sawtooth', 'square', 'triangle'];
  var WAVE_LABELS = ['SINE', 'SAW', 'SQR', 'TRI'];
  var OCTAVE_RANGES = [1, 2, 4];

  var canvas = document.getElementById('surface');
  var canvasCtx = canvas.getContext('2d');

  var currentWave = 'sine';
  var currentScale = null;
  var octaveRange = 2;
  var minFreq = 130.81; // C3
  var maxFreq = 523.25; // C5
  var portamentoTime = 0.05;
  var reverbSend = 0;

  var pointerDown = false;
  var pointerX = 0;
  var pointerY = 0;
  var currentFreq = 0;
  var currentGain = 0;
  var rafId = null;

  /* -- Mixer state -- */
  var channelId = null;
  var activeVoiceId = null;

  /* -- Knob instances -- */
  var portKnob = null;
  var revKnob = null;

  /* -- Frequency range -- */
  function updateFreqRange() {
    minFreq = 130.81;
    maxFreq = minFreq * Math.pow(2, octaveRange);
  }

  /* -- Scale lock -- */
  function snapToScale(freq, scale) {
    if (!scale) return freq;
    var semitone = 12 * Math.log2(freq / 130.81);
    var octave = Math.floor(semitone / 12);
    var note = semitone - octave * 12;
    var closest = scale[0];
    var minDist = Math.abs(note - closest);
    for (var i = 1; i < scale.length; i++) {
      var dist = Math.abs(note - scale[i]);
      if (dist < minDist) { minDist = dist; closest = scale[i]; }
    }
    var distToNext = Math.abs(note - (scale[0] + 12));
    if (distToNext < minDist) { closest = scale[0] + 12; }
    return 130.81 * Math.pow(2, (octave * 12 + closest) / 12);
  }

  function freqToNoteName(freq) {
    var semitone = Math.round(12 * Math.log2(freq / 16.35));
    var octave = Math.floor(semitone / 12);
    var note = semitone % 12;
    if (note < 0) note += 12;
    return NOTE_NAMES[note] + octave;
  }

  /* -- Pointer -> frequency/volume -- */
  function getFreqFromX(x) {
    var pct = x / canvas.width;
    pct = Math.max(0, Math.min(1, pct));
    return minFreq * Math.pow(maxFreq / minFreq, pct);
  }

  function getVolFromY(y) {
    return Math.max(0, Math.min(1, 1 - y / canvas.height));
  }

  function updatePitch(x, y) {
    var rawFreq = getFreqFromX(x);
    var freq = snapToScale(rawFreq, currentScale);
    currentFreq = freq;
    var vol = getVolFromY(y);
    currentGain = vol;
    pointerX = x;
    pointerY = y;

    if (activeVoiceId && channelId) {
      prvctice.mixer.setVoiceFrequency(activeVoiceId, freq, portamentoTime);
      prvctice.mixer.setVoiceGain(activeVoiceId, vol, 0.02);
    }

    document.getElementById('noteDisplay').textContent = freqToNoteName(freq) + ' ' + Math.round(freq) + 'Hz';
  }

  canvas.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    pointerDown = true;
    var rawFreq = getFreqFromX(e.offsetX);
    var freq = snapToScale(rawFreq, currentScale);
    var vol = getVolFromY(e.offsetY);
    currentFreq = freq;
    currentGain = vol;
    pointerX = e.offsetX;
    pointerY = e.offsetY;

    if (channelId) {
      prvctice.mixer.noteOn(freq, {
        waveform: currentWave,
        gain: vol,
        attack: 0.01,
        release: 0.05
      }).then(function(result) {
        if (result && result.voiceId) activeVoiceId = result.voiceId;
      });
    }

    document.getElementById('noteDisplay').textContent = freqToNoteName(freq) + ' ' + Math.round(freq) + 'Hz';
  });

  canvas.addEventListener('pointermove', function(e) {
    if (!pointerDown) return;
    e.preventDefault();
    updatePitch(e.offsetX, e.offsetY);
  });

  function releaseNote() {
    pointerDown = false;
    if (activeVoiceId) {
      prvctice.mixer.noteOff(activeVoiceId);
      activeVoiceId = null;
    }
    document.getElementById('noteDisplay').textContent = '--';
  }

  canvas.addEventListener('pointerup', function(e) {
    e.preventDefault();
    releaseNote();
  });

  canvas.addEventListener('pointerleave', function() {
    if (!pointerDown) return;
    releaseNote();
  });

  /* -- Canvas visualization -- */
  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    canvasCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }

  function drawFrame() {
    var w = canvas.width / (window.devicePixelRatio || 1);
    var h = canvas.height / (window.devicePixelRatio || 1);
    canvasCtx.clearRect(0, 0, w, h);

    /* Draw note markers if scale lock active */
    if (currentScale) {
      canvasCtx.strokeStyle = 'rgba(68, 136, 255, 0.15)';
      canvasCtx.lineWidth = 1;
      canvasCtx.font = '9px monospace';
      canvasCtx.fillStyle = 'rgba(68, 136, 255, 0.4)';

      var startSemitone = Math.floor(12 * Math.log2(minFreq / 130.81));
      var endSemitone = Math.ceil(12 * Math.log2(maxFreq / 130.81));
      for (var st = startSemitone; st <= endSemitone; st++) {
        var octave = Math.floor(st / 12);
        var noteInOctave = ((st % 12) + 12) % 12;
        var inScale = false;
        for (var si = 0; si < currentScale.length; si++) {
          if (currentScale[si] === noteInOctave) { inScale = true; break; }
        }
        if (!inScale) continue;
        var noteFreq = 130.81 * Math.pow(2, st / 12);
        if (noteFreq < minFreq || noteFreq > maxFreq) continue;
        var x = Math.log(noteFreq / minFreq) / Math.log(maxFreq / minFreq) * w;
        canvasCtx.beginPath();
        canvasCtx.moveTo(x, 0);
        canvasCtx.lineTo(x, h);
        canvasCtx.stroke();
        var noteName = NOTE_NAMES[noteInOctave] + (octave + 3);
        canvasCtx.fillText(noteName, x + 2, 12);
      }
    }

    /* Draw crosshair when playing */
    if (pointerDown) {
      canvasCtx.strokeStyle = 'rgba(68, 136, 255, 0.3)';
      canvasCtx.lineWidth = 1;
      canvasCtx.beginPath();
      canvasCtx.moveTo(pointerX, 0);
      canvasCtx.lineTo(pointerX, h);
      canvasCtx.stroke();
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, pointerY);
      canvasCtx.lineTo(w, pointerY);
      canvasCtx.stroke();

      var vol = getVolFromY(pointerY);
      var radius = 8 + vol * 20;
      canvasCtx.fillStyle = 'rgba(68, 136, 255, 0.3)';
      canvasCtx.beginPath();
      canvasCtx.arc(pointerX, pointerY, 6, 0, Math.PI * 2);
      canvasCtx.fill();
      canvasCtx.strokeStyle = 'rgba(68, 136, 255, 0.5)';
      canvasCtx.lineWidth = 2;
      canvasCtx.beginPath();
      canvasCtx.arc(pointerX, pointerY, radius, 0, Math.PI * 2);
      canvasCtx.stroke();
    }

    rafId = requestAnimationFrame(drawFrame);
  }

  /* -- Button groups -- */
  function buildBtnGroup(container, labels, values, activeValue, onChange) {
    container.innerHTML = '';
    for (var i = 0; i < labels.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'th-btn' + (values[i] === activeValue ? ' active' : '');
      btn.textContent = labels[i];
      btn.setAttribute('data-val', i);
      container.appendChild(btn);
    }
    container.addEventListener('click', function(e) {
      var b = e.target.closest('.th-btn');
      if (!b) return;
      var idx = parseInt(b.getAttribute('data-val'), 10);
      onChange(values[idx], idx);
      var btns = container.querySelectorAll('.th-btn');
      for (var bi = 0; bi < btns.length; bi++) {
        btns[bi].classList.toggle('active', bi === idx);
      }
    });
  }

  buildBtnGroup(
    document.getElementById('waveGroup'),
    WAVE_LABELS, WAVE_TYPES, currentWave,
    function(val) { currentWave = val; }
  );

  var scaleNames = Object.keys(SCALES);
  buildBtnGroup(
    document.getElementById('scaleGroup'),
    scaleNames, scaleNames, 'OFF',
    function(val) { currentScale = SCALES[val]; }
  );

  buildBtnGroup(
    document.getElementById('rangeGroup'),
    ['1 OCT', '2 OCT', '4 OCT'], OCTAVE_RANGES, octaveRange,
    function(val) {
      octaveRange = val;
      updateFreqRange();
    }
  );

  /* -- Knobs -- */
  var knobsRow = document.getElementById('knobsRow');

  var portWrap = document.createElement('div');
  knobsRow.appendChild(portWrap);
  portKnob = prvctice.ui.knob(portWrap, {
    min: 0.01, max: 0.3, value: 0.05, step: 0.01,
    label: 'PORT',
    format: function(v) { return (v * 1000).toFixed(0) + 'ms'; },
    onChange: function(v) { portamentoTime = v; }
  });

  var revWrap = document.createElement('div');
  knobsRow.appendChild(revWrap);
  revKnob = prvctice.ui.knob(revWrap, {
    min: 0, max: 1, value: 0, step: 0.01,
    label: 'REVERB',
    format: function(v) { return Math.round(v * 100); },
    onChange: function(v) {
      reverbSend = v;
      if (channelId) prvctice.mixer.setReverbSend(channelId, v);
    }
  });

  /* -- Connection button -- */
  var connBtn = document.getElementById('connBtn');
  var connected = false;

  function setConnectedUI() {
    connBtn.textContent = 'LIVE';
    connBtn.className = 'th-conn-btn live';
  }
  function setDisconnectedUI() {
    connBtn.textContent = 'CONNECT';
    connBtn.className = 'th-conn-btn';
  }

  function doConnect() {
    prvctice.mixer.connect({ name: 'Theremin' }).then(function(result) {
      connected = true;
      channelId = result.channelId;
      setConnectedUI();
    }).catch(function() {
      setDisconnectedUI();
    });
  }

  function doDisconnect() {
    if (activeVoiceId) {
      prvctice.mixer.noteOff(activeVoiceId);
      activeVoiceId = null;
    }
    prvctice.mixer.disconnect();
    connected = false;
    channelId = null;
    setDisconnectedUI();
  }

  connBtn.addEventListener('click', function() {
    if (connected) { doDisconnect(); } else { doConnect(); }
  });

  prvctice.mixer.onDisconnected(function() {
    connected = false;
    channelId = null;
    activeVoiceId = null;
    setDisconnectedUI();
  });

  /* Auto-connect on load */
  doConnect();

  /* -- Init -- */
  updateFreqRange();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  rafId = requestAnimationFrame(drawFrame);

  /* -- Cleanup -- */
  prvctice.onDispose(function() {
    if (rafId) cancelAnimationFrame(rafId);
    if (activeVoiceId) {
      prvctice.mixer.noteOff(activeVoiceId);
      activeVoiceId = null;
    }
    window.removeEventListener('resize', resizeCanvas);
    if (portKnob && portKnob.dispose) portKnob.dispose();
    if (revKnob && revKnob.dispose) revKnob.dispose();
    prvctice.mixer.disconnect();
  });
});
<` +
  `/script>
</body>
</html>`;
