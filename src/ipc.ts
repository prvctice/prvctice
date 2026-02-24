// src/ipc.ts – small helper to register ipcMain handlers with
// consistent error serialisation so the renderer can rely on a predictable
// response shape.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import logger from './utils/logger.js';

interface IpcErrorResult {
  __error: true;
  message: string;
}

type IpcHandler<T> = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>;

/**
 * Register an IPC handler that automatically wraps the implementation in a
 * try/catch block and returns an `{ __error: true, message }` object on
 * failure.  This avoids unhandled promise rejections propagating into the
 * Electron crash reporter and gives the renderer an easy way to detect
 * failures (e.g. `if (result.__error) ...`).
 *
 * @template T
 * @param channel  Channel name passed to ipcMain.handle.
 * @param fn Handler function
 */
function register<T>(channel: string, fn: IpcHandler<T>): void {
  if (typeof channel !== 'string' || typeof fn !== 'function') {
    throw new TypeError('Invalid ipc.register arguments');
  }

  // Prevent duplicate registrations during hot reload in development.
  if (ipcMain.eventNames().includes(channel)) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(
    channel,
    async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<T | IpcErrorResult> => {
      try {
        return await fn(event, ...args);
      } catch (err) {
        logger.error('ipc_handler_error', {
          channel,
          error: (err as Error)?.message || String(err),
        });
        return { __error: true, message: (err as Error)?.message || 'Unknown error' };
      }
    }
  );
}

export { register };

// CommonJS compatibility
module.exports = { register };
