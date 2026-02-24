/**
 * VFS Permission Mapping
 *
 * Derives permission strings from VFS paths.
 * Permission format: `fs:{namespace}:read`
 */

import { VFSNotFoundError } from './types.js';

/** Valid VFS namespace prefixes */
const VALID_NAMESPACES: ReadonlySet<string> = new Set([
  'conversations',
  'notes',
  'blobs',
  'skills',
  'appdata',
]);

/**
 * Extract permission string from a VFS path.
 *
 * @param path - VFS path (e.g. '/conversations/abc')
 * @returns Permission string (e.g. 'fs:conversations:read')
 * @throws VFSNotFoundError if the namespace prefix is unknown
 */
export function pathToPermission(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const namespace = segments[0];

  if (!namespace || !VALID_NAMESPACES.has(namespace)) {
    throw new VFSNotFoundError(path);
  }

  return `fs:${namespace}:read`;
}
