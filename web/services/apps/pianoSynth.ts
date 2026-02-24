/**
 * Synth Studio -- 4-track multitrack MIDI synthesizer builtin app.
 * Uses SDK components: piano keyboard, knobs, transport, MIDI recorder,
 * track manager. Custom energy-reactive spectrum visualizer.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const PIANO_SYNTH_HTML =
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
.trk-badge {
  position: absolute; top: -2px; right: 4px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 700;
  color: var(--p-text-muted); letter-spacing: 0.5px;
}

/* ── Transport + Tracks split ── */
.transport-tracks {
  display: flex; gap: 8px; align-items: stretch;
}
.transport-side {
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.transport-controls {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
}
.transport-pos {
  font-size: 12px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text); min-width: 52px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.bpm-input {
  width: 40px; padding: 3px 4px; text-align: center;
  border-radius: var(--p-radius-sm); border: 1px solid var(--p-border);
  background: var(--p-surface); color: var(--p-text);
  font-size: var(--p-font-size-sm); font-family: var(--p-font-mono);
  outline: none;
}
.bpm-input:focus { border-color: var(--p-accent-blue); box-shadow: 0 0 8px rgba(68, 136, 255, 0.2); }
.loop-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 12px; font-family: var(--p-font-mono);
  transition: all var(--p-duration-fast) var(--p-ease);
}
.loop-btn:hover { background: var(--p-border); color: var(--p-text); }
.loop-btn.active { color: var(--p-accent-blue); border-color: var(--p-accent-blue); background: rgba(68, 136, 255, 0.08); }

/* ── Metronome indicator ── */
.metro-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--p-text-muted); opacity: 0.3;
  transition: opacity 60ms ease, background 60ms ease;
  flex-shrink: 0;
}
.metro-dot.tick {
  background: var(--p-accent-amber);
  opacity: 1;
  box-shadow: 0 0 8px rgba(255, 107, 43, 0.5);
}

/* ── Track strips (compact, right side) ── */
.tracks-side {
  display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
}
.track-strip {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 4px;
  border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-border);
  background: var(--p-surface);
  min-height: 24px;
}
.track-strip.track-armed { background: rgba(239, 68, 68, 0.04); }
.track-strip.track-armed .track-arm-btn { color: var(--p-danger); border-color: var(--p-danger); }
.track-arm-btn, .track-mute-btn, .track-solo-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-border); font-size: 8px; font-family: var(--p-font-mono);
  font-weight: 700; color: var(--p-text-muted); flex-shrink: 0;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.track-arm-btn:hover, .track-mute-btn:hover, .track-solo-btn:hover { background: var(--p-border); }
.track-mute-btn.active { color: var(--p-accent-amber); border-color: var(--p-accent-amber); }
.track-solo-btn.active { color: var(--p-accent-blue); border-color: var(--p-accent-blue); }
.track-label {
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-secondary); min-width: 10px; text-align: center;
}
.track-vol {
  flex: 1; height: 3px; -webkit-appearance: none; appearance: none;
  background: var(--p-border); border-radius: 2px; outline: none; cursor: pointer;
  min-width: 40px;
}
.track-vol::-webkit-slider-thumb {
  -webkit-appearance: none; width: 8px; height: 8px; border-radius: 50%;
  background: var(--p-text-secondary); cursor: grab;
}
.track-clear-btn {
  all: unset; cursor: pointer; display: none; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: var(--p-radius-sm);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 700;
  color: var(--p-text-muted); flex-shrink: 0;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.track-clear-btn:hover { color: var(--p-danger); }
.track-has-data .track-clear-btn { display: flex; }

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


/* ── Bar ruler ── */
.bar-ruler {
  display: flex; gap: 1px; height: 14px; flex-shrink: 0;
}
.bar-seg {
  flex: 1; border-radius: 2px;
  background: var(--p-surface); border: 1px solid var(--p-border);
  position: relative; transition: background 0.1s ease;
}
.bar-seg.has-notes { background: rgba(68, 136, 255, 0.1); border-color: rgba(68, 136, 255, 0.2); }
.bar-seg.current { background: rgba(68, 136, 255, 0.25); border-color: var(--p-accent-blue); box-shadow: 0 0 4px rgba(68, 136, 255, 0.3); }
.bar-seg.current.recording { background: rgba(239, 68, 68, 0.2); border-color: var(--p-danger); box-shadow: 0 0 4px rgba(239, 68, 68, 0.3); }

/* ── Piano corners match window ── */
.p-piano { border-radius: 0 0 16px 16px; border-bottom: none; border-left: none; border-right: none; }
</style>
</head>
<body class="p-stack pad-2 full gap-1" style="padding-top:10px">
  <div id="mainContent" class="p-stack full gap-1">
    <!-- Row 1: Visualizer (top hero) -->
    <div class="viz-wrap"><canvas id="vizCanvas"></canvas></div>

    <!-- Bar ruler (16 bars) -->
    <div class="bar-ruler" id="barRuler"></div>

    <!-- Row 2: Transport (left) + Tracks (right) -->
    <div class="transport-tracks">
      <div class="transport-side">
        <div class="transport-controls">
          <button class="p-btn p-btn-ghost p-btn-sm" id="recBtn" title="Record">REC</button>
          <button class="p-btn p-btn-ghost p-btn-sm" id="playBtn" title="Play">\u25B6</button>
          <button class="p-btn p-btn-ghost p-btn-sm" id="stopBtn" title="Stop">\u25A0</button>
          <span id="metroDot" class="metro-dot"></span>
        </div>
        <div class="transport-controls">
          <span class="transport-pos" id="posDisplay">0:00.0</span>
          <input class="bpm-input" id="bpmInput" type="text" value="120" inputmode="numeric" maxlength="3">
          <span class="p-label-tech" style="flex-shrink:0">BPM</span>
        </div>
        <div class="transport-controls">
          <button class="loop-btn active" id="metroBtn" title="Metronome">M</button>
          <button class="loop-btn" id="loopBtn" title="Loop">\u21BB</button>
          <button class="loop-btn" id="barsBtn" title="Toggle 8/16 bars">16</button>
          <button class="p-btn p-btn-ghost p-btn-sm" id="exportBtn" title="Export WAV" disabled>\u2193</button>
        </div>
        <!-- Presets under transport -->
        <div class="p-row gap-2 synth-presets" style="margin-top:2px">
          <span class="p-label-tech" style="flex-shrink:0">PRE</span>
          <div class="preset-row" id="presetRow">
            <button class="preset-slot" data-slot="0">1</button>
            <button class="preset-slot" data-slot="1">2</button>
            <button class="preset-slot" data-slot="2">3</button>
            <button class="preset-slot" data-slot="3">4</button>
          </div>
        </div>
      </div>
      <div class="tracks-side" id="trackStrips"></div>
    </div>

    <!-- Row 3: Waveform + Octave -->
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
    </div>

    <!-- Row 4: SDK Knobs -->
    <div class="synth-knobs-wrap">
      <span class="trk-badge" id="trkBadge">TRK 1</span>
      <div class="synth-knobs" id="knobRow"></div>
    </div>

    <!-- Row 5: SDK Piano keyboard -->
    <div id="pianoContainer"></div>
  </div>
</body>
<script>prvctice.onReady(function() {
  /* ── Audio graph ── */
  var audioContext = prvctice.audio.createContext();

  /* Resume AudioContext on first user gesture (avoids Chrome autoplay policy block) */
  function resumeAudio() {
    if (audioContext.state === "suspended") { audioContext.resume(); }
    document.removeEventListener("mousedown", resumeAudio);
    document.removeEventListener("touchstart", resumeAudio);
    document.removeEventListener("keydown", resumeAudio);
  }
  document.addEventListener("mousedown", resumeAudio);
  document.addEventListener("touchstart", resumeAudio);
  document.addEventListener("keydown", resumeAudio);

  var masterGain = audioContext.createGain();
  var analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  masterGain.gain.value = 0.5;

  /* Reverb via ConvolverNode — shared bus, per-track send levels */
  var reverbNode = audioContext.createConvolver();
  var reverbReturn = audioContext.createGain();
  reverbReturn.gain.value = 1;

  /* Generate impulse response (plate-style) */
  function buildImpulse(duration, decay) {
    var rate = audioContext.sampleRate;
    var len = Math.floor(rate * duration);
    var impulse = audioContext.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }
  reverbNode.buffer = buildImpulse(2.5, 2.5);
  reverbNode.connect(reverbReturn);

  /* 4 track gain nodes -> masterGain (dry) + reverbSends[i] -> reverbNode (wet) */
  var NUM_TRACKS = 4;
  var trackGains = [];
  var reverbSends = [];
  for (var ti = 0; ti < NUM_TRACKS; ti++) {
    var tg = audioContext.createGain();
    tg.connect(masterGain);
    var rs = audioContext.createGain();
    rs.gain.value = 0;
    tg.connect(rs);
    rs.connect(reverbNode);
    trackGains.push(tg);
    reverbSends.push(rs);
  }
  masterGain.connect(analyser);
  reverbReturn.connect(analyser);
  analyser.connect(audioContext.destination);

  /* ── Synth state ── */
  var octave = 4;
  var transpose = 0;
  var activeNotes = {};

  /* Per-track synth settings — knobs read/write to trackSettings[currentEditTrack] */
  var trackSettings = [];
  for (var tsi = 0; tsi < NUM_TRACKS; tsi++) {
    trackSettings.push({ waveform: "sawtooth", attack: 0.01, release: 0.3, filter: 2000, resonance: 5, vibratoRate: 0, vibratoDepth: 0, reverb: 0 });
  }
  var currentEditTrack = 0;

  /* ── Note helpers ── */
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /* Play a note with per-note filter, reading from active track's settings */
  function playNote(midi, velocity) {
    if (activeNotes[midi]) return;
    audioContext.resume();
    var trackIdx = getActiveTrackIndex();
    var s = trackSettings[trackIdx];
    var freq = midiToFreq(midi + transpose);
    var osc = audioContext.createOscillator();
    var envGain = audioContext.createGain();
    var flt = audioContext.createBiquadFilter();
    osc.type = s.waveform;
    osc.frequency.value = freq;
    flt.type = "lowpass";
    flt.frequency.value = s.filter;
    flt.Q.value = s.resonance;
    osc.connect(envGain);
    envGain.connect(flt);
    flt.connect(trackGains[trackIdx]);
    var now = audioContext.currentTime;
    var vol = (velocity || 100) / 127 * 0.3;
    envGain.gain.setValueAtTime(0, now);
    envGain.gain.linearRampToValueAtTime(vol, now + s.attack);
    osc.start(now);
    var lfo = null;
    if (s.vibratoRate > 0 && s.vibratoDepth > 0) {
      lfo = audioContext.createOscillator();
      var lfoGain = audioContext.createGain();
      lfo.type = "sine";
      lfo.frequency.value = s.vibratoRate;
      lfoGain.gain.value = s.vibratoDepth * freq * 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);
    }
    activeNotes[midi] = { osc: osc, gain: envGain, lfo: lfo, release: s.release };
  }

  function stopNote(midi) {
    var note = activeNotes[midi];
    if (!note) return;
    var now = audioContext.currentTime;
    var rel = note.release;
    note.gain.gain.cancelScheduledValues(now);
    note.gain.gain.setValueAtTime(note.gain.gain.value, now);
    note.gain.gain.linearRampToValueAtTime(0, now + rel);
    note.osc.stop(now + rel + 0.01);
    if (note.lfo) { note.lfo.stop(now + rel + 0.01); }
    delete activeNotes[midi];
  }

  function getActiveTrackIndex() {
    var armed = trackManager.getArmedTracks();
    return armed.length > 0 ? armed[0] : 0;
  }

  /* Play a note for playback with per-track settings */
  var playbackNotes = {};
  function playbackNoteOn(trackIdx, midi, velocity) {
    var key = trackIdx + "_" + midi;
    if (playbackNotes[key]) return;
    var s = trackSettings[trackIdx];
    var freq = midiToFreq(midi);
    var osc = audioContext.createOscillator();
    var envGain = audioContext.createGain();
    var flt = audioContext.createBiquadFilter();
    osc.type = s.waveform;
    osc.frequency.value = freq;
    flt.type = "lowpass";
    flt.frequency.value = s.filter;
    flt.Q.value = s.resonance;
    osc.connect(envGain);
    envGain.connect(flt);
    flt.connect(trackGains[trackIdx]);
    var now = audioContext.currentTime;
    var vol = (velocity || 100) / 127 * 0.3;
    envGain.gain.setValueAtTime(0, now);
    envGain.gain.linearRampToValueAtTime(vol, now + s.attack);
    osc.start(now);
    var lfo = null;
    if (s.vibratoRate > 0 && s.vibratoDepth > 0) {
      lfo = audioContext.createOscillator();
      var lfoGain = audioContext.createGain();
      lfo.type = "sine";
      lfo.frequency.value = s.vibratoRate;
      lfoGain.gain.value = s.vibratoDepth * freq * 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);
    }
    playbackNotes[key] = { osc: osc, gain: envGain, filter: flt, release: s.release, lfo: lfo };
  }

  function playbackNoteOff(trackIdx, midi) {
    var key = trackIdx + "_" + midi;
    var note = playbackNotes[key];
    if (!note) return;
    var now = audioContext.currentTime;
    note.gain.gain.cancelScheduledValues(now);
    note.gain.gain.setValueAtTime(note.gain.gain.value, now);
    note.gain.gain.linearRampToValueAtTime(0, now + note.release);
    note.osc.stop(now + note.release + 0.01);
    if (note.lfo) { note.lfo.stop(now + note.release + 0.01); }
    delete playbackNotes[key];
  }

  /* ── SDK: Transport ── */
  var transport = prvctice.audio.createTransport({ bpm: 120 });

  /* ── SDK: Track Manager ── */
  var trackManager = prvctice.audio.createTrackManager({
    tracks: NUM_TRACKS,
    onChange: function() {
      updateTrackGains();
      updateTrackUI();
      /* Auto-switch knobs to first armed track */
      var armed = trackManager.getArmedTracks();
      if (armed.length > 0) { switchKnobsToTrack(armed[0]); }
    }
  });
  trackManager.setArmed(0, true);

  function updateTrackGains() {
    for (var i = 0; i < NUM_TRACKS; i++) {
      trackGains[i].gain.value = trackManager.getEffectiveGain(i);
    }
  }

  /* ── SDK: MIDI Recorders (one per track) ── */
  var recorders = [];
  for (var ri = 0; ri < NUM_TRACKS; ri++) {
    var rec = prvctice.audio.createMidiRecorder(transport, { overdub: false });
    (function(idx) {
      rec.setPlaybackHandler(
        function(midi, vel) { playbackNoteOn(idx, midi, vel); },
        function(midi) { playbackNoteOff(idx, midi); }
      );
    })(ri);
    recorders.push(rec);
  }

  /* ── SDK: Piano Keyboard ── */
  var piano = prvctice.ui.piano(document.getElementById("pianoContainer"), {
    startOctave: octave,
    onNoteOn: function(ev) {
      playNote(ev.midi, 100);
      /* Record transposed MIDI so playback reflects the key selection */
      var recMidi = ev.midi + transpose;
      var armed = trackManager.getArmedTracks();
      for (var i = 0; i < armed.length; i++) {
        recorders[armed[i]].noteOn(recMidi, 100);
      }
    },
    onNoteOff: function(ev) {
      stopNote(ev.midi);
      var recMidi = ev.midi + transpose;
      var armed = trackManager.getArmedTracks();
      for (var i = 0; i < armed.length; i++) {
        recorders[armed[i]].noteOff(recMidi);
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

  /* ── SDK: Knobs ── */
  var knobRow = document.getElementById("knobRow");
  var fmtSec = function(v) { return v.toFixed(2) + "s"; };
  var fmtPct = function(v) { return Math.round(v * 100) + "%"; };
  var fmtHz = function(v) { return v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + ""; };
  var fmtQ = function(v) { return v.toFixed(1); };

  var knobAttack = prvctice.ui.knob(knobRow, { min: 0, max: 1, step: 0.01, value: 0.01, label: "ATK", format: fmtSec, onChange: function(v) { trackSettings[currentEditTrack].attack = v; } });
  var knobRelease = prvctice.ui.knob(knobRow, { min: 0, max: 2, step: 0.01, value: 0.3, label: "REL", format: fmtSec, onChange: function(v) { trackSettings[currentEditTrack].release = v; } });
  var knobVolume = prvctice.ui.knob(knobRow, { min: 0, max: 1, step: 0.01, value: 0.5, label: "VOL", format: fmtPct, onChange: function(v) { masterGain.gain.value = v; } });
  var knobFilter = prvctice.ui.knob(knobRow, { min: 200, max: 8000, step: 50, value: 2000, label: "FILTER", format: fmtHz, onChange: function(v) { trackSettings[currentEditTrack].filter = v; } });
  var knobRes = prvctice.ui.knob(knobRow, { min: 0, max: 30, step: 0.5, value: 5, label: "RES", format: fmtQ, onChange: function(v) { trackSettings[currentEditTrack].resonance = v; } });
  var knobVibrato = prvctice.ui.knob(knobRow, { min: 0, max: 1, step: 0.01, value: 0, label: "VIB", format: fmtPct, onChange: function(v) { trackSettings[currentEditTrack].vibratoDepth = v; trackSettings[currentEditTrack].vibratoRate = v > 0 ? 4 + v * 4 : 0; } });
  var knobReverb = prvctice.ui.knob(knobRow, { min: 0, max: 1, step: 0.01, value: 0, label: "VERB", format: fmtPct, onChange: function(v) { trackSettings[currentEditTrack].reverb = v; reverbSends[currentEditTrack].gain.value = v; } });

  /* ── Track knob switching ── */
  var trkBadge = document.getElementById("trkBadge");

  function loadKnobsFromTrack(idx) {
    var s = trackSettings[idx];
    knobAttack.set(s.attack);
    knobRelease.set(s.release);
    knobFilter.set(s.filter);
    knobRes.set(s.resonance);
    knobVibrato.set(s.vibratoDepth);
    knobReverb.set(s.reverb);
    document.getElementById("waveSelect").value = s.waveform;
    trkBadge.textContent = "TRK " + (idx + 1);
  }

  function switchKnobsToTrack(idx) {
    currentEditTrack = idx;
    loadKnobsFromTrack(idx);
  }

  /* ── Waveform select ── */
  document.getElementById("waveSelect").addEventListener("change", function(e) { trackSettings[currentEditTrack].waveform = e.target.value; });

  /* ── Transport controls ── */
  var recBtn = document.getElementById("recBtn");
  var playBtn = document.getElementById("playBtn");
  var stopBtn = document.getElementById("stopBtn");
  var posDisplay = document.getElementById("posDisplay");
  var bpmInput = document.getElementById("bpmInput");
  var loopBtn = document.getElementById("loopBtn");
  var exportBtn = document.getElementById("exportBtn");
  var metroDot = document.getElementById("metroDot");

  function formatPos(beats) {
    var bpm = transport.getBpm();
    var totalSec = beats * (60 / bpm);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return min + ":" + (sec < 10 ? "0" : "") + sec.toFixed(1);
  }

  /* ── Bar ruler ── */
  var BEATS_PER_BAR = 4;
  var totalBars = 16;
  var totalBeats = totalBars * BEATS_PER_BAR;
  var barRuler = document.getElementById("barRuler");
  var barSegs = [];

  function buildBarRuler() {
    barRuler.innerHTML = "";
    barSegs = [];
    for (var bi = 0; bi < totalBars; bi++) {
      var seg = document.createElement("div");
      seg.className = "bar-seg";
      barRuler.appendChild(seg);
      barSegs.push(seg);
    }
    prevBar = -1;
    /* Update transport loop end to match bar count */
    transport.setLoop(true, 0, totalBeats);
  }

  buildBarRuler();
  var prevBar = -1;

  function updateBarRuler(pos) {
    var currentBar = Math.floor(pos / BEATS_PER_BAR) % totalBars;
    var isRec = transport.getState() === "recording";
    if (currentBar !== prevBar) {
      for (var i = 0; i < totalBars; i++) {
        barSegs[i].classList.toggle("current", i === currentBar);
        barSegs[i].classList.toggle("recording", i === currentBar && isRec);
      }
      prevBar = currentBar;
    }
  }

  function updateBarNotes() {
    /* Mark which bars have recorded notes across all tracks */
    var barHas = [];
    for (var b = 0; b < totalBars; b++) { barHas.push(false); }
    for (var t = 0; t < NUM_TRACKS; t++) {
      var evts = recorders[t].getEvents();
      for (var e = 0; e < evts.length; e++) {
        var startBar = Math.floor(evts[e].startBeat / BEATS_PER_BAR);
        var endBar = Math.floor((evts[e].startBeat + evts[e].durationBeats) / BEATS_PER_BAR);
        for (var bb = startBar; bb <= endBar && bb < totalBars; bb++) {
          barHas[bb] = true;
        }
      }
    }
    for (var b2 = 0; b2 < totalBars; b2++) {
      barSegs[b2].classList.toggle("has-notes", barHas[b2]);
    }
  }

  /* Track recording loop completion */
  var recordingLooped = false;
  var lastTickPos = 0;

  transport.onTick(function(pos) {
    posDisplay.textContent = formatPos(pos);
    updateBarRuler(pos);
    /* Detect loop wrap: position jumps backward means the transport looped.
       When recording, a wrap means we've completed the bar length -- stop
       recording and switch to looped playback. */
    var wrapped = pos < lastTickPos - 1;
    /* During playback without loop, stop at the end */
    if (transport.getState() === "playing" && !loopPlayback && wrapped) {
      transport.stop();
      lastTickPos = 0;
      return;
    }
    if (transport.getState() === "recording" && !recordingLooped && wrapped) {
      recordingLooped = true;
      /* Close any held notes at the loop boundary before disarming */
      var armed = trackManager.getArmedTracks();
      var heldKeys = Object.keys(activeNotes);
      for (var hi = 0; hi < heldKeys.length; hi++) {
        var hMidi = parseInt(heldKeys[hi]);
        for (var ai = 0; ai < armed.length; ai++) {
          recorders[armed[ai]].noteOff(hMidi + transpose);
        }
      }
      /* Disarm recorders, switch to play */
      for (var ri = 0; ri < NUM_TRACKS; ri++) {
        recorders[ri].setArmed(false);
      }
      /* Transition: stop briefly then play from beginning */
      transport.stop();
      transport.seek(0);
      transport.play();
    }
    lastTickPos = pos;
  });

  transport.onStateChange(function(st) {
    recBtn.classList.toggle("p-btn-primary", st === "recording");
    recBtn.classList.toggle("p-btn-ghost", st !== "recording");
    playBtn.classList.toggle("p-btn-primary", st === "playing");
    playBtn.classList.toggle("p-btn-ghost", st !== "playing");
    /* Update export button on any state change */
    updateExportBtn();
    updateTrackUI();
    updateBarNotes();
    if (st === "stopped") { prevBar = -1; updateBarRuler(0); }
  });

  /* Metronome toggle */
  var metroEnabled = true;
  var metroBtn = document.getElementById("metroBtn");
  metroBtn.addEventListener("click", function() {
    metroEnabled = !metroEnabled;
    metroBtn.classList.toggle("active", metroEnabled);
  });

  /* Metronome click + visual flash on beat */
  transport.onBeat(function() {
    if (!metroEnabled) return;
    var osc = audioContext.createOscillator();
    var gain = audioContext.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(audioContext.destination);
    var now = audioContext.currentTime;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.start(now);
    osc.stop(now + 0.05);
    /* Visual flash */
    metroDot.classList.add("tick");
    setTimeout(function() { metroDot.classList.remove("tick"); }, 100);
  });

  /* ── Record with count-in ── */
  var countInRemaining = 0;
  var countInTimer = null;

  function metroClick() {
    var osc = audioContext.createOscillator();
    var gain = audioContext.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(audioContext.destination);
    var now = audioContext.currentTime;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.start(now);
    osc.stop(now + 0.05);
    metroDot.classList.add("tick");
    setTimeout(function() { metroDot.classList.remove("tick"); }, 100);
  }

  function startRecordAfterCountIn() {
    var armed = trackManager.getArmedTracks();
    for (var i = 0; i < armed.length; i++) {
      recorders[armed[i]].setArmed(true);
    }
    recBtn.textContent = "REC";
    recordingLooped = false;
    lastTickPos = 0;
    transport.seek(0);
    transport.record();
  }

  function cancelCountIn() {
    if (countInTimer) { clearInterval(countInTimer); countInTimer = null; }
    countInRemaining = 0;
    recBtn.textContent = "REC";
    recBtn.classList.remove("p-btn-primary");
    recBtn.classList.add("p-btn-ghost");
  }

  recBtn.addEventListener("click", function() {
    audioContext.resume();
    /* If recording, stop */
    if (transport.getState() === "recording") {
      transport.stop();
      return;
    }
    /* If counting in, cancel */
    if (countInRemaining > 0) {
      cancelCountIn();
      return;
    }
    /* Start count-in: 4 metronome clicks, no transport playback */
    countInRemaining = 4;
    recBtn.textContent = "" + countInRemaining;
    recBtn.classList.add("p-btn-primary");
    recBtn.classList.remove("p-btn-ghost");

    /* First click immediately */
    metroClick();

    var beatMs = 60000 / transport.getBpm();
    countInTimer = setInterval(function() {
      countInRemaining--;
      if (countInRemaining > 0) {
        recBtn.textContent = "" + countInRemaining;
        metroClick();
      } else {
        /* Count-in done — start recording from beat 0 */
        clearInterval(countInTimer);
        countInTimer = null;
        startRecordAfterCountIn();
      }
    }, beatMs);
  });

  playBtn.addEventListener("click", function() {
    audioContext.resume();
    if (transport.getState() === "playing") {
      transport.pause();
      return;
    }
    /* Disarm all recorders for pure playback */
    for (var i = 0; i < NUM_TRACKS; i++) {
      recorders[i].setArmed(false);
    }
    transport.play();
  });

  stopBtn.addEventListener("click", function() {
    cancelCountIn();
    transport.stop();
    /* Disarm recorders */
    for (var i = 0; i < NUM_TRACKS; i++) {
      recorders[i].setArmed(false);
    }
  });

  bpmInput.addEventListener("input", function(e) { e.target.value = e.target.value.replace(/[^0-9]/g, ""); });
  bpmInput.addEventListener("change", function() {
    var v = parseInt(bpmInput.value) || 120;
    v = Math.max(20, Math.min(300, v));
    bpmInput.value = v;
    transport.setBpm(v);
  });

  /* Loop toggle: controls whether playback loops continuously.
     Transport loop is always enabled (needed for recording bar limit),
     but when loopPlayback is off, we stop at the end during playback. */
  var loopPlayback = true;
  loopBtn.classList.add("active");
  loopBtn.addEventListener("click", function() {
    loopPlayback = !loopPlayback;
    loopBtn.classList.toggle("active", loopPlayback);
  });

  /* Bars toggle: 8 or 16 bars */
  var barsBtn = document.getElementById("barsBtn");
  barsBtn.addEventListener("click", function() {
    totalBars = totalBars === 16 ? 8 : 16;
    totalBeats = totalBars * BEATS_PER_BAR;
    barsBtn.textContent = totalBars;
    buildBarRuler();
    updateBarNotes();
  });

  function updateExportBtn() {
    var hasData = false;
    for (var i = 0; i < NUM_TRACKS; i++) {
      if (recorders[i].hasEvents()) { hasData = true; break; }
    }
    exportBtn.disabled = !hasData;
  }

  /* ── Export WAV ── */
  exportBtn.addEventListener("click", function() {
    /* Find the longest track in beats */
    var maxBeat = 0;
    for (var i = 0; i < NUM_TRACKS; i++) {
      var evts = recorders[i].getEvents();
      for (var j = 0; j < evts.length; j++) {
        var end = evts[j].startBeat + evts[j].durationBeats;
        if (end > maxBeat) maxBeat = end;
      }
    }
    if (maxBeat === 0) return;
    var bpm = transport.getBpm();
    var durationSec = (maxBeat * 60 / bpm) + 1;

    prvctice.audio.renderOffline(function(offCtx) {
      var offMaster = offCtx.createGain();
      offMaster.gain.value = masterGain.gain.value;
      offMaster.connect(offCtx.destination);

      /* Offline reverb — shared bus with per-track send gains */
      var offReverb = offCtx.createConvolver();
      var offRevReturn = offCtx.createGain();
      offRevReturn.gain.value = 1;
      var offImpulse = offCtx.createBuffer(2, Math.floor(offCtx.sampleRate * 2.5), offCtx.sampleRate);
      for (var ich = 0; ich < 2; ich++) {
        var idata = offImpulse.getChannelData(ich);
        for (var ii = 0; ii < idata.length; ii++) {
          idata[ii] = (Math.random() * 2 - 1) * Math.pow(1 - ii / idata.length, 2.5);
        }
      }
      offReverb.buffer = offImpulse;
      offReverb.connect(offRevReturn);
      offRevReturn.connect(offCtx.destination);

      for (var t = 0; t < NUM_TRACKS; t++) {
        var evts = recorders[t].getEvents();
        var s = trackSettings[t];
        var tGain = offCtx.createGain();
        tGain.gain.value = trackManager.getEffectiveGain(t);
        tGain.connect(offMaster);
        /* Per-track reverb send */
        var offSend = offCtx.createGain();
        offSend.gain.value = s.reverb;
        tGain.connect(offSend);
        offSend.connect(offReverb);

        for (var e = 0; e < evts.length; e++) {
          var ev = evts[e];
          var startSec = ev.startBeat * 60 / bpm;
          var durSec = ev.durationBeats * 60 / bpm;
          var freq = midiToFreq(ev.midi);
          var vol = (ev.velocity || 100) / 127 * 0.3;

          var osc = offCtx.createOscillator();
          var envG = offCtx.createGain();
          var flt = offCtx.createBiquadFilter();
          osc.type = s.waveform;
          osc.frequency.value = freq;
          flt.type = "lowpass";
          flt.frequency.value = s.filter;
          flt.Q.value = s.resonance;
          osc.connect(envG);
          envG.connect(flt);
          flt.connect(tGain);

          if (s.vibratoRate > 0 && s.vibratoDepth > 0) {
            var offLfo = offCtx.createOscillator();
            var offLfoG = offCtx.createGain();
            offLfo.type = "sine";
            offLfo.frequency.value = s.vibratoRate;
            offLfoG.gain.value = s.vibratoDepth * freq * 0.02;
            offLfo.connect(offLfoG);
            offLfoG.connect(osc.frequency);
            offLfo.start(startSec);
            offLfo.stop(startSec + durSec + 0.01);
          }

          envG.gain.setValueAtTime(0, startSec);
          envG.gain.linearRampToValueAtTime(vol, startSec + s.attack);
          var noteEnd = startSec + durSec;
          envG.gain.setValueAtTime(vol, Math.max(startSec + s.attack, noteEnd - s.release));
          envG.gain.linearRampToValueAtTime(0, noteEnd);
          osc.start(startSec);
          osc.stop(noteEnd + 0.01);
        }
      }
    }, durationSec).then(function(buffer) {
      var wav = prvctice.audio.encodeWAV(buffer);
      prvctice.audio.bufferToBase64(wav).then(function(b64) {
        var ts = (new Date()).toISOString().slice(0, 19).replace(/:/g, "-");
        var filename = "synth-" + ts + ".wav";
        prvctice.fs.saveBlob(b64, "audio/wav", filename).then(function() {
          prvctice.ui.toast("Saved to Files");
        });
      });
    });
  });

  /* ── Track strip UI ── */
  var trackStripsEl = document.getElementById("trackStrips");

  function buildTrackStrips() {
    trackStripsEl.innerHTML = "";
    for (var i = 0; i < NUM_TRACKS; i++) {
      var strip = document.createElement("div");
      strip.className = "track-strip";
      strip.dataset.track = i;

      var armBtn = document.createElement("button");
      armBtn.className = "track-arm-btn";
      armBtn.textContent = "R";
      armBtn.title = "Arm track " + (i + 1);
      armBtn.dataset.action = "arm";

      var label = document.createElement("span");
      label.className = "track-label";
      label.textContent = (i + 1);

      var muteBtn = document.createElement("button");
      muteBtn.className = "track-mute-btn";
      muteBtn.textContent = "M";
      muteBtn.dataset.action = "mute";

      var soloBtn = document.createElement("button");
      soloBtn.className = "track-solo-btn";
      soloBtn.textContent = "S";
      soloBtn.dataset.action = "solo";

      var vol = document.createElement("input");
      vol.type = "range";
      vol.className = "track-vol";
      vol.min = "0";
      vol.max = "100";
      vol.value = "100";
      vol.dataset.action = "volume";

      var clearBtn = document.createElement("button");
      clearBtn.className = "track-clear-btn";
      clearBtn.textContent = "\u00D7";
      clearBtn.title = "Clear track " + (i + 1);
      clearBtn.dataset.action = "clear";

      strip.appendChild(armBtn);
      strip.appendChild(label);
      strip.appendChild(muteBtn);
      strip.appendChild(soloBtn);
      strip.appendChild(vol);
      strip.appendChild(clearBtn);
      trackStripsEl.appendChild(strip);
    }
  }

  function updateTrackUI() {
    var strips = trackStripsEl.querySelectorAll(".track-strip");
    for (var i = 0; i < strips.length; i++) {
      var t = trackManager.getTrack(i);
      if (!t) continue;
      strips[i].classList.toggle("track-armed", t.armed);
      strips[i].classList.toggle("track-has-data", recorders[i].hasEvents());
      var armBtn = strips[i].querySelector(".track-arm-btn");
      var muteBtn = strips[i].querySelector(".track-mute-btn");
      var soloBtn = strips[i].querySelector(".track-solo-btn");
      if (armBtn) armBtn.classList.toggle("active", t.armed);
      if (muteBtn) muteBtn.classList.toggle("active", t.mute);
      if (soloBtn) soloBtn.classList.toggle("active", t.solo);
    }
  }

  trackStripsEl.addEventListener("click", function(e) {
    var strip = e.target.closest(".track-strip");
    if (!strip) return;
    var idx = parseInt(strip.dataset.track);
    var action = e.target.dataset.action;
    if (action === "arm") {
      var t = trackManager.getTrack(idx);
      trackManager.setArmed(idx, !t.armed);
    } else if (action === "mute") {
      var t2 = trackManager.getTrack(idx);
      trackManager.setMute(idx, !t2.mute);
    } else if (action === "solo") {
      var t3 = trackManager.getTrack(idx);
      trackManager.setSolo(idx, !t3.solo);
    } else if (action === "clear") {
      recorders[idx].clear();
      updateTrackUI();
      updateBarNotes();
      updateExportBtn();
    }
  });

  trackStripsEl.addEventListener("input", function(e) {
    if (e.target.dataset.action === "volume") {
      var strip = e.target.closest(".track-strip");
      if (!strip) return;
      var idx = parseInt(strip.dataset.track);
      trackManager.setVolume(idx, parseInt(e.target.value) / 100);
    }
  });

  buildTrackStrips();
  updateTrackUI();
  updateTrackGains();

  /* ── Spectrum visualizer (amber palette) ── */
  var vizCanvas = document.getElementById("vizCanvas");
  var vizCtx = vizCanvas.getContext("2d");
  var vizDisposed = false;
  var freqDomain = new Uint8Array(analyser.frequencyBinCount);
  var NUM_BANDS = 48;
  var smoothed = new Float64Array(NUM_BANDS);
  var dpr = window.devicePixelRatio || 1;

  function resizeViz() {
    var rect = vizCanvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    vizCanvas.width = Math.round(rect.width * dpr);
    vizCanvas.height = Math.round(rect.height * dpr);
    vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSmoothPath(ctx, pts) {
    if (pts.length < 2) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
    for (var i = 0; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) * 0.5;
      var my = (pts[i].y + pts[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  /* Per-waveform color palettes: [lowR, lowG, lowB, midR, midG, midB, hiR, hiG, hiB] */
  var VIZ_COLORS = {
    "sine":     [8,20,60,  30,90,200,  160,220,255],
    "sawtooth": [40,20,5,  200,90,20,  255,200,80],
    "square":   [5,30,15,  20,140,60,  100,255,160],
    "triangle": [35,30,5,  180,160,20, 255,240,120]
  };

  function drawViz() {
    if (vizDisposed) return;
    requestAnimationFrame(drawViz);
    var w = vizCanvas.width / dpr;
    var h = vizCanvas.height / dpr;
    vizCtx.clearRect(0, 0, w, h);
    analyser.getByteFrequencyData(freqDomain);

    var energy = 0;
    for (var i = 0; i < NUM_BANDS; i++) {
      var lo = Math.floor(Math.pow(freqDomain.length, i / NUM_BANDS));
      var hi = Math.max(lo + 1, Math.ceil(Math.pow(freqDomain.length, (i + 1) / NUM_BANDS)));
      var sum = 0, cnt = 0;
      for (var j = lo; j < hi && j < freqDomain.length; j++) { sum += freqDomain[j]; cnt++; }
      var raw = cnt > 0 ? sum / cnt / 255 : 0;
      smoothed[i] = smoothed[i] * 0.82 + raw * 0.18;
      energy += smoothed[i];
    }
    energy = Math.min(1, energy / NUM_BANDS * 2);

    var pts = [];
    for (var i2 = 0; i2 < NUM_BANDS; i2++) {
      pts.push({ x: (i2 / (NUM_BANDS - 1)) * w, y: h - smoothed[i2] * h * 0.88 });
    }

    /* Per-waveform color with analog glow */
    var e2 = energy * energy;
    var vc = VIZ_COLORS[trackSettings[currentEditTrack].waveform] || VIZ_COLORS["sine"];
    var lo = [vc[0], vc[1], vc[2]];
    var md = [vc[3], vc[4], vc[5]];
    var hi = [vc[6], vc[7], vc[8]];

    function cr(base, boost) { return Math.min(255, Math.round(base + e2 * boost)); }

    /* Layer 1: wide ambient backlight glow */
    vizCtx.save();
    vizCtx.shadowColor = "rgba(" + cr(md[0], 30) + ", " + cr(md[1], 40) + ", " + cr(md[2], 30) + ", " + (0.25 + energy * 0.45) + ")";
    vizCtx.shadowBlur = 28 + energy * 12;
    vizCtx.beginPath(); vizCtx.moveTo(0, h);
    drawSmoothPath(vizCtx, pts);
    vizCtx.lineTo(w, h); vizCtx.closePath();
    vizCtx.fillStyle = "rgba(" + lo[0] + ", " + lo[1] + ", " + lo[2] + ", 0.08)";
    vizCtx.fill();
    vizCtx.restore();

    /* Layer 2: main fill (vertical: dark base → mid → bright peak) */
    var mainGrad = vizCtx.createLinearGradient(0, h, 0, 0);
    mainGrad.addColorStop(0, "rgba(" + lo[0] + ", " + lo[1] + ", " + lo[2] + ", 0)");
    mainGrad.addColorStop(0.15, "rgba(" + cr(lo[0], 15) + ", " + cr(lo[1], 20) + ", " + cr(lo[2], 15) + ", " + (0.12 + energy * 0.15) + ")");
    mainGrad.addColorStop(0.35, "rgba(" + cr(lo[0] + 10, 20) + ", " + cr(lo[1] + 20, 40) + ", " + cr(lo[2] + 10, 20) + ", " + (0.2 + energy * 0.2) + ")");
    mainGrad.addColorStop(0.55, "rgba(" + cr(md[0], 30) + ", " + cr(md[1], 40) + ", " + cr(md[2], 30) + ", " + (0.25 + energy * 0.25) + ")");
    mainGrad.addColorStop(0.75, "rgba(" + cr(md[0] + 20, 40) + ", " + cr(md[1] + 30, 40) + ", " + cr(md[2] + 20, 30) + ", " + (0.35 + energy * 0.3) + ")");
    mainGrad.addColorStop(0.9, "rgba(" + cr(hi[0] - 40, 40) + ", " + cr(hi[1] - 20, 30) + ", " + cr(hi[2] - 20, 25) + ", " + (0.45 + energy * 0.3) + ")");
    mainGrad.addColorStop(1, "rgba(" + cr(hi[0], 30) + ", " + cr(hi[1], 20) + ", " + cr(hi[2], 15) + ", " + (0.55 + energy * 0.35) + ")");
    vizCtx.beginPath(); vizCtx.moveTo(0, h);
    drawSmoothPath(vizCtx, pts);
    vizCtx.lineTo(w, h); vizCtx.closePath();
    vizCtx.fillStyle = mainGrad;
    vizCtx.fill();

    /* Layer 3: bright edge line with analog tube glow */
    var lineAlpha = 0.6 + energy * 0.4;
    vizCtx.save();
    vizCtx.shadowColor = "rgba(" + cr(hi[0] - 40, 50) + ", " + cr(hi[1] - 30, 40) + ", " + cr(hi[2] - 20, 30) + ", " + (0.4 + energy * 0.5) + ")";
    vizCtx.shadowBlur = 14 + energy * 10;
    var lineGrad = vizCtx.createLinearGradient(0, h, 0, 0);
    lineGrad.addColorStop(0, "rgba(" + md[0] + ", " + md[1] + ", " + md[2] + ", " + (lineAlpha * 0.4) + ")");
    lineGrad.addColorStop(0.4, "rgba(" + cr(md[0] + 20, 40) + ", " + cr(md[1] + 30, 40) + ", " + cr(md[2] + 20, 30) + ", " + lineAlpha + ")");
    lineGrad.addColorStop(0.7, "rgba(" + cr(hi[0] - 30, 50) + ", " + cr(hi[1] - 10, 30) + ", " + cr(hi[2], 20) + ", " + lineAlpha + ")");
    lineGrad.addColorStop(1, "rgba(" + cr(hi[0], 30) + ", " + cr(hi[1], 20) + ", " + cr(hi[2], 15) + ", " + lineAlpha + ")");
    vizCtx.beginPath();
    drawSmoothPath(vizCtx, pts);
    vizCtx.strokeStyle = lineGrad;
    vizCtx.lineWidth = 2;
    vizCtx.stroke();
    vizCtx.restore();

    /* Layer 4: bloom glow pass */
    vizCtx.save();
    vizCtx.globalAlpha = 0.15 + energy * 0.2;
    vizCtx.filter = "blur(6px)";
    vizCtx.beginPath();
    drawSmoothPath(vizCtx, pts);
    vizCtx.strokeStyle = "rgba(" + cr(hi[0] - 60, 40) + ", " + cr(hi[1] - 30, 30) + ", " + cr(hi[2], 20) + ", 0.8)";
    vizCtx.lineWidth = 4;
    vizCtx.stroke();
    vizCtx.restore();

    /* Layer 5: reflection */
    vizCtx.save();
    vizCtx.globalAlpha = 0.06 + energy * 0.05;
    vizCtx.translate(0, h);
    vizCtx.scale(1, -0.35);
    vizCtx.beginPath(); vizCtx.moveTo(0, h);
    drawSmoothPath(vizCtx, pts);
    vizCtx.lineTo(w, h); vizCtx.closePath();
    vizCtx.fillStyle = mainGrad;
    vizCtx.fill();
    vizCtx.restore();
  }

  resizeViz();
  var vizRO = new ResizeObserver(resizeViz);
  vizRO.observe(vizCanvas);
  drawViz();

  /* ── Presets ── */
  var presets = [null, null, null, null];
  var activePreset = -1;

  function getAllSettings() {
    var tracks = [];
    for (var i = 0; i < NUM_TRACKS; i++) {
      var ts = trackSettings[i];
      tracks.push({ waveform: ts.waveform, attack: ts.attack, release: ts.release, filter: ts.filter, resonance: ts.resonance, vibratoDepth: ts.vibratoDepth, vibratoRate: ts.vibratoRate, reverb: ts.reverb });
    }
    return {
      version: 2,
      tracks: tracks,
      volume: knobVolume.get(),
      octave: octave,
      transpose: transpose
    };
  }

  function applyAllSettings(s) {
    if (s.version === 2 && s.tracks) {
      /* New format: per-track settings */
      for (var i = 0; i < NUM_TRACKS && i < s.tracks.length; i++) {
        var ts = s.tracks[i];
        trackSettings[i] = { waveform: ts.waveform, attack: ts.attack, release: ts.release, filter: ts.filter, resonance: ts.resonance, vibratoDepth: ts.vibratoDepth || 0, vibratoRate: ts.vibratoRate || 0, reverb: ts.reverb || 0 };
        reverbSends[i].gain.value = trackSettings[i].reverb;
      }
    } else {
      /* Legacy format: apply to current edit track */
      var leg = {
        waveform: s.waveform || "sawtooth",
        attack: s.attack || 0.01,
        release: s.release || 0.3,
        filter: s.filter || 2000,
        resonance: s.resonance || 5,
        vibratoDepth: s.vibrato || 0,
        vibratoRate: s.vibrato > 0 ? 4 + s.vibrato * 4 : 0,
        reverb: s.reverb || 0
      };
      trackSettings[currentEditTrack] = leg;
      reverbSends[currentEditTrack].gain.value = leg.reverb;
    }
    if (typeof s.volume === "number") { knobVolume.set(s.volume); }
    if (typeof s.octave === "number") { octave = s.octave; }
    if (typeof s.transpose === "number") { transpose = s.transpose; document.getElementById("keySelect").value = transpose; }
    updateOctaveDisplay();
    loadKnobsFromTrack(currentEditTrack);
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
      applyAllSettings(presets[idx]);
      activePreset = idx;
    }
    updatePresetUI();
  });

  document.getElementById("presetRow").addEventListener("contextmenu", function(e) {
    var btn = e.target.closest(".preset-slot");
    if (!btn) return;
    e.preventDefault();
    var idx = parseInt(btn.dataset.slot);
    presets[idx] = null;
    if (activePreset === idx) activePreset = -1;
    updatePresetUI();
  });

  updatePresetUI();

  /* ── Auto-focus for keyboard input ── */
  document.body.tabIndex = -1;
  document.body.focus();

  /* ── Dispose ── */
  prvctice.onDispose(function() {
    cancelCountIn();
    vizDisposed = true;
    vizRO.disconnect();
    transport.dispose();
    for (var i = 0; i < NUM_TRACKS; i++) {
      recorders[i].dispose();
    }
    piano.dispose();
    knobAttack.dispose();
    knobRelease.dispose();
    knobVolume.dispose();
    knobFilter.dispose();
    knobRes.dispose();
    knobVibrato.dispose();
    knobReverb.dispose();
    Object.keys(activeNotes).forEach(function(k) { stopNote(parseInt(k)); });
    Object.keys(playbackNotes).forEach(function(k) {
      var pn = playbackNotes[k];
      try { pn.osc.stop(); } catch(e) {}
    });
    audioContext.close();
  });
});
<` +
  `/script>
</html>`;
