/**
 * prvctice UI Kit — Notifications
 * Toast, confirm, and alert dialogs rendered in the host UI (outside iframe bounds).
 * Uses window.prvctice._bridge.request() for all bridge calls.
 * ES5-compatible — no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  var _dialogCallbacks = {};

  // Listen for dialog result push messages from host
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ui:confirm_result' || msg.type === 'ui:alert_result') {
      var cb = _dialogCallbacks[msg.dialogId];
      if (cb) {
        delete _dialogCallbacks[msg.dialogId];
        cb.resolve(msg.data);
      }
    }
  });

  function attach() {
    if (!window.prvctice || !window.prvctice._bridge) {
      setTimeout(attach, 10);
      return;
    }

    var _request = window.prvctice._bridge.request;

    // Extend the existing ui namespace (don't replace — runtime.js already sets clock, tabs, etc.)
    window.prvctice.ui = window.prvctice.ui || {};

    /**
     * Show a toast notification in the host UI.
     * @param {Object|string} opts - { message: string, type?: 'info'|'success'|'warning'|'error', duration?: number } or just a string
     * @returns {Promise<{shown: boolean}>}
     */
    window.prvctice.ui.toast = function (opts) {
      opts = opts || {};
      var message = typeof opts === 'string' ? opts : opts.message || '';
      var kind = (typeof opts === 'string' ? 'info' : opts.type) || 'info';
      var duration = typeof opts === 'object' ? opts.duration : undefined;
      return _request({
        type: 'ui:toast',
        message: message,
        kind: kind,
        duration: duration,
      });
    };

    /**
     * Show a confirmation dialog in the host UI.
     * Uses two-phase pattern: immediate ack with dialogId, then push result.
     * Accepts confirmLabel/cancelLabel (preferred) or raw buttons array.
     * @param {Object} opts - { title, message, confirmLabel?, cancelLabel?, buttons? }
     * @returns {Promise<boolean>} true if confirmed (last button), false if cancelled
     */
    window.prvctice.ui.confirm = function (opts) {
      opts = opts || {};
      var cancelLabel = opts.cancelLabel || 'Cancel';
      var confirmLabel = opts.confirmLabel || 'OK';
      var buttons = opts.buttons || [cancelLabel, confirmLabel];
      // The confirm button is always the last one in the array
      var confirmBtn = buttons[buttons.length - 1];

      return _request({
        type: 'ui:confirm',
        title: opts.title || 'Confirm',
        message: opts.message || '',
        buttons: buttons,
      }).then(function (result) {
        // First phase: host responds with { dialogId }
        if (!result || !result.dialogId) return false;
        var dialogId = result.dialogId;
        // Second phase: wait for push message with user's choice
        return new Promise(function (resolve) {
          _dialogCallbacks[dialogId] = {
            resolve: function (data) {
              // Resolve with boolean: true if the confirm button was clicked
              resolve(data && data.button === confirmBtn);
            },
          };
        });
      });
    };

    /**
     * Show an alert dialog in the host UI.
     * Uses two-phase pattern: immediate ack with dialogId, then push result.
     * @param {Object} opts - { title: string, message: string }
     * @returns {Promise<void>} resolves when dismissed
     */
    window.prvctice.ui.alert = function (opts) {
      opts = opts || {};
      return _request({
        type: 'ui:alert',
        title: opts.title || 'Alert',
        message: opts.message || '',
      }).then(function (result) {
        // First phase: host responds with { dialogId }
        if (!result || !result.dialogId) return undefined;
        var dialogId = result.dialogId;
        // Second phase: wait for push message with user's dismiss
        return new Promise(function (resolve) {
          _dialogCallbacks[dialogId] = {
            resolve: function () {
              resolve(undefined);
            },
          };
        });
      });
    };
  }

  attach();
})();
