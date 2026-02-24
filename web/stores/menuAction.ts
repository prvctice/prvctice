/**
 * Menu Action Store
 * Central dispatcher for all menu actions and modal visibility states.
 * Replaces scattered window globals with a unified Pinia store.
 */
import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import { saveChatAsPdf } from '@web/services/pdf.js';
import { saveWorkspaceToFile, promptWorkspaceImport } from '@web/services/workspace.js';
import { useChatHistoryUi } from '@web/composables/useChatHistoryUi.js';
import { useGamesModal } from '@web/composables/useGamesModal.js';
import { storage } from '@web/storage/storage.js';
import { logError } from '@web/utils/debugLog.js';

type SettingsPane =
  | 'themes'
  | 'effects'
  | 'ai'
  | 'keys'
  | 'system'
  | 'skills'
  | 'suggestions'
  | 'characters'
  | 'accessibility';

type MenuAction =
  | 'new-chat'
  | 'save-pdf'
  | 'chat-history'
  | 'file-library'
  | 'games'
  | 'themes'
  | 'effects'
  | 'ai'
  | 'model'
  | 'api-keys'
  | 'system'
  | 'settings'
  | 'suggestions'
  | 'toggle-grid'
  | 'save-workflow'
  | 'load-workflow'
  | 'help'
  | 'voice-commands'
  | 'about';

export const useMenuActionStore = defineStore('menuAction', () => {
  // Modal visibility states
  const settingsModalOpen: Ref<boolean> = ref(false);
  const activePane: Ref<SettingsPane> = ref('themes');

  // Track side menu close callback (set by useSideMenu)
  let closeSideMenuFn: (() => void) | null = null;

  function setCloseSideMenuFn(fn: (() => void) | null): void {
    closeSideMenuFn = fn;
  }

  function closeSideMenu(): void {
    if (typeof closeSideMenuFn === 'function') {
      closeSideMenuFn();
    }
  }

  // Map legacy pane names to new ones
  const paneMapping: Record<string, SettingsPane> = {
    appearance: 'themes',
    model: 'ai',
    prefs: 'effects',
  };

  // Open settings modal to a specific pane
  function openSettings(pane: SettingsPane | string = 'themes'): void {
    activePane.value = (paneMapping[pane] || pane) as SettingsPane;
    settingsModalOpen.value = true;
  }

  function closeSettings(): void {
    settingsModalOpen.value = false;
  }

  // Central action dispatcher
  function dispatch(action: MenuAction | string): void {
    switch (action) {
      case 'new-chat': {
        const proceed = window.confirm(
          'Start a new chat? This will clear the current conversation.'
        );
        if (proceed && typeof window.startNewChat === 'function') {
          window.startNewChat();
        }
        break;
      }

      case 'save-pdf': {
        saveChatAsPdf().catch((err: Error) => {
          logError('chat', 'pdf:saveFailed', err);
        });
        break;
      }

      case 'chat-history': {
        const historyUi = useChatHistoryUi();
        historyUi.open();
        closeSideMenu();
        break;
      }

      case 'file-library': {
        import('@web/composables/useDocumentBrowser').then(({ useDocumentBrowser }) => {
          useDocumentBrowser().open();
        });
        closeSideMenu();
        break;
      }

      case 'games': {
        const gamesModal = useGamesModal();
        gamesModal.open();
        closeSideMenu();
        break;
      }

      case 'themes': {
        openSettings('themes');
        closeSideMenu();
        break;
      }

      case 'effects': {
        openSettings('effects');
        closeSideMenu();
        break;
      }

      case 'ai': {
        openSettings('ai');
        closeSideMenu();
        break;
      }

      case 'model': {
        // Legacy support
        openSettings('ai');
        closeSideMenu();
        break;
      }

      case 'api-keys': {
        openSettings('ai');
        closeSideMenu();
        break;
      }

      case 'system': {
        openSettings('system');
        closeSideMenu();
        break;
      }

      case 'skills': {
        openSettings('skills');
        closeSideMenu();
        break;
      }

      case 'gallery': {
        import('@web/composables/useAppsModal').then(({ useAppsModal }) => {
          useAppsModal().open();
        });
        closeSideMenu();
        break;
      }

      case 'suggestions': {
        openSettings('suggestions');
        closeSideMenu();
        break;
      }

      case 'characters': {
        openSettings('characters');
        closeSideMenu();
        break;
      }

      case 'settings': {
        // Default settings action opens themes
        openSettings('themes');
        closeSideMenu();
        break;
      }

      case 'toggle-grid': {
        const gridOverlay = document.getElementById('grid-overlay');
        if (gridOverlay) {
          const hidden = gridOverlay.classList.toggle('hidden');
          const bar = document.getElementById('bar');
          let showRulerPref = storage.mirror.get('showRulerPreference');
          if (showRulerPref === null) showRulerPref = 'true';
          const allowRuler = showRulerPref === 'true';
          if (bar) bar.classList.toggle('show-ruler', !hidden && allowRuler);
          const btn = document.getElementById('menu-grid-toggle-button');
          if (btn) btn.classList.toggle('active', !hidden);
          if (window.electronGrid && typeof window.electronGrid.setGridState === 'function') {
            window.electronGrid.setGridState(!hidden);
          }
        }
        break;
      }

      case 'save-workflow': {
        saveWorkspaceToFile();
        break;
      }

      case 'load-workflow': {
        promptWorkspaceImport();
        break;
      }

      case 'help': {
        if (typeof window.openHelpPane === 'function') {
          window.openHelpPane();
        } else if (typeof window.appendNotifs === 'function') {
          window.appendNotifs('info', 'Help pane not available');
        }
        closeSideMenu();
        break;
      }

      case 'voice-commands': {
        if (typeof window.openVoiceCommandsPane === 'function') {
          window.openVoiceCommandsPane();
        } else if (typeof window.appendNotifs === 'function') {
          window.appendNotifs('info', 'Voice commands pane not available');
        }
        closeSideMenu();
        break;
      }

      case 'about': {
        if (typeof window.openAboutPane === 'function') {
          window.openAboutPane();
        } else if (typeof window.appendNotifs === 'function') {
          window.appendNotifs('info', 'About pane not available');
        }
        closeSideMenu();
        break;
      }

      case 'search': {
        import('@web/composables/useSearchModal').then(({ useSearchModal }) => {
          useSearchModal().open();
        });
        closeSideMenu();
        break;
      }

      default: {
        if (typeof window.appendNotifs === 'function') {
          window.appendNotifs('info', `"${action}" coming soon.`);
        }
      }
    }
  }

  return {
    // State
    settingsModalOpen,
    activePane,

    // Actions
    dispatch,
    openSettings,
    closeSettings,
    setCloseSideMenuFn,
  };
});

export default { useMenuActionStore };
