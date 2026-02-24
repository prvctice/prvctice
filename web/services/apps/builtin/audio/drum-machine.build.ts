/**
 * Drum Machine HTML Build
 *
 * 16-step sequencer with 8 synthesized drum voices, swing,
 * per-step velocity, 8 pattern banks, transport. All audio
 * routed through the host mixer engine via prvctice.mixer.tone().
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const DRUM_MACHINE_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* -- Step Grid -- */
.dm-grid-wrap { overflow-x: auto; flex: 1; min-height: 0; }
.dm-grid {
  display: grid;
  gap: 3px;
  min-width: 100%;
}
.dm-voice-label {
  font-size: 9px;
  font-family: var(--p-font-mono);
  font-weight: 600;
  color: var(--p-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
  min-width: 40px;
  white-space: nowrap;
}
.dm-step {
  min-width: 24px;
  min-height: 24px;
  border-radius: var(--p-radius-sm);
  background: var(--p-surface);
  border: 1px solid var(--p-border);
  cursor: pointer;
  transition: background 80ms ease, box-shadow 80ms ease, opacity 80ms ease;
  position: relative;
}
.dm-step:hover { background: var(--p-surface-raised); }
.dm-step.on {
  background: var(--p-accent-blue);
  border-color: var(--p-accent-blue);
  box-shadow: 0 0 6px rgba(68, 136, 255, 0.3);
}
.dm-step.on.vel-75 { opacity: 0.8; }
.dm-step.on.vel-50 { opacity: 0.6; }
.dm-step.on.vel-25 { opacity: 0.4; }
.dm-step.current {
  background: var(--p-accent-amber);
  border-color: var(--p-accent-amber);
  box-shadow: 0 0 8px rgba(255, 107, 43, 0.4);
}
.dm-step.on.current {
  background: var(--p-accent-amber);
  border-color: var(--p-accent-amber);
  box-shadow: 0 0 10px rgba(255, 107, 43, 0.5);
}

/* -- Transport -- */
.dm-transport {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.dm-bpm-input {
  width: 44px; padding: 3px 4px; text-align: center;
  border-radius: var(--p-radius-sm); border: 1px solid var(--p-border);
  background: var(--p-surface); color: var(--p-text);
  font-size: 11px; font-family: var(--p-font-mono); outline: none;
}
.dm-bpm-input:focus { border-color: var(--p-accent-blue); box-shadow: 0 0 8px rgba(68, 136, 255, 0.2); }
.dm-position {
  font-size: 11px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text); min-width: 36px; text-align: center;
  font-variant-numeric: tabular-nums;
}

/* -- Banks -- */
.dm-banks { display: flex; gap: 3px; }
.dm-bank-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  width: 26px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 10px; font-family: var(--p-font-mono); font-weight: 600;
  transition: all 100ms ease;
}
.dm-bank-btn:hover { background: var(--p-border); color: var(--p-text); }
.dm-bank-btn.active {
  color: var(--p-accent-green); border-color: var(--p-accent-green);
  background: rgba(46, 125, 66, 0.08);
}

/* -- Step count -- */
.dm-steps-sel { display: flex; gap: 3px; }
.dm-steps-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 6px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  color: var(--p-text-muted); font-size: 10px; font-family: var(--p-font-mono); font-weight: 600;
  transition: all 100ms ease;
}
.dm-steps-btn:hover { background: var(--p-border); color: var(--p-text); }
.dm-steps-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68, 136, 255, 0.08);
}

/* -- Knobs row -- */
.dm-knobs {
  display: flex; justify-content: space-around; align-items: flex-start; gap: 4px;
}

/* -- Connection button -- */
.dm-conn-btn {
  all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 2px 8px; height: 22px; border-radius: var(--p-radius-sm);
  background: var(--p-surface); border: 1px solid var(--p-border);
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  color: var(--p-text-muted); letter-spacing: 0.5px;
  transition: all 100ms ease;
}
.dm-conn-btn:hover { background: var(--p-border); }
.dm-conn-btn.live { color: var(--p-accent-green); border-color: rgba(46, 125, 66, 0.3); }

/* -- Misc -- */
.dm-section-label {
  font-size: 9px; font-family: var(--p-font-mono); color: var(--p-text-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}
</style>
</head>
<body class="p-stack pad-2 full gap-1">

<div class="p-terminal-header">
  <span class="p-label-tech">DRUM MACHINE</span>
  <button class="dm-conn-btn" id="connBtn">...</button>
</div>

<!-- Transport -->
<div class="dm-transport">
  <button class="p-btn p-btn-ghost p-btn-sm" id="playBtn">PLAY</button>
  <button class="p-btn p-btn-ghost p-btn-sm" id="stopBtn">STOP</button>
  <input class="dm-bpm-input" id="bpmInput" type="number" min="40" max="300" value="120">
  <span class="dm-section-label">BPM</span>
  <span class="dm-position" id="posDisplay">--</span>
</div>

<!-- Banks + Step count + Knobs row -->
<div class="p-row" style="gap:8px;align-items:flex-start;flex-wrap:wrap">
  <div>
    <span class="dm-section-label">BANK</span>
    <div class="dm-banks" id="bankRow"></div>
  </div>
  <div>
    <span class="dm-section-label">STEPS</span>
    <div class="dm-steps-sel" id="stepsRow"></div>
  </div>
  <div style="flex:1">
    <div class="dm-knobs" id="knobsRow"></div>
  </div>
</div>

<!-- Step Grid -->
<div class="dm-grid-wrap">
  <div class="dm-grid" id="grid"></div>
</div>

<script>
prvctice.onReady(function() {
  var VOICES = ['KICK', 'SNARE', 'HH-C', 'HH-O', 'CLAP', 'TOM', 'RIM', 'COWB'];
  var VOICE_COUNT = 8;
  var BANK_NAMES = ['A','B','C','D','E','F','G','H'];
  var STEP_COUNTS = [8, 12, 16, 32];

  /* Voice definitions are used by playVoice() below */

  var channelId = null;
  var currentBank = 0;
  var currentStepCount = 16;
  var banks = [];
  var playing = false;
  var currentStep = -1;
  var schedulerInterval = null;
  var bpm = 120;
  var swingAmount = 0;
  var masterVolume = 0.7;
  var swingKnob = null;
  var volKnob = null;

  /* -- Init banks -- */
  function createEmptyBank() {
    var bank = [];
    for (var v = 0; v < VOICE_COUNT; v++) {
      var row = [];
      for (var s = 0; s < 32; s++) {
        row.push({ on: false, velocity: 1.0 });
      }
      bank.push(row);
    }
    return bank;
  }

  function initBanks() {
    for (var i = 0; i < 8; i++) {
      banks.push(createEmptyBank());
    }
  }

  /* -- Load/save storage -- */
  function loadBanks() {
    prvctice.storage.get('drum-banks').then(function(saved) {
      if (saved && Array.isArray(saved) && saved.length === 8) {
        banks = saved;
        renderGrid();
      }
    });
  }

  function saveBanks() {
    prvctice.storage.set('drum-banks', banks);
  }

  /* -- Play a voice through mixer -- */
  /* Uses synthDrumVoice which runs exact 808 synthesis on the host engine */
  var VOICE_NAMES = ['kick', 'snare', 'hihat-closed', 'hihat-open', 'clap', 'tom', 'rim', 'cowbell'];

  function playVoice(voiceIdx, velocity) {
    if (!channelId) return;
    prvctice.mixer.synthDrumVoice(VOICE_NAMES[voiceIdx], velocity * masterVolume);
  }

  /* -- Sequencer -- */
  function getStepDuration() {
    return 60.0 / bpm / 4; // 16th note
  }

  var lastStepTime = 0;

  function scheduleStep(stepIndex) {
    var bank = banks[currentBank];
    for (var v = 0; v < VOICE_COUNT; v++) {
      if (stepIndex < currentStepCount && bank[v][stepIndex].on) {
        playVoice(v, bank[v][stepIndex].velocity);
      }
    }
  }

  function schedulerTick() {
    var now = performance.now();
    var stepDur = getStepDuration() * 1000; /* ms */

    if (now >= lastStepTime + stepDur) {
      /* Apply swing to odd steps */
      var swingDelay = 0;
      if (currentStep % 2 === 1 && swingAmount > 0) {
        swingDelay = swingAmount * stepDur * 0.5;
      }

      if (now >= lastStepTime + stepDur + swingDelay) {
        currentStep = (currentStep + 1) % currentStepCount;
        lastStepTime = now;
        scheduleStep(currentStep);
        highlightStep(currentStep);
      }
    }
  }

  function startPlayback() {
    if (playing) return;
    playing = true;
    currentStep = -1;
    lastStepTime = performance.now() - getStepDuration() * 1000;
    schedulerInterval = setInterval(schedulerTick, 10);
    document.getElementById('playBtn').style.color = 'var(--p-accent-blue)';
  }

  function stopPlayback() {
    if (!playing) return;
    playing = false;
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    currentStep = -1;
    highlightStep(-1);
    document.getElementById('playBtn').style.color = '';
    document.getElementById('posDisplay').textContent = '--';
  }

  /* -- Grid rendering -- */
  var gridEl = document.getElementById('grid');
  var stepEls = [];

  function renderGrid() {
    gridEl.innerHTML = '';
    stepEls = [];
    gridEl.style.gridTemplateColumns = '40px repeat(' + currentStepCount + ', 1fr)';
    gridEl.style.gridTemplateRows = 'repeat(' + VOICE_COUNT + ', 28px)';

    var bank = banks[currentBank];
    for (var v = 0; v < VOICE_COUNT; v++) {
      var label = document.createElement('div');
      label.className = 'dm-voice-label';
      label.textContent = VOICES[v];
      gridEl.appendChild(label);

      var voiceSteps = [];
      for (var s = 0; s < currentStepCount; s++) {
        var cell = document.createElement('div');
        cell.className = 'dm-step';
        cell.setAttribute('data-v', v);
        cell.setAttribute('data-s', s);
        if (bank[v][s].on) {
          cell.classList.add('on');
          var vel = bank[v][s].velocity;
          if (vel <= 0.25) cell.classList.add('vel-25');
          else if (vel <= 0.5) cell.classList.add('vel-50');
          else if (vel <= 0.75) cell.classList.add('vel-75');
        }
        gridEl.appendChild(cell);
        voiceSteps.push(cell);
      }
      stepEls.push(voiceSteps);
    }
  }

  function highlightStep(step) {
    var prevEls = gridEl.querySelectorAll('.dm-step.current');
    for (var i = 0; i < prevEls.length; i++) {
      prevEls[i].classList.remove('current');
    }
    if (step >= 0 && step < currentStepCount) {
      for (var v = 0; v < VOICE_COUNT; v++) {
        if (stepEls[v] && stepEls[v][step]) {
          stepEls[v][step].classList.add('current');
        }
      }
      document.getElementById('posDisplay').textContent = (step + 1) + '/' + currentStepCount;
    }
  }

  /* -- Grid click handler (event delegation) -- */
  gridEl.addEventListener('pointerdown', function(e) {
    var cell = e.target.closest('.dm-step');
    if (!cell) return;
    var v = parseInt(cell.getAttribute('data-v'), 10);
    var s = parseInt(cell.getAttribute('data-s'), 10);
    var bank = banks[currentBank];

    if (e.altKey) {
      if (!bank[v][s].on) {
        bank[v][s].on = true;
        bank[v][s].velocity = 1.0;
      } else {
        var vel = bank[v][s].velocity;
        if (vel > 0.75) bank[v][s].velocity = 0.75;
        else if (vel > 0.5) bank[v][s].velocity = 0.5;
        else if (vel > 0.25) bank[v][s].velocity = 0.25;
        else {
          bank[v][s].on = false;
          bank[v][s].velocity = 1.0;
        }
      }
    } else {
      bank[v][s].on = !bank[v][s].on;
      if (!bank[v][s].on) bank[v][s].velocity = 1.0;
    }

    cell.classList.remove('on', 'vel-25', 'vel-50', 'vel-75');
    if (bank[v][s].on) {
      cell.classList.add('on');
      var nv = bank[v][s].velocity;
      if (nv <= 0.25) cell.classList.add('vel-25');
      else if (nv <= 0.5) cell.classList.add('vel-50');
      else if (nv <= 0.75) cell.classList.add('vel-75');
    }

    /* Preview sound */
    if (bank[v][s].on) {
      playVoice(v, bank[v][s].velocity);
    }

    saveBanks();
  });

  /* -- Transport -- */
  document.getElementById('playBtn').addEventListener('click', startPlayback);
  document.getElementById('stopBtn').addEventListener('click', stopPlayback);

  var bpmInput = document.getElementById('bpmInput');
  bpmInput.addEventListener('change', function() {
    var val = parseInt(bpmInput.value, 10);
    if (val >= 40 && val <= 300) bpm = val;
    else bpmInput.value = bpm;
  });

  /* -- Bank selector -- */
  var bankRow = document.getElementById('bankRow');
  function renderBanks() {
    bankRow.innerHTML = '';
    for (var i = 0; i < 8; i++) {
      var btn = document.createElement('button');
      btn.className = 'dm-bank-btn' + (i === currentBank ? ' active' : '');
      btn.textContent = BANK_NAMES[i];
      btn.setAttribute('data-bank', i);
      bankRow.appendChild(btn);
    }
  }

  bankRow.addEventListener('click', function(e) {
    var btn = e.target.closest('.dm-bank-btn');
    if (!btn) return;
    currentBank = parseInt(btn.getAttribute('data-bank'), 10);
    renderBanks();
    renderGrid();
  });

  /* -- Step count selector -- */
  var stepsRow = document.getElementById('stepsRow');
  function renderStepsSel() {
    stepsRow.innerHTML = '';
    for (var i = 0; i < STEP_COUNTS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'dm-steps-btn' + (STEP_COUNTS[i] === currentStepCount ? ' active' : '');
      btn.textContent = STEP_COUNTS[i];
      btn.setAttribute('data-steps', STEP_COUNTS[i]);
      stepsRow.appendChild(btn);
    }
  }

  stepsRow.addEventListener('click', function(e) {
    var btn = e.target.closest('.dm-steps-btn');
    if (!btn) return;
    var wasPlaying = playing;
    if (wasPlaying) stopPlayback();
    currentStepCount = parseInt(btn.getAttribute('data-steps'), 10);
    renderStepsSel();
    renderGrid();
    if (wasPlaying) startPlayback();
  });

  /* -- Knobs -- */
  var knobsRow = document.getElementById('knobsRow');

  var swingContainer = document.createElement('div');
  knobsRow.appendChild(swingContainer);
  swingKnob = prvctice.ui.knob(swingContainer, {
    min: 0, max: 0.75, value: 0, step: 0.01,
    label: 'SWING',
    format: function(v) { return Math.round(v * 100) + '%'; },
    onChange: function(v) { swingAmount = v; }
  });

  var volContainer = document.createElement('div');
  knobsRow.appendChild(volContainer);
  volKnob = prvctice.ui.knob(volContainer, {
    min: 0, max: 1, value: 0.7, step: 0.01,
    label: 'VOLUME',
    format: function(v) { return Math.round(v * 100); },
    onChange: function(v) { masterVolume = v; }
  });

  /* -- Connection button -- */
  var connBtn = document.getElementById('connBtn');
  var connected = false;

  function setConnectedUI() {
    connBtn.textContent = 'LIVE';
    connBtn.className = 'dm-conn-btn live';
  }
  function setDisconnectedUI() {
    connBtn.textContent = 'CONNECT';
    connBtn.className = 'dm-conn-btn';
  }

  function doConnect() {
    prvctice.mixer.connect({ name: 'Drum Machine' }).then(function(result) {
      connected = true;
      channelId = result.channelId;
      setConnectedUI();
    }).catch(function() {
      setDisconnectedUI();
    });
  }

  function doDisconnect() {
    if (playing) stopPlayback();
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
    setDisconnectedUI();
  });

  /* Auto-connect on load */
  doConnect();

  /* -- Init -- */
  initBanks();
  renderBanks();
  renderStepsSel();
  renderGrid();
  loadBanks();

  /* -- Cleanup -- */
  prvctice.onDispose(function() {
    stopPlayback();
    if (swingKnob && swingKnob.dispose) swingKnob.dispose();
    if (volKnob && volKnob.dispose) volKnob.dispose();
    prvctice.mixer.disconnect();
  });
});
<` +
  `/script>
</body>
</html>`;
