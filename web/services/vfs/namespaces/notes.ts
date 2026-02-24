/**
 * VFS Notes Namespace Handler
 *
 * Provides read-only access to notes data.
 * Notes are stored in the localStorage mirror as HTML content.
 * - read('/') -> active note content
 * - read('/{id}') -> specific note content (plain text extracted from HTML)
 * - list('/') -> all note tabs
 */

import type { VFSNamespaceHandler, VFSReadResult, VFSListResult } from '../types.js';
import { VFSNotFoundError } from '../types.js';

/** Strip HTML tags to extract plain text content */
function htmlToPlainText(html: string): string {
  // Replace block-level elements with newlines
  let text = html.replace(/<\/?(p|div|br|h[1-6]|li|ul|ol|blockquote)[^>]*>/gi, '\n');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

export function createNotesNamespace(): VFSNamespaceHandler {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async read(subpath: string, _appId: string): Promise<VFSReadResult> {
      const { storage } = await import('@web/storage/storage.js');

      if (subpath === '' || subpath === '/') {
        // Return active note
        const activeId = storage.mirror.get('notesActiveTabId');
        const id = activeId || 't_default';
        const html = storage.mirror.get(`tab:${id}:html`) ?? '';
        return {
          data: {
            id,
            content: htmlToPlainText(html),
          },
          type: 'json',
        };
      }

      // Read specific note by ID
      const id = subpath.replace(/^\//, '');
      const html = storage.mirror.get(`tab:${id}:html`);

      if (html === null) {
        throw new VFSNotFoundError(`/notes/${id}`);
      }

      // Also look up tab metadata for the title
      const tabsMeta = storage.mirror.getJSON('notesTabsMeta') as Array<{
        id: string;
        title?: string;
      }> | null;
      const meta = tabsMeta?.find((t) => t.id === id);

      return {
        data: {
          id,
          title: meta?.title ?? 'Untitled',
          content: htmlToPlainText(html),
        },
        type: 'json',
      };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async list(_subpath: string, _appId: string): Promise<VFSListResult> {
      const { storage } = await import('@web/storage/storage.js');

      const tabsMeta = storage.mirror.getJSON('notesTabsMeta') as Array<{
        id: string;
        title?: string;
        createdAt?: number;
      }> | null;

      if (!tabsMeta || !Array.isArray(tabsMeta)) {
        return { entries: [] };
      }

      const entries = tabsMeta.map((tab) => ({
        name: tab.id,
        type: 'file' as const,
        size: 0,
        modified: tab.createdAt ?? 0,
      }));

      return { entries };
    },
  };
}
