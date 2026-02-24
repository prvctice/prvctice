/**
 * Files Connector
 *
 * Read-only file access. Electron-only (platform-gated).
 * On web, the permission manager denies the connector:files permission,
 * but this provides a safety net with a descriptive error message.
 */

import type { ConnectorHandler } from './types';

// ==================== TYPES ====================

declare global {
  interface Window {
    electronFiles?: {
      readFile: (path: string) => Promise<string>;
      listDirectory: (directory: string) => Promise<readonly string[]>;
    };
  }
}

// ==================== HANDLER ====================

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!window.electronFiles) {
    throw new Error('File access not available on this platform');
  }

  switch (method) {
    case 'read': {
      const path = params.path;
      if (typeof path !== 'string') {
        throw new Error('Missing path parameter');
      }
      return window.electronFiles.readFile(path);
    }

    case 'list': {
      const directory = params.directory;
      if (typeof directory !== 'string') {
        throw new Error('Missing directory parameter');
      }
      return window.electronFiles.listDirectory(directory);
    }

    default:
      throw new Error(`Unknown files method: ${method}`);
  }
}

export const filesConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
