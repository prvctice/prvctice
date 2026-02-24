/**
 * Focus Timer -- 7-segment LED display timer.
 * SVG polygon segments with glow filter, like a classic digital clock.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const FOCUS_TIMER_HTML =
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .matrix-wrap {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      gap: 6px;
    }
    .mode-indicator {
      font-family: var(--p-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--mode-color, #007E08);
      flex-shrink: 0;
    }
    .display-area {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .display-area svg {
      width: 100%;
      height: 100%;
    }
    .seg-dim {
      transition: fill 0.15s ease;
    }
    .matrix-wrap.dimmed .seg-lit {
      opacity: 0.35;
    }
    .matrix-wrap.pulse .seg-lit {
      animation: seg-pulse 0.8s ease-in-out 3;
    }
    @keyframes seg-pulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 1; }
    }
    .tabs-locked {
      pointer-events: none;
      opacity: 0.4;
    }
    #modeTabs {
      flex-shrink: 0;
      --p-accent-blue: #e0a830;
      --p-primary: #e0a830;
    }
    #mainBtn {
      border: 1px solid #e0a830;
      color: #e0a830;
    }
    #mainBtn:hover {
      background: rgba(255,255,255,0.06);
    }
  </style>
</head>
<body class="p-stack full pad-3 gap-2">
  <div class="matrix-wrap" id="matrixWrap">
    <div class="mode-indicator" id="modeLabel">SHORT</div>
    <div class="display-area" id="displayArea"></div>
  </div>

  <div id="modeTabs"></div>

  <div class="p-row gap-2">
    <button id="mainBtn" class="p-btn p-btn-ghost flex-1">START</button>
    <button id="resetBtn" class="p-btn p-btn-ghost" style="width:48px" disabled>\u21BB</button>
  </div>

  <div class="p-split p-feed-meta">
    <span class="p-label-tech">SESSIONS</span>
    <span id="footerStats" class="text-muted">0 COMPLETED \u2022 0 MIN</span>
  </div>

  <div id="timerEl" style="display:none"></div>

  <script>
  prvctice.onReady(function() {
    var SVG_NS = 'http://www.w3.org/2000/svg';

    // ---- 7-segment polygon points (44w x 80h per digit) ----
    // Order: a(top), b(top-right), c(bot-right), d(bot), e(bot-left), f(top-left), g(mid)
    var SEGS = [
      '8,0 36,0 40,4 36,8 8,8 4,4',
      '36,10 40,6 44,10 44,34 40,38 36,34',
      '36,46 40,42 44,46 44,70 40,74 36,70',
      '8,72 36,72 40,76 36,80 8,80 4,76',
      '0,46 4,42 8,46 8,70 4,74 0,70',
      '0,10 4,6 8,10 8,34 4,38 0,34',
      '8,36 36,36 40,40 36,44 8,44 4,40'
    ];

    // Which segments light for each digit [a,b,c,d,e,f,g]
    var DIGIT_MAP = [
      [1,1,1,1,1,1,0], // 0
      [0,1,1,0,0,0,0], // 1
      [1,1,0,1,1,0,1], // 2
      [1,1,1,1,0,0,1], // 3
      [0,1,1,0,0,1,1], // 4
      [1,0,1,1,0,1,1], // 5
      [1,0,1,1,1,1,1], // 6
      [1,1,1,0,0,0,0], // 7
      [1,1,1,1,1,1,1], // 8
      [1,1,1,1,0,1,1]  // 9
    ];

    // Layout: viewBox 216x80
    var DIGIT_X = [0, 56, 116, 172];
    var COLON_CX = 108;
    var LIT_FILL = '#e0a830';
    var DIM_FILL = 'rgba(224,168,48,0.05)';

    // ---- Mode config ----
    var MODES = {
      short:  { label: 'SHORT',  ms:  5 * 60000 },
      medium: { label: 'MEDIUM', ms: 15 * 60000 },
      long:   { label: 'LONG',   ms: 25 * 60000 }
    };
    var MODE_LABEL_COLORS = {
      short:  '#007E08',
      medium: '#e0a830',
      long:   '#e86830'
    };
    var CHIME_NOTES = [
      { freq: 523.25, duration: 150 },
      { freq: 659.25, duration: 150 },
      { freq: 783.99, duration: 150 },
      { freq: 1046.5, duration: 250 }
    ];

    // ---- State ----
    var appState = 'ready';
    var currentMode = 'short';
    var sessionsCompleted = 0;
    var totalMs = 0;
    var cycleTimeoutId = null;
    var colonVisible = true;
    var colonIntervalId = null;
    var prevDigitValues = [-1, -1, -1, -1];

    // ---- DOM refs ----
    var matrixWrap = document.getElementById('matrixWrap');
    var displayArea = document.getElementById('displayArea');
    var modeLabelEl = document.getElementById('modeLabel');
    var mainBtn = document.getElementById('mainBtn');
    var resetBtn = document.getElementById('resetBtn');
    var footerStats = document.getElementById('footerStats');

    // ---- Build SVG display ----
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 216 80');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Glow filter
    var defs = document.createElementNS(SVG_NS, 'defs');
    var filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', 'glow');
    filter.setAttribute('x', '-30%');
    filter.setAttribute('y', '-30%');
    filter.setAttribute('width', '160%');
    filter.setAttribute('height', '160%');
    var blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '3');
    blur.setAttribute('result', 'blur');
    var merge = document.createElementNS(SVG_NS, 'feMerge');
    var mn1 = document.createElementNS(SVG_NS, 'feMergeNode');
    mn1.setAttribute('in', 'blur');
    var mn2 = document.createElementNS(SVG_NS, 'feMergeNode');
    mn2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mn1);
    merge.appendChild(mn2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Create 4 digit groups, each with 7 segment polygons
    var digitSegs = [];
    for (var di = 0; di < 4; di++) {
      var g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', 'translate(' + DIGIT_X[di] + ',0)');
      var segs = [];
      for (var si = 0; si < 7; si++) {
        var poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', SEGS[si]);
        poly.setAttribute('fill', DIM_FILL);
        poly.setAttribute('class', 'seg-dim');
        g.appendChild(poly);
        segs.push(poly);
      }
      svg.appendChild(g);
      digitSegs.push(segs);
    }

    // Colon dots
    var colonDots = [];
    var colonYs = [28, 52];
    for (var ci = 0; ci < 2; ci++) {
      var circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(COLON_CX));
      circle.setAttribute('cy', String(colonYs[ci]));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', LIT_FILL);
      circle.setAttribute('filter', 'url(#glow)');
      circle.setAttribute('class', 'seg-lit');
      svg.appendChild(circle);
      colonDots.push(circle);
    }

    displayArea.appendChild(svg);

    // ---- Hidden timer ----
    var timer = prvctice.ui.timer(document.getElementById('timerEl'), {
      duration: MODES.short.ms,
      mode: 'countdown',
      autoStart: false,
      onTick: function(remaining) {
        updateDisplay(remaining);
      },
      onComplete: function() {
        onTimerComplete();
      }
    });

    // ---- Mode tabs ----
    var tabs = prvctice.ui.tabs(document.getElementById('modeTabs'), {
      tabs: [
        { id: 'short', label: 'SHORT' },
        { id: 'medium', label: 'MEDIUM' },
        { id: 'long', label: 'LONG' }
      ],
      active: 'short',
      onChange: function(id) {
        if (appState !== 'ready') return;
        switchMode(id);
      }
    });

    // ---- Display rendering ----
    function getDigits(ms) {
      var totalSec = Math.ceil(ms / 1000);
      var min = Math.floor(totalSec / 60);
      var sec = totalSec % 60;
      return [
        Math.floor(min / 10),
        min % 10,
        Math.floor(sec / 10),
        sec % 10
      ];
    }

    function setDigitValue(di, value) {
      var map = DIGIT_MAP[value];
      var segs = digitSegs[di];
      for (var s = 0; s < 7; s++) {
        if (map[s]) {
          segs[s].setAttribute('fill', LIT_FILL);
          segs[s].setAttribute('filter', 'url(#glow)');
          segs[s].setAttribute('class', 'seg-lit');
        } else {
          segs[s].setAttribute('fill', DIM_FILL);
          segs[s].removeAttribute('filter');
          segs[s].setAttribute('class', 'seg-dim');
        }
      }
    }

    function updateDisplay(ms) {
      var digits = getDigits(ms);
      for (var i = 0; i < 4; i++) {
        if (digits[i] !== prevDigitValues[i]) {
          setDigitValue(i, digits[i]);
          prevDigitValues[i] = digits[i];
        }
      }
    }

    // ---- Colon blink ----
    function setColonVisible(vis) {
      var fill = vis ? LIT_FILL : DIM_FILL;
      var filt = vis ? 'url(#glow)' : '';
      for (var i = 0; i < 2; i++) {
        colonDots[i].setAttribute('fill', fill);
        if (vis) {
          colonDots[i].setAttribute('filter', filt);
        } else {
          colonDots[i].removeAttribute('filter');
        }
      }
    }

    function startColonBlink() {
      stopColonBlink();
      colonVisible = true;
      colonIntervalId = setInterval(function() {
        colonVisible = !colonVisible;
        setColonVisible(colonVisible);
      }, 500);
    }

    function stopColonBlink() {
      if (colonIntervalId) {
        clearInterval(colonIntervalId);
        colonIntervalId = null;
      }
      colonVisible = true;
      setColonVisible(true);
    }

    // ---- Mode switching ----
    function switchMode(id) {
      currentMode = id;
      var dur = MODES[id].ms;
      timer.reset();
      timer.setDuration(dur);
      modeLabelEl.textContent = MODES[id].label;
      modeLabelEl.style.color = MODE_LABEL_COLORS[id];
      prevDigitValues = [-1, -1, -1, -1];
      updateDisplay(dur);
      setMatrixState();
      tabs.setActive(id);
    }

    // ---- Matrix visual state ----
    function setMatrixState() {
      matrixWrap.classList.remove('dimmed', 'pulse');
      if (appState === 'paused') matrixWrap.classList.add('dimmed');
      if (appState === 'complete') matrixWrap.classList.add('pulse');
    }

    // ---- State transitions ----
    function transitionTo(newState) {
      appState = newState;
      setMatrixState();
      lockTabs(appState !== 'ready');

      if (appState === 'ready') {
        stopColonBlink();
        mainBtn.textContent = 'START';
        mainBtn.disabled = false;
        resetBtn.disabled = true;
      } else if (appState === 'active') {
        startColonBlink();
        mainBtn.textContent = 'PAUSE';
        mainBtn.disabled = false;
        resetBtn.disabled = false;
      } else if (appState === 'paused') {
        stopColonBlink();
        mainBtn.textContent = 'RESUME';
        mainBtn.disabled = false;
        resetBtn.disabled = false;
      } else if (appState === 'complete') {
        stopColonBlink();
        mainBtn.textContent = 'START';
        mainBtn.disabled = true;
        resetBtn.disabled = false;
      }
    }

    function lockTabs(locked) {
      var tabEl = document.getElementById('modeTabs');
      if (tabEl) tabEl.classList.toggle('tabs-locked', locked);
    }

    // ---- Completion ----
    function onTimerComplete() {
      prevDigitValues = [-1, -1, -1, -1];
      updateDisplay(0);
      transitionTo('complete');

      totalMs += MODES[currentMode].ms;
      sessionsCompleted++;
      updateFooter();

      prvctice.audio.sequence(CHIME_NOTES, { type: 'sine', volume: 0.25 });
      prvctice.ui.toast({ message: 'Timer complete!', type: 'success' });

      cycleTimeoutId = setTimeout(function() {
        cycleTimeoutId = null;
        switchMode(currentMode);
        transitionTo('ready');
      }, 2500);
    }

    function updateFooter() {
      var mins = Math.round(totalMs / 60000);
      footerStats.textContent = sessionsCompleted + ' COMPLETED \u2022 ' + mins + ' MIN';
    }

    // ---- Button handlers ----
    mainBtn.onclick = function() {
      if (appState === 'ready') {
        timer.start();
        transitionTo('active');
      } else if (appState === 'active') {
        timer.pause();
        transitionTo('paused');
      } else if (appState === 'paused') {
        timer.start();
        transitionTo('active');
      }
    };

    resetBtn.onclick = function() {
      if (cycleTimeoutId) {
        clearTimeout(cycleTimeoutId);
        cycleTimeoutId = null;
      }
      timer.reset();
      prevDigitValues = [-1, -1, -1, -1];
      updateDisplay(MODES[currentMode].ms);
      mainBtn.disabled = false;
      transitionTo('ready');
    };

    // ---- Init ----
    modeLabelEl.style.color = MODE_LABEL_COLORS.short;
    updateDisplay(MODES.short.ms);

    prvctice.onDispose(function() {
      if (timer) timer.dispose();
      if (tabs) tabs.dispose();
      stopColonBlink();
      if (cycleTimeoutId) clearTimeout(cycleTimeoutId);
    });
  });
  <` +
  `/script>
</body>
</html>`;
