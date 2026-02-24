/**
 * prvctice UI Kit — Track Manager
 * Per-track state: mute/solo/volume/arm.
 * Data-only — no DOM, no audio nodes.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Create a track state manager.
   * @param {object} [opts]
   * @param {number} [opts.tracks] - Number of tracks (default 4)
   * @param {function} [opts.onChange] - Callback when any track state changes
   * @returns {object} TrackManager instance
   */
  function createTrackManager(opts) {
    if (!opts) opts = {};
    var numTracks = opts.tracks || 4;
    var onChange = opts.onChange || function () {};

    var tracks = [];
    for (var i = 0; i < numTracks; i++) {
      tracks.push({
        mute: false,
        solo: false,
        volume: 1,
        armed: false,
        label: 'Track ' + (i + 1),
      });
    }

    function notify() {
      try {
        onChange();
      } catch (e) {
        /* swallow */
      }
    }

    function hasSolo() {
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i].solo) return true;
      }
      return false;
    }

    return {
      getTrack: function (idx) {
        var t = tracks[idx];
        if (!t) return null;
        return {
          mute: t.mute,
          solo: t.solo,
          volume: t.volume,
          armed: t.armed,
          label: t.label,
        };
      },

      setMute: function (idx, val) {
        if (!tracks[idx]) return;
        tracks[idx].mute = !!val;
        notify();
      },

      setSolo: function (idx, val) {
        if (!tracks[idx]) return;
        tracks[idx].solo = !!val;
        notify();
      },

      setVolume: function (idx, vol) {
        if (!tracks[idx]) return;
        tracks[idx].volume = Math.max(0, Math.min(1, vol));
        notify();
      },

      setArmed: function (idx, val) {
        if (!tracks[idx]) return;
        tracks[idx].armed = !!val;
        notify();
      },

      setLabel: function (idx, label) {
        if (!tracks[idx]) return;
        tracks[idx].label = label;
        notify();
      },

      /**
       * Get the effective gain for a track, accounting for solo, mute, and volume.
       * @param {number} idx - Track index
       * @returns {number} 0-1
       */
      getEffectiveGain: function (idx) {
        var t = tracks[idx];
        if (!t) return 0;
        if (t.mute) return 0;
        if (hasSolo() && !t.solo) return 0;
        return t.volume;
      },

      getArmedTracks: function () {
        var result = [];
        for (var i = 0; i < tracks.length; i++) {
          if (tracks[i].armed) result.push(i);
        }
        return result;
      },

      getAllTracks: function () {
        var result = [];
        for (var i = 0; i < tracks.length; i++) {
          result.push({
            mute: tracks[i].mute,
            solo: tracks[i].solo,
            volume: tracks[i].volume,
            armed: tracks[i].armed,
            label: tracks[i].label,
          });
        }
        return result;
      },

      getTrackCount: function () {
        return numTracks;
      },
    };
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.audio) {
      window.prvctice.audio.createTrackManager = createTrackManager;
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
