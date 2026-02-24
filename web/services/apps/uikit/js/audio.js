/**
 * prvctice UI Kit — Audio
 * Web Audio synthesis helpers and real-time visualization components.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  // ==================== SHARED AUDIO CONTEXT ====================

  var _realCtx = null; // The real AudioContext
  var _audioCtx = null; // Proxy that redirects .destination → master gain
  var _masterGain = null;
  var _masterAnalyser = null;
  var _resumeListenerInstalled = false;

  /**
   * Initialise the real AudioContext and master bus (gain + analyser).
   * Called once; all subsequent calls return the cached instances.
   */
  function _initAudio() {
    if (_realCtx) return;
    _realCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Master gain bus — everything connects here instead of raw destination
    _masterGain = _realCtx.createGain();
    _masterGain.connect(_realCtx.destination);

    // Master analyser tapped from the bus for visualizers
    _masterAnalyser = _realCtx.createAnalyser();
    _masterAnalyser.fftSize = 2048;
    _masterGain.connect(_masterAnalyser);

    // Return a Proxy so that ctx.destination → master gain.
    // This means generated code doing node.connect(ctx.destination)
    // automatically routes through the master bus + analyser.
    _audioCtx = new Proxy(_realCtx, {
      get: function (target, prop) {
        if (prop === 'destination') return _masterGain;
        var val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
    });
  }

  function getAudioContext() {
    _initAudio();
    // Resume if suspended (autoplay policy)
    if (_realCtx.state === 'suspended') {
      _realCtx.resume();
    }
    // On mobile, install a one-shot gesture listener to force-resume on first
    // user interaction. Mobile browsers require resume() to be called directly
    // from within a user-gesture event handler.
    if (!_resumeListenerInstalled) {
      _resumeListenerInstalled = true;
      var resumeOnGesture = function () {
        if (_realCtx && _realCtx.state === 'suspended') {
          _realCtx.resume();
        }
        document.removeEventListener('touchstart', resumeOnGesture, true);
        document.removeEventListener('touchend', resumeOnGesture, true);
        document.removeEventListener('mousedown', resumeOnGesture, true);
        document.removeEventListener('pointerdown', resumeOnGesture, true);
      };
      // Use capture phase so we fire before any preventDefault()
      document.addEventListener('touchstart', resumeOnGesture, true);
      document.addEventListener('touchend', resumeOnGesture, true);
      document.addEventListener('mousedown', resumeOnGesture, true);
      document.addEventListener('pointerdown', resumeOnGesture, true);
    }
    return _audioCtx;
  }

  /**
   * Get or create the master gain bus.
   * All synthesis output routes through this node before reaching ctx.destination.
   * Also creates a master analyser tapped from the bus.
   * @returns {GainNode}
   */
  function getMasterGain() {
    _initAudio();
    return _masterGain;
  }

  // ==================== TONE SYNTHESIS ====================

  /**
   * Play a simple tone.
   * @param {number} frequency - Frequency in Hz (e.g., 440)
   * @param {number} [duration] - Duration in ms (default 200)
   * @param {object} [opts] - Options
   * @param {string} [opts.type] - Oscillator type: 'sine'|'square'|'sawtooth'|'triangle' (default 'sine')
   * @param {number} [opts.volume] - Volume 0-1 (default 0.3)
   * @param {number} [opts.attack] - Attack time in ms (default 10)
   * @param {number} [opts.release] - Release time in ms (default 50)
   */
  function playTone(frequency, duration, opts) {
    // Guard: frequency must be a finite positive number
    if (typeof frequency !== 'number' || !isFinite(frequency) || frequency <= 0) return;
    if (!opts) opts = {};
    duration = duration || 200;
    if (!isFinite(duration) || duration <= 0) return;
    var type = opts.type || 'sine';
    var volume = typeof opts.volume === 'number' ? opts.volume : 0.3;
    var attack = (opts.attack || 10) / 1000;
    var release = (opts.release || 50) / 1000;

    var ctx = getAudioContext();
    var now = ctx.currentTime;
    var durSec = duration / 1000;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    // Envelope: attack -> sustain -> release
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.setValueAtTime(volume, now + durSec - release);
    gain.gain.linearRampToValueAtTime(0, now + durSec);

    osc.connect(gain);
    gain.connect(getMasterGain());

    osc.start(now);
    osc.stop(now + durSec + 0.01);
  }

  /**
   * Play a sequence of notes.
   * @param {Array<{freq: number, duration?: number}>} notes - Array of note objects
   * @param {object} [opts] - Same as playTone opts
   */
  function playSequence(notes, opts) {
    if (!opts) opts = {};
    var ctx = getAudioContext();
    var now = ctx.currentTime;
    var offset = 0;

    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      var freq = note.freq || note.frequency || 440;
      var dur = (note.duration || 200) / 1000;
      var type = opts.type || 'sine';
      var volume = typeof opts.volume === 'number' ? opts.volume : 0.3;
      var attack = (opts.attack || 10) / 1000;
      var release = (opts.release || 30) / 1000;

      if (freq > 0) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(volume, now + offset + attack);
        gain.gain.setValueAtTime(volume, now + offset + dur - release);
        gain.gain.linearRampToValueAtTime(0, now + offset + dur);
        osc.connect(gain);
        gain.connect(getMasterGain());
        osc.start(now + offset);
        osc.stop(now + offset + dur + 0.01);
      }
      offset += dur;
    }
  }

  /**
   * Create an AnalyserNode connected to a source or the shared context.
   * @param {object} [opts]
   * @param {number} [opts.fftSize] - FFT size (default 256)
   * @param {number} [opts.smoothing] - Smoothing (default 0.8)
   * @returns {{ analyser: AnalyserNode, context: AudioContext }}
   */
  function createAnalyser(opts) {
    if (!opts) opts = {};
    var ctx = getAudioContext();
    var analyser = ctx.createAnalyser();
    analyser.fftSize = opts.fftSize || 256;
    analyser.smoothingTimeConstant = typeof opts.smoothing === 'number' ? opts.smoothing : 0.8;
    return { analyser: analyser, context: ctx };
  }

  /**
   * Create a recorder that captures all audio flowing through the master bus.
   * @param {object} [opts] - Options (reserved for future use)
   * @returns {{ start: function, stop: function, isRecording: function, dispose: function }}
   */
  function createRecorder(opts) {
    var ctx = getAudioContext();
    var master = getMasterGain();
    var dest = ctx.createMediaStreamDestination();
    master.connect(dest);
    var recorder = null;
    var chunks = [];
    var startTime = 0;
    var recording = false;

    // Determine supported MIME type
    var mimeType = 'audio/webm';
    if (
      typeof MediaRecorder !== 'undefined' &&
      typeof MediaRecorder.isTypeSupported === 'function'
    ) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      }
    }

    return {
      start: function () {
        if (recording) return;
        chunks = [];
        recorder = new MediaRecorder(dest.stream, { mimeType: mimeType });
        recorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        startTime = Date.now();
        recording = true;
        recorder.start(100);
      },
      stop: function () {
        return new Promise(function (resolve, reject) {
          if (!recording || !recorder) {
            reject(new Error('Not recording'));
            return;
          }
          recorder.onstop = function () {
            var duration = Date.now() - startTime;
            var blob = new Blob(chunks, { type: mimeType });
            recording = false;
            chunks = [];
            resolve({ blob: blob, duration: duration });
          };
          recorder.onerror = function (e) {
            recording = false;
            reject(e.error || new Error('Recording error'));
          };
          recorder.stop();
        });
      },
      isRecording: function () {
        return recording;
      },
      dispose: function () {
        if (recording && recorder) {
          recorder.stop();
          recording = false;
        }
        master.disconnect(dest);
      },
    };
  }

  /**
   * Get the master bus analyser node.
   * Useful for visualization components to observe all synth output.
   * @returns {AnalyserNode}
   */
  function getAnalyser() {
    getMasterGain(); // Ensure master bus + analyser exist
    return _masterAnalyser;
  }

  /**
   * Close the shared AudioContext and release all Web Audio resources.
   * Called automatically by the bridge on app:close; apps may also call
   * it manually in their onDispose handler.
   */
  function disposeAudio() {
    if (_realCtx) {
      try {
        _realCtx.close();
      } catch (e) {}
      _realCtx = null;
      _audioCtx = null;
      _masterGain = null;
      _masterAnalyser = null;
      _resumeListenerInstalled = false;
    }
  }

  // ==================== VISUALIZATION COMPONENTS ====================

  /**
   * Get theme colors from computed styles.
   */
  function getThemeColors() {
    var cs = getComputedStyle(document.documentElement);
    return {
      primary: cs.getPropertyValue('--p-primary').trim() || '#6366f1',
      accent: cs.getPropertyValue('--p-accent').trim() || '#06b6d4',
      text: cs.getPropertyValue('--p-text').trim() || '#e0e0e0',
      textMuted: cs.getPropertyValue('--p-text-muted').trim() || 'rgba(128,128,128,0.5)',
      surface: cs.getPropertyValue('--p-surface').trim() || '#252542',
      success: cs.getPropertyValue('--p-success').trim() || '#22c55e',
      warning: cs.getPropertyValue('--p-warning').trim() || '#f59e0b',
      danger: cs.getPropertyValue('--p-danger').trim() || '#ef4444',
    };
  }

  /**
   * Oscilloscope — real-time waveform display.
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {AnalyserNode} [opts.analyser] - AnalyserNode to visualize
   * @param {string} [opts.color] - CSS color or token name like '--p-primary'
   * @param {number} [opts.lineWidth] - Line width (default 2)
   * @param {boolean} [opts.fill] - Fill below waveform (default false)
   * @returns {{ connectAnalyser(node), dispose() }}
   */
  function oscilloscopeComponent(container, opts) {
    if (!opts) opts = {};
    var canvas = document.createElement('canvas');
    canvas.className = 'p-oscilloscope';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    // Auto-connect to master bus analyser when no explicit analyser provided
    var analyser = opts.analyser || getAnalyser();
    var lineWidth = opts.lineWidth || 2;
    var fillBelow = opts.fill || false;
    var rafId = null;
    var disposed = false;
    var dataArray = null;

    function resolveColor(c) {
      if (!c) return getThemeColors().primary;
      if (c.indexOf('--') === 0) {
        return getComputedStyle(document.documentElement).getPropertyValue(c).trim() || c;
      }
      return c;
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.scale(dpr, dpr);
    }

    function draw() {
      if (disposed) return;
      rafId = requestAnimationFrame(draw);

      var w = canvas.width / (window.devicePixelRatio || 1);
      var h = canvas.height / (window.devicePixelRatio || 1);
      var color = resolveColor(opts.color);

      ctx.clearRect(0, 0, w, h);

      if (!analyser || !dataArray) {
        // Draw flat line
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.beginPath();

      var sliceWidth = w / dataArray.length;
      var x = 0;

      for (var i = 0; i < dataArray.length; i++) {
        var v = dataArray[i] / 128.0;
        var y = (v * h) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (fillBelow) {
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb(', 'rgba(');
        ctx.fill();
      }
    }

    function connectAnalyser(node) {
      analyser = node;
      if (analyser) {
        dataArray = new Uint8Array(analyser.fftSize);
      }
    }

    resize();
    var resizeObserver = new ResizeObserver(function () {
      resize();
    });
    resizeObserver.observe(canvas);
    draw();

    if (analyser) {
      connectAnalyser(analyser);
    }

    return {
      connectAnalyser: connectAnalyser,
      dispose: function () {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  }

  /**
   * Spectrogram — real-time frequency bar display.
   * Works with either a local AnalyserNode or bridge audio data (onAudioData).
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {AnalyserNode} [opts.analyser] - AnalyserNode for local audio
   * @param {number} [opts.bars] - Number of bars (default 32)
   * @param {string} [opts.color] - Bar color (CSS color or token)
   * @param {number} [opts.gap] - Gap between bars in px (default 2)
   * @param {boolean} [opts.gradient] - Use gradient coloring (default false)
   * @returns {{ draw(data), connectAnalyser(node), dispose() }}
   */
  function spectrogramComponent(container, opts) {
    if (!opts) opts = {};
    var canvas = document.createElement('canvas');
    canvas.className = 'p-spectrogram';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var numBars = opts.bars || 32;
    var gap = typeof opts.gap === 'number' ? opts.gap : 2;
    var useGradient = opts.gradient || false;
    var analyser = opts.analyser || null;
    var rafId = null;
    var disposed = false;
    var manualData = null;
    var freqData = null;

    function resolveColor(c) {
      if (!c) return getThemeColors().primary;
      if (c.indexOf('--') === 0) {
        return getComputedStyle(document.documentElement).getPropertyValue(c).trim() || c;
      }
      return c;
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.scale(dpr, dpr);
    }

    function drawBars(data) {
      var w = canvas.width / (window.devicePixelRatio || 1);
      var h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      var barCount = Math.min(numBars, data.length);
      var barWidth = (w - gap * (barCount - 1)) / barCount;
      var colors = getThemeColors();
      var baseColor = resolveColor(opts.color);

      for (var i = 0; i < barCount; i++) {
        var value = typeof data[i] === 'number' ? data[i] : 0;
        // Normalize: if values are 0-255 (Uint8Array), map to 0-1
        if (value > 1) value = value / 255;
        var barHeight = Math.max(2, value * h);
        var x = i * (barWidth + gap);
        var y = h - barHeight;

        if (useGradient) {
          // Gradient from primary -> warning -> danger based on level
          if (value > 0.8) {
            ctx.fillStyle = colors.danger;
          } else if (value > 0.6) {
            ctx.fillStyle = colors.warning;
          } else {
            ctx.fillStyle = baseColor;
          }
        } else {
          ctx.fillStyle = baseColor;
        }

        ctx.fillRect(x, y, barWidth, barHeight);
      }
    }

    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);

      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        // Downsample to numBars
        var step = freqData.length / numBars;
        var downsampled = [];
        for (var i = 0; i < numBars; i++) {
          downsampled.push((freqData[Math.floor(i * step)] || 0) / 255);
        }
        drawBars(downsampled);
      } else if (manualData) {
        drawBars(manualData);
        manualData = null; // Single frame from manual draw
      }
    }

    function connectAnalyser(node) {
      analyser = node;
      if (analyser) {
        freqData = new Uint8Array(analyser.frequencyBinCount);
      }
    }

    resize();
    var resizeObserver = new ResizeObserver(function () {
      resize();
    });
    resizeObserver.observe(canvas);
    animate();

    if (analyser) {
      connectAnalyser(analyser);
    }

    return {
      draw: function (data) {
        manualData = data;
      },
      connectAnalyser: connectAnalyser,
      dispose: function () {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  }

  // ==================== SPECTRUM VISUALIZER ====================

  /**
   * Energy-reactive spectrum visualizer with per-waveform color palettes,
   * multi-layer rendering (ambient glow, gradient fill, edge line, bloom,
   * reflection). Extracted from Synth Studio for reuse across audio apps.
   *
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {AnalyserNode} [opts.analyser] - AnalyserNode for local audio
   * @param {number} [opts.bands] - Number of frequency bands (default 48)
   * @param {number} [opts.smoothing] - Smoothing factor 0-1 (default 0.82)
   * @param {string} [opts.waveform] - Initial waveform for color palette
   * @param {boolean} [opts.reflection] - Show bottom reflection (default true)
   * @returns {{ draw(data), setWaveform(type), connectAnalyser(node), dispose() }}
   */
  function spectrumComponent(container, opts) {
    if (!opts) opts = {};
    var canvas = document.createElement('canvas');
    canvas.className = 'p-spectrum';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    var c = canvas.getContext('2d');
    var NUM_BANDS = opts.bands || 48;
    var sf = typeof opts.smoothing === 'number' ? opts.smoothing : 0.82;
    var showReflection = opts.reflection !== false;
    var analyser = opts.analyser || null;
    var freqData = null;
    var smoothed = new Float64Array(NUM_BANDS);
    var dpr = window.devicePixelRatio || 1;
    var rafId = null;
    var disposed = false;
    var manualData = null;
    var waveform = opts.waveform || 'sine';

    /* Per-waveform color palettes: [lowR,G,B, midR,G,B, hiR,G,B] */
    var COLORS = {
      sine: [8, 20, 60, 30, 90, 200, 160, 220, 255],
      sawtooth: [40, 20, 5, 200, 90, 20, 255, 200, 80],
      square: [5, 30, 15, 20, 140, 60, 100, 255, 160],
      triangle: [35, 30, 5, 180, 160, 20, 255, 240, 120],
    };

    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function smoothPath(pts) {
      if (pts.length < 2) return;
      c.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 2) {
        c.lineTo(pts[1].x, pts[1].y);
        return;
      }
      for (var i = 0; i < pts.length - 1; i++) {
        var mx = (pts[i].x + pts[i + 1].x) * 0.5;
        var my = (pts[i].y + pts[i + 1].y) * 0.5;
        c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }

    function processData(raw) {
      var energy = 0;
      for (var i = 0; i < NUM_BANDS; i++) {
        var lo = Math.floor(Math.pow(raw.length, i / NUM_BANDS));
        var hi = Math.max(lo + 1, Math.ceil(Math.pow(raw.length, (i + 1) / NUM_BANDS)));
        var sum = 0,
          cnt = 0;
        for (var j = lo; j < hi && j < raw.length; j++) {
          sum += raw[j];
          cnt++;
        }
        var v = cnt > 0 ? sum / cnt / 255 : 0;
        smoothed[i] = smoothed[i] * sf + v * (1 - sf);
        energy += smoothed[i];
      }
      return Math.min(1, (energy / NUM_BANDS) * 2);
    }

    function render(energy) {
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      c.clearRect(0, 0, w, h);
      var pts = [];
      for (var i = 0; i < NUM_BANDS; i++) {
        pts.push({ x: (i / (NUM_BANDS - 1)) * w, y: h - smoothed[i] * h * 0.88 });
      }
      var e2 = energy * energy;
      var vc = COLORS[waveform] || COLORS['sine'];
      var lo = [vc[0], vc[1], vc[2]];
      var md = [vc[3], vc[4], vc[5]];
      var hi = [vc[6], vc[7], vc[8]];
      function cr(base, boost) {
        return Math.min(255, Math.round(base + e2 * boost));
      }

      /* Layer 1: ambient backlight glow */
      c.save();
      c.shadowColor =
        'rgba(' +
        cr(md[0], 30) +
        ',' +
        cr(md[1], 40) +
        ',' +
        cr(md[2], 30) +
        ',' +
        (0.25 + energy * 0.45) +
        ')';
      c.shadowBlur = 28 + energy * 12;
      c.beginPath();
      c.moveTo(0, h);
      smoothPath(pts);
      c.lineTo(w, h);
      c.closePath();
      c.fillStyle = 'rgba(' + lo[0] + ',' + lo[1] + ',' + lo[2] + ',0.08)';
      c.fill();
      c.restore();

      /* Layer 2: main gradient fill */
      var mg = c.createLinearGradient(0, h, 0, 0);
      mg.addColorStop(0, 'rgba(' + lo[0] + ',' + lo[1] + ',' + lo[2] + ',0)');
      mg.addColorStop(
        0.15,
        'rgba(' +
          cr(lo[0], 15) +
          ',' +
          cr(lo[1], 20) +
          ',' +
          cr(lo[2], 15) +
          ',' +
          (0.12 + energy * 0.15) +
          ')'
      );
      mg.addColorStop(
        0.35,
        'rgba(' +
          cr(lo[0] + 10, 20) +
          ',' +
          cr(lo[1] + 20, 40) +
          ',' +
          cr(lo[2] + 10, 20) +
          ',' +
          (0.2 + energy * 0.2) +
          ')'
      );
      mg.addColorStop(
        0.55,
        'rgba(' +
          cr(md[0], 30) +
          ',' +
          cr(md[1], 40) +
          ',' +
          cr(md[2], 30) +
          ',' +
          (0.25 + energy * 0.25) +
          ')'
      );
      mg.addColorStop(
        0.75,
        'rgba(' +
          cr(md[0] + 20, 40) +
          ',' +
          cr(md[1] + 30, 40) +
          ',' +
          cr(md[2] + 20, 30) +
          ',' +
          (0.35 + energy * 0.3) +
          ')'
      );
      mg.addColorStop(
        0.9,
        'rgba(' +
          cr(hi[0] - 40, 40) +
          ',' +
          cr(hi[1] - 20, 30) +
          ',' +
          cr(hi[2] - 20, 25) +
          ',' +
          (0.45 + energy * 0.3) +
          ')'
      );
      mg.addColorStop(
        1,
        'rgba(' +
          cr(hi[0], 30) +
          ',' +
          cr(hi[1], 20) +
          ',' +
          cr(hi[2], 15) +
          ',' +
          (0.55 + energy * 0.35) +
          ')'
      );
      c.beginPath();
      c.moveTo(0, h);
      smoothPath(pts);
      c.lineTo(w, h);
      c.closePath();
      c.fillStyle = mg;
      c.fill();

      /* Layer 3: bright edge line with glow */
      var la = 0.6 + energy * 0.4;
      c.save();
      c.shadowColor =
        'rgba(' +
        cr(hi[0] - 40, 50) +
        ',' +
        cr(hi[1] - 30, 40) +
        ',' +
        cr(hi[2] - 20, 30) +
        ',' +
        (0.4 + energy * 0.5) +
        ')';
      c.shadowBlur = 14 + energy * 10;
      var lg = c.createLinearGradient(0, h, 0, 0);
      lg.addColorStop(0, 'rgba(' + md[0] + ',' + md[1] + ',' + md[2] + ',' + la * 0.4 + ')');
      lg.addColorStop(
        0.4,
        'rgba(' +
          cr(md[0] + 20, 40) +
          ',' +
          cr(md[1] + 30, 40) +
          ',' +
          cr(md[2] + 20, 30) +
          ',' +
          la +
          ')'
      );
      lg.addColorStop(
        0.7,
        'rgba(' +
          cr(hi[0] - 30, 50) +
          ',' +
          cr(hi[1] - 10, 30) +
          ',' +
          cr(hi[2], 20) +
          ',' +
          la +
          ')'
      );
      lg.addColorStop(
        1,
        'rgba(' + cr(hi[0], 30) + ',' + cr(hi[1], 20) + ',' + cr(hi[2], 15) + ',' + la + ')'
      );
      c.beginPath();
      smoothPath(pts);
      c.strokeStyle = lg;
      c.lineWidth = 2;
      c.stroke();
      c.restore();

      /* Layer 4: bloom pass */
      c.save();
      c.globalAlpha = 0.15 + energy * 0.2;
      c.filter = 'blur(6px)';
      c.beginPath();
      smoothPath(pts);
      c.strokeStyle =
        'rgba(' + cr(hi[0] - 60, 40) + ',' + cr(hi[1] - 30, 30) + ',' + cr(hi[2], 20) + ',0.8)';
      c.lineWidth = 4;
      c.stroke();
      c.restore();

      /* Layer 5: reflection */
      if (showReflection) {
        c.save();
        c.globalAlpha = 0.06 + energy * 0.05;
        c.translate(0, h);
        c.scale(1, -0.35);
        c.beginPath();
        c.moveTo(0, h);
        smoothPath(pts);
        c.lineTo(w, h);
        c.closePath();
        c.fillStyle = mg;
        c.fill();
        c.restore();
      }
    }

    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        render(processData(freqData));
      } else if (manualData) {
        render(processData(manualData));
      }
    }

    resize();
    var ro = new ResizeObserver(function () {
      resize();
    });
    ro.observe(canvas);
    animate();

    if (analyser) {
      freqData = new Uint8Array(analyser.frequencyBinCount);
    }

    return {
      draw: function (data) {
        manualData = data;
      },
      setWaveform: function (type) {
        waveform = type;
      },
      connectAnalyser: function (node) {
        analyser = node;
        if (analyser) freqData = new Uint8Array(analyser.frequencyBinCount);
      },
      dispose: function () {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        ro.disconnect();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  }

  // ==================== OFFLINE RENDERING & ENCODING ====================

  /**
   * Render audio offline (faster than real-time).
   * @param {function} callback - Receives OfflineAudioContext; build your audio graph on it
   * @param {number} duration - Duration in seconds
   * @param {object} [opts]
   * @param {number} [opts.sampleRate] - Sample rate (default 44100)
   * @param {number} [opts.channels] - Number of channels (default 2)
   * @returns {Promise<AudioBuffer>}
   */
  function renderOffline(callback, duration, opts) {
    opts = opts || {};
    var sampleRate = opts.sampleRate || 44100;
    var channels = opts.channels || 2;
    var offlineCtx = new OfflineAudioContext(channels, sampleRate * duration, sampleRate);
    callback(offlineCtx);
    return offlineCtx.startRendering();
  }

  /**
   * Encode an AudioBuffer as a WAV Blob (16-bit PCM).
   * Pure ES5 implementation — no dependencies.
   * @param {AudioBuffer} audioBuffer
   * @returns {Blob} WAV blob with audio/wav MIME type
   */
  function encodeWAV(audioBuffer) {
    var numChannels = audioBuffer.numberOfChannels;
    var sampleRate = audioBuffer.sampleRate;
    var length = audioBuffer.length;

    // Get channel data
    var channels = [];
    for (var ch = 0; ch < numChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch));
    }

    // Interleave channels
    var interleaved;
    if (numChannels === 1) {
      interleaved = channels[0];
    } else {
      interleaved = new Float32Array(length * numChannels);
      for (var i = 0; i < length; i++) {
        for (var c = 0; c < numChannels; c++) {
          interleaved[i * numChannels + c] = channels[c][i];
        }
      }
    }

    var bitsPerSample = 16;
    var bytesPerSample = bitsPerSample / 8;
    var blockAlign = numChannels * bytesPerSample;
    var dataSize = interleaved.length * bytesPerSample;
    var headerSize = 44;
    var buffer = new ArrayBuffer(headerSize + dataSize);
    var view = new DataView(buffer);

    // Write string helper
    function writeString(offset, str) {
      for (var s = 0; s < str.length; s++) {
        view.setUint8(offset + s, str.charCodeAt(s));
      }
    }

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, headerSize + dataSize - 8, true);
    writeString(8, 'WAVE');

    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM samples (clamp to [-1, 1], scale to 16-bit)
    var offset = headerSize;
    for (var j = 0; j < interleaved.length; j++) {
      var sample = interleaved[j];
      // Clamp
      if (sample > 1) sample = 1;
      if (sample < -1) sample = -1;
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  /**
   * Convert a Blob to a base64-encoded string.
   * @param {Blob} blob
   * @returns {Promise<string>} base64 string (without data URI prefix)
   */
  function bufferToBase64(blob) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onloadend = function () {
        resolve(reader.result.split(',')[1] || '');
      };
      reader.readAsDataURL(blob);
    });
  }

  // ==================== PIANO KEYBOARD COMPONENT ====================

  /**
   * Standard chromatic note definitions for one octave + overflow.
   * Each entry: { note, freq, isBlack, whiteIndex (position among white keys) }
   */
  var CHROMATIC_NOTES = [
    { note: 'C', semitone: 0, isBlack: false },
    { note: 'C#', semitone: 1, isBlack: true },
    { note: 'D', semitone: 2, isBlack: false },
    { note: 'D#', semitone: 3, isBlack: true },
    { note: 'E', semitone: 4, isBlack: false },
    { note: 'F', semitone: 5, isBlack: false },
    { note: 'F#', semitone: 6, isBlack: true },
    { note: 'G', semitone: 7, isBlack: false },
    { note: 'G#', semitone: 8, isBlack: true },
    { note: 'A', semitone: 9, isBlack: false },
    { note: 'A#', semitone: 10, isBlack: true },
    { note: 'B', semitone: 11, isBlack: false },
  ];

  // Default QWERTY mapping: white keys on top row, black keys on bottom row
  var DEFAULT_PIANO_KEYMAP = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
    o: 13,
    l: 14,
  };

  /**
   * Calculate frequency from MIDI note number.
   * A4 (MIDI 69) = 440 Hz
   */
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Piano keyboard — realistic black/white key layout.
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {number} [opts.startOctave] - Starting octave (default 4)
   * @param {number} [opts.octaves] - Number of octaves (default 1, max 3)
   * @param {boolean} [opts.labels] - Show note labels (default true)
   * @param {boolean} [opts.hints] - Show keyboard hints (default true)
   * @param {function} [opts.onNoteOn] - cb({ note, octave, frequency, midi, key? })
   * @param {function} [opts.onNoteOff] - cb({ note, octave, frequency, midi, key? })
   * @returns {{ setOctave(n), dispose() }}
   */
  function pianoComponent(container, opts) {
    if (!opts) opts = {};
    var startOctave = opts.startOctave || 4;
    var numOctaves = Math.min(opts.octaves || 1, 3);
    var showLabels = opts.labels !== false;
    var showHints = opts.hints !== false;
    var onNoteOn = opts.onNoteOn || function () {};
    var onNoteOff = opts.onNoteOff || function () {};
    var disposed = false;

    var pianoEl = document.createElement('div');
    pianoEl.className = 'p-piano';
    container.appendChild(pianoEl);

    var activeKeys = {}; // key → true (for dedup)
    var activeMidi = {}; // midi → true (for dedup)
    var whiteKeyEls = []; // ordered white key elements
    var blackKeyEls = []; // black key elements (positioned absolutely)
    var allKeyData = []; // { el, midi, note, octave, freq, isBlack }

    // Build key map for keyboard input
    var keyToMidi = {};
    var keyMapKeys = Object.keys(DEFAULT_PIANO_KEYMAP);
    var baseMidi = (startOctave + 1) * 12; // C of startOctave
    for (var ki = 0; ki < keyMapKeys.length; ki++) {
      var k = keyMapKeys[ki];
      var midiVal = baseMidi + DEFAULT_PIANO_KEYMAP[k];
      keyToMidi[k] = midiVal;
    }

    // Keyboard hint labels (white keys A-L top row, black keys W,E,T,Y,U)
    var whiteHints = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'];
    var blackHints = ['W', 'E', '', 'T', 'Y', 'U', '', 'O', 'P', ''];

    function buildKeys() {
      pianoEl.innerHTML = '';
      whiteKeyEls = [];
      blackKeyEls = [];
      allKeyData = [];
      var whiteCount = 0;

      // First pass: create white keys
      for (var oct = 0; oct < numOctaves; oct++) {
        var octave = startOctave + oct;
        for (var ni = 0; ni < CHROMATIC_NOTES.length; ni++) {
          var cn = CHROMATIC_NOTES[ni];
          var midi = (octave + 1) * 12 + cn.semitone;
          var freq = midiToFreq(midi);

          if (!cn.isBlack) {
            var whiteKey = document.createElement('div');
            whiteKey.className = 'p-piano-key p-piano-key--white';
            whiteKey.dataset.midi = String(midi);

            if (showLabels) {
              var label = document.createElement('span');
              label.className = 'p-piano-key-label';
              label.textContent = cn.note + octave;
              whiteKey.appendChild(label);
            }

            if (showHints && whiteCount < whiteHints.length) {
              var hint = document.createElement('span');
              hint.className = 'p-piano-key-hint';
              hint.textContent = whiteHints[whiteCount] || '';
              whiteKey.appendChild(hint);
            }

            pianoEl.appendChild(whiteKey);
            whiteKeyEls.push(whiteKey);
            allKeyData.push({
              el: whiteKey,
              midi: midi,
              note: cn.note,
              octave: octave,
              freq: freq,
              isBlack: false,
            });
            whiteCount++;
          }
        }
      }

      // Add the top C of the last octave
      var topOctave = startOctave + numOctaves;
      var topMidi = (topOctave + 1) * 12;
      var topFreq = midiToFreq(topMidi);
      var topKey = document.createElement('div');
      topKey.className = 'p-piano-key p-piano-key--white';
      topKey.dataset.midi = String(topMidi);
      if (showLabels) {
        var topLabel = document.createElement('span');
        topLabel.className = 'p-piano-key-label';
        topLabel.textContent = 'C' + topOctave;
        topKey.appendChild(topLabel);
      }
      if (showHints && whiteCount < whiteHints.length) {
        var topHint = document.createElement('span');
        topHint.className = 'p-piano-key-hint';
        topHint.textContent = whiteHints[whiteCount] || '';
        topKey.appendChild(topHint);
      }
      pianoEl.appendChild(topKey);
      whiteKeyEls.push(topKey);
      allKeyData.push({
        el: topKey,
        midi: topMidi,
        note: 'C',
        octave: topOctave,
        freq: topFreq,
        isBlack: false,
      });

      // Second pass: create black keys (positioned absolutely)
      var blackPositions = [1, 2, null, 4, 5, 6, null]; // which white key gaps have black keys (C#,D#,skip,F#,G#,A#,skip)
      var totalWhite = whiteKeyEls.length;
      var blackIdx = 0;

      for (var ooo = 0; ooo < numOctaves; ooo++) {
        var bOctave = startOctave + ooo;
        for (var bp = 0; bp < blackPositions.length; bp++) {
          if (blackPositions[bp] === null) {
            blackIdx++;
            continue;
          }
          var bWhiteIdx = ooo * 7 + blackPositions[bp];
          if (bWhiteIdx >= totalWhite) continue;

          var bSemitone = [1, 3, null, 6, 8, 10, null][bp];
          if (bSemitone === null) continue;
          var bMidi = (bOctave + 1) * 12 + bSemitone;
          var bFreq = midiToFreq(bMidi);
          var bNote = CHROMATIC_NOTES[bSemitone].note;

          var blackKey = document.createElement('div');
          blackKey.className = 'p-piano-key p-piano-key--black';
          blackKey.dataset.midi = String(bMidi);

          // Position: center between the two adjacent white keys
          var leftPercent = ((bWhiteIdx - 0.5) / totalWhite) * 100;
          blackKey.style.left = leftPercent + '%';

          if (showLabels) {
            var bLabel = document.createElement('span');
            bLabel.className = 'p-piano-key-label';
            bLabel.textContent = bNote;
            blackKey.appendChild(bLabel);
          }

          if (showHints && blackIdx < blackHints.length && blackHints[blackIdx]) {
            var bHint = document.createElement('span');
            bHint.className = 'p-piano-key-hint';
            bHint.textContent = blackHints[blackIdx];
            blackKey.appendChild(bHint);
          }

          pianoEl.appendChild(blackKey);
          blackKeyEls.push(blackKey);
          allKeyData.push({
            el: blackKey,
            midi: bMidi,
            note: bNote,
            octave: bOctave,
            freq: bFreq,
            isBlack: true,
          });
          blackIdx++;
        }
      }
    }

    function noteOn(midi, key) {
      if (activeMidi[midi]) return;
      activeMidi[midi] = true;
      var data = null;
      for (var i = 0; i < allKeyData.length; i++) {
        if (allKeyData[i].midi === midi) {
          data = allKeyData[i];
          data.el.classList.add('p-piano-key--active');
          break;
        }
      }
      if (data) {
        onNoteOn({
          note: data.note,
          octave: data.octave,
          frequency: data.freq,
          midi: midi,
          key: key || null,
        });
      }
    }

    function noteOff(midi, key) {
      if (!activeMidi[midi]) return;
      delete activeMidi[midi];
      var data = null;
      for (var i = 0; i < allKeyData.length; i++) {
        if (allKeyData[i].midi === midi) {
          data = allKeyData[i];
          data.el.classList.remove('p-piano-key--active');
          break;
        }
      }
      if (data) {
        onNoteOff({
          note: data.note,
          octave: data.octave,
          frequency: data.freq,
          midi: midi,
          key: key || null,
        });
      }
    }

    // Mouse/touch interaction
    var mouseDown = false;

    function getMidiFromEl(el) {
      var keyEl = el.closest ? el.closest('.p-piano-key') : null;
      if (!keyEl || !keyEl.dataset.midi) return null;
      return parseInt(keyEl.dataset.midi, 10);
    }

    pianoEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      mouseDown = true;
      pianoEl.setPointerCapture(e.pointerId);
      var midi = getMidiFromEl(e.target);
      if (midi !== null) noteOn(midi);
    });

    pianoEl.addEventListener('pointermove', function (e) {
      if (!mouseDown) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      var midi = getMidiFromEl(el);
      // Release any notes that aren't the current one
      var midiKeys = Object.keys(activeMidi);
      for (var i = 0; i < midiKeys.length; i++) {
        var m = parseInt(midiKeys[i], 10);
        if (m !== midi) noteOff(m);
      }
      if (midi !== null) noteOn(midi);
    });

    pianoEl.addEventListener('pointerup', function () {
      mouseDown = false;
      var midiKeys = Object.keys(activeMidi);
      for (var i = 0; i < midiKeys.length; i++) {
        noteOff(parseInt(midiKeys[i], 10));
      }
    });

    pianoEl.addEventListener('pointerleave', function () {
      if (!mouseDown) return;
      mouseDown = false;
      var midiKeys = Object.keys(activeMidi);
      for (var i = 0; i < midiKeys.length; i++) {
        noteOff(parseInt(midiKeys[i], 10));
      }
    });

    // Keyboard input
    function handleKeyDown(e) {
      if (disposed) return;
      var key = e.key.toLowerCase();
      if (keyToMidi[key] !== undefined && !activeKeys[key]) {
        e.preventDefault();
        activeKeys[key] = true;
        noteOn(keyToMidi[key], key);
      }
    }

    function handleKeyUp(e) {
      if (disposed) return;
      var key = e.key.toLowerCase();
      if (keyToMidi[key] !== undefined) {
        e.preventDefault();
        delete activeKeys[key];
        noteOff(keyToMidi[key], key);
      }
    }

    // Listen on iframe document AND via bridge
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Also register with bridge if available
    var bridgeUnsubs = [];
    if (window.prvctice && window.prvctice.input) {
      bridgeUnsubs.push(window.prvctice.input.onKeyDown(handleKeyDown));
      bridgeUnsubs.push(window.prvctice.input.onKeyUp(handleKeyUp));
    }

    buildKeys();

    return {
      setOctave: function (n) {
        startOctave = n;
        baseMidi = (startOctave + 1) * 12;
        for (var mk = 0; mk < keyMapKeys.length; mk++) {
          keyToMidi[keyMapKeys[mk]] = baseMidi + DEFAULT_PIANO_KEYMAP[keyMapKeys[mk]];
        }
        buildKeys();
      },
      noteOn: noteOn,
      noteOff: noteOff,
      dispose: function () {
        disposed = true;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        for (var u = 0; u < bridgeUnsubs.length; u++) {
          if (typeof bridgeUnsubs[u] === 'function') bridgeUnsubs[u]();
        }
        if (pianoEl.parentNode) pianoEl.parentNode.removeChild(pianoEl);
      },
    };
  }

  // ==================== MPC PADS COMPONENT ====================

  var DEFAULT_PAD_KEYMAP_4x4 = [
    '1',
    '2',
    '3',
    '4',
    'q',
    'w',
    'e',
    'r',
    'a',
    's',
    'd',
    'f',
    'z',
    'x',
    'c',
    'v',
  ];

  /**
   * MPC-style pad grid.
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {number} [opts.cols] - Columns (default 4)
   * @param {number} [opts.rows] - Rows (default 4)
   * @param {Array<{label, note?, frequency?, midi?}>} [opts.pads] - Pad definitions
   * @param {boolean} [opts.hints] - Show keyboard hints (default true)
   * @param {function} [opts.onPadOn] - cb({ index, label, frequency?, midi?, key? })
   * @param {function} [opts.onPadOff] - cb({ index, label, frequency?, midi?, key? })
   * @returns {{ dispose() }}
   */
  function padsComponent(container, opts) {
    if (!opts) opts = {};
    var cols = opts.cols || 4;
    var rows = opts.rows || 4;
    var showHints = opts.hints !== false;
    var onPadOn = opts.onPadOn || function () {};
    var onPadOff = opts.onPadOff || function () {};
    var disposed = false;

    var totalPads = cols * rows;
    var padDefs = opts.pads || [];

    // Generate default pad definitions if not provided
    if (padDefs.length === 0) {
      // Default: chromatic scale from C3
      var baseMidi = 48; // C3
      for (var pi = 0; pi < totalPads; pi++) {
        var m = baseMidi + pi;
        padDefs.push({
          label: CHROMATIC_NOTES[m % 12].note + Math.floor(m / 12 - 1),
          midi: m,
          frequency: midiToFreq(m),
        });
      }
    }

    var gridEl = document.createElement('div');
    gridEl.className = 'p-pads';
    gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    container.appendChild(gridEl);

    var padEls = [];
    var activeKeys = {};
    var activePads = {};

    // Build keymap
    var keyToPad = {};
    var keymap = DEFAULT_PAD_KEYMAP_4x4;
    for (var ki = 0; ki < Math.min(keymap.length, totalPads); ki++) {
      keyToPad[keymap[ki]] = ki;
    }

    // Create pad elements
    for (var pi2 = 0; pi2 < totalPads; pi2++) {
      var def = padDefs[pi2] || { label: String(pi2 + 1) };
      var padEl = document.createElement('div');
      padEl.className = 'p-pad';
      padEl.dataset.index = String(pi2);

      var padLabel = document.createElement('span');
      padLabel.className = 'p-pad-label';
      padLabel.textContent = def.label || '';
      padEl.appendChild(padLabel);

      if (showHints && pi2 < keymap.length) {
        var padHint = document.createElement('span');
        padHint.className = 'p-pad-hint';
        padHint.textContent = keymap[pi2].toUpperCase();
        padEl.appendChild(padHint);
      }

      gridEl.appendChild(padEl);
      padEls.push(padEl);
    }

    function padOn(index, key) {
      if (activePads[index]) return;
      activePads[index] = true;
      if (padEls[index]) padEls[index].classList.add('p-pad--active');
      var def = padDefs[index] || {};
      onPadOn({
        index: index,
        label: def.label || '',
        frequency: def.frequency || null,
        midi: def.midi || null,
        key: key || null,
      });
    }

    function padOff(index, key) {
      if (!activePads[index]) return;
      delete activePads[index];
      if (padEls[index]) padEls[index].classList.remove('p-pad--active');
      var def = padDefs[index] || {};
      onPadOff({
        index: index,
        label: def.label || '',
        frequency: def.frequency || null,
        midi: def.midi || null,
        key: key || null,
      });
    }

    // Pointer interaction
    gridEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var pad = e.target.closest('.p-pad');
      if (pad) padOn(parseInt(pad.dataset.index, 10));
    });

    gridEl.addEventListener('pointerup', function (e) {
      var pad = e.target.closest('.p-pad');
      if (pad) padOff(parseInt(pad.dataset.index, 10));
    });

    gridEl.addEventListener('pointerleave', function (e) {
      var pad = e.target.closest('.p-pad');
      if (pad) padOff(parseInt(pad.dataset.index, 10));
    });

    // Keyboard input
    function handleKeyDown(e) {
      if (disposed) return;
      var key = e.key.toLowerCase();
      if (keyToPad[key] !== undefined && !activeKeys[key]) {
        e.preventDefault();
        activeKeys[key] = true;
        padOn(keyToPad[key], key);
      }
    }

    function handleKeyUp(e) {
      if (disposed) return;
      var key = e.key.toLowerCase();
      if (keyToPad[key] !== undefined) {
        e.preventDefault();
        delete activeKeys[key];
        padOff(keyToPad[key], key);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    var bridgeUnsubs = [];
    if (window.prvctice && window.prvctice.input) {
      bridgeUnsubs.push(window.prvctice.input.onKeyDown(handleKeyDown));
      bridgeUnsubs.push(window.prvctice.input.onKeyUp(handleKeyUp));
    }

    return {
      padOn: padOn,
      padOff: padOff,
      dispose: function () {
        disposed = true;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        for (var u = 0; u < bridgeUnsubs.length; u++) {
          if (typeof bridgeUnsubs[u] === 'function') bridgeUnsubs[u]();
        }
        if (gridEl.parentNode) gridEl.parentNode.removeChild(gridEl);
      },
    };
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.ui) {
      attach();
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  function attach() {
    // Audio synthesis namespace
    window.prvctice.audio = {
      tone: playTone,
      sequence: playSequence,
      createContext: getAudioContext,
      createAnalyser: createAnalyser,
      getMasterGain: getMasterGain,
      getAnalyser: getAnalyser,
      createRecorder: createRecorder,
      renderOffline: renderOffline,
      encodeWAV: encodeWAV,
      bufferToBase64: bufferToBase64,
      dispose: disposeAudio,
    };

    // Audio visualization components on ui namespace
    window.prvctice.ui.oscilloscope = oscilloscopeComponent;
    window.prvctice.ui.spectrogram = spectrogramComponent;
    window.prvctice.ui.spectrum = spectrumComponent;
    // Musical input components
    window.prvctice.ui.piano = pianoComponent;
    window.prvctice.ui.pads = padsComponent;
  }

  waitForPrvctice();
})();
