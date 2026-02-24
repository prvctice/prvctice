/**
 * Sketch Pad HTML Build
 *
 * Canvas drawing tool with: smooth quadratic bezier brush engine,
 * 5 tools (brush, eraser, fill, line, eyedropper), opacity control,
 * curated 12-color palette with custom picker, dynamic brush cursor,
 * keyboard shortcuts, auto-save, and PNG export to Files panel.
 * Loaded lazily by the sketch-pad config via dynamic import.
 */

export const SKETCH_PAD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Main Layout ── */
.sp-wrap {
  display: flex; flex-direction: column; height: 100%;
  font-family: var(--p-font-mono); color: var(--p-text);
}

/* ── Tools Row ── */
.sp-toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; flex-shrink: 0;
  border-bottom: 1px solid var(--p-border);
}
.sp-tools { display: flex; gap: 2px; }
.sp-tool {
  all: unset; cursor: pointer;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--p-radius-sm);
  color: var(--p-text-muted);
  transition: all 120ms ease;
}
.sp-tool:hover { background: rgba(255,255,255,0.06); color: var(--p-text); }
.sp-tool.active {
  background: rgba(68,136,255,0.10); color: var(--p-accent-blue);
  box-shadow: 0 0 8px rgba(68,136,255,0.12);
}
.sp-tool svg { display: block; }

.sp-sep { width: 1px; height: 20px; background: var(--p-border); flex-shrink: 0; }

/* ── Color Dot ── */
.sp-color-dot {
  width: 18px; height: 18px;
  border-radius: var(--p-radius-sm);
  border: 1.5px solid var(--p-border);
  flex-shrink: 0; transition: background 120ms ease;
}

/* ── Swatches ── */
.sp-swatches { display: flex; gap: 3px; flex-wrap: wrap; align-items: center; }
.sp-swatch {
  all: unset; cursor: pointer;
  width: 16px; height: 16px;
  border-radius: 3px;
  border: 1.5px solid transparent;
  transition: transform 100ms ease, border-color 100ms ease;
  flex-shrink: 0;
}
.sp-swatch:hover { transform: scale(1.2); }
.sp-swatch.active { border-color: var(--p-text); }

.sp-custom-color {
  width: 16px; height: 16px; padding: 0;
  border: 1.5px dashed rgba(255,255,255,0.2);
  border-radius: 3px; background: transparent;
  cursor: pointer; flex-shrink: 0;
  -webkit-appearance: none; appearance: none;
}
.sp-custom-color::-webkit-color-swatch-wrapper { padding: 0; }
.sp-custom-color::-webkit-color-swatch { border: none; border-radius: 2px; }
.sp-custom-color::-moz-color-swatch { border: none; border-radius: 2px; }

/* ── Controls Row ── */
.sp-controls {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; flex-shrink: 0;
  border-bottom: 1px solid var(--p-border);
}
.sp-ctrl-lbl {
  font-size: 9px; font-family: var(--p-font-mono);
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--p-text-muted);
}
.sp-val {
  font-family: var(--p-font-mono); font-size: 10px;
  color: var(--p-text-muted); min-width: 18px; text-align: right;
}

/* ── Canvas Area ── */
.sp-canvas-wrap {
  flex: 1; min-height: 0; position: relative;
  margin: 6px 10px;
  border-radius: var(--p-radius-md);
  border: 1px solid var(--p-border);
  overflow: hidden;
}
.sp-canvas-wrap canvas { display: block; width: 100%; height: 100%; }

/* ── Brush Cursor ── */
.sp-cursor {
  position: absolute; pointer-events: none;
  border: 1.5px solid rgba(255,255,255,0.5);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  mix-blend-mode: difference;
  display: none; z-index: 2;
}

/* ── Bottom Bar ── */
.sp-bottom {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; flex-shrink: 0;
}
.sp-bottom-info {
  font-size: 9px; font-family: var(--p-font-mono);
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--p-text-muted); opacity: 0.5;
}
</style>
</head>
<body style="margin:0;overflow:hidden">
  <div class="sp-wrap">

    <div class="p-terminal-header" style="padding:5px 10px;flex-shrink:0">
      <span class="p-label-tech">SKETCH PAD</span>
      <span class="p-label-tech" style="color:var(--p-text-muted)" id="statusLabel">READY</span>
    </div>

    <div class="sp-toolbar">
      <div class="sp-tools" id="toolBar"></div>
      <div class="sp-sep"></div>
      <div class="sp-color-dot" id="colorDot"></div>
      <div class="sp-swatches" id="swatches"></div>
    </div>

    <div class="sp-controls">
      <span class="sp-ctrl-lbl">SIZE</span>
      <input type="range" class="p-slider" id="sizeSlider" min="1" max="48" value="6" style="width:60px">
      <span class="sp-val" id="sizeVal">6</span>
      <span class="sp-ctrl-lbl" style="margin-left:6px">OPACITY</span>
      <input type="range" class="p-slider" id="opaSlider" min="5" max="100" value="100" style="width:60px">
      <span class="sp-val" id="opaVal">100</span>
      <div style="flex:1"></div>
      <button class="p-btn p-btn-ghost p-btn-sm" id="undoBtn" style="font-size:10px;padding:2px 8px">UNDO</button>
      <button class="p-btn p-btn-ghost p-btn-sm" id="clearBtn" style="font-size:10px;padding:2px 8px">CLEAR</button>
    </div>

    <div class="sp-canvas-wrap" id="canvasWrap">
      <canvas id="drawCanvas"></canvas>
      <div class="sp-cursor" id="brushCursor"></div>
    </div>

    <div class="sp-bottom">
      <button class="p-btn p-btn-ghost p-btn-sm" id="saveBtn" style="font-size:10px;padding:2px 10px">SAVE</button>
      <button class="p-btn p-btn-primary p-btn-sm" id="exportBtn" style="font-size:10px;padding:2px 10px">EXPORT PNG</button>
      <div style="flex:1"></div>
      <span class="sp-bottom-info" id="footerInfo">BRUSH \u00b7 6px</span>
      <span class="sp-bottom-info" style="margin-left:8px;opacity:0.35" id="footerDim"></span>
    </div>

  </div>

<script>
prvctice.onReady(function() {

  /* ── Constants ── */
  var COLORS = [
    '#f0f0f0', '#a0a0a0', '#585858', '#1e1e1e',
    '#ff4444', '#ff8833', '#ffcc33',
    '#33cc77', '#3399ee', '#6655ee',
    '#cc44ff', '#ff4488'
  ];
  var TOOLS = [
    { id: 'brush',  key: 'b', title: 'Brush (B)' },
    { id: 'eraser', key: 'e', title: 'Eraser (E)' },
    { id: 'fill',   key: 'f', title: 'Fill (F)' },
    { id: 'line',   key: 'l', title: 'Line (L)' },
    { id: 'pick',   key: 'i', title: 'Pick Color (I)' }
  ];
  var TOOL_SVGS = {
    brush:  '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4" fill="currentColor"/></svg>',
    eraser: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="4" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="0.8" opacity="0.5"/></svg>',
    fill:   '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2L12 7 7 12 2 7z" fill="currentColor"/></svg>',
    line:   '<svg width="14" height="14" viewBox="0 0 14 14"><line x1="3" y1="11" x2="11" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    pick:   '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="7" cy="7" r="0.8" fill="currentColor"/></svg>'
  };
  var BG = '#181820';
  var MAX_UNDO = 30;

  /* ── State ── */
  var tool = 'brush';
  var color = COLORS[0];
  var size = 6;
  var opa = 100;
  var drawing = false;
  var pts = [];
  var undoStack = [];
  var lineStart = null;
  var lineSnap = null;
  var saveTimer = null;

  /* ── DOM ── */
  var cvs = document.getElementById('drawCanvas');
  var ctx = cvs.getContext('2d');
  var wrap = document.getElementById('canvasWrap');
  var cur = document.getElementById('brushCursor');
  var elStatus = document.getElementById('statusLabel');
  var elSizeVal = document.getElementById('sizeVal');
  var elOpaVal = document.getElementById('opaVal');
  var elInfo = document.getElementById('footerInfo');
  var elDim = document.getElementById('footerDim');
  var elDot = document.getElementById('colorDot');
  var elSwatches = document.getElementById('swatches');
  var elTools = document.getElementById('toolBar');

  /* ── Canvas ── */
  function doResize() {
    var r = wrap.getBoundingClientRect();
    var w = Math.floor(r.width);
    var h = Math.floor(r.height);
    if (w < 10 || h < 10) return;
    var old = (cvs.width > 0 && cvs.height > 0)
      ? ctx.getImageData(0, 0, cvs.width, cvs.height) : null;
    cvs.width = w;
    cvs.height = h;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    if (old && old.width > 0) ctx.putImageData(old, 0, 0);
    elDim.textContent = w + ' \\u00d7 ' + h;
  }

  function doClear() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cvs.width, cvs.height);
  }

  /* ── History ── */
  function pushUndo() {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(ctx.getImageData(0, 0, cvs.width, cvs.height));
  }

  function undo() {
    if (!undoStack.length) {
      prvctice.ui.toast({ message: 'Nothing to undo', type: 'info', duration: 900 });
      return;
    }
    ctx.putImageData(undoStack.pop(), 0, 0);
    flash('UNDO');
  }

  /* ── Utility ── */
  function flash(t) {
    elStatus.textContent = t;
    elStatus.style.color = 'var(--p-accent-blue)';
    setTimeout(function() {
      elStatus.textContent = 'READY';
      elStatus.style.color = 'var(--p-text-muted)';
    }, 700);
  }

  function getPos(e) {
    var r = cvs.getBoundingClientRect();
    var sx = cvs.width / r.width;
    var sy = cvs.height / r.height;
    var s = e.touches ? e.touches[0] : e;
    return { x: (s.clientX - r.left) * sx, y: (s.clientY - r.top) * sy };
  }

  function hex2rgb(h) {
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16)
    };
  }

  function rgb2hex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function strokeColor() { return tool === 'eraser' ? BG : color; }
  function strokeWidth() { return tool === 'eraser' ? size * 2 : size; }

  /* ── Drawing Engine ── */
  function drawDot(x, y) {
    ctx.globalAlpha = opa / 100;
    ctx.beginPath();
    ctx.arc(x, y, strokeWidth() / 2, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawSmooth() {
    var n = pts.length;
    if (n < 2) return;
    ctx.globalAlpha = opa / 100;
    ctx.strokeStyle = strokeColor();
    ctx.lineWidth = strokeWidth();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (n === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
    } else {
      var a = pts[n - 3], b = pts[n - 2], c = pts[n - 1];
      ctx.beginPath();
      ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function floodFill(sx, sy, fr, fg, fb) {
    sx = Math.round(sx);
    sy = Math.round(sy);
    var W = cvs.width, H = cvs.height;
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return;
    var img = ctx.getImageData(0, 0, W, H);
    var d = img.data;
    var i0 = (sy * W + sx) * 4;
    var tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
    if (tr === fr && tg === fg && tb === fb) return;
    var stack = [[sx, sy]];
    var vis = new Uint8Array(W * H);
    while (stack.length) {
      var p = stack.pop();
      var x = p[0], y = p[1];
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      var vi = y * W + x;
      if (vis[vi]) continue;
      var ii = vi * 4;
      if (Math.abs(d[ii] - tr) > 32 ||
          Math.abs(d[ii + 1] - tg) > 32 ||
          Math.abs(d[ii + 2] - tb) > 32) continue;
      vis[vi] = 1;
      d[ii] = fr; d[ii + 1] = fg; d[ii + 2] = fb; d[ii + 3] = 255;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ── Pointer Events ── */
  function onDown(e) {
    e.preventDefault();
    var p = getPos(e);

    if (tool === 'pick') {
      var px = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
      setColor(rgb2hex(px[0], px[1], px[2]));
      setTool('brush');
      flash('PICKED');
      return;
    }

    if (tool === 'fill') {
      pushUndo();
      var rgb = hex2rgb(color);
      floodFill(p.x, p.y, rgb.r, rgb.g, rgb.b);
      return;
    }

    if (tool === 'line') {
      pushUndo();
      lineStart = p;
      lineSnap = ctx.getImageData(0, 0, cvs.width, cvs.height);
      return;
    }

    drawing = true;
    pushUndo();
    pts = [p];
    drawDot(p.x, p.y);
  }

  function onMove(e) {
    e.preventDefault();
    var p = getPos(e);
    elDim.textContent = Math.round(p.x) + ', ' + Math.round(p.y);
    showCursor(e);

    if (tool === 'line' && lineStart && lineSnap) {
      ctx.putImageData(lineSnap, 0, 0);
      ctx.globalAlpha = opa / 100;
      ctx.beginPath();
      ctx.moveTo(lineStart.x, lineStart.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    if (!drawing) return;
    pts.push(p);
    drawSmooth();
  }

  function onUp() {
    if (tool === 'line' && lineStart) {
      lineStart = null;
      lineSnap = null;
      return;
    }
    drawing = false;
    pts = [];
  }

  /* ── Cursor ── */
  function showCursor(e) {
    if (tool !== 'brush' && tool !== 'eraser') {
      cvs.style.cursor = 'crosshair';
      cur.style.display = 'none';
      return;
    }
    var r = wrap.getBoundingClientRect();
    var s = e.touches ? e.touches[0] : e;
    var cx = s.clientX - r.left;
    var cy = s.clientY - r.top;
    var ds = strokeWidth() * (r.width / cvs.width);

    cur.style.display = 'block';
    cur.style.width = ds + 'px';
    cur.style.height = ds + 'px';
    cur.style.left = cx + 'px';
    cur.style.top = cy + 'px';
    cvs.style.cursor = 'none';
  }

  /* ── UI State ── */
  function setTool(t) {
    tool = t;
    var btns = elTools.querySelectorAll('.sp-tool');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tool === t) btns[i].classList.add('active');
      else btns[i].classList.remove('active');
    }
    cur.style.display = 'none';
    cvs.style.cursor = 'crosshair';
    updateInfo();
  }

  function setColor(c) {
    color = c;
    elDot.style.background = c;
    var sw = elSwatches.querySelectorAll('.sp-swatch');
    for (var i = 0; i < sw.length; i++) {
      if (sw[i].dataset.color === c) sw[i].classList.add('active');
      else sw[i].classList.remove('active');
    }
    updateInfo();
  }

  function updateInfo() {
    var txt = tool.toUpperCase() + ' \\u00b7 ' + size + 'px';
    if (opa < 100) txt += ' \\u00b7 ' + opa + '%';
    elInfo.textContent = txt;
  }

  /* ── Build UI ── */
  function buildTools() {
    TOOLS.forEach(function(t) {
      var btn = document.createElement('button');
      btn.className = 'sp-tool' + (t.id === tool ? ' active' : '');
      btn.innerHTML = TOOL_SVGS[t.id];
      btn.title = t.title;
      btn.dataset.tool = t.id;
      btn.addEventListener('click', function() { setTool(t.id); });
      elTools.appendChild(btn);
    });
  }

  function buildSwatches() {
    COLORS.forEach(function(c) {
      var btn = document.createElement('button');
      btn.className = 'sp-swatch' + (c === color ? ' active' : '');
      btn.style.background = c;
      btn.title = c;
      btn.dataset.color = c;
      btn.addEventListener('click', function() {
        setColor(c);
        if (tool === 'eraser' || tool === 'pick') setTool('brush');
      });
      elSwatches.appendChild(btn);
    });

    var picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'sp-custom-color';
    picker.value = '#ffffff';
    picker.title = 'Custom color';
    picker.addEventListener('input', function() {
      setColor(this.value);
      if (tool === 'eraser' || tool === 'pick') setTool('brush');
    });
    elSwatches.appendChild(picker);
  }

  function bindEvents() {
    cvs.addEventListener('mousedown', onDown);
    cvs.addEventListener('mousemove', onMove);
    cvs.addEventListener('mouseup', onUp);
    cvs.addEventListener('mouseleave', function() {
      onUp();
      cur.style.display = 'none';
      elDim.textContent = cvs.width + ' \\u00d7 ' + cvs.height;
    });
    cvs.addEventListener('touchstart', onDown, { passive: false });
    cvs.addEventListener('touchmove', onMove, { passive: false });
    cvs.addEventListener('touchend', onUp);

    document.getElementById('sizeSlider').addEventListener('input', function() {
      size = parseInt(this.value);
      elSizeVal.textContent = size;
      updateInfo();
    });
    document.getElementById('opaSlider').addEventListener('input', function() {
      opa = parseInt(this.value);
      elOpaVal.textContent = opa;
      updateInfo();
    });

    document.getElementById('undoBtn').addEventListener('click', undo);

    document.getElementById('clearBtn').addEventListener('click', function() {
      prvctice.ui.confirm({
        title: 'Clear Canvas',
        message: 'Erase everything?',
        confirmLabel: 'CLEAR',
        cancelLabel: 'CANCEL'
      }).then(function(ok) {
        if (!ok) return;
        pushUndo();
        doClear();
        flash('CLEARED');
      }).catch(function() {});
    });

    document.getElementById('saveBtn').addEventListener('click', function() {
      try {
        var dataUrl = cvs.toDataURL('image/png');
        var base64 = dataUrl.split(',')[1];
        var name = 'sketch-' + Date.now() + '.png';
        prvctice.fs.saveBlob(base64, 'image/png', name).then(function() {
          prvctice.ui.toast({ message: 'Saved to Files', type: 'success', duration: 1500 });
          flash('SAVED');
        }).then(null, function(err) {
          prvctice.ui.toast({ message: 'Save failed: ' + (err && err.message || 'unknown'), type: 'error', duration: 3000 });
        });
      } catch (e) {
        prvctice.ui.toast({ message: 'Could not read canvas', type: 'error', duration: 2000 });
      }
    });

    document.getElementById('exportBtn').addEventListener('click', function() {
      try {
        var dataUrl = cvs.toDataURL('image/png');
        var base64 = dataUrl.split(',')[1];
        var name = 'sketch-' + Date.now() + '.png';
        prvctice.media.download(base64, name, 'image/png').then(function() {
          prvctice.ui.toast({ message: 'PNG downloaded', type: 'success', duration: 1500 });
          flash('EXPORTED');
        }).then(null, function(err) {
          prvctice.ui.toast({ message: 'Export failed: ' + (err && err.message || 'unknown'), type: 'error', duration: 3000 });
        });
      } catch (e) {
        prvctice.ui.toast({ message: 'Could not read canvas', type: 'error', duration: 2000 });
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      TOOLS.forEach(function(t) {
        if (k === t.key) { e.preventDefault(); setTool(t.id); }
      });

      if (k === '[') {
        size = Math.max(1, size - 2);
        document.getElementById('sizeSlider').value = size;
        elSizeVal.textContent = size;
        updateInfo();
      }
      if (k === ']') {
        size = Math.min(48, size + 2);
        document.getElementById('sizeSlider').value = size;
        elSizeVal.textContent = size;
        updateInfo();
      }
    });

    window.addEventListener('resize', doResize);
  }

  /* ── Init ── */
  buildTools();
  buildSwatches();
  elDot.style.background = color;
  bindEvents();

  setTimeout(function() {
    doResize();
    doClear();

    prvctice.storage.get('sp_drawing').then(function(dataUrl) {
      if (!dataUrl) return;
      var img = new Image();
      img.onload = function() {
        ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
      };
      img.src = dataUrl;
    }).catch(function() {});
  }, 60);

  saveTimer = setInterval(function() {
    prvctice.storage.set('sp_drawing', cvs.toDataURL('image/png')).catch(function() {});
  }, 30000);

  updateInfo();

  prvctice.onDispose(function() {
    if (saveTimer) clearInterval(saveTimer);
  });
});
<` + `/script>
</body>
</html>`;
