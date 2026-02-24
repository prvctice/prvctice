import { ref, type Ref } from 'vue';

const gamesVisible: Ref<boolean> = ref(false);

interface GamesModalUi {
  visible: Ref<boolean>;
  open: () => void;
  close: () => void;
  toggle: (force?: boolean) => void;
}

export function useGamesModal(): GamesModalUi {
  function open(): void {
    gamesVisible.value = true;
  }

  function close(): void {
    gamesVisible.value = false;
  }

  function toggle(force?: boolean): void {
    if (typeof force === 'boolean') {
      gamesVisible.value = force;
    } else {
      gamesVisible.value = !gamesVisible.value;
    }
  }

  return {
    visible: gamesVisible,
    open,
    close,
    toggle,
  };
}
