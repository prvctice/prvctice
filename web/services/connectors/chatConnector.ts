/**
 * Chat Connector
 *
 * Gives apps read access to the current conversation and the ability
 * to send messages. All data is sanitized to a safe shape before
 * being returned (no base64 images, no internal metadata).
 */

import { useChatStore } from '@web/stores/chat.js';
import { activeConversationId, conversationTitle } from '@web/stores/chat/conversation.js';
import type { ConnectorHandler } from './types';

// ==================== CONSTANTS ====================

const MAX_MESSAGES = 200;
const MAX_SEND_LENGTH = 4000;

// ==================== HANDLER ====================

async function handle(
  method: string,
  params: Record<string, unknown>,
  appId: string
): Promise<unknown> {
  void appId;
  const store = useChatStore();

  switch (method) {
    case 'getMessages': {
      const limit = Math.min(Math.max(1, Number(params.limit) || 50), MAX_MESSAGES);
      const offset = Math.max(0, Number(params.offset) || 0);

      const msgs = store.messages.slice(offset, offset + limit);
      return msgs.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        createdAt: m.createdAt,
      }));
    }

    case 'getConversation': {
      return {
        id: activeConversationId.value,
        title: conversationTitle.value,
        messageCount: store.messages.length,
      };
    }

    case 'sendMessage': {
      const text = String(params.text ?? '').trim();
      if (!text) throw new Error('Message text is required');
      if (text.length > MAX_SEND_LENGTH) {
        throw new Error(`Message exceeds ${MAX_SEND_LENGTH} character limit`);
      }
      if (store.sending) {
        throw new Error('A message is already being sent');
      }
      await store.send(text);
      return { sent: true };
    }

    default:
      throw new Error(`Unknown chat method: ${method}`);
  }
}

export const chatConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
