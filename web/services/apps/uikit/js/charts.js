/**
 * prvctice UI Kit — Charts
 * SVG-based chart components attached to window.prvctice.ui.
 * Depends on helpers.js (window._pHelpers) and runtime.js (window.prvctice.ui).
 * ES5-compatible — no modules, no arrow functions, no const/let.
 *
 * Components: sparkline, barChart, lineChart, gauge, pieChart, progressRing
 * All return { update(opts), dispose() }
 */
(function () {
  'use strict';

  var H = window._pHelpers || {};
  var NS = 'http://www.w3.org/2000/svg';

  // ==================== SHARED UTILITIES ====================

  function getThemeColors() {
    var s = getComputedStyle(document.documentElement);
    return [
      s.getPropertyValue('--p-primary').trim() || '#6366f1',
      s.getPropertyValue('--p-accent').trim() || '#06b6d4',
      s.getPropertyValue('--p-secondary').trim() || '#8b5cf6',
      s.getPropertyValue('--p-success').trim() || '#22c55e',
      s.getPropertyValue('--p-warning').trim() || '#f59e0b',
      s.getPropertyValue('--p-danger').trim() || '#ef4444',
    ];
  }

  function getTextColor() {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--p-text-secondary').trim() ||
      '#999'
    );
  }

  function getBorderColor() {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--p-border-subtle').trim() ||
      'rgba(255,255,255,0.06)'
    );
  }

  function getPrimaryColor() {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--p-primary').trim() || '#6366f1'
    );
  }

  function getBgColor() {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--p-bg').trim() || '#1a1a2e'
    );
  }

  function svgEl(tag) {
    return document.createElementNS(NS, tag);
  }

  function setAttrs(el, attrs) {
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        el.setAttribute(key, attrs[key]);
      }
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Animate from 0..1 over duration ms. Calls onFrame(easedProgress) each RAF.
   * Returns a cancel function.
   */
  function animateProgress(duration, onFrame, onDone) {
    if (!duration || duration <= 0) {
      onFrame(1);
      if (onDone) onDone();
      return function () {};
    }
    var start = null;
    var id = null;
    var cancelled = false;

    function step(ts) {
      if (cancelled) return;
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      onFrame(easeOutCubic(t));
      if (t < 1) {
        id = requestAnimationFrame(step);
      } else {
        if (onDone) onDone();
      }
    }

    id = requestAnimationFrame(step);
    return function () {
      cancelled = true;
      if (id) cancelAnimationFrame(id);
    };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Build SVG polyline path string from [[x,y], ...] */
  function polylinePath(pts) {
    if (!pts || pts.length === 0) return '';
    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      d += ' L ' + pts[i][0] + ' ' + pts[i][1];
    }
    return d;
  }

  /** Build smooth cardinal spline path through points */
  function smoothPath(pts, tension) {
    if (!pts || pts.length < 2) return polylinePath(pts);
    if (pts.length === 2) return polylinePath(pts);
    tension = tension || 0.3;

    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i === 0 ? i : i - 1];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      var cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      var cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      var cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      var cp2y = p2[1] - (p3[1] - p1[1]) * tension;

      d += ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + p2[0] + ' ' + p2[1];
    }
    return d;
  }

  /** Create an SVG root element sized to fill the container */
  function createChartSVG(el) {
    var svg = svgEl('svg');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    el.innerHTML = '';
    el.appendChild(svg);
    return svg;
  }

  /** Clear all children of an SVG element */
  function clearSVG(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  /** Setup ResizeObserver that calls render on container resize */
  function watchResize(el, renderFn) {
    if (typeof ResizeObserver === 'undefined') return null;
    var ro = new ResizeObserver(H.throttle(renderFn, 100));
    ro.observe(el);
    return ro;
  }

  // ==================== SPARKLINE ====================

  function sparklineComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var data = opts.data || [];
    var color = opts.color || null;
    var showFill = opts.fill !== false;
    var smooth = opts.smooth !== false;
    var animDuration = opts.animate !== false ? 600 : 0;
    var strokeWidth = opts.strokeWidth || 2;

    el.classList.add('p-chart', 'p-chart-sparkline');
    var svg = createChartSVG(el);

    var cancelAnim = null;
    var progress = 1;

    function render(p) {
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      if (w === 0 || h === 0 || data.length === 0) return;

      clearSVG(svg);
      setAttrs(svg, { viewBox: '0 0 ' + w + ' ' + h });

      var c = color || getPrimaryColor();
      var pad = strokeWidth + 1;
      var min = Infinity,
        max = -Infinity;
      for (var i = 0; i < data.length; i++) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }
      var range = max - min || 1;

      var n = data.length;
      var visibleCount = Math.max(2, Math.ceil(n * p));
      var points = [];
      for (var j = 0; j < visibleCount && j < n; j++) {
        var x = n > 1 ? (j / (n - 1)) * (w - pad * 2) + pad : w / 2;
        var y = h - pad - ((data[j] - min) / range) * (h - pad * 2);
        points.push([x, y]);
      }

      var d = smooth ? smoothPath(points) : polylinePath(points);

      // Fill area
      if (showFill && points.length > 1) {
        var fillPath = svgEl('path');
        var fillD =
          d +
          ' L ' +
          points[points.length - 1][0] +
          ' ' +
          (h - pad) +
          ' L ' +
          points[0][0] +
          ' ' +
          (h - pad) +
          ' Z';
        setAttrs(fillPath, { d: fillD, fill: c, opacity: '0.12' });
        svg.appendChild(fillPath);
      }

      // Stroke line
      var line = svgEl('path');
      setAttrs(line, {
        d: d,
        stroke: c,
        'stroke-width': strokeWidth,
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      svg.appendChild(line);
    }

    function doAnimate() {
      if (cancelAnim) cancelAnim();
      if (animDuration > 0) {
        cancelAnim = animateProgress(animDuration, function (p) {
          progress = p;
          render(p);
        });
      } else {
        progress = 1;
        render(1);
      }
    }

    var ro = watchResize(el, function () {
      render(progress);
    });
    doAnimate();

    return {
      update: function (newOpts) {
        if (newOpts.data) data = newOpts.data;
        if (newOpts.color !== undefined) color = newOpts.color;
        doAnimate();
      },
      dispose: function () {
        if (cancelAnim) cancelAnim();
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
        el.classList.remove('p-chart', 'p-chart-sparkline');
      },
    };
  }

  // ==================== BAR CHART ====================

  function barChartComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var labels = opts.labels || [];
    var values = opts.values || [];
    var colors = opts.colors || null;
    var showValues = opts.showValues !== false;
    var horizontal = opts.horizontal || false;
    var animDuration = opts.animate !== false ? 600 : 0;
    var barRadius = opts.barRadius || 4;

    el.classList.add('p-chart', 'p-chart-bar');
    var svg = createChartSVG(el);

    var cancelAnim = null;
    var progress = 1;

    function render(p) {
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      if (w === 0 || h === 0 || values.length === 0) return;

      clearSVG(svg);
      setAttrs(svg, { viewBox: '0 0 ' + w + ' ' + h });

      var palette = colors || getThemeColors();
      var textColor = getTextColor();
      var n = values.length;
      var maxVal = 0;
      for (var i = 0; i < n; i++) {
        if (Math.abs(values[i]) > maxVal) maxVal = Math.abs(values[i]);
      }
      if (maxVal === 0) maxVal = 1;

      if (horizontal) {
        var labelW = 60;
        var barAreaW = w - labelW - 16;
        var barH = Math.min(28, (h - 8) / n - 4);
        var totalH = n * (barH + 4);
        var startY = (h - totalH) / 2;

        for (var hi = 0; hi < n; hi++) {
          var bw = (Math.abs(values[hi]) / maxVal) * barAreaW * p;
          var by = startY + hi * (barH + 4);
          var c = palette[hi % palette.length];

          var bar = svgEl('rect');
          setAttrs(bar, {
            x: labelW,
            y: by,
            width: Math.max(0, bw),
            height: barH,
            rx: barRadius,
            ry: barRadius,
            fill: c,
          });
          svg.appendChild(bar);

          var lbl = svgEl('text');
          setAttrs(lbl, {
            x: labelW - 6,
            y: by + barH / 2,
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            fill: textColor,
            'font-size': '11',
            'font-family': "'Gothic A1', system-ui, sans-serif",
          });
          lbl.textContent = labels[hi] || '';
          svg.appendChild(lbl);

          if (showValues && p > 0.5) {
            var vt = svgEl('text');
            setAttrs(vt, {
              x: labelW + bw + 6,
              y: by + barH / 2,
              'dominant-baseline': 'central',
              fill: textColor,
              'font-size': '11',
              'font-family': "'IBM Plex Mono', monospace",
              opacity: Math.min(1, (p - 0.5) * 2),
            });
            vt.textContent = values[hi];
            svg.appendChild(vt);
          }
        }
      } else {
        // Vertical bars
        var lblH = 24;
        var valH = showValues ? 18 : 0;
        var barAreaH = h - lblH - valH - 8;
        var gap = Math.max(2, Math.min(8, (w / n) * 0.2));
        var barW = (w - gap * (n + 1)) / n;

        for (var vi = 0; vi < n; vi++) {
          var bh = (Math.abs(values[vi]) / maxVal) * barAreaH * p;
          var bx = gap + vi * (barW + gap);
          var barY = valH + barAreaH - bh;
          var vc = palette[vi % palette.length];

          var vbar = svgEl('rect');
          setAttrs(vbar, {
            x: bx,
            y: barY,
            width: Math.max(0, barW),
            height: Math.max(0, bh),
            rx: Math.min(barRadius, barW / 2),
            ry: Math.min(barRadius, barW / 2),
            fill: vc,
          });
          svg.appendChild(vbar);

          var vlbl = svgEl('text');
          setAttrs(vlbl, {
            x: bx + barW / 2,
            y: h - 4,
            'text-anchor': 'middle',
            fill: textColor,
            'font-size': '11',
            'font-family': "'Gothic A1', system-ui, sans-serif",
          });
          vlbl.textContent = labels[vi] || '';
          svg.appendChild(vlbl);

          if (showValues && p > 0.5) {
            var vvt = svgEl('text');
            setAttrs(vvt, {
              x: bx + barW / 2,
              y: barY - 4,
              'text-anchor': 'middle',
              fill: textColor,
              'font-size': '11',
              'font-family': "'IBM Plex Mono', monospace",
              opacity: Math.min(1, (p - 0.5) * 2),
            });
            vvt.textContent = values[vi];
            svg.appendChild(vvt);
          }
        }
      }
    }

    function doAnimate() {
      if (cancelAnim) cancelAnim();
      if (animDuration > 0) {
        cancelAnim = animateProgress(animDuration, function (p) {
          progress = p;
          render(p);
        });
      } else {
        progress = 1;
        render(1);
      }
    }

    var ro = watchResize(el, function () {
      render(progress);
    });
    doAnimate();

    return {
      update: function (newOpts) {
        if (newOpts.labels) labels = newOpts.labels;
        if (newOpts.values) values = newOpts.values;
        if (newOpts.colors) colors = newOpts.colors;
        doAnimate();
      },
      dispose: function () {
        if (cancelAnim) cancelAnim();
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
        el.classList.remove('p-chart', 'p-chart-bar');
      },
    };
  }

  // ==================== LINE CHART ====================

  function lineChartComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var labels = opts.labels || [];
    var values = opts.values || [];
    var datasets = opts.datasets || null;
    var showDots = opts.dots !== false;
    var showGrid = opts.grid !== false;
    var smooth = opts.smooth !== false;
    var animDuration = opts.animate !== false ? 600 : 0;
    var strokeWidth = opts.strokeWidth || 2;
    var dotRadius = opts.dotRadius || 3;
    var color = opts.color || null;

    // Normalize single values array to datasets format
    if (!datasets && values.length > 0) {
      datasets = [{ values: values, color: color }];
    }
    if (!datasets) datasets = [];

    el.classList.add('p-chart', 'p-chart-line');
    var svg = createChartSVG(el);

    var cancelAnim = null;
    var progress = 1;

    function render(p) {
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      if (w === 0 || h === 0) return;

      clearSVG(svg);
      setAttrs(svg, { viewBox: '0 0 ' + w + ' ' + h });

      var palette = getThemeColors();
      var textColor = getTextColor();
      var borderColor = getBorderColor();

      var padL = 8,
        padR = 8,
        padT = 12;
      var padB = labels.length > 0 ? 24 : 8;
      var chartW = w - padL - padR;
      var chartH = h - padT - padB;

      // Find global min/max
      var gMin = Infinity,
        gMax = -Infinity;
      for (var di = 0; di < datasets.length; di++) {
        var dv = datasets[di].values || [];
        for (var vi = 0; vi < dv.length; vi++) {
          if (dv[vi] < gMin) gMin = dv[vi];
          if (dv[vi] > gMax) gMax = dv[vi];
        }
      }
      var range = gMax - gMin || 1;
      gMin -= range * 0.05;
      gMax += range * 0.05;
      range = gMax - gMin;

      // Grid lines
      if (showGrid) {
        for (var gi = 0; gi <= 4; gi++) {
          var gy = padT + (gi / 4) * chartH;
          var gl = svgEl('line');
          setAttrs(gl, {
            x1: padL,
            y1: gy,
            x2: w - padR,
            y2: gy,
            stroke: borderColor,
            'stroke-width': '1',
            'stroke-dasharray': '4 4',
          });
          svg.appendChild(gl);
        }
      }

      // X-axis labels
      if (labels.length > 0) {
        var maxLbls = Math.min(labels.length, Math.floor(chartW / 40));
        var lblStep = Math.max(1, Math.ceil(labels.length / maxLbls));
        for (var li = 0; li < labels.length; li += lblStep) {
          var lx = padL + (labels.length > 1 ? (li / (labels.length - 1)) * chartW : chartW / 2);
          var lt = svgEl('text');
          setAttrs(lt, {
            x: lx,
            y: h - 4,
            'text-anchor': 'middle',
            fill: textColor,
            'font-size': '10',
            'font-family': "'Gothic A1', system-ui, sans-serif",
          });
          lt.textContent = labels[li];
          svg.appendChild(lt);
        }
      }

      // Draw each dataset
      var bgColor = getBgColor();
      for (var dsi = 0; dsi < datasets.length; dsi++) {
        var ds = datasets[dsi];
        var dsv = ds.values || [];
        var dsColor = ds.color || palette[dsi % palette.length];
        var n = dsv.length;
        if (n === 0) continue;

        var visibleN = Math.max(2, Math.ceil(n * p));
        var pts = [];
        for (var pi = 0; pi < visibleN && pi < n; pi++) {
          var px = padL + (n > 1 ? (pi / (n - 1)) * chartW : chartW / 2);
          var py = padT + chartH - ((dsv[pi] - gMin) / range) * chartH;
          pts.push([px, py]);
        }

        var d = smooth ? smoothPath(pts) : polylinePath(pts);
        var path = svgEl('path');
        setAttrs(path, {
          d: d,
          stroke: dsColor,
          'stroke-width': strokeWidth,
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        svg.appendChild(path);

        if (showDots) {
          for (var doti = 0; doti < pts.length; doti++) {
            var dot = svgEl('circle');
            setAttrs(dot, {
              cx: pts[doti][0],
              cy: pts[doti][1],
              r: dotRadius,
              fill: dsColor,
              stroke: bgColor,
              'stroke-width': '1.5',
            });
            svg.appendChild(dot);
          }
        }
      }
    }

    function doAnimate() {
      if (cancelAnim) cancelAnim();
      if (animDuration > 0) {
        cancelAnim = animateProgress(animDuration, function (p) {
          progress = p;
          render(p);
        });
      } else {
        progress = 1;
        render(1);
      }
    }

    var ro = watchResize(el, function () {
      render(progress);
    });
    doAnimate();

    return {
      update: function (newOpts) {
        if (newOpts.labels) labels = newOpts.labels;
        if (newOpts.values) {
          values = newOpts.values;
          datasets = [{ values: values, color: color }];
        }
        if (newOpts.datasets) datasets = newOpts.datasets;
        if (newOpts.color !== undefined) color = newOpts.color;
        doAnimate();
      },
      dispose: function () {
        if (cancelAnim) cancelAnim();
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
        el.classList.remove('p-chart', 'p-chart-line');
      },
    };
  }

  // ==================== GAUGE ====================

  function gaugeComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var value = opts.value || 0;
    var min = typeof opts.min === 'number' ? opts.min : 0;
    var max = typeof opts.max === 'number' ? opts.max : 100;
    var color = opts.color || null;
    var label = opts.label || '';
    var showValue = opts.showValue !== false;
    var animDuration = opts.animate !== false ? 800 : 0;
    var thickness = opts.thickness || 12;

    el.classList.add('p-chart', 'p-chart-gauge');
    var svg = createChartSVG(el);

    var cancelAnim = null;
    var currentVal = 0;

    function describeArc(cx, cy, r, startDeg, endDeg) {
      var sRad = ((startDeg - 90) * Math.PI) / 180;
      var eRad = ((endDeg - 90) * Math.PI) / 180;
      var x1 = cx + r * Math.cos(sRad);
      var y1 = cy + r * Math.sin(sRad);
      var x2 = cx + r * Math.cos(eRad);
      var y2 = cy + r * Math.sin(eRad);
      var large = endDeg - startDeg > 180 ? 1 : 0;
      return 'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2;
    }

    function render(animVal) {
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      if (w === 0 || h === 0) return;

      clearSVG(svg);
      var size = Math.min(w, h);
      setAttrs(svg, { viewBox: '0 0 ' + w + ' ' + h });

      var c = color || getPrimaryColor();
      var textColor = getTextColor();
      var borderColor = getBorderColor();

      var cx = w / 2;
      var cy = h * 0.55;
      var r = size * 0.38;
      var startA = -120;
      var endA = 120;
      var totalA = endA - startA;

      // Background arc
      var bgArc = svgEl('path');
      setAttrs(bgArc, {
        d: describeArc(cx, cy, r, startA, endA),
        stroke: borderColor,
        'stroke-width': thickness,
        fill: 'none',
        'stroke-linecap': 'round',
      });
      svg.appendChild(bgArc);

      // Value arc
      var pct = H.clamp((animVal - min) / (max - min || 1), 0, 1);
      if (pct > 0.002) {
        var valA = startA + pct * totalA;
        var valArc = svgEl('path');
        setAttrs(valArc, {
          d: describeArc(cx, cy, r, startA, valA),
          stroke: c,
          'stroke-width': thickness,
          fill: 'none',
          'stroke-linecap': 'round',
        });
        svg.appendChild(valArc);
      }

      // Center value
      if (showValue) {
        var vt = svgEl('text');
        setAttrs(vt, {
          x: cx,
          y: cy,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: c,
          'font-size': size * 0.18,
          'font-family': "'IBM Plex Mono', monospace",
          'font-weight': '600',
        });
        vt.textContent = Math.round(animVal);
        svg.appendChild(vt);
      }

      // Label
      if (label) {
        var lt = svgEl('text');
        setAttrs(lt, {
          x: cx,
          y: cy + size * 0.14,
          'text-anchor': 'middle',
          fill: textColor,
          'font-size': '11',
          'font-family': "'Gothic A1', system-ui, sans-serif",
        });
        lt.textContent = label;
        svg.appendChild(lt);
      }

      // Min / max
      var sRad = ((startA - 90) * Math.PI) / 180;
      var eRad = ((endA - 90) * Math.PI) / 180;
      var mt = svgEl('text');
      setAttrs(mt, {
        x: cx + (r + thickness) * Math.cos(sRad),
        y: cy + (r + thickness) * Math.sin(sRad) + 12,
        'text-anchor': 'middle',
        fill: textColor,
        'font-size': '9',
        'font-family': "'IBM Plex Mono', monospace",
      });
      mt.textContent = min;
      svg.appendChild(mt);

      var mxt = svgEl('text');
      setAttrs(mxt, {
        x: cx + (r + thickness) * Math.cos(eRad),
        y: cy + (r + thickness) * Math.sin(eRad) + 12,
        'text-anchor': 'middle',
        fill: textColor,
        'font-size': '9',
        'font-family': "'IBM Plex Mono', monospace",
      });
      mxt.textContent = max;
      svg.appendChild(mxt);
    }

    function doAnimate(target) {
      if (cancelAnim) cancelAnim();
      var from = currentVal;
      if (animDuration > 0) {
        cancelAnim = animateProgress(animDuration, function (p) {
          currentVal = lerp(from, target, p);
          render(currentVal);
        });
      } else {
        currentVal = target;
        render(currentVal);
      }
    }

    var ro = watchResize(el, function () {
      render(currentVal);
    });
    doAnimate(value);

    return {
      update: function (newOpts) {
        if (typeof newOpts.value === 'number') value = newOpts.value;
        if (typeof newOpts.min === 'number') min = newOpts.min;
        if (typeof newOpts.max === 'number') max = newOpts.max;
        if (newOpts.color !== undefined) color = newOpts.color;
        if (newOpts.label !== undefined) label = newOpts.label;
        doAnimate(value);
      },
      dispose: function () {
        if (cancelAnim) cancelAnim();
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
        el.classList.remove('p-chart', 'p-chart-gauge');
      },
    };
  }

  // ==================== PIE CHART ====================

  function pieChartComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var segments = opts.segments || [];
    var donut = opts.donut || false;
    var showLabels = opts.labels !== false;
    var animDuration = opts.animate !== false ? 700 : 0;
    var colors = opts.colors || null;

    el.classList.add('p-chart', 'p-chart-pie');
    var svg = createChartSVG(el);

    var cancelAnim = null;
    var progress = 1;

    function render(p) {
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      if (w === 0 || h === 0 || segments.length === 0) return;

      clearSVG(svg);
      setAttrs(svg, { viewBox: '0 0 ' + w + ' ' + h });

      var palette = colors || getThemeColors();
      var textColor = getTextColor();

      var total = 0;
      for (var si = 0; si < segments.length; si++) {
        total += Math.abs(segments[si].value || 0);
      }
      if (total === 0) return;

      var cx = w / 2;
      var cy = showLabels ? h * 0.44 : h / 2;
      var size = Math.min(w, showLabels ? h * 0.78 : h);
      var outerR = size * 0.4;
      var innerR = donut ? outerR * 0.55 : 0;

      var curAngle = -90;
      var maxAngle = -90 + 360 * p;

      for (var pi = 0; pi < segments.length; pi++) {
        var seg = segments[pi];
        var segAngle = (Math.abs(seg.value) / total) * 360;
        var endAngle = Math.min(curAngle + segAngle, maxAngle);
        if (curAngle >= maxAngle) break;

        var actual = endAngle - curAngle;
        if (actual < 0.1) {
          curAngle = endAngle;
          continue;
        }

        var c = seg.color || palette[pi % palette.length];
        var sRad = (curAngle * Math.PI) / 180;
        var eRad = (endAngle * Math.PI) / 180;
        var ox1 = cx + outerR * Math.cos(sRad);
        var oy1 = cy + outerR * Math.sin(sRad);
        var ox2 = cx + outerR * Math.cos(eRad);
        var oy2 = cy + outerR * Math.sin(eRad);
        var large = actual > 180 ? 1 : 0;

        var d;
        if (innerR > 0) {
          var ix1 = cx + innerR * Math.cos(sRad);
          var iy1 = cy + innerR * Math.sin(sRad);
          var ix2 = cx + innerR * Math.cos(eRad);
          var iy2 = cy + innerR * Math.sin(eRad);
          d =
            'M ' +
            ox1 +
            ' ' +
            oy1 +
            ' A ' +
            outerR +
            ' ' +
            outerR +
            ' 0 ' +
            large +
            ' 1 ' +
            ox2 +
            ' ' +
            oy2 +
            ' L ' +
            ix2 +
            ' ' +
            iy2 +
            ' A ' +
            innerR +
            ' ' +
            innerR +
            ' 0 ' +
            large +
            ' 0 ' +
            ix1 +
            ' ' +
            iy1 +
            ' Z';
        } else {
          d =
            'M ' +
            cx +
            ' ' +
            cy +
            ' L ' +
            ox1 +
            ' ' +
            oy1 +
            ' A ' +
            outerR +
            ' ' +
            outerR +
            ' 0 ' +
            large +
            ' 1 ' +
            ox2 +
            ' ' +
            oy2 +
            ' Z';
        }

        var path = svgEl('path');
        setAttrs(path, { d: d, fill: c });
        svg.appendChild(path);

        curAngle = endAngle;
      }

      // Legend labels
      if (showLabels && p > 0.8) {
        var opac = Math.min(1, (p - 0.8) * 5);
        var lx = 8;
        var ly = cy + outerR + 20;
        for (var li = 0; li < segments.length; li++) {
          var ls = segments[li];
          var lc = ls.color || palette[li % palette.length];

          var ldot = svgEl('circle');
          setAttrs(ldot, { cx: lx + 5, cy: ly, r: 4, fill: lc, opacity: opac });
          svg.appendChild(ldot);

          var lt = svgEl('text');
          setAttrs(lt, {
            x: lx + 14,
            y: ly,
            'dominant-baseline': 'central',
            fill: textColor,
            'font-size': '10',
            'font-family': "'Gothic A1', system-ui, sans-serif",
            opacity: opac,
          });
          var pctText = Math.round((ls.value / total) * 100) + '%';
          lt.textContent = (ls.label || '') + ' (' + pctText + ')';
          svg.appendChild(lt);

          lx += lt.textContent.length * 6 + 24;
          if (lx > w - 40) {
            lx = 8;
            ly += 16;
          }
        }
      }
    }

    function doAnimate() {
      if (cancelAnim) cancelAnim();
      if (animDuration > 0) {
        cancelAnim = animateProgress(animDuration, function (p) {
          progress = p;
          render(p);
        });
      } else {
        progress = 1;
        render(1);
      }
    }

    var ro = watchResize(el, function () {
      render(progress);
    });
    doAnimate();

    return {
      update: function (newOpts) {
        if (newOpts.segments) segments = newOpts.segments;
        if (newOpts.colors) colors = newOpts.colors;
        doAnimate();
      },
      dispose: function () {
        if (cancelAnim) cancelAnim();
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
        el.classList.remove('p-chart', 'p-chart-pie');
      },
    };
  }

  // ==================== PROGRESS RING ====================

  function progressRingComponent(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var value = opts.value || 0;
    var max = opts.max || 100;
    var color = opts.color || null;
    var showValue = opts.showValue !== false;
    var animDuration = opts.animate !== false ? 700 : 0;
    var thickness = opts.thickness || 8;
    var label = opts.label || '';

    el.classList.add('p-chart', 'p-chart-progress-ring');
    var svg = createChartSVG(el);

    var cancelAnim = null;
    var currentVal = 0;

    function render(animVal) {
      var rect = el.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;
      if (w === 0 || h === 0) return;

      clearSVG(svg);
      var size = Math.min(w, h);
      setAttrs(svg, { viewBox: '0 0 ' + w + ' ' + h });

      var c = color || getPrimaryColor();
      var borderColor = getBorderColor();
      var textColor = getTextColor();

      var cx = w / 2;
      var cy = h / 2;
      var r = (size - thickness - 4) / 2;

      // Background ring
      var bgRing = svgEl('circle');
      setAttrs(bgRing, {
        cx: cx,
        cy: cy,
        r: r,
        stroke: borderColor,
        'stroke-width': thickness,
        fill: 'none',
      });
      svg.appendChild(bgRing);

      // Progress arc via stroke-dashoffset
      var pct = H.clamp(animVal / (max || 1), 0, 1);
      if (pct > 0.002) {
        var circ = 2 * Math.PI * r;
        var ring = svgEl('circle');
        setAttrs(ring, {
          cx: cx,
          cy: cy,
          r: r,
          stroke: c,
          'stroke-width': thickness,
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-dasharray': circ,
          'stroke-dashoffset': circ * (1 - pct),
          transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
        });
        svg.appendChild(ring);
      }

      // Center value
      if (showValue) {
        var vt = svgEl('text');
        setAttrs(vt, {
          x: cx,
          y: label ? cy - 4 : cy,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: c,
          'font-size': size * 0.2,
          'font-family': "'IBM Plex Mono', monospace",
          'font-weight': '600',
        });
        vt.textContent = Math.round(pct * 100) + '%';
        svg.appendChild(vt);
      }

      // Label
      if (label) {
        var lt = svgEl('text');
        setAttrs(lt, {
          x: cx,
          y: cy + size * 0.1,
          'text-anchor': 'middle',
          fill: textColor,
          'font-size': '10',
          'font-family': "'Gothic A1', system-ui, sans-serif",
        });
        lt.textContent = label;
        svg.appendChild(lt);
      }
    }

    function doAnimate(target) {
      if (cancelAnim) cancelAnim();
      var from = currentVal;
      if (animDuration > 0) {
        cancelAnim = animateProgress(animDuration, function (p) {
          currentVal = lerp(from, target, p);
          render(currentVal);
        });
      } else {
        currentVal = target;
        render(currentVal);
      }
    }

    var ro = watchResize(el, function () {
      render(currentVal);
    });
    doAnimate(value);

    return {
      update: function (newOpts) {
        if (typeof newOpts.value === 'number') value = newOpts.value;
        if (typeof newOpts.max === 'number') max = newOpts.max;
        if (newOpts.color !== undefined) color = newOpts.color;
        if (newOpts.label !== undefined) label = newOpts.label;
        doAnimate(value);
      },
      dispose: function () {
        if (cancelAnim) cancelAnim();
        if (ro) {
          ro.disconnect();
          ro = null;
        }
        el.innerHTML = '';
        el.classList.remove('p-chart', 'p-chart-progress-ring');
      },
    };
  }

  // ==================== INIT ====================

  function attach() {
    if (!window.prvctice || !window.prvctice.ui) {
      setTimeout(attach, 10);
      return;
    }
    window.prvctice.ui.sparkline = sparklineComponent;
    window.prvctice.ui.barChart = barChartComponent;
    window.prvctice.ui.lineChart = lineChartComponent;
    window.prvctice.ui.gauge = gaugeComponent;
    window.prvctice.ui.pieChart = pieChartComponent;
    window.prvctice.ui.progressRing = progressRingComponent;
  }

  attach();
})();
