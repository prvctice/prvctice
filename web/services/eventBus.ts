/**
 * Typed Event Bus
 * Central event emitter for Vue application communication.
 * Replaces window.dispatchEvent(new CustomEvent(...)) pattern.
 *
 * Usage:
 *   import { useEventBus } from '@web/services/eventBus';
 *   const bus = useEventBus();
 *
 *   // Emit
 *   bus.emit('panel:open', { panel: 'settings' });
 *
 *   // Listen
 *   bus.on('panel:open', ({ panel }) => { ... });
 *
 *   // Cleanup (in onUnmounted)
 *   bus.off('panel:open', handler);
 */

import type { AppEvents } from '@web/types/events';

type EventHandler<T> = (event: T) => void;
type WildcardHandler = (type: keyof AppEvents, event: unknown) => void;

interface EventBus {
  /**
   * Register an event handler
   */
  on<K extends keyof AppEvents>(type: K, handler: EventHandler<AppEvents[K]>): void;

  /**
   * Register a wildcard handler that receives all events
   */
  onAll(handler: WildcardHandler): void;

  /**
   * Remove an event handler
   */
  off<K extends keyof AppEvents>(type: K, handler: EventHandler<AppEvents[K]>): void;

  /**
   * Remove a wildcard handler
   */
  offAll(handler: WildcardHandler): void;

  /**
   * Emit an event
   */
  emit<K extends keyof AppEvents>(type: K, event?: AppEvents[K]): void;

  /**
   * Register a one-time handler
   */
  once<K extends keyof AppEvents>(type: K, handler: EventHandler<AppEvents[K]>): void;

  /**
   * Clear all handlers for an event type
   */
  clear<K extends keyof AppEvents>(type: K): void;

  /**
   * Clear all handlers
   */
  clearAll(): void;
}

/**
 * Create the event bus instance
 */
function createEventBus(): EventBus {
  const handlers = new Map<keyof AppEvents, Set<EventHandler<unknown>>>();
  const wildcardHandlers = new Set<WildcardHandler>();

  return {
    on<K extends keyof AppEvents>(type: K, handler: EventHandler<AppEvents[K]>) {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler as EventHandler<unknown>);
    },

    onAll(handler: WildcardHandler) {
      wildcardHandlers.add(handler);
    },

    off<K extends keyof AppEvents>(type: K, handler: EventHandler<AppEvents[K]>) {
      handlers.get(type)?.delete(handler as EventHandler<unknown>);
    },

    offAll(handler: WildcardHandler) {
      wildcardHandlers.delete(handler);
    },

    emit<K extends keyof AppEvents>(type: K, event?: AppEvents[K]) {
      // Call specific handlers
      handlers.get(type)?.forEach((handler) => {
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] Error in handler for "${String(type)}":`, err);
        }
      });

      // Call wildcard handlers
      wildcardHandlers.forEach((handler) => {
        try {
          handler(type, event);
        } catch (err) {
          console.error(`[EventBus] Error in wildcard handler for "${String(type)}":`, err);
        }
      });
    },

    once<K extends keyof AppEvents>(type: K, handler: EventHandler<AppEvents[K]>) {
      const onceHandler: EventHandler<AppEvents[K]> = (event) => {
        this.off(type, onceHandler);
        handler(event);
      };
      this.on(type, onceHandler);
    },

    clear<K extends keyof AppEvents>(type: K) {
      handlers.delete(type);
    },

    clearAll() {
      handlers.clear();
      wildcardHandlers.clear();
    },
  };
}

// Singleton instance
let instance: EventBus | null = null;

/**
 * Get the application event bus.
 * Returns a singleton instance.
 */
export function useEventBus(): EventBus {
  if (!instance) {
    instance = createEventBus();

    // Expose for debugging (check global for dev tools)
    if (typeof window !== 'undefined') {
      (window as unknown as { __eventBus: EventBus }).__eventBus = instance;
    }
  }
  return instance;
}

/**
 * Bridge for legacy scripts that still use window CustomEvents.
 * Call this once during app initialization to forward legacy events to the bus.
 *
 * Eventually remove this once all legacy scripts are migrated.
 */
export function initLegacyEventBridge(): void {
  const bus = useEventBus();

  // Map of legacy event names to bus event names
  const legacyEventMap: Record<string, keyof AppEvents> = {
    'settings:open': 'panel:open',
    'sidemenu:toggle': 'panel:toggle',
    'chathistory:open': 'panel:open',
    'help:open': 'panel:open',
    'skills:open': 'panel:toggle',
    themeChange: 'theme:change',
    'theme:change': 'theme:change',
    'theme:cycle': 'theme:cycle',
    'skill:prompt': 'skill:prompt',
    'skill:send-to-ai': 'skill:send-to-ai',
    'skill:save-to-notes': 'skill:save-to-notes',
    'skill:response-complete': 'skill:response-complete',
    'skill:combine': 'skill:combine',
    'skill:insert-text': 'skill:insert-text',
    'chat:new': 'chat:new',
    'chat:save-pdf': 'chat:save-pdf',
    'chat:email': 'chat:email',
    firstPromptSent: 'chat:first-prompt',
    'notes:email': 'notes:email',
    'notes:send-to-chat': 'notes:send-to-chat',
    'gamepad:toggle': 'gamepad:toggle',
    'voice:toggle': 'voice:toggle',
    'handtracking:toggle': 'handtracking:toggle',
    'modelviewer:toggle': 'modelviewer:toggle',
    'timewidget:toggle': 'timewidget:toggle',
    'grid:toggled': 'grid:toggled',
    'gesture:bind': 'gesture:bind',
    'inputbar:center': 'inputbar:center',
    'attachment:image': 'attachment:image',
    'prv:voice-input-lock': 'voice:input-lock',
    'workspace:save': 'workspace:save',
    'workspace:load': 'workspace:load',
    dotmatrixReady: 'dotmatrix:ready',
    dotmatrixSizeChange: 'dotmatrix:size-change',
    dotmatrixKeepAtmosphereChange: 'dotmatrix:atmosphere-change',
    dotmatrixEffectsChange: 'dotmatrix:effects-change',
    'thinking:start': 'thinking:start',
    'thinking:stop': 'thinking:stop',
    'prv:api-keys-updated': 'api-keys:updated',
    gamepadEnabledChange: 'gamepad:enabled-change',
    dotmatrixHandTrackButtonChange: 'handtrack:button-change',
    weatherLocationChanged: 'weather:location-changed',
    'handtrack:grabEnd': 'handtrack:grab-end',
    'reminder:scheduled': 'reminder:scheduled',
  };

  // Listen to legacy events and forward to bus
  Object.entries(legacyEventMap).forEach(([legacyName, busName]) => {
    window.addEventListener(legacyName, ((event: CustomEvent) => {
      // Transform detail for panel events
      if (busName === 'panel:open') {
        if (legacyName === 'settings:open') {
          bus.emit(busName, { panel: 'settings', pane: event.detail?.pane });
        } else if (legacyName === 'chathistory:open') {
          bus.emit(busName, { panel: 'chathistory' });
        } else if (legacyName === 'help:open') {
          bus.emit(busName, { panel: 'help' });
        }
      } else if (busName === 'panel:toggle') {
        if (legacyName === 'sidemenu:toggle') {
          bus.emit(busName, { panel: 'sidemenu' });
        } else if (legacyName === 'skills:open') {
          bus.emit(busName, { panel: 'skills' });
        }
      } else {
        // Pass through detail as-is
        bus.emit(busName, event.detail);
      }
    }) as EventListener);
  });
}

export type { EventBus, AppEvents };
