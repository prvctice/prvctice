/**
 * Photo Booth HTML Build
 *
 * Real-time camera filter preview, countdown capture with flash + shutter sound,
 * burst grids (2x2, 3x3, 1x4 strip), gallery view via router, GIF export from
 * selected gallery photos.
 * Loaded lazily by the photo-booth config via dynamic import.
 */

export const PHOTO_BOOTH_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Layout ── */
.pb-wrap {
  display: flex; flex-direction: column; height: 100%; gap: 0;
  font-family: var(--p-font-mono); color: var(--p-text);
}

/* ── Camera View ── */
.pb-camera-area {
  flex: 1; min-height: 0; position: relative; overflow: hidden;
  background: var(--p-surface); display: flex; align-items: center; justify-content: center;
}
.pb-feed-canvas {
  max-width: 100%; max-height: 100%; display: block;
  image-rendering: auto;
}
.pb-flash {
  position: absolute; inset: 0; background: #fff; opacity: 0;
  pointer-events: none; transition: opacity 0.05s ease;
  z-index: 10;
}
.pb-flash.active { opacity: 0.9; }
.pb-countdown {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; font-size: 64px; font-weight: 700;
  color: var(--p-accent-amber); text-shadow: 0 0 20px rgba(255,107,43,0.5);
  pointer-events: none; z-index: 5; opacity: 0;
  transition: opacity 0.15s ease;
}
.pb-countdown.visible { opacity: 1; }
.pb-no-camera {
  text-align: center; color: var(--p-text-muted); font-size: 11px;
  padding: 20px;
}

/* ── Filter Bar ── */
.pb-filter-bar {
  display: flex; gap: 4px; padding: 6px 8px; overflow-x: auto;
  background: var(--p-surface); border-top: 1px solid var(--p-border);
  flex-shrink: 0;
}
.pb-filter-btn {
  all: unset; cursor: pointer; padding: 4px 10px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--p-text-muted); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-pill); white-space: nowrap;
  transition: all 100ms ease;
}
.pb-filter-btn:hover { color: var(--p-text); background: var(--p-surface-raised); }
.pb-filter-btn.active {
  color: var(--p-accent-blue); border-color: var(--p-accent-blue);
  background: rgba(68,136,255,0.08);
}

/* ── Controls ── */
.pb-controls {
  display: flex; align-items: center; gap: 6px; padding: 8px;
  background: var(--p-surface); border-top: 1px solid var(--p-border);
  flex-shrink: 0;
}
.pb-capture-btn {
  all: unset; cursor: pointer; width: 44px; height: 44px;
  border-radius: 50%; border: 3px solid var(--p-accent-blue);
  background: transparent; display: flex; align-items: center; justify-content: center;
  transition: all 120ms ease; flex-shrink: 0;
}
.pb-capture-btn:hover { background: rgba(68,136,255,0.15); }
.pb-capture-btn:active { transform: scale(0.92); }
.pb-capture-inner {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--p-accent-blue);
  transition: transform 100ms ease;
}
.pb-capture-btn:active .pb-capture-inner { transform: scale(0.85); }
.pb-mode-select {
  display: flex; gap: 3px;
}
.pb-mode-btn {
  all: unset; cursor: pointer; padding: 4px 8px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  text-transform: uppercase; color: var(--p-text-muted);
  border: 1px solid var(--p-border); border-radius: var(--p-radius-sm);
  transition: all 100ms ease;
}
.pb-mode-btn:hover { color: var(--p-text); }
.pb-mode-btn.active {
  color: var(--p-accent-green); border-color: var(--p-accent-green);
  background: rgba(46,125,66,0.08);
}
.pb-gallery-btn {
  all: unset; cursor: pointer; margin-left: auto;
  padding: 4px 10px; font-size: 9px; font-family: var(--p-font-mono);
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--p-text-muted); border: 1px solid var(--p-border);
  border-radius: var(--p-radius-pill); transition: all 100ms ease;
}
.pb-gallery-btn:hover { color: var(--p-text); background: var(--p-surface-raised); }
.pb-photo-count {
  font-size: 9px; color: var(--p-text-muted); font-family: var(--p-font-mono);
}

/* ── Gallery View ── */
.pb-gallery {
  display: flex; flex-direction: column; height: 100%; gap: 0;
}
.pb-gallery-header {
  display: flex; align-items: center; gap: 8px; padding: 8px;
  background: var(--p-surface); border-bottom: 1px solid var(--p-border);
  flex-shrink: 0;
}
.pb-back-btn {
  all: unset; cursor: pointer; padding: 4px 10px;
  font-size: 9px; font-family: var(--p-font-mono); font-weight: 600;
  text-transform: uppercase; color: var(--p-text-muted);
  border: 1px solid var(--p-border); border-radius: var(--p-radius-pill);
  transition: all 100ms ease;
}
.pb-back-btn:hover { color: var(--p-text); background: var(--p-surface-raised); }
.pb-gallery-title {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--p-text);
}
.pb-gallery-actions {
  margin-left: auto; display: flex; gap: 4px;
}
.pb-gallery-grid {
  flex: 1; min-height: 0; overflow-y: auto; padding: 8px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px; align-content: start;
}
.pb-thumb {
  aspect-ratio: 1; border-radius: var(--p-radius-md); overflow: hidden;
  cursor: pointer; position: relative; border: 2px solid transparent;
  transition: border-color 100ms ease;
}
.pb-thumb:hover { border-color: var(--p-accent-blue); }
.pb-thumb.selected { border-color: var(--p-accent-amber); }
.pb-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.pb-thumb-check {
  position: absolute; top: 4px; right: 4px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--p-accent-amber);
  display: none; align-items: center; justify-content: center;
  font-size: 10px; color: #000; font-weight: 700;
}
.pb-thumb.selected .pb-thumb-check { display: flex; }

/* ── Burst Preview ── */
.pb-burst-preview {
  position: absolute; inset: 0; display: grid; gap: 2px; z-index: 8;
  pointer-events: none; padding: 4px;
}
.pb-burst-preview img {
  width: 100%; height: 100%; object-fit: cover;
  border-radius: var(--p-radius-sm);
}
.pb-burst-2x2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.pb-burst-3x3 { grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
.pb-burst-1x4 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr 1fr 1fr; }

/* ── Footer Status ── */
.pb-status {
  font-size: 9px; color: var(--p-text-muted); padding: 4px 8px;
  text-align: center; font-family: var(--p-font-mono);
  border-top: 1px solid var(--p-border); flex-shrink: 0;
}
</style>
</head>
<body>
<div class="pb-wrap">
  <!-- Camera View -->
  <div id="cameraView" data-view="camera" style="display:flex;flex-direction:column;height:100%">
    <div class="pb-camera-area">
      <canvas id="feedCanvas" class="pb-feed-canvas" width="640" height="480"></canvas>
      <div id="flash" class="pb-flash"></div>
      <div id="countdown" class="pb-countdown"></div>
      <div id="noCam" class="pb-no-camera" style="display:none">
        Camera not available. Grant camera permission to use Photo Booth.
      </div>
      <div id="burstPreview" class="pb-burst-preview" style="display:none"></div>
    </div>
    <div class="pb-filter-bar" id="filterBar"></div>
    <div class="pb-controls">
      <div class="pb-mode-select" id="modeSelect"></div>
      <button class="pb-capture-btn" id="captureBtn"><div class="pb-capture-inner"></div></button>
      <span class="pb-photo-count" id="photoCount">0 photos</span>
      <button class="pb-gallery-btn" id="galleryBtn">Gallery</button>
    </div>
    <div class="pb-status" id="status">Starting camera...</div>
  </div>

  <!-- Gallery View -->
  <div id="galleryView" data-view="gallery" style="display:none;flex-direction:column;height:100%">
    <div class="pb-gallery-header">
      <button class="pb-back-btn" id="backBtn">Back</button>
      <span class="pb-gallery-title">Gallery</span>
      <div class="pb-gallery-actions">
        <button class="pb-back-btn" id="selectAllBtn">Select All</button>
        <button class="pb-back-btn" id="saveBtn">Export</button>
        <button class="pb-back-btn" id="gifBtn">Create GIF</button>
        <button class="pb-back-btn" id="deleteBtn">Delete</button>
      </div>
    </div>
    <div class="pb-gallery-grid" id="galleryGrid"></div>
    <div class="pb-status" id="galleryStatus">No photos yet</div>
  </div>
</div>

<script>
prvctice.onReady(function() {
  var feedCanvas = document.getElementById('feedCanvas');
  var feedCtx = feedCanvas.getContext('2d');
  var flashEl = document.getElementById('flash');
  var countdownEl = document.getElementById('countdown');
  var noCamEl = document.getElementById('noCam');
  var burstPreview = document.getElementById('burstPreview');
  var filterBar = document.getElementById('filterBar');
  var modeSelect = document.getElementById('modeSelect');
  var captureBtn = document.getElementById('captureBtn');
  var photoCountEl = document.getElementById('photoCount');
  var galleryBtn = document.getElementById('galleryBtn');
  var statusEl = document.getElementById('status');
  var cameraView = document.getElementById('cameraView');
  var galleryView = document.getElementById('galleryView');
  var backBtn = document.getElementById('backBtn');
  var selectAllBtn = document.getElementById('selectAllBtn');
  var saveBtn = document.getElementById('saveBtn');
  var gifBtn = document.getElementById('gifBtn');
  var deleteBtn = document.getElementById('deleteBtn');
  var galleryGrid = document.getElementById('galleryGrid');
  var galleryStatus = document.getElementById('galleryStatus');

  // ── State ──
  // Each entry: { vfsId, thumbId, dataUri, thumbUri, timestamp, filter }
  // dataUri and thumbUri are null until needed (lazy-loaded from VFS)
  var photos = [];
  var selectedPhotos = {}; // Set by index
  var currentFilter = 'none';
  var currentMode = 'single'; // single | 2x2 | 3x3 | 1x4
  var cameraRunning = false;
  var capturing = false;
  var frameUnsub = null;
  var currentView = 'camera';

  // ── Filters ──
  var FILTERS = [
    { id: 'none', label: 'None' },
    { id: 'grayscale', label: 'B/W' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'invert', label: 'Invert' },
    { id: 'posterize', label: 'Poster' },
    { id: 'emboss', label: 'Emboss' },
    { id: 'vignette', label: 'Vignette' },
    { id: 'contrast', label: 'Hi-Con' },
    { id: 'blur', label: 'Soft' }
  ];

  // ── Modes ──
  var MODES = [
    { id: 'single', label: '1x' },
    { id: '2x2', label: '2x2' },
    { id: '3x3', label: '3x3' },
    { id: '1x4', label: '1x4' }
  ];

  // ── Build Filter Bar ──
  function buildFilterBar() {
    filterBar.innerHTML = '';
    for (var i = 0; i < FILTERS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'pb-filter-btn' + (FILTERS[i].id === currentFilter ? ' active' : '');
      btn.textContent = FILTERS[i].label;
      btn.dataset.filterId = FILTERS[i].id;
      filterBar.appendChild(btn);
    }
  }

  filterBar.addEventListener('click', function(e) {
    var btn = e.target.closest('.pb-filter-btn');
    if (!btn) return;
    currentFilter = btn.dataset.filterId;
    var btns = filterBar.querySelectorAll('.pb-filter-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.filterId === currentFilter);
    }
  });

  // ── Build Mode Select ──
  function buildModeSelect() {
    modeSelect.innerHTML = '';
    for (var i = 0; i < MODES.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'pb-mode-btn' + (MODES[i].id === currentMode ? ' active' : '');
      btn.textContent = MODES[i].label;
      btn.dataset.modeId = MODES[i].id;
      modeSelect.appendChild(btn);
    }
  }

  modeSelect.addEventListener('click', function(e) {
    var btn = e.target.closest('.pb-mode-btn');
    if (!btn) return;
    currentMode = btn.dataset.modeId;
    var btns = modeSelect.querySelectorAll('.pb-mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.modeId === currentMode);
    }
  });

  // ── Apply Filter to Canvas ──
  function applyFilter(canvas) {
    if (currentFilter === 'none' || !prvctice.image) return canvas;

    var filterMap = {
      grayscale: function(c) { return prvctice.image.grayscale(c); },
      sepia: function(c) { return prvctice.image.sepia(c); },
      invert: function(c) { return prvctice.image.invert(c); },
      posterize: function(c) { return prvctice.image.posterize(c, { levels: 6 }); },
      emboss: function(c) { return prvctice.image.emboss(c); },
      vignette: function(c) { return prvctice.image.vignette(c, { radius: 0.3, amount: 0.8 }); },
      contrast: function(c) { return prvctice.image.contrast(c, { value: 0.4 }); },
      blur: function(c) { return prvctice.image.blur(c, { radius: 3 }); }
    };

    var fn = filterMap[currentFilter];
    if (fn) return fn(canvas);
    return canvas;
  }

  // ── Camera Frame Handler ──
  function onFrame(dataUri, meta) {
    if (!dataUri) return;
    var img = new Image();
    img.onload = function() {
      feedCanvas.width = img.naturalWidth;
      feedCanvas.height = img.naturalHeight;
      feedCtx.save();
      feedCtx.scale(-1, 1);
      feedCtx.drawImage(img, -feedCanvas.width, 0);
      feedCtx.restore();
      var filtered = applyFilter(feedCanvas);
      if (filtered !== feedCanvas) {
        feedCtx.clearRect(0, 0, feedCanvas.width, feedCanvas.height);
        feedCtx.drawImage(filtered, 0, 0);
      }
    };
    img.src = dataUri;
  }

  // ── Start Camera ──
  function startCamera() {
    prvctice.camera.start({ resolution: 'high', fps: 15 }).then(function() {
      cameraRunning = true;
      noCamEl.style.display = 'none';
      statusEl.textContent = 'Camera active';
      frameUnsub = prvctice.camera.onFrame(onFrame);
    }).then(null, function(err) {
      noCamEl.style.display = 'block';
      statusEl.textContent = 'Camera error: ' + (err.message || err);
    });
  }

  // ── Shutter Sound ──
  function playShutter() {
    if (!prvctice.audio || !prvctice.audio.tone) return;
    try {
      prvctice.audio.tone({ frequency: 1200, duration: 0.05, type: 'square', volume: 0.15 });
      setTimeout(function() {
        prvctice.audio.tone({ frequency: 800, duration: 0.03, type: 'square', volume: 0.1 });
      }, 60);
    } catch(e) { /* ignore audio errors */ }
  }

  // ── Flash Effect ──
  function triggerFlash() {
    flashEl.classList.add('active');
    setTimeout(function() { flashEl.classList.remove('active'); }, 120);
  }

  // ── Capture Single Photo ──
  function capturePhoto() {
    var c = document.createElement('canvas');
    c.width = feedCanvas.width;
    c.height = feedCanvas.height;
    var ctx = c.getContext('2d');
    ctx.drawImage(feedCanvas, 0, 0);
    var dataUri = c.toDataURL('image/png');
    var ts = Date.now();

    var entry = { vfsId: null, thumbId: null, dataUri: dataUri, thumbUri: null, timestamp: ts, filter: currentFilter };
    photos.push(entry);
    updatePhotoCount();

    // Auto-save to VFS with 400px thumbnail
    var base64 = dataUri.split(',')[1];
    var filename = 'photo-' + new Date(ts).toISOString().replace(/[:.]/g, '-') + '.png';
    var thumb = document.createElement('canvas');
    thumb.width = 400;
    thumb.height = Math.round(400 * c.height / c.width);
    thumb.getContext('2d').drawImage(c, 0, 0, thumb.width, thumb.height);
    var thumbBase64 = thumb.toDataURL('image/jpeg', 0.85).split(',')[1];
    var thumbUri = thumb.toDataURL('image/jpeg', 0.85);
    entry.thumbUri = thumbUri;

    prvctice.fs.saveBlob(base64, 'image/png', filename, thumbBase64).then(function(result) {
      entry.vfsId = result.id;
      entry.thumbId = result.thumbnailId;
    }).then(null, function() { /* silent */ });

    return dataUri;
  }

  // ── Countdown then Capture ──
  function countdownCapture(cb) {
    if (capturing) return;
    capturing = true;
    var count = 3;
    countdownEl.textContent = String(count);
    countdownEl.classList.add('visible');

    var tick = setInterval(function() {
      count--;
      if (count > 0) {
        countdownEl.textContent = String(count);
      } else {
        clearInterval(tick);
        countdownEl.classList.remove('visible');
        playShutter();
        triggerFlash();
        setTimeout(function() {
          cb();
          capturing = false;
        }, 150);
      }
    }, 1000);
  }

  // ── Burst Capture ──
  function burstCapture(count, cb) {
    var results = [];
    var idx = 0;

    function captureNext() {
      if (idx >= count) {
        cb(results);
        return;
      }
      playShutter();
      triggerFlash();
      setTimeout(function() {
        results.push(capturePhoto());
        idx++;
        setTimeout(captureNext, 400);
      }, 150);
    }
    captureNext();
  }

  // ── Show Burst Preview ──
  function showBurstPreview(uris, mode) {
    burstPreview.innerHTML = '';
    burstPreview.className = 'pb-burst-preview pb-burst-' + mode;
    for (var i = 0; i < uris.length; i++) {
      var img = document.createElement('img');
      img.src = uris[i];
      burstPreview.appendChild(img);
    }
    burstPreview.style.display = 'grid';
    setTimeout(function() {
      burstPreview.style.display = 'none';
    }, 2000);
  }

  // ── Capture Button ──
  captureBtn.addEventListener('click', function() {
    if (!cameraRunning || capturing) return;

    if (currentMode === 'single') {
      countdownCapture(function() {
        capturePhoto();
      });
    } else {
      var countMap = { '2x2': 4, '3x3': 9, '1x4': 4 };
      var total = countMap[currentMode] || 4;
      countdownCapture(function() {
        burstCapture(total, function(uris) {
          showBurstPreview(uris, currentMode);
        });
      });
    }
  });

  // ── Photo Count ──
  function updatePhotoCount() {
    photoCountEl.textContent = photos.length + ' photo' + (photos.length !== 1 ? 's' : '');
  }

  // ── View Navigation ──
  function showView(view) {
    currentView = view;
    cameraView.style.display = view === 'camera' ? 'flex' : 'none';
    galleryView.style.display = view === 'gallery' ? 'flex' : 'none';
    if (view === 'gallery') {
      // Reconcile with VFS before rendering: remove local entries deleted via Files panel
      prvctice.fs.listFiles('image/png,image/gif').then(function(files) {
        var validIds = {};
        for (var i = 0; i < files.length; i++) {
          validIds[files[i].id] = true;
        }
        // Remove entries that have a vfsId but it's no longer in VFS
        for (var j = photos.length - 1; j >= 0; j--) {
          if (photos[j].vfsId && !validIds[photos[j].vfsId]) {
            photos.splice(j, 1);
          }
        }
        updatePhotoCount();
        renderGallery();
      }).then(null, function() {
        // If listFiles fails, render with local cache
        renderGallery();
      });
    }
  }

  galleryBtn.addEventListener('click', function() { showView('gallery'); });
  backBtn.addEventListener('click', function() { showView('camera'); });

  // ── Gallery ──
  function renderGallery() {
    galleryGrid.innerHTML = '';
    selectedPhotos = {};

    if (photos.length === 0) {
      galleryStatus.textContent = 'No photos yet';
      return;
    }

    for (var i = 0; i < photos.length; i++) {
      (function(photo, index) {
        var thumb = document.createElement('div');
        thumb.className = 'pb-thumb';
        thumb.dataset.index = String(index);

        var img = document.createElement('img');

        if (photo.thumbUri) {
          // Already in memory — use directly
          img.src = photo.thumbUri;
        } else if (photo.thumbId) {
          // Has a VFS thumbnail — lazy-load it
          img.src = '';
          prvctice.fs.readAsDataUrl('/blobs/' + photo.thumbId).then(function(url) {
            photo.thumbUri = url;
            img.src = url;
          }).then(null, function() { /* leave blank on error */ });
        }
        // else: no thumbId yet (still saving) — leave src empty

        thumb.appendChild(img);

        var check = document.createElement('div');
        check.className = 'pb-thumb-check';
        check.textContent = '\\u2713';
        thumb.appendChild(check);

        galleryGrid.appendChild(thumb);
      })(photos[i], i);
    }

    galleryStatus.textContent = photos.length + ' photo' + (photos.length !== 1 ? 's' : '');
  }

  galleryGrid.addEventListener('click', function(e) {
    var thumb = e.target.closest('.pb-thumb');
    if (!thumb) return;
    var idx = thumb.dataset.index;
    if (selectedPhotos[idx]) {
      delete selectedPhotos[idx];
      thumb.classList.remove('selected');
    } else {
      selectedPhotos[idx] = true;
      thumb.classList.add('selected');
    }
  });

  selectAllBtn.addEventListener('click', function() {
    var thumbs = galleryGrid.querySelectorAll('.pb-thumb');
    var allSelected = Object.keys(selectedPhotos).length === photos.length;
    selectedPhotos = {};
    for (var i = 0; i < thumbs.length; i++) {
      if (!allSelected) {
        selectedPhotos[String(i)] = true;
        thumbs[i].classList.add('selected');
      } else {
        thumbs[i].classList.remove('selected');
      }
    }
  });

  saveBtn.addEventListener('click', function() {
    var indices = Object.keys(selectedPhotos).map(Number).sort(function(a, b) { return a - b; });
    if (indices.length === 0) {
      prvctice.ui.toast('Select photos to export');
      return;
    }
    galleryStatus.textContent = 'Exporting...';
    var done = 0;
    var total = indices.length;

    function exportPhoto(photo, idx) {
      var filename = 'photo-' + new Date(photo.timestamp).toISOString().replace(/[:.]/g, '-') + '.png';

      function doDownload(dataUri) {
        var base64 = dataUri.split(',')[1];
        prvctice.media.download(base64, filename, 'image/png').then(function() {
          done++;
          if (done === total) galleryStatus.textContent = 'Exported ' + total + ' photo' + (total !== 1 ? 's' : '');
        }).then(null, function() {
          done++;
          if (done === total) galleryStatus.textContent = 'Export failed';
        });
      }

      if (photo.dataUri) {
        doDownload(photo.dataUri);
      } else if (photo.vfsId) {
        prvctice.fs.readAsDataUrl('/blobs/' + photo.vfsId).then(function(url) {
          photo.dataUri = url;
          doDownload(url);
        }).then(null, function() {
          done++;
          if (done === total) galleryStatus.textContent = 'Export failed';
        });
      } else {
        done++;
        if (done === total) galleryStatus.textContent = 'Exported ' + done + ' photo' + (done !== 1 ? 's' : '');
      }
    }

    for (var i = 0; i < total; i++) {
      exportPhoto(photos[indices[i]], i);
    }
  });

  deleteBtn.addEventListener('click', function() {
    var indices = Object.keys(selectedPhotos).map(Number).sort(function(a, b) { return b - a; });
    if (indices.length === 0) return;
    var count = indices.length;
    prvctice.ui.confirm({ message: 'Delete ' + count + ' photo' + (count !== 1 ? 's' : '') + '?' }).then(function(ok) {
      if (!ok) return;
      for (var i = 0; i < indices.length; i++) {
        var photo = photos[indices[i]];
        if (photo.vfsId) {
          prvctice.fs.deleteBlob(photo.vfsId).then(null, function() { /* silent */ });
        }
        photos.splice(indices[i], 1);
      }
      updatePhotoCount();
      renderGallery();
    });
  });

  // ── GIF Export ──
  gifBtn.addEventListener('click', function() {
    var indices = Object.keys(selectedPhotos).map(Number).sort(function(a, b) { return a - b; });
    if (indices.length < 2) {
      prvctice.ui.toast('Select at least 2 photos for GIF');
      return;
    }

    galleryStatus.textContent = 'Creating GIF...';

    // Load dataUri for the first selected photo to determine dimensions
    function getDataUri(photo, cb) {
      if (photo.dataUri) {
        cb(photo.dataUri);
        return;
      }
      if (photo.vfsId) {
        prvctice.fs.readAsDataUrl('/blobs/' + photo.vfsId).then(function(url) {
          photo.dataUri = url;
          cb(url);
        }).then(null, function() { cb(null); });
        return;
      }
      cb(null);
    }

    getDataUri(photos[indices[0]], function(firstDataUri) {
      if (!firstDataUri) {
        galleryStatus.textContent = 'Failed to load photo data';
        return;
      }

      var firstImg = new Image();
      firstImg.onload = function() {
        var w = Math.min(firstImg.naturalWidth, 400);
        var h = Math.round(w * (firstImg.naturalHeight / firstImg.naturalWidth));

        prvctice.gif.create({ width: w, height: h, quality: 'medium' }).then(function(result) {
          var encoderId = result.encoderId;
          var frameIdx = 0;

          function addNextFrame() {
            if (frameIdx >= indices.length) {
              galleryStatus.textContent = 'Encoding GIF...';
              prvctice.gif.finish(encoderId).then(function(gifResult) {
                galleryStatus.textContent = 'GIF created — saving...';
                if (gifResult && gifResult.dataUri) {
                  var base64 = gifResult.dataUri.split(',')[1];
                  var gifName = 'photo-booth-' + new Date().toISOString().replace(/[:.]/g, '-') + '.gif';
                  prvctice.fs.saveBlob(base64, 'image/gif', gifName).then(function() {
                    galleryStatus.textContent = 'GIF saved to Files';
                  }).then(null, function() {
                    galleryStatus.textContent = 'GIF created (save failed)';
                  });
                }
              }).then(null, function(err) {
                galleryStatus.textContent = 'GIF encoding failed: ' + (err && err.message ? err.message : 'unknown error');
              });
              return;
            }

            var photo = photos[indices[frameIdx]];
            getDataUri(photo, function(dataUri) {
              if (!dataUri) {
                galleryStatus.textContent = 'Failed to load frame ' + (frameIdx + 1);
                return;
              }
              prvctice.gif.addFrame(encoderId, dataUri, 500).then(function() {
                frameIdx++;
                galleryStatus.textContent = 'Adding frame ' + frameIdx + '/' + indices.length;
                addNextFrame();
              }).then(null, function() {
                galleryStatus.textContent = 'Failed to add frame';
              });
            });
          }

          addNextFrame();
        }).then(null, function(err) {
          galleryStatus.textContent = 'Failed to create GIF encoder: ' + (err && err.message ? err.message : '');
        });
      };
      firstImg.src = firstDataUri;
    });
  });

  // ── Load Photos from VFS on Init ──
  function loadPhotos() {
    prvctice.fs.listFiles('image/png,image/gif').then(function(files) {
      photos = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        photos.push({
          vfsId: f.id,
          thumbId: f.thumbnailId,
          dataUri: null,
          thumbUri: null,
          timestamp: f.uploadedAt,
          filter: 'none'
        });
      }
      updatePhotoCount();
    }).then(null, function() {
      // If VFS unavailable, start with empty session cache
      photos = [];
      updatePhotoCount();
    });
  }

  // ── Init ──
  buildFilterBar();
  buildModeSelect();
  loadPhotos();
  startCamera();

  prvctice.onDispose(function() {
    if (frameUnsub) frameUnsub();
    if (cameraRunning) {
      prvctice.camera.stop().then(null, function() {});
    }
    // VFS is the source of truth — no local save needed
  });
});
</script>
</body>
</html>`;
