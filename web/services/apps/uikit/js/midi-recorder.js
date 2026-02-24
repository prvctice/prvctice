/**
 * prvctice UI Kit — MIDI Recorder
 * Records and plays back MIDI note events against a transport clock.
 * Events are stored as beat-position data, not wall-clock time.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Create a MIDI recorder bound to a transport.
   * @param {object} transport - Transport instance from createTransport()
   * @param {object} [opts]
   * @param {boolean} [opts.overdub] - Keep existing events when re-recording (default false)
   * @returns {object} MidiRecorder instance
   */
  function createMidiRecorder(transport, opts) {
    if (!opts) opts = {};
    var overdub = !!opts.overdub;

    // Recorded events: {midi, velocity, startBeat, durationBeats}
    var events = [];
    var armed = false;

    // Open notes being recorded: midi -> {midi, velocity, startBeat}
    var openNotes = {};

    // Playback state
    var playbackHandler = null;
    var playbackOffHandler = null;
    var activePlaybackNotes = {}; // midi -> {endBeat} for notes currently sounding
    var lastPlaybackPos = -1;
    var tickUnsub = null;
    var stateUnsub = null;

    // Lookahead window in beats for scheduling precision
    var LOOKAHEAD_BEATS = 0.05;

    function onTick(pos) {
      // Playback: fire note-on and note-off for events in the current window
      if (playbackHandler && transport.getState() !== 'stopped') {
        var windowStart = lastPlaybackPos;
        var windowEnd = pos + LOOKAHEAD_BEATS;

        // Detect loop wrap: position jumped backward significantly
        var loopWrapped = pos < windowStart - 1;
        if (loopWrapped) {
          // Kill all active playback notes at loop boundary
          var wrapKeys = Object.keys(activePlaybackNotes);
          for (var w = 0; w < wrapKeys.length; w++) {
            if (playbackOffHandler) {
              playbackOffHandler(activePlaybackNotes[wrapKeys[w]].midi);
            }
            delete activePlaybackNotes[wrapKeys[w]];
          }
          // Reset window to catch events from the start
          windowStart = -0.001;
          windowEnd = pos + LOOKAHEAD_BEATS;
        }

        for (var i = 0; i < events.length; i++) {
          var ev = events[i];

          // Note on: event starts within window
          if (ev.startBeat > windowStart && ev.startBeat <= windowEnd) {
            if (!activePlaybackNotes[ev.midi + '_' + ev.startBeat]) {
              activePlaybackNotes[ev.midi + '_' + ev.startBeat] = {
                midi: ev.midi,
                endBeat: ev.startBeat + ev.durationBeats,
              };
              playbackHandler(ev.midi, ev.velocity);
            }
          }
        }

        // Note off: check active playback notes that have ended
        var activeKeys = Object.keys(activePlaybackNotes);
        for (var j = 0; j < activeKeys.length; j++) {
          var key = activeKeys[j];
          var note = activePlaybackNotes[key];
          if (pos >= note.endBeat || loopWrapped) {
            if (playbackOffHandler) {
              playbackOffHandler(note.midi);
            }
            delete activePlaybackNotes[key];
          }
        }

        lastPlaybackPos = pos;
      }
    }

    function onStateChange(newState) {
      if (newState === 'stopped') {
        // Kill any active playback notes
        var activeKeys = Object.keys(activePlaybackNotes);
        for (var i = 0; i < activeKeys.length; i++) {
          var note = activePlaybackNotes[activeKeys[i]];
          if (playbackOffHandler) playbackOffHandler(note.midi);
        }
        activePlaybackNotes = {};
        lastPlaybackPos = -1;

        // Close any open recording notes
        var openKeys = Object.keys(openNotes);
        for (var j = 0; j < openKeys.length; j++) {
          var open = openNotes[openKeys[j]];
          var pos = transport.getPositionBeats();
          var dur = Math.max(0.01, pos - open.startBeat);
          events.push({
            midi: open.midi,
            velocity: open.velocity,
            startBeat: open.startBeat,
            durationBeats: dur,
          });
        }
        openNotes = {};
      }

      if (newState === 'playing' || newState === 'recording') {
        lastPlaybackPos = transport.getPositionBeats() - 0.001;
      }
    }

    // Subscribe to transport
    tickUnsub = transport.onTick(onTick);
    stateUnsub = transport.onStateChange(onStateChange);

    return {
      noteOn: function (midi, velocity) {
        if (!armed || transport.getState() !== 'recording') return;
        velocity = velocity || 100;
        openNotes[midi] = {
          midi: midi,
          velocity: velocity,
          startBeat: transport.getPositionBeats(),
        };
      },

      noteOff: function (midi) {
        if (!openNotes[midi]) return;
        var open = openNotes[midi];
        var pos = transport.getPositionBeats();
        var dur = Math.max(0.01, pos - open.startBeat);
        events.push({
          midi: open.midi,
          velocity: open.velocity,
          startBeat: open.startBeat,
          durationBeats: dur,
        });
        delete openNotes[midi];
      },

      getEvents: function () {
        // Return a copy
        var copy = [];
        for (var i = 0; i < events.length; i++) {
          copy.push({
            midi: events[i].midi,
            velocity: events[i].velocity,
            startBeat: events[i].startBeat,
            durationBeats: events[i].durationBeats,
          });
        }
        return copy;
      },

      setEvents: function (arr) {
        events = [];
        for (var i = 0; i < arr.length; i++) {
          events.push({
            midi: arr[i].midi,
            velocity: arr[i].velocity,
            startBeat: arr[i].startBeat,
            durationBeats: arr[i].durationBeats,
          });
        }
      },

      clear: function () {
        events = [];
        openNotes = {};
      },

      setArmed: function (val) {
        armed = !!val;
        // When arming for a new recording (non-overdub), clear existing events
        if (armed && !overdub) {
          events = [];
        }
      },

      isArmed: function () {
        return armed;
      },

      setOverdub: function (val) {
        overdub = !!val;
      },

      hasEvents: function () {
        return events.length > 0;
      },

      setPlaybackHandler: function (onNoteOn, onNoteOff) {
        playbackHandler = onNoteOn || null;
        playbackOffHandler = onNoteOff || null;
      },

      dispose: function () {
        if (tickUnsub) tickUnsub();
        if (stateUnsub) stateUnsub();
        events = [];
        openNotes = {};
        activePlaybackNotes = {};
        playbackHandler = null;
        playbackOffHandler = null;
      },
    };
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.audio && window.prvctice.audio.createTransport) {
      window.prvctice.audio.createMidiRecorder = createMidiRecorder;
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
