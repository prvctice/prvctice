/**
 * prvctice UI Kit — Audio Buffer
 * Non-destructive audio buffer manipulation: decode, slice, reverse,
 * normalize, fade, mix, pitch shift, and waveform peak extraction.
 * Every function returns a NEW AudioBuffer — originals are never mutated.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  // ==================== INTERNAL HELPERS ====================

  /**
   * Get the shared AudioContext from the audio module.
   * Falls back to creating one directly if audio module not loaded yet.
   */
  function getCtx() {
    if (window.prvctice && window.prvctice.audio && window.prvctice.audio.createContext) {
      return window.prvctice.audio.createContext();
    }
    // Fallback: create directly (should not happen in practice)
    if (!window._prvAudioCtx) {
      window._prvAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return window._prvAudioCtx;
  }

  // ==================== API METHODS ====================

  /**
   * Decode raw audio bytes into an AudioBuffer.
   * @param {ArrayBuffer} arrayBuffer - Raw audio file bytes
   * @returns {Promise<AudioBuffer>}
   */
  function decode(arrayBuffer) {
    var ctx = getCtx();
    return ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Extract a time range from the buffer.
   * @param {AudioBuffer} buffer - Source buffer
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @returns {AudioBuffer} New buffer containing the slice
   */
  function slice(buffer, startTime, endTime) {
    var sr = buffer.sampleRate;
    var channels = buffer.numberOfChannels;
    var startSample = Math.max(0, Math.floor(startTime * sr));
    var endSample = Math.min(buffer.length, Math.ceil(endTime * sr));
    var length = endSample - startSample;
    if (length <= 0) length = 1;
    var ctx = getCtx();
    var newBuf = ctx.createBuffer(channels, length, sr);
    for (var ch = 0; ch < channels; ch++) {
      var src = buffer.getChannelData(ch);
      var dst = newBuf.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        dst[i] = src[startSample + i];
      }
    }
    return newBuf;
  }

  /**
   * Reverse the buffer's audio data.
   * @param {AudioBuffer} buffer - Source buffer
   * @returns {AudioBuffer} New reversed buffer
   */
  function reverse(buffer) {
    var ctx = getCtx();
    var newBuf = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
      var src = buffer.getChannelData(ch);
      var dst = newBuf.getChannelData(ch);
      for (var i = 0; i < buffer.length; i++) {
        dst[i] = src[buffer.length - 1 - i];
      }
    }
    return newBuf;
  }

  /**
   * Normalize to peak amplitude of 1.0.
   * @param {AudioBuffer} buffer - Source buffer
   * @returns {AudioBuffer} New normalized buffer
   */
  function normalize(buffer) {
    var ctx = getCtx();
    var newBuf = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    var max = 0;
    var ch, i;
    for (ch = 0; ch < buffer.numberOfChannels; ch++) {
      var data = buffer.getChannelData(ch);
      for (i = 0; i < data.length; i++) {
        var abs = Math.abs(data[i]);
        if (abs > max) max = abs;
      }
    }
    var scale = max > 0 ? 1.0 / max : 1;
    for (ch = 0; ch < buffer.numberOfChannels; ch++) {
      var src = buffer.getChannelData(ch);
      var dst = newBuf.getChannelData(ch);
      for (i = 0; i < buffer.length; i++) {
        dst[i] = src[i] * scale;
      }
    }
    return newBuf;
  }

  /**
   * Apply fade in or fade out.
   * @param {AudioBuffer} buffer - Source buffer
   * @param {string} type - 'in' or 'out'
   * @param {number} duration - Fade duration in seconds
   * @returns {AudioBuffer} New buffer with fade applied
   */
  function fade(buffer, type, duration) {
    var ctx = getCtx();
    var newBuf = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    var fadeSamples = Math.min(buffer.length, Math.floor(duration * buffer.sampleRate));

    for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
      var src = buffer.getChannelData(ch);
      var dst = newBuf.getChannelData(ch);

      for (var i = 0; i < buffer.length; i++) {
        var gain = 1;
        if (type === 'in' && i < fadeSamples) {
          gain = i / fadeSamples;
        } else if (type === 'out' && i >= buffer.length - fadeSamples) {
          gain = (buffer.length - 1 - i) / fadeSamples;
        }
        dst[i] = src[i] * gain;
      }
    }
    return newBuf;
  }

  /**
   * Mix two buffers together.
   * @param {AudioBuffer} bufferA - First buffer
   * @param {AudioBuffer} bufferB - Second buffer
   * @param {object} [opts]
   * @param {number} [opts.gainA] - Gain for buffer A (default 1.0)
   * @param {number} [opts.gainB] - Gain for buffer B (default 1.0)
   * @param {number} [opts.offset] - Offset in seconds for buffer B start (default 0)
   * @returns {AudioBuffer} New mixed buffer
   */
  function mix(bufferA, bufferB, opts) {
    if (!opts) opts = {};
    var gainA = typeof opts.gainA === 'number' ? opts.gainA : 1;
    var gainB = typeof opts.gainB === 'number' ? opts.gainB : 1;
    var offsetSamples = Math.floor((opts.offset || 0) * bufferA.sampleRate);

    var ctx = getCtx();
    var sr = bufferA.sampleRate;
    var channels = bufferA.numberOfChannels;
    var outLen = Math.max(bufferA.length, offsetSamples + bufferB.length);
    var newBuf = ctx.createBuffer(channels, outLen, sr);

    for (var ch = 0; ch < channels; ch++) {
      var srcA = bufferA.getChannelData(ch);
      var srcB = ch < bufferB.numberOfChannels ? bufferB.getChannelData(ch) : null;
      var dst = newBuf.getChannelData(ch);

      // Write buffer A
      for (var i = 0; i < srcA.length; i++) {
        dst[i] = srcA[i] * gainA;
      }

      // Mix in buffer B at offset
      if (srcB) {
        for (var j = 0; j < srcB.length; j++) {
          var idx = offsetSamples + j;
          if (idx < outLen) {
            dst[idx] = (dst[idx] || 0) + srcB[j] * gainB;
          }
        }
      }
    }
    return newBuf;
  }

  /**
   * Shift pitch by adjusting playback rate via OfflineAudioContext.
   * Note: This changes both pitch AND tempo proportionally.
   * @param {AudioBuffer} buffer - Source buffer
   * @param {number} semitones - Semitones to shift (-12 to 12)
   * @returns {Promise<AudioBuffer>} New pitch-shifted buffer
   */
  function pitchShift(buffer, semitones) {
    // Clamp to one octave each direction
    semitones = Math.max(-12, Math.min(12, semitones));
    var ratio = Math.pow(2, semitones / 12);
    var newLength = Math.round(buffer.length / ratio);
    if (newLength <= 0) newLength = 1;

    var offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, newLength, buffer.sampleRate);

    var source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = ratio;
    source.connect(offlineCtx.destination);
    source.start(0);

    return offlineCtx.startRendering();
  }

  /**
   * Extract pre-computed min/max peaks for waveform visualization.
   * @param {AudioBuffer} buffer - Source buffer
   * @param {number} [resolution] - Number of bins (default 200)
   * @returns {Array<{min: number, max: number}>} Peaks array
   */
  function waveformPeaks(buffer, resolution) {
    resolution = resolution || 200;
    var length = buffer.length;

    // Mix to mono for visualization
    var mono = new Float32Array(length);
    var channels = buffer.numberOfChannels;
    var ch, i;
    for (ch = 0; ch < channels; ch++) {
      var data = buffer.getChannelData(ch);
      for (i = 0; i < length; i++) {
        mono[i] += data[i] / channels;
      }
    }

    var samplesPerBin = length / resolution;
    var peaks = [];
    for (var b = 0; b < resolution; b++) {
      var start = Math.floor(b * samplesPerBin);
      var end = Math.min(Math.floor((b + 1) * samplesPerBin), length);
      var peakMin = 0;
      var peakMax = 0;
      for (var s = start; s < end; s++) {
        if (mono[s] < peakMin) peakMin = mono[s];
        if (mono[s] > peakMax) peakMax = mono[s];
      }
      peaks.push({ min: peakMin, max: peakMax });
    }
    return peaks;
  }

  // ==================== ATTACH TO PRVCTICE NAMESPACE ====================

  function waitForPrvctice() {
    if (window.prvctice && window.prvctice.audio) {
      window.prvctice.audio.buffer = {
        decode: decode,
        slice: slice,
        reverse: reverse,
        normalize: normalize,
        fade: fade,
        mix: mix,
        pitchShift: pitchShift,
        waveformPeaks: waveformPeaks,
      };
    } else {
      setTimeout(waitForPrvctice, 10);
    }
  }

  waitForPrvctice();
})();
