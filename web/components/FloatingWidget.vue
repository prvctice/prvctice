<template>
  <teleport to="body">
    <div
      v-if="shouldRender"
      :ref="(el) => widget.bindRoot(el as HTMLElement)"
      :id="id"
      :style="widget.wrapperStyle.value"
      data-no-orbit
      @pointermove="widget.onPointerMove"
      @pointerleave="widget.onPointerLeave"
      @pointercancel="widget.onPointerLeave"
      @pointerdown="widget.onPointerLeave"
      @pointerup="widget.onPointerLeave"
    >
      <!-- Header -->
      <div :style="widget.headerStyle">
        <span :style="titleStyle">{{ title }}</span>
        <div :style="rightControlsStyle" @pointerdown.stop>
          <slot name="header-actions" />
          <button
            :style="closeBtnStyle"
            aria-label="Close widget"
            title="Close"
            @click.stop="handleClose"
          >
            &times;
          </button>
        </div>
      </div>

      <!-- Optional toolbar slot (e.g., tabs) -->
      <slot name="toolbar" />

      <!-- Content area -->
      <div :style="contentStyle">
        <slot />
      </div>

      <!-- Optional footer slot -->
      <slot name="footer" />

      <!-- Resize handle -->
      <div
        v-if="enableResize"
        :ref="(el) => widget.bindResizer(el as HTMLElement)"
        :style="widget.resizerStyle"
        class="app-window-resizer"
      />
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue';
import {
  useFloatingWidget,
  type FloatingWidgetConfig,
  type WidgetIntent,
  type WidgetSize,
} from '@web/composables/useFloatingWidget';

// ==================== PROPS ====================

interface Props {
  /** Unique ID for the widget */
  id: string;
  /** Widget title displayed in header */
  title: string;
  /** Storage key prefix (defaults to id) */
  storageKey?: string;
  /** Default size */
  defaultSize?: WidgetSize;
  /** Minimum size */
  minSize?: WidgetSize;
  /** Maximum size */
  maxSize?: WidgetSize;
  /** Default position preset or coordinates */
  defaultPosition?: FloatingWidgetConfig['defaultPosition'];
  /** Enable tilt effect on hover */
  enableTilt?: boolean;
  /** Enable resize handle */
  enableResize?: boolean;
  /** Register with IntentCoordinator */
  registerIntent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  storageKey: undefined,
  defaultSize: () => ({ w: 380, h: 320 }),
  minSize: () => ({ w: 280, h: 200 }),
  maxSize: () => ({ w: 600, h: 500 }),
  defaultPosition: 'center-right',
  enableTilt: true,
  enableResize: true,
  registerIntent: true,
});

// ==================== EMITS ====================

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'visibility-change', visible: boolean): void;
  (e: 'intent', intent: WidgetIntent): boolean | void;
}>();

// ==================== COMPOSABLE ====================

const widget = useFloatingWidget({
  id: props.id,
  storageKey: props.storageKey ?? props.id,
  defaultSize: props.defaultSize,
  minSize: props.minSize,
  maxSize: props.maxSize,
  defaultPosition: props.defaultPosition,
  enableTilt: props.enableTilt,
  enableResize: props.enableResize,
  registerIntent: props.registerIntent,
  onClose: () => emit('close'),
  onVisibilityChange: (visible) => emit('visibility-change', visible),
  onIntent: (intent) => {
    // Let parent handle custom intents
    return emit('intent', intent) === true;
  },
});

// ==================== EXPOSE STATE TO PARENT ====================

const { shouldRender, visible, size, pos, reveal } = toRefs(widget);

defineExpose({
  visible: widget.visible,
  setVisible: widget.setVisible,
  toggle: widget.toggle,
  bringToFront: widget.bringToFront,
  close: widget.close,
  size: widget.size,
  pos: widget.pos,
  isDragging: widget.isDragging,
});

// ==================== STYLES ====================

const titleStyle = {
  fontSize: 'var(--font-size-xs)',
  letterSpacing: '0.1em',
  opacity: 0.7,
  pointerEvents: 'none' as const,
  color: 'var(--color-widget-title)',
  fontWeight: 400,
};

const rightControlsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  zIndex: 200,
  pointerEvents: 'auto' as const,
};

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-widget-btn)',
  fontSize: 'var(--font-size-sm)',
  cursor: 'pointer',
  lineHeight: 1,
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  transition: 'color var(--duration-short) var(--motion-ease-standard)',
  fontWeight: 300,
};

const closeBtnStyle = {
  ...iconBtnStyle,
  fontSize: '20px',
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.7,
};

function handleClose(): void {
  widget.close();
}

const contentStyle = computed(() => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden' as const,
  position: 'relative' as const,
}));
</script>

<style scoped>
/* Ensure widget doesn't interfere with other elements */
:deep(.floating-widget-content) {
  flex: 1;
  overflow: auto;
}
</style>
