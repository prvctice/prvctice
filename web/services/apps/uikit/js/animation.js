/**
 * prvctice UI Kit -- AnimationKit
 * Spring physics animation system for sandboxed iframe apps.
 * Provides prvctice.animate(), prvctice.sequence(), prvctice.animateValue().
 * Runs entirely in-iframe -- zero postMessage overhead for animation.
 * ES5-compatible -- no modules, no arrow functions, no const/let.
 *
 * Stagger pattern (no separate API -- use delay parameter):
 *   var cards = document.querySelectorAll('.card');
 *   for (var i = 0; i < cards.length; i++) {
 *     prvctice.animate(cards[i], { opacity: 1, transform: 'translateY(0)' }, { delay: i * 40 });
 *   }
 */
(function () {
  'use strict';

  // ==================== REDUCED MOTION ====================

  var reducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ==================== SPRING PRESETS ====================
  // Parameters match CSS linear() tokens in foundation.css

  var PRESETS = {
    xsnappy: { stiffness: 500, damping: 35, mass: 1 }, // ~200ms, no overshoot
    snappy: { stiffness: 300, damping: 28, mass: 1 }, // ~350ms, tiny overshoot (LOCKED DEFAULT)
    standard: { stiffness: 170, damping: 20, mass: 1 }, // ~500ms, moderate overshoot
    gentle: { stiffness: 100, damping: 15, mass: 1 }, // ~800ms, visible overshoot
    bouncy: { stiffness: 150, damping: 12, mass: 1 }, // ~900ms, pronounced bounce
  };

  var DEFAULT_PRESET = 'snappy';

  // ==================== SPRING SOLVER ====================

  /**
   * Create a spring curve function.
   * Returns { fn: function(t) => 0..1 displacement, duration: seconds }
   *
   * @param {number} stiffness
   * @param {number} damping
   * @param {number} mass
   * @param {number} initialVelocity - normalized velocity (0 when no gesture)
   */
  function springCurve(stiffness, damping, mass, initialVelocity) {
    var v0 = initialVelocity || 0;
    var omega0 = Math.sqrt(stiffness / mass);
    var zeta = damping / (2 * Math.sqrt(stiffness * mass));

    var fn;
    if (zeta < 1) {
      // Underdamped: oscillates and decays
      var omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      fn = function (t) {
        var envelope = Math.exp(-zeta * omega0 * t);
        var sinCoeff = (zeta * omega0 + v0) / omegaD;
        return 1 - envelope * (Math.cos(omegaD * t) + sinCoeff * Math.sin(omegaD * t));
      };
    } else {
      // Critically/overdamped: exponential decay, no oscillation
      fn = function (t) {
        var env = Math.exp(-omega0 * t);
        return 1 - env * (1 + (omega0 + v0) * t);
      };
    }

    // Estimate settling duration: scan at 60fps until |1 - fn(t)| < 0.001
    var duration = 0.5; // minimum
    var dt = 1 / 60;
    for (var t = 0; t <= 3; t += dt) {
      if (Math.abs(1 - fn(t)) > 0.001) {
        duration = t + dt;
      }
    }
    // Cap at 3 seconds
    duration = Math.min(duration, 3);

    return { fn: fn, duration: duration };
  }

  // ==================== COLOR PARSER ====================

  /**
   * Convert HSL to RGB.
   * @param {number} h - hue 0-360
   * @param {number} s - saturation 0-1
   * @param {number} l - lightness 0-1
   * @returns {Array} [r, g, b] each 0-255
   */
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0,
      g = 0,
      b = 0;

    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  /**
   * Parse a CSS color string to [r, g, b, a] array.
   * Supports: hex (3/6/8 digit), rgb(), rgba(), hsl(), hsla(), 'transparent'.
   * Returns null for unrecognized formats.
   */
  function parseColor(str) {
    if (!str || typeof str !== 'string') return null;
    str = str.trim().toLowerCase();

    if (str === 'transparent') return [0, 0, 0, 0];

    // Hex: #rgb, #rrggbb, #rrggbbaa
    if (str.charAt(0) === '#') {
      var hex = str.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex.charAt(0) + hex.charAt(0), 16),
          parseInt(hex.charAt(1) + hex.charAt(1), 16),
          parseInt(hex.charAt(2) + hex.charAt(2), 16),
          1,
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          1,
        ];
      }
      if (hex.length === 8) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          parseInt(hex.slice(6, 8), 16) / 255,
        ];
      }
      return null;
    }

    // rgb() / rgba() - comma or space syntax
    var rgbMatch = str.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/
    );
    if (rgbMatch) {
      return [
        Math.round(parseFloat(rgbMatch[1])),
        Math.round(parseFloat(rgbMatch[2])),
        Math.round(parseFloat(rgbMatch[3])),
        rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
      ];
    }

    // hsl() / hsla() - comma or space syntax
    var hslMatch = str.match(
      /^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+))?\s*\)$/
    );
    if (hslMatch) {
      var rgb = hslToRgb(
        parseFloat(hslMatch[1]),
        parseFloat(hslMatch[2]) / 100,
        parseFloat(hslMatch[3]) / 100
      );
      return [rgb[0], rgb[1], rgb[2], hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1];
    }

    return null;
  }

  /**
   * Linear interpolation between two RGBA color arrays.
   * Returns rgba() string.
   */
  function lerpColor(fromRGBA, toRGBA, t) {
    var r = Math.round(fromRGBA[0] + (toRGBA[0] - fromRGBA[0]) * t);
    var g = Math.round(fromRGBA[1] + (toRGBA[1] - fromRGBA[1]) * t);
    var b = Math.round(fromRGBA[2] + (toRGBA[2] - fromRGBA[2]) * t);
    var a = fromRGBA[3] + (toRGBA[3] - fromRGBA[3]) * t;
    // Round alpha to 3 decimal places
    a = Math.round(a * 1000) / 1000;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  }

  // ==================== PROPERTY HELPERS ====================

  var COLOR_PROPS = {
    backgroundColor: true,
    color: true,
    borderColor: true,
    outlineColor: true,
    textDecorationColor: true,
  };

  function isColorProp(prop) {
    return COLOR_PROPS[prop] === true;
  }

  /**
   * Camel-case to kebab-case conversion.
   */
  function toKebab(str) {
    return str.replace(/[A-Z]/g, function (ch) {
      return '-' + ch.toLowerCase();
    });
  }

  /**
   * Parse numeric values from a transform string.
   * Returns array of { value, unit, prefix, suffix } segments.
   */
  function parseTransformNumbers(str) {
    var parts = [];
    var regex = /([a-zA-Z3]+)\(([^)]+)\)/g;
    var match;
    while ((match = regex.exec(str)) !== null) {
      var fn = match[1];
      var args = match[2].split(',');
      for (var i = 0; i < args.length; i++) {
        var arg = args[i].trim();
        var numMatch = arg.match(/^([-\d.]+)(.*)$/);
        if (numMatch) {
          parts.push({
            fn: fn,
            argIndex: i,
            value: parseFloat(numMatch[1]),
            unit: numMatch[2] || '',
          });
        }
      }
    }
    return parts;
  }

  /**
   * Interpolate a transform string by lerping each numeric argument.
   */
  function lerpTransform(fromStr, toStr, t) {
    var fromParts = parseTransformNumbers(fromStr);
    var toParts = parseTransformNumbers(toStr);

    // Build result from the target string structure, interpolating values
    var result = toStr;
    // Walk backwards through toParts to replace without offset issues
    for (var i = toParts.length - 1; i >= 0; i--) {
      var fromVal = i < fromParts.length ? fromParts[i].value : 0;
      var toVal = toParts[i].value;
      var interpolated = fromVal + (toVal - fromVal) * t;
      // Round to 3 decimal places for clean output
      interpolated = Math.round(interpolated * 1000) / 1000;
      // Replace in result string -- rebuild each transform function
    }

    // Simpler approach: rebuild transform from parsed parts
    var fromMap = {};
    var regex = /([a-zA-Z3]+)\(([^)]+)\)/g;
    var match;
    while ((match = regex.exec(fromStr)) !== null) {
      fromMap[match[1]] = match[2];
    }

    var output = '';
    regex.lastIndex = 0;
    while ((match = regex.exec(toStr)) !== null) {
      var fn = match[1];
      var toArgs = match[2].split(',');
      var fromArgs = fromMap[fn] ? fromMap[fn].split(',') : [];

      var interpolatedArgs = [];
      for (var j = 0; j < toArgs.length; j++) {
        var toArg = toArgs[j].trim();
        var fromArg = j < fromArgs.length ? fromArgs[j].trim() : toArg;

        var toNum = parseFloat(toArg);
        var fromNum = parseFloat(fromArg);
        var unit = toArg.replace(/^[-\d.]+/, '');

        if (!isNaN(toNum) && !isNaN(fromNum)) {
          var val = fromNum + (toNum - fromNum) * t;
          val = Math.round(val * 1000) / 1000;
          interpolatedArgs.push(val + unit);
        } else {
          interpolatedArgs.push(toArg);
        }
      }

      if (output) output += ' ';
      output += fn + '(' + interpolatedArgs.join(', ') + ')';
    }

    return output;
  }

  /**
   * Interpolate a single CSS property value.
   */
  function interpolateValue(prop, fromStr, toStr, t) {
    if (isColorProp(prop)) {
      var fromC = parseColor(fromStr);
      var toC = parseColor(toStr);
      if (fromC && toC) return lerpColor(fromC, toC, t);
      // Fallback: snap to target
      return t < 0.5 ? fromStr : toStr;
    }

    if (prop === 'transform') {
      return lerpTransform(fromStr, toStr, t);
    }

    // Numeric property (opacity, etc.)
    var fromNum = parseFloat(fromStr);
    var toNum = parseFloat(toStr);
    if (!isNaN(fromNum) && !isNaN(toNum)) {
      var unit = toStr.replace(/^[-\d.]+/, '');
      var val = fromNum + (toNum - fromNum) * t;
      val = Math.round(val * 1000) / 1000;
      return val + unit;
    }

    // Non-numeric: snap
    return t < 0.5 ? fromStr : toStr;
  }

  // ==================== WAAPI KEYFRAME GENERATOR ====================

  /**
   * Build WAAPI keyframes array from property maps and spring function.
   * Caps at 60 keyframes for performance.
   */
  function buildKeyframes(fromProps, toProps, springFn, durationSec) {
    var numFrames = Math.ceil(durationSec * 60);
    if (numFrames > 60) numFrames = 60;
    if (numFrames < 2) numFrames = 2;

    var keyframes = [];
    var props = Object.keys(toProps);

    for (var i = 0; i <= numFrames; i++) {
      var tNorm = i / numFrames;
      var tSec = tNorm * durationSec;
      var springT = springFn(tSec);

      var frame = { offset: tNorm };
      for (var p = 0; p < props.length; p++) {
        var prop = props[p];
        frame[prop] = interpolateValue(prop, fromProps[prop], toProps[prop], springT);
      }
      keyframes.push(frame);
    }

    return keyframes;
  }

  // ==================== STYLE HELPERS ====================

  /**
   * Commit final property values as inline styles on an element.
   */
  function commitStyles(el, propValues) {
    var props = Object.keys(propValues);
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      el.style[prop] = propValues[prop];
    }
  }

  /**
   * Read current computed values for given property names.
   */
  function readComputedProps(el, propNames) {
    var computed = getComputedStyle(el);
    var values = {};
    for (var i = 0; i < propNames.length; i++) {
      var prop = propNames[i];
      values[prop] = computed[prop] || '';
    }
    return values;
  }

  /**
   * Resolve a selector-or-element to an Element. Returns null if not found.
   */
  function resolveElement(selector) {
    if (!selector) return null;
    if (typeof selector === 'string') return document.querySelector(selector);
    if (selector.nodeType) return selector;
    return null;
  }

  /**
   * Create a no-op animation handle.
   */
  function noopHandle() {
    return { cancel: function () {}, finished: Promise.resolve() };
  }

  // ==================== ATTACH ====================

  function attach() {
    if (!window.prvctice) {
      setTimeout(attach, 10);
      return;
    }

    // ==================== prvctice.animate() ====================

    /**
     * Animate CSS properties with spring physics.
     *
     * @param {Element|string} selector - DOM element or CSS selector
     * @param {Object} props - Target CSS property values
     * @param {Object} [opts] - Options: preset, stiffness, damping, mass, initialVelocity, delay, onComplete
     * @returns {{ cancel: function, finished: Promise }}
     */
    window.prvctice.animate = function (selector, props, opts) {
      opts = opts || {};
      var el = resolveElement(selector);
      if (!el) return noopHandle();
      if (!props || typeof props !== 'object') return noopHandle();

      var propNames = Object.keys(props);
      if (propNames.length === 0) return noopHandle();

      // Build target property map (string values)
      var toProps = {};
      for (var i = 0; i < propNames.length; i++) {
        toProps[propNames[i]] = String(props[propNames[i]]);
      }

      // Reduced motion: jump to end state
      if (reducedMotion) {
        commitStyles(el, toProps);
        if (opts.onComplete) {
          try {
            opts.onComplete();
          } catch (e) {
            /* swallow */
          }
        }
        return noopHandle();
      }

      // Resolve spring parameters
      var preset = PRESETS[opts.preset || DEFAULT_PRESET] || PRESETS[DEFAULT_PRESET];
      var stiffness = opts.stiffness || preset.stiffness;
      var damping = opts.damping || preset.damping;
      var mass = opts.mass || preset.mass;
      var initialVelocity = opts.initialVelocity || 0;

      // Normalize velocity: convert absolute velocity to normalized
      // If animating a single numeric property, normalizedV = absoluteV / (to - from)
      // For multi-property, use raw value as normalized
      var normalizedV = initialVelocity;

      var spring = springCurve(stiffness, damping, mass, normalizedV);
      var durationSec = spring.duration;
      var springFn = spring.fn;

      // State for cancel/finished
      var cancelled = false;
      var waAnimation = null;
      var delayTimer = null;
      var resolveFinished;
      var finishedPromise = new Promise(function (resolve) {
        resolveFinished = resolve;
      });

      function run() {
        if (cancelled) return;

        // Read current computed values as "from"
        var fromProps = readComputedProps(el, propNames);

        // Build keyframes
        var keyframes = buildKeyframes(fromProps, toProps, springFn, durationSec);

        // Run WAAPI animation
        waAnimation = el.animate(keyframes, {
          duration: durationSec * 1000,
          fill: 'forwards',
        });

        waAnimation.finished
          .then(function () {
            if (!cancelled) {
              // Commit final values as inline styles, then remove WAAPI effect
              commitStyles(el, toProps);
              waAnimation.cancel();
              waAnimation = null;
              if (opts.onComplete) {
                try {
                  opts.onComplete();
                } catch (e) {
                  /* swallow */
                }
              }
              resolveFinished();
            }
          })
          ['catch'](function () {
            // Animation was cancelled externally
            if (!cancelled) {
              resolveFinished();
            }
          });
      }

      // Delay handling
      if (opts.delay && opts.delay > 0) {
        delayTimer = setTimeout(run, opts.delay);
      } else {
        run();
      }

      return {
        cancel: function () {
          if (cancelled) return;
          cancelled = true;

          if (delayTimer !== null) {
            clearTimeout(delayTimer);
            delayTimer = null;
          }

          if (waAnimation) {
            // Freeze at current position: read computed, apply inline, then cancel WAAPI
            var currentValues = readComputedProps(el, propNames);
            commitStyles(el, currentValues);
            waAnimation.cancel();
            waAnimation = null;
          }

          resolveFinished();
        },
        finished: finishedPromise,
      };
    };

    // ==================== prvctice.sequence() ====================

    /**
     * Chain sequential animations.
     *
     * @param {Array<{ target, props, opts }>} steps - Ordered animation steps
     * @returns {{ cancel: function, finished: Promise }}
     */
    window.prvctice.sequence = function (steps) {
      if (!steps || !steps.length) return noopHandle();

      // Reduced motion: apply all target props immediately
      if (reducedMotion) {
        for (var i = 0; i < steps.length; i++) {
          var el = resolveElement(steps[i].target);
          if (el && steps[i].props) {
            var propNames = Object.keys(steps[i].props);
            var toProps = {};
            for (var p = 0; p < propNames.length; p++) {
              toProps[propNames[p]] = String(steps[i].props[propNames[p]]);
            }
            commitStyles(el, toProps);
            if (steps[i].opts && steps[i].opts.onComplete) {
              try {
                steps[i].opts.onComplete();
              } catch (e) {
                /* swallow */
              }
            }
          }
        }
        return noopHandle();
      }

      var cancelled = false;
      var currentHandle = null;
      var resolveFinished;
      var finishedPromise = new Promise(function (resolve) {
        resolveFinished = resolve;
      });

      // Chain steps via .then()
      var chain = Promise.resolve();
      for (var s = 0; s < steps.length; s++) {
        (function (step) {
          chain = chain.then(function () {
            if (cancelled) return;
            currentHandle = window.prvctice.animate(step.target, step.props, step.opts);
            return currentHandle.finished;
          });
        })(steps[s]);
      }

      chain
        .then(function () {
          resolveFinished();
        })
        ['catch'](function () {
          resolveFinished();
        });

      return {
        cancel: function () {
          if (cancelled) return;
          cancelled = true;
          if (currentHandle) {
            currentHandle.cancel();
            currentHandle = null;
          }
          resolveFinished();
        },
        finished: finishedPromise,
      };
    };

    // ==================== prvctice.animateValue() ====================

    /**
     * Animate an arbitrary numeric value with spring physics via RAF.
     *
     * @param {Element|string|null} target - Element for textContent update, or null for callback-only
     * @param {number} from - Start value
     * @param {number} to - End value
     * @param {Object} [opts] - Options: preset, stiffness, damping, mass, initialVelocity, format, onUpdate, onComplete
     * @returns {{ cancel: function, finished: Promise }}
     */
    window.prvctice.animateValue = function (target, from, to, opts) {
      opts = opts || {};
      var el = target ? resolveElement(target) : null;
      var format =
        opts.format ||
        function (v) {
          return Math.round(v).toLocaleString();
        };
      var onUpdate = opts.onUpdate || null;
      var onComplete = opts.onComplete || null;

      // Reduced motion: jump to end
      if (reducedMotion || from === to) {
        if (el) {
          el.style.fontVariantNumeric = 'tabular-nums';
          el.textContent = format(to);
        }
        if (onUpdate) {
          try {
            onUpdate(to);
          } catch (e) {
            /* swallow */
          }
        }
        if (onComplete) {
          try {
            onComplete();
          } catch (e) {
            /* swallow */
          }
        }
        return noopHandle();
      }

      // Resolve spring
      var preset = PRESETS[opts.preset || DEFAULT_PRESET] || PRESETS[DEFAULT_PRESET];
      var stiffness = opts.stiffness || preset.stiffness;
      var damping = opts.damping || preset.damping;
      var mass = opts.mass || preset.mass;
      var initialVelocity = opts.initialVelocity || 0;

      // Normalize velocity relative to range
      var range = to - from;
      var normalizedV = range !== 0 ? initialVelocity / range : 0;

      var spring = springCurve(stiffness, damping, mass, normalizedV);
      var durationSec = spring.duration;
      var springFn = spring.fn;

      var cancelled = false;
      var rafId = null;
      var startTime = performance.now();
      var resolveFinished;
      var finishedPromise = new Promise(function (resolve) {
        resolveFinished = resolve;
      });

      if (el) {
        el.style.fontVariantNumeric = 'tabular-nums';
      }

      function tick() {
        if (cancelled) return;
        var elapsed = (performance.now() - startTime) / 1000;

        if (elapsed >= durationSec) {
          // Final value
          if (el) el.textContent = format(to);
          if (onUpdate) {
            try {
              onUpdate(to);
            } catch (e) {
              /* swallow */
            }
          }
          if (onComplete) {
            try {
              onComplete();
            } catch (e) {
              /* swallow */
            }
          }
          rafId = null;
          resolveFinished();
          return;
        }

        var currentValue = from + range * springFn(elapsed);
        if (el) el.textContent = format(currentValue);
        if (onUpdate) {
          try {
            onUpdate(currentValue);
          } catch (e) {
            /* swallow */
          }
        }
        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);

      return {
        cancel: function () {
          if (cancelled) return;
          cancelled = true;
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          resolveFinished();
        },
        finished: finishedPromise,
      };
    };
  }

  attach();
})();
