/**
 * Window Manager Composable
 *
 * Singleton composable that tracks open app windows and provides
 * launch/close/focus orchestration. HTML apps route through appManager;
 * vue-internal apps skip the iframe sandbox entirely.
 *
 * Flow: openWindow(definition) adds entry to map → v-for renders AppWindow →
 * AppWindow.onMounted calls mountApp(instanceId, container) for HTML apps.
 *
 * Position/size persistence is NOT handled here -- that's the responsibility
 * of useFloatingWidget inside each AppWindow.vue instance.
 */

import { ref, computed } from 'vue';
import type { AppDefinition, WindowEntry } from '@web/types/apps';
import type { AppManager } from '@web/services/apps/appManager';
import { useNotifs } from '@web/composables/useNotifs';
import { useEventBus } from '@web/services/eventBus';
import { debugLog } from '@web/utils/debugLog.js';

// ==================== CONSTANTS ====================

const SOFT_LIMIT = 8;
const CASCADE_OFFSET = 30;
const CASCADE_WRAP = 6;
const BASE_LEFT = 80;
const BASE_TOP = 80;

// ==================== MODULE-SCOPED STATE (singleton) ====================

const windows = ref(new Map<string, WindowEntry>());
const activeWindowId = ref<string | null>(null);
let cascadeIndex = 0;
let appManagerRef: AppManager | null = null;

// ==================== INIT ====================

/**
 * Initialize the window manager with a reference to the app manager.
 * Call once during app startup (e.g., in AppShell.vue).
 */
export function initWindowManager(appManager: AppManager): void {
  appManagerRef = appManager;
  debugLog('windowManager', 'initialized');
}

// ==================== COMPOSABLE ====================

export function useWindowManager() {
  const notifs = useNotifs();

  // ==================== COMPUTED ====================

  const windowList = computed(() => [...windows.value.values()]);
  const windowCount = computed(() => windows.value.size);

  // ==================== METHODS ====================

  /**
   * Register a window entry in the map. Triggers v-for → AppWindow renders.
   * For HTML apps, call mountApp() from AppWindow.onMounted to create the iframe.
   */
  function openWindow(definition: AppDefinition): string {
    // Soft limit warning (non-blocking)
    if (windows.value.size >= SOFT_LIMIT) {
      notifs.push('warning', 'Performance Warning', {
        description: 'Multiple apps are open. Performance may be affected.',
      });
    }

    const instanceId = crypto.randomUUID();

    const entry: WindowEntry = {
      instanceId,
      appId: definition.id,
      definition,
    };

    // Immutable map update
    windows.value = new Map([...windows.value, [instanceId, entry]]);

    debugLog('windowManager', 'openWindow', {
      appId: definition.id,
      instanceId,
      type: definition.type,
    });

    // Auto-open companion app if specified and not already open
    if (definition.companion) {
      const companionId = definition.companion;
      const alreadyOpen = [...windows.value.values()].some((w) => w.appId === companionId);
      if (!alreadyOpen) {
        void (async () => {
          try {
            const { createAppRegistry } = await import('@web/services/apps/appRegistry');
            const registry = createAppRegistry();
            const companionDef = await registry.get(companionId);
            if (companionDef) {
              openWindow(companionDef);
            }
          } catch {
            debugLog('windowManager', 'companion:failed', { companionId });
          }
        })();
      }
    }

    return instanceId;
  }

  /**
   * Mount an HTML app's iframe into a container element.
   * Called by AppWindow.onMounted after the component renders.
   * Returns the appManager instanceId on success, null on failure.
   */
  async function mountApp(instanceId: string, container: HTMLElement): Promise<string | null> {
    const entry = windows.value.get(instanceId);
    if (!entry) {
      debugLog('windowManager', 'mountApp:no-entry', { instanceId });
      return null;
    }

    if (entry.definition.type !== 'html') {
      // vue-internal apps don't need mounting
      return instanceId;
    }

    if (!appManagerRef) {
      debugLog('windowManager', 'mountApp:no-appManager');
      return null;
    }

    const instance = await appManagerRef.launch(entry.definition, container);
    if (!instance) {
      // appManager already handles error toasts
      closeApp(instanceId);
      return null;
    }

    // Store appManager's instanceId for cleanup (immutable update)
    const updated: WindowEntry = {
      ...entry,
      appInstanceId: instance.instanceId,
    };
    windows.value = new Map([...windows.value, [instanceId, updated]]);

    debugLog('windowManager', 'mountApp', {
      instanceId,
      appInstanceId: instance.instanceId,
    });

    return instance.instanceId;
  }

  function closeApp(instanceId: string): void {
    const entry = windows.value.get(instanceId);
    if (!entry) return;

    // HTML apps need appManager cleanup (sandbox teardown, watchdog, etc.)
    if (entry.definition.type === 'html' && appManagerRef) {
      // Use appManager's instanceId if available, fall back to windowManager's
      const closeId = entry.appInstanceId ?? instanceId;
      appManagerRef.close(closeId, 'user');
    }

    // Clear active window if it matches
    if (activeWindowId.value === instanceId) {
      activeWindowId.value = null;
    }

    // Immutable map update (remove entry)
    const next = new Map(windows.value);
    next.delete(instanceId);
    windows.value = next;

    // Reset cascade when all windows are closed
    if (windows.value.size === 0) {
      cascadeIndex = 0;
    }

    debugLog('windowManager', 'closeApp', { instanceId });
  }

  function focusWindow(instanceId: string): void {
    // No-op if window doesn't exist
    if (!windows.value.has(instanceId)) return;
    // Actual z-index management happens in FloatingWidget's bringToFront()
    // This method is a coordination point that AppWindow.vue will call
    activeWindowId.value = instanceId;

    const entry = windows.value.get(instanceId);
    if (entry) {
      const bus = useEventBus();
      bus.emit('app:focused', {
        appId: entry.appId,
        instanceId,
        appName: entry.definition.name,
      });
    }

    debugLog('windowManager', 'focusWindow', { instanceId });
  }

  function getActiveWindow(): WindowEntry | undefined {
    if (!activeWindowId.value) return undefined;
    return windows.value.get(activeWindowId.value);
  }

  function getCascadePosition(): { left: number; top: number } {
    // Mobile: always full-viewport at origin
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return { left: 0, top: 0 };
    }

    const left = BASE_LEFT + cascadeIndex * CASCADE_OFFSET;
    const top = BASE_TOP + cascadeIndex * CASCADE_OFFSET;

    cascadeIndex = (cascadeIndex + 1) % CASCADE_WRAP;

    // Clamp to 80% of viewport to leave room
    const maxLeft = typeof window !== 'undefined' ? window.innerWidth * 0.8 : 1200;
    const maxTop = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 800;

    return {
      left: Math.min(left, maxLeft),
      top: Math.min(top, maxTop),
    };
  }

  function getWindow(instanceId: string): WindowEntry | undefined {
    return windows.value.get(instanceId);
  }

  /**
   * Get the app instance ID for a given window manager instance ID.
   * Returns undefined if not found or not mounted.
   */
  function getAppInstance(instanceId: string): string | undefined {
    const entry = windows.value.get(instanceId);
    return entry?.appInstanceId;
  }

  /**
   * Send a message to an app's iframe via the app manager bridge.
   * Used for host-to-iframe communication (e.g., nav:back).
   */
  function sendMessageToApp(instanceId: string, message: Record<string, unknown>): void {
    const entry = windows.value.get(instanceId);
    if (!entry || !appManagerRef) return;
    const closeId = entry.appInstanceId ?? instanceId;
    appManagerRef.sendMessage(closeId, message);
  }

  /**
   * Update a window's title (definition.name). Used by app generator
   * to show pipeline status ("Designing...", "Assembling...", etc.).
   */
  function updateWindowTitle(instanceId: string, name: string): void {
    const entry = windows.value.get(instanceId);
    if (!entry) return;

    const updated: WindowEntry = {
      ...entry,
      definition: { ...entry.definition, name },
    };
    windows.value = new Map([...windows.value, [instanceId, updated]]);
  }

  /**
   * Close an app window and immediately reopen it with a fresh definition
   * from the registry. Used after code edits to remount with updated HTML.
   */
  async function reopenApp(instanceId: string): Promise<string | null> {
    const entry = windows.value.get(instanceId);
    if (!entry) return null;

    const appId = entry.appId;
    closeApp(instanceId);

    // Fetch fresh definition from registry
    const { createAppRegistry } = await import('@web/services/apps/appRegistry');
    const registry = createAppRegistry();
    const freshDef = await registry.get(appId);
    if (!freshDef) return null;

    const newInstanceId = openWindow(freshDef);
    return newInstanceId;
  }

  return {
    windowList,
    windowCount,
    activeWindowId,
    openWindow,
    mountApp,
    closeApp,
    focusWindow,
    getActiveWindow,
    getCascadePosition,
    getWindow,
    getAppInstance,
    sendMessageToApp,
    updateWindowTitle,
    reopenApp,
  };
}
