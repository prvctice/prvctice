/**
 * Session Toasts -- nudges trial users when messages are running low.
 * Renders through the unified sileo notification system.
 */

import { watch, type WatchStopHandle } from 'vue';
import { useSessionGate } from '@web/composables/useSessionGate.js';
import { useNotifs } from '@web/composables/useNotifs';

function openApiKeys(): void {
  try {
    const win = window as unknown as {
      openApiKeysModal?: () => void;
      openSettingsModal?: () => void;
      handleMenuAction?: (action: string) => void;
    };
    if (typeof win.openApiKeysModal === 'function') {
      win.openApiKeysModal();
      return;
    }
    if (typeof win.openSettingsModal === 'function') {
      win.openSettingsModal();
      return;
    }
    if (typeof win.handleMenuAction === 'function') {
      win.handleMenuAction('api-keys');
    }
  } catch {
    // Silent
  }
}

export function useSessionToasts(): { cleanup: () => void } {
  const session = useSessionGate();
  const notifs = useNotifs();

  const stopWatch: WatchStopHandle = watch(
    () => session.messagesRemaining.value,
    (newVal, oldVal) => {
      // Guard: Don't show for unlocked users
      if (session.isUnlocked.value) return;

      // Guard: Only fire on decrement (prevents initial load and reset triggers)
      if (oldVal === undefined || newVal >= oldVal) return;

      if (newVal === 5) {
        notifs.push('warning', '5 messages remaining in free session.', {
          action: { label: 'Add Key', handler: openApiKeys },
          autoExpireMs: 5000,
        });
      }

      if (newVal === 1) {
        notifs.push('warning', 'Last free message. Add an API key to keep chatting.', {
          action: { label: 'Add Key', handler: openApiKeys },
          autoExpireMs: 5000,
        });
      }
    }
  );

  return {
    cleanup: stopWatch,
  };
}

export default useSessionToasts;
