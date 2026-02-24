/**
 * useModal Composable
 * Unified modal behavior with animation, keyboard handling, and focus management.
 * Wraps createModalMotionController for consistent modal behavior.
 */
import { ref, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue';
import { createModalMotionController, type ModalMotionController } from '@web/utils/modalMotion.js';

interface ModalElements {
  overlay: HTMLElement | null;
  dialog: HTMLElement | null;
}

interface UseModalOptions {
  getElements?: (() => ModalElements) | null;
  onOpen?: (() => void) | null;
  onClose?: (() => void) | null;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  lockBodyScroll?: boolean;
}

interface UseModalReturn {
  isOpen: Ref<boolean>;
  open: () => Promise<void>;
  close: () => Promise<void>;
  toggle: () => void;
  handleOverlayClick: (e: MouseEvent) => void;
}

export function useModal(options: UseModalOptions = {}): UseModalReturn {
  const {
    getElements = null,
    onOpen = null,
    onClose = null,
    closeOnEscape = true,
    closeOnOverlayClick = true,
    lockBodyScroll = true,
  } = options;

  const isOpen: Ref<boolean> = ref(false);
  const lastActiveElement: Ref<Element | null> = ref(null);
  let motionController: ModalMotionController | null = null;
  let originalBodyOverflow = '';

  // Initialize motion controller once elements are available
  function initMotionController(): ModalMotionController | null {
    if (getElements && !motionController) {
      motionController = createModalMotionController(getElements);
    }
    return motionController;
  }

  async function open(): Promise<void> {
    if (isOpen.value) return;

    // Save current focus
    try {
      lastActiveElement.value = document.activeElement;
    } catch (_) {
      lastActiveElement.value = null;
    }

    // Lock body scroll
    if (lockBodyScroll) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    isOpen.value = true;
    await nextTick();

    // Animate in
    const controller = initMotionController();
    if (controller) {
      await controller.show();
    }

    // Focus first focusable element
    focusFirstElement();

    if (typeof onOpen === 'function') {
      onOpen();
    }
  }

  async function close(): Promise<void> {
    if (!isOpen.value) return;

    // Animate out
    const controller = initMotionController();
    if (controller) {
      await controller.hide();
    }

    isOpen.value = false;

    // Restore body scroll
    if (lockBodyScroll) {
      document.body.style.overflow = originalBodyOverflow;
    }

    // Restore focus
    restoreFocus();

    if (typeof onClose === 'function') {
      onClose();
    }
  }

  function toggle(): void {
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  }

  function focusFirstElement(): void {
    if (!getElements) return;
    try {
      const { dialog } = getElements();
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusables && focusables[0];
      if (first && typeof first.focus === 'function') {
        first.focus();
      }
    } catch (_) {
      // Silent
    }
  }

  function restoreFocus(): void {
    try {
      const el = lastActiveElement.value as HTMLElement | null;
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    } catch (_) {
      // Silent
    }
  }

  // Keyboard handler
  function handleKeydown(e: KeyboardEvent): void {
    if (!isOpen.value) return;

    if (e.key === 'Escape' && closeOnEscape) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // Click handler for overlay
  function handleOverlayClick(e: MouseEvent): void {
    if (!isOpen.value || !closeOnOverlayClick) return;
    if (!getElements) return;

    try {
      const { overlay, dialog } = getElements();
      // Only close if clicking on overlay, not on dialog content
      if (e.target === overlay && dialog && !dialog.contains(e.target as Node)) {
        close();
      }
    } catch (_) {
      // Silent
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown);

    // Cancel any running animations
    if (motionController && typeof motionController.cancel === 'function') {
      motionController.cancel();
    }

    // Restore body scroll if modal was open
    if (isOpen.value && lockBodyScroll) {
      document.body.style.overflow = originalBodyOverflow;
    }
  });

  return {
    isOpen,
    open,
    close,
    toggle,
    handleOverlayClick,
  };
}

export default { useModal };
