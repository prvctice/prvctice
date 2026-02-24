/**
 * prvctice UI Kit — Transport
 * BPM-aware clock with play/stop/record/seek/loop.
 * Foundation for MIDI-style recording and playback.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Create a BPM-aware transport clock.
   * @param {object} [opts]
   * @param {number} [opts.bpm] - Beats per minute (default 120)
   * @param {boolean} [opts.loop] - Enable loop (default false)
   * @param {number} [opts.loopStart] - Loop start in beats (default 0)
   * @param {number} [opts.loopEnd] - Loop end in beats (default 16)
   * @returns {object} Transport instance
   */
  function createTransport(opts) {
    if (!opts) opts = {};

    var bpm = opts.bpm || 120;
    var loopEnabled = !!opts.loop;
    var loopStart = opts.loopStart || 0;
    var loopEnd = opts.loopEnd || 16;

    // State
    var state = 'stopped'; // 'stopped' | 'playing' | 'recording'
    var positionBeats = 0;
    var lastTimestamp = 0;
    var tickInterval = null;

    // Callbacks
    var tickCallbacks = [];
    var beatCallbacks = [];
    var stateCallbacks = [];
    var lastFiredBeat = -1;

    function getSecondsPerBeat() {
      return 60 / bpm;
    }

    function fireStateChange() {
      for (var i = 0; i < stateCallbacks.length; i++) {
        try {
          stateCallbacks[i](state);
        } catch (e) {
          /* swallow */
        }
      }
    }

    function fireTick() {
      for (var i = 0; i < tickCallbacks.length; i++) {
        try {
          tickCallbacks[i](positionBeats);
        } catch (e) {
          /* swallow */
        }
      }
    }

    function fireBeat(beat) {
      for (var i = 0; i < beatCallbacks.length; i++) {
        try {
          beatCallbacks[i](beat);
        } catch (e) {
          /* swallow */
        }
      }
    }

    function tick() {
      if (state === 'stopped') return;

      var now = performance.now();
      var deltaSec = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      // Clamp delta to avoid huge jumps (e.g. tab was hidden)
      if (deltaSec > 0.1) deltaSec = 0.1;

      var deltaBeats = deltaSec / getSecondsPerBeat();
      positionBeats += deltaBeats;

      // Loop wrapping
      if (loopEnabled && positionBeats >= loopEnd) {
        positionBeats = loopStart + (positionBeats - loopEnd);
        lastFiredBeat = Math.floor(positionBeats) - 1;
      }

      // Fire beat callbacks on each integer beat crossing
      var currentBeat = Math.floor(positionBeats);
      if (currentBeat > lastFiredBeat) {
        for (var b = lastFiredBeat + 1; b <= currentBeat; b++) {
          fireBeat(b);
        }
        lastFiredBeat = currentBeat;
      }

      fireTick();
    }

    function startEngine() {
      if (tickInterval) return;
      lastTimestamp = performance.now();
      lastFiredBeat = Math.floor(positionBeats) - 1;
      tickInterval = setInterval(tick, 16);
    }

    function stopEngine() {
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
    }

    var transport = {
      play: function () {
        if (state === 'playing' || state === 'recording') return transport;
        state = 'playing';
        startEngine();
        fireStateChange();
        return transport;
      },

      stop: function () {
        if (state === 'stopped') return transport;
        state = 'stopped';
        stopEngine();
        positionBeats = 0;
        lastFiredBeat = -1;
        fireStateChange();
        return transport;
      },

      pause: function () {
        if (state === 'stopped') return transport;
        state = 'stopped';
        stopEngine();
        fireStateChange();
        return transport;
      },

      record: function () {
        if (state === 'recording') return transport;
        state = 'recording';
        startEngine();
        fireStateChange();
        return transport;
      },

      seek: function (beats) {
        positionBeats = Math.max(0, beats);
        lastFiredBeat = Math.floor(positionBeats) - 1;
        fireTick();
        return transport;
      },

      getState: function () {
        return state;
      },

      getPositionBeats: function () {
        return positionBeats;
      },

      getBpm: function () {
        return bpm;
      },

      setBpm: function (n) {
        bpm = Math.max(20, Math.min(300, n));
        return transport;
      },

      setLoop: function (enabled, startBeat, endBeat) {
        loopEnabled = !!enabled;
        if (typeof startBeat === 'number') loopStart = startBeat;
        if (typeof endBeat === 'number') loopEnd = endBeat;
        return transport;
      },

      getLoop: function () {
        return { enabled: loopEnabled, start: loopStart, end: loopEnd };
      },

      onTick: function (cb) {
        tickCallbacks.push(cb);
        return function () {
          var idx = tickCallbacks.indexOf(cb);
          if (idx !== -1) tickCallbacks.splice(idx, 1);
        };
      },

      onBeat: function (cb) {
        beatCallbacks.push(cb);
        return function () {
          var idx = beatCallbacks.indexOf(cb);
          if (idx !== -1) beatCallbacks.splice(idx, 1);
        };
      },

      onStateChange: function (cb) {
        stateCallbacks.push(cb);
        return function () {
          var idx = stateCallbacks.indexOf(cb);
          if (idx !== -1) stateCallbacks.splice(idx, 1);
        };
      },

      dispose: function () {
        stopEngine();
        tickCallbacks = [];
        beatCallbacks = [];
        stateCallbacks = [];
        state = 'stopped';
        positionBeats = 0;
      },
    };

    return transport;
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.audio) {
      window.prvctice.audio.createTransport = createTransport;
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
