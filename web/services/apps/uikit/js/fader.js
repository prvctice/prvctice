/**
 * prvctice UI Kit — Fader
 * Mixing-console fader control with vertical/horizontal orientation,
 * center detent, label, value readout, and double-click reset.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Create a mixing-console fader control.
   * @param {HTMLElement} container - Parent element to append fader into
   * @param {object} [opts]
   * @param {number} [opts.min] - Minimum value (default 0)
   * @param {number} [opts.max] - Maximum value (default 1)
   * @param {number} [opts.step] - Step size (default 0.01)
   * @param {number} [opts.value] - Initial value (default min)
   * @param {string} [opts.label] - Label text shown above fader
   * @param {function} [opts.format] - Format function for display value (default: v.toFixed(2))
   * @param {string} [opts.orientation] - 'vertical' (default) or 'horizontal'
   * @param {string} [opts.color] - Track fill color (default accent-blue)
   * @param {number|null} [opts.detent] - Center detent snap value (null = no detent)
   * @param {function} [opts.onChange] - Callback when value changes
   * @returns {{ get(), set(v), dispose() }}
   */
  function faderComponent(container, opts) {
    if (!opts) opts = {};
    var min = typeof opts.min === 'number' ? opts.min : 0;
    var max = typeof opts.max === 'number' ? opts.max : 1;
    var step = opts.step || 0.01;
    var value = typeof opts.value === 'number' ? opts.value : min;
    var initialValue = value;
    var label = opts.label || '';
    var format =
      opts.format ||
      function (v) {
        return v.toFixed(2);
      };
    var orientation = opts.orientation || 'vertical';
    var isVertical = orientation === 'vertical';
    var onChange = opts.onChange || function () {};
    var range = max - min;
    var detent = typeof opts.detent === 'number' ? opts.detent : null;
    var detentRange = range * 0.05; // 5% of range for snap zone

    // Resolve color
    var colorVar = opts.color || 'var(--p-accent-blue)';

    // Build DOM
    var wrap = document.createElement('div');
    wrap.className = 'p-fader-wrap' + (isVertical ? '' : ' p-fader-wrap--horizontal');

    if (label) {
      var labelEl = document.createElement('span');
      labelEl.className = 'p-label-tech';
      labelEl.textContent = label;
      wrap.appendChild(labelEl);
    }

    var faderEl = document.createElement('div');
    faderEl.className = 'p-fader ' + (isVertical ? 'p-fader--vertical' : 'p-fader--horizontal');
    faderEl.style.setProperty('--p-fader-color', colorVar);

    var trackEl = document.createElement('div');
    trackEl.className = 'p-fader-track';
    faderEl.appendChild(trackEl);

    var fillEl = document.createElement('div');
    fillEl.className = 'p-fader-fill';
    faderEl.appendChild(fillEl);

    var thumbEl = document.createElement('div');
    thumbEl.className = 'p-fader-thumb';
    faderEl.appendChild(thumbEl);

    wrap.appendChild(faderEl);

    var valEl = document.createElement('span');
    valEl.className = 'p-fader-val';
    wrap.appendChild(valEl);

    container.appendChild(wrap);

    // Visual update
    function updateVisual() {
      var pct = range > 0 ? (value - min) / range : 0;
      var pctClamped = Math.max(0, Math.min(1, pct));

      if (isVertical) {
        // Vertical: bottom = 0, top = 1
        fillEl.style.height = pctClamped * 100 + '%';
        // Thumb positioned from bottom
        thumbEl.style.bottom = 'calc(' + pctClamped * 100 + '% - 7px)';
      } else {
        // Horizontal: left = 0, right = 1
        fillEl.style.width = pctClamped * 100 + '%';
        // Thumb positioned from left
        thumbEl.style.left = pctClamped * 100 + '%';
      }

      fillEl.style.background = 'var(--p-fader-color, var(--p-accent-blue))';
      valEl.textContent = format(value);
    }

    // Snap to detent if within range
    function applyDetent(v) {
      if (detent !== null && Math.abs(v - detent) <= detentRange) {
        return detent;
      }
      return v;
    }

    // Quantize to step
    function quantize(v) {
      return Math.round(v / step) * step;
    }

    // Drag handling
    var dragging = false;
    var startPos = 0; // clientX or clientY at drag start
    var startVal = 0;

    function getTrackLength() {
      if (isVertical) {
        return faderEl.getBoundingClientRect().height - 16; // minus thumb height
      } else {
        return faderEl.getBoundingClientRect().width - 14; // minus thumb width
      }
    }

    function onDown(e) {
      e.preventDefault();
      dragging = true;
      if (e.type === 'touchstart') {
        startPos = isVertical ? e.touches[0].clientY : e.touches[0].clientX;
      } else {
        startPos = isVertical ? e.clientY : e.clientX;
      }
      startVal = value;
      faderEl.classList.add('p-fader--grabbing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      var clientPos;
      if (e.type === 'touchmove') {
        clientPos = isVertical ? e.touches[0].clientY : e.touches[0].clientX;
      } else {
        clientPos = isVertical ? e.clientY : e.clientX;
      }

      var delta = startPos - clientPos; // Up = positive for vertical
      if (!isVertical) {
        delta = clientPos - startPos; // Right = positive for horizontal
      }

      var trackLen = getTrackLength();
      if (trackLen <= 0) trackLen = 1;
      var valueDelta = (delta / trackLen) * range;

      var next = startVal + valueDelta;
      next = Math.max(min, Math.min(max, next));
      next = quantize(next);
      next = applyDetent(next);

      if (next !== value) {
        value = next;
        updateVisual();
        onChange(value);
      }
    }

    function onUp() {
      dragging = false;
      faderEl.classList.remove('p-fader--grabbing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }

    // Click on track to jump to position
    function onTrackClick(e) {
      if (dragging) return;
      var rect = faderEl.getBoundingClientRect();
      var pct;
      if (isVertical) {
        // Bottom = 0, top = 1
        pct = 1 - (e.clientY - rect.top) / rect.height;
      } else {
        // Left = 0, right = 1
        pct = (e.clientX - rect.left) / rect.width;
      }
      pct = Math.max(0, Math.min(1, pct));
      var next = min + pct * range;
      next = quantize(next);
      next = applyDetent(next);
      if (next !== value) {
        value = next;
        updateVisual();
        onChange(value);
      }
    }

    thumbEl.addEventListener('mousedown', onDown);
    thumbEl.addEventListener('touchstart', onDown, { passive: false });
    faderEl.addEventListener('click', onTrackClick);

    // Double-click to reset
    faderEl.addEventListener('dblclick', function () {
      value = initialValue;
      updateVisual();
      onChange(value);
    });

    updateVisual();

    return {
      get: function () {
        return value;
      },
      set: function (v) {
        value = Math.max(min, Math.min(max, v));
        value = quantize(value);
        updateVisual();
        onChange(value);
      },
      dispose: function () {
        thumbEl.removeEventListener('mousedown', onDown);
        thumbEl.removeEventListener('touchstart', onDown);
        faderEl.removeEventListener('click', onTrackClick);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
    };
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.ui) {
      window.prvctice.ui.fader = faderComponent;
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
