/**
 * VFS Conversations Namespace Handler
 *
 * Provides read-only access to conversation and message data.
 * - read('/') -> current conversation info
 * - read('/{id}') -> specific conversation with messages (up to 500)
 * - list('/') -> all conversations (up to 100)
 */

import type { VFSNamespaceHandler, VFSReadResult, VFSListResult } from '../types.js';
import { VFSNotFoundError } from '../types.js';

export function createConversationsNamespace(): VFSNamespaceHandler {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async read(subpath: string, _appId: string): Promise<VFSReadResult> {
      if (subpath === '' || subpath === '/') {
        // Return current conversation info
        const { activeConversationId, conversationTitle } = await import(
          '@web/stores/chat/conversation.js'
        );
        return {
          data: {
            id: activeConversationId.value,
            title: conversationTitle.value,
          },
          type: 'json',
        };
      }

      // Read specific conversation by ID
      const id = subpath.replace(/^\//, '');
      const { storage } = await import('@web/storage/storage.js');

      const conversation = await storage.conversations.get(id);
      if (!conversation) {
        throw new VFSNotFoundError(`/conversations/${id}`);
      }

      // Load messages for this conversation (up to 500)
      const messages = await storage.messages.list({
        index: { conversationId: id },
        limit: 500,
      });

      const orderedMessages = Array.isArray(messages)
        ? [...messages].sort(
            (a, b) =>
              (((a as Record<string, unknown>).createdAt as number) ?? 0) -
              (((b as Record<string, unknown>).createdAt as number) ?? 0)
          )
        : [];

      return {
        data: {
          ...(conversation as Record<string, unknown>),
          messages: orderedMessages,
        },
        type: 'json',
      };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async list(_subpath: string, _appId: string): Promise<VFSListResult> {
      const { storage } = await import('@web/storage/storage.js');

      const conversations = await storage.conversations.list({
        index: 'updatedAt',
        limit: 100,
      });

      const entries = Array.isArray(conversations)
        ? conversations.map((c: Record<string, unknown>) => ({
            name: String(c.id ?? ''),
            type: 'file' as const,
            size: 0,
            modified: Number(c.updatedAt ?? 0),
          }))
        : [];

      return { entries };
    },
  };
}
