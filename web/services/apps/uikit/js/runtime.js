/**
 * prvctice UI Kit — Runtime
 * Interactive component initializers attached to window.prvctice.ui.
 * Depends on helpers.js (window._pHelpers) and bridgeSDK (window.prvctice).
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  var H = window._pHelpers || {};

  // ==================== STALE BADGE ====================

  function staleBadgeComponent(meta) {
    var el = document.createElement('div');
    el.className = 'p-stale-badge';

    function formatAge(ms) {
      if (ms < 60000) return 'just now';
      if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
      if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
      return Math.floor(ms / 86400000) + 'd ago';
    }

    function render(m) {
      if (!m || m.fresh !== false) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'inline-flex';
      el.textContent = 'Updated ' + formatAge(m.ageMs);
    }

    render(meta);

    return {
      el: el,
      dispose: function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      },
      update: render,
    };
  }

  // ==================== COUNTER ANIMATION ====================

  function animateValueComponent(el, from, to, opts) {
    if (!el) return null;
    opts = opts || {};
    var format =
      opts.format ||
      function (v) {
        return Math.round(v).toLocaleString();
      };
    var stiffness = opts.stiffness || 180;
    var damping = opts.damping || 24;
    var mass = opts.mass || 1;

    // Ensure tabular-nums for stable width during counting
    el.style.fontVariantNumeric = 'tabular-nums';

    var reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || from === to) {
      el.textContent = format(to);
      return { dispose: function () {} };
    }

    var cancelled = false;
    var rafId = null;
    var range = to - from;

    // Spring solver (underdamped)
    var omega0 = Math.sqrt(stiffness / mass);
    var zeta = damping / (2 * Math.sqrt(stiffness * mass));

    function springVal(t) {
      if (zeta < 1) {
        var omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
        var envelope = Math.exp(-zeta * omega0 * t);
        var displacement =
          envelope * (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t));
        return to - range * displacement;
      }
      var env = Math.exp(-omega0 * t);
      return to - range * env * (1 + omega0 * t);
    }

    // Estimate duration (when displacement < 0.5 unit)
    var threshold = 0.5 / (Math.abs(range) || 1);
    var duration = 2;
    for (var dt = 0; dt < 3; dt += 0.016) {
      if (Math.abs((springVal(dt) - to) / range) < threshold) {
        duration = dt;
        break;
      }
    }

    var startTime = performance.now();

    function tick() {
      if (cancelled) return;
      var elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= duration) {
        el.textContent = format(to);
        rafId = null;
        return;
      }
      el.textContent = format(springVal(elapsed));
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return {
      dispose: function () {
        cancelled = true;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
    };
  }

  // Wait for prvctice SDK to be available, then attach ui namespace
  function attach() {
    if (!window.prvctice) {
      // SDK not loaded yet — retry in next tick
      setTimeout(attach, 10);
      return;
    }
    var ui = window.prvctice.ui || {};
    ui.clock = clockComponent;
    ui.analogClock = analogClockComponent;
    ui.timer = timerComponent;
    ui.stepper = stepperComponent;
    ui.tabs = tabsComponent;
    ui.canvas = canvasComponent;
    ui.dropzone = dropzoneComponent;
    ui.waveform = waveformComponent;
    ui.mediaPlayer = mediaPlayerComponent;
    ui.audioRecorder = audioRecorderComponent;
    ui.base64ToBlob = H.base64ToBlob;
    ui.errorState = errorStateComponent;
    ui.emptyState = emptyStateComponent;
    ui.staleBadge = staleBadgeComponent;
    ui.dataView = dataViewComponent;
    ui.animateEntrance = animateEntranceComponent;
    ui.animateValue = animateValueComponent;
    ui.filePicker = filePickerComponent;
    window.prvctice.ui = ui;
    window.prvctice.format = {
      number: H.formatNumber,
      percent: H.formatPercent,
      currency: H.formatCurrency,
      relativeTime: H.formatRelativeTime,
    };
    // prvctice.load(['audio', 'image', ...]) — explicit module opt-in API.
    // All modules are pre-loaded synchronously; this stub establishes the
    // contract for apps that declare their dependencies explicitly.
    // Future: modules will be lazily injected to reduce initial payload.
    window.prvctice.load = function (modules) {
      void modules; // acknowledged — modules are already available
      return Promise.resolve();
    };
  }

  // ==================== DIGITAL CLOCK ====================

  function clockComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var format = opts.format || '12h';
    var showSeconds = opts.seconds !== false;
    var timezone = opts.timezone || undefined;
    var intervalId = null;

    function update() {
      var now = new Date();
      var options = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: format === '12h',
      };
      if (showSeconds) options.second = '2-digit';
      if (timezone) options.timeZone = timezone;

      try {
        el.textContent = now.toLocaleTimeString('en-US', options);
      } catch (e) {
        el.textContent = now.toLocaleTimeString();
      }
    }

    update();
    intervalId = setInterval(update, showSeconds ? 1000 : 60000);

    return {
      dispose: function () {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      },
      setFormat: function (f) {
        format = f;
        update();
      },
      setTimezone: function (tz) {
        timezone = tz;
        update();
      },
    };
  }

  // ==================== ANALOG CLOCK ====================

  function analogClockComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var showSeconds = opts.showSeconds !== false;
    var showNumbers = opts.showNumbers !== false;
    var showTicks = opts.showTicks !== false;
    var size = opts.size || 200;
    var animId = null;

    // Create SVG
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.maxWidth = size + 'px';
    svg.style.maxHeight = size + 'px';

    var textColor = getComputedStyle(document.body).color || '#e0e0e0';
    var mutedColor =
      getComputedStyle(document.documentElement).getPropertyValue('--p-text-secondary').trim() ||
      'rgba(255,255,255,0.3)';
    var primaryColor =
      getComputedStyle(document.documentElement).getPropertyValue('--p-primary').trim() ||
      '#6366f1';

    // Circle outline
    var circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '100');
    circle.setAttribute('cy', '100');
    circle.setAttribute('r', '95');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', mutedColor);
    circle.setAttribute('stroke-width', '1');
    svg.appendChild(circle);

    // Tick marks
    if (showTicks) {
      for (var i = 0; i < 60; i++) {
        var isHour = i % 5 === 0;
        var angle = ((i * 6 - 90) * Math.PI) / 180;
        var innerR = isHour ? 80 : 86;
        var outerR = 92;
        var tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', 100 + innerR * Math.cos(angle));
        tick.setAttribute('y1', 100 + innerR * Math.sin(angle));
        tick.setAttribute('x2', 100 + outerR * Math.cos(angle));
        tick.setAttribute('y2', 100 + outerR * Math.sin(angle));
        tick.setAttribute('stroke', isHour ? textColor : mutedColor);
        tick.setAttribute('stroke-width', isHour ? '2' : '1');
        tick.setAttribute('stroke-linecap', 'round');
        svg.appendChild(tick);
      }
    }

    // Hour numbers
    if (showNumbers) {
      for (var h = 1; h <= 12; h++) {
        var numAngle = ((h * 30 - 90) * Math.PI) / 180;
        var numR = 70;
        var numText = document.createElementNS(ns, 'text');
        numText.setAttribute('x', 100 + numR * Math.cos(numAngle));
        numText.setAttribute('y', 100 + numR * Math.sin(numAngle));
        numText.setAttribute('text-anchor', 'middle');
        numText.setAttribute('dominant-baseline', 'central');
        numText.setAttribute('fill', textColor);
        numText.setAttribute('font-size', '14');
        numText.setAttribute('font-weight', '300');
        numText.setAttribute('font-family', "'Gothic A1', system-ui, sans-serif");
        numText.textContent = h;
        svg.appendChild(numText);
      }
    }

    // Center dot
    var centerDot = document.createElementNS(ns, 'circle');
    centerDot.setAttribute('cx', '100');
    centerDot.setAttribute('cy', '100');
    centerDot.setAttribute('r', '3');
    centerDot.setAttribute('fill', textColor);
    svg.appendChild(centerDot);

    // Hands
    function createHand(id, width, length, color) {
      var hand = document.createElementNS(ns, 'line');
      hand.setAttribute('id', id);
      hand.setAttribute('x1', '100');
      hand.setAttribute('y1', '100');
      hand.setAttribute('x2', '100');
      hand.setAttribute('y2', 100 - length);
      hand.setAttribute('stroke', color);
      hand.setAttribute('stroke-width', width);
      hand.setAttribute('stroke-linecap', 'round');
      svg.appendChild(hand);
      return hand;
    }

    var hourHand = createHand('hour', '3', 50, textColor);
    var minuteHand = createHand('minute', '2', 70, textColor);
    var secondHand = showSeconds ? createHand('second', '1', 78, primaryColor) : null;

    // Ensure center dot is on top
    svg.appendChild(centerDot);

    el.innerHTML = '';
    el.appendChild(svg);

    function updateHands() {
      var now = new Date();
      var h = now.getHours() % 12;
      var m = now.getMinutes();
      var s = now.getSeconds();
      var ms = now.getMilliseconds();

      var hourAngle = (h + m / 60) * 30;
      var minAngle = (m + s / 60) * 6;
      var secAngle = (s + ms / 1000) * 6;

      setHandRotation(hourHand, hourAngle);
      setHandRotation(minuteHand, minAngle);
      if (secondHand) setHandRotation(secondHand, secAngle);

      animId = requestAnimationFrame(updateHands);
    }

    function setHandRotation(hand, degrees) {
      hand.setAttribute('transform', 'rotate(' + degrees + ' 100 100)');
    }

    updateHands();

    return {
      dispose: function () {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        el.innerHTML = '';
      },
    };
  }

  // ==================== TIMER ====================

  function timerComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var duration = opts.duration || 0;
    var mode = opts.mode || (duration > 0 ? 'countdown' : 'stopwatch');
    var onTick = opts.onTick || null;
    var onComplete = opts.onComplete || null;
    var autoStart = opts.autoStart || false;
    var displayFormat = opts.format || (duration >= 3600000 ? 'hh:mm:ss' : 'mm:ss');

    var elapsed = 0;
    var running = false;
    var intervalId = null;
    var lastTick = 0;

    function getDisplayMs() {
      if (mode === 'countdown') return Math.max(0, duration - elapsed);
      return elapsed;
    }

    function render() {
      el.textContent = H.formatTime(getDisplayMs(), displayFormat);
    }

    function tick() {
      var now = Date.now();
      var dt = now - lastTick;
      lastTick = now;
      elapsed += dt;

      if (mode === 'countdown' && elapsed >= duration) {
        elapsed = duration;
        render();
        stop();
        if (onComplete) onComplete();
        return;
      }

      render();
      if (onTick) onTick(getDisplayMs(), elapsed);
    }

    function start() {
      if (running) return;
      running = true;
      lastTick = Date.now();
      intervalId = setInterval(tick, 50);
    }

    function pause() {
      if (!running) return;
      running = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function stop() {
      pause();
    }

    function reset() {
      pause();
      elapsed = 0;
      render();
    }

    function setDuration(ms) {
      duration = ms;
      displayFormat = ms >= 3600000 ? 'hh:mm:ss' : 'mm:ss';
      if (!running) render();
    }

    render();
    if (autoStart) start();

    return {
      start: start,
      pause: pause,
      stop: stop,
      reset: reset,
      dispose: function () {
        pause();
      },
      isRunning: function () {
        return running;
      },
      getElapsed: function () {
        return elapsed;
      },
      getRemaining: function () {
        return Math.max(0, duration - elapsed);
      },
      setDuration: setDuration,
    };
  }

  // ==================== STEPPER ====================

  function stepperComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var min = typeof opts.min === 'number' ? opts.min : 0;
    var max = typeof opts.max === 'number' ? opts.max : 100;
    var step = opts.step || 1;
    var value = typeof opts.value === 'number' ? opts.value : min;
    var onChange = opts.onChange || null;
    var formatFn = opts.format || null;

    // Build DOM
    el.classList.add('p-stepper');
    el.innerHTML = '';

    var decBtn = document.createElement('button');
    decBtn.className = 'p-stepper-btn';
    decBtn.textContent = '\u2212';
    decBtn.type = 'button';

    var valueEl = document.createElement('span');
    valueEl.className = 'p-stepper-value';

    var incBtn = document.createElement('button');
    incBtn.className = 'p-stepper-btn';
    incBtn.textContent = '+';
    incBtn.type = 'button';

    el.appendChild(decBtn);
    el.appendChild(valueEl);
    el.appendChild(incBtn);

    function render() {
      valueEl.textContent = formatFn ? formatFn(value) : value;
      decBtn.disabled = value <= min;
      incBtn.disabled = value >= max;
    }

    decBtn.addEventListener('click', function () {
      var next = H.clamp(value - step, min, max);
      if (next !== value) {
        value = next;
        render();
        if (onChange) onChange(value);
      }
    });

    incBtn.addEventListener('click', function () {
      var next = H.clamp(value + step, min, max);
      if (next !== value) {
        value = next;
        render();
        if (onChange) onChange(value);
      }
    });

    render();

    return {
      getValue: function () {
        return value;
      },
      setValue: function (v) {
        value = H.clamp(v, min, max);
        render();
      },
      dispose: function () {
        el.innerHTML = '';
      },
    };
  }

  // ==================== TABS ====================

  function tabsComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var tabs = opts.tabs || [];
    var activeId = opts.active || (tabs.length > 0 ? tabs[0].id : null);
    var onChange = opts.onChange || null;

    el.classList.add('p-tabs');
    el.innerHTML = '';

    var tabEls = {};

    tabs.forEach(function (tab) {
      var btn = document.createElement('button');
      btn.className = 'p-tab';
      btn.type = 'button';
      btn.textContent = tab.label;
      btn.dataset.tabId = tab.id;
      if (tab.id === activeId) btn.classList.add('active');

      btn.addEventListener('click', function () {
        if (activeId === tab.id) return;
        activeId = tab.id;
        updateActive();
        if (onChange) onChange(activeId);
      });

      tabEls[tab.id] = btn;
      el.appendChild(btn);
    });

    function updateActive() {
      Object.keys(tabEls).forEach(function (id) {
        if (id === activeId) {
          tabEls[id].classList.add('active');
        } else {
          tabEls[id].classList.remove('active');
        }
      });
    }

    return {
      getActive: function () {
        return activeId;
      },
      setActive: function (id) {
        if (tabEls[id]) {
          activeId = id;
          updateActive();
        }
      },
      dispose: function () {
        el.innerHTML = '';
      },
    };
  }

  // ==================== CANVAS ====================

  function canvasComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var retina = opts.retina !== false;
    var onReady = opts.onReady || null;

    el.classList.add('p-canvas');

    var canvas = document.createElement('canvas');
    el.innerHTML = '';
    el.appendChild(canvas);

    var ctx = canvas.getContext('2d');

    function resize() {
      var rect = el.getBoundingClientRect();
      var w = opts.width || rect.width || 300;
      var h = opts.height || rect.height || 200;
      var dpr = retina ? window.devicePixelRatio || 1 : 1;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();

    // Watch for container resizes
    var ro = null;
    if (typeof ResizeObserver !== 'undefined' && !opts.width) {
      ro = new ResizeObserver(H.throttle(resize, 100));
      ro.observe(el);
    }

    if (onReady) onReady(ctx, canvas);

    return {
      ctx: ctx,
      canvas: canvas,
      resize: resize,
      toDataURL: function (type) {
        return canvas.toDataURL(type || 'image/png');
      },
      toBlob: function (callback, type) {
        canvas.toBlob(callback, type || 'image/png');
      },
      clear: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      dispose: function () {
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
      },
    };
  }

  // ==================== DROPZONE ====================

  function dropzoneComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var accept = opts.accept || '*';
    var multiple = opts.multiple || false;
    var label = opts.label || 'Drop files here';
    var hint = opts.hint || '';
    var onDrop = opts.onDrop || null;

    el.classList.add('p-dropzone');

    // Build inner content if empty
    if (!el.children.length) {
      var iconEl = document.createElement('div');
      iconEl.className = 'p-dropzone-icon';
      iconEl.textContent = '\u2913'; // downwards arrow

      var labelEl = document.createElement('div');
      labelEl.className = 'p-dropzone-label';
      labelEl.textContent = label;

      el.appendChild(iconEl);
      el.appendChild(labelEl);

      if (hint) {
        var hintEl = document.createElement('div');
        hintEl.className = 'p-dropzone-hint';
        hintEl.textContent = hint;
        el.appendChild(hintEl);
      }
    }

    // Hidden file input for click fallback
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    if (accept !== '*') fileInput.accept = accept;
    if (multiple) fileInput.multiple = true;
    el.appendChild(fileInput);

    var dragCounter = 0;

    function matchesAccept(file) {
      if (accept === '*') return true;
      var types = accept.split(',').map(function (t) {
        return t.trim().toLowerCase();
      });
      var name = (file.name || '').toLowerCase();
      var ftype = (file.type || '').toLowerCase();
      return types.some(function (t) {
        if (t.indexOf('/') !== -1) {
          if (t.endsWith('/*')) return ftype.indexOf(t.replace('/*', '/')) === 0;
          return ftype === t;
        }
        return name.endsWith(t);
      });
    }

    function handleFiles(files) {
      var filtered = [];
      for (var i = 0; i < files.length; i++) {
        if (matchesAccept(files[i])) filtered.push(files[i]);
      }
      if (filtered.length > 0 && onDrop) {
        onDrop(multiple ? filtered : [filtered[0]]);
      }
    }

    el.addEventListener('dragenter', function (e) {
      e.preventDefault();
      dragCounter++;
      el.classList.add('dragover');
    });

    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    el.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        el.classList.remove('dragover');
      }
    });

    el.addEventListener('drop', function (e) {
      e.preventDefault();
      dragCounter = 0;
      el.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    });

    el.addEventListener('click', function (e) {
      if (e.target === fileInput) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      if (fileInput.files.length > 0) {
        handleFiles(fileInput.files);
        fileInput.value = '';
      }
    });

    return {
      dispose: function () {
        el.classList.remove('p-dropzone', 'dragover');
      },
      setLabel: function (text) {
        var lbl = el.querySelector('.p-dropzone-label');
        if (lbl) lbl.textContent = text;
      },
    };
  }

  // ==================== FILE PICKER ====================

  function filePickerComponent(opts) {
    opts = opts || {};
    var accept = opts.accept || '*/*';
    var title = opts.title || 'Load from Files';
    var emptyMessage = opts.emptyMessage || 'No files found';
    var onSelect = opts.onSelect || function () {};
    var overlay = null;

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function mimeIcon(mime) {
      if (!mime) return '?';
      if (mime.indexOf('audio') === 0) return 'AU';
      if (mime.indexOf('image') === 0) return 'IM';
      if (mime.indexOf('video') === 0) return 'VD';
      return 'FL';
    }

    function close() {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      overlay = null;
    }

    function open() {
      if (overlay) return;

      overlay = document.createElement('div');
      overlay.className = 'p-file-overlay';

      var picker = document.createElement('div');
      picker.className = 'p-file-picker';

      // Header
      var header = document.createElement('div');
      header.className = 'p-file-picker-header';
      var titleSpan = document.createElement('span');
      titleSpan.textContent = title;
      header.appendChild(titleSpan);
      var closeBtn = document.createElement('button');
      closeBtn.className = 'p-file-picker-close';
      closeBtn.textContent = 'X';
      closeBtn.onclick = close;
      header.appendChild(closeBtn);
      picker.appendChild(header);

      // List container — show loading first
      var list = document.createElement('div');
      list.className = 'p-file-picker-list';
      var loading = document.createElement('div');
      loading.className = 'p-file-picker-loading';
      loading.textContent = 'Loading...';
      list.appendChild(loading);
      picker.appendChild(list);

      overlay.appendChild(picker);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
      document.body.appendChild(overlay);

      // Fetch blob list
      window.prvctice.fs
        .listBlobs(accept)
        .then(function (entries) {
          list.innerHTML = '';

          if (!entries || entries.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'p-file-picker-empty';
            empty.textContent = emptyMessage;
            list.appendChild(empty);
            return;
          }

          for (var i = 0; i < entries.length; i++) {
            (function (entry) {
              var item = document.createElement('button');
              item.className = 'p-file-picker-item';

              var icon = document.createElement('span');
              icon.className = 'p-file-picker-item-icon';
              icon.textContent = mimeIcon(entry.mime);
              item.appendChild(icon);

              var name = document.createElement('span');
              name.className = 'p-file-picker-item-name';
              var ext = (entry.mime || '').split('/')[1] || '';
              name.textContent = ext.toUpperCase() + ' ' + entry.name.slice(0, 8);
              item.appendChild(name);

              var meta = document.createElement('span');
              meta.className = 'p-file-picker-meta';
              meta.textContent = formatSize(entry.size);
              item.appendChild(meta);

              item.onclick = function () {
                close();
                window.prvctice.fs
                  .readAsDataUrl('/blobs/' + entry.name)
                  .then(function (dataUrl) {
                    onSelect({ dataUrl: dataUrl, entry: entry });
                  })
                  .catch(function (err) {
                    if (window.prvctice.ui && window.prvctice.ui.toast) {
                      window.prvctice.ui.toast('Failed to load: ' + (err.message || err), 'error');
                    }
                  });
              };
              list.appendChild(item);
            })(entries[i]);
          }
        })
        .catch(function (err) {
          list.innerHTML = '';
          var errDiv = document.createElement('div');
          errDiv.className = 'p-file-picker-empty';
          errDiv.textContent = 'Error: ' + (err.message || err);
          list.appendChild(errDiv);
        });
    }

    return {
      open: open,
      close: close,
      dispose: close,
    };
  }

  // ==================== WAVEFORM ====================

  function waveformComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var barColor = opts.color || null;
    var barWidth = opts.barWidth || 3;
    var barGap = opts.barGap || 1;

    el.classList.add('p-waveform');
    var canvas = document.createElement('canvas');
    el.innerHTML = '';
    el.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var animId = null;

    function resize() {
      var rect = el.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(H.throttle(resize, 100));
      ro.observe(el);
    }

    function getColor() {
      return (
        barColor ||
        getComputedStyle(document.documentElement).getPropertyValue('--p-primary').trim() ||
        '#6366f1'
      );
    }

    /**
     * Draw static waveform from audio buffer data (Float32Array or array of 0-1 values).
     */
    function draw(data) {
      if (!data || !data.length) return;
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      var color = getColor();
      var totalBarWidth = barWidth + barGap;
      var numBars = Math.floor(w / totalBarWidth);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;

      var step = data.length / numBars;
      for (var i = 0; i < numBars; i++) {
        var idx = Math.floor(i * step);
        var val = Math.abs(data[idx] || 0);
        var barH = Math.max(2, val * h * 0.9);
        var x = i * totalBarWidth;
        var y = (h - barH) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
        ctx.fill();
      }
    }

    /**
     * Connect to a live AnalyserNode for real-time visualization.
     */
    function connectAnalyser(analyser) {
      if (!analyser) return;
      var bufferLength = analyser.frequencyBinCount;
      var dataArray = new Uint8Array(bufferLength);

      function drawLive() {
        analyser.getByteFrequencyData(dataArray);
        var rect = el.getBoundingClientRect();
        var w = rect.width;
        var h = rect.height;
        var color = getColor();
        var totalBarWidth = barWidth + barGap;
        var numBars = Math.floor(w / totalBarWidth);

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color;

        var step = bufferLength / numBars;
        for (var i = 0; i < numBars; i++) {
          var idx = Math.floor(i * step);
          var val = dataArray[idx] / 255;
          var barH = Math.max(2, val * h * 0.9);
          var x = i * totalBarWidth;
          var y = (h - barH) / 2;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
          ctx.fill();
        }

        animId = requestAnimationFrame(drawLive);
      }

      drawLive();
    }

    return {
      draw: draw,
      connectAnalyser: connectAnalyser,
      resize: resize,
      dispose: function () {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
      },
    };
  }

  // ==================== MEDIA PLAYER ====================

  function mediaPlayerComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var src = opts.src || null;
    var mediaType = opts.type || 'audio';
    var onTimeUpdate = opts.onTimeUpdate || null;
    var onEnd = opts.onEnd || null;
    var autoPlay = opts.autoPlay || false;

    el.classList.add('p-media-player');
    el.innerHTML = '';

    // Create media element
    var media = document.createElement(mediaType === 'video' ? 'video' : 'audio');
    media.style.display = 'none';
    if (src) {
      if (typeof src === 'string') {
        media.src = src;
      } else if (src instanceof Blob) {
        media.src = URL.createObjectURL(src);
      }
    }
    el.appendChild(media);

    // Play/pause button
    var playBtn = document.createElement('button');
    playBtn.className = 'p-media-player-btn';
    playBtn.type = 'button';
    playBtn.innerHTML = '&#9654;'; // play triangle
    el.appendChild(playBtn);

    // Seek slider
    var seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'p-slider p-media-player-seek';
    seek.min = '0';
    seek.max = '100';
    seek.value = '0';
    seek.step = '0.1';
    el.appendChild(seek);

    // Time display
    var timeEl = document.createElement('span');
    timeEl.className = 'p-media-player-time';
    timeEl.textContent = '0:00';
    el.appendChild(timeEl);

    var isPlaying = false;
    var isSeeking = false;

    function updatePlayIcon() {
      playBtn.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
    }

    playBtn.addEventListener('click', function () {
      if (isPlaying) {
        media.pause();
      } else {
        media.play();
      }
    });

    media.addEventListener('play', function () {
      isPlaying = true;
      updatePlayIcon();
    });

    media.addEventListener('pause', function () {
      isPlaying = false;
      updatePlayIcon();
    });

    media.addEventListener('timeupdate', function () {
      if (isSeeking) return;
      var duration = media.duration || 0;
      var current = media.currentTime || 0;
      seek.value = duration > 0 ? (current / duration) * 100 : 0;
      timeEl.textContent = H.formatTime(current * 1000) + ' / ' + H.formatTime(duration * 1000);
      if (onTimeUpdate) onTimeUpdate(current, duration);
    });

    media.addEventListener('ended', function () {
      isPlaying = false;
      updatePlayIcon();
      if (onEnd) onEnd();
    });

    seek.addEventListener('input', function () {
      isSeeking = true;
      var duration = media.duration || 0;
      var target = (parseFloat(seek.value) / 100) * duration;
      timeEl.textContent = H.formatTime(target * 1000) + ' / ' + H.formatTime(duration * 1000);
    });

    seek.addEventListener('change', function () {
      var duration = media.duration || 0;
      media.currentTime = (parseFloat(seek.value) / 100) * duration;
      isSeeking = false;
    });

    if (autoPlay && src) {
      media.play().catch(function () {
        /* autoplay blocked, ignore */
      });
    }

    return {
      play: function () {
        media.play();
      },
      pause: function () {
        media.pause();
      },
      seek: function (time) {
        media.currentTime = time;
      },
      setSrc: function (newSrc) {
        if (typeof newSrc === 'string') {
          media.src = newSrc;
        } else if (newSrc instanceof Blob) {
          var oldSrc = media.src;
          media.src = URL.createObjectURL(newSrc);
          if (oldSrc && oldSrc.indexOf('blob:') === 0) URL.revokeObjectURL(oldSrc);
        }
        seek.value = '0';
        timeEl.textContent = '0:00';
      },
      getMedia: function () {
        return media;
      },
      dispose: function () {
        media.pause();
        if (media.src && media.src.indexOf('blob:') === 0) {
          URL.revokeObjectURL(media.src);
        }
        el.innerHTML = '';
      },
    };
  }

  // ==================== AUDIO RECORDER ====================

  function audioRecorderComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var onRecordingComplete = opts.onRecordingComplete || null;
    var showWaveform = opts.waveform !== false;
    var autoStart = opts.autoStart || false;

    el.classList.add('p-audio-recorder');
    el.innerHTML = '';

    // Recording state
    var isRecording = false;
    var startTime = 0;
    var timerId = null;
    var unsub = null;

    // Build DOM
    var indicator = document.createElement('div');
    indicator.className = 'p-audio-recorder-indicator';

    var dot = document.createElement('div');
    dot.className = 'p-recording-dot';
    indicator.appendChild(dot);

    var timeDisplay = document.createElement('span');
    timeDisplay.className = 'p-audio-recorder-time';
    timeDisplay.textContent = '00:00';
    indicator.appendChild(timeDisplay);

    el.appendChild(indicator);

    // Waveform display
    var waveformEl = null;
    var waveformInstance = null;
    if (showWaveform) {
      waveformEl = document.createElement('div');
      waveformEl.className = 'p-waveform p-waveform-sm';
      el.appendChild(waveformEl);
      waveformInstance = waveformComponent(waveformEl, { barWidth: 2, barGap: 1 });
    }

    // Level meter
    var meterEl = document.createElement('div');
    meterEl.className = 'p-audio-meter';
    var meterFill = document.createElement('div');
    meterFill.className = 'p-audio-meter-fill';
    meterEl.appendChild(meterFill);
    el.appendChild(meterEl);

    // Control button
    var controlBtn = document.createElement('button');
    controlBtn.className = 'p-btn p-btn-sm';
    controlBtn.type = 'button';
    controlBtn.textContent = 'Record';
    el.appendChild(controlBtn);

    function updateTime() {
      if (!isRecording) return;
      var elapsed = Date.now() - startTime;
      timeDisplay.textContent = H.formatTime(elapsed, 'mm:ss');
    }

    function handleAudioData(data) {
      if (!isRecording) return;
      // Draw waveform
      if (waveformInstance && data) {
        waveformInstance.draw(data);
      }
      // Update level meter
      if (data && data.length > 0) {
        var sum = 0;
        for (var i = 0; i < data.length; i++) sum += data[i];
        var level = sum / data.length;
        meterFill.style.width = Math.min(100, level * 100) + '%';
      }
    }

    function startRecording() {
      if (isRecording) return;
      isRecording = true;
      startTime = Date.now();
      el.classList.add('recording');
      controlBtn.textContent = 'Stop';
      controlBtn.classList.add('p-btn-danger');

      // Subscribe to audio data
      if (window.prvctice && window.prvctice.media) {
        unsub = window.prvctice.media.onAudioData(handleAudioData);
        window.prvctice.media.startMicrophone({ mode: 'both' });
      }

      timerId = setInterval(updateTime, 250);
    }

    function stopRecording() {
      if (!isRecording) return;
      isRecording = false;
      el.classList.remove('recording');
      controlBtn.textContent = 'Record';
      controlBtn.classList.remove('p-btn-danger');

      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      if (unsub) {
        unsub();
        unsub = null;
      }

      meterFill.style.width = '0%';

      if (window.prvctice && window.prvctice.media) {
        window.prvctice.media
          .stopMicrophone()
          .then(function (result) {
            if (onRecordingComplete) onRecordingComplete(result);
          })
          .catch(function () {});
      }
    }

    controlBtn.addEventListener('click', function () {
      if (isRecording) stopRecording();
      else startRecording();
    });

    if (autoStart) startRecording();

    return {
      start: startRecording,
      stop: stopRecording,
      isRecording: function () {
        return isRecording;
      },
      dispose: function () {
        if (isRecording) stopRecording();
        if (waveformInstance) waveformInstance.dispose();
        el.innerHTML = '';
      },
    };
  }

  // ==================== ERROR STATE ====================

  function errorStateComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    el.className = (el.className ? el.className + ' ' : '') + 'p-error';
    el.innerHTML = '';

    var iconEl = document.createElement('div');
    iconEl.className = 'p-error-icon';
    iconEl.textContent = opts.icon || '\u26A0';
    el.appendChild(iconEl);

    var msgEl = document.createElement('div');
    msgEl.className = 'p-error-message';
    msgEl.textContent = opts.message || 'Something went wrong';
    el.appendChild(msgEl);

    if (opts.onRetry) {
      var actionEl = document.createElement('div');
      actionEl.className = 'p-error-action';
      var retryBtn = document.createElement('button');
      retryBtn.className = 'p-btn p-btn-sm';
      retryBtn.type = 'button';
      retryBtn.textContent = opts.retryLabel || 'Retry';
      retryBtn.addEventListener('click', opts.onRetry);
      actionEl.appendChild(retryBtn);
      el.appendChild(actionEl);
    }

    return {
      setMessage: function (msg) {
        msgEl.textContent = msg;
      },
      setIcon: function (icon) {
        iconEl.textContent = icon;
      },
      dispose: function () {
        el.innerHTML = '';
        el.classList.remove('p-error');
      },
    };
  }

  // ==================== EMPTY STATE ====================

  function emptyStateComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    el.className = (el.className ? el.className + ' ' : '') + 'p-empty';
    el.innerHTML = '';

    if (opts.illustration) {
      var illustrationEl = document.createElement('div');
      illustrationEl.className = 'p-empty-illustration';
      if (typeof opts.illustration === 'string') {
        illustrationEl.innerHTML = opts.illustration;
      }
      el.appendChild(illustrationEl);
    } else {
      var iconEl = document.createElement('div');
      iconEl.className = 'p-empty-icon';
      iconEl.textContent = opts.icon || '\u2205';
      el.appendChild(iconEl);
    }

    var msgEl = document.createElement('div');
    msgEl.className = 'p-empty-message';
    msgEl.textContent = opts.message || 'Nothing to show';
    el.appendChild(msgEl);

    return {
      setMessage: function (msg) {
        msgEl.textContent = msg;
      },
      dispose: function () {
        el.innerHTML = '';
        el.classList.remove('p-empty');
      },
    };
  }

  // ==================== DATA VIEW ====================

  function dataViewComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var loadFn = opts.load;
    var renderFn = opts.render;
    var emptyFn =
      opts.empty ||
      function (data) {
        return !data;
      };
    var errorMessage = opts.errorMessage || 'SOMETHING WENT WRONG';
    var emptyMessage = opts.emptyMessage || 'NO DATA';

    // State containers
    var loadingEl = document.createElement('div');
    loadingEl.className = 'p-data-view-loading';
    loadingEl.style.display = 'none';

    var errorEl = document.createElement('div');
    errorEl.className = 'p-data-view-error';
    errorEl.style.display = 'none';

    var emptyEl = document.createElement('div');
    emptyEl.className = 'p-data-view-empty';
    emptyEl.style.display = 'none';

    var contentEl = document.createElement('div');
    contentEl.className = 'p-data-view-content';
    contentEl.style.display = 'none';

    // Capture existing children before we restructure
    var originalChildren = [];
    while (el.firstChild) {
      originalChildren.push(el.removeChild(el.firstChild));
    }

    // Place original children inside content wrapper
    for (var i = 0; i < originalChildren.length; i++) {
      contentEl.appendChild(originalChildren[i]);
    }

    // Build loading skeletons
    var skelValue = document.createElement('div');
    skelValue.className = 'p-skeleton p-skeleton-value';
    var skelText1 = document.createElement('div');
    skelText1.className = 'p-skeleton p-skeleton-text';
    var skelText2 = document.createElement('div');
    skelText2.className = 'p-skeleton p-skeleton-text';
    loadingEl.appendChild(skelValue);
    loadingEl.appendChild(skelText1);
    loadingEl.appendChild(skelText2);

    // Build error state
    var errCenter = document.createElement('div');
    errCenter.className = 'p-center';
    var errEmpty = document.createElement('div');
    errEmpty.className = 'p-empty';
    var errIcon = document.createElement('div');
    errIcon.className = 'p-empty-icon';
    errIcon.textContent = '\u26A0';
    var errMsg = document.createElement('div');
    errMsg.className = 'p-empty-message';
    errMsg.textContent = errorMessage;
    errEmpty.appendChild(errIcon);
    errEmpty.appendChild(errMsg);
    errCenter.appendChild(errEmpty);
    errorEl.appendChild(errCenter);

    // Build empty state
    var empCenter = document.createElement('div');
    empCenter.className = 'p-center';
    var empEmpty = document.createElement('div');
    empEmpty.className = 'p-empty';
    var empIcon = document.createElement('div');
    empIcon.className = 'p-empty-icon';
    empIcon.textContent = '\u2205';
    var empMsg = document.createElement('div');
    empMsg.className = 'p-empty-message';
    empMsg.textContent = emptyMessage;
    empEmpty.appendChild(empIcon);
    empEmpty.appendChild(empMsg);
    empCenter.appendChild(empEmpty);
    emptyEl.appendChild(empCenter);

    // Append all state containers to host element
    el.appendChild(loadingEl);
    el.appendChild(errorEl);
    el.appendChild(emptyEl);
    el.appendChild(contentEl);

    var disposed = false;

    function showState(state) {
      loadingEl.style.display = state === 'loading' ? '' : 'none';
      errorEl.style.display = state === 'error' ? '' : 'none';
      emptyEl.style.display = state === 'empty' ? '' : 'none';
      contentEl.style.display = state === 'content' ? '' : 'none';
      if (state === 'content') {
        contentEl.classList.add('p-fade-in');
      }
    }

    function run() {
      if (disposed) return;
      showState('loading');

      if (typeof loadFn !== 'function') {
        showState('error');
        return;
      }

      var promise;
      try {
        promise = loadFn();
      } catch (e) {
        showState('error');
        return;
      }

      if (!promise || typeof promise.then !== 'function') {
        showState('error');
        return;
      }

      promise
        .then(function (data) {
          if (disposed) return;
          if (emptyFn(data)) {
            showState('empty');
          } else {
            if (typeof renderFn === 'function') {
              try {
                renderFn(data, contentEl);
              } catch (e) {
                showState('error');
                return;
              }
            }
            showState('content');
          }
        })
        ['catch'](function () {
          if (disposed) return;
          showState('error');
        });
    }

    // Initial load
    run();

    return {
      reload: function () {
        contentEl.classList.remove('p-fade-in');
        run();
      },
      dispose: function () {
        disposed = true;
        loadingEl.style.display = 'none';
        errorEl.style.display = 'none';
        emptyEl.style.display = 'none';
        contentEl.style.display = 'none';
      },
    };
  }

  // ==================== ENTRANCE ANIMATION ====================

  function animateEntranceComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var delay = opts.delay || 0;
    var stagger = opts.stagger || 40;

    var reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return { dispose: function () {} };

    var children = el.children;
    if (children.length === 0) return { dispose: function () {} };

    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      child.style.opacity = '0';
      child.style.transform = 'translateY(6px)';
      child.style.transition =
        'opacity var(--p-spring-standard-t, 500ms) ease-out, transform var(--p-spring-standard-t, 500ms) var(--p-spring-standard, ease-out)';
      child.style.transitionDelay = delay + i * stagger + 'ms';
    }

    // Trigger after reflow
    void el.offsetHeight;
    for (var j = 0; j < children.length; j++) {
      children[j].style.opacity = '1';
      children[j].style.transform = 'translateY(0)';
    }

    return {
      dispose: function () {
        for (var k = 0; k < children.length; k++) {
          children[k].style.removeProperty('opacity');
          children[k].style.removeProperty('transform');
          children[k].style.removeProperty('transition');
          children[k].style.removeProperty('transition-delay');
        }
      },
    };
  }

  // ==================== SIZE TIER OBSERVER ====================

  function initSizeTier() {
    if (!document.body) {
      setTimeout(initSizeTier, 10);
      return;
    }

    var tiers = ['p-compact', 'p-standard', 'p-expanded'];
    var currentTier = '';

    function updateTier() {
      var w = document.body.clientWidth;
      var tier;
      if (w < 250) {
        tier = 'p-compact';
      } else if (w >= 400) {
        tier = 'p-expanded';
      } else {
        tier = 'p-standard';
      }
      if (tier !== currentTier) {
        for (var i = 0; i < tiers.length; i++) {
          document.body.classList.remove(tiers[i]);
        }
        document.body.classList.add(tier);
        currentTier = tier;
      }
    }

    updateTier();

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(H.throttle(updateTier, 150)).observe(document.body);
    }
  }

  // ==================== INIT ====================
  attach();
  initSizeTier();
})();
