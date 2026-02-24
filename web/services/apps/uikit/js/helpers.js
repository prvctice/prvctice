/**
 * prvctice UI Kit — Helpers
 * Utility functions available as window._pHelpers (internal) for runtime.js.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  function padZero(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  /**
   * Format milliseconds as time string.
   * @param {number} ms - Milliseconds
   * @param {string} [format='mm:ss'] - 'hh:mm:ss', 'mm:ss', or 'mm:ss.cs' (centiseconds)
   * @returns {string}
   */
  function formatTime(ms, format) {
    if (!format) format = 'mm:ss';
    var totalSeconds = Math.max(0, Math.floor(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    if (format === 'hh:mm:ss') {
      return padZero(hours) + ':' + padZero(minutes) + ':' + padZero(seconds);
    }
    if (format === 'mm:ss.cs') {
      var cs = Math.floor((ms % 1000) / 10);
      var totalMin = Math.floor(totalSeconds / 60);
      return padZero(totalMin) + ':' + padZero(seconds) + '.' + padZero(cs);
    }
    // Default mm:ss — show hours if > 0
    if (hours > 0) {
      return hours + ':' + padZero(minutes) + ':' + padZero(seconds);
    }
    return padZero(minutes) + ':' + padZero(seconds);
  }

  /**
   * Format seconds as human-readable duration.
   * @param {number} seconds
   * @returns {string} e.g. "2m 30s", "1h 15m", "45s"
   */
  function formatDuration(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    if (seconds < 60) return seconds + 's';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    if (m < 60) return s > 0 ? m + 'm ' + s + 's' : m + 'm';
    var h = Math.floor(m / 60);
    m = m % 60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  /**
   * Clamp a number between min and max.
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Throttle a function to run at most once per delay.
   */
  function throttle(fn, delay) {
    var last = 0;
    var timer = null;
    return function () {
      var now = Date.now();
      var args = arguments;
      var self = this; // eslint-disable-line @typescript-eslint/no-this-alias
      var remaining = delay - (now - last);
      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        last = now;
        fn.apply(self, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now();
          timer = null;
          fn.apply(self, args);
        }, remaining);
      }
    };
  }

  /**
   * Debounce a function — only call after delay of inactivity.
   */
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this; // eslint-disable-line @typescript-eslint/no-this-alias
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, delay);
    };
  }

  /**
   * Generate a short random ID for DOM elements.
   */
  function generateId() {
    return '_p' + Math.random().toString(36).substr(2, 8);
  }

  /**
   * Abbreviate a number: 1200 -> "1.2K", 1500000 -> "1.5M".
   * @param {number} n
   * @returns {string}
   */
  function formatNumber(n) {
    if (typeof n !== 'number' || isNaN(n)) return '\u2014';
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
    return sign + (abs % 1 === 0 ? abs.toString() : abs.toFixed(1));
  }

  /**
   * Format a decimal as a percentage string.
   * @param {number} n - Value where 1 = 100%
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatPercent(n, decimals) {
    if (typeof n !== 'number' || isNaN(n)) return '\u2014';
    decimals = typeof decimals === 'number' ? decimals : 0;
    return (n * 100).toFixed(decimals) + '%';
  }

  /**
   * Format a number as currency.
   * @param {number} n
   * @param {string} [currency='USD']
   * @returns {string}
   */
  function formatCurrency(n, currency) {
    if (typeof n !== 'number' || isNaN(n)) return '\u2014';
    currency = currency || 'USD';
    try {
      return n.toLocaleString('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch (e) {
      return '$' + n.toFixed(2);
    }
  }

  /**
   * Format a timestamp as relative time ("Updated 3m ago").
   * @param {number} ts - Unix timestamp in ms
   * @returns {string}
   */
  function formatRelativeTime(ts) {
    if (!ts) return '';
    var diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 10) return 'just now';
    if (diff < 60) return diff + 's ago';
    var m = Math.floor(diff / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    return d + 'd ago';
  }

  /**
   * Convert a base64 string to a Blob.
   * @param {string} b64 - Base64 encoded data
   * @param {string} [mime] - MIME type (default: application/octet-stream)
   * @returns {Blob}
   */
  function base64ToBlob(b64, mime) {
    mime = mime || 'application/octet-stream';
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  // Expose internally for runtime.js
  window._pHelpers = {
    formatTime: formatTime,
    formatDuration: formatDuration,
    clamp: clamp,
    throttle: throttle,
    debounce: debounce,
    generateId: generateId,
    padZero: padZero,
    formatNumber: formatNumber,
    formatPercent: formatPercent,
    formatCurrency: formatCurrency,
    formatRelativeTime: formatRelativeTime,
    base64ToBlob: base64ToBlob,
  };
})();
