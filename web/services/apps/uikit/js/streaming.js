/**
 * prvctice UI Kit — Streaming AI
 * Provides prvctice.ai.stream(prompt, {onChunk, onDone}) for incremental LLM responses.
 * Uses window.prvctice._bridge.request() for the initial handshake, then listens
 * for push messages (ai:stream_chunk, ai:stream_done, ai:stream_error) from the host.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  var _streamCallbacks = {};

  // Listen for stream push messages from host (outside attach so it's ready early)
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ai:stream_chunk') {
      var cb = _streamCallbacks[msg.streamId];
      if (cb && !cb.cancelled && cb.onChunk) {
        try {
          cb.onChunk(msg.text);
        } catch (e) {
          /* app error */
        }
      }
      return;
    }

    if (msg.type === 'ai:stream_done') {
      var cbDone = _streamCallbacks[msg.streamId];
      if (cbDone) {
        delete _streamCallbacks[msg.streamId];
        if (!cbDone.cancelled && cbDone.onDone) {
          try {
            cbDone.onDone(msg.metadata);
          } catch (e) {
            /* app error */
          }
        }
      }
      return;
    }

    if (msg.type === 'ai:stream_error') {
      var cbErr = _streamCallbacks[msg.streamId];
      if (cbErr) {
        delete _streamCallbacks[msg.streamId];
        if (!cbErr.cancelled && cbErr.onDone) {
          try {
            cbErr.onDone({ error: msg.error });
          } catch (e) {
            /* app error */
          }
        }
      }
      return;
    }
  });

  function attach() {
    if (!window.prvctice || !window.prvctice._bridge) {
      setTimeout(attach, 10);
      return;
    }

    var _request = window.prvctice._bridge.request;

    // Extend ai namespace (don't replace — bridgeSDK already sets ai.complete)
    window.prvctice.ai = window.prvctice.ai || {};

    /**
     * Stream an AI response incrementally.
     * @param {string} prompt - The prompt to send to the LLM.
     * @param {Object} opts - { onChunk: fn(text), onDone: fn(metadata), maxTokens, provider, model }
     * @returns {{ cancel: function }} Handle to cancel the stream.
     */
    window.prvctice.ai.stream = function (prompt, opts) {
      opts = opts || {};
      var onChunk = opts.onChunk || function () {};
      var onDone = opts.onDone || function () {};
      var cancelled = false;
      var streamId = null;

      // Initiate stream via bridge request (resolves immediately with streamId)
      _request({
        type: 'ai:stream',
        prompt: prompt,
        maxTokens: opts.maxTokens,
        provider: opts.provider,
        model: opts.model,
      })
        .then(function (result) {
          if (cancelled) return;
          streamId = result.streamId;
          _streamCallbacks[streamId] = {
            onChunk: onChunk,
            onDone: onDone,
            cancelled: false,
          };
        })
        ['catch'](function (err) {
          if (!cancelled) {
            onDone({ error: err.message || 'Stream failed' });
          }
        });

      return {
        cancel: function () {
          cancelled = true;
          if (streamId && _streamCallbacks[streamId]) {
            _streamCallbacks[streamId].cancelled = true;
            delete _streamCallbacks[streamId];
            // Notify host to abort the backend fetch
            _request({ type: 'ai:stream_cancel', streamId: streamId })['catch'](function () {});
          }
        },
      };
    };
  }

  attach();
})();
