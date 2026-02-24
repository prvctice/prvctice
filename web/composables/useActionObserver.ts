/**
 * Vue composable for the action observation system.
 * Call once in App.vue or top-level layout to initialize observation for the session.
 */

import { onMounted, onUnmounted, readonly, ref, type Ref } from 'vue';
import { getActionObserver } from '@web/services/actionObserver.js';
import type { ActionRecord } from '@web/types/observation.js';

const REFRESH_INTERVAL_MS = 10_000;

export function useActionObserver(): {
  actions: Readonly<Ref<ReadonlyArray<ActionRecord>>>;
  isEnabled: Readonly<Ref<boolean>>;
  sessionId: Readonly<Ref<string>>;
} {
  const observer = getActionObserver();
  const actions = ref<ReadonlyArray<ActionRecord>>([]);
  const isEnabled = ref(observer.isEnabled());
  const sessionId = ref(observer.getSessionId());

  let cleanupFn: (() => void) | null = null;
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    cleanupFn = observer.initialize();
    actions.value = observer.getActions();

    refreshInterval = setInterval(() => {
      actions.value = observer.getActions();
    }, REFRESH_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (refreshInterval !== null) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    observer.destroy();
  });

  return {
    actions: readonly(actions) as Readonly<Ref<ReadonlyArray<ActionRecord>>>,
    isEnabled: readonly(isEnabled),
    sessionId: readonly(sessionId),
  };
}
