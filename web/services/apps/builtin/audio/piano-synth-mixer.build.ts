/**
 * Piano Synth (Mixer) HTML Build
 *
 * Feature-rich piano keyboard routed through the host audio engine.
 * Uses SDK components: spectrum visualizer, knobs, piano keyboard.
 * Layout and aesthetic match the Synth Studio reference.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const PIANO_SYNTH_MIXER_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Top row ── */
.synth-top { align-items: center; }
.synth-top .p-select { flex: 1; min-width: 0; }

/* ── Octave control ── */
.oct-ctrl { align-items: center; gap: 2px; }
.oct-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 11px; font-family: var(--p-font-mono);
  transition: all var(--p-duration-fast) var(--p-ease);
}
.oct-btn:hover { background: var(--p-border); color: var(--p-text); }
.oct-display {
  font-size: 11px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text); min-width: 24px; text-align: center;
}

/* ── Knobs row ── */
.synth-knobs-wrap { position: relative; }
.synth-knobs {
  display: flex; justify-content: space-around; align-items: flex-start;
  padding: 4px 0;
}

/* ── Visualizer ── */
.viz-wrap {
  width: 100%; height: 96px; background: var(--p-surface);
  border-radius: var(--p-radius-sm); overflow: hidden; position: relative;
  border: 1px solid rgba(68, 136, 255, 0.15);
}
.viz-wrap canvas { display: block; width: 100%; height: 100%; }

/* ── Presets ── */
.synth-presets { align-items: center; }
.preset-row { display: flex; gap: 6px; flex: 1; }
.preset-slot {
  all: unset; cursor: pointer; flex: 1; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--p-radius-sm); border: 1px dashed var(--p-border);
  font-size: 10px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted);
  transition: all var(--p-duration-fast) var(--p-ease);
}
.preset-slot:hover { background: var(--p-surface); border-color: var(--p-text-muted); }
.preset-slot.filled { border-style: solid; color: var(--p-accent-green); }
.preset-slot.active { border-color: var(--p-accent-green); color: var(--p-accent-green); background: rgba(46, 125, 66, 0.08); box-shadow: 0 0 6px rgba(46, 125, 66, 0.2); }

/* ── Connection button ── */
.conn-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 8px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); letter-spacing: 0.5px;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.conn-btn:hover { background: var(--p-border); }
.conn-btn.live { color: var(--p-accent-green); border-color: rgba(46, 125, 66, 0.3); }

/* ── Metronome button ── */
.metro-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  gap: 4px; padding: 2px 8px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); letter-spacing: 0.5px;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.metro-btn:hover { background: var(--p-border); }
.metro-btn.active { color: var(--p-accent-amber); border-color: rgba(255, 107, 43, 0.3); }
.metro-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; opacity: 0.4;
  transition: opacity 60ms ease;
}
.metro-btn.active .metro-dot { opacity: 1; }
@keyframes metro-tick { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.metro-dot.tick { animation: metro-tick 0.15s ease; }

/* ── Piano fills remaining space ── */
#pianoContainer { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.p-piano { flex: 1; height: auto; border-radius: 0 0 16px 16px; border-bottom: none; border-left: none; border-right: none; }
</style>
</head>
<body class="p-stack pad-2 full gap-1" style="padding-top:10px">
  <div id="mainContent" class="p-stack full gap-1">
    <!-- Row 1: Spectrum visualizer (top hero) -->
    <div class="viz-wrap" id="vizWrap"></div>

    <!-- Row 2: Waveform + Key/Transpose + Octave + Status -->
    <div class="p-row gap-2 synth-top">
      <select class="p-select" id="waveSelect">
        <option value="sine">SINE</option>
        <option value="square">SQUARE</option>
        <option value="sawtooth" selected>SAWTOOTH</option>
        <option value="triangle">TRIANGLE</option>
      </select>
      <select class="p-select" id="keySelect" style="width:64px;flex:none">
        <option value="0">C</option>
        <option value="1">C#</option>
        <option value="2">D</option>
        <option value="3">D#</option>
        <option value="4">E</option>
        <option value="5">F</option>
        <option value="6">F#</option>
        <option value="7">G</option>
        <option value="8">G#</option>
        <option value="9">A</option>
        <option value="10">A#</option>
        <option value="11">B</option>
      </select>
      <div class="p-row oct-ctrl">
        <button class="oct-btn" id="octDown">\u2190</button>
        <span class="oct-display" id="octDisplay">C4</span>
        <button class="oct-btn" id="octUp">\u2192</button>
      </div>
      <button class="metro-btn" id="metroBtn"><span class="metro-dot" id="metroDot"></span> M</button>
      <button class="conn-btn" id="connBtn">...</button>
    </div>

    <!-- Row 3: SDK Knobs -->
    <div class="synth-knobs-wrap">
      <div class="synth-knobs" id="knobRow"></div>
    </div>

    <!-- Row 4: Presets -->
    <div class="p-row gap-2 synth-presets">
      <span class="p-label-tech" style="flex-shrink:0">PRE</span>
      <div class="preset-row" id="presetRow">
        <button class="preset-slot" data-slot="0">1</button>
        <button class="preset-slot" data-slot="1">2</button>
        <button class="preset-slot" data-slot="2">3</button>
        <button class="preset-slot" data-slot="3">4</button>
      </div>
    </div>

    <!-- Row 5: SDK Piano keyboard -->
    <div id="pianoContainer"></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  /* ── State ── */
  var waveform = "sawtooth";
  var octave = 4;
  var transpose = 0;
  var connected = false;
  var channelId = null;
  var activeVoices = {};
  var disposed = false;
  var vizPollTimer = null;

  /* ── Synth params (updated by knobs) ── */
  var sp = {
    attack: 0.01, decay: 0.1, release: 0.15, volume: 50,
    filterFreq: 8000, filterQ: 1, reverbSend: 0
  };

  /* ── MIDI helper ── */
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /* ── SDK: Spectrum Visualizer ── */
  var viz = prvctice.ui.spectrum(document.getElementById("vizWrap"), {
    waveform: waveform,
    bands: 48,
    smoothing: 0.82
  });

  /* Poll analyser data from the host mixer engine */
  function startVizPoll() {
    vizPollTimer = setInterval(function() {
      if (!channelId) return;
      prvctice.mixer.getAnalyserData(channelId).then(function(data) {
        if (data && data.frequency) viz.draw(data.frequency);
      }).catch(function() {});
    }, 100);
  }

  function stopVizPoll() {
    if (vizPollTimer) { clearInterval(vizPollTimer); vizPollTimer = null; }
  }

  /* ── SDK: Knobs ── */
  var knobRow = document.getElementById("knobRow");
  var fmtSec = function(v) { return v.toFixed(2) + "s"; };
  var fmtHz = function(v) { return v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + ""; };
  var fmtQ = function(v) { return v.toFixed(1); };
  var fmtInt = function(v) { return Math.round(v) + ""; };

  var knobAttack = prvctice.ui.knob(knobRow, { min: 0, max: 1, step: 0.01, value: 0.01, label: "ATK", format: fmtSec, onChange: function(v) { sp.attack = v; } });
  var knobDecay = prvctice.ui.knob(knobRow, { min: 0, max: 1, step: 0.01, value: 0.1, label: "DEC", format: fmtSec, onChange: function(v) { sp.decay = v; } });
  var knobRelease = prvctice.ui.knob(knobRow, { min: 0, max: 2, step: 0.01, value: 0.15, label: "REL", format: fmtSec, onChange: function(v) { sp.release = v; } });
  var knobVolume = prvctice.ui.knob(knobRow, { min: 0, max: 100, step: 1, value: 50, label: "VOL", format: fmtInt, onChange: function(v) { sp.volume = v; } });
  var knobFilter = prvctice.ui.knob(knobRow, { min: 200, max: 8000, step: 50, value: 8000, label: "FLT", format: fmtHz, onChange: function(v) { sp.filterFreq = v; } });
  var knobRes = prvctice.ui.knob(knobRow, { min: 0, max: 30, step: 0.5, value: 1, label: "RES", format: fmtQ, onChange: function(v) { sp.filterQ = v; } });
  var knobReverb = prvctice.ui.knob(knobRow, { min: 0, max: 100, step: 1, value: 0, label: "VRB", format: fmtInt, onChange: function(v) {
    sp.reverbSend = v;
    if (channelId) prvctice.mixer.setReverbSend(channelId, v / 100);
  } });

  /* ── Build note options from current knob state ── */
  function getNoteOpts() {
    return {
      waveform: waveform,
      gain: sp.volume / 100,
      attack: sp.attack,
      release: sp.release,
      decay: sp.decay,
      sustain: sp.decay > 0 ? 0.5 : 1,
      filterFreq: sp.filterFreq,
      filterQ: sp.filterQ
    };
  }

  /* ── SDK: Piano Keyboard ── */
  var piano = prvctice.ui.piano(document.getElementById("pianoContainer"), {
    startOctave: octave,
    octaves: 2,
    onNoteOn: function(ev) {
      if (!connected) return;
      var midi = ev.midi + transpose;
      var freq = midiToFreq(midi);
      prvctice.mixer.noteOn(freq, getNoteOpts()).then(function(result) {
        if (result && result.voiceId) activeVoices[ev.midi] = result.voiceId;
      });
    },
    onNoteOff: function(ev) {
      if (activeVoices[ev.midi]) {
        prvctice.mixer.noteOff(activeVoices[ev.midi]);
        delete activeVoices[ev.midi];
      }
    }
  });

  /* ── Octave control ── */
  var NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  var octDisplay = document.getElementById("octDisplay");

  function updateOctaveDisplay() {
    octDisplay.textContent = NOTE_NAMES[transpose] + octave;
    piano.setOctave(octave);
  }

  document.getElementById("octDown").addEventListener("click", function() {
    if (octave > 1) { octave--; updateOctaveDisplay(); }
  });
  document.getElementById("octUp").addEventListener("click", function() {
    if (octave < 7) { octave++; updateOctaveDisplay(); }
  });

  /* ── Key select (transpose) ── */
  document.getElementById("keySelect").addEventListener("change", function(e) {
    transpose = parseInt(e.target.value);
    updateOctaveDisplay();
  });

  /* ── Waveform select ── */
  document.getElementById("waveSelect").addEventListener("change", function(e) {
    waveform = e.target.value;
    viz.setWaveform(waveform);
  });

  /* ── Presets ── */
  var presets = [null, null, null, null];
  var activePreset = -1;

  function getAllSettings() {
    return {
      waveform: waveform, attack: sp.attack, decay: sp.decay, release: sp.release,
      volume: sp.volume, filterFreq: sp.filterFreq, filterQ: sp.filterQ,
      reverbSend: sp.reverbSend, octave: octave, transpose: transpose
    };
  }

  function applySettings(s) {
    waveform = s.waveform || "sawtooth";
    sp.attack = s.attack; sp.decay = s.decay; sp.release = s.release;
    sp.volume = s.volume; sp.filterFreq = s.filterFreq; sp.filterQ = s.filterQ;
    sp.reverbSend = s.reverbSend;
    if (typeof s.octave === "number") octave = s.octave;
    if (typeof s.transpose === "number") { transpose = s.transpose; document.getElementById("keySelect").value = transpose; }
    document.getElementById("waveSelect").value = waveform;
    viz.setWaveform(waveform);
    knobAttack.set(sp.attack); knobDecay.set(sp.decay); knobRelease.set(sp.release);
    knobVolume.set(sp.volume); knobFilter.set(sp.filterFreq); knobRes.set(sp.filterQ);
    knobReverb.set(sp.reverbSend);
    if (channelId) prvctice.mixer.setReverbSend(channelId, sp.reverbSend / 100);
    updateOctaveDisplay();
  }

  function updatePresetUI() {
    var btns = document.querySelectorAll(".preset-slot");
    btns.forEach(function(btn) {
      var idx = parseInt(btn.dataset.slot);
      btn.classList.toggle("filled", presets[idx] !== null);
      btn.classList.toggle("active", idx === activePreset);
    });
  }

  document.getElementById("presetRow").addEventListener("click", function(e) {
    var btn = e.target.closest(".preset-slot");
    if (!btn) return;
    var idx = parseInt(btn.dataset.slot);
    if (presets[idx] === null) {
      presets[idx] = getAllSettings();
      activePreset = idx;
    } else {
      applySettings(presets[idx]);
      activePreset = idx;
    }
    updatePresetUI();
    savePresets();
  });

  document.getElementById("presetRow").addEventListener("contextmenu", function(e) {
    var btn = e.target.closest(".preset-slot");
    if (!btn) return;
    e.preventDefault();
    var idx = parseInt(btn.dataset.slot);
    presets[idx] = null;
    if (activePreset === idx) activePreset = -1;
    updatePresetUI();
    savePresets();
  });

  function savePresets() {
    prvctice.storage.set("piano-mixer-presets", presets).catch(function() {});
  }

  function loadPresets() {
    prvctice.storage.get("piano-mixer-presets").then(function(val) {
      if (val && Array.isArray(val)) { presets = val; updatePresetUI(); }
    }).catch(function() {});
  }

  /* ── Connection button ── */
  var connBtn = document.getElementById("connBtn");
  var metroBtn = document.getElementById("metroBtn");
  var metroDot = document.getElementById("metroDot");
  var metroEnabled = false;

  function setConnectedUI() {
    connBtn.textContent = "LIVE";
    connBtn.className = "conn-btn live";
  }
  function setDisconnectedUI() {
    connBtn.textContent = "CONNECT";
    connBtn.className = "conn-btn";
  }

  function doConnect() {
    prvctice.mixer.connect({ name: "Piano Synth" }).then(function(result) {
      connected = true;
      channelId = result.channelId;
      setConnectedUI();
      startVizPoll();
    }).catch(function() {
      setDisconnectedUI();
    });
  }

  function doDisconnect() {
    for (var nk in activeVoices) {
      if (activeVoices[nk]) prvctice.mixer.noteOff(activeVoices[nk]);
    }
    activeVoices = {};
    stopVizPoll();
    prvctice.mixer.disconnect();
    connected = false;
    channelId = null;
    setDisconnectedUI();
  }

  connBtn.addEventListener("click", function() {
    if (connected) { doDisconnect(); } else { doConnect(); }
  });

  prvctice.mixer.onDisconnected(function() {
    connected = false;
    channelId = null;
    activeVoices = {};
    stopVizPoll();
    setDisconnectedUI();
  });

  /* ── Metronome button ── */
  metroBtn.addEventListener("click", function() {
    metroEnabled = !metroEnabled;
    metroBtn.className = "metro-btn" + (metroEnabled ? " active" : "");
    prvctice.mixer.setMetronome(metroEnabled);
  });

  /* ── Auto-connect on load ── */
  doConnect();

  /* ── Init ── */
  updateOctaveDisplay();
  updatePresetUI();
  loadPresets();
  document.body.tabIndex = -1;
  document.body.focus();

  /* ── Dispose ── */
  prvctice.onDispose(function() {
    disposed = true;
    stopVizPoll();
    for (var nk in activeVoices) {
      if (activeVoices[nk]) prvctice.mixer.noteOff(activeVoices[nk]);
    }
    activeVoices = {};
    if (connected) {
      prvctice.mixer.disconnect();
      connected = false;
      channelId = null;
    }
    viz.dispose();
    piano.dispose();
    knobAttack.dispose(); knobDecay.dispose(); knobRelease.dispose();
    knobVolume.dispose(); knobFilter.dispose(); knobRes.dispose(); knobReverb.dispose();
  });
});
<` +
  `/script>
</html>`;
