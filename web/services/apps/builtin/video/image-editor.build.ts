/**
 * Image Editor HTML Build
 *
 * Layer-based canvas editor with: left sidebar tool palette (brush, eraser,
 * select, crop, text, eyedropper, move, zoom), right properties panel,
 * configurable brush engine (size, opacity, hardness, flow, spacing),
 * up to 8 layers with visibility/opacity/blend mode, HSV color wheel,
 * keyboard shortcuts, undo/redo 20 steps, PNG/JPEG export.
 * Loaded lazily by the image-editor config via dynamic import.
 */

export const IMAGE_EDITOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Layout ── */
.ie-wrap {
  display: flex; height: 100%; font-family: var(--p-font-mono); color: var(--p-text);
}

/* ── Left Toolbar ── */
.ie-toolbar {
  width: 40px; flex-shrink: 0; background: var(--p-surface);
  border-right: 1px solid var(--p-border); display: flex;
  flex-direction: column; gap: 2px; padding: 4px;
  overflow-y: auto;
}
.ie-tool-btn {
  all: unset; cursor: pointer; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--p-radius-sm); font-size: 14px;
  color: var(--p-text-muted); transition: all 80ms ease;
}
.ie-tool-btn:hover { background: var(--p-surface-raised); color: var(--p-text); }
.ie-tool-btn.active {
  background: rgba(68,136,255,0.12); color: var(--p-accent-blue);
  box-shadow: 0 0 6px rgba(68,136,255,0.2);
}
.ie-tool-sep {
  height: 1px; background: var(--p-border); margin: 2px 4px;
}
.ie-color-swatch {
  width: 24px; height: 24px; border-radius: var(--p-radius-sm);
  border: 2px solid var(--p-border); cursor: pointer; margin: 4px auto;
}

/* ── Canvas Area ── */
.ie-canvas-area {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  background: #1a1a1a; overflow: hidden; position: relative;
}
.ie-header {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  background: var(--p-surface); border-bottom: 1px solid var(--p-border);
  flex-shrink: 0;
}
.ie-header-label {
  font-size: 9px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--p-text);
}
.ie-header-btn {
  all: unset; cursor: pointer; padding: 2px 8px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  text-transform: uppercase; color: var(--p-text-muted);
  border: 1px solid var(--p-border); border-radius: var(--p-radius-sm);
  transition: all 80ms ease;
}
.ie-header-btn:hover { color: var(--p-text); background: var(--p-surface-raised); }
.ie-header-btn.danger:hover { color: #ff4444; border-color: #ff4444; }
.ie-canvas-viewport {
  flex: 1; min-height: 0; overflow: auto; display: flex;
  align-items: center; justify-content: center; padding: 20px;
  position: relative;
}
.ie-canvas-stack {
  position: relative; background: #2a2a2a;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
  cursor: crosshair;
}
.ie-canvas-stack canvas {
  position: absolute; top: 0; left: 0;
}
.ie-status-bar {
  display: flex; align-items: center; gap: 8px; padding: 3px 8px;
  background: var(--p-surface); border-top: 1px solid var(--p-border);
  font-size: 9px; color: var(--p-text-muted); flex-shrink: 0;
}

/* ── Right Panel ── */
.ie-panel {
  width: 180px; flex-shrink: 0; background: var(--p-surface);
  border-left: 1px solid var(--p-border); display: flex;
  flex-direction: column; overflow-y: auto;
}
.ie-panel-section {
  padding: 8px; border-bottom: 1px solid var(--p-border);
}
.ie-panel-title {
  font-size: 9px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--p-text-muted); margin-bottom: 6px;
}
.ie-prop-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
}
.ie-prop-label {
  font-size: 9px; color: var(--p-text-muted); width: 50px; flex-shrink: 0;
}
.ie-prop-slider {
  flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
  background: var(--p-border); border-radius: 2px; outline: none;
}
.ie-prop-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--p-accent-blue); cursor: pointer;
}
.ie-prop-value {
  font-size: 9px; color: var(--p-text); min-width: 24px; text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Color Wheel ── */
.ie-color-wheel-wrap {
  width: 120px; height: 120px; margin: 0 auto 8px; position: relative;
}
.ie-color-wheel {
  width: 120px; height: 120px; border-radius: 50%; cursor: crosshair;
}
.ie-color-wheel-cursor {
  position: absolute; width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid #fff; box-shadow: 0 0 2px rgba(0,0,0,0.5);
  pointer-events: none; transform: translate(-50%, -50%);
}
.ie-color-lightness {
  width: 100%; height: 16px; border-radius: var(--p-radius-sm);
  cursor: crosshair; margin-bottom: 6px;
}
.ie-recent-colors {
  display: flex; gap: 3px; flex-wrap: wrap;
}
.ie-recent-swatch {
  width: 16px; height: 16px; border-radius: 3px; cursor: pointer;
  border: 1px solid var(--p-border);
}

/* ── Layers Panel ── */
.ie-layer-list {
  display: flex; flex-direction: column; gap: 2px;
}
.ie-layer-item {
  display: flex; align-items: center; gap: 4px; padding: 3px 4px;
  border-radius: var(--p-radius-sm); cursor: pointer;
  border: 1px solid transparent; transition: all 80ms ease;
}
.ie-layer-item:hover { background: var(--p-surface-raised); }
.ie-layer-item.active {
  border-color: var(--p-accent-blue);
  background: rgba(68,136,255,0.08);
}
.ie-layer-vis {
  all: unset; cursor: pointer; font-size: 10px; width: 16px;
  text-align: center; color: var(--p-text-muted);
}
.ie-layer-vis.hidden { opacity: 0.3; }
.ie-layer-name {
  font-size: 9px; color: var(--p-text); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ie-layer-opacity {
  font-size: 8px; color: var(--p-text-muted); min-width: 24px; text-align: right;
}
.ie-layer-actions {
  display: flex; gap: 3px; margin-top: 4px;
}
.ie-layer-btn {
  all: unset; cursor: pointer; padding: 2px 6px;
  font-size: 8px; font-family: var(--p-font-mono);
  color: var(--p-text-muted); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-sm); transition: all 80ms ease;
}
.ie-layer-btn:hover { color: var(--p-text); background: var(--p-surface-raised); }

/* ── Blend Mode Select ── */
.ie-blend-select {
  width: 100%; padding: 2px 4px; font-size: 9px;
  font-family: var(--p-font-mono); background: var(--p-surface);
  color: var(--p-text); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-sm); outline: none;
}

/* ── Crop Overlay ── */
.ie-crop-overlay {
  position: absolute; pointer-events: none; z-index: 10;
  border: 2px dashed var(--p-accent-blue);
  background: rgba(68,136,255,0.08);
}
.ie-crop-actions {
  position: absolute; z-index: 11; display: flex; gap: 4px;
  padding: 4px; background: var(--p-surface); border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-border); box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* ── Text Input Overlay ── */
.ie-text-input-wrap {
  position: absolute; z-index: 11; display: flex; flex-direction: column; gap: 4px;
  padding: 6px; background: var(--p-surface); border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-accent-blue); box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ie-text-input {
  width: 160px; padding: 4px 6px; font-size: 11px;
  font-family: var(--p-font-mono); background: var(--p-bg);
  color: var(--p-text); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-sm); outline: none;
}
.ie-text-input:focus { border-color: var(--p-accent-blue); }

</style>
</head>
<body>
<div class="ie-wrap">
  <!-- Left Toolbar -->
  <div class="ie-toolbar" id="toolbar"></div>

  <!-- Canvas Area -->
  <div class="ie-canvas-area">
    <div class="ie-header">
      <span class="ie-header-label">Image Editor</span>
      <button class="ie-header-btn" id="undoBtn">Undo</button>
      <button class="ie-header-btn" id="redoBtn">Redo</button>
      <span style="flex:1"></span>
      <button class="ie-header-btn" id="newBtn">New</button>
      <button class="ie-header-btn" id="importBtn">Import</button>
      <button class="ie-header-btn" id="filesBtn">Files</button>
      <button class="ie-header-btn" id="exportPngBtn">PNG</button>
      <button class="ie-header-btn" id="exportJpgBtn">JPEG</button>
    </div>
    <div class="ie-canvas-viewport" id="viewport">
      <div class="ie-canvas-stack" id="canvasStack"></div>
    </div>
    <div class="ie-status-bar">
      <span id="statusCoords">0, 0</span>
      <span id="statusSize">480 x 360</span>
      <span id="statusTool">Brush</span>
      <span style="flex:1"></span>
      <span id="statusZoom">100%</span>
    </div>
  </div>

  <!-- Right Panel -->
  <div class="ie-panel">
    <!-- Brush Properties -->
    <div class="ie-panel-section" id="brushProps">
      <div class="ie-panel-title">Brush</div>
      <div class="ie-prop-row">
        <span class="ie-prop-label">Size</span>
        <input type="range" class="ie-prop-slider" id="brushSize" min="1" max="100" value="8">
        <span class="ie-prop-value" id="brushSizeVal">8</span>
      </div>
      <div class="ie-prop-row">
        <span class="ie-prop-label">Opacity</span>
        <input type="range" class="ie-prop-slider" id="brushOpacity" min="1" max="100" value="100">
        <span class="ie-prop-value" id="brushOpacityVal">100</span>
      </div>
      <div class="ie-prop-row">
        <span class="ie-prop-label">Hard</span>
        <input type="range" class="ie-prop-slider" id="brushHardness" min="0" max="100" value="80">
        <span class="ie-prop-value" id="brushHardnessVal">80</span>
      </div>
      <div class="ie-prop-row">
        <span class="ie-prop-label">Flow</span>
        <input type="range" class="ie-prop-slider" id="brushFlow" min="1" max="100" value="100">
        <span class="ie-prop-value" id="brushFlowVal">100</span>
      </div>
      <div class="ie-prop-row">
        <span class="ie-prop-label">Space</span>
        <input type="range" class="ie-prop-slider" id="brushSpacing" min="5" max="100" value="25">
        <span class="ie-prop-value" id="brushSpacingVal">25</span>
      </div>
    </div>

    <!-- Color -->
    <div class="ie-panel-section">
      <div class="ie-panel-title">Color</div>
      <div class="ie-color-wheel-wrap">
        <canvas class="ie-color-wheel" id="colorWheel" width="120" height="120"></canvas>
        <div class="ie-color-wheel-cursor" id="wheelCursor"></div>
      </div>
      <canvas class="ie-color-lightness" id="lightnessBar" width="160" height="16"></canvas>
      <div class="ie-recent-colors" id="recentColors"></div>
    </div>

    <!-- Layers -->
    <div class="ie-panel-section">
      <div class="ie-panel-title">Layers</div>
      <div class="ie-layer-list" id="layerList"></div>
      <div class="ie-layer-actions">
        <button class="ie-layer-btn" id="addLayerBtn">+ Add</button>
        <button class="ie-layer-btn" id="delLayerBtn">Del</button>
        <button class="ie-layer-btn" id="upLayerBtn">Up</button>
        <button class="ie-layer-btn" id="downLayerBtn">Down</button>
        <button class="ie-layer-btn" id="mergeBtn">Merge</button>
      </div>
      <div style="margin-top:6px">
        <div class="ie-prop-row">
          <span class="ie-prop-label">Opacity</span>
          <input type="range" class="ie-prop-slider" id="layerOpacity" min="0" max="100" value="100">
          <span class="ie-prop-value" id="layerOpacityVal">100</span>
        </div>
        <div class="ie-prop-row">
          <span class="ie-prop-label">Blend</span>
          <select class="ie-blend-select" id="layerBlend">
            <option value="source-over">Normal</option>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="darken">Darken</option>
            <option value="lighten">Lighten</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
prvctice.onReady(function() {
  // ── Tool Definitions ──
  var TOOLS = [
    { id: 'brush', icon: 'B', key: 'b', label: 'Brush' },
    { id: 'eraser', icon: 'E', key: 'e', label: 'Eraser' },
    { id: 'move', icon: 'V', key: 'v', label: 'Move' },
    { id: 'crop', icon: 'C', key: 'c', label: 'Crop' },
    { id: 'text', icon: 'T', key: 't', label: 'Text' },
    { id: 'eyedropper', icon: 'I', key: 'i', label: 'Eyedropper' },
    { id: 'zoom', icon: 'Z', key: 'z', label: 'Zoom' }
  ];

  // ── State ──
  var canvasW = 480;
  var canvasH = 360;
  var currentTool = 'brush';
  var brushColor = '#ffffff';
  var hue = 0;
  var sat = 1;
  var lightness = 0.5;
  var brushSize = 8;
  var brushOpacity = 100;
  var brushHardness = 80;
  var brushFlow = 100;
  var brushSpacing = 25;
  var layers = [];      // { id, name, canvas, visible, opacity, blend }
  var activeLayerIdx = 0;
  var layerIdCounter = 1;
  var undoStack = [];   // Array of snapshot states
  var redoStack = [];
  var maxUndo = 20;
  var recentColorsList = [];
  var maxRecentColors = 12;
  var drawZoom = 1;
  var drawing = false;
  var lastX = 0;
  var lastY = 0;
  var moveStartX = 0;
  var moveStartY = 0;
  var moveLayerData = null;
  var cropStartX = 0;
  var cropStartY = 0;
  var cropRect = null;  // { x, y, w, h }
  var cropOverlay = null;
  var cropActions = null;
  var textInputWrap = null;

  var toolbar = document.getElementById('toolbar');
  var canvasStack = document.getElementById('canvasStack');
  var viewport = document.getElementById('viewport');
  var statusCoords = document.getElementById('statusCoords');
  var statusSize = document.getElementById('statusSize');
  var statusTool = document.getElementById('statusTool');
  var statusZoom = document.getElementById('statusZoom');

  // ── Build Toolbar ──
  function buildToolbar() {
    toolbar.innerHTML = '';
    for (var i = 0; i < TOOLS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'ie-tool-btn' + (TOOLS[i].id === currentTool ? ' active' : '');
      btn.textContent = TOOLS[i].icon;
      btn.title = TOOLS[i].label + ' (' + TOOLS[i].key.toUpperCase() + ')';
      btn.dataset.toolId = TOOLS[i].id;
      toolbar.appendChild(btn);

      if (i === 1 || i === 4 || i === 5) {
        var sep = document.createElement('div');
        sep.className = 'ie-tool-sep';
        toolbar.appendChild(sep);
      }
    }
    // Color swatch at bottom
    var swatch = document.createElement('div');
    swatch.className = 'ie-color-swatch';
    swatch.id = 'toolbarSwatch';
    swatch.style.background = brushColor;
    toolbar.appendChild(swatch);
  }

  toolbar.addEventListener('click', function(e) {
    var btn = e.target.closest('.ie-tool-btn');
    if (!btn) return;
    setTool(btn.dataset.toolId);
  });

  function setTool(toolId) {
    currentTool = toolId;
    clearCropOverlay();
    if (textInputWrap) { textInputWrap.remove(); textInputWrap = null; }
    var btns = toolbar.querySelectorAll('.ie-tool-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.toolId === currentTool);
    }
    statusTool.textContent = toolId.charAt(0).toUpperCase() + toolId.slice(1);
  }

  // ── Layer Management ──
  function createLayer(name) {
    if (layers.length >= 8) return null;
    var c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    var layer = {
      id: layerIdCounter++,
      name: name || ('Layer ' + layerIdCounter),
      canvas: c,
      visible: true,
      opacity: 100,
      blend: 'source-over'
    };
    layers.push(layer);
    return layer;
  }

  function renderLayers() {
    // Clear composite stack
    canvasStack.style.width = (canvasW * drawZoom) + 'px';
    canvasStack.style.height = (canvasH * drawZoom) + 'px';

    // Remove old canvases
    while (canvasStack.firstChild) canvasStack.removeChild(canvasStack.firstChild);

    // Create composite canvas
    var composite = document.createElement('canvas');
    composite.width = canvasW;
    composite.height = canvasH;
    composite.style.width = (canvasW * drawZoom) + 'px';
    composite.style.height = (canvasH * drawZoom) + 'px';
    composite.style.position = 'relative';
    var ctx = composite.getContext('2d');

    // Render checkerboard background for transparency
    var tileSize = 8;
    for (var ty = 0; ty < canvasH; ty += tileSize) {
      for (var tx = 0; tx < canvasW; tx += tileSize) {
        var isLight = ((tx / tileSize + ty / tileSize) % 2 === 0);
        ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
        ctx.fillRect(tx, ty, tileSize, tileSize);
      }
    }

    // Composite layers bottom to top
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer.visible) continue;
      ctx.globalCompositeOperation = layer.blend;
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    canvasStack.appendChild(composite);
  }

  function renderLayerList() {
    var list = document.getElementById('layerList');
    list.innerHTML = '';
    // Render top-to-bottom (last layer = top)
    for (var i = layers.length - 1; i >= 0; i--) {
      var layer = layers[i];
      var item = document.createElement('div');
      item.className = 'ie-layer-item' + (i === activeLayerIdx ? ' active' : '');
      item.dataset.index = String(i);

      var vis = document.createElement('button');
      vis.className = 'ie-layer-vis' + (layer.visible ? '' : ' hidden');
      vis.textContent = layer.visible ? '\\u25CF' : '\\u25CB';
      vis.dataset.index = String(i);
      vis.dataset.action = 'toggle-vis';
      item.appendChild(vis);

      var name = document.createElement('span');
      name.className = 'ie-layer-name';
      name.textContent = layer.name;
      item.appendChild(name);

      var opac = document.createElement('span');
      opac.className = 'ie-layer-opacity';
      opac.textContent = layer.opacity + '%';
      item.appendChild(opac);

      list.appendChild(item);
    }
  }

  document.getElementById('layerList').addEventListener('click', function(e) {
    var vis = e.target.closest('[data-action="toggle-vis"]');
    if (vis) {
      var idx = parseInt(vis.dataset.index, 10);
      layers[idx].visible = !layers[idx].visible;
      renderLayers();
      renderLayerList();
      return;
    }
    var item = e.target.closest('.ie-layer-item');
    if (item) {
      activeLayerIdx = parseInt(item.dataset.index, 10);
      document.getElementById('layerOpacity').value = String(layers[activeLayerIdx].opacity);
      document.getElementById('layerOpacityVal').textContent = String(layers[activeLayerIdx].opacity);
      document.getElementById('layerBlend').value = layers[activeLayerIdx].blend;
      renderLayerList();
    }
  });

  document.getElementById('addLayerBtn').addEventListener('click', function() {
    if (layers.length >= 8) return;
    saveUndo();
    createLayer();
    activeLayerIdx = layers.length - 1;
    renderLayers();
    renderLayerList();
  });

  document.getElementById('delLayerBtn').addEventListener('click', function() {
    if (layers.length <= 1) return;
    saveUndo();
    layers.splice(activeLayerIdx, 1);
    if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
    renderLayers();
    renderLayerList();
  });

  document.getElementById('upLayerBtn').addEventListener('click', function() {
    if (activeLayerIdx >= layers.length - 1) return;
    saveUndo();
    var tmp = layers[activeLayerIdx];
    layers[activeLayerIdx] = layers[activeLayerIdx + 1];
    layers[activeLayerIdx + 1] = tmp;
    activeLayerIdx++;
    renderLayers();
    renderLayerList();
  });

  document.getElementById('downLayerBtn').addEventListener('click', function() {
    if (activeLayerIdx <= 0) return;
    saveUndo();
    var tmp = layers[activeLayerIdx];
    layers[activeLayerIdx] = layers[activeLayerIdx - 1];
    layers[activeLayerIdx - 1] = tmp;
    activeLayerIdx--;
    renderLayers();
    renderLayerList();
  });

  document.getElementById('mergeBtn').addEventListener('click', function() {
    if (activeLayerIdx <= 0) return;
    saveUndo();
    var top = layers[activeLayerIdx];
    var bottom = layers[activeLayerIdx - 1];
    var ctx = bottom.canvas.getContext('2d');
    ctx.globalCompositeOperation = top.blend;
    ctx.globalAlpha = top.opacity / 100;
    ctx.drawImage(top.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    layers.splice(activeLayerIdx, 1);
    activeLayerIdx--;
    renderLayers();
    renderLayerList();
  });

  // Layer opacity/blend
  document.getElementById('layerOpacity').addEventListener('input', function() {
    var val = parseInt(this.value, 10);
    document.getElementById('layerOpacityVal').textContent = String(val);
    if (layers[activeLayerIdx]) {
      layers[activeLayerIdx].opacity = val;
      renderLayers();
      renderLayerList();
    }
  });

  document.getElementById('layerBlend').addEventListener('change', function() {
    if (layers[activeLayerIdx]) {
      layers[activeLayerIdx].blend = this.value;
      renderLayers();
    }
  });

  // ── Undo/Redo ──
  function cloneLayers() {
    var snapshot = [];
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      var c = document.createElement('canvas');
      c.width = canvasW;
      c.height = canvasH;
      c.getContext('2d').drawImage(l.canvas, 0, 0);
      snapshot.push({
        id: l.id, name: l.name, canvas: c,
        visible: l.visible, opacity: l.opacity, blend: l.blend
      });
    }
    return { layers: snapshot, activeIdx: activeLayerIdx };
  }

  function restoreSnapshot(snap) {
    layers = snap.layers;
    activeLayerIdx = Math.min(snap.activeIdx, layers.length - 1);
    renderLayers();
    renderLayerList();
  }

  function saveUndo() {
    undoStack.push(cloneLayers());
    if (undoStack.length > maxUndo) undoStack.shift();
    redoStack = [];
  }

  document.getElementById('undoBtn').addEventListener('click', doUndo);
  document.getElementById('redoBtn').addEventListener('click', doRedo);

  function doUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(cloneLayers());
    restoreSnapshot(undoStack.pop());
  }

  function doRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(cloneLayers());
    restoreSnapshot(redoStack.pop());
  }

  // ── Color Wheel ──
  var wheelCanvas = document.getElementById('colorWheel');
  var wheelCtx = wheelCanvas.getContext('2d');
  var wheelCursor = document.getElementById('wheelCursor');
  var lightnessBar = document.getElementById('lightnessBar');
  var lightnessCtx = lightnessBar.getContext('2d');

  function drawColorWheel() {
    var cx = 60, cy = 60, r = 58;
    var imgData = wheelCtx.createImageData(120, 120);
    for (var y = 0; y < 120; y++) {
      for (var x = 0; x < 120; x++) {
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) {
          var idx = (y * 120 + x) * 4;
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 0;
          imgData.data[idx + 2] = 0;
          imgData.data[idx + 3] = 0;
          continue;
        }
        var angle = Math.atan2(dy, dx);
        var h = ((angle * 180 / Math.PI) + 360) % 360;
        var s = dist / r;
        var rgb = hslToRgb(h / 360, s, lightness);
        var idx2 = (y * 120 + x) * 4;
        imgData.data[idx2] = rgb[0];
        imgData.data[idx2 + 1] = rgb[1];
        imgData.data[idx2 + 2] = rgb[2];
        imgData.data[idx2 + 3] = 255;
      }
    }
    wheelCtx.putImageData(imgData, 0, 0);
    updateWheelCursor();
  }

  function updateWheelCursor() {
    var angle = hue * Math.PI / 180;
    var r = sat * 58;
    var x = 60 + Math.cos(angle) * r;
    var y = 60 + Math.sin(angle) * r;
    wheelCursor.style.left = x + 'px';
    wheelCursor.style.top = y + 'px';
  }

  function drawLightnessBar() {
    var w = lightnessBar.width;
    var grad = lightnessCtx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'hsl(' + hue + ', ' + (sat * 100) + '%, 0%)');
    grad.addColorStop(0.5, 'hsl(' + hue + ', ' + (sat * 100) + '%, 50%)');
    grad.addColorStop(1, 'hsl(' + hue + ', ' + (sat * 100) + '%, 100%)');
    lightnessCtx.fillStyle = grad;
    lightnessCtx.fillRect(0, 0, w, 16);
  }

  function updateColor() {
    var rgb = hslToRgb(hue / 360, sat, lightness);
    brushColor = '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
    var swatch = document.getElementById('toolbarSwatch');
    if (swatch) swatch.style.background = brushColor;
    drawColorWheel();
    drawLightnessBar();
  }

  function toHex(n) {
    var h = n.toString(16);
    return h.length < 2 ? '0' + h : h;
  }

  function hslToRgb(h, s, l) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }

  var wheelDragging = false;
  wheelCanvas.addEventListener('pointerdown', function(e) {
    wheelDragging = true;
    pickWheelColor(e);
  });
  document.addEventListener('pointermove', function(e) {
    if (wheelDragging) pickWheelColor(e);
  });
  document.addEventListener('pointerup', function() {
    if (wheelDragging) { wheelDragging = false; addRecentColor(); }
  });

  function pickWheelColor(e) {
    var rect = wheelCanvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var dx = x - 60, dy = y - 60;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), 58);
    var angle = Math.atan2(dy, dx);
    hue = ((angle * 180 / Math.PI) + 360) % 360;
    sat = dist / 58;
    updateColor();
  }

  var lightnessDragging = false;
  lightnessBar.addEventListener('pointerdown', function(e) {
    lightnessDragging = true;
    pickLightness(e);
  });
  document.addEventListener('pointermove', function(e) {
    if (lightnessDragging) pickLightness(e);
  });
  document.addEventListener('pointerup', function() {
    if (lightnessDragging) { lightnessDragging = false; addRecentColor(); }
  });

  function pickLightness(e) {
    var rect = lightnessBar.getBoundingClientRect();
    var x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    lightness = x / rect.width;
    updateColor();
  }

  // ── Recent Colors ──
  function addRecentColor() {
    var idx = recentColorsList.indexOf(brushColor);
    if (idx !== -1) recentColorsList.splice(idx, 1);
    recentColorsList.unshift(brushColor);
    if (recentColorsList.length > maxRecentColors) recentColorsList.pop();
    renderRecentColors();
  }

  function renderRecentColors() {
    var container = document.getElementById('recentColors');
    container.innerHTML = '';
    for (var i = 0; i < recentColorsList.length; i++) {
      var sw = document.createElement('div');
      sw.className = 'ie-recent-swatch';
      sw.style.background = recentColorsList[i];
      sw.dataset.color = recentColorsList[i];
      container.appendChild(sw);
    }
  }

  document.getElementById('recentColors').addEventListener('click', function(e) {
    var sw = e.target.closest('.ie-recent-swatch');
    if (!sw) return;
    brushColor = sw.dataset.color;
    var swatch = document.getElementById('toolbarSwatch');
    if (swatch) swatch.style.background = brushColor;
  });

  // ── Brush Properties ──
  function bindSlider(id, valId, setter) {
    var slider = document.getElementById(id);
    var valEl = document.getElementById(valId);
    slider.addEventListener('input', function() {
      var v = parseInt(slider.value, 10);
      valEl.textContent = String(v);
      setter(v);
    });
  }

  bindSlider('brushSize', 'brushSizeVal', function(v) { brushSize = v; });
  bindSlider('brushOpacity', 'brushOpacityVal', function(v) { brushOpacity = v; });
  bindSlider('brushHardness', 'brushHardnessVal', function(v) { brushHardness = v; });
  bindSlider('brushFlow', 'brushFlowVal', function(v) { brushFlow = v; });
  bindSlider('brushSpacing', 'brushSpacingVal', function(v) { brushSpacing = v; });

  // ── Drawing ──
  function getCanvasPos(e) {
    var rect = canvasStack.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / drawZoom,
      y: (e.clientY - rect.top) / drawZoom
    };
  }

  function stampBrush(ctx, x, y, size, color, opacity, hardness, isEraser) {
    ctx.save();
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.globalAlpha = (opacity / 100) * (brushFlow / 100);

    if (hardness >= 90) {
      // Hard brush
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = isEraser ? '#000' : color;
      ctx.fill();
    } else {
      // Soft brush with radial gradient
      var r = size / 2;
      var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      var innerStop = hardness / 100;
      grad.addColorStop(0, isEraser ? 'rgba(0,0,0,1)' : color);
      grad.addColorStop(innerStop, isEraser ? 'rgba(0,0,0,1)' : color);
      grad.addColorStop(1, isEraser ? 'rgba(0,0,0,0)' : hexToRgba(color, 0));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function strokeLine(ctx, x0, y0, x1, y1, size, color, opacity, hardness, isEraser) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var spacingPx = Math.max(1, size * (brushSpacing / 100));
    var steps = Math.ceil(dist / spacingPx);
    if (steps === 0) steps = 1;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var px = x0 + dx * t;
      var py = y0 + dy * t;
      stampBrush(ctx, px, py, size, color, opacity, hardness, isEraser);
    }
  }

  canvasStack.addEventListener('pointerdown', function(e) {
    var pos = getCanvasPos(e);

    if (currentTool === 'brush' || currentTool === 'eraser') {
      if (!layers[activeLayerIdx] || !layers[activeLayerIdx].visible) return;
      saveUndo();
      drawing = true;
      lastX = pos.x;
      lastY = pos.y;
      var ctx = layers[activeLayerIdx].canvas.getContext('2d');
      stampBrush(ctx, pos.x, pos.y, brushSize, brushColor, brushOpacity, brushHardness, currentTool === 'eraser');
      renderLayers();
    } else if (currentTool === 'eyedropper') {
      // Pick color from composite
      var compositeCanvas = canvasStack.querySelector('canvas');
      if (compositeCanvas) {
        var pCtx = compositeCanvas.getContext('2d');
        var pixel = pCtx.getImageData(Math.round(pos.x), Math.round(pos.y), 1, 1).data;
        brushColor = '#' + toHex(pixel[0]) + toHex(pixel[1]) + toHex(pixel[2]);
        var swatch = document.getElementById('toolbarSwatch');
        if (swatch) swatch.style.background = brushColor;
        addRecentColor();
      }
    } else if (currentTool === 'move') {
      if (!layers[activeLayerIdx]) return;
      moveStartX = pos.x;
      moveStartY = pos.y;
      var lc = layers[activeLayerIdx].canvas;
      moveLayerData = lc.getContext('2d').getImageData(0, 0, canvasW, canvasH);
      drawing = true;
    } else if (currentTool === 'text') {
      if (!layers[activeLayerIdx] || !layers[activeLayerIdx].visible) return;
      showTextInput(pos.x, pos.y);
    } else if (currentTool === 'crop') {
      clearCropOverlay();
      cropStartX = pos.x;
      cropStartY = pos.y;
      drawing = true;
    } else if (currentTool === 'zoom') {
      // Click to zoom in, shift+click to zoom out
      if (e.shiftKey) {
        drawZoom = Math.max(0.25, drawZoom - 0.25);
      } else {
        drawZoom = Math.min(4, drawZoom + 0.25);
      }
      statusZoom.textContent = Math.round(drawZoom * 100) + '%';
      renderLayers();
    }
  });

  document.addEventListener('pointermove', function(e) {
    var pos = getCanvasPos(e);
    statusCoords.textContent = Math.round(pos.x) + ', ' + Math.round(pos.y);

    if (!drawing) return;

    if (currentTool === 'brush' || currentTool === 'eraser') {
      if (!layers[activeLayerIdx]) return;
      var ctx = layers[activeLayerIdx].canvas.getContext('2d');
      strokeLine(ctx, lastX, lastY, pos.x, pos.y, brushSize, brushColor, brushOpacity, brushHardness, currentTool === 'eraser');
      lastX = pos.x;
      lastY = pos.y;
      renderLayers();
    } else if (currentTool === 'move' && moveLayerData) {
      var dx = pos.x - moveStartX;
      var dy = pos.y - moveStartY;
      var lCtx = layers[activeLayerIdx].canvas.getContext('2d');
      lCtx.clearRect(0, 0, canvasW, canvasH);
      lCtx.putImageData(moveLayerData, Math.round(dx), Math.round(dy));
      renderLayers();
    } else if (currentTool === 'crop') {
      var cx = Math.min(cropStartX, pos.x);
      var cy = Math.min(cropStartY, pos.y);
      var cw = Math.abs(pos.x - cropStartX);
      var ch = Math.abs(pos.y - cropStartY);
      cropRect = { x: cx, y: cy, w: cw, h: ch };
      updateCropOverlay();
    }
  });

  document.addEventListener('pointerup', function() {
    if (drawing && currentTool === 'move') {
      moveLayerData = null;
    }
    if (drawing && currentTool === 'crop' && cropRect && cropRect.w > 4 && cropRect.h > 4) {
      showCropActions();
    }
    drawing = false;
  });

  // ── Scroll Wheel Zoom ──
  viewport.addEventListener('wheel', function(e) {
    e.preventDefault();
    if (e.deltaY < 0) {
      drawZoom = Math.min(4, drawZoom + 0.1);
    } else {
      drawZoom = Math.max(0.25, drawZoom - 0.1);
    }
    drawZoom = Math.round(drawZoom * 100) / 100;
    statusZoom.textContent = Math.round(drawZoom * 100) + '%';
    renderLayers();
  }, { passive: false });

  // ── Crop Helpers ──
  function updateCropOverlay() {
    if (!cropOverlay) {
      cropOverlay = document.createElement('div');
      cropOverlay.className = 'ie-crop-overlay';
      canvasStack.appendChild(cropOverlay);
    }
    cropOverlay.style.left = (cropRect.x * drawZoom) + 'px';
    cropOverlay.style.top = (cropRect.y * drawZoom) + 'px';
    cropOverlay.style.width = (cropRect.w * drawZoom) + 'px';
    cropOverlay.style.height = (cropRect.h * drawZoom) + 'px';
  }

  function showCropActions() {
    if (cropActions) cropActions.remove();
    cropActions = document.createElement('div');
    cropActions.className = 'ie-crop-actions';
    cropActions.style.left = ((cropRect.x + cropRect.w) * drawZoom + 4) + 'px';
    cropActions.style.top = (cropRect.y * drawZoom) + 'px';

    var applyBtn = document.createElement('button');
    applyBtn.className = 'ie-header-btn';
    applyBtn.textContent = 'Crop';
    applyBtn.addEventListener('click', function() { applyCrop(); });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'ie-header-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { clearCropOverlay(); });

    cropActions.appendChild(applyBtn);
    cropActions.appendChild(cancelBtn);
    canvasStack.appendChild(cropActions);
  }

  function applyCrop() {
    if (!cropRect || cropRect.w < 2 || cropRect.h < 2) return;
    saveUndo();
    var cx = Math.round(Math.max(0, cropRect.x));
    var cy = Math.round(Math.max(0, cropRect.y));
    var cw = Math.round(Math.min(cropRect.w, canvasW - cx));
    var ch = Math.round(Math.min(cropRect.h, canvasH - cy));
    if (cw < 2 || ch < 2) return;

    for (var i = 0; i < layers.length; i++) {
      var imgData = layers[i].canvas.getContext('2d').getImageData(cx, cy, cw, ch);
      layers[i].canvas.width = cw;
      layers[i].canvas.height = ch;
      layers[i].canvas.getContext('2d').putImageData(imgData, 0, 0);
    }
    canvasW = cw;
    canvasH = ch;
    statusSize.textContent = canvasW + ' x ' + canvasH;
    clearCropOverlay();
    renderLayers();
    renderLayerList();
  }

  function clearCropOverlay() {
    if (cropOverlay) { cropOverlay.remove(); cropOverlay = null; }
    if (cropActions) { cropActions.remove(); cropActions = null; }
    cropRect = null;
  }

  // ── Text Input Helper ──
  function showTextInput(tx, ty) {
    if (textInputWrap) textInputWrap.remove();
    textInputWrap = document.createElement('div');
    textInputWrap.className = 'ie-text-input-wrap';
    textInputWrap.style.left = (tx * drawZoom) + 'px';
    textInputWrap.style.top = (ty * drawZoom) + 'px';

    var input = document.createElement('input');
    input.className = 'ie-text-input';
    input.type = 'text';
    input.placeholder = 'Type text...';

    var btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '4px';

    var okBtn = document.createElement('button');
    okBtn.className = 'ie-header-btn';
    okBtn.textContent = 'Add';
    okBtn.addEventListener('click', function() { commitText(input.value, tx, ty); });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'ie-header-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() {
      if (textInputWrap) { textInputWrap.remove(); textInputWrap = null; }
    });

    input.addEventListener('keydown', function(e) {
      e.stopPropagation(); // prevent tool shortcuts while typing
      if (e.key === 'Enter') { commitText(input.value, tx, ty); }
      if (e.key === 'Escape') { textInputWrap.remove(); textInputWrap = null; }
    });

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    textInputWrap.appendChild(input);
    textInputWrap.appendChild(btnRow);
    canvasStack.appendChild(textInputWrap);
    input.focus();
  }

  function commitText(text, tx, ty) {
    if (!text || !layers[activeLayerIdx]) return;
    saveUndo();
    var tCtx = layers[activeLayerIdx].canvas.getContext('2d');
    tCtx.font = Math.max(12, brushSize * 2) + 'px sans-serif';
    tCtx.fillStyle = brushColor;
    tCtx.globalAlpha = brushOpacity / 100;
    tCtx.fillText(text, tx, ty);
    tCtx.globalAlpha = 1;
    renderLayers();
    if (textInputWrap) { textInputWrap.remove(); textInputWrap = null; }
  }

  // ── Keyboard Shortcuts ──
  document.addEventListener('keydown', function(e) {
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    var key = e.key.toLowerCase();

    // Tool shortcuts
    for (var i = 0; i < TOOLS.length; i++) {
      if (key === TOOLS[i].key && !e.ctrlKey && !e.metaKey) {
        setTool(TOOLS[i].id);
        return;
      }
    }

    // Ctrl+Z / Cmd+Z = undo
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      doUndo();
      return;
    }

    // Ctrl+Y / Ctrl+Shift+Z = redo
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      doRedo();
      return;
    }

    // [ and ] for brush size
    if (key === '[') {
      brushSize = Math.max(1, brushSize - 2);
      document.getElementById('brushSize').value = String(brushSize);
      document.getElementById('brushSizeVal').textContent = String(brushSize);
    }
    if (key === ']') {
      brushSize = Math.min(100, brushSize + 2);
      document.getElementById('brushSize').value = String(brushSize);
      document.getElementById('brushSizeVal').textContent = String(brushSize);
    }
  });

  // ── New Canvas ──
  document.getElementById('newBtn').addEventListener('click', function() {
    prvctice.ui.confirm('Create new canvas? Unsaved changes will be lost.').then(function(ok) {
      if (!ok) return;
      layers = [];
      undoStack = [];
      redoStack = [];
      activeLayerIdx = 0;
      createLayer('Background');
      // Fill with white
      var ctx = layers[0].canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);
      renderLayers();
      renderLayerList();
    });
  });

  // ── Image Loading Helper ──
  function loadImageFromDataUrl(dataUrl, label) {
    var img = new Image();
    img.onload = function() {
      saveUndo();
      canvasW = Math.min(img.naturalWidth, 4096);
      canvasH = Math.min(img.naturalHeight, 4096);
      statusSize.textContent = canvasW + ' x ' + canvasH;
      layers = [];
      createLayer(label || 'Imported');
      activeLayerIdx = 0;
      var lCtx = layers[0].canvas.getContext('2d');
      layers[0].canvas.width = canvasW;
      layers[0].canvas.height = canvasH;
      lCtx.drawImage(img, 0, 0, canvasW, canvasH);
      renderLayers();
      renderLayerList();
    };
    img.src = dataUrl;
  }

  // ── Import from device ──
  document.getElementById('importBtn').addEventListener('click', function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files || !input.files[0]) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        loadImageFromDataUrl(ev.target.result, input.files[0].name);
      };
      reader.readAsDataURL(input.files[0]);
    };
    input.click();
  });

  // ── Import from Files (VFS blobs) ──
  var ieFilePicker = prvctice.ui.filePicker({
    accept: 'image/*',
    title: 'Load Image',
    emptyMessage: 'No images in files yet',
    onSelect: function(result) {
      loadImageFromDataUrl(result.dataUrl, result.entry.name.slice(0, 8));
    }
  });
  document.getElementById('filesBtn').addEventListener('click', function() {
    ieFilePicker.open();
  });

  // ── Export ──
  function exportCanvas(format) {
    var c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    var ctx = c.getContext('2d');

    // If JPEG, fill white background first
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    for (var i = 0; i < layers.length; i++) {
      if (!layers[i].visible) continue;
      ctx.globalCompositeOperation = layers[i].blend;
      ctx.globalAlpha = layers[i].opacity / 100;
      ctx.drawImage(layers[i].canvas, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    var dataUri = c.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
    var ext = format === 'jpeg' ? 'jpg' : 'png';
    var mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    var base64 = dataUri.split(',')[1];
    prvctice.media.download(base64, 'image-editor-export.' + ext, mime);
  }

  document.getElementById('exportPngBtn').addEventListener('click', function() { exportCanvas('png'); });
  document.getElementById('exportJpgBtn').addEventListener('click', function() { exportCanvas('jpeg'); });

  // ── Init ──
  buildToolbar();
  createLayer('Background');
  var bgCtx = layers[0].canvas.getContext('2d');
  bgCtx.fillStyle = '#ffffff';
  bgCtx.fillRect(0, 0, canvasW, canvasH);
  activeLayerIdx = 0;
  statusSize.textContent = canvasW + ' x ' + canvasH;

  updateColor();
  renderLayers();
  renderLayerList();

  prvctice.onDispose(function() {
    layers = [];
    undoStack = [];
    redoStack = [];
  });
});
</script>
</body>
</html>`;
