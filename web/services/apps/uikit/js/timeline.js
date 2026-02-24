/**
 * prvctice UI Kit — Timeline
 * DAW-style timeline with ruler, lanes, draggable/resizable clips,
 * playhead, zoom (scroll/pinch/slider), and snap-to-grid.
 * Events-only architecture: emits callbacks, does not handle playback.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Create a DAW-style timeline controller.
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {number} [opts.duration] - Total duration in seconds (default 60)
   * @param {Array<{id, label, color?}>} [opts.lanes] - Lane definitions
   * @param {Array<{id, laneId, start, duration, label?, type?}>} [opts.clips] - Initial clips
   * @param {boolean} [opts.snap] - Enable snap-to-grid (default true)
   * @param {number} [opts.snapInterval] - Snap interval in seconds (default 1)
   * @param {number} [opts.zoom] - Initial zoom (default 1)
   * @param {number} [opts.minZoom] - Min zoom (default 0.1)
   * @param {number} [opts.maxZoom] - Max zoom (default 50)
   * @param {function} [opts.onPlay] - cb(position)
   * @param {function} [opts.onPause] - cb(position)
   * @param {function} [opts.onSeek] - cb(position)
   * @param {function} [opts.onClipMove] - cb({clipId, laneId, start, duration})
   * @param {function} [opts.onClipSelect] - cb(clipId)
   * @param {function} [opts.onClipAdd] - cb({laneId, start})
   * @param {function} [opts.onZoom] - cb(level)
   * @returns {object} Timeline control handle
   */
  function timelineComponent(container, opts) {
    if (!opts) opts = {};
    var duration = opts.duration || 60;
    var lanes = opts.lanes || [{ id: 'default', label: 'Track 1' }];
    var clips = [];
    var snapEnabled = opts.snap !== false;
    var snapInterval = opts.snapInterval || 1;
    var zoom = opts.zoom || 1;
    var minZoom = opts.minZoom || 0.1;
    var maxZoom = opts.maxZoom || 50;
    var playheadTime = 0;
    var playing = false;
    var selectedClipId = null;

    // Callbacks
    var onPlay = opts.onPlay || function () {};
    var onPause = opts.onPause || function () {};
    var onSeek = opts.onSeek || function () {};
    var onClipMove = opts.onClipMove || function () {};
    var onClipSelect = opts.onClipSelect || function () {};
    var onClipAdd = opts.onClipAdd || function () {};
    var onZoom = opts.onZoom || function () {};

    // Copy initial clips
    if (opts.clips) {
      for (var ci = 0; ci < opts.clips.length; ci++) {
        var c = opts.clips[ci];
        clips.push({
          id: c.id,
          laneId: c.laneId,
          start: c.start,
          duration: c.duration,
          label: c.label || '',
          type: c.type || '',
        });
      }
    }

    // ==================== DOM CONSTRUCTION ====================

    var tlEl = document.createElement('div');
    tlEl.className = 'p-timeline';

    // Header
    var headerEl = document.createElement('div');
    headerEl.className = 'p-timeline-header';

    var playBtn = document.createElement('button');
    playBtn.className = 'p-timeline-play-btn';
    playBtn.textContent = '>';
    headerEl.appendChild(playBtn);

    var timeDisplay = document.createElement('span');
    timeDisplay.className = 'p-timeline-time';
    timeDisplay.textContent = '0:00.00';
    headerEl.appendChild(timeDisplay);

    var zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    zoomSlider.className = 'p-timeline-zoom p-slider';
    zoomSlider.min = String(minZoom * 100);
    zoomSlider.max = String(maxZoom * 100);
    zoomSlider.value = String(zoom * 100);
    zoomSlider.step = '1';
    headerEl.appendChild(zoomSlider);

    tlEl.appendChild(headerEl);

    // Body
    var bodyEl = document.createElement('div');
    bodyEl.className = 'p-timeline-body';

    // Sidebar (lane labels)
    var sidebarEl = document.createElement('div');
    sidebarEl.className = 'p-timeline-sidebar';

    // Ruler offset spacer in sidebar
    var sidebarSpacer = document.createElement('div');
    sidebarSpacer.style.height = '24px';
    sidebarSpacer.style.flexShrink = '0';
    sidebarSpacer.style.borderBottom = '1px solid var(--p-border)';
    sidebarEl.appendChild(sidebarSpacer);

    for (var li = 0; li < lanes.length; li++) {
      var laneLabel = document.createElement('div');
      laneLabel.className = 'p-timeline-sidebar-lane';
      laneLabel.textContent = lanes[li].label || lanes[li].id;
      sidebarEl.appendChild(laneLabel);
    }
    bodyEl.appendChild(sidebarEl);

    // Scrollable area
    var scrollEl = document.createElement('div');
    scrollEl.className = 'p-timeline-scroll';

    // Inner content (sized to duration * pixelsPerSecond)
    var contentEl = document.createElement('div');
    contentEl.style.position = 'relative';
    contentEl.style.minHeight = '100%';

    // Ruler
    var rulerEl = document.createElement('div');
    rulerEl.className = 'p-timeline-ruler';
    contentEl.appendChild(rulerEl);

    // Lanes container
    var lanesEl = document.createElement('div');
    lanesEl.className = 'p-timeline-lanes';

    var laneEls = {};
    for (var li2 = 0; li2 < lanes.length; li2++) {
      var laneEl = document.createElement('div');
      laneEl.className = 'p-timeline-lane';
      laneEl.dataset.laneId = lanes[li2].id;
      lanesEl.appendChild(laneEl);
      laneEls[lanes[li2].id] = laneEl;
    }
    contentEl.appendChild(lanesEl);

    // Playhead
    var playheadEl = document.createElement('div');
    playheadEl.className = 'p-timeline-playhead';
    playheadEl.style.left = '0px';
    contentEl.appendChild(playheadEl);

    scrollEl.appendChild(contentEl);
    bodyEl.appendChild(scrollEl);
    tlEl.appendChild(bodyEl);
    container.appendChild(tlEl);

    // ==================== LAYOUT CALCULATIONS ====================

    function getScrollWidth() {
      return scrollEl.getBoundingClientRect().width || 400;
    }

    function getPixelsPerSecond() {
      return (getScrollWidth() * zoom) / duration;
    }

    function getContentWidth() {
      return duration * getPixelsPerSecond();
    }

    function snapTime(t) {
      if (!snapEnabled) return t;
      return Math.round(t / snapInterval) * snapInterval;
    }

    // ==================== FORMAT TIME ====================

    function formatTime(seconds) {
      var mins = Math.floor(seconds / 60);
      var secs = seconds - mins * 60;
      var whole = Math.floor(secs);
      var frac = Math.floor((secs - whole) * 100);
      var pad = whole < 10 ? '0' : '';
      var fracPad = frac < 10 ? '0' : '';
      return mins + ':' + pad + whole + '.' + fracPad + frac;
    }

    // ==================== RENDER ====================

    function renderRuler() {
      rulerEl.innerHTML = '';
      var pps = getPixelsPerSecond();
      var contentW = getContentWidth();
      contentEl.style.width = contentW + 'px';

      // Adaptive interval: aim for markers every ~80-120px
      var targetPx = 100;
      var rawInterval = targetPx / pps;
      var intervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
      var markerInterval = intervals[intervals.length - 1];
      for (var ii = 0; ii < intervals.length; ii++) {
        if (intervals[ii] * pps >= 40) {
          markerInterval = intervals[ii];
          break;
        }
      }

      for (var t = 0; t <= duration; t += markerInterval) {
        var x = t * pps;
        var mark = document.createElement('div');
        mark.className = 'p-timeline-ruler-mark';
        mark.style.left = x + 'px';
        rulerEl.appendChild(mark);

        var lbl = document.createElement('span');
        lbl.className = 'p-timeline-ruler-label';
        lbl.style.left = x + 'px';
        lbl.textContent = formatTime(t);
        rulerEl.appendChild(lbl);
      }
    }

    function renderClips() {
      // Remove existing clip elements
      var existingClips = contentEl.querySelectorAll('.p-timeline-clip');
      for (var ec = 0; ec < existingClips.length; ec++) {
        existingClips[ec].parentNode.removeChild(existingClips[ec]);
      }

      var pps = getPixelsPerSecond();

      for (var i = 0; i < clips.length; i++) {
        var clip = clips[i];
        var laneEl = laneEls[clip.laneId];
        if (!laneEl) continue;

        var clipEl = document.createElement('div');
        clipEl.className = 'p-timeline-clip';
        clipEl.dataset.clipId = clip.id;
        if (clip.type) clipEl.dataset.type = clip.type;
        if (clip.id === selectedClipId) clipEl.classList.add('selected');

        clipEl.style.transform = 'translateX(' + clip.start * pps + 'px)';
        clipEl.style.width = clip.duration * pps + 'px';

        // Left handle
        var handleL = document.createElement('div');
        handleL.className = 'p-timeline-clip-handle left';
        clipEl.appendChild(handleL);

        // Label
        var labelEl = document.createElement('span');
        labelEl.className = 'p-timeline-clip-label';
        labelEl.textContent = clip.label;
        clipEl.appendChild(labelEl);

        // Right handle
        var handleR = document.createElement('div');
        handleR.className = 'p-timeline-clip-handle right';
        clipEl.appendChild(handleR);

        laneEl.appendChild(clipEl);
      }
    }

    function renderPlayhead() {
      var pps = getPixelsPerSecond();
      playheadEl.style.left = playheadTime * pps + 'px';
    }

    function updateTimeDisplay() {
      timeDisplay.textContent = formatTime(playheadTime);
    }

    function renderAll() {
      renderRuler();
      renderClips();
      renderPlayhead();
      updateTimeDisplay();
    }

    // ==================== CLIP INTERACTION ====================

    var dragState = null; // { clipId, mode: 'move'|'resize-left'|'resize-right', startX, origStart, origDuration }

    function findClip(id) {
      for (var i = 0; i < clips.length; i++) {
        if (clips[i].id === id) return clips[i];
      }
      return null;
    }

    function onClipPointerDown(e) {
      var clipEl = e.target.closest('.p-timeline-clip');
      if (!clipEl) return;
      e.preventDefault();
      e.stopPropagation();

      var clipId = clipEl.dataset.clipId;
      var clip = findClip(clipId);
      if (!clip) return;

      // Select
      selectedClipId = clipId;
      onClipSelect(clipId);

      // Determine mode
      var mode = 'move';
      if (e.target.classList.contains('p-timeline-clip-handle')) {
        mode = e.target.classList.contains('left') ? 'resize-left' : 'resize-right';
      }

      dragState = {
        clipId: clipId,
        mode: mode,
        startX: e.clientX,
        origStart: clip.start,
        origDuration: clip.duration,
        origLaneId: clip.laneId,
      };

      clipEl.classList.add('p-timeline-clip--dragging');
      clipEl.style.willChange = 'transform';

      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragUp);
    }

    function onDragMove(e) {
      if (!dragState) return;
      e.preventDefault();
      var pps = getPixelsPerSecond();
      var dx = e.clientX - dragState.startX;
      var dtSeconds = dx / pps;
      var clip = findClip(dragState.clipId);
      if (!clip) return;

      if (dragState.mode === 'move') {
        var newStart = snapTime(Math.max(0, dragState.origStart + dtSeconds));
        clip.start = newStart;
      } else if (dragState.mode === 'resize-left') {
        var newStart2 = snapTime(Math.max(0, dragState.origStart + dtSeconds));
        var endTime = dragState.origStart + dragState.origDuration;
        var newDur = endTime - newStart2;
        if (newDur > 0.01) {
          clip.start = newStart2;
          clip.duration = newDur;
        }
      } else if (dragState.mode === 'resize-right') {
        var newDur2 = snapTime(Math.max(0.01, dragState.origDuration + dtSeconds));
        clip.duration = newDur2;
      }

      renderClips();
    }

    function onDragUp(e) {
      if (!dragState) return;
      var clip = findClip(dragState.clipId);
      var clipEl = contentEl.querySelector('[data-clip-id="' + dragState.clipId + '"]');
      if (clipEl) {
        clipEl.classList.remove('p-timeline-clip--dragging');
        clipEl.style.willChange = '';
      }

      if (clip) {
        onClipMove({
          clipId: clip.id,
          laneId: clip.laneId,
          start: clip.start,
          duration: clip.duration,
        });
      }

      dragState = null;
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragUp);
    }

    lanesEl.addEventListener('pointerdown', onClipPointerDown);

    // Double-click on empty lane area to add clip
    lanesEl.addEventListener('dblclick', function (e) {
      var laneEl = e.target.closest('.p-timeline-lane');
      if (!laneEl) return;
      if (e.target.closest('.p-timeline-clip')) return; // clicked a clip, not empty area

      var pps = getPixelsPerSecond();
      var rect = laneEl.getBoundingClientRect();
      var scrollLeft = scrollEl.scrollLeft;
      var x = e.clientX - rect.left + scrollLeft;
      var time = snapTime(x / pps);
      onClipAdd({ laneId: laneEl.dataset.laneId, start: time });
    });

    // ==================== RULER INTERACTION ====================

    rulerEl.addEventListener('click', function (e) {
      var pps = getPixelsPerSecond();
      var rect = rulerEl.getBoundingClientRect();
      var scrollLeft = scrollEl.scrollLeft;
      var x = e.clientX - rect.left + scrollLeft;
      var time = Math.max(0, Math.min(duration, x / pps));
      playheadTime = time;
      renderPlayhead();
      updateTimeDisplay();
      onSeek(time);
    });

    // ==================== PLAYHEAD DRAG ====================

    var playheadDragging = false;

    playheadEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      playheadDragging = true;
      document.addEventListener('pointermove', onPlayheadMove);
      document.addEventListener('pointerup', onPlayheadUp);
    });

    function onPlayheadMove(e) {
      if (!playheadDragging) return;
      e.preventDefault();
      var pps = getPixelsPerSecond();
      var rect = contentEl.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var time = Math.max(0, Math.min(duration, x / pps));
      playheadTime = time;
      renderPlayhead();
      updateTimeDisplay();
      onSeek(time);
    }

    function onPlayheadUp() {
      playheadDragging = false;
      document.removeEventListener('pointermove', onPlayheadMove);
      document.removeEventListener('pointerup', onPlayheadUp);
    }

    // ==================== PLAY/PAUSE ====================

    playBtn.addEventListener('click', function () {
      if (playing) {
        playing = false;
        playBtn.textContent = '>';
        onPause(playheadTime);
      } else {
        playing = true;
        playBtn.textContent = '||';
        onPlay(playheadTime);
      }
    });

    // Double-click timeline body to toggle play/pause
    contentEl.addEventListener('dblclick', function (e) {
      if (e.target.closest('.p-timeline-clip') || e.target.closest('.p-timeline-lane')) return;
      if (playing) {
        playing = false;
        playBtn.textContent = '>';
        onPause(playheadTime);
      } else {
        playing = true;
        playBtn.textContent = '||';
        onPlay(playheadTime);
      }
    });

    // ==================== ZOOM ====================

    function setZoomLevel(level) {
      zoom = Math.max(minZoom, Math.min(maxZoom, level));
      zoomSlider.value = String(Math.round(zoom * 100));
      renderAll();
      onZoom(zoom);
    }

    zoomSlider.addEventListener('input', function () {
      var val = parseFloat(zoomSlider.value) / 100;
      setZoomLevel(val);
    });

    // Wheel zoom
    scrollEl.addEventListener(
      'wheel',
      function (e) {
        // Only zoom if Ctrl/Meta is held, otherwise allow normal scroll
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        var factor = e.deltaY < 0 ? 1.15 : 0.87;
        setZoomLevel(zoom * factor);
      },
      { passive: false }
    );

    // Pinch zoom (two-touch)
    var pinchState = null;

    scrollEl.addEventListener(
      'touchstart',
      function (e) {
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          pinchState = {
            dist: Math.sqrt(dx * dx + dy * dy),
            zoom: zoom,
          };
        }
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      'touchmove',
      function (e) {
        if (pinchState && e.touches.length === 2) {
          e.preventDefault();
          var dx = e.touches[0].clientX - e.touches[1].clientX;
          var dy = e.touches[0].clientY - e.touches[1].clientY;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var ratio = dist / pinchState.dist;
          setZoomLevel(pinchState.zoom * ratio);
        }
      },
      { passive: false }
    );

    scrollEl.addEventListener(
      'touchend',
      function () {
        pinchState = null;
      },
      { passive: true }
    );

    // ==================== INITIAL RENDER ====================

    renderAll();

    // ==================== PUBLIC API ====================

    return {
      setPlayhead: function (time) {
        playheadTime = Math.max(0, Math.min(duration, time));
        renderPlayhead();
        updateTimeDisplay();
      },
      getPlayhead: function () {
        return playheadTime;
      },
      addClip: function (clip) {
        clips.push({
          id: clip.id,
          laneId: clip.laneId,
          start: clip.start,
          duration: clip.duration,
          label: clip.label || '',
          type: clip.type || '',
        });
        renderClips();
      },
      removeClip: function (clipId) {
        for (var i = 0; i < clips.length; i++) {
          if (clips[i].id === clipId) {
            clips.splice(i, 1);
            break;
          }
        }
        if (selectedClipId === clipId) selectedClipId = null;
        renderClips();
      },
      updateClip: function (clipId, props) {
        var clip = findClip(clipId);
        if (!clip) return;
        if (typeof props.start === 'number') clip.start = props.start;
        if (typeof props.duration === 'number') clip.duration = props.duration;
        if (props.label !== undefined) clip.label = props.label;
        if (props.type !== undefined) clip.type = props.type;
        if (props.laneId !== undefined) clip.laneId = props.laneId;
        renderClips();
      },
      getClips: function () {
        var result = [];
        for (var i = 0; i < clips.length; i++) {
          var cl = clips[i];
          result.push({
            id: cl.id,
            laneId: cl.laneId,
            start: cl.start,
            duration: cl.duration,
            label: cl.label,
            type: cl.type,
          });
        }
        return result;
      },
      setZoom: function (level) {
        setZoomLevel(level);
      },
      getZoom: function () {
        return zoom;
      },
      setSnap: function (enabled, interval) {
        snapEnabled = enabled;
        if (typeof interval === 'number') snapInterval = interval;
      },
      setDuration: function (seconds) {
        duration = seconds;
        renderAll();
      },
      dispose: function () {
        lanesEl.removeEventListener('pointerdown', onClipPointerDown);
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragUp);
        document.removeEventListener('pointermove', onPlayheadMove);
        document.removeEventListener('pointerup', onPlayheadUp);
        if (tlEl.parentNode) tlEl.parentNode.removeChild(tlEl);
      },
    };
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.ui) {
      window.prvctice.ui.timeline = timelineComponent;
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
