/**
 * prvctice UI Kit — Frame Capture
 * Canvas frame capture utilities for animation sequences,
 * GIF encoding, and frame-by-frame analysis.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  /**
   * Start capturing frames from a canvas element.
   * @param {HTMLCanvasElement} canvas - Source canvas to capture from
   * @param {object} [opts]
   * @param {number} [opts.fps] - Target frames per second (default 30)
   * @param {number} [opts.scale] - Resolution scale factor (default 1.0)
   * @param {number} [opts.maxFrames] - Stop after this many frames (default 300)
   * @param {number} [opts.maxDuration] - Stop after this many ms (default 10000)
   * @param {function} [opts.onFrame] - Callback: onFrame(frameCanvas, {index, timestamp, elapsed})
   * @param {function} [opts.onComplete] - Callback: onComplete({frames, duration, fps})
   * @returns {{ stop(), isRunning(), getFrameCount() }}
   */
  function startCapture(canvas, opts) {
    if (!opts) opts = {};
    var fps = opts.fps || 30;
    var interval = 1000 / fps;
    var scale = typeof opts.scale === 'number' ? opts.scale : 1;
    var maxFrames = opts.maxFrames || 300;
    var maxDuration = opts.maxDuration || 10000;
    var onFrame = opts.onFrame || function () {};
    var onComplete = opts.onComplete || function () {};

    var frameIndex = 0;
    var startTime = performance.now();
    var lastCapture = 0;
    var running = true;
    var rafId = null;
    var completed = false;

    // Pre-compute capture dimensions
    var captureW = Math.max(1, Math.round(canvas.width * scale));
    var captureH = Math.max(1, Math.round(canvas.height * scale));

    function finish(elapsed) {
      if (completed) return;
      completed = true;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      onComplete({
        frames: frameIndex,
        duration: elapsed,
        fps: frameIndex > 0 ? frameIndex / (elapsed / 1000) : 0,
      });
    }

    function tick() {
      if (!running) return;
      var now = performance.now();
      var elapsed = now - startTime;

      // Check limits
      if (frameIndex >= maxFrames || elapsed >= maxDuration) {
        finish(elapsed);
        return;
      }

      // Check if enough time has passed for next frame
      if (now - lastCapture >= interval) {
        lastCapture = now;

        // Capture frame to new canvas
        var frameCanvas = document.createElement('canvas');
        frameCanvas.width = captureW;
        frameCanvas.height = captureH;
        var fctx = frameCanvas.getContext('2d');
        fctx.drawImage(canvas, 0, 0, captureW, captureH);

        onFrame(frameCanvas, {
          index: frameIndex,
          timestamp: now,
          elapsed: elapsed,
        });

        frameIndex++;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    // Return control handle
    return {
      stop: function () {
        if (!running) return;
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        var elapsed = performance.now() - startTime;
        finish(elapsed);
      },
      isRunning: function () {
        return running;
      },
      getFrameCount: function () {
        return frameIndex;
      },
    };
  }

  /**
   * Single-frame convenience capture.
   * @param {HTMLCanvasElement} canvas - Source canvas
   * @param {object} [opts]
   * @param {number} [opts.scale] - Resolution scale factor (default 1.0)
   * @returns {HTMLCanvasElement} New canvas with the captured frame
   */
  function snapshot(canvas, opts) {
    if (!opts) opts = {};
    var scale = typeof opts.scale === 'number' ? opts.scale : 1;
    var w = Math.max(1, Math.round(canvas.width * scale));
    var h = Math.max(1, Math.round(canvas.height * scale));
    var result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    var ctx = result.getContext('2d');
    ctx.drawImage(canvas, 0, 0, w, h);
    return result;
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice) {
      window.prvctice.capture = {
        start: startCapture,
        snapshot: snapshot,
      };
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
