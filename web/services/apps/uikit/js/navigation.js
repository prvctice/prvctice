/**
 * prvctice UI Kit -- Navigation
 * DOM-based router with push/pop view stack, iOS-like spring slide transitions,
 * host-rendered back button communication, and state persistence.
 * Uses AnimationKit springs for cancellable WAAPI transitions.
 * ES5-compatible -- no modules, no arrow functions, no const/let.
 */
(function () {
  'use strict';

  function attach() {
    if (!window.prvctice || !window.prvctice._bridge || !window.prvctice.animate) {
      setTimeout(attach, 10);
      return;
    }

    var _request = window.prvctice._bridge.request;
    var _views = {}; // name -> { el, title }
    var _viewStack = []; // Array of view names
    var _currentView = null;
    var _activeTransition = null;
    var _navCallbacks = [];
    var _disposed = false;

    // Extend the existing ui namespace (don't replace)
    window.prvctice.ui = window.prvctice.ui || {};

    // ==================== HOST NOTIFICATION ====================

    function _notifyHost() {
      var title = null;
      if (_currentView && _views[_currentView]) {
        title = _views[_currentView].title;
      }
      _request({
        type: 'nav:state',
        viewName: _currentView,
        stackDepth: _viewStack.length,
        title: title,
      })['catch'](function () {}); // fire-and-forget
    }

    // ==================== CALLBACK DISPATCH ====================

    function _fireCallbacks(viewName, direction) {
      for (var i = 0; i < _navCallbacks.length; i++) {
        try {
          _navCallbacks[i](viewName, direction);
        } catch (e) {
          /* swallow */
        }
      }
    }

    // ==================== CANCEL ACTIVE TRANSITION ====================

    function _cancelActive() {
      if (_activeTransition) {
        _activeTransition.cancel();
        _activeTransition = null;
      }
    }

    // ==================== SHOW VIEW (no animation) ====================

    function _showView(name, updateStack) {
      if (!_views[name]) return;

      // Hide current
      if (_currentView && _views[_currentView]) {
        _views[_currentView].el.style.display = 'none';
        _views[_currentView].el.style.transform = '';
        _views[_currentView].el.style.opacity = '';
      }

      // Show target
      _views[name].el.style.display = '';
      _views[name].el.style.position = 'relative';
      _views[name].el.style.transform = '';
      _views[name].el.style.opacity = '';

      if (updateStack) {
        _viewStack.push(name);
      }
      _currentView = name;
      _notifyHost();
    }

    // ==================== TRANSITIONS ====================

    function _transitionPush(fromEl, toEl, onComplete) {
      _cancelActive();

      // Show incoming view at right edge
      toEl.style.display = '';
      toEl.style.position = 'absolute';
      toEl.style.transform = 'translateX(100%)';
      toEl.style.opacity = '1';

      // Animate incoming: right -> center
      var inAnim = window.prvctice.animate(
        toEl,
        {
          transform: 'translateX(0%)',
        },
        { preset: 'snappy' }
      );

      // Animate outgoing: center -> left (partial, like iOS)
      window.prvctice.animate(
        fromEl,
        {
          transform: 'translateX(-30%)',
          opacity: '0.7',
        },
        { preset: 'snappy' }
      );

      _activeTransition = inAnim;

      inAnim.finished
        .then(function () {
          fromEl.style.display = 'none';
          fromEl.style.transform = '';
          fromEl.style.opacity = '';
          toEl.style.position = 'relative';
          toEl.style.transform = '';
          _activeTransition = null;
          if (onComplete) onComplete();
        })
        ['catch'](function () {
          // Cancelled -- state managed by cancel handler
        });
    }

    function _transitionPop(fromEl, toEl, onComplete) {
      _cancelActive();

      // Show returning view positioned at left
      toEl.style.display = '';
      toEl.style.position = 'absolute';
      toEl.style.transform = 'translateX(-30%)';
      toEl.style.opacity = '0.7';

      // Animate incoming: left -> center
      var inAnim = window.prvctice.animate(
        toEl,
        {
          transform: 'translateX(0%)',
          opacity: '1',
        },
        { preset: 'snappy' }
      );

      // Animate outgoing: center -> right
      window.prvctice.animate(
        fromEl,
        {
          transform: 'translateX(100%)',
        },
        { preset: 'snappy' }
      );

      _activeTransition = inAnim;

      inAnim.finished
        .then(function () {
          fromEl.style.display = 'none';
          fromEl.style.transform = '';
          toEl.style.position = 'relative';
          toEl.style.transform = '';
          toEl.style.opacity = '';
          _activeTransition = null;
          if (onComplete) onComplete();
        })
        ['catch'](function () {
          // Cancelled -- state managed by cancel handler
        });
    }

    // ==================== ROUTER API ====================

    function pushView(viewName) {
      if (_disposed) return;
      if (!_views[viewName]) return;
      if (viewName === _currentView) return;

      var fromEl = _views[_currentView].el;
      var toEl = _views[viewName].el;

      _viewStack.push(viewName);
      _currentView = viewName;
      _notifyHost();

      _transitionPush(fromEl, toEl, function () {
        _fireCallbacks(viewName, 'push');
      });
    }

    function popView() {
      if (_disposed) return;
      if (_viewStack.length <= 1) return;

      var fromEl = _views[_currentView].el;
      _viewStack.pop();
      var previousView = _viewStack[_viewStack.length - 1];
      _currentView = previousView;
      var toEl = _views[previousView].el;
      _notifyHost();

      _transitionPop(fromEl, toEl, function () {
        _fireCallbacks(previousView, 'pop');
      });
    }

    function replaceView(viewName) {
      if (_disposed) return;
      if (!_views[viewName]) return;
      if (viewName === _currentView) return;

      // No animation -- instant swap
      if (_currentView && _views[_currentView]) {
        _views[_currentView].el.style.display = 'none';
        _views[_currentView].el.style.transform = '';
        _views[_currentView].el.style.opacity = '';
      }

      _views[viewName].el.style.display = '';
      _views[viewName].el.style.position = 'relative';
      _views[viewName].el.style.transform = '';
      _views[viewName].el.style.opacity = '';

      // Replace top of stack
      if (_viewStack.length > 0) {
        _viewStack[_viewStack.length - 1] = viewName;
      } else {
        _viewStack.push(viewName);
      }
      _currentView = viewName;
      _notifyHost();
      _fireCallbacks(viewName, 'replace');
    }

    function onNavigate(callback) {
      if (typeof callback !== 'function') return function () {};
      _navCallbacks.push(callback);
      return function () {
        var idx = _navCallbacks.indexOf(callback);
        if (idx >= 0) _navCallbacks.splice(idx, 1);
      };
    }

    function dispose() {
      _disposed = true;
      _cancelActive();

      // Reset all views
      var names = Object.keys(_views);
      for (var i = 0; i < names.length; i++) {
        var view = _views[names[i]];
        view.el.style.display = 'none';
        view.el.style.transform = '';
        view.el.style.opacity = '';
        view.el.style.position = '';
      }

      _viewStack = [];
      _views = {};
      _currentView = null;
      _navCallbacks = [];
    }

    // ==================== HOST BACK MESSAGE LISTENER ====================

    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (msg && msg.type === 'nav:back') {
        popView();
      }
    });

    // ==================== ROUTER INIT ====================

    /**
     * Initialize the router.
     * Scans DOM for [data-view] elements, shows initial view, hides rest.
     * @param {Object} opts - { routes: { name: { title? } }, initial?: string, persist?: boolean }
     * @returns {{ push, pop, replace, current, stack, onNavigate, dispose }}
     */
    window.prvctice.ui.router = function (opts) {
      opts = opts || {};
      var routes = opts.routes || {};

      // Scan DOM for data-view sections
      var viewEls = document.querySelectorAll('[data-view]');
      if (viewEls.length === 0) {
        // No views found -- return no-op router
        return {
          push: function () {},
          pop: function () {},
          replace: function () {},
          current: function () {
            return null;
          },
          stack: function () {
            return [];
          },
          onNavigate: function () {
            return function () {};
          },
          dispose: function () {},
        };
      }

      // Set up positioning context on parent container
      var parentEl = viewEls[0].parentNode;
      if (parentEl && parentEl.style) {
        var parentStyle = getComputedStyle(parentEl);
        if (parentStyle.position === 'static' || parentStyle.position === '') {
          parentEl.style.position = 'relative';
        }
        parentEl.style.overflow = 'hidden';
      }

      // Index views
      for (var i = 0; i < viewEls.length; i++) {
        var el = viewEls[i];
        var name = el.getAttribute('data-view');
        var routeConfig = routes[name] || {};
        _views[name] = { el: el, title: routeConfig.title || null };
        el.style.display = 'none';
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '100%';
        el.style.height = '100%';
      }

      // Show initial view
      var initial = opts.initial || viewEls[0].getAttribute('data-view');
      if (initial && _views[initial]) {
        _views[initial].el.style.display = '';
        _views[initial].el.style.position = 'relative';
        _currentView = initial;
        _viewStack = [initial];
        _notifyHost();
      }

      // State persistence
      if (opts.persist !== false) {
        window.prvctice.storage
          .get('__nav_view')
          .then(function (saved) {
            if (saved && _views[saved] && saved !== _currentView) {
              // Restore to saved view without animation
              _showView(saved, true);
            }
          })
          ['catch'](function () {});

        window.prvctice.onDispose(function () {
          if (_currentView) {
            window.prvctice.storage.set('__nav_view', _currentView);
          }
        });
      }

      return {
        push: pushView,
        pop: popView,
        replace: replaceView,
        current: function () {
          return _currentView;
        },
        stack: function () {
          return _viewStack.slice();
        },
        onNavigate: onNavigate,
        dispose: dispose,
      };
    };
  }

  attach();
})();
