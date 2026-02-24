/**
 * VFS Appdata Namespace Handler
 *
 * Provides app-scoped key-value storage access.
 * - read('/{appId}/{key}') -> value from kv store, scoped to the calling app
 * - list('/') -> empty (key-value data is not listable)
 *
 * Security: Apps can only read their own data. If the appId in the path
 * does not match the calling appId, a VFSPermissionError is thrown.
 */

import type { VFSNamespaceHandler, VFSReadResult, VFSListResult } from '../types.js';
import { VFSPermissionError, VFSNotFoundError } from '../types.js';

export function createAppdataNamespace(): VFSNamespaceHandler {
  return {
    async read(subpath: string, appId: string): Promise<VFSReadResult> {
      const segments = subpath.split('/').filter(Boolean);
      const requestedAppId = segments[0];
      const key = segments.slice(1).join('/');

      if (!requestedAppId || !key) {
        throw new VFSNotFoundError(`/appdata${subpath}`);
      }

      // Enforce app isolation: apps can only read their own data
      if (requestedAppId !== appId) {
        throw new VFSPermissionError(
          `/appdata${subpath}`,
          `fs:appdata:read (app ${appId} cannot access data for app ${requestedAppId})`
        );
      }

      const { kvGet } = await import('@web/storage/storage.js');
      const storageKey = `app:${appId}:${key}`;
      const value = await kvGet(storageKey);

      if (value === undefined) {
        throw new VFSNotFoundError(`/appdata${subpath}`);
      }

      return {
        data: value,
        type: 'json',
      };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async list(_subpath: string, _appId: string): Promise<VFSListResult> {
      // App data is key-value, not listable
      return { entries: [] };
    },
  };
}
