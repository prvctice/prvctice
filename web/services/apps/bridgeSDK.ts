/**
 * Bridge SDK Source Generator
 *
 * Generates the complete JavaScript SDK source code injected into sandboxed
 * iframe srcdoc. The SDK provides the window.prvctice namespace that apps use
 * to communicate with the host via the postMessage bridge.
 *
 * The generated code is ES5-compatible (no imports, no TypeScript, no modules)
 * because it runs inside a sandboxed iframe with only script-src 'unsafe-inline'.
 * Uses an IIFE pattern with the nonce baked in at generation time.
 */

/**
 * Generate the complete SDK source code with the given nonce baked in.
 *
 * The returned string is a self-contained IIFE that:
 * - Establishes the bridge handshake (bridge:hello -> bridge:ready)
 * - Provides window.prvctice.* async API (storage, theme, window)
 * - Auto-responds to ping/pong health checks (invisible to app code)
 * - Queues requests made before handshake and replays after bridge:ready
 * - Times out every bridge request after 30 seconds
 */
export interface SDKOptions {
  nonce: string;
  timezone?: string;
}

export function getSDKSource(nonceOrOpts: string | SDKOptions): string {
  const opts = typeof nonceOrOpts === 'string' ? { nonce: nonceOrOpts } : nonceOrOpts;
  // Escape any single quotes to prevent injection
  const safeNonce = opts.nonce.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeTz = (opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");

  return `(function() {
  'use strict';

  // ==================== INTERNAL STATE ====================

  var _nonce = '${safeNonce}';
  var _timezone = '${safeTz}';
  var _pending = {};
  var _ready = false;
  var _readyQueue = [];
  var _requestQueue = [];
  var _themeCallbacks = [];
  var _focusCallbacks = [];
  var _closeCallbacks = [];
  var _inputMoveCallbacks = [];
  var _inputKeyDownCallbacks = [];
  var _inputKeyUpCallbacks = [];
  var _localKeyboardActive = false;
  var _refreshCallbacks = [];
  var _disposeCallbacks = [];
  var _chatMessageCallbacks = [];
  var _chatStreamingCallbacks = [];
  var _chatConversationCallbacks = [];
  var _cameraFrameCallbacks = [];
  var _gifProgressCallbacks = {}; // encoderId -> [cb]
  var _broadcastCallbacks = {}; // channel -> [cb]
  var _contextAppOpenedCallbacks = [];
  var _contextAppClosedCallbacks = [];
  var _mixerStateCallbacks = [];
  var _mixerDisconnectedCallbacks = [];
  var _sdkVersion = null; // set by bridge:ready handshake

  // ==================== INTERNAL FUNCTIONS ====================

  function _send(msg) {
    msg.nonce = _nonce;
    window.parent.postMessage(msg, '*');
  }

  function _genId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for non-secure contexts (e.g. Electron file://)
    var buf = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      for (var i = 0; i < 16; i++) buf[i] = Math.random() * 256 | 0;
    }
    var hex = '';
    for (var j = 0; j < 16; j++) hex += (buf[j] < 16 ? '0' : '') + buf[j].toString(16);
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
  }

  var _DEFAULT_TIMEOUT = 30000;
  var _LONG_TIMEOUT = 120000;

  function _request(msg, timeoutMs) {
    var requestId = _genId();
    var timeout = timeoutMs || _DEFAULT_TIMEOUT;

    if (!_ready) {
      // Queue request until handshake completes (Pitfall 3)
      return new Promise(function(resolve, reject) {
        _requestQueue.push({
          msg: msg,
          requestId: requestId,
          resolve: resolve,
          reject: reject,
          timeout: timeout
        });
      });
    }

    return new Promise(function(resolve, reject) {
      var timeoutId = setTimeout(function() {
        if (_pending[requestId]) {
          delete _pending[requestId];
          var err = new Error('Bridge request timed out');
          err.code = 'TIMEOUT';
          reject(err);
        }
      }, timeout);

      _pending[requestId] = {
        resolve: resolve,
        reject: reject,
        timeoutId: timeoutId
      };

      _send(Object.assign({}, msg, { requestId: requestId }));
    });
  }

  // Resolve a weather location argument: accept string, { lat, lon }, [lat, lon],
  // { city/name: 'X' }. For anything else (empty, null, {}) fall back to device location.
  function _weatherLoc(loc) {
    if (typeof loc === 'string' && loc.trim()) return Promise.resolve(loc);
    if (Array.isArray(loc) && loc.length >= 2) return Promise.resolve(loc);
    if (loc && typeof loc === 'object') {
      if (loc.lat != null && (loc.lon != null || loc.lng != null || loc.longitude != null)) return Promise.resolve(loc);
      if (loc.latitude != null && loc.longitude != null) return Promise.resolve(loc);
      var nameVal = loc.name || loc.city || loc.location;
      if (typeof nameVal === 'string' && nameVal.trim()) return Promise.resolve(nameVal);
    }
    // Auto-resolve via device location connector
    return _request({ type: 'connector:request', connector: 'location', method: 'current', params: {} });
  }

  function _replayQueue() {
    var queue = _requestQueue;
    _requestQueue = [];

    queue.forEach(function(item) {
      var timeoutId = setTimeout(function() {
        if (_pending[item.requestId]) {
          delete _pending[item.requestId];
          var err = new Error('Bridge request timed out');
          err.code = 'TIMEOUT';
          item.reject(err);
        }
      }, item.timeout || _DEFAULT_TIMEOUT);

      _pending[item.requestId] = {
        resolve: item.resolve,
        reject: item.reject,
        timeoutId: timeoutId
      };

      _send(Object.assign({}, item.msg, { requestId: item.requestId }));
    });
  }

  // ==================== LOCAL KEYBOARD LISTENERS ====================
  // When the iframe has focus, the host document doesn't receive keyboard
  // events, so postMessage-relayed input:keydown/keyup never fire. We also
  // listen directly on the iframe's own document so keyboard works regardless
  // of which document is focused.

  function _setupLocalKeyboard() {
    if (_localKeyboardActive) return;
    _localKeyboardActive = true;

    document.addEventListener('keydown', function(e) {
      for (var i = 0; i < _inputKeyDownCallbacks.length; i++) {
        try { _inputKeyDownCallbacks[i](e); } catch(ex) {}
      }
    });

    document.addEventListener('keyup', function(e) {
      for (var i = 0; i < _inputKeyUpCallbacks.length; i++) {
        try { _inputKeyUpCallbacks[i](e); } catch(ex) {}
      }
    });
  }

  // ==================== MESSAGE LISTENER ====================

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    // Ping/pong: auto-respond, invisible to app code
    if (msg.type === 'ping') {
      _send({ type: 'pong' });
      return;
    }

    // Handshake completion
    if (msg.type === 'bridge:ready') {
      _ready = true;
      _sdkVersion = msg.sdkVersion || null;
      // Replay queued requests
      _replayQueue();
      // Fire ready callbacks
      var callbacks = _readyQueue;
      _readyQueue = [];
      callbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
      return;
    }

    // Action execution from host
    if (msg.type === 'action:execute') {
      var _actionHandlers = window.prvctice._actionHandlers || {};
      var handler = _actionHandlers[msg.actionId];
      if (handler) {
        Promise.resolve().then(function() {
          return handler(msg.payload, msg.params);
        }).then(function(result) {
          _send({ type: 'action:result', requestId: msg.requestId, data: result });
        }).catch(function(err) {
          _send({ type: 'action:result', requestId: msg.requestId, error: err && err.message || 'Action failed', code: 'CONNECTOR_ERROR' });
        });
      } else {
        _send({ type: 'action:result', requestId: msg.requestId, error: 'Action not found: ' + msg.actionId, code: 'INVALID_REQUEST' });
      }
      return;
    }

    // Chat message push
    if (msg.type === 'chat:message') {
      for (var ci = 0; ci < _chatMessageCallbacks.length; ci++) {
        try { _chatMessageCallbacks[ci](msg.message); } catch(e) {}
      }
      return;
    }

    // Chat streaming push
    if (msg.type === 'chat:streaming') {
      for (var si = 0; si < _chatStreamingCallbacks.length; si++) {
        try { _chatStreamingCallbacks[si]({ buffer: msg.buffer, active: msg.active }); } catch(e) {}
      }
      return;
    }

    // Chat conversation changed
    if (msg.type === 'chat:conversation_changed') {
      for (var cci = 0; cci < _chatConversationCallbacks.length; cci++) {
        try { _chatConversationCallbacks[cci]({ conversationId: msg.conversationId, title: msg.title }); } catch(e) {}
      }
      return;
    }

    // Broadcast message push
    if (msg.type === 'broadcast:message') {
      var bcChannel = msg.channel;
      var bcCbs = _broadcastCallbacks[bcChannel];
      if (bcCbs) {
        for (var bi = 0; bi < bcCbs.length; bi++) {
          try { bcCbs[bi](msg.data, { channel: bcChannel, fromAppId: msg.fromAppId }); } catch(e) {}
        }
      }
      return;
    }

    // Context app lifecycle push
    if (msg.type === 'context:app_opened') {
      for (var oi = 0; oi < _contextAppOpenedCallbacks.length; oi++) {
        try { _contextAppOpenedCallbacks[oi](msg.app); } catch(e) {}
      }
      return;
    }

    if (msg.type === 'context:app_closed') {
      for (var cli = 0; cli < _contextAppClosedCallbacks.length; cli++) {
        try { _contextAppClosedCallbacks[cli](msg.app); } catch(e) {}
      }
      return;
    }

    // Camera frame push
    if (msg.type === 'media:camera:frame') {
      for (var cfi = 0; cfi < _cameraFrameCallbacks.length; cfi++) {
        try { _cameraFrameCallbacks[cfi](msg.dataUri, { timestamp: msg.timestamp, width: msg.width, height: msg.height }); } catch(e) {}
      }
      return;
    }

    // GIF progress push
    if (msg.type === 'media:gif:progress') {
      var gpcbs = _gifProgressCallbacks[msg.encoderId];
      if (gpcbs) {
        for (var gpi = 0; gpi < gpcbs.length; gpi++) {
          try { gpcbs[gpi](msg.percent); } catch(e) {}
        }
      }
      return;
    }

    // Mixer state push
    if (msg.type === 'mixer:state_update') {
      for (var msi = 0; msi < _mixerStateCallbacks.length; msi++) {
        try { _mixerStateCallbacks[msi](msg.state); } catch(e) {}
      }
      return;
    }

    // Mixer disconnected push
    if (msg.type === 'mixer:disconnected') {
      for (var mdi = 0; mdi < _mixerDisconnectedCallbacks.length; mdi++) {
        try { _mixerDisconnectedCallbacks[mdi](); } catch(e) {}
      }
      return;
    }

    // Response correlation
    if (msg.requestId && _pending[msg.requestId]) {
      var p = _pending[msg.requestId];
      delete _pending[msg.requestId];
      clearTimeout(p.timeoutId);
      if (msg.error) {
        var err = new Error(msg.error);
        err.code = msg.code || 'CONNECTOR_ERROR';
        p.reject(err);
      } else {
        p.resolve(msg.data !== undefined ? msg.data : undefined);
      }
      return;
    }

    // Theme updates -- auto-apply CSS custom properties and override body styles
    if (msg.type === 'theme:update') {
      if (msg.theme && typeof msg.theme === 'object') {
        var root = document.documentElement;
        var t = msg.theme;
        // Set CSS custom properties on :root
        if (t.background) root.style.setProperty('--prvctice-background', t.background);
        if (t.surface) root.style.setProperty('--prvctice-surface', t.surface);
        if (t.text) root.style.setProperty('--prvctice-text', t.text);
        if (t.textSecondary) root.style.setProperty('--prvctice-text-secondary', t.textSecondary);
        if (t.primary) root.style.setProperty('--prvctice-primary', t.primary);
        if (t.secondary) root.style.setProperty('--prvctice-secondary', t.secondary);
        if (t.accent) root.style.setProperty('--prvctice-accent', t.accent);
        if (t.border) root.style.setProperty('--prvctice-border', t.border);

        // Inject/update a style tag that forces body to use theme colors.
        // Uses !important to override any LLM-generated body background/color.
        var styleId = '_prvctice_theme';
        var el = document.getElementById(styleId);
        if (!el) {
          el = document.createElement('style');
          el.id = styleId;
          (document.body || document.documentElement).appendChild(el);
        }
        el.textContent = 'html body{background:transparent!important;color:var(--prvctice-text)!important}';
      }
      _themeCallbacks.forEach(function(cb) { try { cb(msg.theme); } catch(e) {} });
      return;
    }

    // Focus/blur events
    if (msg.type === 'app:focus' || msg.type === 'app:blur') {
      var focused = msg.type === 'app:focus';
      _focusCallbacks.forEach(function(cb) { try { cb(focused); } catch(e) {} });
      return;
    }

    // Close event — fire dispose callbacks first, then close callbacks
    if (msg.type === 'app:close') {
      _disposeCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
      _closeCallbacks.forEach(function(cb) { try { cb(); } catch(e) {} });
      // Auto-close UIKit AudioContext so it is always released even if
      // the app did not call prvctice.audio.dispose() in its onDispose.
      if (window.prvctice && window.prvctice.audio && typeof window.prvctice.audio.dispose === 'function') {
        try { window.prvctice.audio.dispose(); } catch(e) {}
      }
      return;
    }

    // Audio data stream from parent mic handler
    if (msg.type === 'media:audio_data') {
      var cbs = window.prvctice && window.prvctice.media ? window.prvctice.media._audioCallbacks : [];
      for (var ai = 0; ai < cbs.length; ai++) {
        try { cbs[ai](msg.data, msg.waveform); } catch(e) {}
      }
      return;
    }

    // Input move events (hand tracking relay from host)
    if (msg.type === 'input:move') {
      for (var i = 0; i < _inputMoveCallbacks.length; i++) {
        try { _inputMoveCallbacks[i]({ x: msg.x, y: msg.y, rawX: msg.rawX, rawY: msg.rawY, source: msg.source }); }
        catch(e) {}
      }
      return;
    }

    // Keyboard events relayed from host (when main doc has focus).
    // Add preventDefault/stopPropagation stubs so app callbacks that call
    // e.preventDefault() don't throw on the plain object.
    if (msg.type === 'input:keydown') {
      var kde = msg.event || {};
      if (!kde.preventDefault) kde.preventDefault = function() {};
      if (!kde.stopPropagation) kde.stopPropagation = function() {};
      for (var kdi = 0; kdi < _inputKeyDownCallbacks.length; kdi++) {
        try { _inputKeyDownCallbacks[kdi](kde); } catch(e) {}
      }
      return;
    }

    if (msg.type === 'input:keyup') {
      var kue = msg.event || {};
      if (!kue.preventDefault) kue.preventDefault = function() {};
      if (!kue.stopPropagation) kue.stopPropagation = function() {};
      for (var kui = 0; kui < _inputKeyUpCallbacks.length; kui++) {
        try { _inputKeyUpCallbacks[kui](kue); } catch(e) {}
      }
      return;
    }

    // Refresh tick from parent-managed timer
    if (msg.type === 'refresh') {
      for (var ri = 0; ri < _refreshCallbacks.length; ri++) {
        try { _refreshCallbacks[ri](); } catch(e) {}
      }
      return;
    }

    // Entrance animation trigger from host
    if (msg.type === 'animate:entrance') {
      var body = document.body;
      var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reducedMotion) {
        body.style.opacity = '0';
        body.style.transform = 'translateY(8px)';
        body.style.transition = 'opacity var(--p-spring-gentle-t, 800ms) ease-out, transform var(--p-spring-gentle-t, 800ms) var(--p-spring-gentle, ease-out)';
        // Force a reflow to ensure the initial state is applied before transitioning
        void body.offsetHeight;
        body.style.opacity = '1';
        body.style.transform = 'translateY(0)';
      }

      // Stagger list items if any exist
      var items = document.querySelectorAll('.p-stack > *, .p-list > *, .p-row > *');
      if (!reducedMotion && items.length > 1) {
        for (var si = 0; si < items.length; si++) {
          var item = items[si];
          item.style.opacity = '0';
          item.style.transform = 'translateY(6px)';
          item.style.transition = 'opacity var(--p-spring-standard-t, 500ms) ease-out, transform var(--p-spring-standard-t, 500ms) var(--p-spring-standard, ease-out)';
          item.style.transitionDelay = (si * 40) + 'ms';
        }
        // Trigger transitions after reflow
        void document.body.offsetHeight;
        for (var sj = 0; sj < items.length; sj++) {
          items[sj].style.opacity = '1';
          items[sj].style.transform = 'translateY(0)';
        }
      }
      return;
    }
  });

  // ==================== PUBLIC API ====================

  window.prvctice = {
    /** SDK version from host handshake (null until bridge:ready). */
    get sdkVersion() { return _sdkVersion; },

    onReady: function(cb) {
      if (typeof cb !== 'function') return;
      if (_ready) {
        try { cb(); } catch(e) {}
      } else {
        _readyQueue.push(cb);
      }
    },

    storage: {
      get: function(key) {
        return _request({ type: 'storage:get', key: key });
      },
      set: function(key, value) {
        return _request({ type: 'storage:set', key: key, value: value });
      },
      delete: function(key) {
        return _request({ type: 'storage:delete', key: key });
      },
      usage: function() {
        return _request({ type: 'storage:usage' });
      }
    },

    theme: {
      get: function() {
        return _request({ type: 'theme:get' });
      },
      onChange: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _themeCallbacks.push(cb);
        _send({ type: 'theme:subscribe' });
        return function() {
          var i = _themeCallbacks.indexOf(cb);
          if (i >= 0) _themeCallbacks.splice(i, 1);
        };
      }
    },

    window: {
      resize: function(w, h) {
        _send({ type: 'app:resize', width: w, height: h });
      },
      setTitle: function(t) {
        _send({ type: 'app:title', title: t });
      },
      onFocus: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _focusCallbacks.push(cb);
        return function() {
          var i = _focusCallbacks.indexOf(cb);
          if (i >= 0) _focusCallbacks.splice(i, 1);
        };
      },
      onClose: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _closeCallbacks.push(cb);
        return function() {
          var i = _closeCallbacks.indexOf(cb);
          if (i >= 0) _closeCallbacks.splice(i, 1);
        };
      }
    },

    openUrl: function(url) {
      if (typeof url !== 'string' || !url) return;
      _send({ type: 'app:openUrl', url: url });
    },

    // ==================== CONNECTOR APIs ====================

    weather: {
      current: function(location) {
        var resolveLocation = _weatherLoc(location);
        return resolveLocation.then(function(loc) {
          return _request({ type: 'connector:request', connector: 'context', method: 'getUser', params: {} })
            .then(function(user) { return user.temperatureUnit === 'fahrenheit' ? 'imperial' : 'metric'; })
            .catch(function() { return 'imperial'; })
            .then(function(u) {
              return _request({ type: 'connector:request', connector: 'weather', method: 'current', params: { location: loc, units: u } });
            });
        });
      },
      forecast: function(location, days) {
        var resolveLocation = _weatherLoc(location);
        return resolveLocation.then(function(loc) {
          return _request({ type: 'connector:request', connector: 'context', method: 'getUser', params: {} })
            .then(function(user) { return user.temperatureUnit === 'fahrenheit' ? 'imperial' : 'metric'; })
            .catch(function() { return 'imperial'; })
            .then(function(u) {
              return _request({ type: 'connector:request', connector: 'weather', method: 'forecast', params: { location: loc, days: days || 7, units: u } });
            });
        });
      }
    },

    news: {
      fetch: function(feedUrl) {
        return _request({ type: 'connector:request', connector: 'news', method: 'fetch', params: { feedUrl: feedUrl } });
      },
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'news', method: 'search', params: { query: query, limit: limit } });
      },
      headlines: function(topic, limit) {
        return _request({ type: 'connector:request', connector: 'news', method: 'headlines', params: { topic: topic, limit: limit } });
      }
    },

    web: {
      fetch: function(url, options) {
        return _request({ type: 'connector:request', connector: 'web-fetch', method: 'fetch', params: { url: url, options: options } });
      }
    },

    time: {
      now: function() { return new Date().toISOString(); },
      timezone: function() { return _timezone; }
    },

    location: {
      current: function() {
        return _request({ type: 'connector:request', connector: 'location', method: 'current', params: {} });
      },
      geocode: function(name) {
        return _request({ type: 'connector:request', connector: 'geocoding', method: 'geocode', params: { name: name } });
      },
      reverseGeocode: function(lat, lon) {
        return _request({ type: 'connector:request', connector: 'geocoding', method: 'reverseGeocode', params: { lat: lat, lon: lon } });
      }
    },

    ai: {
      complete: function(prompt, options) {
        return _request({ type: 'connector:request', connector: 'ai', method: 'complete', params: { prompt: prompt, options: options } });
      }
    },

    enrich: function(data, question, options) {
      if (typeof question !== 'string' || !question) {
        return Promise.reject(new Error('question must be a non-empty string'));
      }
      return _request({
        type: 'enrich:request',
        data: data,
        question: question,
        options: options || {}
      });
    },

    skills: {
      list: function() {
        return _request({ type: 'connector:request', connector: 'skills', method: 'list', params: {} });
      },
      execute: function(skillId, input) {
        return _request({ type: 'connector:request', connector: 'skills', method: 'execute', params: { skillId: skillId, input: input } });
      }
    },

    calendar: {
      parse: function(content) {
        return _request({ type: 'connector:request', connector: 'calendar', method: 'parse', params: { content: content } });
      }
    },

    clipboard: {
      readText: function() {
        return _request({ type: 'connector:request', connector: 'clipboard', method: 'readText', params: {} });
      },
      writeText: function(text) {
        return _request({ type: 'connector:request', connector: 'clipboard', method: 'writeText', params: { text: text } });
      }
    },

    files: {
      read: function(path) {
        return _request({ type: 'connector:request', connector: 'files', method: 'read', params: { path: path } });
      },
      list: function(directory) {
        return _request({ type: 'connector:request', connector: 'files', method: 'list', params: { directory: directory } });
      }
    },

    // ==================== VFS API (cross-platform host data access) ====================

    fs: {
      read: function(path) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'read', params: { path: path } });
      },
      list: function(path) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'list', params: { path: path } });
      },
      stat: function(path) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'stat', params: { path: path } });
      },
      /** Read a VFS path and return its data as a data URL string. */
      readAsDataUrl: function(path) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'read', params: { path: path } })
          .then(function(result) {
            var data = result.data;
            var mime = result.mime || 'application/octet-stream';
            // Convert ArrayBuffer to data URL via Blob + FileReader
            var blob = new Blob([data], { type: mime });
            return new Promise(function(resolve) {
              var reader = new FileReader();
              reader.onload = function() { resolve(reader.result); };
              reader.readAsDataURL(blob);
            });
          });
      },
      /** Save base64 data to the file library (appears in Files window). */
      saveBlob: function(base64, mime, name, thumbnail) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'write', params: { data: base64, mime: mime || 'application/octet-stream', name: name || ('file-' + Date.now()), thumbnail: thumbnail || null } });
      },
      /** List blobs filtered by mime type prefix (e.g. 'image/', 'video/'). */
      listBlobs: function(accept) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'list', params: { path: '/blobs' } })
          .then(function(result) {
            var entries = result.entries || [];
            if (!accept) return entries;
            var prefixes = accept.split(',').map(function(s) { return s.trim().replace('*', ''); });
            return entries.filter(function(entry) {
              if (!entry.mime) return false;
              for (var i = 0; i < prefixes.length; i++) {
                if (entry.mime.indexOf(prefixes[i]) === 0) return true;
              }
              return false;
            });
          });
      },
      /**
       * List file library entries with full metadata (id, name, mime, uploadedAt, thumbnailId).
       * Filter by MIME prefix e.g. 'image/png,image/gif' or 'audio/'.
       * Returns newest first. Use this instead of listBlobs when you need filenames or thumbnails.
       */
      listFiles: function(accept) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'listFiles', params: { accept: accept || null } })
          .then(function(result) { return result.files || []; });
      },
      /** Delete a file from the library by ID. Removes blob + thumbnail. Reflects immediately in Files panel. */
      deleteBlob: function(id) {
        return _request({ type: 'connector:request', connector: 'vfs', method: 'delete', params: { id: id } });
      }
    },

    wikipedia: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'wikipedia', method: 'search', params: { query: query, limit: limit } });
      },
      images: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'wikipedia', method: 'images', params: { query: query, limit: limit } });
      }
    },

    movies: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'movies', method: 'search', params: { query: query, limit: limit } });
      },
      trending: function(mediaType, timeWindow) {
        return _request({ type: 'connector:request', connector: 'movies', method: 'trending', params: { mediaType: mediaType, timeWindow: timeWindow } });
      }
    },

    books: {
      search: function(query, limit, author) {
        return _request({ type: 'connector:request', connector: 'books', method: 'search', params: { query: query, limit: limit, author: author } });
      }
    },

    academic: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'academic', method: 'search', params: { query: query, limit: limit } });
      }
    },

    art: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'art', method: 'search', params: { query: query, limit: limit } });
      },
      searchArtInstitute: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'art', method: 'searchArtInstitute', params: { query: query, limit: limit } });
      },
      searchMetMuseum: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'art', method: 'searchMetMuseum', params: { query: query, limit: limit } });
      }
    },

    music: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'music', method: 'search', params: { query: query, limit: limit } });
      }
    },

    sports: {
      scores: function(sportOrOpts, league) {
        var p = (typeof sportOrOpts === 'object' && sportOrOpts !== null) ? sportOrOpts : { sport: sportOrOpts, league: league };
        return _request({ type: 'connector:request', connector: 'sports', method: 'scores', params: p });
      },
      standings: function(sportOrOpts, league) {
        var p = (typeof sportOrOpts === 'object' && sportOrOpts !== null) ? sportOrOpts : { sport: sportOrOpts, league: league };
        return _request({ type: 'connector:request', connector: 'sports', method: 'standings', params: p });
      },
      schedule: function(sportOrOpts, league) {
        var p = (typeof sportOrOpts === 'object' && sportOrOpts !== null) ? sportOrOpts : { sport: sportOrOpts, league: league };
        return _request({ type: 'connector:request', connector: 'sports', method: 'schedule', params: p });
      }
    },

    markets: {
      crypto: function(ids, vs) {
        return _request({ type: 'connector:request', connector: 'markets', method: 'crypto', params: { ids: ids, vs: vs } });
      },
      stock: function(symbol) {
        return _request({ type: 'connector:request', connector: 'markets', method: 'stock', params: { symbol: symbol } });
      },
      trending: function() {
        return _request({ type: 'connector:request', connector: 'markets', method: 'trending', params: {} });
      }
    },

    youtube: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'youtube', method: 'search', params: { query: query, limit: limit } });
      }
    },

    europeana: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'europeana', method: 'search', params: { query: query, limit: limit } });
      }
    },

    smithsonian: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'smithsonian', method: 'search', params: { query: query, limit: limit } });
      }
    },

    loc: {
      search: function(query, limit) {
        return _request({ type: 'connector:request', connector: 'loc', method: 'search', params: { query: query, limit: limit } });
      }
    },

    googleBooks: {
      search: function(query, limit, author) {
        return _request({ type: 'connector:request', connector: 'google-books', method: 'search', params: { query: query, limit: limit, author: author } });
      }
    },

    films: {
      search: function(options) {
        return _request({ type: 'connector:request', connector: 'films', method: 'search', params: options || {} });
      }
    },

    vision: {
      describe: function(imageData, prompt, provider) {
        return _request({ type: 'connector:request', connector: 'vision', method: 'describe', params: { imageData: imageData, prompt: prompt, provider: provider } });
      }
    },

    mediaTools: {
      probe: function(opts) {
        return _request({ type: 'connector:request', connector: 'media-tools', method: 'probe', params: opts || {} });
      },
      convert: function(opts) {
        return _request({ type: 'connector:request', connector: 'media-tools', method: 'convert', params: opts || {} }, _LONG_TIMEOUT);
      },
      extractAudio: function(opts) {
        return _request({ type: 'connector:request', connector: 'media-tools', method: 'extractAudio', params: opts || {} }, _LONG_TIMEOUT);
      },
      screenshot: function(opts) {
        return _request({ type: 'connector:request', connector: 'media-tools', method: 'screenshot', params: opts || {} }, _LONG_TIMEOUT);
      },
      trim: function(opts) {
        return _request({ type: 'connector:request', connector: 'media-tools', method: 'trim', params: opts || {} }, _LONG_TIMEOUT);
      },
      download: function(url, options) {
        return new Promise(function(resolve, reject) {
          var downloadId = _genId();
          var onComplete = function(event) {
            var msg = event.data;
            if (!msg || msg.type !== 'media-tools:download:complete' || msg.downloadId !== downloadId || msg.nonce !== _nonce) return;
            window.removeEventListener('message', onComplete);
            window.removeEventListener('message', onError);
            resolve(msg.data);
          };
          var onError = function(event) {
            var msg = event.data;
            if (!msg || msg.type !== 'media-tools:download:error' || msg.downloadId !== downloadId || msg.nonce !== _nonce) return;
            window.removeEventListener('message', onComplete);
            window.removeEventListener('message', onError);
            var err = new Error(msg.error || 'Download failed');
            err.code = 'DOWNLOAD_ERROR';
            reject(err);
          };
          window.addEventListener('message', onComplete);
          window.addEventListener('message', onError);
          _send({ type: 'media-tools:download', url: url, options: options || {}, downloadId: downloadId });
        });
      }
    },

    media: {
      _audioCallbacks: [],
      startMicrophone: function(opts) {
        opts = opts || {};
        var mode = opts.mode || 'both';
        var voiceParams = opts.voiceParams || undefined;
        return _request({ type: 'media:microphone:start', mode: mode, voiceParams: voiceParams });
      },
      stopMicrophone: function() {
        return _request({ type: 'media:microphone:stop' });
      },
      updateVoiceParams: function(params) {
        return _request({ type: 'media:microphone:params', params: params });
      },
      onAudioData: function(cb) {
        if (typeof cb !== 'function') return function() {};
        window.prvctice.media._audioCallbacks.push(cb);
        return function() {
          var idx = window.prvctice.media._audioCallbacks.indexOf(cb);
          if (idx !== -1) window.prvctice.media._audioCallbacks.splice(idx, 1);
        };
      },
      download: function(base64, filename, mimeType) {
        return _request({ type: 'media:download', base64: base64, filename: filename, mimeType: mimeType });
      },
      saveUrl: function(url, filename) {
        return _request({ type: 'media:saveUrl', url: url, filename: filename });
      }
    },

    // ==================== CAMERA API ====================

    camera: {
      start: function(opts) {
        opts = opts || {};
        return _request({
          type: 'media:camera:start',
          resolution: opts.resolution || 'medium',
          fps: opts.fps || 12,
          facingMode: opts.facingMode || 'user'
        });
      },
      capture: function() {
        return _request({ type: 'media:camera:capture' });
      },
      stop: function() {
        return _request({ type: 'media:camera:stop' });
      },
      onFrame: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _cameraFrameCallbacks.push(cb);
        return function() {
          var idx = _cameraFrameCallbacks.indexOf(cb);
          if (idx !== -1) _cameraFrameCallbacks.splice(idx, 1);
        };
      }
    },

    // ==================== VIDEO API ====================

    video: {
      load: function(opts) {
        opts = opts || {};
        if (!opts.playerId) opts.playerId = _genId();
        return _request({
          type: 'media:video:load',
          playerId: opts.playerId,
          base64: opts.base64,
          url: opts.url,
          mimeType: opts.mimeType
        }).then(function(result) {
          result.playerId = opts.playerId;
          return result;
        });
      },
      play: function(playerId, startTime) {
        return _request({ type: 'media:video:play', playerId: playerId, startTime: startTime });
      },
      pause: function(playerId) {
        return _request({ type: 'media:video:pause', playerId: playerId });
      },
      seek: function(playerId, time) {
        return _request({ type: 'media:video:seek', playerId: playerId, time: time });
      },
      seekAndCapture: function(playerId, time, width, height) {
        return _request({ type: 'media:video:seekAndCapture', playerId: playerId, time: time, width: width, height: height });
      },
      unload: function(playerId) {
        return _request({ type: 'media:video:unload', playerId: playerId });
      }
    },

    // ==================== GIF ENCODER API ====================

    gif: {
      create: function(opts) {
        opts = opts || {};
        if (!opts.encoderId) opts.encoderId = _genId();
        return _request({
          type: 'media:gif:create',
          encoderId: opts.encoderId,
          width: opts.width || 400,
          height: opts.height || 300,
          quality: opts.quality || 'medium'
        }).then(function(result) {
          result.encoderId = opts.encoderId;
          return result;
        });
      },
      addFrame: function(encoderId, dataUri, delay) {
        return _request({ type: 'media:gif:addFrame', encoderId: encoderId, dataUri: dataUri, delay: delay });
      },
      finish: function(encoderId) {
        return _request({ type: 'media:gif:finish', encoderId: encoderId }, _LONG_TIMEOUT);
      },
      cancel: function(encoderId) {
        return _request({ type: 'media:gif:cancel', encoderId: encoderId });
      },
      onProgress: function(encoderId, cb) {
        if (typeof cb !== 'function') return function() {};
        if (!_gifProgressCallbacks[encoderId]) {
          _gifProgressCallbacks[encoderId] = [];
        }
        _gifProgressCallbacks[encoderId].push(cb);
        return function() {
          var arr = _gifProgressCallbacks[encoderId];
          if (arr) {
            var idx = arr.indexOf(cb);
            if (idx !== -1) arr.splice(idx, 1);
          }
        };
      }
    },

    input: {
      onMove: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _inputMoveCallbacks.push(cb);
        return function() {
          var idx = _inputMoveCallbacks.indexOf(cb);
          if (idx !== -1) _inputMoveCallbacks.splice(idx, 1);
        };
      },
      onKeyDown: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _inputKeyDownCallbacks.push(cb);
        // Tell host we want keyboard events (for when main doc has focus)
        _send({ type: 'input:subscribe:keyboard' });
        // Also listen locally (for when iframe has focus)
        _setupLocalKeyboard();
        return function() {
          var idx = _inputKeyDownCallbacks.indexOf(cb);
          if (idx !== -1) _inputKeyDownCallbacks.splice(idx, 1);
        };
      },
      onKeyUp: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _inputKeyUpCallbacks.push(cb);
        _send({ type: 'input:subscribe:keyboard' });
        _setupLocalKeyboard();
        return function() {
          var idx = _inputKeyUpCallbacks.indexOf(cb);
          if (idx !== -1) _inputKeyUpCallbacks.splice(idx, 1);
        };
      }
    },

    refresh: {
      onRefresh: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _refreshCallbacks.push(cb);
        return function() {
          var idx = _refreshCallbacks.indexOf(cb);
          if (idx !== -1) _refreshCallbacks.splice(idx, 1);
        };
      },
      start: function(intervalMs) {
        _send({ type: 'app:requestRefresh', interval: intervalMs || 60000 });
      },
      stop: function() {
        _send({ type: 'app:stopRefresh' });
      },
      requestNow: function() {
        _send({ type: 'app:requestNow' });
      }
    },

    onDispose: function(cb) {
      if (typeof cb !== 'function') return function() {};
      _disposeCallbacks.push(cb);
      return function() {
        var idx = _disposeCallbacks.indexOf(cb);
        if (idx !== -1) _disposeCallbacks.splice(idx, 1);
      };
    },

    actions: {
      register: function(id, handler) {
        if (!window.prvctice._actionHandlers) window.prvctice._actionHandlers = {};
        window.prvctice._actionHandlers[id] = handler;
      },
      unregister: function(id) {
        if (window.prvctice._actionHandlers) delete window.prvctice._actionHandlers[id];
      }
    },
    _actionHandlers: {},

    // ==================== CHAT API ====================

    chat: {
      getMessages: function(opts) {
        opts = opts || {};
        return _request({ type: 'connector:request', connector: 'chat', method: 'getMessages', params: { limit: opts.limit, offset: opts.offset } });
      },
      getConversation: function() {
        return _request({ type: 'connector:request', connector: 'chat', method: 'getConversation', params: {} });
      },
      sendMessage: function(text) {
        return _request({ type: 'connector:request', connector: 'chat', method: 'sendMessage', params: { text: text } });
      },
      onMessage: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _chatMessageCallbacks.push(cb);
        _request({ type: 'chat:subscribe:messages' }).catch(function() {});
        return function() {
          var idx = _chatMessageCallbacks.indexOf(cb);
          if (idx !== -1) _chatMessageCallbacks.splice(idx, 1);
        };
      },
      onStreamingUpdate: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _chatStreamingCallbacks.push(cb);
        _request({ type: 'chat:subscribe:streaming' }).catch(function() {});
        return function() {
          var idx = _chatStreamingCallbacks.indexOf(cb);
          if (idx !== -1) _chatStreamingCallbacks.splice(idx, 1);
        };
      },
      onConversationChanged: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _chatConversationCallbacks.push(cb);
        _request({ type: 'chat:subscribe:conversation' }).catch(function() {});
        return function() {
          var idx = _chatConversationCallbacks.indexOf(cb);
          if (idx !== -1) _chatConversationCallbacks.splice(idx, 1);
        };
      }
    },

    // ==================== CONTEXT API ====================

    context: {
      getOpenApps: function() {
        return _request({ type: 'connector:request', connector: 'context', method: 'getOpenApps', params: {} });
      },
      getActiveApp: function() {
        return _request({ type: 'connector:request', connector: 'context', method: 'getActiveApp', params: {} });
      },
      getWorkspace: function() {
        return _request({ type: 'connector:request', connector: 'context', method: 'getWorkspace', params: {} });
      },
      getUser: function() {
        return _request({ type: 'connector:request', connector: 'context', method: 'getUser', params: {} });
      },
      onAppOpened: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _contextAppOpenedCallbacks.push(cb);
        _request({ type: 'context:subscribe:lifecycle' }).catch(function() {});
        return function() {
          var idx = _contextAppOpenedCallbacks.indexOf(cb);
          if (idx !== -1) _contextAppOpenedCallbacks.splice(idx, 1);
        };
      },
      onAppClosed: function(cb) {
        if (typeof cb !== 'function') return function() {};
        _contextAppClosedCallbacks.push(cb);
        _request({ type: 'context:subscribe:lifecycle' }).catch(function() {});
        return function() {
          var idx = _contextAppClosedCallbacks.indexOf(cb);
          if (idx !== -1) _contextAppClosedCallbacks.splice(idx, 1);
        };
      }
    },

    // ==================== CONNECTOR HEALTH API ====================

    connectors: {
      check: function(connectorId) {
        return _request({
          type: 'connector:health',
          connector: connectorId || null,
        });
      }
    },

    // ==================== BROADCAST API ====================

    broadcast: {
      publish: function(channel, data) {
        return _request({ type: 'connector:request', connector: 'broadcast', method: 'publish', params: { channel: channel, data: data } });
      },
      subscribe: function(channel, cb) {
        if (typeof cb !== 'function') return function() {};
        if (!_broadcastCallbacks[channel]) _broadcastCallbacks[channel] = [];
        _broadcastCallbacks[channel].push(cb);
        _request({ type: 'broadcast:subscribe', channel: channel }).catch(function() {});
        return function() {
          var arr = _broadcastCallbacks[channel];
          if (arr) {
            var idx = arr.indexOf(cb);
            if (idx !== -1) arr.splice(idx, 1);
            if (arr.length === 0) {
              delete _broadcastCallbacks[channel];
              _request({ type: 'broadcast:unsubscribe', channel: channel }).catch(function() {});
            }
          }
        };
      },
      unsubscribe: function(channel) {
        delete _broadcastCallbacks[channel];
        _request({ type: 'broadcast:unsubscribe', channel: channel }).catch(function() {});
      }
    }
  };

  // ==================== MIXER API ====================

  window.prvctice.mixer = {
    // Instrument methods
    connect: function(opts) {
      opts = opts || {};
      return _request({ type: 'mixer:connect', name: opts.name });
    },
    disconnect: function() {
      return _request({ type: 'mixer:disconnect' });
    },
    noteOn: function(freq, opts) {
      opts = opts || {};
      return _request({
        type: 'mixer:noteOn', freq: freq,
        waveform: opts.waveform, gain: opts.gain,
        attack: opts.attack, release: opts.release, detune: opts.detune,
        decay: opts.decay, sustain: opts.sustain,
        filterFreq: opts.filterFreq, filterQ: opts.filterQ,
        vibratoDepth: opts.vibratoDepth, vibratoRate: opts.vibratoRate
      });
    },
    noteOff: function(voiceId) {
      return _request({ type: 'mixer:noteOff', voiceId: voiceId });
    },
    setVoiceFrequency: function(voiceId, freq, rampTime) {
      return _request({ type: 'mixer:setVoiceFrequency', voiceId: voiceId, freq: freq, rampTime: rampTime });
    },
    setVoiceGain: function(voiceId, gain, rampTime) {
      return _request({ type: 'mixer:setVoiceGain', voiceId: voiceId, gain: gain, rampTime: rampTime });
    },
    tone: function(freq, duration, opts) {
      opts = opts || {};
      return _request({
        type: 'mixer:tone', freq: freq, duration: duration,
        waveform: opts.waveform, gain: opts.gain,
        attack: opts.attack, release: opts.release,
        decay: opts.decay, sustain: opts.sustain,
        filterFreq: opts.filterFreq, filterQ: opts.filterQ,
        vibratoDepth: opts.vibratoDepth, vibratoRate: opts.vibratoRate
      });
    },
    synthDrumVoice: function(voice, velocity) {
      return _request({ type: 'mixer:synthDrumVoice', voice: voice, velocity: velocity });
    },
    allNotesOff: function() {
      return _request({ type: 'mixer:allNotesOff' });
    },
    // Mixer control methods
    getState: function() {
      return _request({ type: 'mixer:getState' });
    },
    setGain: function(channelId, value) {
      return _request({ type: 'mixer:setGain', channelId: channelId, value: value });
    },
    setPan: function(channelId, value) {
      return _request({ type: 'mixer:setPan', channelId: channelId, value: value });
    },
    setMute: function(channelId, value) {
      return _request({ type: 'mixer:setMute', channelId: channelId, value: value });
    },
    setSolo: function(channelId, value) {
      return _request({ type: 'mixer:setSolo', channelId: channelId, value: value });
    },
    setMasterGain: function(value) {
      return _request({ type: 'mixer:setMasterGain', value: value });
    },
    setMasterMute: function(value) {
      return _request({ type: 'mixer:setMasterMute', value: value });
    },
    startRecording: function() {
      return _request({ type: 'mixer:startRecording' });
    },
    stopRecording: function() {
      return _request({ type: 'mixer:stopRecording' }, _LONG_TIMEOUT);
    },
    playRecording: function() {
      return _request({ type: 'mixer:playRecording' });
    },
    pauseRecording: function() {
      return _request({ type: 'mixer:pauseRecording' });
    },
    stopPlayback: function() {
      return _request({ type: 'mixer:stopPlayback' });
    },
    seekRecording: function(time) {
      return _request({ type: 'mixer:seekRecording', time: time });
    },
    clearRecording: function() {
      return _request({ type: 'mixer:clearRecording' });
    },
    setReverbSend: function(channelId, value) {
      return _request({ type: 'mixer:setReverbSend', channelId: channelId, value: value });
    },
    setRecordArm: function(channelId, value) {
      return _request({ type: 'mixer:setRecordArm', channelId: channelId, value: value });
    },
    setBpm: function(value) {
      return _request({ type: 'mixer:setBpm', value: value });
    },
    setMetronome: function(value) {
      return _request({ type: 'mixer:setMetronome', value: value });
    },
    transportPlay: function() {
      return _request({ type: 'mixer:transportPlay' });
    },
    transportStop: function() {
      return _request({ type: 'mixer:transportStop' });
    },
    getAnalyserData: function(channelId) {
      return _request({ type: 'mixer:getAnalyserData', channelId: channelId });
    },
    subscribeState: function() {
      return _request({ type: 'mixer:subscribeState' });
    },
    removeTrack: function(trackId) {
      return _request({ type: 'mixer:removeTrack', trackId: trackId });
    },
    setTrackMute: function(trackId, value) {
      return _request({ type: 'mixer:setTrackMute', trackId: trackId, value: value });
    },
    getPeakLevels: function() {
      return _request({ type: 'mixer:getPeakLevels' });
    },
    setLoop: function(enabled, start, end) {
      return _request({ type: 'mixer:setLoop', enabled: enabled, start: start, end: end });
    },
    clearAllTracks: function() {
      return _request({ type: 'mixer:clearAllTracks' });
    },
    seekTransport: function(time) {
      return _request({ type: 'mixer:seekTransport', time: time });
    },
    exportTrack: function(trackId) {
      return _request({ type: 'mixer:exportTrack', trackId: trackId }, _LONG_TIMEOUT);
    },
    // Push callbacks
    onStateChange: function(cb) {
      if (typeof cb !== 'function') return function() {};
      _mixerStateCallbacks.push(cb);
      return function() {
        var idx = _mixerStateCallbacks.indexOf(cb);
        if (idx !== -1) _mixerStateCallbacks.splice(idx, 1);
      };
    },
    onDisconnected: function(cb) {
      if (typeof cb !== 'function') return function() {};
      _mixerDisconnectedCallbacks.push(cb);
      return function() {
        var idx = _mixerDisconnectedCallbacks.indexOf(cb);
        if (idx !== -1) _mixerDisconnectedCallbacks.splice(idx, 1);
      };
    }
  };

  // ==================== BRIDGE EXTENSION HOOK ====================

  // Expose internal _request for UIKit modules (e.g., notifications.js) to use.
  // Must be placed after window.prvctice assignment so the object exists.
  window.prvctice._bridge = { request: _request };

  // ==================== INITIATE HANDSHAKE ====================

  _send({ type: 'bridge:hello' });
})();`;
}
