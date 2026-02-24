/**
 * VFS Connector
 *
 * Bridges the app sandbox to the VFS namespace router.
 * Apps call prvctice.fs.read/list/stat -> connector:request with connector='vfs'
 * -> this handler -> VFS router -> namespace handler -> data returned.
 *
 * Permission enforcement happens at the VFS router level (fs:*:read permissions),
 * not at the connector level (connector:vfs is implicitly granted).
 *
 * Write operations (write, delete, listFiles) operate directly on useFileLibrary
 * (the same backing store as the Files panel) and require `connector:files`
 * permission, which is platform-gated and not implicitly granted.
 */

import type { ConnectorHandler } from './types';
import { IMPLICIT_PERMISSIONS } from '@web/types/apps';

// ==================== HELPERS ====================

async function getEffectivePermissions(appId: string): Promise<ReadonlySet<string>> {
  const { createPermissionManager } = await import('@web/services/apps/permissionManager');
  const pm = createPermissionManager();
  const grants = await pm.getAppGrants(appId);
  const permissions = new Set<string>(IMPLICIT_PERMISSIONS);
  for (const grant of grants) permissions.add(grant.permission);
  return permissions;
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const byteString = atob(b64);
  const buf = new ArrayBuffer(byteString.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < byteString.length; i++) view[i] = byteString.charCodeAt(i);
  return buf;
}

// ==================== HANDLER ====================

async function handle(
  method: string,
  params: Record<string, unknown>,
  appId: string
): Promise<unknown> {
  switch (method) {
    // ── VFS router reads ──────────────────────────────────────────────────────
    case 'read':
    case 'list':
    case 'stat': {
      const { getVFS } = await import('@web/services/vfs/index');
      const vfs = getVFS();
      const path = String(params.path ?? '/');
      const permissions = await getEffectivePermissions(appId);
      if (method === 'read') return vfs.read(path, appId, permissions);
      if (method === 'list') return vfs.list(path, appId, permissions);
      return vfs.stat(path, appId, permissions);
    }

    // ── File library writes ───────────────────────────────────────────────────

    case 'write': {
      // Write requires connector:files (platform-gated, not implicit)
      const writePerms = await getEffectivePermissions(appId);
      if (!writePerms.has('connector:files')) {
        throw new Error('Permission denied: connector:files required for write');
      }

      // Save a file to the library (appears in Files panel).
      // Returns { id, name, size, mime, thumbnailId } so callers can track the ID.
      const { useFileLibrary } = await import('@web/composables/useFileLibrary.js');
      const library = useFileLibrary();
      const base64Data = String(params.data ?? '');
      const mime = String(params.mime ?? 'application/octet-stream');
      const name = String(params.name ?? `file-${Date.now()}`);

      const buf = base64ToBuffer(base64Data);
      const blob = new Blob([buf], { type: mime });
      const file = new File([blob], name, { type: mime, lastModified: Date.now() });
      const record = await library.addFile(file);

      // Set thumbnail if provided
      let thumbnailId: string | null = null;
      const thumbBase64 = params.thumbnail ? String(params.thumbnail) : null;
      if (thumbBase64) {
        const thumbBlob = new Blob([base64ToBuffer(thumbBase64)], { type: 'image/jpeg' });
        await library.setThumbnail(record.id, thumbBlob);
        const updated = library.files.value.find((f) => f.id === record.id);
        thumbnailId = updated?.thumbnailHash ?? null;
      }

      return {
        id: record.id,
        name: record.name,
        size: record.size,
        mime: record.mimeType,
        thumbnailId,
      };
    }

    case 'delete': {
      // Delete requires connector:files (platform-gated, not implicit)
      const deletePerms = await getEffectivePermissions(appId);
      if (!deletePerms.has('connector:files')) {
        throw new Error('Permission denied: connector:files required for delete');
      }

      // Remove a file from the library by its ID (hash). Also removes thumbnail.
      const { useFileLibrary } = await import('@web/composables/useFileLibrary.js');
      const library = useFileLibrary();
      const id = String(params.id ?? '');
      if (!id) throw new Error('id is required');
      await library.removeFile(id);
      return { deleted: true, id };
    }

    case 'listFiles': {
      // listFiles requires connector:files (platform-gated, not implicit)
      const listPerms = await getEffectivePermissions(appId);
      if (!listPerms.has('connector:files')) {
        throw new Error('Permission denied: connector:files required for listFiles');
      }

      // Return full library file metadata (id, name, mime, uploadedAt, thumbnailId).
      // More useful than listBlobs — includes filenames and thumbnail hashes.
      const { useFileLibrary } = await import('@web/composables/useFileLibrary.js');
      const library = useFileLibrary();
      let fileList = library.files.value;
      const acceptParam = params.accept ? String(params.accept) : null;
      if (acceptParam) {
        const prefixes = acceptParam.split(',').map((s: string) => s.trim().replace('*', ''));
        fileList = fileList.filter((f) => {
          if (!f.mimeType) return false;
          return prefixes.some((p: string) => f.mimeType.startsWith(p));
        });
      }
      // Sort newest first
      const sorted = [...fileList].sort((a, b) => b.uploadedAt - a.uploadedAt);
      return {
        files: sorted.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mime: f.mimeType,
          uploadedAt: f.uploadedAt,
          thumbnailId: f.thumbnailHash ?? null,
        })),
      };
    }

    default:
      throw new Error(`Unknown VFS method: ${method}`);
  }
}

export const vfsConnector: ConnectorHandler = {
  tier: 'frontend',
  handle,
};
