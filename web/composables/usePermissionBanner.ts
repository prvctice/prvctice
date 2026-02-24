/**
 * Permission Banner Composable
 *
 * Manages the permission prompt state for a single app window.
 * When a bridge request needs an ungranted permission, the request
 * is held pending while the banner shows. Allow/Deny resolves the
 * pending promise.
 */

import { ref, type Ref } from 'vue';
import type { AppPermission } from '@web/types/apps';
import { PERMISSION_GROUPS } from '@web/types/apps';

// ==================== TYPES ====================

interface QueuedRequest {
  readonly appName: string;
  readonly permission: AppPermission;
  readonly resolve: (granted: boolean) => void;
}

export interface PermissionBannerState {
  readonly visible: Ref<boolean>;
  readonly appName: Ref<string>;
  readonly groupName: Ref<string>;
  readonly groupDescription: Ref<string>;
  readonly requestPermission: (appName: string, permission: AppPermission) => Promise<boolean>;
  readonly handleAllow: () => void;
  readonly handleDeny: () => void;
}

// ==================== COMPOSABLE ====================

export function usePermissionBanner(): PermissionBannerState {
  const visible = ref(false);
  const appName = ref('');
  const groupName = ref('');
  const groupDescription = ref('');

  let pendingResolve: ((granted: boolean) => void) | null = null;
  const queue: QueuedRequest[] = [];

  function findGroup(permission: AppPermission): { name: string; description: string } | null {
    for (const group of PERMISSION_GROUPS) {
      if (group.permissions.includes(permission)) {
        return { name: group.name, description: group.description };
      }
    }
    return null;
  }

  function showPrompt(
    name: string,
    permission: AppPermission,
    resolve: (granted: boolean) => void
  ): void {
    const group = findGroup(permission);

    appName.value = name;
    if (group) {
      groupName.value = group.name;
      groupDescription.value = group.description;
    } else {
      groupName.value = permission;
      groupDescription.value = permission;
    }

    pendingResolve = resolve;
    visible.value = true;
  }

  function processQueue(): void {
    if (queue.length === 0) return;

    const next = queue.shift()!;
    showPrompt(next.appName, next.permission, next.resolve);
  }

  function requestPermission(name: string, permission: AppPermission): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // Only one prompt at a time. Queue if one is already showing.
      if (visible.value) {
        queue.push({ appName: name, permission, resolve });
        return;
      }

      showPrompt(name, permission, resolve);
    });
  }

  function handleAllow(): void {
    visible.value = false;
    if (pendingResolve) {
      pendingResolve(true);
      pendingResolve = null;
    }
    processQueue();
  }

  function handleDeny(): void {
    visible.value = false;
    if (pendingResolve) {
      pendingResolve(false);
      pendingResolve = null;
    }
    processQueue();
  }

  return {
    visible,
    appName,
    groupName,
    groupDescription,
    requestPermission,
    handleAllow,
    handleDeny,
  };
}
