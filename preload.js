// preload.js – exposed APIs from the main process to the renderer when running
// inside the Electron shell.  The web build *does not* load this script, so we
// keep the surface minimal and safe.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronSpeech', {
  onTranscript: (handler) => {
    if (typeof handler !== 'function') return;
    ipcRenderer.on('native-speech', (_event, payload) => {
      handler(payload);
    });
  },
  requestAuthorization: () => ipcRenderer.invoke('speech-request-authorization'),
  start: () => ipcRenderer.invoke('speech-start'),
  stop: () => ipcRenderer.invoke('speech-stop'),
});

// -------------------------------------------------------------
// Electron Menu API exposed to renderer
// -------------------------------------------------------------
// We need to expose **all** supported menu callbacks in a *single* call to
// `contextBridge.exposeInMainWorld`.  Attempting to register the same key more
// than once will throw an exception in recent Electron versions, which in turn
// prevents the rest of the preload script from running.  That was breaking the
// `window.electronMenu.on(...)` helper relied on by the front-end for actions
// such as "Select Theme", "Load Workspace", etc. – resulting in those menu
// items doing nothing.

const menuEvents = [
  'menu-save-workspace',
  'menu-load-workspace',
  'menu-save-pdf',
  'menu-select-theme',
  'menu-api-keys',
  'menu-toggle-grid',
  'menu-cheatsheet',
];

contextBridge.exposeInMainWorld('electronMenu', {
  /**
   * Listen for generic menu events.
   *
   * @param {string} eventName One of the recognised `menu-*` channel names.
   * @param {Function} handler  Callback executed when the event fires.
   */
  on(eventName, handler) {
    if (!menuEvents.includes(eventName) || typeof handler !== 'function') return;
    ipcRenderer.on(eventName, handler);
  },

  /**
   * Special-case listener for the Preferences window so existing callers that
   * use `electronMenu.onPreferences(...)` continue to work.
   */
  onPreferences(handler) {
    if (typeof handler !== 'function') return;
    ipcRenderer.on('menu-preferences', handler);
  },
});

// -------------------------------------------------------------
// Expose app packaging flag for feature gating
// -------------------------------------------------------------
contextBridge.exposeInMainWorld('electronApp', {
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
});

// Dictation menu state sync so the web UI can reflect menu-driven changes
contextBridge.exposeInMainWorld('electronDictationMenu', {
  onToggle: (handler) => {
    if (typeof handler !== 'function') return;
    ipcRenderer.on('dictation-menu-toggle', (_event, state) => {
      handler(state);
    });
  },
});
// Add a CSS class to <body> to allow Electron-specific styling
window.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('electron');
});

// -------------------------------------------------------------
// Fullscreen state listener
// -------------------------------------------------------------
contextBridge.exposeInMainWorld('electronWindow', {
  onFullscreenChange: (handler) => {
    if (typeof handler !== 'function') return;
    ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => {
      handler(isFullscreen);
    });
  },
});

// Apply fullscreen class changes in the preload (runs before renderer)
ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => {
  if (isFullscreen) {
    document.documentElement.classList.add('electron-fullscreen');
    document.body.classList.add('electron-fullscreen');
  } else {
    document.documentElement.classList.remove('electron-fullscreen');
    document.body.classList.remove('electron-fullscreen');
  }
});
// Expose grid visibility notifier to renderer
contextBridge.exposeInMainWorld('electronGrid', {
  /** Notify main process of grid visibility change. */
  setGridState: (visible) => ipcRenderer.send('grid-visibility-changed', visible),
});

// -------------------------------------------------------------
// App config exposed to renderer (API base URL)
// -------------------------------------------------------------
// Point all API requests to your hosted backend. The renderer will use this
// when rewriting fetch URLs that start with "/api/".
//
// Configuration priority:
//   1. PRVCTICE_API_URL environment variable (set via main.js from config)
//   2. Default: http://localhost:3000 (for local dev / self-hosted)
//
// Set PRVCTICE_API_URL in .env for production builds.
const apiBaseUrl = process.env.PRVCTICE_API_URL || 'http://localhost:3000';

contextBridge.exposeInMainWorld('prvctice', {
  apiBaseUrl,
});
// Back-compat alias for code that reads window.API_BASE_URL directly
try {
  contextBridge.exposeInMainWorld('API_BASE_URL', apiBaseUrl);
} catch (_) {}

// -------------------------------------------------------------
// Storage API exposed to renderer (for data management)
// -------------------------------------------------------------
contextBridge.exposeInMainWorld('electronStorage', {
  clearAll: () => ipcRenderer.invoke('storage-clear-all'),
});
