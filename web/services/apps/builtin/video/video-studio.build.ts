/**
 * Video Studio HTML Build
 *
 * DAW-style timeline with multiple lanes (video, audio, text overlay).
 * Import media via file picker, trim/split clips on timeline, apply
 * image processing filters to video clips, preview in canvas, and
 * export as GIF, image sequence (PNG frames), or MP4 via backend FFmpeg.
 * Uses prvctice.ui.timeline for the timeline component.
 * Loaded lazily by the video-studio config via dynamic import.
 */

export const VIDEO_STUDIO_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Layout ── */
.vs-wrap {
  display: flex; flex-direction: column; height: 100%;
  font-family: var(--p-font-mono); color: var(--p-text);
}

/* ── Header ── */
.vs-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  background: var(--p-surface); border-bottom: 1px solid var(--p-border);
  flex-shrink: 0;
}
.vs-title {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em;
}
.vs-spacer { flex: 1; }
.vs-btn {
  all: unset; cursor: pointer; padding: 3px 10px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--p-text-muted); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-pill); transition: all 100ms ease;
}
.vs-btn:hover { color: var(--p-text); background: var(--p-surface-raised); }
.vs-btn.primary {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
}
.vs-btn.primary:hover { background: rgba(68,136,255,0.08); }

/* ── Preview Area ── */
.vs-preview-area {
  display: flex; flex: 1; min-height: 0;
}
.vs-preview {
  flex: 1; min-width: 0; background: #111; display: flex;
  align-items: center; justify-content: center; position: relative;
  overflow: hidden;
}
.vs-preview canvas {
  max-width: 100%; max-height: 100%; image-rendering: auto;
}
.vs-preview-placeholder {
  color: var(--p-text-muted); font-size: 11px; text-align: center;
}
.vs-preview-time {
  position: absolute; bottom: 6px; right: 8px;
  font-size: 10px; font-family: var(--p-font-mono);
  color: var(--p-text); background: rgba(0,0,0,0.6);
  padding: 2px 6px; border-radius: var(--p-radius-sm);
  font-variant-numeric: tabular-nums;
}

/* ── Side Panel ── */
.vs-panel {
  width: 200px; flex-shrink: 0; background: var(--p-surface);
  border-left: 1px solid var(--p-border); display: flex;
  flex-direction: column; overflow-y: auto;
}
.vs-panel-section {
  padding: 8px; border-bottom: 1px solid var(--p-border);
}
.vs-panel-title {
  font-size: 9px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--p-text-muted); margin-bottom: 6px;
}
.vs-prop-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
}
.vs-prop-label {
  font-size: 9px; color: var(--p-text-muted); width: 50px; flex-shrink: 0;
}
.vs-prop-slider {
  flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
  background: var(--p-border); border-radius: 2px; outline: none;
}
.vs-prop-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--p-accent-blue); cursor: pointer;
}
.vs-prop-value {
  font-size: 9px; color: var(--p-text); min-width: 28px; text-align: right;
  font-variant-numeric: tabular-nums;
}
.vs-select {
  width: 100%; padding: 3px 6px; font-size: 9px;
  font-family: var(--p-font-mono); background: var(--p-surface);
  color: var(--p-text); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-sm); outline: none;
}
.vs-text-input {
  width: 100%; padding: 3px 6px; font-size: 10px;
  font-family: var(--p-font-mono); background: var(--p-surface);
  color: var(--p-text); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-sm); outline: none;
}
.vs-text-input:focus, .vs-select:focus { border-color: var(--p-accent-blue); }

/* ── Clip List ── */
.vs-clip-list {
  display: flex; flex-direction: column; gap: 3px;
}
.vs-clip-item {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  border-radius: var(--p-radius-sm); cursor: pointer;
  border: 1px solid transparent; transition: all 80ms ease;
  font-size: 9px; color: var(--p-text);
}
.vs-clip-item:hover { background: var(--p-surface-raised); }
.vs-clip-item.active {
  border-color: var(--p-accent-blue); background: rgba(68,136,255,0.08);
}
.vs-clip-type {
  font-size: 8px; text-transform: uppercase; padding: 1px 4px;
  border-radius: var(--p-radius-sm); font-weight: 600;
}
.vs-clip-type.video { background: rgba(68,136,255,0.15); color: var(--p-accent-blue); }
.vs-clip-type.audio { background: rgba(46,125,66,0.15); color: var(--p-accent-green); }
.vs-clip-type.text { background: rgba(255,107,43,0.15); color: var(--p-accent-amber); }
.vs-clip-name {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vs-clip-dur {
  font-size: 8px; color: var(--p-text-muted); font-variant-numeric: tabular-nums;
}

/* ── Timeline Area ── */
.vs-timeline-area {
  height: 200px; flex-shrink: 0; border-top: 1px solid var(--p-border);
}

/* ── Status ── */
.vs-status {
  display: flex; align-items: center; gap: 8px; padding: 4px 10px;
  background: var(--p-surface); border-top: 1px solid var(--p-border);
  font-size: 9px; color: var(--p-text-muted); flex-shrink: 0;
}

/* ── Export Modal ── */
.vs-export-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center; z-index: 100;
}
.vs-export-overlay.visible { display: flex; }
.vs-export-modal {
  background: var(--p-surface); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-xl); padding: 20px;
  width: 320px; max-width: 90%;
}
.vs-export-title {
  font-size: 12px; font-weight: 600; margin-bottom: 12px;
}
.vs-export-progress {
  width: 100%; height: 6px; background: var(--p-border);
  border-radius: 3px; margin: 12px 0; overflow: hidden;
}
.vs-export-bar {
  height: 100%; background: var(--p-accent-blue); border-radius: 3px;
  transition: width 200ms ease; width: 0%;
}
.vs-export-status {
  font-size: 10px; color: var(--p-text-muted); text-align: center;
}
.vs-export-actions {
  display: flex; gap: 6px; justify-content: flex-end; margin-top: 12px;
}

</style>
</head>
<body>
<div class="vs-wrap">
  <!-- Header -->
  <div class="vs-header">
    <span class="vs-title">Video Studio</span>
    <button class="vs-btn" id="importVideoBtn">+ Video</button>
    <button class="vs-btn" id="importAudioBtn">+ Audio</button>
    <button class="vs-btn" id="addTextBtn">+ Text</button>
    <button class="vs-btn" id="filesBtn">Files</button>
    <span class="vs-spacer"></span>
    <button class="vs-btn" id="splitBtn">Split</button>
    <button class="vs-btn" id="deleteClipBtn">Delete</button>
    <span class="vs-spacer"></span>
    <button class="vs-btn primary" id="exportBtn">Export</button>
  </div>

  <!-- Preview + Panel -->
  <div class="vs-preview-area">
    <div class="vs-preview" id="previewArea">
      <canvas id="previewCanvas" width="640" height="360"></canvas>
      <div class="vs-preview-placeholder" id="previewPlaceholder">
        Import video or audio to begin
      </div>
      <div class="vs-preview-time" id="previewTime">0:00.00</div>
    </div>

    <div class="vs-panel">
      <!-- Clip List -->
      <div class="vs-panel-section">
        <div class="vs-panel-title">Clips</div>
        <div class="vs-clip-list" id="clipList"></div>
      </div>

      <!-- Selected Clip Properties -->
      <div class="vs-panel-section" id="clipPropsSection" style="display:none">
        <div class="vs-panel-title" id="clipPropsTitle">Clip Properties</div>

        <!-- Text clip properties -->
        <div id="textProps" style="display:none">
          <div class="vs-prop-row">
            <span class="vs-prop-label">Text</span>
            <input type="text" class="vs-text-input" id="textContent" value="" placeholder="Enter text">
          </div>
          <div class="vs-prop-row">
            <span class="vs-prop-label">Size</span>
            <input type="range" class="vs-prop-slider" id="textSize" min="12" max="120" value="36">
            <span class="vs-prop-value" id="textSizeVal">36</span>
          </div>
          <div class="vs-prop-row">
            <span class="vs-prop-label">Color</span>
            <input type="color" id="textColor" value="#ffffff" style="width:28px;height:20px;border:none;cursor:pointer">
          </div>
          <div class="vs-prop-row">
            <span class="vs-prop-label">X</span>
            <input type="range" class="vs-prop-slider" id="textX" min="0" max="100" value="50">
            <span class="vs-prop-value" id="textXVal">50%</span>
          </div>
          <div class="vs-prop-row">
            <span class="vs-prop-label">Y</span>
            <input type="range" class="vs-prop-slider" id="textY" min="0" max="100" value="50">
            <span class="vs-prop-value" id="textYVal">50%</span>
          </div>
        </div>

        <!-- Video clip filter properties -->
        <div id="filterProps" style="display:none">
          <div class="vs-prop-row">
            <span class="vs-prop-label">Filter</span>
            <select class="vs-select" id="clipFilter">
              <option value="none">None</option>
              <option value="grayscale">Grayscale</option>
              <option value="sepia">Sepia</option>
              <option value="invert">Invert</option>
              <option value="brightness">Brightness</option>
              <option value="contrast">Contrast</option>
              <option value="blur">Blur</option>
              <option value="vignette">Vignette</option>
            </select>
          </div>
          <div class="vs-prop-row" id="filterAmountRow" style="display:none">
            <span class="vs-prop-label">Amount</span>
            <input type="range" class="vs-prop-slider" id="filterAmount" min="-100" max="100" value="0">
            <span class="vs-prop-value" id="filterAmountVal">0</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Timeline -->
  <div class="vs-timeline-area" id="timelineArea"></div>

  <!-- Status -->
  <div class="vs-status">
    <span id="statusInfo">0 clips</span>
    <span style="flex:1"></span>
    <span id="statusDuration">Duration: 0s</span>
  </div>
</div>

<!-- Export Modal -->
<div class="vs-export-overlay" id="exportOverlay">
  <div class="vs-export-modal">
    <div class="vs-export-title">Export Project</div>
    <div class="vs-prop-row">
      <span class="vs-prop-label">Format</span>
      <select class="vs-select" id="exportFormat">
        <option value="gif">GIF (Animated)</option>
        <option value="frames">Image Sequence (PNG)</option>
        <option value="mp4">MP4 (via server)</option>
      </select>
    </div>
    <div class="vs-prop-row" style="margin-top:6px">
      <span class="vs-prop-label">FPS</span>
      <select class="vs-select" id="exportFps">
        <option value="10">10 fps</option>
        <option value="15" selected>15 fps</option>
        <option value="24">24 fps</option>
        <option value="30">30 fps</option>
      </select>
    </div>
    <div class="vs-export-progress" id="exportProgress" style="display:none">
      <div class="vs-export-bar" id="exportBar"></div>
    </div>
    <div class="vs-export-status" id="exportStatus"></div>
    <div class="vs-export-actions">
      <button class="vs-btn" id="exportCancelBtn">Cancel</button>
      <button class="vs-btn primary" id="exportStartBtn">Start Export</button>
    </div>
  </div>
</div>

<script>
prvctice.onReady(function() {
  // ── DOM Refs ──
  var previewCanvas = document.getElementById('previewCanvas');
  var previewCtx = previewCanvas.getContext('2d');
  var previewPlaceholder = document.getElementById('previewPlaceholder');
  var previewTime = document.getElementById('previewTime');
  var clipList = document.getElementById('clipList');
  var clipPropsSection = document.getElementById('clipPropsSection');
  var timelineArea = document.getElementById('timelineArea');
  var statusInfo = document.getElementById('statusInfo');
  var statusDuration = document.getElementById('statusDuration');
  var exportOverlay = document.getElementById('exportOverlay');

  // ── State ──
  var clips = [];       // { id, type, laneId, name, start, duration, data }
  var clipIdCounter = 0;
  var selectedClipId = null;
  var timeline = null;
  var projectDuration = 30;
  var playing = false;
  var playStartTime = 0;
  var playheadTime = 0;
  var playRafId = null;
  var videoPlayers = {}; // clipId -> { playerId, loaded }

  // ── Timeline Setup ──
  var LANES = [
    { id: 'video', label: 'Video', color: '#4488ff' },
    { id: 'audio', label: 'Audio', color: '#2e7d42' },
    { id: 'text', label: 'Text', color: '#ff6b2b' }
  ];

  function initTimeline() {
    timeline = prvctice.ui.timeline(timelineArea, {
      duration: projectDuration,
      lanes: LANES,
      clips: [],
      snap: true,
      snapInterval: 0.5,
      zoom: 1,
      onPlay: function(pos) {
        startPlayback(pos);
      },
      onPause: function(pos) {
        stopPlayback();
      },
      onSeek: function(pos) {
        playheadTime = pos;
        renderPreviewAtTime(pos);
        updateTimeDisplay(pos);
      },
      onClipMove: function(info) {
        var clip = findClip(info.clipId);
        if (clip) {
          clip.start = info.start;
          clip.duration = info.duration;
          updateProjectDuration();
        }
      },
      onClipSelect: function(clipId) {
        selectedClipId = clipId;
        renderClipList();
        showClipProperties(clipId);
      },
      onClipAdd: function(info) {
        if (info.laneId === 'text') {
          addTextClip(info.start);
        }
      }
    });
  }

  function findClip(id) {
    for (var i = 0; i < clips.length; i++) {
      if (clips[i].id === id) return clips[i];
    }
    return null;
  }

  function updateProjectDuration() {
    var maxEnd = 5;
    for (var i = 0; i < clips.length; i++) {
      var end = clips[i].start + clips[i].duration;
      if (end > maxEnd) maxEnd = end;
    }
    projectDuration = Math.max(30, Math.ceil(maxEnd + 5));
    if (timeline) timeline.setDuration(projectDuration);
    statusDuration.textContent = 'Duration: ' + Math.round(projectDuration) + 's';
  }

  // ── Media Loading Helpers ──
  function importVideoFromDataUrl(dataUri, name, mimeType) {
    var base64 = dataUri.split(',')[1] || '';
    prvctice.video.load({ base64: base64, mimeType: mimeType }).then(function(result) {
      var clipId = 'clip-' + (++clipIdCounter);
      var dur = result.duration || 10;
      videoPlayers[clipId] = { playerId: result.playerId, loaded: true };
      var clip = {
        id: clipId, type: 'video', laneId: 'video', name: name,
        start: 0, duration: dur,
        data: {
          base64: base64, mimeType: mimeType, playerId: result.playerId,
          width: result.width || 640, height: result.height || 360,
          filter: 'none', filterAmount: 0
        }
      };
      clips.push(clip);
      if (timeline) {
        timeline.addClip({ id: clipId, laneId: 'video', start: 0, duration: dur, label: name, type: 'video' });
      }
      previewPlaceholder.style.display = 'none';
      updateProjectDuration();
      renderClipList();
      statusInfo.textContent = clips.length + ' clips';
    }).then(null, function(err) {
      prvctice.ui.toast('Failed to load video: ' + (err.message || err), 'error');
    });
  }

  function importAudioFromDataUrl(dataUri, name, mimeType, fileSize) {
    var clipId = 'clip-' + (++clipIdCounter);
    var durEstimate = Math.max(5, ((fileSize || 100000) / (1024 * 1024)) * 60);
    var clip = {
      id: clipId, type: 'audio', laneId: 'audio', name: name,
      start: 0, duration: Math.min(durEstimate, 300),
      data: { dataUri: dataUri, mimeType: mimeType }
    };
    clips.push(clip);
    if (timeline) {
      timeline.addClip({ id: clipId, laneId: 'audio', start: 0, duration: clip.duration, label: name, type: 'audio' });
    }
    updateProjectDuration();
    renderClipList();
    statusInfo.textContent = clips.length + ' clips';
  }

  // ── Import Video ──
  document.getElementById('importVideoBtn').addEventListener('click', function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = function() {
      if (!input.files || !input.files[0]) return;
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function(ev) {
        importVideoFromDataUrl(ev.target.result, file.name, file.type);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

  // ── Import Audio ──
  document.getElementById('importAudioBtn').addEventListener('click', function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = function() {
      if (!input.files || !input.files[0]) return;
      var file = input.files[0];
      var reader = new FileReader();
      reader.onload = function(ev) {
        importAudioFromDataUrl(ev.target.result, file.name, file.type, file.size);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

  // ── Import from Files (VFS blobs) ──
  var vsFilePicker = prvctice.ui.filePicker({
    accept: 'video/*,audio/*',
    title: 'Load from Files',
    emptyMessage: 'No video or audio files yet',
    onSelect: function(result) {
      var entry = result.entry;
      var isVideo = entry.mime && entry.mime.indexOf('video/') === 0;
      if (isVideo) {
        importVideoFromDataUrl(result.dataUrl, entry.name.slice(0, 8), entry.mime);
      } else {
        importAudioFromDataUrl(result.dataUrl, entry.name.slice(0, 8), entry.mime, entry.size);
      }
    }
  });
  document.getElementById('filesBtn').addEventListener('click', function() {
    vsFilePicker.open();
  });

  // ── Add Text Clip ──
  function addTextClip(startAt) {
    var clipId = 'clip-' + (++clipIdCounter);
    var clip = {
      id: clipId,
      type: 'text',
      laneId: 'text',
      name: 'Text Overlay',
      start: startAt || 0,
      duration: 5,
      data: {
        text: 'Text',
        size: 36,
        color: '#ffffff',
        x: 50,
        y: 50,
        font: 'sans-serif'
      }
    };
    clips.push(clip);

    if (timeline) {
      timeline.addClip({ id: clipId, laneId: 'text', start: clip.start, duration: clip.duration, label: 'Text', type: 'text' });
    }
    updateProjectDuration();
    renderClipList();
    selectedClipId = clipId;
    showClipProperties(clipId);
    statusInfo.textContent = clips.length + ' clips';
  }

  document.getElementById('addTextBtn').addEventListener('click', function() {
    addTextClip(playheadTime);
  });

  // ── Split Clip ──
  document.getElementById('splitBtn').addEventListener('click', function() {
    if (!selectedClipId) return;
    var clip = findClip(selectedClipId);
    if (!clip) return;

    var splitTime = playheadTime;
    if (splitTime <= clip.start || splitTime >= clip.start + clip.duration) {
      prvctice.ui.toast('Move playhead within the clip to split', 'warning');
      return;
    }

    var newDur1 = splitTime - clip.start;
    var newDur2 = clip.duration - newDur1;

    // Create second half
    var newId = 'clip-' + (++clipIdCounter);
    var newClip = {
      id: newId,
      type: clip.type,
      laneId: clip.laneId,
      name: clip.name + ' (split)',
      start: splitTime,
      duration: newDur2,
      data: JSON.parse(JSON.stringify(clip.data))
    };
    clips.push(newClip);

    // Resize first half
    clip.duration = newDur1;
    if (timeline) {
      timeline.updateClip(clip.id, { duration: newDur1 });
      timeline.addClip({ id: newId, laneId: newClip.laneId, start: splitTime, duration: newDur2, label: newClip.name, type: newClip.type });
    }
    renderClipList();
    statusInfo.textContent = clips.length + ' clips';
  });

  // ── Delete Clip ──
  document.getElementById('deleteClipBtn').addEventListener('click', function() {
    if (!selectedClipId) return;
    var clip = findClip(selectedClipId);
    if (!clip) return;

    // Cleanup video player
    if (clip.type === 'video' && videoPlayers[clip.id]) {
      prvctice.video.unload(videoPlayers[clip.id].playerId).then(null, function() {});
      delete videoPlayers[clip.id];
    }

    clips = clips.filter(function(c) { return c.id !== selectedClipId; });
    if (timeline) timeline.removeClip(selectedClipId);
    selectedClipId = null;
    clipPropsSection.style.display = 'none';
    renderClipList();
    statusInfo.textContent = clips.length + ' clips';
    updateProjectDuration();
  });

  // ── Clip List ──
  function renderClipList() {
    clipList.innerHTML = '';
    for (var i = 0; i < clips.length; i++) {
      var c = clips[i];
      var el = document.createElement('div');
      el.className = 'vs-clip-item' + (c.id === selectedClipId ? ' active' : '');
      el.dataset.clipId = c.id;

      var typeSpan = document.createElement('span');
      typeSpan.className = 'vs-clip-type ' + c.type;
      typeSpan.textContent = c.type.charAt(0).toUpperCase();
      el.appendChild(typeSpan);

      var nameSpan = document.createElement('span');
      nameSpan.className = 'vs-clip-name';
      nameSpan.textContent = c.name;
      el.appendChild(nameSpan);

      var durSpan = document.createElement('span');
      durSpan.className = 'vs-clip-dur';
      durSpan.textContent = c.duration.toFixed(1) + 's';
      el.appendChild(durSpan);

      clipList.appendChild(el);
    }
  }

  clipList.addEventListener('click', function(e) {
    var item = e.target.closest('.vs-clip-item');
    if (!item) return;
    selectedClipId = item.dataset.clipId;
    renderClipList();
    showClipProperties(selectedClipId);
  });

  // ── Clip Properties Panel ──
  function showClipProperties(clipId) {
    var clip = findClip(clipId);
    if (!clip) {
      clipPropsSection.style.display = 'none';
      return;
    }
    clipPropsSection.style.display = 'block';
    document.getElementById('clipPropsTitle').textContent = clip.name;

    var textProps = document.getElementById('textProps');
    var filterProps = document.getElementById('filterProps');

    if (clip.type === 'text') {
      textProps.style.display = 'block';
      filterProps.style.display = 'none';
      document.getElementById('textContent').value = clip.data.text || '';
      document.getElementById('textSize').value = String(clip.data.size || 36);
      document.getElementById('textSizeVal').textContent = String(clip.data.size || 36);
      document.getElementById('textColor').value = clip.data.color || '#ffffff';
      document.getElementById('textX').value = String(clip.data.x || 50);
      document.getElementById('textXVal').textContent = (clip.data.x || 50) + '%';
      document.getElementById('textY').value = String(clip.data.y || 50);
      document.getElementById('textYVal').textContent = (clip.data.y || 50) + '%';
    } else if (clip.type === 'video') {
      textProps.style.display = 'none';
      filterProps.style.display = 'block';
      document.getElementById('clipFilter').value = clip.data.filter || 'none';
      var amountRow = document.getElementById('filterAmountRow');
      amountRow.style.display = (clip.data.filter && clip.data.filter !== 'none' && clip.data.filter !== 'grayscale' && clip.data.filter !== 'sepia' && clip.data.filter !== 'invert') ? 'flex' : 'none';
      document.getElementById('filterAmount').value = String(clip.data.filterAmount || 0);
      document.getElementById('filterAmountVal').textContent = String(clip.data.filterAmount || 0);
    } else {
      textProps.style.display = 'none';
      filterProps.style.display = 'none';
    }
  }

  // ── Text Property Bindings ──
  document.getElementById('textContent').addEventListener('input', function() {
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'text') clip.data.text = this.value;
  });
  document.getElementById('textSize').addEventListener('input', function() {
    document.getElementById('textSizeVal').textContent = this.value;
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'text') clip.data.size = parseInt(this.value, 10);
  });
  document.getElementById('textColor').addEventListener('input', function() {
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'text') clip.data.color = this.value;
  });
  document.getElementById('textX').addEventListener('input', function() {
    document.getElementById('textXVal').textContent = this.value + '%';
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'text') clip.data.x = parseInt(this.value, 10);
  });
  document.getElementById('textY').addEventListener('input', function() {
    document.getElementById('textYVal').textContent = this.value + '%';
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'text') clip.data.y = parseInt(this.value, 10);
  });

  // ── Filter Property Bindings ──
  document.getElementById('clipFilter').addEventListener('change', function() {
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'video') {
      clip.data.filter = this.value;
      var amountRow = document.getElementById('filterAmountRow');
      amountRow.style.display = (this.value !== 'none' && this.value !== 'grayscale' && this.value !== 'sepia' && this.value !== 'invert') ? 'flex' : 'none';
    }
  });
  document.getElementById('filterAmount').addEventListener('input', function() {
    document.getElementById('filterAmountVal').textContent = this.value;
    var clip = findClip(selectedClipId);
    if (clip && clip.type === 'video') clip.data.filterAmount = parseInt(this.value, 10);
  });

  // ── Preview Rendering ──
  function renderPreviewAtTime(time) {
    previewCtx.fillStyle = '#111';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Find active video clip at this time
    var activeVideo = null;
    for (var i = 0; i < clips.length; i++) {
      var c = clips[i];
      if (c.type === 'video' && time >= c.start && time < c.start + c.duration) {
        activeVideo = c;
        break;
      }
    }

    if (activeVideo && videoPlayers[activeVideo.id]) {
      var vp = videoPlayers[activeVideo.id];
      var clipTime = time - activeVideo.start;

      prvctice.video.seekAndCapture(vp.playerId, clipTime, previewCanvas.width, previewCanvas.height).then(function(frame) {
        if (frame && frame.dataUri) {
          var img = new Image();
          img.onload = function() {
            previewCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);

            // Apply filter
            if (activeVideo.data.filter && activeVideo.data.filter !== 'none' && prvctice.image) {
              var filtered = applyVideoFilter(previewCanvas, activeVideo.data.filter, activeVideo.data.filterAmount);
              if (filtered && filtered !== previewCanvas) {
                previewCtx.drawImage(filtered, 0, 0);
              }
            }

            // Render text overlays on top
            renderTextOverlays(time);
          };
          img.src = frame.dataUri;
        }
      }).then(null, function() {
        // Seek failed, just render text overlays
        renderTextOverlays(time);
      });
    } else {
      renderTextOverlays(time);
    }
  }

  function applyVideoFilter(canvas, filterName, amount) {
    if (!prvctice.image) return canvas;
    var val = (amount || 0) / 100;
    var filterMap = {
      grayscale: function(c) { return prvctice.image.grayscale(c); },
      sepia: function(c) { return prvctice.image.sepia(c); },
      invert: function(c) { return prvctice.image.invert(c); },
      brightness: function(c) { return prvctice.image.brightness(c, { value: val * 0.5 }); },
      contrast: function(c) { return prvctice.image.contrast(c, { value: val * 0.5 }); },
      blur: function(c) { return prvctice.image.blur(c, { radius: Math.abs(val) * 8 }); },
      vignette: function(c) { return prvctice.image.vignette(c, { radius: 0.3, amount: 0.8 }); }
    };
    var fn = filterMap[filterName];
    return fn ? fn(canvas) : canvas;
  }

  function renderTextOverlays(time) {
    for (var i = 0; i < clips.length; i++) {
      var c = clips[i];
      if (c.type !== 'text') continue;
      if (time < c.start || time >= c.start + c.duration) continue;

      var data = c.data;
      var x = (data.x / 100) * previewCanvas.width;
      var y = (data.y / 100) * previewCanvas.height;

      previewCtx.save();
      previewCtx.font = (data.size || 36) + 'px ' + (data.font || 'sans-serif');
      previewCtx.fillStyle = data.color || '#ffffff';
      previewCtx.textAlign = 'center';
      previewCtx.textBaseline = 'middle';
      // Text shadow for readability
      previewCtx.shadowColor = 'rgba(0,0,0,0.7)';
      previewCtx.shadowBlur = 4;
      previewCtx.shadowOffsetX = 1;
      previewCtx.shadowOffsetY = 1;
      previewCtx.fillText(data.text || '', x, y);
      previewCtx.restore();
    }
  }

  function updateTimeDisplay(t) {
    var mins = Math.floor(t / 60);
    var secs = t - mins * 60;
    var whole = Math.floor(secs);
    var frac = Math.floor((secs - whole) * 100);
    var pad = whole < 10 ? '0' : '';
    var fracPad = frac < 10 ? '0' : '';
    previewTime.textContent = mins + ':' + pad + whole + '.' + fracPad + frac;
  }

  // ── Playback ──
  function startPlayback(fromTime) {
    if (playing) return;
    playing = true;
    playStartTime = performance.now();
    playheadTime = fromTime;

    function tick() {
      if (!playing) return;
      var elapsed = (performance.now() - playStartTime) / 1000;
      var currentTime = playheadTime + elapsed;

      if (currentTime >= projectDuration) {
        stopPlayback();
        return;
      }

      if (timeline) timeline.setPlayhead(currentTime);
      renderPreviewAtTime(currentTime);
      updateTimeDisplay(currentTime);
      playRafId = requestAnimationFrame(tick);
    }
    playRafId = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    playing = false;
    if (playRafId) {
      cancelAnimationFrame(playRafId);
      playRafId = null;
    }
  }

  // ── Export ──
  document.getElementById('exportBtn').addEventListener('click', function() {
    exportOverlay.classList.add('visible');
  });

  document.getElementById('exportCancelBtn').addEventListener('click', function() {
    exportOverlay.classList.remove('visible');
  });

  document.getElementById('exportStartBtn').addEventListener('click', function() {
    var format = document.getElementById('exportFormat').value;
    var fps = parseInt(document.getElementById('exportFps').value, 10);
    var progressEl = document.getElementById('exportProgress');
    var barEl = document.getElementById('exportBar');
    var statusExport = document.getElementById('exportStatus');
    progressEl.style.display = 'block';
    barEl.style.width = '0%';
    statusExport.textContent = 'Rendering frames...';

    // Calculate total frames
    var actualDuration = 0;
    for (var i = 0; i < clips.length; i++) {
      var end = clips[i].start + clips[i].duration;
      if (end > actualDuration) actualDuration = end;
    }
    if (actualDuration === 0) {
      statusExport.textContent = 'No clips to export';
      return;
    }

    var totalFrames = Math.ceil(actualDuration * fps);
    var interval = 1000 / fps;
    var frameIdx = 0;
    var frameDataUris = [];

    function renderNextFrame() {
      if (frameIdx >= totalFrames) {
        barEl.style.width = '100%';
        statusExport.textContent = 'Encoding ' + totalFrames + ' frames...';
        finishExport(format, frameDataUris, fps);
        return;
      }

      var time = frameIdx / fps;
      renderPreviewAtTime(time);

      // Capture frame after render
      setTimeout(function() {
        var dataUri = previewCanvas.toDataURL('image/png');
        frameDataUris.push(dataUri);
        frameIdx++;
        var pct = Math.round((frameIdx / totalFrames) * 80);
        barEl.style.width = pct + '%';
        statusExport.textContent = 'Frame ' + frameIdx + '/' + totalFrames;
        renderNextFrame();
      }, 50);
    }

    renderNextFrame();
  });

  function finishExport(format, frames, fps) {
    var statusExport = document.getElementById('exportStatus');
    var barEl = document.getElementById('exportBar');

    if (format === 'frames') {
      // Download each frame as individual PNG
      statusExport.textContent = 'Saving ' + frames.length + ' frames...';
      var saved = 0;
      for (var i = 0; i < frames.length; i++) {
        (function(idx) {
          var padded = String(idx + 1);
          while (padded.length < 4) padded = '0' + padded;
          prvctice.media.save(frames[idx], 'frame-' + padded + '.png', 'image/png');
          saved++;
          if (saved >= frames.length) {
            barEl.style.width = '100%';
            statusExport.textContent = 'Saved ' + frames.length + ' frames';
          }
        })(i);
      }
    } else if (format === 'gif') {
      // Create GIF from frames
      var w = previewCanvas.width;
      var h = previewCanvas.height;
      var delay = Math.round(1000 / fps);

      prvctice.gif.create({ width: w, height: h, quality: 'medium' }).then(function(result) {
        var encoderId = result.encoderId;
        var addIdx = 0;

        function addNextGifFrame() {
          if (addIdx >= frames.length) {
            statusExport.textContent = 'Encoding GIF...';
            barEl.style.width = '95%';
            prvctice.gif.finish(encoderId).then(function(gifResult) {
              barEl.style.width = '100%';
              statusExport.textContent = 'GIF export complete';
              if (gifResult && gifResult.dataUri) {
                prvctice.media.save(gifResult.dataUri, 'video-studio.gif', 'image/gif');
              }
            }).then(null, function() {
              statusExport.textContent = 'GIF encoding failed';
            });
            return;
          }

          prvctice.gif.addFrame(encoderId, frames[addIdx], delay).then(function() {
            addIdx++;
            var pct = 80 + Math.round((addIdx / frames.length) * 15);
            barEl.style.width = pct + '%';
            addNextGifFrame();
          }).then(null, function() {
            statusExport.textContent = 'Failed to add GIF frame';
          });
        }

        addNextGifFrame();
      }).then(null, function() {
        statusExport.textContent = 'Failed to create GIF encoder';
      });
    } else if (format === 'mp4') {
      // For MP4, we need to send frame data to the backend
      // This is a simplified approach: create a GIF first, then convert to MP4
      statusExport.textContent = 'Creating intermediate GIF for MP4 conversion...';
      var w2 = previewCanvas.width;
      var h2 = previewCanvas.height;
      var delay2 = Math.round(1000 / fps);

      prvctice.gif.create({ width: w2, height: h2, quality: 'high' }).then(function(result) {
        var encoderId = result.encoderId;
        var addIdx2 = 0;

        function addMP4Frame() {
          if (addIdx2 >= frames.length) {
            statusExport.textContent = 'Encoding intermediate format...';
            barEl.style.width = '90%';
            prvctice.gif.finish(encoderId).then(function(gifResult) {
              if (gifResult && gifResult.dataUri) {
                statusExport.textContent = 'Converting to MP4 via server...';
                barEl.style.width = '95%';
                var base64 = gifResult.dataUri.split(',')[1] || '';
                prvctice.web.fetch('/api/v1/media/convert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    base64: base64,
                    inputMime: 'image/gif',
                    outputFormat: 'mp4'
                  })
                }).then(function(response) {
                  return response.json ? response.json() : JSON.parse(response.body || response);
                }).then(function(data) {
                  if (data.error) {
                    statusExport.textContent = 'MP4 conversion failed: ' + data.error;
                  } else {
                    barEl.style.width = '100%';
                    statusExport.textContent = 'MP4 export complete';
                    var mp4Uri = 'data:video/mp4;base64,' + data.base64;
                    prvctice.media.save(mp4Uri, 'video-studio.mp4', 'video/mp4');
                  }
                }).then(null, function() {
                  statusExport.textContent = 'MP4 conversion failed';
                });
              }
            }).then(null, function() {
              statusExport.textContent = 'Intermediate encoding failed';
            });
            return;
          }

          prvctice.gif.addFrame(encoderId, frames[addIdx2], delay2).then(function() {
            addIdx2++;
            var pct = 80 + Math.round((addIdx2 / frames.length) * 10);
            barEl.style.width = pct + '%';
            addMP4Frame();
          }).then(null, function() {
            statusExport.textContent = 'Failed to encode frame';
          });
        }

        addMP4Frame();
      }).then(null, function() {
        statusExport.textContent = 'Failed to create encoder';
      });
    }
  }

  // ── Init ──
  initTimeline();
  renderClipList();
  updateTimeDisplay(0);

  prvctice.onDispose(function() {
    stopPlayback();
    // Unload video players
    var keys = Object.keys(videoPlayers);
    for (var k = 0; k < keys.length; k++) {
      prvctice.video.unload(videoPlayers[keys[k]].playerId).then(null, function() {});
    }
    videoPlayers = {};
    if (timeline) {
      timeline.dispose();
      timeline = null;
    }
  });
});
</script>
</body>
</html>`;
