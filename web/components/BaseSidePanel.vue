<template>
  <section
    :id="`${id}-container`"
    :class="[`${id}-container`, 'side-panel-container', 'hidden']"
    aria-hidden="true"
    ref="containerRef"
    data-no-orbit
  >
    <div class="side-panel-shell" role="region" :aria-label="ariaLabel">
      <div class="side-panel-content" ref="contentRef">
        <div class="side-panel-header" role="presentation">
          <div class="side-panel-titles">
            <h2 class="side-panel-title">{{ title }}</h2>
            <p v-if="subtitle" class="side-panel-subtitle">{{ subtitle }}</p>
          </div>
          <slot name="header-actions">
            <button
              v-if="showCloseButton"
              class="side-panel-close-btn"
              @click="panel.close()"
              title="Close"
              :aria-label="`Close ${title.toLowerCase()} panel`"
            >
              <iconify-icon icon="ph:x" aria-hidden="true"></iconify-icon>
            </button>
          </slot>
        </div>

        <slot name="toolbar"></slot>

        <slot :visible="panel.visible.value" :close="panel.close" :open="panel.open"></slot>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue';
import {
  useSidePanel,
  registerPanelGlobals,
  type PaneId,
  type OpenOptions,
  type CloseOptions,
} from '@web/composables/useSidePanel.js';

export interface Props {
  /** Unique identifier for this panel */
  id: PaneId;
  /** Panel title */
  title: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Aria label for the region (defaults to title) */
  ariaLabel?: string;
  /** Show close button in header */
  showCloseButton?: boolean;
  /** Keyboard shortcut key (for Cmd+Shift+<key>) */
  keyboardShortcut?: string;
  /** ID of toggle button element */
  toggleButtonId?: string;
  /** Other panes to hide when this one opens */
  hidesOnOpen?: PaneId[];
  /** Global name for registering window methods (e.g., 'Help' -> window.openHelpPane) */
  globalName?: string;
  /** Extra globals to register */
  extraGlobals?: Record<string, unknown>;
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: undefined,
  ariaLabel: undefined,
  showCloseButton: false,
  keyboardShortcut: undefined,
  toggleButtonId: undefined,
  hidesOnOpen: () => [],
  globalName: undefined,
  extraGlobals: undefined,
});

const emit = defineEmits<{
  open: [];
  close: [];
}>();

const ariaLabel = computed(() => props.ariaLabel || props.title);

const panel = useSidePanel({
  id: props.id,
  hidesOnOpen: props.hidesOnOpen,
  keyboardShortcut: props.keyboardShortcut,
  toggleButtonId: props.toggleButtonId,
  onOpen: () => emit('open'),
  onClose: () => emit('close'),
});

const { containerRef, contentRef } = panel;

// Register global window methods
let removeGlobals: (() => void) | null = null;

onMounted(() => {
  if (props.globalName) {
    removeGlobals = registerPanelGlobals(
      props.globalName,
      panel.open,
      panel.close,
      panel.toggle,
      props.extraGlobals
    );
  }
});

onBeforeUnmount(() => {
  if (removeGlobals) {
    removeGlobals();
    removeGlobals = null;
  }
});

// Expose panel controls to parent
defineExpose({
  open: panel.open,
  close: panel.close,
  toggle: panel.toggle,
  visible: panel.visible,
});
</script>
