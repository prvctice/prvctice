/**
 * VFS Blobs Namespace Handler
 *
 * Provides read-only access to blob storage (OPFS).
 * - read('/{hash}') -> blob binary data
 * - list('/') -> all blob records with metadata (hash, mime, size, modified)
 */

import type { VFSNamespaceHandler, VFSReadResult, VFSListResult, VFSEntry } from '../types.js';
import { VFSNotFoundError } from '../types.js';

export function createBlobsNamespace(): VFSNamespaceHandler {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async read(subpath: string, _appId: string): Promise<VFSReadResult> {
      const hash = subpath.replace(/^\//, '');
      if (!hash) {
        throw new VFSNotFoundError('/blobs/');
      }

      const { blobGetByHash, docGet } = await import('@web/storage/storage.js');
      const file = await blobGetByHash(hash);

      if (!file) {
        throw new VFSNotFoundError(`/blobs/${hash}`);
      }

      // Look up mime from blob metadata, fall back to file.type
      let mime = file.type || 'application/octet-stream';
      try {
        const record = await docGet<{ mime: string }>('blobs', hash);
        if (record?.mime) mime = record.mime;
      } catch (_) {
        /* ignore */
      }

      const buffer = await file.arrayBuffer();
      return {
        data: buffer,
        type: 'binary',
        mime,
      };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async list(_subpath: string, _appId: string): Promise<VFSListResult> {
      const { docList } = await import('@web/storage/storage.js');

      interface BlobRecord {
        id: string;
        hash: string;
        mime: string;
        size: number;
        createdAt: number;
        updatedAt: number;
        [key: string]: unknown;
      }

      const records = await docList<BlobRecord>('blobs');
      const entries: VFSEntry[] = records.map((rec) => ({
        name: rec.hash,
        type: 'file' as const,
        size: rec.size,
        modified: rec.updatedAt || rec.createdAt,
        mime: rec.mime,
      }));

      return { entries };
    },
  };
}
