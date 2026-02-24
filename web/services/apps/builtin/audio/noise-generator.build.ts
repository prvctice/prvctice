/**
 * Noise Generator HTML Build
 *
 * 8 ambient sound layers with individual vertical faders,
 * binaural beats mode, presets with persistence, auto-stop timer,
 * and master volume control.
 * Loaded lazily by the noise-generator config via dynamic import.
 */

export const NOISE_GEN_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Fader channels ── */
.ng-channels {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  gap: 4px;
  flex: 1;
  min-height: 0;
  padding: 8px 0;
}
.ng-channel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ng-channel-label {
  font-size: 8px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); text-transform: uppercase; letter-spacing: 0.05em;
  text-align: center; line-height: 1.1;
}
.ng-fader {
  -webkit-appearance: none;
  appearance: none;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 28px;
  height: 120px;
  background: transparent;
  cursor: pointer;
}
.ng-fader::-webkit-slider-track {
  width: 4px;
  background: var(--p-surface-sunken);
  border-radius: 2px;
}
.ng-fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 10px;
  background: var(--p-text-secondary);
  border-radius: 2px;
  border: 1px solid var(--p-border);
  cursor: grab;
}
.ng-fader::-moz-range-track {
  width: 4px;
  background: var(--p-surface-sunken);
  border-radius: 2px;
}
.ng-fader::-moz-range-thumb {
  width: 20px;
  height: 10px;
  background: var(--p-text-secondary);
  border-radius: 2px;
  border: 1px solid var(--p-border);
  cursor: grab;
}
.ng-toggle {
  all: unset; cursor: pointer;
  width: 16px; height: 16px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; color: var(--p-text-muted);
  transition: all 80ms ease;
}
.ng-toggle.on {
  background: rgba(68, 136, 255, 0.15);
  border-color: var(--p-accent-blue);
  color: var(--p-accent-blue);
}

/* ── Presets ── */
.ng-presets {
  display: flex; gap: 3px; flex-wrap: wrap;
}
.ng-preset-btn {
  all: unset; cursor: pointer;
  padding: 2px 6px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 9px; font-family: var(--p-font-mono);
  font-weight: 600; letter-spacing: 0.03em;
  transition: all 80ms ease;
}
.ng-preset-btn:hover { background: var(--p-border); color: var(--p-text); }
.ng-preset-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}
.ng-preset-btn.user-slot { border-style: dashed; }
.ng-preset-btn.user-slot.saved { border-style: solid; }

/* ── Binaural ── */
.ng-binaural-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.ng-binaural-label {
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 700;
  letter-spacing: 0.1em;
}

/* ── Timer ── */
.ng-timer-row {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
}
.ng-timer-btn {
  all: unset; cursor: pointer;
  padding: 2px 5px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 9px; font-family: var(--p-font-mono);
  font-weight: 600; transition: all 80ms ease;
}
.ng-timer-btn:hover { background: var(--p-border); color: var(--p-text); }
.ng-timer-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}
.ng-countdown {
  font-size: 11px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text); font-variant-numeric: tabular-nums;
  min-width: 48px;
}

/* ── Section label ── */
.ng-section-label {
  font-size: 9px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}

/* ── Master row ── */
.ng-master-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
</style>
</head>
<body class="p-stack pad-2 full gap-1">

<div class="p-terminal-header">
  <span class="p-label-tech">NOISE GENERATOR</span>
  <span id="timerDisplay" class="p-label-tech" style="color:var(--p-text-muted)">--:--</span>
</div>

<!-- Presets -->
<div>
  <span class="ng-section-label">PRESETS</span>
  <div class="ng-presets" id="presetRow"></div>
</div>

<!-- Fader Channels -->
<div class="ng-channels" id="channelRow"></div>

<!-- Binaural -->
<div>
  <span class="ng-section-label">BINAURAL BEATS</span>
  <div class="ng-binaural-row" id="binauralRow"></div>
</div>

<!-- Master + Timer -->
<div class="ng-master-row">
  <div id="masterKnobWrap"></div>
  <button class="p-btn p-btn-ghost p-btn-sm" id="playBtn">PLAY</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="stopBtn">STOP</button>
  <div style="flex:1"></div>
  <span class="ng-section-label">TIMER</span>
  <div class="ng-timer-row" id="timerRow"></div>
</div>

<script>
prvctice.onReady(function() {
  var LAYERS = [
    { name: 'WHITE', type: 'noise' },
    { name: 'PINK', type: 'noise' },
    { name: 'BROWN', type: 'noise' },
    { name: 'RAIN', type: 'filtered' },
    { name: 'OCEAN', type: 'filtered' },
    { name: 'WIND', type: 'filtered' },
    { name: 'DRONE\\nLOW', type: 'osc' },
    { name: 'DRONE\\nHIGH', type: 'osc' }
  ];
  var LAYER_COUNT = 8;
  var TIMER_OPTIONS = [
    { label: 'OFF', minutes: 0 },
    { label: '15m', minutes: 15 },
    { label: '30m', minutes: 30 },
    { label: '1h', minutes: 60 },
    { label: '2h', minutes: 120 }
  ];

  var ctx = prvctice.audio.createContext();
  var masterGainNode = ctx.createGain();
  masterGainNode.gain.value = 0.7;
  masterGainNode.connect(ctx.destination);

  var layerGains = [];
  var layerSources = []; // arrays of sources per layer
  var layerVolumes = [0, 0, 0, 0, 0, 0, 0, 0];
  var layerEnabled = [false, false, false, false, false, false, false, false];
  var isPlaying = false;
  var masterVolume = 0.7;
  var masterKnob = null;

  // Binaural
  var binauralEnabled = false;
  var binauralBaseFreq = 200;
  var binauralBeatFreq = 10;
  var binauralOscL = null;
  var binauralOscR = null;
  var binauralGainL = null;
  var binauralGainR = null;
  var binauralPanL = null;
  var binauralPanR = null;
  var baseFreqKnob = null;
  var beatFreqKnob = null;

  // Timer
  var timerMinutes = 0;
  var timerEndTime = 0;
  var timerInterval = null;

  // LFO nodes for filtered layers
  var lfoNodes = [];

  // ── Noise buffer generators ──
  function createNoiseBuffer(duration, generator) {
    var sampleRate = ctx.sampleRate;
    var length = Math.floor(sampleRate * duration);
    var buffer = ctx.createBuffer(1, length, sampleRate);
    var data = buffer.getChannelData(0);
    generator(data, length);
    return buffer;
  }

  function whiteNoise(data, length) {
    for (var i = 0; i < length; i++) { data[i] = Math.random() * 2 - 1; }
  }

  function pinkNoise(data, length) {
    // Voss-McCartney algorithm
    var octaves = 8;
    var values = [];
    for (var oi = 0; oi < octaves; oi++) values.push(Math.random() * 2 - 1);
    for (var i = 0; i < length; i++) {
      // Update one octave per sample based on bit pattern
      for (var o = 0; o < octaves; o++) {
        if ((i & (1 << o)) === 0) {
          values[o] = Math.random() * 2 - 1;
        }
      }
      var sum = 0;
      for (var s = 0; s < octaves; s++) sum += values[s];
      data[i] = sum / octaves;
    }
  }

  function brownNoise(data, length) {
    var prev = 0;
    for (var i = 0; i < length; i++) {
      prev += (Math.random() * 2 - 1) * 0.02;
      if (prev > 1) prev = 1;
      if (prev < -1) prev = -1;
      data[i] = prev;
    }
  }

  // ── Create layer sources ──
  function createLayerSources(layerIdx) {
    var sources = [];
    var gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(masterGainNode);
    layerGains[layerIdx] = gain;

    switch (layerIdx) {
      case 0: // White
        var buf = createNoiseBuffer(2, whiteNoise);
        var src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(gain);
        sources.push(src);
        break;
      case 1: // Pink
        var buf1 = createNoiseBuffer(2, pinkNoise);
        var src1 = ctx.createBufferSource();
        src1.buffer = buf1; src1.loop = true;
        src1.connect(gain);
        sources.push(src1);
        break;
      case 2: // Brown
        var buf2 = createNoiseBuffer(2, brownNoise);
        var src2 = ctx.createBufferSource();
        src2.buffer = buf2; src2.loop = true;
        src2.connect(gain);
        sources.push(src2);
        break;
      case 3: // Rain - pink noise through bandpass + amplitude modulation
        var rainBuf = createNoiseBuffer(2, pinkNoise);
        var rainSrc = ctx.createBufferSource();
        rainSrc.buffer = rainBuf; rainSrc.loop = true;
        var rainBp = ctx.createBiquadFilter();
        rainBp.type = 'bandpass'; rainBp.frequency.value = 2500; rainBp.Q.value = 0.5;
        var rainModGain = ctx.createGain();
        rainModGain.gain.value = 0.7;
        var rainLfo = ctx.createOscillator();
        rainLfo.type = 'sine'; rainLfo.frequency.value = 0.15;
        var rainLfoGain = ctx.createGain();
        rainLfoGain.gain.value = 0.3;
        rainLfo.connect(rainLfoGain);
        rainLfoGain.connect(rainModGain.gain);
        rainSrc.connect(rainBp);
        rainBp.connect(rainModGain);
        rainModGain.connect(gain);
        rainLfo.start();
        sources.push(rainSrc);
        lfoNodes.push(rainLfo);
        break;
      case 4: // Ocean - brown noise with cyclic volume + foam spray
        var oceanBuf = createNoiseBuffer(2, brownNoise);
        var oceanSrc = ctx.createBufferSource();
        oceanSrc.buffer = oceanBuf; oceanSrc.loop = true;
        var oceanModGain = ctx.createGain();
        oceanModGain.gain.value = 0.5;
        var oceanLfo = ctx.createOscillator();
        oceanLfo.type = 'sine'; oceanLfo.frequency.value = 0.08;
        var oceanLfoGain = ctx.createGain();
        oceanLfoGain.gain.value = 0.4;
        oceanLfo.connect(oceanLfoGain);
        oceanLfoGain.connect(oceanModGain.gain);
        oceanSrc.connect(oceanModGain);
        oceanModGain.connect(gain);
        oceanLfo.start();
        // Foam spray
        var foamBuf = createNoiseBuffer(2, pinkNoise);
        var foamSrc = ctx.createBufferSource();
        foamSrc.buffer = foamBuf; foamSrc.loop = true;
        var foamHp = ctx.createBiquadFilter();
        foamHp.type = 'highpass'; foamHp.frequency.value = 3000;
        var foamGain = ctx.createGain();
        foamGain.gain.value = 0.15;
        foamSrc.connect(foamHp);
        foamHp.connect(foamGain);
        foamGain.connect(gain);
        sources.push(oceanSrc, foamSrc);
        lfoNodes.push(oceanLfo);
        break;
      case 5: // Wind - white noise with slow bandpass sweep
        var windBuf = createNoiseBuffer(2, whiteNoise);
        var windSrc = ctx.createBufferSource();
        windSrc.buffer = windBuf; windSrc.loop = true;
        var windBp = ctx.createBiquadFilter();
        windBp.type = 'bandpass'; windBp.frequency.value = 700; windBp.Q.value = 0.8;
        var windLfo = ctx.createOscillator();
        windLfo.type = 'sine'; windLfo.frequency.value = 0.05;
        var windLfoGain = ctx.createGain();
        windLfoGain.gain.value = 500;
        windLfo.connect(windLfoGain);
        windLfoGain.connect(windBp.frequency);
        windSrc.connect(windBp);
        windBp.connect(gain);
        windLfo.start();
        sources.push(windSrc);
        lfoNodes.push(windLfo);
        break;
      case 6: // Drone Low - detuned triangle oscillators at 55Hz
        var dlo1 = ctx.createOscillator();
        var dlo2 = ctx.createOscillator();
        var dloMix = ctx.createGain();
        dloMix.gain.value = 0.5;
        dlo1.type = 'triangle'; dlo1.frequency.value = 55;
        dlo2.type = 'triangle'; dlo2.frequency.value = 55.3;
        dlo1.connect(dloMix);
        dlo2.connect(dloMix);
        dloMix.connect(gain);
        dlo1.start(); dlo2.start();
        sources.push(dlo1, dlo2);
        break;
      case 7: // Drone High - detuned sine oscillators at 220Hz
        var dhi1 = ctx.createOscillator();
        var dhi2 = ctx.createOscillator();
        var dhiMix = ctx.createGain();
        dhiMix.gain.value = 0.3;
        dhi1.type = 'sine'; dhi1.frequency.value = 220;
        dhi2.type = 'sine'; dhi2.frequency.value = 220.5;
        dhi1.connect(dhiMix);
        dhi2.connect(dhiMix);
        dhiMix.connect(gain);
        dhi1.start(); dhi2.start();
        sources.push(dhi1, dhi2);
        break;
    }

    return sources;
  }

  // ── Start / Stop all layers ──
  function startAll() {
    if (isPlaying) return;
    isPlaying = true;
    layerSources = [];
    lfoNodes = [];
    for (var i = 0; i < LAYER_COUNT; i++) {
      var sources = createLayerSources(i);
      layerSources.push(sources);
      // Start buffer sources
      for (var si = 0; si < sources.length; si++) {
        if (sources[si].buffer) { // BufferSourceNode
          try { sources[si].start(); } catch(e) {}
        }
      }
      // Apply volume
      if (layerEnabled[i]) {
        layerGains[i].gain.setTargetAtTime(layerVolumes[i] / 100, ctx.currentTime, 0.02);
      }
    }
    document.getElementById('playBtn').style.color = 'var(--p-accent-blue)';

    // Start binaural if enabled
    if (binauralEnabled) startBinaural();

    // Start timer if set
    if (timerMinutes > 0) {
      timerEndTime = Date.now() + timerMinutes * 60 * 1000;
      timerInterval = setInterval(updateTimer, 1000);
    }
  }

  function stopAll() {
    if (!isPlaying) return;
    isPlaying = false;
    for (var i = 0; i < layerSources.length; i++) {
      for (var si = 0; si < layerSources[i].length; si++) {
        try { layerSources[i][si].stop(); } catch(e) {}
      }
    }
    for (var li = 0; li < lfoNodes.length; li++) {
      try { lfoNodes[li].stop(); } catch(e) {}
    }
    layerSources = [];
    lfoNodes = [];
    document.getElementById('playBtn').style.color = '';

    stopBinaural();

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    document.getElementById('timerDisplay').textContent = '--:--';
  }

  // ── Binaural beats ──
  function startBinaural() {
    if (binauralOscL) return;
    binauralGainL = ctx.createGain(); binauralGainL.gain.value = 0.15;
    binauralGainR = ctx.createGain(); binauralGainR.gain.value = 0.15;
    binauralPanL = ctx.createStereoPanner(); binauralPanL.pan.value = -1;
    binauralPanR = ctx.createStereoPanner(); binauralPanR.pan.value = 1;
    binauralOscL = ctx.createOscillator();
    binauralOscR = ctx.createOscillator();
    binauralOscL.type = 'sine'; binauralOscL.frequency.value = binauralBaseFreq;
    binauralOscR.type = 'sine'; binauralOscR.frequency.value = binauralBaseFreq + binauralBeatFreq;
    binauralOscL.connect(binauralGainL); binauralGainL.connect(binauralPanL); binauralPanL.connect(masterGainNode);
    binauralOscR.connect(binauralGainR); binauralGainR.connect(binauralPanR); binauralPanR.connect(masterGainNode);
    binauralOscL.start(); binauralOscR.start();
  }

  function stopBinaural() {
    if (binauralOscL) { try { binauralOscL.stop(); } catch(e) {} binauralOscL = null; }
    if (binauralOscR) { try { binauralOscR.stop(); } catch(e) {} binauralOscR = null; }
    binauralGainL = null; binauralGainR = null;
    binauralPanL = null; binauralPanR = null;
  }

  // ── Timer ──
  function updateTimer() {
    var remaining = timerEndTime - Date.now();
    if (remaining <= 0) {
      stopAll();
      document.getElementById('timerDisplay').textContent = '00:00';
      return;
    }
    // Fade out in last 30 seconds
    if (remaining <= 30000) {
      var fadeFactor = remaining / 30000;
      masterGainNode.gain.setTargetAtTime(masterVolume * fadeFactor, ctx.currentTime, 0.1);
    }
    var mins = Math.floor(remaining / 60000);
    var secs = Math.floor((remaining % 60000) / 1000);
    document.getElementById('timerDisplay').textContent =
      (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  // ── Presets ──
  var BUILTIN_PRESETS = [
    { name: 'FOREST', volumes: [0, 0, 30, 50, 0, 40, 10, 0] },
    { name: 'OCEAN', volumes: [5, 0, 0, 0, 70, 30, 0, 0] },
    { name: 'CAFE', volumes: [0, 0, 15, 60, 0, 0, 0, 10] },
    { name: 'CAMP', volumes: [0, 5, 40, 0, 0, 20, 20, 0] },
    { name: 'SPACE', volumes: [0, 5, 10, 0, 0, 0, 30, 20] }
  ];
  var userPresets = [null, null, null];
  var activePreset = -1;

  function loadPresets() {
    prvctice.storage.get('noise-presets').then(function(saved) {
      if (saved && Array.isArray(saved) && saved.length === 3) {
        userPresets = saved;
        renderPresets();
      }
    });
  }

  function saveUserPresets() {
    prvctice.storage.set('noise-presets', userPresets);
  }

  function applyPreset(volumes) {
    for (var i = 0; i < LAYER_COUNT; i++) {
      layerVolumes[i] = volumes[i];
      layerEnabled[i] = volumes[i] > 0;
      // Update fader
      var fader = document.querySelector('[data-fader="' + i + '"]');
      if (fader) fader.value = volumes[i];
      var toggle = document.querySelector('[data-toggle="' + i + '"]');
      if (toggle) toggle.classList.toggle('on', layerEnabled[i]);
      // Update audio
      if (isPlaying && layerGains[i]) {
        layerGains[i].gain.setTargetAtTime(
          layerEnabled[i] ? volumes[i] / 100 : 0,
          ctx.currentTime, 0.05
        );
      }
    }
  }

  function renderPresets() {
    var row = document.getElementById('presetRow');
    row.innerHTML = '';
    // Built-in
    for (var i = 0; i < BUILTIN_PRESETS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'ng-preset-btn' + (activePreset === i ? ' active' : '');
      btn.textContent = BUILTIN_PRESETS[i].name;
      btn.setAttribute('data-preset', i);
      row.appendChild(btn);
    }
    // User slots
    for (var u = 0; u < 3; u++) {
      var ubtn = document.createElement('button');
      var hasData = userPresets[u] !== null;
      ubtn.className = 'ng-preset-btn user-slot' + (hasData ? ' saved' : '') +
        (activePreset === (BUILTIN_PRESETS.length + u) ? ' active' : '');
      ubtn.textContent = 'USR' + (u + 1);
      ubtn.setAttribute('data-user-preset', u);
      row.appendChild(ubtn);
    }
  }

  document.getElementById('presetRow').addEventListener('click', function(e) {
    var btn = e.target.closest('.ng-preset-btn');
    if (!btn) return;

    // Check built-in
    var presetIdx = btn.getAttribute('data-preset');
    if (presetIdx !== null) {
      activePreset = parseInt(presetIdx, 10);
      applyPreset(BUILTIN_PRESETS[activePreset].volumes);
      renderPresets();
      return;
    }

    // Check user slot
    var userIdx = btn.getAttribute('data-user-preset');
    if (userIdx !== null) {
      var ui = parseInt(userIdx, 10);
      if (e.shiftKey) {
        // Save current state
        userPresets[ui] = layerVolumes.slice();
        saveUserPresets();
        renderPresets();
        prvctice.ui.toast('Saved to USR' + (ui + 1), 'success');
      } else if (userPresets[ui]) {
        activePreset = BUILTIN_PRESETS.length + ui;
        applyPreset(userPresets[ui]);
        renderPresets();
      }
    }
  });

  // ── Build fader channels ──
  var channelRow = document.getElementById('channelRow');
  for (var ci = 0; ci < LAYER_COUNT; ci++) {
    var channel = document.createElement('div');
    channel.className = 'ng-channel';

    var label = document.createElement('div');
    label.className = 'ng-channel-label';
    label.textContent = LAYERS[ci].name.replace('\\\\n', '\\n');

    var fader = document.createElement('input');
    fader.className = 'ng-fader';
    fader.type = 'range';
    fader.min = '0';
    fader.max = '100';
    fader.value = '0';
    fader.setAttribute('data-fader', ci);

    var toggle = document.createElement('button');
    toggle.className = 'ng-toggle';
    toggle.textContent = '\\u25CF';
    toggle.setAttribute('data-toggle', ci);

    channel.appendChild(label);
    channel.appendChild(fader);
    channel.appendChild(toggle);
    channelRow.appendChild(channel);
  }

  // Fader input handler
  channelRow.addEventListener('input', function(e) {
    if (!e.target.classList.contains('ng-fader')) return;
    var idx = parseInt(e.target.getAttribute('data-fader'), 10);
    layerVolumes[idx] = parseInt(e.target.value, 10);
    if (isPlaying && layerGains[idx] && layerEnabled[idx]) {
      layerGains[idx].gain.setTargetAtTime(layerVolumes[idx] / 100, ctx.currentTime, 0.02);
    }
  });

  // Toggle handler
  channelRow.addEventListener('click', function(e) {
    var toggle = e.target.closest('.ng-toggle');
    if (!toggle) return;
    var idx = parseInt(toggle.getAttribute('data-toggle'), 10);
    layerEnabled[idx] = !layerEnabled[idx];
    toggle.classList.toggle('on', layerEnabled[idx]);
    if (isPlaying && layerGains[idx]) {
      layerGains[idx].gain.setTargetAtTime(
        layerEnabled[idx] ? layerVolumes[idx] / 100 : 0,
        ctx.currentTime, 0.05
      );
    }
  });

  // ── Binaural controls ──
  var binauralRow = document.getElementById('binauralRow');

  var binToggle = document.createElement('button');
  binToggle.className = 'ng-toggle';
  binToggle.textContent = '\\u25CF';
  binauralRow.appendChild(binToggle);

  var binLabel = document.createElement('span');
  binLabel.className = 'ng-binaural-label';
  binLabel.style.color = 'var(--p-text-muted)';
  binLabel.textContent = 'OFF';
  binauralRow.appendChild(binLabel);

  binToggle.addEventListener('click', function() {
    binauralEnabled = !binauralEnabled;
    binToggle.classList.toggle('on', binauralEnabled);
    binLabel.textContent = binauralEnabled ? 'BINAURAL' : 'OFF';
    binLabel.style.color = binauralEnabled ? 'var(--p-accent-amber)' : 'var(--p-text-muted)';
    if (isPlaying) {
      if (binauralEnabled) startBinaural();
      else stopBinaural();
    }
  });

  var baseWrap = document.createElement('div');
  binauralRow.appendChild(baseWrap);
  baseFreqKnob = prvctice.ui.knob(baseWrap, {
    min: 100, max: 400, value: 200, step: 5,
    label: 'BASE',
    format: function(v) { return v + 'Hz'; },
    onChange: function(v) {
      binauralBaseFreq = v;
      if (binauralOscL) {
        binauralOscL.frequency.setTargetAtTime(v, ctx.currentTime, 0.02);
        binauralOscR.frequency.setTargetAtTime(v + binauralBeatFreq, ctx.currentTime, 0.02);
      }
    }
  });

  var beatWrap = document.createElement('div');
  binauralRow.appendChild(beatWrap);
  beatFreqKnob = prvctice.ui.knob(beatWrap, {
    min: 1, max: 40, value: 10, step: 1,
    label: 'BEAT',
    format: function(v) { return v + 'Hz'; },
    onChange: function(v) {
      binauralBeatFreq = v;
      if (binauralOscR) {
        binauralOscR.frequency.setTargetAtTime(binauralBaseFreq + v, ctx.currentTime, 0.02);
      }
    }
  });

  // ── Master knob ──
  masterKnob = prvctice.ui.knob(document.getElementById('masterKnobWrap'), {
    min: 0, max: 1, value: 0.7, step: 0.01,
    label: 'MASTER',
    format: function(v) { return Math.round(v * 100); },
    onChange: function(v) {
      masterVolume = v;
      masterGainNode.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    }
  });

  // ── Play / Stop ──
  document.getElementById('playBtn').addEventListener('click', startAll);
  document.getElementById('stopBtn').addEventListener('click', stopAll);

  // ── Timer buttons ──
  var timerRow = document.getElementById('timerRow');
  for (var ti = 0; ti < TIMER_OPTIONS.length; ti++) {
    var tbtn = document.createElement('button');
    tbtn.className = 'ng-timer-btn' + (ti === 0 ? ' active' : '');
    tbtn.textContent = TIMER_OPTIONS[ti].label;
    tbtn.setAttribute('data-timer', ti);
    timerRow.appendChild(tbtn);
  }

  timerRow.addEventListener('click', function(e) {
    var btn = e.target.closest('.ng-timer-btn');
    if (!btn) return;
    var idx = parseInt(btn.getAttribute('data-timer'), 10);
    timerMinutes = TIMER_OPTIONS[idx].minutes;
    var btns = timerRow.querySelectorAll('.ng-timer-btn');
    for (var bi = 0; bi < btns.length; bi++) {
      btns[bi].classList.toggle('active', bi === idx);
    }
    // Reset timer if playing
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (isPlaying && timerMinutes > 0) {
      timerEndTime = Date.now() + timerMinutes * 60 * 1000;
      timerInterval = setInterval(updateTimer, 1000);
    }
    if (timerMinutes === 0) {
      document.getElementById('timerDisplay').textContent = '--:--';
      // Restore master volume if it was fading
      masterGainNode.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.1);
    }
  });

  // ── Init ──
  renderPresets();
  loadPresets();

  // ── Cleanup ──
  prvctice.onDispose(function() {
    stopAll();
    if (masterKnob && masterKnob.dispose) masterKnob.dispose();
    if (baseFreqKnob && baseFreqKnob.dispose) baseFreqKnob.dispose();
    if (beatFreqKnob && beatFreqKnob.dispose) beatFreqKnob.dispose();
  });
});
<` +
  `/script>
</body>
</html>`;
