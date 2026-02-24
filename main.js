// main.js
// Electron main process: launches the Express server and opens a desktop window
const {
  app,
  BrowserWindow,
  session,
  ipcMain,
  systemPreferences,
  powerMonitor,
  shell,
  Menu,
  dialog,
  globalShortcut,
} = require('electron');
const { autoUpdater } = require('electron-updater');
// Listen for grid visibility changes from renderer and update menu checkbox
ipcMain.on('grid-visibility-changed', (event, visible) => {
  // Security: verify the sender is from our main window
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender !== mainWindow.webContents) return;

  const menu = Menu.getApplicationMenu();
  if (menu) {
    const item = menu.getMenuItemById('toggle-grid');
    if (item) item.checked = visible;
  }
});
let menuInitialized = false;
const path = require('path');
// Native speech recognizer binding – must load for Electron builds
const fs = require('fs');
let speech;
function loadNativeSpeechAddon() {
  // 1) Try standard node-bindings resolution (dev + some prod layouts)
  try {
    const bindings = require('bindings');
    return bindings('speech_recognizer');
  } catch (e) {
    console.warn('[speech] bindings() lookup failed:', e?.message || e);
  }

  // 2) Packaged app: .node is unpacked under app.asar.unpacked/build/Release
  const candidates = [];
  try {
    const unpackedBase = path.join(process.resourcesPath || '', 'app.asar.unpacked');
    if (process.resourcesPath && fs.existsSync(unpackedBase)) {
      candidates.push(path.join(unpackedBase, 'build', 'Release', 'speech_recognizer.node'));
    }
  } catch {}

  // 3) Dev checkout – local build output
  candidates.push(path.join(__dirname, 'build', 'Release', 'speech_recognizer.node'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log('[speech] Loading native addon at', p);
        return require(p);
      }
    } catch (e) {
      console.warn('[speech] Failed to require candidate', p, e?.message || e);
    }
  }

  throw new Error('Native speech addon not found');
}

try {
  speech = loadNativeSpeechAddon();
  console.log('[speech] Native speech addon loaded');
} catch (err) {
  console.error('[speech] FATAL: could not load native speech recognizer addon:', err);
  speech = null;
}

// Signal to the Express server that we are running inside the Electron shell
// so it can relax the Content-Security-Policy for inline scripts/styles that
// are embedded in the packaged web assets.
process.env.IS_ELECTRON = 'true';

// Load configuration (port, API keys, etc.) **before** Chromium spins up so we
// can expose the required Google credentials through environment variables and
// command-line switches.
const config = require('./src/config');

// Expose the configured API URL to the preload script via environment variable.
// Preload runs in a sandboxed context and cannot access main process modules,
// but it can read process.env set before the window is created.
process.env.PRVCTICE_API_URL = config.apiUrl;

// -------------------------------------------------------------
// Auto-update (Electron + generic feed)
// -------------------------------------------------------------
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const AUTO_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const AUTO_UPDATE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 min timeout for stalled downloads
let autoUpdateInterval = null;
let autoUpdateConfigured = false;
let manualUpdateRequest = null;
let downloadTimeoutId = null;
let lastDownloadProgress = { percent: 0, timestamp: 0 };

function getDialogParentWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return undefined;
}

function clearDownloadTimeout() {
  if (downloadTimeoutId) {
    clearTimeout(downloadTimeoutId);
    downloadTimeoutId = null;
  }
}

function resetDownloadProgress() {
  lastDownloadProgress = { percent: 0, timestamp: Date.now() };
  clearDownloadTimeout();
}

function startDownloadTimeout() {
  clearDownloadTimeout();
  downloadTimeoutId = setTimeout(() => {
    const elapsed = Date.now() - lastDownloadProgress.timestamp;
    if (elapsed >= AUTO_UPDATE_DOWNLOAD_TIMEOUT_MS) {
      console.error('[auto-update] Download stalled - no progress for 5 minutes');
      autoUpdater.removeAllListeners('download-progress');
      if (manualUpdateRequest) {
        showManualUpdateDialog(
          'error',
          'Download stalled. Please check your internet connection and try again.'
        );
      }
    }
  }, AUTO_UPDATE_DOWNLOAD_TIMEOUT_MS);
}

function showManualUpdateDialog(state, payload) {
  const parentWindow = getDialogParentWindow();
  // Only clear manualUpdateRequest for terminal states (none, error)
  // Keep it set during 'downloading' so we can show errors if download fails
  if (state !== 'downloading') {
    manualUpdateRequest = null;
  }
  let options;
  if (state === 'none') {
    options = {
      type: 'info',
      message: 'Prvctice is up to date.',
      detail: `You are running version ${app.getVersion()}.`,
    };
  } else if (state === 'downloading') {
    options = {
      type: 'info',
      message: `Downloading Prvctice ${payload || ''}`,
      detail:
        'The update is downloading in the background. You will be prompted when it is ready to install.',
    };
  } else if (state === 'checking') {
    options = {
      type: 'info',
      message: 'Checking for updates...',
      detail: 'Please wait while we check for a new version.',
    };
  } else {
    options = {
      type: 'error',
      message: 'Update check failed',
      detail: payload || 'Unknown error',
    };
  }
  dialog.showMessageBox(parentWindow, options).catch(() => {});
}

function promptToInstallUpdate(version) {
  const parentWindow = getDialogParentWindow();
  const title = version ? `Prvctice ${version} is ready` : 'Update ready';
  dialog
    .showMessageBox(parentWindow, {
      type: 'info',
      buttons: ['Restart & Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title,
      message: version
        ? `Prvctice ${version} has been downloaded. Restart to finish installing.`
        : 'An update has been downloaded. Restart to finish installing.',
      detail: 'Selecting "Restart & Install" will close Prvctice and apply the update.',
    })
    .then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    })
    .catch(() => {});
}

function getArchSpecificFeedUrl(baseUrl) {
  // Handle architecture-specific feed URLs
  // If URL contains arm64 or x64, replace with current architecture
  const arch = process.arch; // 'arm64' or 'x64'
  let feedUrl = baseUrl.replace(/\/+$/, '');

  // Replace architecture in URL if present (supports both arm64 and x64 patterns)
  if (feedUrl.includes('/arm64') || feedUrl.includes('/x64')) {
    feedUrl = feedUrl.replace(/\/(arm64|x64)(?=\/|$)/, `/${arch}`);
  }

  return feedUrl;
}

function configureAutoUpdates() {
  if (autoUpdateConfigured) return true;
  if (!app.isPackaged) {
    console.log('[auto-update] Skipping (development build).');
    return false;
  }
  const baseUrl = (config.autoUpdateBaseUrl || '').trim();
  if (!baseUrl) {
    console.log('[auto-update] Disabled (AUTO_UPDATE_BASE_URL not set).');
    return false;
  }
  const feedUrl = getArchSpecificFeedUrl(baseUrl);
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    console.log(`[auto-update] Using feed: ${feedUrl} (arch: ${process.arch})`);
  } catch (err) {
    console.error('[auto-update] Failed to configure feed URL:', err);
    return false;
  }

  autoUpdater.on('error', (err) => {
    console.error('[auto-update] Error:', err);
    clearDownloadTimeout();
    resetDownloadProgress();
    if (manualUpdateRequest) {
      showManualUpdateDialog('error', err?.message || 'Unknown error');
    }
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-update] Checking for updates...');
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[auto-update] No updates available.');
    if (manualUpdateRequest) {
      showManualUpdateDialog('none');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[auto-update] Update available:', info?.version);
    resetDownloadProgress();
    startDownloadTimeout();
    if (manualUpdateRequest) {
      showManualUpdateDialog('downloading', info?.version);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent || 0);
    console.log(
      `[auto-update] Download progress: ${percent}% (${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`
    );
    lastDownloadProgress = { percent, timestamp: Date.now() };
    // Reset the stall timeout since we're making progress
    startDownloadTimeout();
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[auto-update] Update downloaded:', info?.version);
    clearDownloadTimeout();
    manualUpdateRequest = null;
    promptToInstallUpdate(info?.version);
  });

  autoUpdateConfigured = true;
  scheduleAutoUpdateChecks();
  return true;
}

function scheduleAutoUpdateChecks() {
  if (!autoUpdateConfigured) return;
  const runCheck = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[auto-update] Check failed:', err?.message || err);
    });
  };
  runCheck();
  if (autoUpdateInterval) clearInterval(autoUpdateInterval);
  autoUpdateInterval = setInterval(runCheck, AUTO_UPDATE_CHECK_INTERVAL_MS);
  if (typeof autoUpdateInterval.unref === 'function') {
    autoUpdateInterval.unref();
  }
}

function requestManualUpdateCheck() {
  if (!autoUpdateConfigured) {
    dialog
      .showMessageBox(getDialogParentWindow(), {
        type: 'info',
        message: 'Auto-update is disabled.',
        detail:
          'Set AUTO_UPDATE_BASE_URL in your environment (and rebuild) to enable in-app updates.',
      })
      .catch(() => {});
    return;
  }
  if (manualUpdateRequest) {
    dialog
      .showMessageBox(getDialogParentWindow(), {
        type: 'info',
        message: 'Update check already running',
        detail: 'Please wait for the current check to finish.',
      })
      .catch(() => {});
    return;
  }
  manualUpdateRequest = { startedAt: Date.now() };
  autoUpdater.checkForUpdates().catch((err) => {
    const message =
      err && /in progress/i.test(err.message || '')
        ? 'An update check is already running. Try again in a few seconds.'
        : err?.message || 'Unknown error';
    showManualUpdateDialog('error', message);
  });
}

// -------------------------------------------------------------
// Application Menu
// -------------------------------------------------------------

/**
 * Returns a configured Menu template with native macOS structure and
 * application-specific commands wired up to the main window.  The majority of
 * menu items rely on Electron’s built-in roles so that keyboard shortcuts and
 * behaviours match users’ expectations automatically.
 */
function buildApplicationMenu() {
  if (menuInitialized) return;
  menuInitialized = true;
  // Defer menu creation until after the first BrowserWindow exists so we can
  // reference it in click handlers.
  if (!BrowserWindow.getAllWindows().length) {
    return;
  }

  // Helper – returns an *alive* BrowserWindow or creates a new one when none
  // exist.  Using this instead of capturing a reference prevents "Object has
  // been destroyed" errors when all windows were previously closed.
  function getActiveWindow() {
    let target = BrowserWindow.getFocusedWindow();
    if (target && !target.isDestroyed()) return target;
    const open = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (open) return open;
    // No windows – create a fresh one synchronously.
    createWindow();
    return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  }

  const isMac = process.platform === 'darwin';

  const template = [
    // App (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              {
                label: 'Check for Updates…',
                click: () => requestManualUpdateCheck(),
              },
              { type: 'separator' },
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                  const target = getActiveWindow();
                  if (target) {
                    target.webContents.send('menu-preferences');
                  }
                },
              },
              {
                label: 'API Keys…',
                click: () => {
                  const target = getActiveWindow();
                  if (target) {
                    target.webContents.send('menu-api-keys');
                  }
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideothers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Workspace…',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const win = getActiveWindow();
            win?.webContents.send('menu-save-workspace');
          },
        },
        {
          label: 'Load Workspace…',
          click: async () => {
            try {
              const win = getActiveWindow();
              if (!win) return;

              // Ask user for a workspace JSON file.
              const { dialog } = require('electron');
              const result = await dialog.showOpenDialog(win, {
                title: 'Open Prvctice Workspace',
                properties: ['openFile'],
                filters: [
                  { name: 'Prvctice Workspace', extensions: ['json'] },
                  { name: 'JSON', extensions: ['json'] },
                ],
              });
              if (result.canceled || !result.filePaths?.length) return;

              const fs = require('fs');
              const filePath = result.filePaths[0];
              fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                  console.error('Failed to read workspace file:', err);
                  return;
                }
                try {
                  const json = JSON.parse(data);
                  win.webContents.send('menu-load-workspace', json);
                } catch (parseErr) {
                  console.error('Invalid workspace JSON:', parseErr);
                  dialog.showErrorBox(
                    'Invalid Workspace File',
                    'The selected file is not a valid Prvctice workspace.'
                  );
                }
              });
            } catch (err) {
              console.error('Error loading workspace:', err);
            }
          },
        },
        {
          label: 'Export Chat as PDF…',
          click: () => {
            const win = getActiveWindow();
            win?.webContents.send('menu-save-pdf');
          },
        },
      ],
    },

    // Edit menu with standard roles so keyboard shortcuts just work.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
              },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },

    // View menu, includes developer tools toggle even in packaged builds.
    {
      label: 'View',
      submenu: [
        {
          label: 'Select Theme…',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const win = getActiveWindow();
            win?.webContents.send('menu-select-theme');
          },
        },
        {
          id: 'toggle-grid',
          label: 'Toggle Grid',
          type: 'checkbox',
          checked: false,
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            const win = getActiveWindow();
            win?.webContents.send('menu-toggle-grid');
          },
        },
        // Reload the app (like refreshing a website)
        { role: 'reload' },
        { role: 'forcereload' },

        // Developer tools
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Alt+I' },

        { role: 'togglefullscreen' },
      ],
    },

    // Speech menu – custom commands that integrate with the native speech-to-text
    // module already exposed in main.js.
    {
      label: 'Dictation',
      submenu: [
        {
          label: 'Start Dictation',
          accelerator: 'F5',
          click: () => {
            const target = getActiveWindow();
            try {
              if (!target) return;
              // Notify renderer so UI can sync its state before we kick off
              // native speech recognition.  The renderer can listen for this
              // event to toggle the microphone button visually.
              target.webContents.send('dictation-menu-toggle', 'start');

              speech.start((text, isFinal) => {
                const wnd = getActiveWindow();
                if (!wnd) return;
                wnd.webContents.send('native-speech', { text, isFinal });
              });
            } catch (err) {
              console.error('Failed to start dictation from menu:', err);
            }
          },
        },
        {
          label: 'Stop Dictation',
          accelerator: 'F6',
          click: () => {
            try {
              const target = getActiveWindow();
              target?.webContents.send('dictation-menu-toggle', 'stop');
              speech.stop();
            } catch (err) {
              console.error('Failed to stop dictation from menu:', err);
            }
          },
        },
      ],
    },

    // Window menu (macOS gets special treatment so keyboard shortcuts match Finder)
    {
      label: 'Window',
      role: 'window',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(),
        },
        { role: 'close' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : []),
      ],
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        ...(!isMac
          ? [
              {
                label: 'Check for Updates…',
                click: () => requestManualUpdateCheck(),
              },
            ]
          : []),
        // Updater logs removed

        // -----------------------------------------------------------
        // Bug report helper – generates a redacted log file that users can
        // e-mail or attach to a GitHub issue.
        // -----------------------------------------------------------
        {
          label: 'Submit Bug Report…',
          click: async () => {
            const { dialog, shell: electronShell } = require('electron');
            const win = getActiveWindow();

            try {
              if (!serverPort) {
                await dialog.showMessageBox(win, {
                  type: 'warning',
                  message: 'The local server is still starting. Please try again in a moment.',
                });
                return;
              }

              // Fetch last 500 log lines from the Express endpoint
              const response = await fetch(
                `http://localhost:${serverPort}/api/bug-report?lines=500`
              );
              if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
              }

              const report = await response.json();

              // Ask the user where to save the JSON file
              const { canceled, filePath } = await dialog.showSaveDialog(win, {
                title: 'Save Prvctice Bug Report',
                defaultPath: `prvctice-bug-${report.reportId}.json`,
                filters: [{ name: 'JSON', extensions: ['json'] }],
              });

              if (canceled || !filePath) return;

              const fs = require('fs');
              fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');

              // Reveal in Finder / Explorer so the user can attach it easily.
              electronShell.showItemInFolder(filePath);
            } catch (err) {
              dialog.showErrorBox('Could not create bug report', err?.message ?? String(err));
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
// Enable Chrome WebSpeech API in Electron desktop builds
if (config.googleApiKey) {
  process.env.GOOGLE_API_KEY = config.googleApiKey;
}
if (config.googleClientId) {
  process.env.GOOGLE_DEFAULT_CLIENT_ID = config.googleClientId;
}
if (config.googleClientSecret) {
  process.env.GOOGLE_DEFAULT_CLIENT_SECRET = config.googleClientSecret;
}
app.commandLine.appendSwitch(
  'enable-features',
  'SpeechRecognitionWebPlatformAPI,SpeechRecognitionOnDeviceAPI'
);
if (process.env.GOOGLE_API_KEY) {
  app.commandLine.appendSwitch('google-api-key', process.env.GOOGLE_API_KEY);
}
if (process.env.GOOGLE_DEFAULT_CLIENT_ID) {
  app.commandLine.appendSwitch('oauth2-client-id', process.env.GOOGLE_DEFAULT_CLIENT_ID);
}
if (process.env.GOOGLE_DEFAULT_CLIENT_SECRET) {
  app.commandLine.appendSwitch('oauth2-client-secret', process.env.GOOGLE_DEFAULT_CLIENT_SECRET);
}

// Keep a reference to the main window to allow reloading/navigations
let mainWindow;
// Track backend server port (serves both API and static assets)
let serverPort = null;

// -------------------------------------------------------------
// Window State Persistence
// -------------------------------------------------------------
const WINDOW_STATE_FILE = 'window-state.json';

function getWindowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function loadWindowState() {
  try {
    const statePath = getWindowStatePath();
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf8');
      const state = JSON.parse(data);
      // Validate the state has expected properties
      if (
        typeof state.x === 'number' &&
        typeof state.y === 'number' &&
        typeof state.width === 'number' &&
        typeof state.height === 'number'
      ) {
        return state;
      }
    }
  } catch (err) {
    console.warn('[window-state] Failed to load saved state:', err?.message);
  }
  return null;
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.getBounds();
    const isMaximized = win.isMaximized();
    const isFullScreen = win.isFullScreen();
    const state = { ...bounds, isMaximized, isFullScreen };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[window-state] Failed to save state:', err?.message);
  }
}
function createWindow() {
  // Load saved window state (position, size, maximized)
  const savedState = loadWindowState();

  // Configure window options, including a custom title bar overlay on macOS
  const winOpts = {
    width: savedState?.width || 1200,
    height: savedState?.height || 800,
    minWidth: 600,
    minHeight: 400,
    autoHideMenuBar: true,
    webPreferences: {
      // Keep renderer secure
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Explicitly allow Chromium DevTools in packaged builds
      devTools: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  // Restore saved position if valid
  if (savedState?.x !== undefined && savedState?.y !== undefined) {
    winOpts.x = savedState.x;
    winOpts.y = savedState.y;
  }
  // On macOS, use a titleBarOverlay to color the native title bar to match the app theme
  if (process.platform === 'darwin') {
    // Use an inset hidden title bar so content sits below the bar, not under it.
    winOpts.titleBarStyle = 'hiddenInset';
    // Enable the overlay so web contents can paint into the titlebar area, but
    // fall back to the system default colors rather than forcing a custom one.
    winOpts.titleBarOverlay = true;
  }
  mainWindow = new BrowserWindow(winOpts);

  // Restore maximized/fullscreen state after window is ready
  if (savedState?.isMaximized) {
    mainWindow.maximize();
  } else if (savedState?.isFullScreen) {
    mainWindow.setFullScreen(true);
  }

  // Save window state on resize/move (debounced to avoid excessive writes)
  let saveStateTimeout = null;
  const debouncedSaveState = () => {
    if (saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => saveWindowState(mainWindow), 500);
  };
  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);
  mainWindow.on('close', () => saveWindowState(mainWindow));

  // Build a custom, native-feeling application menu once the window is ready.
  buildApplicationMenu();

  // Optionally auto-open DevTools in debug sessions
  const enableDevTools =
    process.env.ENABLE_DEVTOOLS === 'true' || process.argv.includes('--devtools');
  if (enableDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' }).catch(() => {});
  }

  // Navigate to the backend server once available; otherwise show a simple loader.
  if (serverPort) {
    mainWindow.loadURL(`http://localhost:${serverPort}`);
  } else {
    mainWindow.loadURL('data:text/html,<html><body><h2>Loading Prvctice...</h2></body></html>');
  }

  // Inject a visible border around the window for a polished native feel (like Dia browser).
  // In fullscreen mode, hide the border and remove rounded corners.
  mainWindow.webContents.on('did-finish-load', () => {
    const css = `
      html { box-sizing: border-box; overflow: hidden; border-radius: 10px; }
      body { margin: 0; overflow: hidden; border-radius: 10px; }
      body.electron::after {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        border: 2px solid rgba(39, 39, 39, 0.40);
        border-radius: 16px;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
        z-index: 99999;
      }
      /* Hide border and remove rounded corners in fullscreen */
      html.electron-fullscreen { border-radius: 0; }
      body.electron-fullscreen { border-radius: 0; }
      body.electron.electron-fullscreen::after { display: none; }
    `;
    // Use `insertCSS` so the styles apply to all navigations in this
    // BrowserWindow without needing to modify the bundled front-end assets.
    mainWindow.webContents.insertCSS(css).catch((err) => {
      console.error('Failed to inject border CSS:', err);
    });

    // Set initial fullscreen state via IPC
    if (mainWindow.isFullScreen()) {
      mainWindow.webContents.send('fullscreen-changed', true);
    }
  });

  // Toggle fullscreen class when entering/leaving fullscreen via IPC
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });
  // Open external links in default browser rather than new Electron windows
  const safeExternalUrl = /^(https?:|mailto:)/i;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open URLs matching safe protocols
    if (safeExternalUrl.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Block ALL navigation away from app origin
    const appOrigin = `http://localhost:${serverPort}`;
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
      // Only open safe protocols externally
      if (safeExternalUrl.test(url)) {
        shell.openExternal(url);
      }
    }
  });
}

app.whenReady().then(async () => {
  try {
    app.setAboutPanelOptions({
      applicationName: 'Prvctice',
      applicationVersion: app.getVersion(),
      website: 'https://prvctice.com',
      credits: '© Tim Moore and contributors',
    });
  } catch (_) {}
  // On macOS, request microphone & speech recognition permissions upfront
  if (process.platform === 'darwin') {
    console.log('Requesting microphone access...');
    try {
      const micGranted = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone access granted:', micGranted);
    } catch (err) {
      console.error('Error requesting microphone access:', err);
    }
    // Only request speech auth in packaged app - dev Electron lacks Info.plist keys
    // and macOS will SIGABRT the process (TCC privacy violation)
    if (app.isPackaged && speech) {
      console.log('Requesting speech recognition authorization...');
      try {
        const withTimeout = (p, ms) =>
          Promise.race([
            Promise.resolve(p),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
          ]);
        const speechAuth = await withTimeout(speech.requestAuthorization(), 3000).catch((err) => {
          console.warn('Speech authorization timed out or failed:', err?.message || String(err));
          return 'unknown';
        });
        console.log('Speech recognition authorization status:', speechAuth);
      } catch (err) {
        console.error('Error requesting speech recognition authorization:', err);
      }
    } else if (!app.isPackaged) {
      console.log('[dev] Skipping speech auth - dev Electron lacks Info.plist privacy keys');
    }
  }
  // -----------------------------------------------------------
  // IPC handlers – wrapped in src/ipc.js for consistency
  // -----------------------------------------------------------
  const { register: registerIPC } = require('./src/ipc');

  /**
   * @returns {Promise<'authorized' | 'denied' | 'restricted' | 'notDetermined'>}
   */
  registerIPC('speech-request-authorization', async () => {
    if (!speech) throw new Error('Native speech addon unavailable');
    return await speech.requestAuthorization();
  });

  registerIPC('speech-start', async () => {
    if (!speech) throw new Error('Native speech addon unavailable');
    speech.start((text, isFinal) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('native-speech', { text, isFinal });
    });
  });

  registerIPC('speech-stop', async () => {
    if (!speech) return;
    speech.stop();
  });

  registerIPC('get-is-packaged', async () => app.isPackaged);

  registerIPC('storage-clear-all', async (event) => {
    // Verify sender is from our window
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      throw new Error('Unauthorized');
    }
    console.log('[IPC] storage-clear-all: handler invoked');
    const storage = require('./src/storage/node/sqlite');
    console.log('[IPC] storage-clear-all: storage module loaded');
    const result = await storage.clearAll(true);
    console.log('[IPC] storage-clear-all: clearAll returned', result);
    return result;
  });

  // Grant microphone / camera permission requests coming from the renderer.
  // Electron usually reports these as the generic "media" permission, but
  // some Chromium versions split them out (e.g. "microphone").  We whitelist
  // every known variant so that `getUserMedia({audio:true})` succeeds without
  // user interaction beyond the normal macOS privacy prompt.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      ['media', 'microphone', 'audioCapture', 'camera', 'displayCapture', 'screenCapture'].includes(
        permission
      )
    ) {
      console.log('Granting media permission to', webContents.getURL());
      return callback(true);
    }
    callback(false);
  });

  // Make the Permissions API (`navigator.permissions.query`) report "granted"
  // for the same set so that front-end libraries that rely on it behave
  // correctly.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return [
      'media',
      'microphone',
      'audioCapture',
      'camera',
      'displayCapture',
      'screenCapture',
    ].includes(permission);
  });
  // Create window now
  createWindow();
  configureAutoUpdates();
  // Global shortcut to toggle DevTools even if menu is hidden
  try {
    globalShortcut.register('CommandOrControl+Alt+I', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({ mode: 'detach' });
    });
  } catch {}
  // Start a lightweight static server to host the built web assets locally.
  // API requests are sent to the external hosted backend (see preload.js API_BASE_URL).
  try {
    const express = require('express');
    const compression = (() => {
      try {
        return require('compression');
      } catch (_) {
        return null;
      }
    })();
    const fs = require('fs');
    const appStatic = express();
    const path = require('path');

    const distDir = path.join(__dirname, 'dist');
    const publicDir = path.join(__dirname, 'public');
    const staticDir = fs.existsSync(distDir) ? distDir : publicDir;
    console.log(`[static] Serving desktop assets from: ${staticDir}`);

    // Enable gzip compression for JS/CSS/HTML to improve LCP/FCP (optional)
    if (compression) appStatic.use(compression());
    appStatic.use(express.static(staticDir));
    // Expose es-module-shims for import-map support in packaged build
    appStatic.use(
      '/node_modules/es-module-shims/dist',
      express.static(path.join(__dirname, 'node_modules', 'es-module-shims', 'dist'))
    );

    const http = require('http');
    const server = http.createServer(appStatic);

    // Try preferred fixed port first; if unavailable, fall back to an ephemeral port.
    const PREFERRED_PORT = 45123;
    function bind(port) {
      server.listen(port, () => {
        const addr = server.address();
        serverPort = (addr && addr.port) || port;
        console.log(`Static server listening on http://localhost:${serverPort}`);
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.loadURL(`http://localhost:${serverPort}`);
          }
        });
      });
    }
    server.on('error', (err) => {
      if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        console.warn(`Port ${PREFERRED_PORT} unavailable, retrying with a random port`);
        // Remove existing listeners and try dynamic port
        server.removeAllListeners('error');
        bind(0);
      } else {
        console.error('Static server error:', err);
      }
    });
    bind(PREFERRED_PORT);
  } catch (err) {
    console.error('Failed to start static server:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(
        'data:text/html,<html><body><h2>Application error</h2><pre>' +
          (err && err.message ? err.message : String(err)) +
          '</pre></body></html>'
      );
    }
  }
  // Reload the window when the system resumes from sleep, in case the app is stuck on the loading screen
  powerMonitor.on('resume', () => {
    console.log('System resumed from sleep, reloading window');
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Reload ignoring cache to ensure latest content
      mainWindow.webContents.reloadIgnoringCache();
    }
  });
  // No longer need to pipe microphone data from the renderer – the native
  // addon captures audio directly using AVAudioEngine.
  // On macOS, recreate window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {}
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
  }
  clearDownloadTimeout();
});
