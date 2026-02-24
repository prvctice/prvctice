/**
 * Clipboard Connector
 *
 * System clipboard access. Electron-only (platform-gated).
 * On web, the permission manager denies the connector:clipboard permission,
 * but this provides a safety net with a descriptive error message.
 */

import type { ConnectorHandler } from './types';

// ==================== TYPES ====================

declare global {
  interface Window {
    electronClipboard?: {
      readText: () => Promise<string>;
      writeText: (text: string) => Promise<boolean>;
    };
  }
}

// ==================== HANDLER ====================

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!window.electronClipboard) {
    throw new Error('Clipboard not available on this platform');
  }

  switch (method) {
    case 'readText':
      return window.electronClipboard.readText();

    case 'writeText': {
      const text = params.text;
      if (typeof text !== 'string') {
        throw new Error('Missing text parameter');
      }
      return window.electronClipboard.writeText(text);
    }

    default:
      throw new Error(`Unknown clipboard method: ${method}`);
  }
}

export const clipboardConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
