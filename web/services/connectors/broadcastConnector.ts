/**
 * Broadcast Connector
 *
 * Validates broadcast channel names and data. The actual fan-out
 * to subscribers is handled by appManager, not here. This connector
 * only validates the publish request.
 */

import type { ConnectorHandler } from './types';

// ==================== CONSTANTS ====================

const MAX_CHANNEL_LENGTH = 128;
const CHANNEL_PATTERN = /^[a-zA-Z0-9._\-:/]+$/;

// ==================== HANDLER ====================

async function handle(
  method: string,
  params: Record<string, unknown>,
  appId: string
): Promise<unknown> {
  void appId;
  switch (method) {
    case 'publish': {
      const channel = String(params.channel ?? '');
      if (!channel) throw new Error('Channel name is required');
      if (channel.length > MAX_CHANNEL_LENGTH) {
        throw new Error(`Channel name exceeds ${MAX_CHANNEL_LENGTH} characters`);
      }
      if (!CHANNEL_PATTERN.test(channel)) {
        throw new Error('Channel name contains invalid characters (use alphanumeric, . _ - : /)');
      }
      // Data is passed through as-is; appManager handles fan-out
      return { published: true, channel };
    }

    default:
      throw new Error(`Unknown broadcast method: ${method}`);
  }
}

export const broadcastConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
