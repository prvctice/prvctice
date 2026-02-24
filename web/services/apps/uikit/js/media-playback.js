/**
 * prvctice UI Kit — Media Playback
 * Audio playback via blob injection and image proxy via host-side resize.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  var _players = {};
  var _nextId = 1;

  // Listen for audio data from host (blob injection pattern)
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'media:audio:data') {
      var player = _players[msg.playerId];
      if (!player) return;
      // Create blob inside iframe (correct origin scoping)
      try {
        var binary = atob(msg.base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        var blob = new Blob([bytes], { type: msg.mimeType || 'audio/mpeg' });
        var url = URL.createObjectURL(blob);
        player.audio.src = url;
        player._blobUrl = url;
        if (player._autoplay) {
          player.audio.play().catch(function () {});
        }
      } catch (e) {
        // Blob creation failed — log but don't crash
        if (typeof console !== 'undefined')
          console.error('[media-playback] blob creation failed:', e);
      }
    }
    if (msg.type === 'media:audio:error') {
      var errPlayer = _players[msg.playerId];
      if (errPlayer && errPlayer._errorCb) {
        errPlayer._errorCb(msg.error || 'Audio load failed');
      }
    }
  });

  function attach() {
    if (!window.prvctice || !window.prvctice._bridge) {
      setTimeout(attach, 10);
      return;
    }

    var _request = window.prvctice._bridge.request;

    // Extend existing media namespace (don't replace — bridgeSDK already sets startMicrophone etc.)
    window.prvctice.media = window.prvctice.media || {};

    /**
     * Play audio from a remote URL via host proxy + blob injection.
     * Returns a player object synchronously with playback controls.
     * @param {string} url - Remote audio URL
     * @returns {{ play, pause, stop, seek, setVolume, getState, onError, dispose }}
     */
    window.prvctice.media.playAudio = function (url) {
      var id = 'player_' + _nextId++;
      var audio = new Audio();
      var errorCb = null;

      _players[id] = { audio: audio, _blobUrl: null, _autoplay: true, _errorCb: null };

      // Ask host to fetch the audio
      _request({ type: 'media:audio:load', url: url, playerId: id }).catch(function (err) {
        if (errorCb) errorCb((err && err.message) || 'Audio load failed');
      });

      return {
        play: function () {
          audio.play().catch(function () {});
        },
        pause: function () {
          audio.pause();
        },
        stop: function () {
          audio.pause();
          audio.currentTime = 0;
        },
        seek: function (t) {
          audio.currentTime = t;
        },
        setVolume: function (v) {
          audio.volume = Math.max(0, Math.min(1, v));
        },
        getState: function () {
          return {
            currentTime: audio.currentTime,
            duration: audio.duration || 0,
            paused: audio.paused,
            ended: audio.ended,
            volume: audio.volume,
          };
        },
        onError: function (cb) {
          errorCb = cb;
          if (_players[id]) _players[id]._errorCb = cb;
        },
        dispose: function () {
          audio.pause();
          audio.src = '';
          if (_players[id] && _players[id]._blobUrl) {
            URL.revokeObjectURL(_players[id]._blobUrl);
          }
          delete _players[id];
        },
      };
    };

    /**
     * Load a remote image through the host proxy with auto-resize to max 800px.
     * Returns a Promise resolving to { dataUri, width, height }.
     * @param {string} url - Remote image URL
     * @returns {Promise<{ dataUri: string, width: number, height: number }>}
     */
    window.prvctice.media.loadImage = function (url) {
      return _request({ type: 'media:image:load', url: url });
    };
  }

  attach();
})();
