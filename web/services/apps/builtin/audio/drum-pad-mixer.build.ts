/**
 * Drum Pad (Mixer) HTML Build
 *
 * 8-pad percussion instrument (4x2 grid) routed through the host audio
 * engine. Each pad triggers a one-shot tone via prvctice.mixer.tone().
 * Terminal aesthetic with spectrum visualizer and volume knob.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const DRUM_PAD_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Pad grid ── */
.dp-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px; flex: 1; min-height: 0;
}
.dp-pad {
  all: unset; cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
  border-radius: var(--p-radius-md); background: var(--p-surface);
  border: 1px solid var(--p-border); min-height: 60px;
  transition: background 60ms ease, border-color 60ms ease, box-shadow 60ms ease;
  -webkit-user-select: none; user-select: none;
}
.dp-pad:hover { background: var(--p-surface-raised); }
.dp-pad.active {
  background: rgba(68, 136, 255, 0.12);
  border-color: var(--p-accent-blue);
  box-shadow: 0 0 8px rgba(68, 136, 255, 0.25);
}
.dp-pad-label {
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 700;
  color: var(--p-text-secondary); text-transform: uppercase;
  letter-spacing: 0.06em; pointer-events: none;
}
.dp-pad-freq {
  font-size: 7px; font-family: var(--p-font-mono);
  color: var(--p-text-muted); pointer-events: none;
}

/* ── Controls row ── */
.dp-controls {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0; flex-shrink: 0;
}
.dp-spacer { flex: 1; }

/* ── Connection button ── */
.dp-conn-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 8px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); letter-spacing: 0.5px;
  transition: all 100ms ease;
}
.dp-conn-btn:hover { background: var(--p-border); }
.dp-conn-btn.live { color: var(--p-accent-green); border-color: rgba(46, 125, 66, 0.3); }
</style>
</head>
<body class="p-stack pad-2 full gap-1" style="padding-top:6px">
  <!-- Header -->
  <div class="p-terminal-header">
    <span class="p-label-tech">DRUM PAD</span>
    <button class="dp-conn-btn" id="connBtn">...</button>
  </div>

  <!-- Pad grid -->
  <div class="dp-grid" id="padGrid"></div>

  <!-- Controls -->
  <div class="dp-controls">
    <div id="volKnob"></div>
    <span class="dp-spacer"></span>
  </div>

  <!-- Visualizer -->
  <div id="vizContainer" style="height:36px;flex-shrink:0"></div>

  <!-- Footer -->
  <div class="p-split p-feed-meta">
    <span class="p-label-tech" id="lastHit" style="color:var(--p-text-muted)">--</span>
    <span class="p-label-tech" style="color:var(--p-text-muted)" id="hitCount">0 HITS</span>
  </div>
</body>
<script>prvctice.onReady(function() {
  var connBtn = document.getElementById("connBtn");
  var padGrid = document.getElementById("padGrid");
  var lastHitEl = document.getElementById("lastHit");
  var hitCountEl = document.getElementById("hitCount");
  var channelId = null;
  var connected = false;
  var hits = 0;
  var gainLevel = 0.7;

  /* ── Pad definitions ── */
  var pads = [
    { label: "KICK",  freq: 60,   wave: "sine",     dur: 0.3  },
    { label: "SNARE", freq: 200,  wave: "triangle", dur: 0.15 },
    { label: "HAT",   freq: 800,  wave: "square",   dur: 0.05 },
    { label: "TOM",   freq: 120,  wave: "sine",     dur: 0.25 },
    { label: "CLAP",  freq: 400,  wave: "sawtooth", dur: 0.1  },
    { label: "RIM",   freq: 600,  wave: "triangle", dur: 0.08 },
    { label: "BELL",  freq: 540,  wave: "square",   dur: 0.15 },
    { label: "CRASH", freq: 1200, wave: "sawtooth", dur: 0.5  }
  ];

  /* ── Build pads ── */
  for (var i = 0; i < pads.length; i++) {
    var btn = document.createElement("button");
    btn.className = "dp-pad";
    btn.dataset.idx = i;

    var lbl = document.createElement("span");
    lbl.className = "dp-pad-label";
    lbl.textContent = pads[i].label;
    btn.appendChild(lbl);

    var frq = document.createElement("span");
    frq.className = "dp-pad-freq";
    frq.textContent = pads[i].freq + "Hz";
    btn.appendChild(frq);

    padGrid.appendChild(btn);
  }

  /* ── Hit handler ── */
  function hitPad(idx) {
    var p = pads[idx];
    if (!p || !channelId) return;

    prvctice.mixer.tone(p.freq, p.dur, {
      waveform: p.wave,
      gain: gainLevel,
      attack: 0.005,
      release: p.dur * 0.3
    });

    hits++;
    lastHitEl.textContent = p.label;
    hitCountEl.textContent = hits + " HITS";

    /* Flash active */
    var el = padGrid.children[idx];
    if (el) {
      el.classList.add("active");
      setTimeout(function() { el.classList.remove("active"); }, 120);
    }
  }

  /* ── Event delegation ── */
  padGrid.addEventListener("pointerdown", function(e) {
    var btn = e.target.closest(".dp-pad");
    if (!btn) return;
    e.preventDefault();
    hitPad(parseInt(btn.dataset.idx));
  });

  /* ── Volume knob ── */
  var fmtInt = function(v) { return Math.round(v) + ""; };
  var knob = prvctice.ui.knob(document.getElementById("volKnob"), {
    min: 0, max: 100, step: 1, value: 70, label: "VOL", format: fmtInt,
    onChange: function(v) { gainLevel = v / 100; }
  });

  /* ── Connection button ── */
  function setConnectedUI() {
    connBtn.textContent = "LIVE";
    connBtn.className = "dp-conn-btn live";
  }
  function setDisconnectedUI() {
    connBtn.textContent = "CONNECT";
    connBtn.className = "dp-conn-btn";
  }

  function doConnect() {
    prvctice.mixer.connect({ name: "Drum Pad" }).then(function(result) {
      connected = true;
      channelId = result.channelId;
      setConnectedUI();
    }).catch(function() {
      setDisconnectedUI();
    });
  }

  function doDisconnect() {
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
    setDisconnectedUI();
  });

  /* Auto-connect on load */
  doConnect();

  /* ── Spectrum visualizer ── */
  var vizCanvas = null;
  var vizCtx = null;
  var vizEl = document.getElementById("vizContainer");
  var vizW = vizEl.offsetWidth || 340;
  var vizH = 36;

  var canvas = document.createElement("canvas");
  canvas.width = vizW;
  canvas.height = vizH;
  canvas.style.width = "100%";
  canvas.style.height = vizH + "px";
  canvas.style.borderRadius = "var(--p-radius-sm)";
  vizEl.appendChild(canvas);
  vizCanvas = canvas;
  vizCtx = canvas.getContext("2d");

  var vizInterval = setInterval(function() {
    if (!channelId || !vizCtx) return;
    prvctice.mixer.getAnalyserData(channelId).then(function(data) {
      if (!data || !data.frequency) return;
      vizCtx.clearRect(0, 0, vizW, vizH);
      var freq = data.frequency;
      var barCount = 32;
      var barW = vizW / barCount;
      var step = Math.floor(freq.length / barCount);
      for (var b = 0; b < barCount; b++) {
        var val = freq[b * step] / 255;
        var h = val * vizH;
        var r = 68 + val * 187;
        var g = 136 - val * 29;
        var bv = 255 - val * 212;
        vizCtx.fillStyle = "rgba(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(bv) + ",0.7)";
        vizCtx.fillRect(b * barW, vizH - h, barW - 1, h);
      }
    }).catch(function() {});
  }, 100);

  /* ── Keyboard shortcuts ── */
  var keyMap = { "1": 0, "2": 1, "3": 2, "4": 3, "q": 4, "w": 5, "e": 6, "r": 7 };
  prvctice.input.onKeyDown(function(e) {
    var idx = keyMap[e.key];
    if (idx !== undefined) hitPad(idx);
  });

  /* ── Dispose ── */
  prvctice.onDispose(function() {
    clearInterval(vizInterval);
    knob.dispose();
    prvctice.mixer.disconnect();
  });
});
<` +
  `/script>
</html>`;
