/**
 * prvctice UI Kit — Knob
 * Rotary dial UI component with conic-gradient arc, drag interaction,
 * and double-click reset.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Create a rotary knob control.
   * @param {HTMLElement} container - Parent element to append knob into
   * @param {object} [opts]
   * @param {number} [opts.min] - Minimum value (default 0)
   * @param {number} [opts.max] - Maximum value (default 1)
   * @param {number} [opts.step] - Step size (default 0.01)
   * @param {number} [opts.value] - Initial value (default min)
   * @param {string} [opts.label] - Label text shown above knob
   * @param {function} [opts.format] - Format function for display value (default: v.toFixed(2))
   * @param {number} [opts.size] - Knob diameter in px (default 44)
   * @param {string} [opts.color] - Arc color CSS var or value (default '--p-accent-blue')
   * @param {function} [opts.onChange] - Callback when value changes
   * @returns {{ get(), set(v), dispose() }}
   */
  function knobComponent(container, opts) {
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
    var size = opts.size || 44;
    var onChange = opts.onChange || function () {};
    var range = max - min;

    // Resolve color
    var colorVar = opts.color || 'var(--p-accent-blue)';

    // Build DOM: .p-knob-wrap > .p-label-tech + .p-knob > .p-knob-dot + .p-knob-val
    var wrap = document.createElement('div');
    wrap.className = 'p-knob-wrap';

    if (label) {
      var labelEl = document.createElement('span');
      labelEl.className = 'p-label-tech';
      labelEl.textContent = label;
      wrap.appendChild(labelEl);
    }

    var knobEl = document.createElement('div');
    knobEl.className = 'p-knob';
    knobEl.style.setProperty('--p-knob-size', size + 'px');
    knobEl.style.setProperty('--p-knob-color', colorVar);

    var dotEl = document.createElement('div');
    dotEl.className = 'p-knob-dot';
    knobEl.appendChild(dotEl);

    wrap.appendChild(knobEl);

    var valEl = document.createElement('span');
    valEl.className = 'p-knob-val';
    wrap.appendChild(valEl);

    container.appendChild(wrap);

    // Visual update
    function updateVisual() {
      var pct = (value - min) / range;
      knobEl.style.setProperty('--p-knob-fill', pct * 270 + 'deg');
      dotEl.style.transform = 'rotate(' + (-135 + pct * 270) + 'deg)';
      valEl.textContent = format(value);
    }

    // Drag handling
    var dragging = false;
    var startY = 0;
    var startVal = 0;

    function onDown(e) {
      e.preventDefault();
      dragging = true;
      startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      startVal = value;
      knobEl.classList.add('p-knob--grabbing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      var clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
      var dy = startY - clientY;
      var next = startVal + (dy / 180) * range;
      next = Math.max(min, Math.min(max, next));
      next = Math.round(next / step) * step;
      if (next !== value) {
        value = next;
        updateVisual();
        onChange(value);
      }
    }

    function onUp() {
      dragging = false;
      knobEl.classList.remove('p-knob--grabbing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }

    knobEl.addEventListener('mousedown', onDown);
    knobEl.addEventListener('touchstart', onDown, { passive: false });
    knobEl.addEventListener('dblclick', function () {
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
        updateVisual();
        onChange(value);
      },
      dispose: function () {
        knobEl.removeEventListener('mousedown', onDown);
        knobEl.removeEventListener('touchstart', onDown);
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
      window.prvctice.ui.knob = knobComponent;
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
