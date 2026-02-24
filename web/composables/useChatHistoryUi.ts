import { ref, type Ref } from 'vue';

const historyVisible: Ref<boolean> = ref(false);

interface ChatHistoryUi {
  visible: Ref<boolean>;
  open: () => void;
  close: () => void;
  toggle: (force?: boolean) => void;
}

export function useChatHistoryUi(): ChatHistoryUi {
  function open(): void {
    historyVisible.value = true;
  }

  function close(): void {
    historyVisible.value = false;
  }

  function toggle(force?: boolean): void {
    if (typeof force === 'boolean') {
      historyVisible.value = force;
    } else {
      historyVisible.value = !historyVisible.value;
    }
  }

  return {
    visible: historyVisible,
    open,
    close,
    toggle,
  };
}
