/**
 * Mixer HTML Build — DAW-style multitrack timeline
 *
 * Vertical channel strips + a proper DAW timeline: time ruler, per-track
 * waveform clips positioned at their recorded start offset, moving playhead,
 * zoom controls, and ruler-click-to-seek.
 *
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 * Uses UIKit tokens and terminal aesthetic.
 */

export const MIXER_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>

/* ── Console layout ── */
.mx-console {
  display: flex; gap: 4px; flex: 1; overflow-x: auto; overflow-y: hidden;
  padding: 0 4px; align-items: stretch; min-height: 120px;
}

/* ── Vertical channel strip ── */
.mx-strip {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 6px 6px; min-width: 52px; width: 56px; flex-shrink: 0;
  border: 1px solid var(--p-border); border-radius: var(--p-radius-sm);
  background: var(--p-surface);
}
.mx-strip.master {
  border-style: dashed;
  border-color: rgba(68, 136, 255, 0.2);
  min-width: 56px;
}
.mx-strip-label {
  font-size: 8px; font-family: var(--p-font-mono); font-weight: 700;
  color: var(--p-text-secondary); text-transform: uppercase;
  letter-spacing: 0.06em; text-align: center;
  max-width: 48px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── R / M / S buttons ── */
.mx-btns { display: flex; gap: 2px; flex-shrink: 0; }
.mx-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-border); font-size: 7px; font-family: var(--p-font-mono);
  font-weight: 700; color: var(--p-text-muted); flex-shrink: 0;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.mx-btn:hover { background: var(--p-border); }
.mx-btn.active-r { color: var(--p-danger); border-color: var(--p-danger); background: rgba(239, 68, 68, 0.08); }
.mx-btn.active-m { color: var(--p-accent-amber); border-color: var(--p-accent-amber); background: rgba(255, 107, 43, 0.08); }
.mx-btn.active-s { color: var(--p-accent-blue); border-color: var(--p-accent-blue); background: rgba(68, 136, 255, 0.08); }

/* ── Vertical fader ── */
.mx-fader-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  position: relative; width: 100%; min-height: 60px;
}
.mx-fader-groove {
  position: absolute; top: 4px; bottom: 4px; left: 50%;
  width: 3px; transform: translateX(-50%);
  border-radius: 2px; background: var(--p-border);
}
.mx-fader-fill {
  position: absolute; bottom: 4px; left: 50%;
  width: 3px; transform: translateX(-50%);
  border-radius: 2px; background: var(--p-accent-blue);
  transition: height 60ms ease;
}
.mx-fader {
  writing-mode: vertical-lr; direction: rtl;
  -webkit-appearance: none; appearance: none;
  width: 28px; height: 100%; margin: 0; padding: 0;
  background: transparent; cursor: pointer;
  position: relative; z-index: 1;
}
.mx-fader::-webkit-slider-runnable-track {
  background: transparent; border: none;
}
.mx-fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px; height: 10px; border-radius: 2px;
  background: linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1));
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  cursor: grab;
}
.mx-fader-val {
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-secondary); text-align: center; flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* ── Pan ── */
.mx-pan-wrap {
  display: flex; align-items: center; gap: 1px; flex-shrink: 0;
}
.mx-pan-label {
  font-size: 6px; font-family: var(--p-font-mono); font-weight: 700;
  color: var(--p-text-muted); text-transform: uppercase;
}
.mx-pan {
  -webkit-appearance: none; appearance: none;
  width: 32px; height: 10px; background: transparent; cursor: pointer;
}
.mx-pan::-webkit-slider-thumb {
  -webkit-appearance: none; width: 8px; height: 8px;
  border-radius: 50%; background: var(--p-text-secondary);
  border: 1px solid rgba(255,255,255,0.1); cursor: grab;
}
.mx-pan::-webkit-slider-runnable-track {
  height: 2px; border-radius: 1px; background: var(--p-border);
}

/* ── VU meter ── */
.mx-vu-wrap {
  width: 100%; height: 4px; border-radius: 2px; background: var(--p-border);
  overflow: hidden; flex-shrink: 0; margin-top: 2px;
}
.mx-vu-fill {
  height: 100%; width: 0%; border-radius: 2px;
  background: var(--p-accent-green);
  transition: width 60ms linear;
}
.mx-vu-fill.mid { background: var(--p-accent-amber); }
.mx-vu-fill.peak { background: var(--p-danger); }

/* ── Empty state ── */
.mx-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--p-text-muted); font-size: 11px; font-family: var(--p-font-mono);
  text-align: center;
}

/* ── Transport bar ── */
.mx-transport {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; flex-shrink: 0;
  border-top: 1px solid var(--p-border); flex-wrap: wrap;
}
.mx-tbtn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  gap: 3px; padding: 3px 8px; border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-border); background: var(--p-surface);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); transition: all var(--p-duration-fast) var(--p-ease);
  flex-shrink: 0;
}
.mx-tbtn:hover { background: var(--p-border); color: var(--p-text); }
.mx-tbtn.active-rec { color: var(--p-danger); border-color: var(--p-danger); background: rgba(239, 68, 68, 0.06); }
.mx-tbtn.active-play { color: var(--p-accent-blue); border-color: var(--p-accent-blue); background: rgba(68, 136, 255, 0.06); }
.mx-tbtn.active-metro { color: var(--p-accent-amber); border-color: var(--p-accent-amber); background: rgba(255, 107, 43, 0.06); }
.mx-tbtn.active-loop { color: var(--p-accent-amber); border-color: var(--p-accent-amber); background: rgba(255, 107, 43, 0.06); }

.mx-rec-dot {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor;
}
.mx-tbtn.active-rec .mx-rec-dot {
  animation: mx-pulse 1s ease-in-out infinite;
}
@keyframes mx-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

.mx-timecode {
  font-size: 12px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text); min-width: 56px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.mx-bpm-wrap { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.mx-bpm-input {
  width: 36px; padding: 2px 4px; text-align: center;
  border-radius: var(--p-radius-sm); border: 1px solid var(--p-border);
  background: var(--p-surface); color: var(--p-text);
  font-size: 10px; font-family: var(--p-font-mono); outline: none;
}
.mx-bpm-input:focus { border-color: var(--p-accent-blue); }

.mx-metro-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--p-text-muted); opacity: 0.3;
  transition: opacity 60ms ease, background 60ms ease;
}
.mx-metro-dot.tick {
  background: var(--p-accent-amber); opacity: 1;
  box-shadow: 0 0 8px rgba(255, 107, 43, 0.5);
}

/* ── Format select ── */
.mx-fmt-sel {
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-secondary); border-radius: var(--p-radius-sm);
  font-size: 9px; font-family: var(--p-font-mono);
  padding: 2px 4px; outline: none; cursor: pointer; flex-shrink: 0;
}
.mx-fmt-sel:focus { border-color: var(--p-accent-blue); }

/* ── Master knobs row ── */
.mx-master-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; flex-shrink: 0;
  border-bottom: 1px solid var(--p-border);
}
.mx-master-knobs {
  display: flex; gap: 4px; align-items: flex-start;
}
.mx-preset-row {
  display: flex; gap: 4px; flex: 1; justify-content: flex-end;
}
.mx-preset-slot {
  all: unset; cursor: pointer; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--p-radius-sm); border: 1px dashed var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted);
  transition: all var(--p-duration-fast) var(--p-ease);
}
.mx-preset-slot:hover { background: var(--p-surface); border-color: var(--p-text-muted); }
.mx-preset-slot.filled { border-style: solid; color: var(--p-accent-green); }
.mx-preset-slot.active { border-color: var(--p-accent-green); color: var(--p-accent-green); background: rgba(46, 125, 66, 0.08); box-shadow: 0 0 6px rgba(46, 125, 66, 0.2); }
.mx-pre-label { font-size: 8px; font-family: var(--p-font-mono); font-weight: 700; color: var(--p-text-muted); letter-spacing: 0.06em; }

.mx-spacer { flex: 1; }

/* ═══════════════════════════════════════════════════
   DAW TIMELINE
═══════════════════════════════════════════════════ */

.mx-timeline {
  display: flex; flex-shrink: 0; overflow: hidden;
  border-bottom: 1px solid var(--p-border);
  /* height set dynamically by JS based on track count */
}

/* left panel: track headers */
.mx-tl-left {
  width: 112px; flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--p-border);
  overflow-y: scroll; /* scrolled by JS sync */
  scrollbar-width: none; -ms-overflow-style: none;
  background: var(--p-surface);
  z-index: 2;
}
.mx-tl-left::-webkit-scrollbar { display: none; }

/* corner: zoom controls */
.mx-tl-corner {
  height: 20px; flex-shrink: 0;
  display: flex; align-items: center; gap: 4px;
  padding: 0 6px;
  border-bottom: 1px solid var(--p-border);
  background: var(--p-surface);
}
.mx-zoom-btn {
  all: unset; cursor: pointer; width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--p-radius-sm); border: 1px solid var(--p-border);
  font-size: 11px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  line-height: 1;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.mx-zoom-btn:hover { background: var(--p-border); color: var(--p-text); }
.mx-zoom-label {
  font-size: 8px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  flex: 1; text-align: center;
}

/* track header row in left panel */
.mx-tl-hdr {
  height: 50px; flex-shrink: 0;
  display: flex; align-items: center; gap: 3px;
  padding: 0 6px;
  border-bottom: 1px solid var(--p-border);
  background: var(--p-surface);
}
.mx-tl-name {
  flex: 1; font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.mx-tl-hdr.muted .mx-tl-name { color: var(--p-text-muted); }

/* track control buttons in header */
.mx-track-btn {
  all: unset; cursor: pointer; font-size: 7px; font-family: var(--p-font-mono);
  font-weight: 700; width: 16px; height: 16px; display: flex;
  align-items: center; justify-content: center;
  border-radius: var(--p-radius-sm); border: 1px solid var(--p-border);
  color: var(--p-text-muted); flex-shrink: 0;
  transition: all var(--p-duration-fast) var(--p-ease);
}
.mx-track-btn:hover { background: var(--p-border); color: var(--p-text); }
.mx-track-btn.muted { color: var(--p-accent-amber); border-color: var(--p-accent-amber); background: rgba(255,107,43,0.08); }

/* right panel: scrollable timeline */
.mx-tl-right {
  flex: 1; overflow: auto; position: relative;
  cursor: crosshair;
}

/* time ruler */
.mx-ruler {
  height: 20px; flex-shrink: 0; position: relative;
  background: var(--p-surface);
  border-bottom: 1px solid var(--p-border);
  z-index: 3;
}

/* track lane rows in right panel */
.mx-tl-lane {
  height: 50px; position: relative;
  border-bottom: 1px solid var(--p-border);
}
.mx-tl-lane.muted { opacity: 0.5; }

/* waveform clip */
.mx-clip {
  position: absolute; top: 4px; bottom: 4px;
  border-radius: var(--p-radius-sm);
  background: rgba(68, 136, 255, 0.15);
  border: 1px solid rgba(68, 136, 255, 0.35);
  overflow: hidden; cursor: default;
  min-width: 4px;
}
.mx-tl-lane.muted .mx-clip {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.1);
}

.mx-clip-label {
  position: absolute; top: 2px; left: 4px; right: 4px;
  font-size: 8px; font-family: var(--p-font-mono); font-weight: 600;
  color: rgba(68, 136, 255, 0.9);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  pointer-events: none; z-index: 1;
}

.mx-clip canvas {
  position: absolute; bottom: 0; left: 0; right: 0;
  width: 100%; height: 30px;
  display: block;
}

/* playhead */
.mx-playhead {
  position: absolute; top: 0; bottom: 0; left: 0;
  width: 2px; background: var(--p-danger);
  pointer-events: none; z-index: 5;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
}

/* lanes wrap contains playhead + lanes */
.mx-tl-lanes-wrap {
  position: relative;
}

/* rec dot during recording — red line at playhead */
.mx-rec-in-progress .mx-playhead {
  background: var(--p-danger);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.7);
}

</style>
</head>
<body class="p-stack full gap-1" style="padding:6px 4px 4px;overflow:hidden">

  <!-- Header -->
  <div class="p-row gap-2" style="align-items:center;padding:0 4px;flex-shrink:0">
    <span class="p-label-tech">MIXER</span>
    <span class="mx-spacer"></span>
    <span class="p-label-tech" id="status" style="color:var(--p-text-muted)">0 CH</span>
  </div>

  <!-- Master knobs + presets -->
  <div class="mx-master-row" id="masterRow">
    <div class="mx-master-knobs" id="masterKnobs"></div>
    <span class="mx-pre-label">PRE</span>
    <div class="mx-preset-row" id="presetRow">
      <button class="mx-preset-slot" data-slot="0">1</button>
      <button class="mx-preset-slot" data-slot="1">2</button>
      <button class="mx-preset-slot" data-slot="2">3</button>
      <button class="mx-preset-slot" data-slot="3">4</button>
    </div>
  </div>

  <!-- DAW Timeline (shown when tracks exist) -->
  <div class="mx-timeline" id="timeline" style="display:none">
    <!-- left: track headers -->
    <div class="mx-tl-left" id="tlLeft">
      <div class="mx-tl-corner">
        <button class="mx-zoom-btn" id="zoomOut">-</button>
        <span class="mx-zoom-label" id="zoomLabel">60</span>
        <button class="mx-zoom-btn" id="zoomIn">+</button>
      </div>
      <!-- track headers appended by JS -->
    </div>
    <!-- right: scrollable content -->
    <div class="mx-tl-right" id="tlRight">
      <div class="mx-ruler" id="tlRuler"></div>
      <div class="mx-tl-lanes-wrap" id="tlLanesWrap">
        <div class="mx-playhead" id="playhead"></div>
        <!-- track lanes appended by JS -->
      </div>
    </div>
  </div>

  <!-- Console: vertical channel strips -->
  <div class="mx-console" id="console">
    <div class="mx-empty" id="empty">Waiting for instruments...</div>
  </div>

  <!-- Transport bar -->
  <div class="mx-transport">
    <button class="mx-tbtn" id="recBtn"><span class="mx-rec-dot"></span> REC</button>
    <button class="mx-tbtn" id="playBtn">\u25B6</button>
    <button class="mx-tbtn" id="stopBtn">\u25A0</button>
    <span class="mx-timecode" id="timecode">0:00.0</span>
    <div class="mx-bpm-wrap">
      <input class="mx-bpm-input" id="bpmInput" type="text" value="120" inputmode="numeric" maxlength="3">
      <span class="p-label-tech">BPM</span>
    </div>
    <button class="mx-tbtn" id="metroBtn"><span class="mx-metro-dot" id="metroDot"></span> M</button>
    <button class="mx-tbtn" id="loopBtn">L</button>
    <span class="mx-spacer"></span>
    <button class="mx-tbtn" id="exportBtn" style="display:none">\u2193 EXPORT</button>
    <button class="mx-tbtn" id="clearBtn" style="display:none">CLR</button>
  </div>

</body>
<script>prvctice.onReady(function() {

  /* ── DOM refs ── */
  var consoleEl   = document.getElementById("console");
  var emptyEl     = document.getElementById("empty");
  var statusEl    = document.getElementById("status");
  var recBtn      = document.getElementById("recBtn");
  var playBtn     = document.getElementById("playBtn");
  var stopBtn     = document.getElementById("stopBtn");
  var timecodeEl  = document.getElementById("timecode");
  var bpmInput    = document.getElementById("bpmInput");
  var metroBtn    = document.getElementById("metroBtn");
  var metroDot    = document.getElementById("metroDot");
  var loopBtn     = document.getElementById("loopBtn");
  var exportBtn   = document.getElementById("exportBtn");
  var clearBtn    = document.getElementById("clearBtn");
  var timelineEl  = document.getElementById("timeline");
  var tlLeft      = document.getElementById("tlLeft");
  var tlRight     = document.getElementById("tlRight");
  var tlRuler     = document.getElementById("tlRuler");
  var tlLanesWrap = document.getElementById("tlLanesWrap");
  var playheadEl  = document.getElementById("playhead");
  var zoomInBtn   = document.getElementById("zoomIn");
  var zoomOutBtn  = document.getElementById("zoomOut");
  var zoomLabel   = document.getElementById("zoomLabel");

  /* ── State ── */
  var state = null;
  var pxPerSec = 60;
  var waveformCache = {};   /* trackId -> Array of peak values 0-1 */
  var timeInterval = null;
  var vuInterval = null;

  /* ── Utilities ── */
  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  function formatRulerTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function totalDur(tracks) {
    var max = 0;
    for (var i = 0; i < tracks.length; i++) {
      var end = tracks[i].startOffset + tracks[i].duration;
      if (end > max) max = end;
    }
    return Math.max(max + 4, 10);
  }

  function findTrack(trackId) {
    if (!state || !state.tracks) return null;
    for (var i = 0; i < state.tracks.length; i++) {
      if (state.tracks[i].id === trackId) return state.tracks[i];
    }
    return null;
  }

  function findChannel(chId) {
    if (!state || !state.channels) return null;
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].channelId === chId) return state.channels[i];
    }
    return null;
  }

  /* ── Waveform: downsample AudioBuffer to peaks array ── */
  function downsample(audioBuf, targetSamples) {
    var channelData = audioBuf.getChannelData(0);
    var total = channelData.length;
    var block = Math.max(1, Math.floor(total / targetSamples));
    var peaks = [];
    for (var i = 0; i < targetSamples; i++) {
      var start = i * block;
      var max = 0;
      for (var j = 0; j < block && (start + j) < total; j++) {
        var v = channelData[start + j];
        if (v < 0) v = -v;
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    return peaks;
  }

  /* ── Draw waveform peaks onto a canvas element ── */
  function drawWaveformOnCanvas(canvas, peaks) {
    if (!canvas || !peaks || peaks.length === 0) return;
    var w = canvas.width;
    var h = canvas.height;
    if (w === 0 || h === 0) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    var mid = h / 2;
    var barW = Math.max(1, w / peaks.length);
    ctx.fillStyle = "rgba(68, 136, 255, 0.65)";
    for (var i = 0; i < peaks.length; i++) {
      var x = (i / peaks.length) * w;
      var bh = Math.max(1, peaks[i] * h * 0.95);
      ctx.fillRect(x, mid - bh / 2, barW, bh);
    }
  }

  /* ── Decode base64 WebM audio and cache peaks for a track ── */
  function decodeAndCacheWaveform(trackId, base64Audio) {
    var binary = atob(base64Audio);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    prvctice.audio.buffer.decode(bytes.buffer).then(function(audioBuf) {
      var peaks = downsample(audioBuf, 600);
      waveformCache[trackId] = peaks;
      redrawClipCanvas(trackId);
    }).catch(function() {});
  }

  /* ── Redraw waveform on a specific track's canvas ── */
  function redrawClipCanvas(trackId) {
    var clip = tlLanesWrap.querySelector(".mx-clip[data-tid=\\"" + trackId + "\\"]");
    if (!clip) return;
    var canvas = clip.querySelector("canvas");
    if (!canvas) return;
    var peaks = waveformCache[trackId];
    if (peaks && peaks.length > 0) drawWaveformOnCanvas(canvas, peaks);
  }

  /* ── Fetch audio for tracks that don't have cached waveforms ── */
  function fetchMissingWaveforms(tracks) {
    for (var i = 0; i < tracks.length; i++) {
      (function(trk) {
        if (!waveformCache[trk.id]) {
          prvctice.mixer.exportTrack(trk.id).then(function(result) {
            if (result && result.audio) decodeAndCacheWaveform(trk.id, result.audio);
          }).catch(function() {});
        }
      })(tracks[i]);
    }
  }

  /* ── Render the time ruler ── */
  function renderRuler(maxTime) {
    var innerW = Math.ceil(maxTime * pxPerSec) + 120;
    tlRuler.style.width = innerW + "px";
    tlRuler.innerHTML = "";

    var step = pxPerSec >= 80 ? 1 : pxPerSec >= 30 ? 2 : 5;
    var end = Math.ceil(maxTime) + step * 2;

    for (var t = 0; t <= end; t += step) {
      var x = Math.round(t * pxPerSec);
      var tick = document.createElement("div");
      tick.style.cssText = "position:absolute;left:" + x + "px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:flex-end;gap:0;";

      var line = document.createElement("div");
      line.style.cssText = "width:1px;height:6px;background:rgba(255,255,255,0.18);flex-shrink:0;";
      tick.appendChild(line);

      var lbl = document.createElement("span");
      lbl.style.cssText = "font-size:9px;font-family:var(--p-font-mono);color:var(--p-text-muted);white-space:nowrap;padding-left:3px;line-height:1.1;";
      lbl.textContent = formatRulerTime(t);
      tick.appendChild(lbl);

      tlRuler.appendChild(tick);
    }
  }

  /* ── Create a track header in the left panel ── */
  function createTrackHeader(trk) {
    var d = document.createElement("div");
    d.className = "mx-tl-hdr" + (trk.muted ? " muted" : "");
    d.dataset.tid = trk.id;

    var muteBtn = document.createElement("button");
    muteBtn.className = "mx-track-btn" + (trk.muted ? " muted" : "");
    muteBtn.dataset.role = "mute";
    muteBtn.textContent = "M";
    muteBtn.title = "Mute";
    d.appendChild(muteBtn);

    var nameEl = document.createElement("span");
    nameEl.className = "mx-tl-name";
    nameEl.dataset.role = "name";
    nameEl.textContent = trk.name;
    nameEl.title = trk.name;
    d.appendChild(nameEl);

    var delBtn = document.createElement("button");
    delBtn.className = "mx-track-btn";
    delBtn.dataset.role = "del";
    delBtn.textContent = "x";
    delBtn.title = "Delete";
    d.appendChild(delBtn);

    muteBtn.addEventListener("click", function() {
      var cur = findTrack(trk.id);
      prvctice.mixer.setTrackMute(trk.id, cur ? !cur.muted : true);
    });
    delBtn.addEventListener("click", function() {
      prvctice.mixer.removeTrack(trk.id);
      delete waveformCache[trk.id];
    });

    return d;
  }

  /* ── Create a waveform clip element for a track ── */
  function createClipEl(trk) {
    var clip = document.createElement("div");
    clip.className = "mx-clip";
    clip.dataset.tid = trk.id;
    clip.style.left = Math.round(trk.startOffset * pxPerSec) + "px";
    var clipW = Math.max(4, Math.round(trk.duration * pxPerSec));
    clip.style.width = clipW + "px";

    var lbl = document.createElement("div");
    lbl.className = "mx-clip-label";
    lbl.textContent = trk.name;
    clip.appendChild(lbl);

    var canvas = document.createElement("canvas");
    canvas.width = clipW;
    canvas.height = 30;
    clip.appendChild(canvas);

    /* Draw waveform if already cached */
    if (waveformCache[trk.id]) {
      drawWaveformOnCanvas(canvas, waveformCache[trk.id]);
    }

    return clip;
  }

  /* ── Create a track lane row in the right panel ── */
  function createLaneEl(trk) {
    var lane = document.createElement("div");
    lane.className = "mx-tl-lane" + (trk.muted ? " muted" : "");
    lane.dataset.tid = trk.id;

    var clip = createClipEl(trk);
    lane.appendChild(clip);

    return lane;
  }

  /* ── Render / reconcile the timeline ── */
  function renderTimeline(tracks) {
    var hasTracks = tracks && tracks.length > 0;

    /* transport controls visibility */
    exportBtn.style.display = hasTracks ? "" : "none";
    clearBtn.style.display = hasTracks ? "" : "none";

    if (!hasTracks) {
      timelineEl.style.display = "none";
      return;
    }

    /* Show timeline, compute height */
    var TRACK_H = 50;
    var RULER_H = 20;
    var visH = Math.min(280, RULER_H + tracks.length * TRACK_H);
    timelineEl.style.display = "flex";
    timelineEl.style.height = visH + "px";
    tlLeft.style.height = visH + "px";

    var maxTime = totalDur(tracks);
    var innerW = Math.ceil(maxTime * pxPerSec) + 120;

    /* Ruler */
    renderRuler(maxTime);

    /* Set lane wrap width */
    tlLanesWrap.style.width = innerW + "px";

    /* Reconcile left headers */
    var existHdrs = {};
    var hdrEls = tlLeft.querySelectorAll(".mx-tl-hdr[data-tid]");
    for (var hi = 0; hi < hdrEls.length; hi++) existHdrs[hdrEls[hi].dataset.tid] = hdrEls[hi];

    /* Reconcile right lanes */
    var existLanes = {};
    var laneEls = tlLanesWrap.querySelectorAll(".mx-tl-lane[data-tid]");
    for (var li = 0; li < laneEls.length; li++) existLanes[laneEls[li].dataset.tid] = laneEls[li];

    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];

      /* Header */
      var hdr = existHdrs[t.id];
      if (!hdr) {
        hdr = createTrackHeader(t);
        tlLeft.appendChild(hdr);
      } else {
        hdr.className = "mx-tl-hdr" + (t.muted ? " muted" : "");
        var mb = hdr.querySelector("[data-role='mute']");
        if (mb) mb.className = "mx-track-btn" + (t.muted ? " muted" : "");
      }
      delete existHdrs[t.id];

      /* Lane */
      var lane = existLanes[t.id];
      if (!lane) {
        lane = createLaneEl(t);
        tlLanesWrap.appendChild(lane);
      } else {
        lane.className = "mx-tl-lane" + (t.muted ? " muted" : "");
        /* Update clip position / size (changes on zoom or state) */
        var clip = lane.querySelector(".mx-clip[data-tid=\\"" + t.id + "\\"]");
        if (clip) {
          var newLeft = Math.round(t.startOffset * pxPerSec);
          var newW = Math.max(4, Math.round(t.duration * pxPerSec));
          clip.style.left = newLeft + "px";
          clip.style.width = newW + "px";
          var cv = clip.querySelector("canvas");
          if (cv) {
            cv.width = newW;
            var peaks = waveformCache[t.id];
            if (peaks) drawWaveformOnCanvas(cv, peaks);
          }
        }
      }
      delete existLanes[t.id];
    }

    /* Remove stale */
    for (var hid in existHdrs) { if (existHdrs[hid]) existHdrs[hid].remove(); }
    for (var lid in existLanes) { if (existLanes[lid]) existLanes[lid].remove(); }
  }

  /* ── Update playhead position ── */
  function updatePlayhead(t) {
    var x = Math.round(t * pxPerSec);
    playheadEl.style.left = x + "px";
    /* Auto-scroll right panel to keep playhead visible during playback */
    if (state && state.playing) {
      var sw = tlRight.clientWidth;
      var sl = tlRight.scrollLeft;
      if (x > sl + sw - 80) tlRight.scrollLeft = x - 80;
      else if (x < sl + 20) tlRight.scrollLeft = Math.max(0, x - 20);
    }
  }

  /* ── Scroll sync: tlRight vertical scroll → tlLeft ── */
  tlRight.addEventListener("scroll", function() {
    tlLeft.scrollTop = tlRight.scrollTop;
  });

  /* ── Ruler / lane click to seek ── */
  tlRight.addEventListener("click", function(e) {
    if (e.target.closest(".mx-clip")) return;
    var rect = tlRight.getBoundingClientRect();
    var x = e.clientX - rect.left + tlRight.scrollLeft;
    var seekT = x / pxPerSec;
    prvctice.mixer.seekTransport(seekT);
    updatePlayhead(seekT);
  });

  /* ── Zoom ── */
  function setZoom(newPx) {
    pxPerSec = Math.max(10, Math.min(200, newPx));
    zoomLabel.textContent = pxPerSec;
    if (state && state.tracks && state.tracks.length > 0) {
      renderTimeline(state.tracks);
    }
    updatePlayhead(state && state.transportTime ? state.transportTime : 0);
  }

  zoomInBtn.addEventListener("click", function() { setZoom(pxPerSec + 20); });
  zoomOutBtn.addEventListener("click", function() { setZoom(pxPerSec - 20); });

  /* ── VU meter polling ── */
  function startVuPoll() {
    if (vuInterval) return;
    vuInterval = setInterval(function() {
      if (!state) return;
      prvctice.mixer.getPeakLevels().then(function(levels) {
        if (!levels) return;
        var mvu = document.querySelector(".mx-strip.master .mx-vu-fill");
        if (mvu) setVuBar(mvu, levels.master);
        var strips = document.querySelectorAll(".mx-strip:not(.master)");
        for (var i = 0; i < strips.length; i++) {
          var chId = strips[i].dataset.ch;
          var fill = strips[i].querySelector(".mx-vu-fill");
          if (fill && typeof levels.channels[chId] === "number") {
            setVuBar(fill, levels.channels[chId]);
          }
        }
      }).catch(function() {});
    }, 80);
  }

  function stopVuPoll() {
    if (vuInterval) { clearInterval(vuInterval); vuInterval = null; }
  }

  function setVuBar(el, level) {
    var pct = Math.min(100, Math.round(level * 100));
    el.style.width = pct + "%";
    el.className = "mx-vu-fill" + (pct > 85 ? " peak" : pct > 60 ? " mid" : "");
  }

  /* ── Master knobs ── */
  var fmtInt = function(v) { return Math.round(v) + ""; };
  var masterKnobsEl = document.getElementById("masterKnobs");

  var knobMst = prvctice.ui.knob(masterKnobsEl, {
    min: 0, max: 100, step: 1, value: 80, label: "MST", format: fmtInt,
    onChange: function(v) { prvctice.mixer.setMasterGain(v / 100); }
  });
  var knobVrb = prvctice.ui.knob(masterKnobsEl, {
    min: 0, max: 100, step: 1, value: 0, label: "VRB", format: fmtInt,
    onChange: function() {}
  });

  /* ── Presets ── */
  var presets = [null, null, null, null];
  var activePreset = -1;

  function getAllMixerSettings() {
    if (!state) return null;
    var chSettings = [];
    for (var i = 0; i < state.channels.length; i++) {
      var ch = state.channels[i];
      chSettings.push({ channelId: ch.channelId, gain: ch.gain, pan: ch.pan, mute: ch.mute, solo: ch.solo });
    }
    return { channels: chSettings, masterGain: state.masterGain };
  }

  function applyMixerSettings(s) {
    if (!s) return;
    if (typeof s.masterGain === "number") {
      prvctice.mixer.setMasterGain(s.masterGain);
      knobMst.set(Math.round(s.masterGain * 100));
    }
    if (s.channels) {
      for (var i = 0; i < s.channels.length; i++) {
        var cs = s.channels[i];
        prvctice.mixer.setGain(cs.channelId, cs.gain);
        prvctice.mixer.setPan(cs.channelId, cs.pan);
        prvctice.mixer.setMute(cs.channelId, cs.mute);
        prvctice.mixer.setSolo(cs.channelId, cs.solo);
      }
    }
  }

  function updatePresetUI() {
    var btns = document.querySelectorAll(".mx-preset-slot");
    btns.forEach(function(btn) {
      var idx = parseInt(btn.dataset.slot);
      btn.classList.toggle("filled", presets[idx] !== null);
      btn.classList.toggle("active", idx === activePreset);
    });
  }

  document.getElementById("presetRow").addEventListener("click", function(e) {
    var btn = e.target.closest(".mx-preset-slot");
    if (!btn) return;
    var idx = parseInt(btn.dataset.slot);
    if (presets[idx] === null) {
      presets[idx] = getAllMixerSettings();
      activePreset = idx;
    } else {
      applyMixerSettings(presets[idx]);
      activePreset = idx;
    }
    updatePresetUI();
    prvctice.storage.set("mixer-presets", presets).catch(function() {});
  });

  document.getElementById("presetRow").addEventListener("contextmenu", function(e) {
    var btn = e.target.closest(".mx-preset-slot");
    if (!btn) return;
    e.preventDefault();
    var idx = parseInt(btn.dataset.slot);
    presets[idx] = null;
    if (activePreset === idx) activePreset = -1;
    updatePresetUI();
    prvctice.storage.set("mixer-presets", presets).catch(function() {});
  });

  prvctice.storage.get("mixer-presets").then(function(val) {
    if (val && Array.isArray(val)) { presets = val; updatePresetUI(); }
  }).catch(function() {});

  /* ── Main render ── */
  function render(s) {
    state = s;
    var ch_list = s.channels || [];
    statusEl.textContent = ch_list.length + " CH";

    if (ch_list.length === 0) {
      emptyEl.style.display = "flex";
      var stale = consoleEl.querySelectorAll(".mx-strip:not(.master)");
      for (var ss = 0; ss < stale.length; ss++) stale[ss].remove();
      var mst = consoleEl.querySelector(".mx-strip.master");
      if (mst) mst.remove();
    } else {
      emptyEl.style.display = "none";
    }

    /* Reconcile channel strips */
    var existing = {};
    var strips = consoleEl.querySelectorAll(".mx-strip:not(.master)");
    for (var ei = 0; ei < strips.length; ei++) existing[strips[ei].dataset.ch] = strips[ei];

    var masterEl = consoleEl.querySelector(".mx-strip.master");

    for (var ci = 0; ci < ch_list.length; ci++) {
      var ch = ch_list[ci];
      var strip = existing[ch.channelId];
      if (!strip) {
        strip = createStrip(ch);
        if (masterEl) consoleEl.insertBefore(strip, masterEl);
        else consoleEl.appendChild(strip);
      }
      updateStrip(strip, ch);
      delete existing[ch.channelId];
    }

    for (var rid in existing) { if (existing[rid]) existing[rid].remove(); }

    /* Master strip */
    if (ch_list.length > 0) {
      if (!masterEl) {
        masterEl = createMaster(s);
        consoleEl.appendChild(masterEl);
      } else {
        updateMaster(masterEl, s);
      }
    }

    knobMst.set(Math.round(s.masterGain * 100));

    /* Transport state */
    recBtn.className = "mx-tbtn" + (s.recording ? " active-rec" : "");
    playBtn.className = "mx-tbtn" + (s.playing ? " active-play" : "");
    metroBtn.className = "mx-tbtn" + (s.metronomeEnabled ? " active-metro" : "");
    loopBtn.className = "mx-tbtn" + (s.loopEnabled ? " active-loop" : "");
    bpmInput.value = s.bpm || 120;

    /* Timecode */
    if (typeof s.transportTime === "number") {
      timecodeEl.textContent = formatTime(s.transportTime);
      updatePlayhead(s.transportTime);
    }

    /* Timeline */
    renderTimeline(s.tracks || []);

    /* VU polling */
    if (ch_list.length > 0) startVuPoll();
    else stopVuPoll();

    /* Time poll during playback */
    if (s.playing) startTimePoll();
  }

  /* ── Create vertical channel strip ── */
  function createStrip(ch) {
    var d = document.createElement("div");
    d.className = "mx-strip";
    d.dataset.ch = ch.channelId;

    var label = document.createElement("div");
    label.className = "mx-strip-label";
    label.textContent = ch.appName || "CH";
    d.appendChild(label);

    var btns = document.createElement("div");
    btns.className = "mx-btns";

    var armBtn = document.createElement("button");
    armBtn.className = "mx-btn"; armBtn.textContent = "R";
    armBtn.dataset.role = "arm"; armBtn.title = "Record arm";

    var muteBtn = document.createElement("button");
    muteBtn.className = "mx-btn"; muteBtn.textContent = "M";
    muteBtn.dataset.role = "mute";

    var soloBtn = document.createElement("button");
    soloBtn.className = "mx-btn"; soloBtn.textContent = "S";
    soloBtn.dataset.role = "solo";

    btns.appendChild(armBtn); btns.appendChild(muteBtn); btns.appendChild(soloBtn);
    d.appendChild(btns);

    var fwrap = document.createElement("div");
    fwrap.className = "mx-fader-wrap";

    var groove = document.createElement("div");
    groove.className = "mx-fader-groove";
    fwrap.appendChild(groove);

    var fill = document.createElement("div");
    fill.className = "mx-fader-fill";
    fill.dataset.role = "fill";
    fwrap.appendChild(fill);

    var fader = document.createElement("input");
    fader.type = "range"; fader.className = "mx-fader";
    fader.min = "0"; fader.max = "100"; fader.step = "1"; fader.value = "80";
    fader.dataset.role = "fader";
    fwrap.appendChild(fader);
    d.appendChild(fwrap);

    var val = document.createElement("div");
    val.className = "mx-fader-val"; val.dataset.role = "val"; val.textContent = "80";
    d.appendChild(val);

    var panWrap = document.createElement("div");
    panWrap.className = "mx-pan-wrap";
    var panLabel = document.createElement("span");
    panLabel.className = "mx-pan-label"; panLabel.textContent = "P";
    panWrap.appendChild(panLabel);

    var pan = document.createElement("input");
    pan.type = "range"; pan.className = "mx-pan";
    pan.min = "-100"; pan.max = "100"; pan.step = "1"; pan.value = "0";
    pan.dataset.role = "pan";
    panWrap.appendChild(pan);
    d.appendChild(panWrap);

    var vuWrap = document.createElement("div");
    vuWrap.className = "mx-vu-wrap";
    var vuFill = document.createElement("div");
    vuFill.className = "mx-vu-fill";
    vuWrap.appendChild(vuFill);
    d.appendChild(vuWrap);

    fader.addEventListener("input", function(e) {
      prvctice.mixer.setGain(ch.channelId, Number(e.target.value) / 100);
    });
    pan.addEventListener("input", function(e) {
      prvctice.mixer.setPan(ch.channelId, Number(e.target.value) / 100);
    });
    armBtn.addEventListener("click", function() {
      var cur = findChannel(ch.channelId);
      if (cur) prvctice.mixer.setRecordArm(ch.channelId, !cur.recordArm);
    });
    muteBtn.addEventListener("click", function() {
      var cur = findChannel(ch.channelId);
      if (cur) prvctice.mixer.setMute(ch.channelId, !cur.mute);
    });
    soloBtn.addEventListener("click", function() {
      var cur = findChannel(ch.channelId);
      if (cur) prvctice.mixer.setSolo(ch.channelId, !cur.solo);
    });

    return d;
  }

  function updateStrip(strip, ch) {
    var fader = strip.querySelector("[data-role='fader']");
    var fill = strip.querySelector("[data-role='fill']");
    var val = strip.querySelector("[data-role='val']");
    var pan = strip.querySelector("[data-role='pan']");
    var armBtn = strip.querySelector("[data-role='arm']");
    var muteBtn = strip.querySelector("[data-role='mute']");
    var soloBtn = strip.querySelector("[data-role='solo']");

    var pct = Math.round(ch.gain * 100);
    fader.value = pct;
    var fwrap = fill.parentElement;
    var wrapH = fwrap.offsetHeight - 8;
    fill.style.height = Math.round(ch.gain * wrapH) + "px";
    val.textContent = pct;
    pan.value = Math.round(ch.pan * 100);

    armBtn.className = "mx-btn" + (ch.recordArm ? " active-r" : "");
    muteBtn.className = "mx-btn" + (ch.mute ? " active-m" : "");
    soloBtn.className = "mx-btn" + (ch.solo ? " active-s" : "");
  }

  /* ── Master strip ── */
  function createMaster(s) {
    var d = document.createElement("div");
    d.className = "mx-strip master";

    var label = document.createElement("div");
    label.className = "mx-strip-label"; label.textContent = "MST";
    d.appendChild(label);

    var btns = document.createElement("div");
    btns.className = "mx-btns";
    var muteBtn = document.createElement("button");
    muteBtn.className = "mx-btn"; muteBtn.textContent = "M";
    muteBtn.dataset.role = "mmute";
    btns.appendChild(muteBtn);
    d.appendChild(btns);

    var fwrap = document.createElement("div");
    fwrap.className = "mx-fader-wrap";
    var groove = document.createElement("div");
    groove.className = "mx-fader-groove";
    fwrap.appendChild(groove);
    var fill = document.createElement("div");
    fill.className = "mx-fader-fill"; fill.dataset.role = "mfill";
    fwrap.appendChild(fill);
    var fader = document.createElement("input");
    fader.type = "range"; fader.className = "mx-fader";
    fader.min = "0"; fader.max = "100"; fader.step = "1";
    fader.dataset.role = "mfader";
    fwrap.appendChild(fader);
    d.appendChild(fwrap);

    var val = document.createElement("div");
    val.className = "mx-fader-val"; val.dataset.role = "mval";
    d.appendChild(val);

    var vuWrap = document.createElement("div");
    vuWrap.className = "mx-vu-wrap";
    var vuFill = document.createElement("div");
    vuFill.className = "mx-vu-fill";
    vuWrap.appendChild(vuFill);
    d.appendChild(vuWrap);

    fader.addEventListener("input", function(e) {
      prvctice.mixer.setMasterGain(Number(e.target.value) / 100);
    });
    muteBtn.addEventListener("click", function() {
      if (state) prvctice.mixer.setMasterMute(!state.masterMute);
    });

    updateMaster(d, s);
    return d;
  }

  function updateMaster(el, s) {
    var fader = el.querySelector("[data-role='mfader']");
    var fill = el.querySelector("[data-role='mfill']");
    var val = el.querySelector("[data-role='mval']");
    var muteBtn = el.querySelector("[data-role='mmute']");

    var pct = Math.round(s.masterGain * 100);
    fader.value = pct;
    var fwrap = fill.parentElement;
    var wrapH = fwrap.offsetHeight - 8;
    fill.style.height = Math.round(s.masterGain * wrapH) + "px";
    val.textContent = pct;
    muteBtn.className = "mx-btn" + (s.masterMute ? " active-m" : "");
  }

  /* ── Transport: time poll ── */
  function startTimePoll() {
    if (timeInterval) return;
    timeInterval = setInterval(function() {
      prvctice.mixer.getState().then(function(s) {
        if (!s) return;
        if (typeof s.transportTime === "number") {
          timecodeEl.textContent = formatTime(s.transportTime);
          updatePlayhead(s.transportTime);
        }
        playBtn.className = "mx-tbtn" + (s.playing ? " active-play" : "");
        if (!s.playing) stopTimePoll();
      }).catch(function() {});
    }, 100);
  }

  function stopTimePoll() {
    if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
  }

  /* ── Transport: REC ── */
  recBtn.addEventListener("click", function() {
    if (!state) return;
    if (state.recording) {
      prvctice.mixer.stopRecording().then(function(result) {
        if (result && result.audio && result.trackId) {
          decodeAndCacheWaveform(result.trackId, result.audio);
        }
      }).catch(function() {
        prvctice.ui.toast("Stop recording failed", "error");
      });
    } else {
      prvctice.mixer.startRecording();
    }
  });

  /* ── Transport: PLAY ── */
  playBtn.addEventListener("click", function() {
    if (!state) return;
    if (state.playing) {
      prvctice.mixer.pauseRecording();
      stopTimePoll();
    } else {
      prvctice.mixer.transportPlay();
      startTimePoll();
    }
  });

  /* ── Transport: STOP ── */
  stopBtn.addEventListener("click", function() {
    prvctice.mixer.transportStop();
    stopTimePoll();
    timecodeEl.textContent = "0:00.0";
    updatePlayhead(0);
  });

  /* ── Loop ── */
  loopBtn.addEventListener("click", function() {
    if (!state) return;
    var enabled = !state.loopEnabled;
    if (enabled) {
      var maxDur = state.playbackDuration || 0;
      prvctice.mixer.setLoop(true, 0, maxDur > 0 ? maxDur : 8);
    } else {
      prvctice.mixer.setLoop(false);
    }
  });

  /* ── BPM ── */
  bpmInput.addEventListener("input", function(e) {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
  });
  bpmInput.addEventListener("change", function() {
    var v = parseInt(bpmInput.value) || 120;
    v = Math.max(20, Math.min(300, v));
    bpmInput.value = v;
    prvctice.mixer.setBpm(v);
  });

  /* ── Metronome ── */
  metroBtn.addEventListener("click", function() {
    var enabled = state ? !state.metronomeEnabled : true;
    prvctice.mixer.setMetronome(enabled);
  });

  /* ── Export ── */
  exportBtn.addEventListener("click", function() {
    if (!state || !state.tracks || state.tracks.length === 0) return;
    var tracks = state.tracks;
    prvctice.ui.toast("Exporting " + tracks.length + " track(s)...", "info");
    for (var i = 0; i < tracks.length; i++) {
      (function(trk) {
        prvctice.mixer.exportTrack(trk.id).then(function(result) {
          if (!result || !result.audio) return;
          /* WAV — decode WebM → encode as 16-bit PCM */
          var binary = atob(result.audio);
          var bytes = new Uint8Array(binary.length);
          for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
          prvctice.audio.buffer.decode(bytes.buffer).then(function(audioBuf) {
            var wav = prvctice.audio.encodeWAV(audioBuf);
            return prvctice.audio.bufferToBase64(wav);
          }).then(function(b64) {
            var trackName = trk.name;
            prvctice.fs.saveBlob(b64, "audio/wav", trackName + ".wav").then(function() {
              prvctice.ui.toast(trackName + " saved to Files");
            });
          }).catch(function() {
            prvctice.ui.toast("WAV encode failed for " + trk.name, "error");
          });
          /* WebM — save raw recording to Files as well */
          var webmName = trk.name;
          prvctice.fs.saveBlob(result.audio, "audio/webm", webmName + ".webm").then(function() {
            prvctice.ui.toast(webmName + ".webm saved to Files");
          });
        }).catch(function() {
          prvctice.ui.toast("Export failed for " + trk.name, "error");
        });
      })(tracks[i]);
    }
  });

  /* ── Clear all tracks ── */
  clearBtn.addEventListener("click", function() {
    prvctice.ui.confirm("Clear all tracks?").then(function(ok) {
      if (!ok) return;
      prvctice.mixer.clearAllTracks();
      waveformCache = {};
      stopTimePoll();
      timecodeEl.textContent = "0:00.0";
    }).catch(function() {});
  });

  /* ── State subscription ── */
  prvctice.mixer.subscribeState().then(function(initialState) {
    render(initialState);
    if (initialState.playing) startTimePoll();
    /* Fetch waveforms for any pre-existing tracks */
    if (initialState.tracks && initialState.tracks.length > 0) {
      fetchMissingWaveforms(initialState.tracks);
    }
  });

  prvctice.mixer.onStateChange(function(s) { render(s); });

  /* ── Init ── */
  updatePresetUI();

  /* ── Dispose ── */
  prvctice.onDispose(function() {
    stopTimePoll();
    stopVuPoll();
    knobMst.dispose();
    knobVrb.dispose();
  });

});
` +
  `</script>
</html>`;
