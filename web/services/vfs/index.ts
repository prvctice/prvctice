/**
 * VFS Namespace Router
 *
 * Routes path-based reads to the correct namespace handler.
 * Enforces permission checks before delegating to handlers.
 *
 * Usage:
 *   const vfs = getVFS();
 *   const result = await vfs.read('/conversations/abc', appId, permissions);
 */

import type {
  VFSRouter,
  VFSNamespaceHandler,
  VFSReadResult,
  VFSListResult,
  VFSStat,
} from './types.js';
import { VFSPermissionError, VFSNotFoundError } from './types.js';
import { pathToPermission } from './permissions.js';

// ==================== ROUTER FACTORY ====================

interface ResolvedHandler {
  readonly handler: VFSNamespaceHandler;
  readonly subpath: string;
}

function createRouter(): VFSRouter {
  const mounts = new Map<string, VFSNamespaceHandler>();

  /**
   * Resolve a path to its namespace handler and remaining subpath.
   * Uses longest-prefix matching.
   */
  function resolveHandler(path: string): ResolvedHandler | null {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    let bestMatch: ResolvedHandler | null = null;
    let bestLen = 0;

    for (const [prefix, handler] of mounts) {
      if (normalized === prefix || normalized.startsWith(prefix + '/')) {
        if (prefix.length > bestLen) {
          bestLen = prefix.length;
          const subpath = normalized.slice(prefix.length);
          bestMatch = { handler, subpath: subpath || '/' };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Check permissions and resolve handler for a path.
   */
  function checkAndResolve(path: string, permissions: ReadonlySet<string>): ResolvedHandler {
    const required = pathToPermission(path);
    if (!permissions.has(required)) {
      throw new VFSPermissionError(path, required);
    }

    const resolved = resolveHandler(path);
    if (!resolved) {
      throw new VFSNotFoundError(path);
    }

    return resolved;
  }

  return {
    mount(prefix: string, handler: VFSNamespaceHandler): void {
      const normalized = prefix.startsWith('/') ? prefix : `/${prefix}`;
      mounts.set(normalized, handler);
    },

    async read(
      path: string,
      appId: string,
      permissions: ReadonlySet<string>
    ): Promise<VFSReadResult> {
      const { handler, subpath } = checkAndResolve(path, permissions);
      return handler.read(subpath, appId);
    },

    async list(
      path: string,
      appId: string,
      permissions: ReadonlySet<string>
    ): Promise<VFSListResult> {
      const { handler, subpath } = checkAndResolve(path, permissions);
      return handler.list(subpath, appId);
    },

    async stat(path: string, appId: string, permissions: ReadonlySet<string>): Promise<VFSStat> {
      const { handler, subpath } = checkAndResolve(path, permissions);
      if (handler.stat) {
        return handler.stat(subpath, appId);
      }
      // Default: if handler has no stat, report not found
      return { exists: false, type: 'file', size: 0, modified: 0 };
    },
  };
}

// ==================== SINGLETON ====================

let vfs: VFSRouter | null = null;

/**
 * Create the VFS router with all namespace handlers mounted.
 * Namespace handlers are lazy-imported to avoid circular dependencies.
 */
export function createVFS(): VFSRouter {
  const router = createRouter();

  // Mount namespace handlers via lazy imports
  // Each handler is created asynchronously to avoid circular deps
  const mountAsync = async (
    prefix: string,
    importFn: () => Promise<VFSNamespaceHandler>
  ): Promise<void> => {
    const handler = await importFn();
    router.mount(prefix, handler);
  };

  // Fire-and-forget -- handlers are mounted asynchronously
  // By the time apps request VFS access, handlers will be ready
  mountAsync('/conversations', async () => {
    const { createConversationsNamespace } = await import('./namespaces/conversations.js');
    return createConversationsNamespace();
  });

  mountAsync('/notes', async () => {
    const { createNotesNamespace } = await import('./namespaces/notes.js');
    return createNotesNamespace();
  });

  mountAsync('/blobs', async () => {
    const { createBlobsNamespace } = await import('./namespaces/blobs.js');
    return createBlobsNamespace();
  });

  mountAsync('/skills', async () => {
    const { createSkillsNamespace } = await import('./namespaces/skills.js');
    return createSkillsNamespace();
  });

  mountAsync('/appdata', async () => {
    const { createAppdataNamespace } = await import('./namespaces/appdata.js');
    return createAppdataNamespace();
  });

  vfs = router;
  return router;
}

/**
 * Get the VFS singleton. Creates it on first access.
 */
export function getVFS(): VFSRouter {
  if (!vfs) {
    return createVFS();
  }
  return vfs;
}
