/**
 * App Dialog Manager
 *
 * Tracks active confirm/alert dialogs per app instance.
 * Provides a reactive list for Vue rendering and lifecycle
 * management (dismiss on app close).
 *
 * Singleton pattern -- call createAppDialogManager() once,
 * subsequent calls return the same instance.
 */

import { ref, type Ref } from 'vue';

// ==================== TYPES ====================

export interface DialogOptions {
  readonly instanceId: string;
  readonly type: 'confirm' | 'alert';
  readonly title: string;
  readonly message: string;
  readonly buttons: readonly string[];
  readonly onResult: (choice: string) => void;
}

export interface DialogEntry {
  readonly dialogId: string;
  readonly instanceId: string;
  readonly type: 'confirm' | 'alert';
  readonly title: string;
  readonly message: string;
  readonly buttons: readonly string[];
}

export interface AppDialogManager {
  /** Create a dialog entry, returns dialogId */
  readonly show: (opts: DialogOptions) => string;
  /** Resolve a dialog with the user's choice and remove it */
  readonly resolve: (dialogId: string, choice: string) => void;
  /** Remove all dialogs for a given instance (called on app close) */
  readonly dismissForInstance: (instanceId: string) => void;
  /** Reactive list of active dialogs for Vue rendering */
  readonly activeDialogs: Ref<readonly DialogEntry[]>;
}

// ==================== SINGLETON ====================

let singleton: AppDialogManager | null = null;

export function createAppDialogManager(): AppDialogManager {
  if (singleton) return singleton;

  const activeDialogs: Ref<DialogEntry[]> = ref([]);
  const callbacks = new Map<string, (choice: string) => void>();

  function show(opts: DialogOptions): string {
    const dialogId = crypto.randomUUID();

    const entry: DialogEntry = {
      dialogId,
      instanceId: opts.instanceId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      buttons: opts.buttons,
    };

    callbacks.set(dialogId, opts.onResult);
    activeDialogs.value = [...activeDialogs.value, entry];

    return dialogId;
  }

  function resolve(dialogId: string, choice: string): void {
    const cb = callbacks.get(dialogId);
    if (cb) {
      callbacks.delete(dialogId);
      cb(choice);
    }
    activeDialogs.value = activeDialogs.value.filter((d) => d.dialogId !== dialogId);
  }

  function dismissForInstance(instanceId: string): void {
    // Remove callbacks for all dialogs belonging to this instance
    for (const dialog of activeDialogs.value) {
      if (dialog.instanceId === instanceId) {
        callbacks.delete(dialog.dialogId);
      }
    }
    activeDialogs.value = activeDialogs.value.filter((d) => d.instanceId !== instanceId);
  }

  singleton = {
    show,
    resolve,
    dismissForInstance,
    activeDialogs,
  };

  return singleton;
}
