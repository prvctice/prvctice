<template>
  <div id="app-shell">
    <!-- Liquid glass SVG filter (hidden, used by #bar backdrop-filter) -->
    <svg style="position: absolute; width: 0; height: 0" aria-hidden="true">
      <defs>
        <filter id="liquid-glass" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.015 0.015"
            numOctaves="2"
            seed="42"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="3" result="smoothNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="smoothNoise"
            scale="-100"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>

    <!-- Global theme background image (shown only for Custom theme) -->
    <img
      id="theme-bg-image"
      class="theme-bg-image"
      :src="baseUrl + 'images/quickcustom04.jpg'"
      :data-default-src="baseUrl + 'images/quickcustom04.jpg'"
      alt=""
      loading="eager"
      decoding="async"
    />

    <div class="thinking">
      <!-- Notifications -->
      <div id="notifications"><NotifsOverlay /></div>

      <!-- Menu + theme circle -->
      <span class="header-hint header-hint--menu" :class="{ gone: hintsGone }">Apps</span>
      <button id="menu-button" aria-label="Open menu"><span id="theme-color-circle"></span></button>
      <!-- Legacy-style jump-to-latest affordance stacked under the menu toggle -->
      <button
        id="jump-latest"
        class="jump-under-menu"
        aria-label="Jump to latest"
        title="Jump to latest"
      >
        <span class="jl-icon">&#8595;</span>
      </button>

      <!-- Mobile back-to-chat button (visible when notes/help is open on mobile) -->
      <button id="mobile-back-to-chat" aria-label="Back to chat" @click="onBackToChat">
        <iconify-icon icon="ph:arrow-left"></iconify-icon>
        <span>Chat</span>
      </button>

      <!-- Custom theme photo controls -->
      <button
        id="custom-add-photo-button"
        title="Add photo"
        class="custom-photo-button"
        aria-label="Add Custom photo"
      >
        <iconify-icon icon="ph:plus"></iconify-icon>
      </button>
      <button
        id="custom-remove-photo-button"
        title="Remove photo"
        class="custom-photo-button"
        aria-label="Remove Custom photo"
      >
        <iconify-icon icon="ph:minus"></iconify-icon>
      </button>

      <!-- Header -->
      <header>
        <div class="logo-title">
          <button
            class="logo-toggle"
            @click="onLogoToggle"
            :title="showVersionMark ? 'Show logo' : 'Show version'"
            :aria-label="showVersionMark ? 'Show logo' : 'Show version'"
          >
            <!-- Logo icon -->
            <img
              v-show="!showVersionMark"
              :src="baseUrl + 'images/logo.png'"
              alt="Logo"
              class="site-logo"
            />
            <!-- Version mark (expandable on hover): Pta → PRVCTICE_type A -->
            <span
              v-show="showVersionMark"
              class="version-mark"
              :class="{ expanded: versionExpanded }"
              @mouseenter="versionExpanded = true"
              @mouseleave="versionExpanded = false"
            >
              <span class="vm-p">P</span><span class="vm-expand vm-rvctice">RVCTICE_</span
              ><span class="vm-t">t</span><span class="vm-expand vm-ype">ype </span
              ><span class="vm-a">a</span><span class="vm-version">_v{{ appVersion }}</span>
            </span>
          </button>
          <div class="title sr-only">Prvctice</div>
        </div>
      </header>
      <span class="header-hint header-hint--search" :class="{ gone: hintsGone }">Search</span>

      <!-- Input Bar -->
      <InputBar />

      <!-- Main -->
      <main id="main-content">
        <UnlockPrompt />
        <UnlockSuccess />
        <section class="chat-container" id="chat-container">
          <!-- Help Container -->
          <HelpPane />
          <!-- About Container -->
          <AboutPane @open="onAboutOpen" @close="onAboutClose" />
          <!-- Voice Commands Container -->
          <VoiceCommandsPane />

          <!-- Splitter for resizing side panels -->
          <div id="splitter" class="splitter hidden" aria-hidden="true"></div>

          <!-- Chat Window -->
          <div id="chat-window" class="chat-window">
            <ChatWindow />
          </div>
        </section>
      </main>

      <footer>
        <div class="input-container" data-no-orbit>
          <!-- Skills Dock (hidden by default; populated by SkillsDock + editor) -->
          <div id="skill-carousel" :class="{ hidden: skillsHidden }" data-no-orbit></div>

          <!-- Footer bottom row -->
          <div class="footer-bottom-row">
            <div class="footer-left">
              <div class="credit">PRVCTICE by Tim Moore, 2026</div>
            </div>
            <div class="footer-right">
              <!-- Header Extras – relocated from the header -->
              <div class="header-extras header-extra" style="display: flex; opacity: 1">
                <div class="header-actions" data-no-orbit>
                  <button id="new-chat-button" title="New chat" @click="onHeaderNewChat">
                    <iconify-icon icon="ph:plus-circle"></iconify-icon>
                  </button>
                  <button id="save-chat-option">
                    <iconify-icon icon="ph:file-pdf"></iconify-icon>
                  </button>
                  <button id="change-theme-button" title="Change theme">
                    <iconify-icon icon="ph:swatches"></iconify-icon>
                  </button>
                  <!-- Cycle through themes quickly -->
                  <button id="cycle-theme-button" title="Cycle theme" @click="onCycleTheme">
                    <iconify-icon icon="ph:arrows-clockwise"></iconify-icon>
                  </button>
                  <!-- Toggle 3-D Bird Model visibility -->
                  <button id="toggle-model-button" aria-label="Toggle 3D model">
                    <iconify-icon :icon="modelToggleIcon"></iconify-icon>
                  </button>
                  <!-- Hand tracking toggle (shown when enabled in settings) -->
                  <button
                    v-if="handTrackingButtonVisible"
                    id="hand-tracking-toggle-button"
                    title="Toggle hand tracking"
                    class="button-hover-glow"
                    :class="{ active: handTrackingActive }"
                    @click="toggleHandTracking"
                  >
                    <iconify-icon icon="ph:hand-pointing"></iconify-icon>
                  </button>
                  <!-- Notes pane toggle -->
                  <button
                    id="notes-toggle-button"
                    title="Toggle notes"
                    class="button-hover-glow"
                    @click="toggleNotes"
                  >
                    <iconify-icon icon="ph:note-pencil"></iconify-icon>
                  </button>
                  <!-- Weather/Time widget toggle -->
                  <button
                    id="weather-widget-toggle-button"
                    title="Toggle NYC weather &amp; time"
                    class="button-hover-glow"
                    @click="toggleWeather"
                  >
                    <iconify-icon icon="ph:cloud-sun"></iconify-icon>
                  </button>
                  <!-- Help pane toggle -->
                  <div class="help-controls">
                    <button id="help-toggle-button" title="Toggle help" class="button-hover-glow">
                      <iconify-icon icon="ph:question"></iconify-icon>
                    </button>
                  </div>
                </div>
                <!-- .header-actions -->
              </div>
              <!-- .header-extras -->

              <!-- Skills visibility toggle -->
              <button id="toggle-skills-button" class="skills-toggle" @click="toggleSkills">
                {{ skillsHidden ? 'Skills' : 'Hide Skills' }}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>

    <!-- Additional Canvas and Screen Saver Elements -->
    <div id="glass-overlay"></div>
    <div id="canvas-container"></div>
    <div id="screen-saver" data-no-orbit></div>
    <div id="grid-overlay" class="grid-overlay hidden"></div>

    <!-- 3-D Model Container (hidden by default) -->
    <div
      id="model-container"
      class="model-container hidden magnetic"
      aria-hidden="true"
      data-no-orbit
      data-magnet-threshold="20"
      data-magnet-edge="top"
      data-magnet-detach-on-down
    >
      <!-- Controls removed — rotation handled via settings -->
    </div>

    <!-- Game Mode Overlay -->
    <div id="game-container" class="hidden">
      <canvas id="game-canvas"></canvas>
      <div id="hud">
        <div id="score-display">Score: 0</div>
        <div id="lives-display" data-lives="3"></div>
        <button id="game-hand-tracking-btn" title="Toggle hand tracking">
          <iconify-icon icon="ph:hand-pointing" width="18" height="18"></iconify-icon>
        </button>
        <button id="pause-btn">Pause</button>
        <button id="exit-game">Exit</button>
      </div>
    </div>

    <!-- Logic-only components -->
    <UnifiedSettingsModal />

    <!-- App windows (Phase 3: window manager) -->
    <AppWindow
      v-for="win in windowList"
      :key="win.instanceId"
      :instance-id="win.instanceId"
      :definition="win.definition"
    />

    <!-- App edit mode overlay (Phase 4: AI generator) -->
    <AppEditMode />

    <ModelViewer />
    <BlockBreakingCanvas />
    <PongCanvas />
    <SkillsDock />
    <ChatHistoryModal />
    <GamesModal />
    <YouTubePlayer />
    <ImageCarouselModal />
    <IntentDebugOverlay />
    <SearchModal />
    <DocumentBrowserModal />
    <AppsModal />

    <!-- App confirm/alert dialogs (rendered in host outside iframe bounds) -->
    <AppConfirmDialog />

    <!-- Skill system overlays (zone highlights and merge preview) -->
    <ZoneHighlight />
    <MergePreview />

    <!-- Hand tracking position indicator -->
    <HandPositionIndicator />

    <!-- File drag & drop overlay -->
    <DropOverlay />
  </div>
</template>

<script setup lang="ts">
const baseUrl = import.meta.env.BASE_URL;
import { ref, provide, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useTheme } from '@web/composables/useTheme.js';
import { useNotifs } from '@web/composables/useNotifs.js';
import { useChatStore } from '@web/stores/chat.js';
import { useFileAttachments } from '@web/composables/useFileAttachments';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useInputBarClamp } from '@web/composables/useInputBarClamp.js';
import { useCustomThemePhoto } from '@web/composables/useCustomThemePhoto.js';
import { useDotmatrixInit } from '@web/composables/useDotmatrixInit.js';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { useActionObserver } from '@web/composables/useActionObserver';
import { useEventBus } from '@web/services/eventBus';
import { useFirstRun } from '@web/composables/useFirstRun';
import { debugLog, logError } from '@web/utils/debugLog.js';
import type { HandTrackButtonChangeEvent } from '@web/types/events';
import type { MessageSender } from '@web/types/chat.js';

// Interface for pointer debug HUD state
interface PointerDebugHudState {
  hud: HTMLDivElement;
  observers: (MutationObserver | null)[];
  interval: number;
}

// Interface for sendMessage options
interface SendMessageOptions {
  isVoice?: boolean;
  content?: string;
}

import ChatWindow from './components/ChatWindow.vue';
import InputBar from './components/InputBar.vue';
import UnifiedSettingsModal from './components/UnifiedSettingsModal.vue';
import NotifsOverlay from './components/NotifsOverlay.vue';
import YouTubePlayer from './components/YouTubePlayer.vue';
import { useYouTubePlayer, parseYouTubeId } from './composables/useYouTubePlayer.js';
import { overlayOn, overlayOff, updateCustomOverlay } from './utils/customOverlay.js';
import SkillsDock from './components/SkillsDock.vue';
import AppWindow from './components/AppWindow.vue';
import AppEditMode from './components/AppEditMode.vue';
import { useWindowManager, initWindowManager } from '@web/composables/useWindowManager';
import { createAppManager } from '@web/services/apps/appManager';
import { createAppRegistry } from '@web/services/apps/appRegistry';
import { registerBuiltinApps, BUILTIN_APPS } from '@web/services/apps/builtinApps';
const ModelViewer = defineAsyncComponent(() => import('./components/ModelViewer.vue'));
const BlockBreakingCanvas = defineAsyncComponent(
  () => import('./games/block-breaking/BlockBreakingCanvas.vue')
);
const PongCanvas = defineAsyncComponent(() => import('./games/pong/PongCanvas.vue'));
import { useOnboardingToasts } from '@web/composables/useOnboardingToasts';
import { useSessionToasts } from '@web/composables/useSessionToasts';
import UnlockPrompt from './components/onboarding/UnlockPrompt.vue';
import UnlockSuccess from './components/onboarding/UnlockSuccess.vue';
import { useOnboardingPulse } from './composables/useOnboardingPulse';
import { useSpeech } from './composables/useSpeech';
import ChatHistoryModal from './components/ChatHistoryModal.vue';
import GamesModal from './components/GamesModal.vue';
import { showThinking, hideThinking, resetThinkingOverlay } from './utils/visuals.js';
import ImageCarouselModal from './components/ImageCarouselModal.vue';
import HelpPane from './components/HelpPane.vue';
import AboutPane from './components/AboutPane.vue';
import VoiceCommandsPane from './components/VoiceCommandsPane.vue';
import IntentDebugOverlay from './components/IntentDebugOverlay.vue';
import MergePreview from './components/skills/MergePreview.vue';
import ZoneHighlight from './components/skills/ZoneHighlight.vue';
import HandPositionIndicator from './components/HandPositionIndicator.vue';
import DropOverlay from './components/DropOverlay.vue';
import SearchModal from './components/SearchModal.vue';
import DocumentBrowserModal from './components/DocumentBrowserModal.vue';
import AppsModal from './components/AppsModal.vue';
import AppConfirmDialog from './components/AppConfirmDialog.vue';
import { useSuggestions } from '@web/composables/useSuggestions';
import { useAppSuggestions } from '@web/composables/useAppSuggestions';
import { useUniversalSearch } from '@web/composables/useUniversalSearch';
import { useSkillIntentBridge } from '@web/composables/useSkillIntentBridge';
import { useMenuActionStore } from '@web/stores/menuAction.js';
// PDF export service
import { saveChatAsPdf } from '@web/services/pdf.js';
import {
  saveWorkspaceToFile,
  handleElectronWorkspaceLoad,
  type WorkspacePayload,
} from '@web/services/workspace.js';
import { useRippleEffect, RippleEffectKey } from '@web/composables/useRippleEffect';

// Provide ripple effect context for child components (physics bounces, etc.)
const rippleContext = useRippleEffect();
provide(RippleEffectKey, rippleContext);

const skillsHidden = ref(true);
function toggleSkills() {
  skillsHidden.value = !skillsHidden.value;
}

// Hand tracking button state
const handTrackingButtonVisible = ref(true);
const handTrackingActive = ref(false);

// Logo/version toggle state
declare const __APP_VERSION__: string;
const appVersion = __APP_VERSION__;
const showVersionMark = ref(false);
const versionExpanded = ref(false);

// Header hint labels ("Search" / "Apps") — fade away on first engagement
const hintsGone = ref(false);
function dismissHints() {
  if (!hintsGone.value) hintsGone.value = true;
}

function onLogoToggle() {
  dismissHints();
  // Open Cmd+K search modal
  import('@web/composables/useSearchModal').then(({ useSearchModal }) => {
    useSearchModal().toggle();
  });
}

function onAboutOpen() {
  // logo stays visible
}

function onAboutClose() {
  // no-op
}

// Model toggle icon — updates based on selected character
const CHARACTER_ICONS = { animebird: 'ph:bird', dog: 'ph:dog', tree: 'ph:tree' };
const modelToggleIcon = ref('ph:bird');
function loadModelIcon() {
  try {
    const stored = storage.mirror.get(STORAGE_KEYS.CHARACTER_MODEL);
    if (stored && stored in CHARACTER_ICONS) {
      modelToggleIcon.value = CHARACTER_ICONS[stored as keyof typeof CHARACTER_ICONS];
    }
  } catch (_) {}
}

function loadHandTrackingState() {
  try {
    const btnVisible = localStorage.getItem(STORAGE_KEYS.HAND_TRACKING_BUTTON);
    // Default to true (visible) unless explicitly set to 'false'
    handTrackingButtonVisible.value = btnVisible !== 'false';
  } catch (_) {}
}

async function loadHandTrackScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window.toggleDotMatrixHandTracking === 'function') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = import.meta.env.BASE_URL + 'scripts/ui/dotmatrix-handtrack.js';
    script.onload = () => {
      // Give it a moment to execute
      setTimeout(resolve, 100);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function toggleHandTracking() {
  debugLog('handtrack', 'toggle:called', {
    hasToggle: typeof window.toggleDotMatrixHandTracking === 'function',
  });
  if (typeof window.toggleDotMatrixHandTracking !== 'function') {
    debugLog('handtrack', 'script:loading', {});
    try {
      await loadHandTrackScript();
    } catch (err) {
      logError('handtrack', 'script:loadFailed', err as Error);
      if (typeof window.appendNotifs === 'function') {
        window.appendNotifs('error', 'Failed to load hand tracking');
      }
      return;
    }
  }

  if (typeof window.toggleDotMatrixHandTracking === 'function') {
    await window.toggleDotMatrixHandTracking();
    handTrackingActive.value =
      typeof window.getDotMatrixHandTracking === 'function'
        ? window.getDotMatrixHandTracking()
        : false;
  } else {
    debugLog('handtrack', 'script:initFailed', {});
    if (typeof window.appendNotifs === 'function') {
      window.appendNotifs('error', 'Hand tracking failed to initialize');
    }
  }
}

// Listen for hand tracking button visibility changes
function onHandTrackButtonChange(e: HandTrackButtonChangeEvent): void {
  handTrackingButtonVisible.value = e.visible ?? false;
}

function lowerBar() {
  try {
    if (typeof window.lowerBarToBottom === 'function') window.lowerBarToBottom();
  } catch (_) {}
}

function onHeaderNewChat() {
  lowerBar();
  const proceed = window.confirm('Start a new chat? This will clear the current conversation.');
  if (proceed && typeof window.startNewChat === 'function') {
    window.startNewChat();
  }
}

function onCycleTheme() {
  // Don't lower bar for theme cycling - user wants to keep tapping to preview themes
  if (typeof window.cycleTheme === 'function') {
    window.cycleTheme();
  }
}

function onBackToChat() {
  // Close notes app window if open
  try {
    const wm = useWindowManager();
    const notesWin = wm.windowList.value.find((w) => w.appId === 'notes');
    if (notesWin) {
      wm.closeApp(notesWin.instanceId);
      return;
    }
  } catch (_) {}
  // Close help pane if open
  try {
    if (typeof window.closeHelpPane === 'function') {
      window.closeHelpPane();
      return;
    }
  } catch (_) {}
  // Fallback: remove split-mode directly
  try {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.classList.remove('split-mode');
    }
  } catch (_) {}
}

function toggleWeather() {
  lowerBar();
  const wm = useWindowManager();
  const existing = wm.windowList.value.find((w) => w.appId === 'weather-time');
  if (existing) {
    wm.closeApp(existing.instanceId);
  } else {
    const def = BUILTIN_APPS.find((d) => d.id === 'weather-time');
    if (def) wm.openWindow(def);
  }
}

function toggleNotes() {
  lowerBar();
  (window as unknown as Record<string, (() => void) | undefined>).toggleNotesPane?.();
}

// Initialize menu action store for modal state management
const menuStore = useMenuActionStore();

// Set closeSideMenu to close apps modal (replaces old side menu close)
import('@web/composables/useAppsModal').then(({ useAppsModal }) => {
  menuStore.setCloseSideMenuFn(() => useAppsModal().close());
});

// Initialize skills coordinator (singleton, auto-initializes on first call)
const skillCoordinator = useSkillCoordinator();

// Initialize skill-intent bridge (connects intent routing to skill execution)
const skillIntentBridge = useSkillIntentBridge();
const cleanupBridge = skillIntentBridge.initialize();
onBeforeUnmount(cleanupBridge);

// Initialize action observer (records user actions for the recursive learning pipeline)
useActionObserver();

// Initialize suggestion system (loads persisted proposals + dismissals)
// After init, periodically check patterns and generate suggestions (every 5 min)
const suggestions = useSuggestions();
let suggestionIntervalId: ReturnType<typeof setInterval> | null = null;
suggestions
  .initialize()
  .then(() => {
    suggestions.checkAndGenerate().catch(() => {});
    suggestionIntervalId = setInterval(
      () => {
        suggestions.checkAndGenerate().catch(() => {});
      },
      5 * 60 * 1000
    );
  })
  .catch((err: unknown) => {
    logError('suggestions', 'init', err as Error);
  });
onBeforeUnmount(() => {
  if (suggestionIntervalId !== null) clearInterval(suggestionIntervalId);
});

// Initialize app suggestion system (parallel to skill suggestions)
const appSuggestions = useAppSuggestions();
appSuggestions.checkAndGenerate().catch(() => {});
const appSuggestIntervalId = setInterval(
  () => {
    appSuggestions.checkAndGenerate().catch(() => {});
  },
  5 * 60 * 1000
);
onBeforeUnmount(() => clearInterval(appSuggestIntervalId));

// App runtime: create manager, wire window manager, register builtins, extract windowList
const appManager = createAppManager();
initWindowManager(appManager);
const appRegistry = createAppRegistry();
registerBuiltinApps(appRegistry).catch((err: unknown) => {
  logError('appShell', 'registerBuiltinApps', err as Error);
});
const windowManager = useWindowManager();
const { windowList } = windowManager;

// Override legacy globals to route through window manager
const noteDef = BUILTIN_APPS.find((d) => d.id === 'notes');

if (noteDef) {
  const noteDefRef = noteDef;
  (window as unknown as Record<string, unknown>).openNotesPane = () => {
    const wm = useWindowManager();
    const existing = wm.windowList.value.find((w) => w.appId === 'notes');
    if (!existing) wm.openWindow(noteDefRef);
  };
  (window as unknown as Record<string, unknown>).toggleNotesPane = () => {
    const wm = useWindowManager();
    const existing = wm.windowList.value.find((w) => w.appId === 'notes');
    if (existing) wm.closeApp(existing.instanceId);
    else wm.openWindow(noteDefRef);
  };
}

// Notes app open/close toggles body class so chat shifts right (one-column/two-column layout)
watch(
  () => windowList.value.some((w) => w.appId === 'notes'),
  (notesOpen) => {
    if (notesOpen) {
      document.body.classList.add('notes-widget-open');
    } else {
      document.body.classList.remove('notes-widget-open');
    }
  },
  { immediate: true }
);

// DEV-ONLY: expose window manager for console testing (remove after Phase 4)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__wm = windowManager;
}

// Connect chat store state to skill coordinator context signals
const chatStore = useChatStore();
const fileAttachments = useFileAttachments();
watch(
  () => ({
    count: fileAttachments.attachments.value?.length ?? 0,
    hasImage: (fileAttachments.attachments.value ?? []).some((a) =>
      a.file.type?.startsWith('image/')
    ),
  }),
  ({ count, hasImage }) => {
    skillCoordinator.setSignal('attachment.exists', count > 0);
    skillCoordinator.setSignal('attachment.count', count);
    skillCoordinator.setSignal('attachment.image', hasImage);
  },
  { immediate: true }
);

watch(
  () => chatStore.messages.length,
  (len) => {
    skillCoordinator.setSignal('conversation.empty', len === 0);
    skillCoordinator.setSignal('conversation.active', len > 0);
    skillCoordinator.setSignal('conversation.messageCount', len);
  },
  { immediate: true }
);

watch(
  () => chatStore.sending,
  (sending) => {
    skillCoordinator.setSignal('chat.sending', sending);
  },
  { immediate: true }
);

watch(
  () => chatStore.streaming.active,
  (active) => {
    skillCoordinator.setSignal('chat.streaming', active);
  },
  { immediate: true }
);

const youTubePlayer = useYouTubePlayer();
const { moveBarToViewportY, initInputBarClamp } = useInputBarClamp();
const { initCustomThemePhoto } = useCustomThemePhoto();
const {
  startDotMatrixSafely,
  primeDotmatrixInteractivity,
  initDotmatrix,
  resetDotmatrixForNewChat,
} = useDotmatrixInit();
let pointerDebugHandle: PointerDebugHudState | null | undefined = null;
let savePdfCleanup: (() => void) | null = null;
let jumpLatestCleanup: (() => void) | null = null;
let jumpLatestRetryHandle: number | null = null;
let customPhotoCleanup: (() => void) | null = null;

function setupJumpToLatestButton(attempts = 40) {
  try {
    if (jumpLatestCleanup) {
      try {
        jumpLatestCleanup();
      } catch (_) {}
      jumpLatestCleanup = null;
    }
    if (jumpLatestRetryHandle) {
      window.clearTimeout(jumpLatestRetryHandle);
      jumpLatestRetryHandle = null;
    }
    const chatWinOuter = document.getElementById('chat-window');
    const btn = document.getElementById('jump-latest');
    if (!chatWinOuter || !btn) {
      if (attempts > 0) {
        jumpLatestRetryHandle = window.setTimeout(() => setupJumpToLatestButton(attempts - 1), 100);
      }
      return;
    }
    // Find the actual scrolling element (could be inner .chat-scroller or the outer #chat-window)
    const innerScroller = chatWinOuter.querySelector('.chat-scroller');
    const chatWin = innerScroller || chatWinOuter;
    const threshold = 12;
    let raf: number | null = null;
    const isAtBottom = () => {
      try {
        if (!chatWin) return true;
        return chatWin.scrollHeight - chatWin.scrollTop - chatWin.clientHeight <= threshold;
      } catch (_) {
        return true;
      }
    };
    const applyVisibility = (show: boolean) => {
      if (show) btn.classList.add('visible');
      else btn.classList.remove('visible');
    };
    const requestUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        applyVisibility(!isAtBottom());
      });
    };
    const onScroll = () => requestUpdate();
    const onClick = () => {
      try {
        chatWin.scrollTo({ top: chatWin.scrollHeight, behavior: 'smooth' });
      } catch (_) {
        try {
          chatWin.scrollTop = chatWin.scrollHeight;
        } catch (_) {}
      }
      requestUpdate();
    };
    chatWin.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', onClick);
    const observer = new MutationObserver(() => requestUpdate());
    try {
      observer.observe(chatWin, { childList: true, subtree: true });
    } catch (_) {}
    requestUpdate();
    jumpLatestCleanup = () => {
      try {
        chatWin.removeEventListener('scroll', onScroll);
      } catch (_) {}
      try {
        btn.removeEventListener('click', onClick);
      } catch (_) {}
      try {
        observer.disconnect();
      } catch (_) {}
    };
  } catch (_) {}
}

function installPointerDebugHud() {
  try {
    if (typeof window === 'undefined' || window.__debugPointer !== true) return null;
    if (window.__pointerDebugHudInstalled) return window.__pointerDebugHudInstalled;
    const hud = document.createElement('div');
    hud.id = 'pointer-debug-hud';
    Object.assign(hud.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      padding: '8px 10px',
      background: 'rgba(0, 0, 0, 0.75)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '11px',
      lineHeight: '1.4',
      borderRadius: '6px',
      zIndex: 10_000,
      pointerEvents: 'none',
    });
    hud.textContent = 'pointer hud';
    document.body.appendChild(hud);

    const renderState = () => {
      try {
        const overlay = document.getElementById('glass-overlay');
        const overlayStyle = overlay ? getComputedStyle(overlay) : null;
        const overlayPtr = overlayStyle ? overlayStyle.pointerEvents : 'n/a';
        const overlayVis = overlay ? overlay.classList.contains('visible') : false;
        const thinking = document.querySelector('#app-shell .thinking');
        const thinkingSending = thinking ? thinking.classList.contains('sending') : false;
        const dotCanvas = document.querySelector('#canvas-container canvas');
        const dotPtr = dotCanvas ? getComputedStyle(dotCanvas).pointerEvents : 'n/a';
        hud.textContent =
          `overlay: ${overlayPtr}${overlayVis ? ' (visible)' : ''}\n` +
          `thinking: ${thinkingSending ? 'sending' : 'idle'}\n` +
          `dotmatrix: ${dotPtr}`;
      } catch (err: unknown) {
        hud.textContent = `pointer hud error: ${err instanceof Error ? err.message : String(err)}`;
      }
    };

    renderState();
    const update = () => requestAnimationFrame(renderState);
    const observeTargets = [
      document.getElementById('glass-overlay'),
      document.querySelector('#app-shell .thinking'),
      document.querySelector('#canvas-container'),
    ].filter((el): el is Element => el !== null);
    const observers = observeTargets.map((el) => {
      try {
        const obs = new MutationObserver(update);
        obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        return obs;
      } catch (_) {
        return null;
      }
    });
    const interval = window.setInterval(renderState, 1000);
    window.__pointerDebugHudInstalled = {
      hud,
      observers,
      interval,
    };
    return window.__pointerDebugHudInstalled;
  } catch (_) {}
}

onMounted(() => {
  // Load model icon from storage and listen for changes
  loadModelIcon();
  const bus = useEventBus();
  bus.on('character:change', (event) => {
    if (event && event.id && event.id in CHARACTER_ICONS) {
      modelToggleIcon.value = CHARACTER_ICONS[event.id as keyof typeof CHARACTER_ICONS];
    }
  });

  // Start app runtime (bridge message listener + watchdog)
  appManager.start();

  // Wire menu button to open AppsModal (replaces side menu)
  try {
    const menuBtn = document.getElementById('menu-button');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        dismissHints();
        import('@web/composables/useAppsModal').then(({ useAppsModal }) => {
          useAppsModal().toggle();
        });
      });
    }
  } catch (_) {}

  // Global handleMenuAction bridge (used by Electron IPC, speech, onboarding)
  try {
    window.handleMenuAction = (action: string) => {
      menuStore.dispatch(action);
    };
    if (window.electronMenu && typeof window.electronMenu.on === 'function') {
      window.electronMenu.on('menu-toggle-grid', () => menuStore.dispatch('toggle-grid'));
      window.electronMenu.on('menu-save-workspace', () => saveWorkspaceToFile());
      window.electronMenu.on('menu-load-workspace', (_event: unknown, payload: unknown) =>
        handleElectronWorkspaceLoad(payload as WorkspacePayload | null)
      );
      window.electronMenu.on('menu-save-pdf', () =>
        saveChatAsPdf().catch((err: unknown) => logError('chat', 'pdf:saveFailed', err as Error))
      );
      window.electronMenu.on('menu-select-theme', () => menuStore.dispatch('themes'));
      window.electronMenu.on('menu-api-keys', () => menuStore.dispatch('api-keys'));
    }
  } catch (_) {}

  // Phase 11: Register search providers for Cmd+K
  try {
    void (async () => {
      try {
        const { registerProvider, rebuildAll } = useUniversalSearch();
        const { createConversationsProvider } = await import(
          '@web/services/search/conversationsProvider'
        );
        const { createNotesProvider } = await import('@web/services/search/notesProvider');
        const { createSkillsProvider } = await import('@web/services/search/skillsProvider');
        const { createActionsProvider } = await import('@web/services/search/actionsProvider');
        const { createFilesProvider } = await import('@web/services/search/filesProvider');
        const { createAppsProvider } = await import('@web/services/search/appsProvider');
        registerProvider(createConversationsProvider());
        registerProvider(createNotesProvider());
        registerProvider(createSkillsProvider());
        registerProvider(createActionsProvider());
        registerProvider(createFilesProvider());
        registerProvider(createAppsProvider());
        rebuildAll();
      } catch (_) {}
    })();
  } catch (_) {}

  try {
    window.__disableGlobalDoubleTap = false;
  } catch (_) {}
  try {
    window.__disableDotmatrix = false;
  } catch (_) {}
  try {
    setupJumpToLatestButton();
  } catch (_) {}
  try {
    const savePdfBtn = document.getElementById('save-chat-option');
    if (savePdfBtn) {
      if (typeof savePdfCleanup === 'function') {
        try {
          savePdfCleanup();
        } catch (_) {}
      }
      const onClick = () => {
        lowerBar();
        saveChatAsPdf().catch((err) => logError('chat', 'pdf:exportFailed', err as Error));
      };
      savePdfBtn.addEventListener('click', onClick);
      savePdfCleanup = () => {
        try {
          savePdfBtn.removeEventListener('click', onClick);
        } catch (_) {}
        savePdfCleanup = null;
      };
    }
  } catch (_) {}
  // Add lowerBar() to other footer toolbar buttons
  try {
    const footerButtons = ['toggle-model-button', 'notes-toggle-button', 'help-toggle-button'];
    footerButtons.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', lowerBar, { capture: true });
      }
    });
  } catch (_) {}
  // Hand tracking button setup
  try {
    loadHandTrackingState();
    useEventBus().on('handtrack:button-change', onHandTrackButtonChange);
  } catch (_) {}
  // Prime dotmatrix interactivity (from composable)
  // Note: primeDotmatrixInteractivity checks if chat has started to avoid race conditions
  primeDotmatrixInteractivity();
  try {
    useEventBus().once('dotmatrix:ready', primeDotmatrixInteractivity);
  } catch (_) {}
  // Safety: ensure input bar is fully in view on first load (from composable)
  try {
    initInputBarClamp();
  } catch (_) {}
  // Initialize first-run state handling (screensaver exit on interaction)
  try {
    const { initFirstRunListeners } = useFirstRun();
    const cleanupFirstRun = initFirstRunListeners();
    if (cleanupFirstRun) {
      onBeforeUnmount(cleanupFirstRun);
    }
  } catch (_) {}
  // If messages already exist on load, ensure Custom overlay reflects it
  try {
    const chat = useChatStore();
    if (Array.isArray(chat.messages) && chat.messages.length > 0) {
      overlayOn('chat');
      dismissHints();
    }
  } catch (_) {}
  // Keep overlay in sync when theme changes (no-op outside Custom)
  try {
    useEventBus().on('theme:change', () => updateCustomOverlay());
  } catch (_) {}
  // Signal that Vue owns certain subsystems so legacy scripts interop politely
  try {
    window.__flags = window.__flags || {};
    window.__flags.__VUE_THEME_ENABLED = true;
    window.__flags.__VUE_WEATHER_ENABLED = true;
    window.__flags.__VUE_CHAT_ACTIVE = true;
    window.__flags.__VUE_FILE_UPLOAD_ENABLED = true;
  } catch (_) {}
  // Initialize theme based on persisted preference
  try {
    const theme = useTheme();
    theme.init();
    window.setTheme = (t) => theme.setTheme(t);
    // Connect skill coordinator to theme changes
    if (theme.currentTheme.value) {
      skillCoordinator.setThemeContext(theme.currentTheme.value);
    }
    watch(
      () => theme.currentTheme.value,
      (newTheme) => {
        if (newTheme) {
          skillCoordinator.setThemeContext(newTheme);
        }
      }
    );
  } catch (_) {}
  pointerDebugHandle = installPointerDebugHud();
  // Custom theme: background photo add/remove (from composable)
  try {
    customPhotoCleanup = initCustomThemePhoto({ useTheme, mirrorGetString: storage.mirror.get });
  } catch (_) {}
  // Bridge global appendNotifs to Vue overlay for legacy callers
  try {
    const { push } = useNotifs();
    window.appendNotifs = (kind, text) => push(kind, text);
    window.appendNotifsWithAction = (kind, text, action) => push(kind, text, action);
  } catch (_) {}
  // Bridge global appendMessage for legacy helpers (about/help/etc.)
  try {
    const chat = useChatStore();
    window.appendMessage = (sender, text, imageUrl) =>
      chat.appendMessage(sender as MessageSender, text, imageUrl);
  } catch (_) {}
  // Global YouTube link interceptor (chat bubbles, notifications, etc.)
  try {
    const { open, minimize, close } = youTubePlayer;
    try {
      window.openYouTubeViaVue = (id) => {
        try {
          const trimmed = typeof id === 'string' ? id.trim() : id;
          if (!trimmed) return;
          open(trimmed);
        } catch (_) {}
      };
      window.minimizeYouTubeViaVue = () => {
        try {
          minimize();
        } catch (_) {}
      };
      window.closeYouTubeViaVue = () => {
        try {
          close();
        } catch (_) {}
      };
    } catch (_) {}
    const onGlobalClick = (e: MouseEvent) => {
      try {
        const a =
          e.target && (e.target as Element).closest ? (e.target as Element).closest('a') : null;
        if (!a || !a.href) return;
        const id = parseYouTubeId(a.href);
        if (id) {
          e.preventDefault();
          open(id);
        }
      } catch (_) {}
    };
    document.addEventListener('click', onGlobalClick, true);
  } catch (_) {}
  // Drive the thinking animation + glass overlay from the sending state
  try {
    const chat = useChatStore();
    const { sending, streaming } = storeToRefs(chat);
    watch(sending, (isSending) => {
      if (isSending) showThinking();
      else hideThinking();
    });
    // Extra guard: if streaming finishes (active -> false), ensure cleanup
    watch(
      () => streaming.value && streaming.value.active,
      (active) => {
        if (!active) hideThinking();
      }
    );
  } catch (_) {}
  // Redundant global events to ensure UI toggles in all code paths
  try {
    const bus = useEventBus();
    bus.on('thinking:start', () => showThinking());
    bus.on('thinking:stop', () => hideThinking());
  } catch (_) {}
  // Hide skills after first user action
  try {
    useEventBus().on('chat:first-prompt', () => {
      dismissHints();
      // Mark that a chat has started to prevent race conditions with dotmatrix init
      try {
        window.__prvChatStarted = true;
      } catch (_) {}
      skillsHidden.value = true;
      // Lower the input bar to bottom position immediately
      try {
        if (typeof window.lowerBarToBottom === 'function') window.lowerBarToBottom();
      } catch (_) {}
      // Fallback: kick off thinking visuals on first prompt if watcher hasn't fired yet
      try {
        showThinking();
      } catch (_) {}
      // Darken Custom background once chat has started
      try {
        overlayOn('chat');
      } catch (_) {}
      try {
        if (typeof window.setDotMatrixInteractive === 'function')
          window.setDotMatrixInteractive(false);
      } catch (_) {}
    });
  } catch (_) {}
  // Start animation on initial load (from composable)
  try {
    initDotmatrix();
  } catch (_) {}

  // Provide a global new-chat helper expected by legacy menu and voice
  try {
    const chat = useChatStore();
    window.startNewChat = async () => {
      try {
        if (typeof chat.stop === 'function') {
          try {
            chat.stop();
          } catch (_) {}
        }
        try {
          chat.sending = false;
        } catch (_) {
          // Legacy fallback for ref-based sending state (no longer used)
        }
        try {
          const streamingState =
            chat.streaming && typeof chat.streaming === 'object' ? chat.streaming : null;
          if (streamingState) {
            if ('active' in streamingState) streamingState.active = false;
            if ('buffer' in streamingState) streamingState.buffer = '';
            if (
              'value' in streamingState &&
              streamingState.value &&
              typeof streamingState.value === 'object'
            ) {
              if ('active' in streamingState.value) streamingState.value.active = false;
              if ('buffer' in streamingState.value) streamingState.value.buffer = '';
            }
          }
        } catch (_) {}
        try {
          if (Object.prototype.hasOwnProperty.call(chat, 'nudge')) chat.nudge = null;
        } catch (_) {}
      } catch (_) {}
      try {
        // Hide blur and clear UI content
        resetThinkingOverlay();
        // Clear Pinia messages and attachments
        if (typeof chat.resetConversationState === 'function') {
          chat.resetConversationState();
        } else {
          chat.messages.splice(0, chat.messages.length);
        }
        useFileAttachments().clearAttachments();
        // Clear input
        const ui = document.getElementById('user-input') as HTMLTextAreaElement | null;
        if (ui) ui.value = '';
      } catch (_) {}
      // Reset server-side thread; the next send() will ensure a new one
      try {
        const base =
          (typeof window !== 'undefined' &&
            (window.API_BASE_URL || (window.prvctice && window.prvctice.apiBaseUrl))) ||
          '';
        const url = base ? `${base}/api/thread/clear` : '/api/thread/clear';
        await fetch(url, { method: 'POST' });
      } catch (_) {}
      // Start animation to indicate ready state (from composable)
      try {
        resetDotmatrixForNewChat();
      } catch (_) {}
      // Clear Custom overlay chat reason (notes/help flags remain)
      try {
        overlayOff('chat');
      } catch (_) {}
    };
  } catch (_) {}

  // Bridge legacy window.sendMessage used by speech.js and skills to Vue chat
  try {
    const chat = useChatStore();
    window.sendMessage = async (options: SendMessageOptions = {}) => {
      try {
        const input = document.getElementById('user-input') as HTMLTextAreaElement | null;
        const content =
          options && typeof options.content === 'string'
            ? options.content
            : input && typeof input.value === 'string'
              ? input.value
              : '';
        const message = (content || '').trim();
        if (!message && useFileAttachments().attachCount.value === 0) return;

        // Signal first prompt for UI that listens to this
        try {
          window.dispatchEvent(new Event('firstPromptSent'));
        } catch (_) {}

        // Blur input first on touch/iOS to dismiss keyboard
        try {
          if (input && typeof input.blur === 'function') input.blur();
        } catch (_) {}
        await chat.send(message);

        // Clear the textarea and sync v-model
        if (input) {
          input.value = '';
          try {
            input.classList.remove('interim');
          } catch (_) {}
          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_) {}
        }
        // Ensure the bar is lowered once a real message is sent
        try {
          if (typeof window.lowerBarToBottom === 'function') window.lowerBarToBottom();
        } catch (_) {}
      } catch (_) {}
    };
  } catch (_) {}
});

// Speech recognition is now bundled via useSpeech composable (auto-initializes on import)
// shimmer.ts is imported by useSpeech and exposes window.shimmer for visualization
void useSpeech;
// Initialize onboarding pulse hints
try {
  const pulse = useOnboardingPulse();
  pulse.init();
} catch (_) {}

// Initialize onboarding toasts (event-driven tips via sileo)
const onboardingToasts = useOnboardingToasts();
onboardingToasts.init();
onBeforeUnmount(() => onboardingToasts.cleanup());

// Initialize session toasts (trial usage nudges via sileo)
const sessionToasts = useSessionToasts();
onBeforeUnmount(() => sessionToasts.cleanup());

onBeforeUnmount(() => {
  // Stop app runtime (closes all windows, stops bridge + watchdog)
  appManager.stop();

  // Cleanup onboarding pulse hints
  try {
    const pulse = useOnboardingPulse();
    pulse.cleanup();
  } catch (_) {}
  try {
    useEventBus().off('handtrack:button-change', onHandTrackButtonChange);
  } catch (_) {}
  try {
    if (window.openYouTubeViaVue) window.openYouTubeViaVue = undefined;
    if (window.minimizeYouTubeViaVue) window.minimizeYouTubeViaVue = undefined;
    if (window.closeYouTubeViaVue) window.closeYouTubeViaVue = undefined;
    if (typeof savePdfCleanup === 'function') {
      try {
        savePdfCleanup();
      } catch (_) {}
    }
    if (typeof customPhotoCleanup === 'function') {
      try {
        customPhotoCleanup();
      } catch (_) {}
    }
    try {
      if (typeof jumpLatestCleanup === 'function') jumpLatestCleanup();
    } catch (_) {}
    jumpLatestCleanup = null;
    if (jumpLatestRetryHandle) {
      window.clearTimeout(jumpLatestRetryHandle);
      jumpLatestRetryHandle = null;
    }
    if (!pointerDebugHandle) return;
    const { hud, observers, interval } = pointerDebugHandle;
    if (Array.isArray(observers)) {
      observers.forEach((obs) => {
        try {
          obs && obs.disconnect && obs.disconnect();
        } catch (_) {}
      });
    }
    if (interval) window.clearInterval(interval);
    if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
    window.__pointerDebugHudInstalled = null;
  } catch (_) {}
});
</script>
