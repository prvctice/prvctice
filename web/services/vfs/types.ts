/**
 * VFS Type Definitions
 *
 * Virtual File System types for read-only path-based access to host data.
 * The VFS is a thin routing layer over existing storage engines -- not a new storage system.
 */

// ==================== READ RESULTS ====================

export type VFSDataType = 'json' | 'text' | 'binary';

export interface VFSReadResult {
  readonly data: unknown;
  readonly type: VFSDataType;
  /** MIME type of the data (e.g. 'image/png'). Optional. */
  readonly mime?: string;
}

// ==================== LIST / ENTRY ====================

export type VFSEntryType = 'file' | 'directory';

export interface VFSEntry {
  readonly name: string;
  readonly type: VFSEntryType;
  readonly size: number;
  readonly modified: number;
  /** MIME type for file entries (e.g. 'image/png'). Optional. */
  readonly mime?: string;
}

export interface VFSListResult {
  readonly entries: readonly VFSEntry[];
}

// ==================== STAT ====================

export interface VFSStat {
  readonly exists: boolean;
  readonly type: VFSEntryType;
  readonly size: number;
  readonly modified: number;
}

// ==================== NAMESPACE HANDLER ====================

export interface VFSNamespaceHandler {
  read(subpath: string, appId: string): Promise<VFSReadResult>;
  list(subpath: string, appId: string): Promise<VFSListResult>;
  stat?(subpath: string, appId: string): Promise<VFSStat>;
}

// ==================== ROUTER ====================

export interface VFSRouter {
  mount(prefix: string, handler: VFSNamespaceHandler): void;
  read(path: string, appId: string, permissions: ReadonlySet<string>): Promise<VFSReadResult>;
  list(path: string, appId: string, permissions: ReadonlySet<string>): Promise<VFSListResult>;
  stat(path: string, appId: string, permissions: ReadonlySet<string>): Promise<VFSStat>;
}

// ==================== ERRORS ====================

export class VFSPermissionError extends Error {
  readonly path: string;
  readonly requiredPermission: string;

  constructor(path: string, requiredPermission: string) {
    super(`VFS permission denied: ${requiredPermission} required for ${path}`);
    this.name = 'VFSPermissionError';
    this.path = path;
    this.requiredPermission = requiredPermission;
  }
}

export class VFSNotFoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`VFS path not found: ${path}`);
    this.name = 'VFSNotFoundError';
    this.path = path;
  }
}
