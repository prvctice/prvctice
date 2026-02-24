<template>
  <div id="bar" data-no-orbit>
    <!-- Inline attachment thumbnails (Vue) -->
    <div v-if="attachmentThumbs.length" class="attached-row" aria-label="Attached images">
      <div v-for="(url, idx) in attachmentThumbs" :key="url" class="thumb">
        <img :src="url" alt="Attached image" />
        <button class="remove" title="Remove" @click.prevent="remove(idx)">×</button>
      </div>
    </div>
    <!-- Verify/Nudge chip row -->
    <div v-if="nudge" class="verify-chips" role="note" aria-live="polite">
      <span class="verify-text">{{ nudge.message || 'This provider may struggle here.' }}</span>
      <button class="chip" @click.prevent="acceptNudge">Switch</button>
      <button class="chip secondary" @click.prevent="keepNudge">Keep</button>
    </div>
    <div class="input-wrapper">
      <label for="user-input" class="sr-only">Message to AI assistant</label>
      <textarea
        id="user-input"
        v-model="text"
        placeholder="Type your message here..."
        aria-describedby="input-hints"
        @keydown="onKeydown"
        ref="inputRef"
        @focus="handleFocus"
        @blur="handleBlur"
      ></textarea>
      <span id="input-hints" class="sr-only">Press Enter to send, Shift+Enter for new line</span>

      <button
        class="button-hover-glow"
        id="send-button"
        :class="{ hidden: isStreaming, 'send-button--inactive': !sendIconVisible && !sending }"
        :data-arrow-visible="sendIconVisible"
        :disabled="sending || inputLocked"
        :aria-busy="sending ? 'true' : 'false'"
        aria-label="Send message"
        title="Send message"
        @click.prevent="send"
      >
        <span class="send-icon" v-show="sendIconVisible && !sending">
          <iconify-icon icon="ph:arrow-elbow-down-left"></iconify-icon>
        </span>
        <span class="spinner" v-show="sending"></span>
      </button>

      <button
        class="button-hover-glow"
        id="stop-button"
        title="Stop generating"
        aria-label="Stop generating"
        :class="{ hidden: !isStreaming }"
        @click.prevent="stop"
      >
        <span style="font-weight: 700">■</span>
      </button>
    </div>

    <div class="tools">
      <input
        type="file"
        id="image-upload"
        accept="image/*"
        multiple
        hidden
        aria-label="Attach images to message"
        @change="onFilesSelected"
      />
      <button
        class="button-hover-glow"
        id="upload-button"
        title="Attach images"
        aria-label="Attach images"
        :class="{ 'file-attached': hasAttachments, attached: hasAttachments }"
        @click.stop.prevent="browse"
      >
        <iconify-icon icon="ph:plus"></iconify-icon>
      </button>
      <button
        class="button-hover-glow"
        id="voice-input-button"
        title="Voice input"
        aria-label="Voice input"
        :class="{ locked: inputLocked }"
        @click="handleVoiceButtonClick"
      >
        <iconify-icon icon="ph:microphone"></iconify-icon>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@web/stores/chat.js';
import { useSessionGate } from '@web/composables/useSessionGate.js';
import { overlayOn } from '@web/utils/customOverlay.js';
import { storage } from '@web/storage/storage.js';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { useSkillPhysics } from '@web/composables/useSkillPhysics';
import { useEventBus } from '@web/services/eventBus';
import { useFileAttachments } from '@web/composables/useFileAttachments';
import { useBarDrag } from '@web/composables/useBarDrag';

const chat = useChatStore();
const session = useSessionGate();
const { streaming, sending, nudge } = storeToRefs(chat);
const { registerTarget, unregisterTarget } = useIntentCoordinator();
const skillCoordinator = useSkillCoordinator();
const physics = useSkillPhysics();
const fileAttachments = useFileAttachments();

// Initialize bar drag behavior (mouse/touch drag to reposition)
useBarDrag({
  barSelector: '#bar',
  minTop: 50,
  magneticTargets: ['.floating-notes-widget', '.floating-pdf-widget', '#weather-time-widget'],
});

const isStreaming = computed(() => !!(streaming.value && streaming.value.active));
const hasAttachments = computed(() => fileAttachments.attachCount.value > 0);
const inputRef = ref(null);
const text = ref('');
const isInputActive = ref(false);
const sendIconVisible = computed(() => isInputActive.value);
const inputLocked = computed(() => !session.canSendMessages.value);
// Track cleanup functions to unregister listeners; registered outside lifecycle
const __cleanup = [];

// Compute thumbnails from composable's attachments (which already have previewUrl)
const attachmentThumbs = computed(() => {
  return fileAttachments.attachments.value.filter((a) => a.previewUrl).map((a) => a.previewUrl);
});

if (typeof window !== 'undefined') {
  watch(
    inputLocked,
    (locked) => {
      try {
        window.__prvVoiceInputLocked = locked;
        useEventBus().emit('voice:input-lock', { locked });
      } catch (_) {}
    },
    { immediate: true }
  );
}

function onKeydown(e) {
  // Signal particle awareness on keystrokes
  try {
    window.onDotMatrixKeystroke?.();
  } catch (_) {}

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function handleFocus() {
  isInputActive.value = true;
}

function handleBlur() {
  isInputActive.value = false;
}

function promptForKeys() {
  try {
    if (typeof window.openApiKeysModal === 'function') {
      window.openApiKeysModal();
      return;
    }
  } catch (_) {}
  try {
    if (typeof window.openSettingsModal === 'function') {
      window.openSettingsModal();
      return;
    }
    if (typeof window.handleMenuAction === 'function') {
      window.handleMenuAction('api-keys');
      return;
    }
  } catch (_) {}
  try {
    if (typeof window.showApiKeyOnboarding === 'function') {
      window.showApiKeyOnboarding(true);
    }
  } catch (_) {}
}

async function send() {
  if (inputLocked.value) {
    promptForKeys();
    return;
  }
  const v = text.value.trim();
  if (!v && fileAttachments.attachCount.value === 0) return;
  if (sending.value) return;

  // Signal particle awareness that user submitted a message
  try {
    window.onDotMatrixUserSubmit?.();
  } catch (_) {}

  // Signal immediately that a chat has started for Monday overlay dimming
  try {
    window.dispatchEvent(new Event('firstPromptSent'));
  } catch (_) {}
  try {
    overlayOn('chat');
  } catch (_) {}
  // On mobile/iOS, close the keyboard by blurring the textarea before send
  try {
    const el = inputRef.value || document.getElementById('user-input');
    if (el && typeof el.blur === 'function') el.blur();
  } catch (_) {}
  await chat.send(v);
  text.value = '';
  try {
    if (typeof window.lowerBarToBottom === 'function') window.lowerBarToBottom();
  } catch (_) {}
}

function stop() {
  try {
    chat.stop();
  } catch (_) {}
}

function browse() {
  if (inputLocked.value) {
    promptForKeys();
    return;
  }
  try {
    document.getElementById('image-upload')?.click();
  } catch (_) {}
}

async function onFilesSelected(e) {
  if (inputLocked.value) {
    promptForKeys();
    return;
  }
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  await fileAttachments.attachFiles(files);
  try {
    e.target.value = '';
  } catch (_) {}
}

function remove(index) {
  try {
    fileAttachments.removeAttachment(index);
  } catch (_) {}
}

function acceptNudge() {
  try {
    chat.acceptNudge();
  } catch (_) {}
}
function keepNudge() {
  try {
    chat.keepNudge();
  } catch (_) {}
}

function handleVoiceButtonClick(event) {
  if (inputLocked.value) {
    try {
      event?.preventDefault?.();
    } catch (_) {}
    try {
      event?.stopImmediatePropagation?.();
    } catch (_) {}
    promptForKeys();
    return;
  }
  // Emit voice toggle event for useSpeech to handle
  useEventBus().emit('voice:toggle');
}

onMounted(async () => {
  await nextTick();
  const bus = useEventBus();

  // Listen for speech transcripts from useSpeech (Electron native speech)
  const onSpeechTranscript = ({ text: transcriptText, isFinal }) => {
    // Update Vue reactive text ref (fixes DOM-bypassing bug)
    text.value = transcriptText;
    // Add/remove interim class for visual feedback
    const inputEl = inputRef.value;
    if (inputEl) {
      if (transcriptText && !isFinal) {
        inputEl.classList.add('interim');
      } else {
        inputEl.classList.remove('interim');
      }
    }
  };
  bus.on('speech:transcript', onSpeechTranscript);
  __cleanup.push(() => bus.off('speech:transcript', onSpeechTranscript));

  // Center bar initially if configured
  try {
    const bar = document.getElementById('bar');
    if (bar && window.AppSettings?.centerInputBarOnStart !== false) {
      bar.classList.add('initial-position');
    }
    window.lowerBarToBottom = () => {
      const b = document.getElementById('bar');
      if (!b) return;
      b.classList.remove('initial-position');
      b.style.removeProperty('transform');
      b.style.removeProperty('top');
    };
  } catch (_) {}

  // Register as intent target for hand tracking / voice commands
  // Track the bar's position at grab start for delta-based movement
  let barGrabStartTop = null;

  registerTarget('inputBar', {
    zone: '#bar', // Dynamic rect from element
    actions: ['move', 'focus', 'submit'],
    handler: (intent) => {
      const bar = document.getElementById('bar');
      switch (intent.action) {
        case 'move':
          if (bar && intent.value) {
            // Snap from initial position if needed
            if (bar.classList.contains('initial-position')) {
              const rect = bar.getBoundingClientRect();
              bar.style.top = rect.top + 'px';
              bar.style.transform = 'none';
              bar.classList.remove('initial-position');
            }

            // Get current bar position
            const currentRect = bar.getBoundingClientRect();

            // Calculate new position using delta from grab start
            const h = bar.offsetHeight || 0;
            const maxTop = Math.max(0, (window.innerHeight || 0) - h);
            let newTop;

            // Support both value.deltaY (hand tracking) and value.delta.y (gamepad)
            const deltaY = intent.value.deltaY ?? intent.value.delta?.y;
            if (deltaY != null) {
              // Initialize grab start position on first move intent (for delta-based movement)
              if (barGrabStartTop === null) {
                // Don't start bar drag if another element is already being dragged
                if (physics.isGenericDragging()) break;
                barGrabStartTop = currentRect.top;
                // Start physics drag for intent-based movement
                physics.startGenericDrag('inputBar', { x: 0, y: currentRect.top }, { x: 0, y: 0 });
              }

              // Gamepad sends per-frame deltas - add to current position
              // Hand tracking sends cumulative delta from grab start
              if (intent.source === 'gamepad') {
                newTop = currentRect.top + deltaY;
              } else {
                // Delta-based movement - deltaY is negative when hand moves up
                newTop = barGrabStartTop + deltaY;
              }

              // Route through physics for magnetic effects
              const result = physics.updateGenericDrag({ x: 0, y: newTop });
              newTop = result.position.y;
            } else if (intent.value.y != null) {
              // Absolute position from double-tap: instant move, no physics drag
              newTop = Math.round(intent.value.y - h / 2);
            } else {
              break;
            }

            // Clamp to viewport (allow going higher than before - min 50px)
            newTop = Math.max(50, Math.min(maxTop, newTop));
            bar.style.top = newTop + 'px';
          }
          break;
        case 'focus':
          try {
            inputRef.value?.focus();
          } catch (_) {}
          break;
        case 'submit':
          // If value.text provided (e.g., from "what do you think?" voice command),
          // set input text before sending
          if (intent.value?.text && inputRef.value) {
            inputRef.value.value = intent.value.text;
          }
          send();
          break;
      }
    },
  });

  // Register as skill drop zone for the evolved skills system.
  //
  // NOTE: This zone registration handles mouse/touch pill drag-and-drop
  // (imperative DOM, managed by SkillsDock). The useSkillIntentBridge
  // composable separately bridges intent-based interactions (hand tracking,
  // gamepad) to skill execution. Both registrations coexist safely because
  // they serve different input modalities.
  try {
    skillCoordinator.registerZone({
      id: 'input-bar',
      label: 'Send to AI',
      element: '#bar',
      accepts: ['prompt', 'template', 'chain'],
      magnetRadius: 80,
      snapStrength: 0.8,
      highlightClass: 'zone-input-bar',
      onDrop: async (skill, ctx) => {
        // Execute the skill through the coordinator
        const result = await skillCoordinator.execute(skill.id);
        return result;
      },
      onEnter: (skill, position) => {
        // Add visual feedback when pill enters zone
        const bar = document.getElementById('bar');
        if (bar) bar.classList.add('skill-drop-ready');
      },
      onLeave: (skill) => {
        // Remove visual feedback when pill leaves zone
        const bar = document.getElementById('bar');
        if (bar) bar.classList.remove('skill-drop-ready');
      },
    });
  } catch (_) {}

  // Listen for skill:prompt events from the coordinator
  const onSkillPrompt = (event) => {
    try {
      const { text: promptText, appendToInput, autoSubmit } = event.detail;
      if (!promptText) return;

      if (appendToInput) {
        // Append to existing text
        text.value = text.value ? `${text.value}\n${promptText}` : promptText;
      } else {
        // Replace text
        text.value = promptText;
      }

      // Focus the input
      inputRef.value?.focus();

      // Auto-submit if requested
      if (autoSubmit) {
        nextTick(() => send());
      }
    } catch (_) {}
  };
  bus.on('skill:prompt', onSkillPrompt);
  __cleanup.push(() => bus.off('skill:prompt', onSkillPrompt));

  // Reset grab start when pinch is released (listen for custom event)
  const onGrabEnd = () => {
    barGrabStartTop = null;
    // End physics drag if active
    if (physics.isGenericDragging()) {
      physics.endGenericDrag();
    }
  };
  bus.on('handtrack:grab-end', onGrabEnd);
  __cleanup.push(() => bus.off('handtrack:grab-end', onGrabEnd));
  // Vue owns bar gestures; signal legacy script to skip
  try {
    window.__flags = window.__flags || {};
    window.__flags.__VUE_BAR_HANDLES = true;
  } catch (_) {}

  // Theme cycle on double-click / double-tap (drag logic moved to useBarDrag composable)
  try {
    const aliasMap = {
      dark: 'night',
      cool: 'vera-baxter',
      minimal: 'vitti',
      focus: 'vitti',
      paper: 'share-bear',
      sunset: 'eva',
      dusk: 'fragile',
      monday: 'custom',
      blue: 'vera-baxter',
    };
    const menuOrder =
      window.AppSettings &&
      Array.isArray(window.AppSettings.themeOrder) &&
      window.AppSettings.themeOrder.length
        ? window.AppSettings.themeOrder
        : [
            'high-contrast',
            'eva',
            'fragile',
            'night',
            'vitti',
            'vera-baxter',
            'share-bear',
            'light',
            'custom',
          ];
    const cycleOrder =
      window.AppSettings &&
      Array.isArray(window.AppSettings.themeCycleOrder) &&
      window.AppSettings.themeCycleOrder.length
        ? window.AppSettings.themeCycleOrder
        : menuOrder.filter((theme) => theme !== 'custom');
    const getCurrentTheme = () => {
      try {
        const stored = storage.mirror.get('theme');
        if (stored) return aliasMap[stored] || stored;
      } catch (_) {}
      const html = document.documentElement;
      const themeClass = Array.from(html.classList).find((c) => /-theme$/.test(c));
      return themeClass
        ? aliasMap[themeClass.replace(/-theme$/, '')] || themeClass.replace(/-theme$/, '')
        : aliasMap[window.AppSettings?.defaultTheme] || window.AppSettings?.defaultTheme || 'light';
    };
    const cycleTheme = (step = 1) => {
      const order = cycleOrder.length ? cycleOrder : menuOrder;
      const current = getCurrentTheme();
      const idx = order.indexOf(current);
      // Handle negative steps properly with modulo
      const nextIdx = (((idx + step) % order.length) + order.length) % order.length;
      const nextTheme = order[nextIdx] || order[0] || 'light';
      if (typeof window.setTheme === 'function') window.setTheme(nextTheme);
    };
    // Expose globally for theme cycle button and intent handler
    window.cycleTheme = cycleTheme;
  } catch (_) {}
});

// Keep scroll near the bottom when streaming toggles
watch(isStreaming, async () => {
  await nextTick();
  try {
    const el = document.getElementById('chat-window');
    if (el) el.scrollTop = el.scrollHeight;
  } catch (_) {}
});

// Unregister listeners on component destroy
onBeforeUnmount(() => {
  // Unregister from intent coordinator
  unregisterTarget('inputBar');

  // Unregister from skill coordinator
  try {
    skillCoordinator.unregisterZone('input-bar');
  } catch (_) {}

  // Note: physics.unregisterDraggable is handled by useBarDrag composable

  try {
    __cleanup.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  } catch (_) {}
});

// Theme cycling gestures are handled by bar-gestures.js → intent system → theme target
</script>

<style scoped>
.attached-row {
  display: flex;
  gap: 8px;
  margin: 6px 0;
  flex-wrap: wrap;
}

.attached-row .thumb {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-toggle-bg-off);
}

.attached-row .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.attached-row .thumb .remove {
  position: absolute;
  top: 0;
  right: 0;
  background: var(--color-backdrop-heavy);
  color: var(--color-toggle-thumb);
  border: none;
  border-radius: 0 0 0 var(--radius-sm);
  cursor: pointer;
  padding: 0 6px;
  line-height: 18px;
}

.verify-chips {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px;
  padding: 6px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-text-secondary);
  position: relative;
  z-index: 5;
}

.verify-text {
  font-size: var(--font-size-xs);
  opacity: 0.9;
}

.chip {
  font-size: var(--font-size-xs);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-btn-secondary-border);
  background: var(--color-input-border);
  cursor: pointer;
}

.chip.secondary {
  background: transparent;
}

.chip:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
</style>
