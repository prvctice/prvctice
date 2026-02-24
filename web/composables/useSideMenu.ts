// Vue-side wiring for the Side Menu interactions.
// Now uses the menuAction Pinia store for action dispatch.

import { animate } from '@motionone/dom';
import { handleElectronWorkspaceLoad, type WorkspacePayload } from '@web/services/workspace.js';
import {
  prefersReducedMotion,
  motionDurations,
  motionEasings,
} from '@web/composables/useMotion.js';
import { useMenuActionStore } from '@web/stores/menuAction.js';
import { saveChatAsPdf } from '@web/services/pdf.js';
import { saveWorkspaceToFile } from '@web/services/workspace.js';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import { logError } from '@web/utils/debugLog.js';
// Window types imported from global.d.ts

interface UseSideMenuReturn {
  init: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
}

// Animation return type from motion-one
interface AnimationController {
  finished: Promise<void>;
  cancel: () => void;
}

export function useSideMenu(): UseSideMenuReturn {
  let menuButton: HTMLElement | null = null;
  let sideMenu: HTMLElement | null = null;
  let lastFocused: Element | null = null;
  let initialized = false;
  let menuAnimation: AnimationController | null = null;

  function isOpen(): boolean {
    return !!(sideMenu && sideMenu.classList.contains('open'));
  }

  function stopMenuAnimation(): void {
    if (menuAnimation && typeof menuAnimation.cancel === 'function') {
      try {
        menuAnimation.cancel();
      } catch (_) {}
    }
    menuAnimation = null;
    resetMenuStyles();
  }

  function resetMenuStyles(): void {
    if (!sideMenu) return;
    sideMenu.style.removeProperty('opacity');
    sideMenu.style.removeProperty('transform');
  }

  function setExpanded(expanded: boolean): void {
    if (menuButton) menuButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function focusFirstItem(): void {
    if (!sideMenu) return;
    const focusables = sideMenu.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables && focusables[0];
    if (first && typeof (first as HTMLElement).focus === 'function') {
      try {
        (first as HTMLElement).focus();
      } catch (_) {}
    } else {
      // Make the menu itself focusable as a last resort
      if (!sideMenu.hasAttribute('tabindex')) sideMenu.setAttribute('tabindex', '-1');
      try {
        sideMenu.focus();
      } catch (_) {}
    }
  }

  function openMenu(): void {
    if (!sideMenu) return;
    stopMenuAnimation();
    // Remember current focus to restore on close
    try {
      lastFocused = document.activeElement;
    } catch (_) {
      lastFocused = null;
    }
    sideMenu.classList.add('is-motion-driven');
    sideMenu.classList.add('open');
    sideMenu.removeAttribute('inert');
    sideMenu.setAttribute('aria-hidden', 'false');
    setExpanded(true);
    const durations = motionDurations();
    const easings = motionEasings();
    const reduced = prefersReducedMotion();
    if (!reduced) {
      sideMenu.style.opacity = '0';
      sideMenu.style.transform = 'translateX(24px)';
      menuAnimation = animate(
        sideMenu,
        {
          opacity: [0, 1],
          transform: ['translateX(24px)', 'translateX(0)'],
        },
        {
          duration: durations.fade,
          easing: easings.emphasis,
          fill: 'forwards',
        } as unknown as Parameters<typeof animate>[2]
      ) as AnimationController;
      menuAnimation.finished
        .catch(() => {})
        .finally(() => {
          resetMenuStyles();
          menuAnimation = null;
        });
    } else {
      resetMenuStyles();
    }
    // Move focus into the menu to avoid aria-hidden focus warnings
    focusFirstItem();
  }

  function closeMenu(): void {
    if (!sideMenu) return;
    const reduced = prefersReducedMotion();
    stopMenuAnimation();

    // IMMEDIATELY block interactions before animation starts.
    // This prevents the bug where a cancelled animation leaves the menu
    // visually off-screen but still capturing pointer events.
    sideMenu.setAttribute('inert', '');
    sideMenu.setAttribute('aria-hidden', 'true');
    setExpanded(false);

    // Move focus out of the menu immediately (before it becomes inert)
    try {
      const ae = document.activeElement;
      if (ae && sideMenu.contains(ae)) {
        if (menuButton && typeof (menuButton as HTMLElement).focus === 'function')
          (menuButton as HTMLElement).focus();
        else if (lastFocused && typeof (lastFocused as HTMLElement).focus === 'function')
          (lastFocused as HTMLElement).focus();
      }
    } catch (_) {}

    const finalize = (): void => {
      if (!sideMenu) return;
      sideMenu.classList.remove('open');
      resetMenuStyles();
    };
    if (reduced) {
      finalize();
      return;
    }
    const durations = motionDurations();
    const easings = motionEasings();
    sideMenu.style.opacity = '1';
    sideMenu.style.transform = 'translateX(0)';
    menuAnimation = animate(
      sideMenu,
      {
        opacity: [1, 0],
        transform: ['translateX(0)', 'translateX(28px)'],
      },
      {
        duration: durations.short,
        easing: easings.standard,
        fill: 'forwards',
      } as unknown as Parameters<typeof animate>[2]
    ) as AnimationController;
    menuAnimation.finished
      .catch(() => {})
      .finally(() => {
        finalize();
        menuAnimation = null;
      });
  }

  function toggleMenu(): void {
    if (!sideMenu) return;
    if (isOpen()) closeMenu();
    else openMenu();
  }

  function handleMenuAction(action: string): void {
    // Dispatch to the centralized store
    const menuStore = useMenuActionStore();
    menuStore.dispatch(action);
  }

  function init(): void {
    if (initialized) return;
    menuButton = document.getElementById('menu-button');
    sideMenu = document.getElementById('side-menu');
    if (!sideMenu || !menuButton) return;

    initialized = true;

    // Register closeMenu with store so actions can close the side menu
    const menuStore = useMenuActionStore();
    menuStore.setCloseSideMenuFn(closeMenu);

    // Ensure hidden state is non-interactive and reflected on the toggle button
    sideMenu.setAttribute('inert', '');
    setExpanded(false);

    // Toggle via header button
    menuButton.addEventListener('click', toggleMenu);

    // Close via built-in close button
    const closeBtn = sideMenu.querySelector('#close-side-menu');
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);

    // Close on Escape
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isOpen()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Outside click to close (desktop)
    const onDocClick = (e: MouseEvent): void => {
      if (!isOpen()) return;
      const t = e.target as Element | null;
      if (!t) return;
      // Ignore clicks inside menu or on the toggle button (or its children)
      if (sideMenu!.contains(t) || (menuButton && menuButton.contains(t))) return;
      closeMenu();
    };
    document.addEventListener('click', onDocClick);

    // Toggle submenus + dispatch actions
    sideMenu.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as Element;
      const toggle = target.closest('.submenu-toggle');
      if (toggle) {
        const parentLi = toggle.parentElement;
        if (parentLi) {
          const open = parentLi.classList.toggle('open');
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        return;
      }
      const actionBtn = target.closest('button[data-action]') as HTMLButtonElement | null;
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (action) handleMenuAction(action);
      }
    });

    // Direct listeners for reliability across environments
    sideMenu.querySelectorAll('button[data-action]').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      if (!action) return;
      btn.addEventListener('click', (ev: Event) => {
        ev.stopPropagation();
        handleMenuAction(action);
      });
    });

    // Register intent target for gamepad/voice control
    const { registerTarget } = useIntentCoordinator();
    registerTarget('sideMenu', {
      actions: ['toggle', 'set'],
      handler: (intent) => {
        if (intent.action === 'toggle') {
          toggleMenu();
        } else if (intent.action === 'set') {
          if (intent.value) openMenu();
          else closeMenu();
        }
      },
    });

    // Expose global for Electron menu integrations
    window.handleMenuAction = handleMenuAction;
    if (window.electronMenu && typeof window.electronMenu.on === 'function') {
      window.electronMenu.on('menu-toggle-grid', () => handleMenuAction('toggle-grid'));
      window.electronMenu.on('menu-save-workspace', () => saveWorkspaceToFile());
      window.electronMenu.on('menu-load-workspace', (_event: unknown, payload: unknown) =>
        handleElectronWorkspaceLoad(payload as WorkspacePayload | null)
      );
      window.electronMenu.on('menu-save-pdf', () =>
        saveChatAsPdf().catch((err) => logError('chat', 'pdf:saveFailed', err))
      );
      window.electronMenu.on('menu-select-theme', () => handleMenuAction('themes'));
      window.electronMenu.on('menu-api-keys', () => handleMenuAction('api-keys'));
    }
  }

  return { init, openMenu, closeMenu, toggleMenu };
}
