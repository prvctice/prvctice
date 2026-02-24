/**
 * Shared utility for resolving Electron's userData path.
 *
 * Both the logger and the SQLite storage layer need to know the Electron
 * userData directory (for log files and the database respectively).
 * This module provides a single cached lookup so the require('electron')
 * try/catch lives in one place.
 */

let cached: string | null | undefined;

/**
 * Returns the Electron `userData` directory when running inside a packaged
 * Electron app, or `null` when Electron is not available (plain Node / web).
 *
 * The result is computed once and cached for the lifetime of the process.
 */
export function getElectronUserData(): string | null {
  if (cached !== undefined) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    if (electron?.app?.getPath) {
      cached = electron.app.getPath('userData') as string;
      return cached;
    }
  } catch {
    // Electron not available (running as plain Node server)
  }

  cached = null;
  return null;
}
