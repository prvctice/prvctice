/**
 * Permission Manager
 *
 * Checks, grants, and revokes app permissions with IndexedDB persistence.
 * Implicit permissions (storage, time, theme) are granted without prompting.
 * Platform-gated permissions (clipboard, files) are denied on web.
 * All other permissions require user consent via the permission banner.
 */

import { kvGet, kvSet } from '@web/storage/storage.js';
import type { AppPermission, PermissionGrant, PermissionStore } from '@web/types/apps';
import {
  IMPLICIT_PERMISSIONS,
  PLATFORM_GATED_PERMISSIONS,
  PERMISSION_GROUPS,
} from '@web/types/apps';

// ==================== CONSTANTS ====================

const STORAGE_KEY = 'apps/permissions';

// ==================== TYPES ====================

export interface PermissionManager {
  readonly check: (
    appId: string,
    permission: AppPermission
  ) => Promise<'granted' | 'denied' | 'prompt'>;
  readonly grant: (appId: string, permission: AppPermission) => Promise<void>;
  readonly grantGroup: (appId: string, groupName: string) => Promise<void>;
  readonly revoke: (appId: string, permission: AppPermission) => Promise<void>;
  readonly revokeAll: (appId: string) => Promise<void>;
  readonly getAppGrants: (appId: string) => Promise<readonly PermissionGrant[]>;
  readonly getAllGrants: () => Promise<Readonly<Record<string, readonly PermissionGrant[]>>>;
}

// ==================== HELPERS ====================

function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

async function loadStore(): Promise<PermissionStore> {
  return (await kvGet<PermissionStore>(STORAGE_KEY)) ?? { grants: {} };
}

async function saveStore(store: PermissionStore): Promise<void> {
  await kvSet(STORAGE_KEY, store);
}

// ==================== FACTORY ====================

export function createPermissionManager(): PermissionManager {
  async function check(
    appId: string,
    permission: AppPermission
  ): Promise<'granted' | 'denied' | 'prompt'> {
    // Implicit permissions are always granted without storage access
    if (IMPLICIT_PERMISSIONS.has(permission)) {
      return 'granted';
    }

    // Platform-gated permissions are denied on web (bridge converts to PLATFORM_UNSUPPORTED)
    if (PLATFORM_GATED_PERMISSIONS.has(permission) && !isElectron()) {
      return 'denied';
    }

    // Check IndexedDB for existing grant
    const store = await loadStore();
    const appGrants = store.grants[appId] ?? [];
    const hasGrant = appGrants.some((g) => g.permission === permission);

    return hasGrant ? 'granted' : 'prompt';
  }

  async function grant(appId: string, permission: AppPermission): Promise<void> {
    const store = await loadStore();
    const appGrants = store.grants[appId] ?? [];

    // No-op if already granted
    if (appGrants.some((g) => g.permission === permission)) {
      return;
    }

    const newGrant: PermissionGrant = {
      permission,
      grantedAt: Date.now(),
    };

    const updatedGrants: readonly PermissionGrant[] = [...appGrants, newGrant];
    const updatedStore: PermissionStore = {
      grants: {
        ...store.grants,
        [appId]: updatedGrants,
      },
    };

    await saveStore(updatedStore);
  }

  async function grantGroup(appId: string, groupName: string): Promise<void> {
    const group = PERMISSION_GROUPS.find((g) => g.name === groupName);
    if (!group) return;

    for (const permission of group.permissions) {
      await grant(appId, permission);
    }
  }

  async function revoke(appId: string, permission: AppPermission): Promise<void> {
    const store = await loadStore();
    const appGrants = store.grants[appId] ?? [];

    const filtered = appGrants.filter((g) => g.permission !== permission);

    const updatedStore: PermissionStore = {
      grants: {
        ...store.grants,
        [appId]: filtered,
      },
    };

    await saveStore(updatedStore);
  }

  async function revokeAll(appId: string): Promise<void> {
    const store = await loadStore();

    // Create new grants object without this app's entry
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [appId]: _removed, ...remaining } = store.grants;

    const updatedStore: PermissionStore = {
      grants: remaining,
    };

    await saveStore(updatedStore);
  }

  async function getAppGrants(appId: string): Promise<readonly PermissionGrant[]> {
    const store = await loadStore();
    return store.grants[appId] ?? [];
  }

  async function getAllGrants(): Promise<Readonly<Record<string, readonly PermissionGrant[]>>> {
    const store = await loadStore();
    return store.grants;
  }

  return {
    check,
    grant,
    grantGroup,
    revoke,
    revokeAll,
    getAppGrants,
    getAllGrants,
  };
}
