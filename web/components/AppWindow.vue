<template>
  <teleport to="body">
    <div
      v-if="shouldRender"
      :ref="(el) => widget.bindRoot(el as HTMLElement)"
      :id="windowId"
      :style="widget.wrapperStyle.value"
      :class="['app-window', { 'app-window--mobile': isMobile }]"
      data-no-orbit
      @pointerdown="onWindowPointerDown"
      @pointermove="widget.onPointerMove"
      @pointerleave="widget.onPointerLeave"
    >
      <!-- Chromeless: floating close only, no titlebar -->
      <template v-if="definition.chromeless">
        <div class="app-window-chromeless-drag" />
        <button
          class="app-window-chromeless-close"
          aria-label="Close app"
          title="Close"
          @click.stop="handleClose"
          @pointerdown.stop
        >
          &times;
        </button>
      </template>

      <!-- Standard title bar (drag handle) -->
      <div v-else class="app-window-titlebar" :data-app-id="definition.id">
        <button
          v-if="navStackDepth > 1"
          class="app-window-back"
          aria-label="Go back"
          @click.stop="handleBack"
          @pointerdown.stop
        >
          &#8592;
        </button>
        <span class="app-window-title">{{ displayTitle }}</span>
        <button
          v-if="isEditableApp"
          class="app-window-titlebar-btn"
          :class="{ active: showCode }"
          aria-label="Toggle code view"
          title="View source"
          @click.stop="handleToggleCode"
          @pointerdown.stop
        >
          &lt;/&gt;
        </button>
        <button
          v-if="isEditableApp"
          class="app-window-titlebar-btn"
          aria-label="Open editor"
          title="Edit with AI"
          @click.stop="handleOpenEditor"
          @pointerdown.stop
        >
          &#9998;
        </button>
        <button
          class="app-window-titlebar-btn"
          :aria-label="widget.isFullscreen.value ? 'Exit fullscreen' : 'Fullscreen'"
          :title="widget.isFullscreen.value ? 'Exit fullscreen' : 'Fullscreen'"
          @click.stop="widget.toggleFullscreen()"
          @pointerdown.stop
        >
          <template v-if="widget.isFullscreen.value">&#8601;</template>
          <template v-else>&#8599;</template>
        </button>
        <button
          class="app-window-close"
          aria-label="Close app"
          title="Close"
          @click.stop="handleClose"
          @pointerdown.stop
        >
          &times;
        </button>
      </div>

      <!-- Error state -->
      <div v-if="error" class="app-window-error">
        <span>Failed to load app</span>
      </div>

      <!-- HTML app: iframe container or code editor -->
      <template v-else-if="definition.type === 'html'">
        <div v-if="loading" class="app-window-loading">
          <div class="app-window-loading-pulse" />
        </div>

        <!-- Code editor panel -->
        <div v-if="showCode" class="app-window-code-panel" data-no-drag>
          <textarea
            v-model="codeBuffer"
            class="app-window-code-textarea"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
          />
          <div class="app-window-code-actions">
            <button class="app-window-code-apply" @click.stop="handleApplyCode" @pointerdown.stop>
              Apply
            </button>
          </div>
        </div>

        <!-- Iframe content (hidden when code view is active) -->
        <div
          v-show="!showCode"
          ref="iframeContainer"
          class="app-window-content"
          data-no-drag
          :style="iframeContentStyle"
        />
      </template>

      <!-- Vue-internal app: dynamic component -->
      <component
        v-else-if="internalComponent"
        :is="internalComponent"
        class="app-window-content"
        data-no-drag
      />

      <!-- Resize affordance indicator -->
      <div class="app-window-resizer" />
    </div>
  </teleport>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent,
  type Component,
} from 'vue';
import { animate, spring } from '@motionone/dom';
import { useFloatingWidget } from '@web/composables/useFloatingWidget';
import { useWindowManager } from '@web/composables/useWindowManager';
import { useAppGenerator } from '@web/composables/useAppGenerator';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { useEventBus } from '@web/services/eventBus';
import { prefersReducedMotion } from '@web/composables/useMotion.js';
import { SIZE_PRESETS, type AppDefinition } from '@web/types/apps';
import type { AnimationControls } from '@web/types/motion.js';

// ==================== PROPS ====================

interface Props {
  instanceId: string;
  definition: AppDefinition;
}

const props = defineProps<Props>();

// ==================== STATE ====================

const windowId = `app-window-${props.instanceId}`;
const loading = ref(true);
const error = ref(false);
const iframeContainer = ref<HTMLElement | null>(null);
const navStackDepth = ref(0);
const navTitle = ref<string | null>(null);
const showCode = ref(false);
const codeBuffer = ref('');
const bus = useEventBus();

const displayTitle = computed(() => navTitle.value || props.definition.name);
const isEditableApp = computed(
  () => props.definition.type === 'html' && props.definition.source === 'generated'
);

let autoCloseTimeout: ReturnType<typeof setTimeout> | null = null;
let lastResizeTime = 0;
let entranceAnimation: AnimationControls | null = null;

// ==================== WINDOW MANAGER ====================

const windowManager = useWindowManager();
const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
const cascadePosition = windowManager.getCascadePosition();

// ==================== FLOATING WIDGET ====================

const presetSizes = props.definition.sizePreset
  ? SIZE_PRESETS[props.definition.sizePreset]
  : undefined;

const widget = useFloatingWidget({
  id: windowId,
  storageKey: `appWindow:${props.definition.id}`,
  defaultSize: props.definition.defaultSize ?? presetSizes?.default ?? { w: 400, h: 320 },
  minSize: props.definition.minSize ?? presetSizes?.min ?? { w: 200, h: 150 },
  maxSize: props.definition.maxSize ??
    presetSizes?.max ?? {
      w: Math.floor(window.innerWidth * 0.9),
      h: Math.floor(window.innerHeight * 0.9),
    },
  defaultPosition: isMobile ? { left: 0, top: 0 } : cascadePosition,
  disableDrag: isMobile,
  enableTilt: !isMobile,
  enableResize: !isMobile,
  edgeResize: !isMobile,
  registerIntent: true,
  initiallyVisible: true,
  magneticTargets: props.definition.magnetic === false ? [] : ['#bar', '.app-window'],
  onClose: handleClose,
});

const { shouldRender } = widget;

// ==================== VUE-INTERNAL COMPONENT RESOLUTION ====================

const INTERNAL_COMPONENTS: Record<string, () => Promise<{ default: Component }>> = {
  'weather-time': () => import('./WeatherContent.vue'),
  notes: () => import('./NotesContent.vue'),
  'pdf-viewer': () => import('./PdfContent.vue'),
};

const internalComponent = computed(() => {
  if (props.definition.type !== 'vue-internal' || !props.definition.component) return null;
  const loader = INTERNAL_COMPONENTS[props.definition.component];
  return loader ? defineAsyncComponent(loader) : null;
});

// ==================== IFRAME POINTER-EVENTS ====================

const iframeContentStyle = computed(() => ({
  pointerEvents:
    widget.isDragging.value || widget.isResizing.value ? ('none' as const) : ('auto' as const),
}));

// ==================== ENTRANCE ANIMATION ====================

function animateEntrance(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  // Cancel any in-progress entrance
  if (entranceAnimation) {
    try {
      entranceAnimation.cancel();
    } catch (_) {
      /* already finished */
    }
    entranceAnimation = null;
  }
  // Set initial state (hidden, slightly scaled down)
  el.style.opacity = '0';
  el.style.transform = 'scale(0.92)';
  // Spring scale animation (expressive -- visible bounce)
  entranceAnimation = (animate as Function)(
    el,
    { transform: ['scale(0.92)', 'scale(1)'] },
    { easing: spring({ stiffness: 200, damping: 18, mass: 1 }) }
  ) as AnimationControls;
  // Separate opacity fade (no spring -- use ease-out to avoid >1.0 opacity flash)
  (animate as Function)(el, { opacity: [0, 1] }, { duration: 0.3, easing: 'ease-out' });
  entranceAnimation.finished
    .catch(() => {})
    .finally(() => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      entranceAnimation = null;
    });
}

// ==================== HANDLERS ====================

function handleClose(): void {
  windowManager.closeApp(props.instanceId);
  // Note: don't call widget.close() here — this function IS the onClose callback
  // called by widget.close(). Calling it would create infinite recursion.
}

function handleBack(): void {
  windowManager.sendMessageToApp(props.instanceId, { type: 'nav:back' });
}

function handleAppNav(data: {
  instanceId: string;
  viewName: string;
  stackDepth: number;
  title: string | null;
}): void {
  if (data.instanceId !== props.instanceId) {
    // Check via appInstanceId as well (appManager uses its own IDs)
    const appInstanceId = windowManager.getAppInstance(props.instanceId);
    if (!appInstanceId || data.instanceId !== appInstanceId) return;
  }
  navStackDepth.value = data.stackDepth;
  if (data.title !== null) {
    navTitle.value = data.title;
  }
}

function handleAppTitle(data: { instanceId: string; title: string }): void {
  if (data.instanceId !== props.instanceId) {
    const appInstanceId = windowManager.getAppInstance(props.instanceId);
    if (!appInstanceId || data.instanceId !== appInstanceId) return;
  }
  navTitle.value = data.title;
}

function onWindowPointerDown(): void {
  widget.bringToFront();
  windowManager.focusWindow(props.instanceId);
}

function handleAppResize(data: { instanceId: string; width: number; height: number }): void {
  if (data.instanceId !== props.instanceId) {
    const appInstanceId = windowManager.getAppInstance(props.instanceId);
    if (!appInstanceId || data.instanceId !== appInstanceId) return;
  }
  const now = Date.now();
  if (now - lastResizeTime < 500) return;
  lastResizeTime = now;
  const maxW = Math.floor(window.innerWidth * 0.9);
  const maxH = Math.floor(window.innerHeight * 0.9);
  widget.size.value = {
    w: Math.max(200, Math.min(maxW, data.width)),
    h: Math.max(150, Math.min(maxH, data.height)),
  };
  widget.saveSize();
}

function handleToggleCode(): void {
  if (!showCode.value) {
    // Opening code view — populate buffer from definition
    codeBuffer.value = props.definition.html ?? '';
    showCode.value = true;
  } else {
    // Closing code view
    showCode.value = false;
  }
}

async function handleApplyCode(): Promise<void> {
  const registry = createAppRegistry();
  await registry.update(props.definition.id, { html: codeBuffer.value });
  showCode.value = false;
  await windowManager.reopenApp(props.instanceId);
}

function handleOpenEditor(): void {
  const { enterEditMode } = useAppGenerator();
  enterEditMode(props.definition.id);
  handleClose();
}

function scheduleAutoClose(): void {
  autoCloseTimeout = setTimeout(() => {
    handleClose();
  }, 3000);
}

// ==================== LIFECYCLE ====================

onMounted(async () => {
  // Vue-internal apps: no handshake needed
  if (props.definition.type === 'vue-internal') {
    loading.value = false;
    await nextTick();
    const rootEl = document.getElementById(windowId);
    if (rootEl) animateEntrance(rootEl);
    bus.on('app:resize', handleAppResize);
    return;
  }

  // HTML apps: wait for iframeContainer ref, then mount via appManager
  if (props.definition.type === 'html') {
    await nextTick();

    if (!iframeContainer.value) {
      error.value = true;
      loading.value = false;
      scheduleAutoClose();
      return;
    }

    // mountApp calls appManager.launch which awaits handshake internally.
    // By the time it returns non-null, the app is fully launched.
    const appInstanceId = await windowManager.mountApp(props.instanceId, iframeContainer.value);
    if (!appInstanceId) {
      error.value = true;
      loading.value = false;
      scheduleAutoClose();
    } else {
      loading.value = false;
      await nextTick();
      const rootEl = document.getElementById(windowId);
      if (rootEl) animateEntrance(rootEl);
    }
  }

  // Listen for app:resize bridge events
  bus.on('app:resize', handleAppResize);
  bus.on('app:nav', handleAppNav);
  bus.on('app:title', handleAppTitle);
});

onBeforeUnmount(() => {
  bus.off('app:resize', handleAppResize);
  bus.off('app:nav', handleAppNav);
  bus.off('app:title', handleAppTitle);

  // Cancel entrance animation if still running
  if (entranceAnimation) {
    try {
      entranceAnimation.cancel();
    } catch (_) {
      /* already finished */
    }
    entranceAnimation = null;
  }

  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout);
    autoCloseTimeout = null;
  }

  // Ensure cleanup for HTML apps still running
  if (props.definition.type === 'html') {
    windowManager.closeApp(props.instanceId);
  }
});
</script>
