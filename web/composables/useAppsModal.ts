import { ref, type Ref } from 'vue';

const isOpen: Ref<boolean> = ref(false);

interface AppsModalUi {
  isOpen: Ref<boolean>;
  open: () => void;
  close: () => void;
  toggle: (force?: boolean) => void;
}

export function useAppsModal(): AppsModalUi {
  function open(): void {
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  function toggle(force?: boolean): void {
    if (typeof force === 'boolean') {
      isOpen.value = force;
    } else {
      isOpen.value = !isOpen.value;
    }
  }

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
