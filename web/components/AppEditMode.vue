<template>
  <teleport to="body">
    <div v-if="editState" class="aem-overlay" @click.self="handleCancel">
      <div class="aem-content">
        <!-- Header: name, version nav, actions -->
        <div class="aem-header">
          <div class="aem-header-left">
            <template v-if="isRenaming">
              <input
                ref="renameInputRef"
                v-model="renameValue"
                type="text"
                class="aem-rename-input"
                @keydown.enter="commitRename"
                @blur="commitRename"
              />
            </template>
            <template v-else>
              <span class="aem-app-name" title="Click to rename" @click="startRename">
                {{ currentVersion?.name || 'App' }}
              </span>
            </template>

            <!-- Version nav -->
            <div v-if="editState.versions.length > 1" class="aem-version-nav">
              <button
                type="button"
                class="aem-nav-btn"
                :disabled="editState.currentVersionIndex === 0"
                @click="handlePrevVersion"
              >
                &lsaquo;
              </button>
              <span class="aem-version-label">
                v{{ editState.currentVersionIndex + 1 }}/{{ editState.versions.length }}
              </span>
              <button
                type="button"
                class="aem-nav-btn"
                :disabled="editState.currentVersionIndex === editState.versions.length - 1"
                @click="handleNextVersion"
              >
                &rsaquo;
              </button>
            </div>
          </div>

          <div class="aem-header-right">
            <button type="button" class="aem-btn aem-btn--cancel" @click="handleCancel">
              Cancel
            </button>
            <button type="button" class="aem-btn aem-btn--save" @click="handleSave">Save</button>
          </div>
        </div>

        <!-- Main area: preview + chat -->
        <div class="aem-main">
          <!-- Left: Preview -->
          <div class="aem-preview-panel">
            <div class="aem-preview-container" :style="previewContainerStyle">
              <iframe
                class="aem-iframe"
                sandbox="allow-scripts"
                :srcdoc="currentVersionHtml"
                :style="previewIframeStyle"
              />
            </div>
          </div>

          <!-- Right: Chat -->
          <div class="aem-chat-panel">
            <div ref="chatScrollRef" class="aem-chat-messages">
              <div
                v-if="editState.messages.length === 0 && editState.status !== 'generating'"
                class="aem-chat-empty"
              >
                Describe changes to make to this app.
              </div>

              <div
                v-for="msg in editState.messages"
                :key="msg.id"
                class="aem-chat-msg"
                :class="'aem-chat-msg--' + msg.role"
              >
                <div class="aem-chat-msg-label">{{ msg.role === 'user' ? 'You' : 'Prvctice' }}</div>
                <div v-if="msg.role === 'user'" class="aem-chat-msg-text">{{ msg.content }}</div>
                <RichContent v-else :markdown="msg.content" class="aem-chat-msg-rich" />
                <button
                  v-if="msg.versionIndex !== undefined"
                  type="button"
                  class="aem-version-link"
                  @click="handleGoToVersion(msg.versionIndex)"
                >
                  Preview v{{ msg.versionIndex + 1 }} &rarr;
                </button>
              </div>

              <!-- Streaming indicator -->
              <div
                v-if="editState.status === 'generating'"
                class="aem-chat-msg aem-chat-msg--assistant"
              >
                <div class="aem-chat-msg-label">Prvctice</div>
                <div v-if="editState.streamingText" class="aem-chat-msg-rich">
                  <RichContent :markdown="editState.streamingText" />
                </div>
                <div v-else class="aem-typing-dots"><span /><span /><span /></div>
              </div>
            </div>

            <!-- Input -->
            <div class="aem-chat-input">
              <textarea
                ref="chatInputRef"
                v-model="editInput"
                placeholder="Describe your edit..."
                rows="2"
                :disabled="editState.status === 'generating'"
                @keydown.enter.exact.prevent="handleSendEdit"
              />
              <button
                type="button"
                class="aem-btn aem-btn--send"
                :disabled="!editInput.trim() || editState.status === 'generating'"
                @click="handleSendEdit"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useAppGenerator } from '@web/composables/useAppGenerator';
import { getUIKitCSS, getUIKitJS } from '@web/services/apps/uikit/index.js';
import { CSP_POLICY } from '@web/services/apps/sandbox';
import RichContent from './RichContent.vue';

const { editMode, goToVersion, renameEditApp, saveEdits, exitEditMode, sendEdit } =
  useAppGenerator();

const editInput = ref('');
const isRenaming = ref(false);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);
const chatScrollRef = ref<HTMLElement | null>(null);
const chatInputRef = ref<HTMLTextAreaElement | null>(null);

const editState = computed(() => editMode.value);

const currentVersion = computed(() => {
  const state = editState.value;
  if (!state) return null;
  return state.versions[state.currentVersionIndex] ?? null;
});

// Auto-scroll chat when messages change or streaming updates
watch(
  () => [editState.value?.messages.length, editState.value?.streamingText],
  () => {
    nextTick(() => {
      const el = chatScrollRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
);

// Focus input when entering edit mode
watch(
  () => editState.value?.appId,
  (newId) => {
    if (newId) {
      nextTick(() => chatInputRef.value?.focus());
    }
  }
);

// ── Preview injection (UIKit + stub SDK) ──

let previewInjectionCache: string | null = null;
function getPreviewInjection(): string {
  if (previewInjectionCache) return previewInjectionCache;

  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
  const uikitStyles = `<style id="prvctice-uikit">${getUIKitCSS()}</style>`;
  // Inject default --prvctice-* theme vars + body overrides to match runtime SDK behavior.
  // Without these, any app CSS using --prvctice-* directly gets empty values,
  // and body background/color aren't normalized like the real bridge SDK does.
  const themeDefaults = `<style id="prvctice-theme-defaults">:root{--prvctice-background:#1a1a2e;--prvctice-surface:#252542;--prvctice-text:#e0e0e0;--prvctice-text-secondary:#999;--prvctice-primary:#4F46E5;--prvctice-secondary:#7C3AED;--prvctice-accent:#0891B2;--prvctice-border:rgba(255,255,255,0.12)}html body{background:transparent!important;color:var(--prvctice-text)!important}</style>`;
  const baseStyles = '<style>body{margin:0}</style>';
  const stub =
    `<script>(function(){var noop=function(){return function(){}};var resolved=Promise.resolve();var pRes=function(){return resolved};window.prvctice={onReady:function(cb){try{cb()}catch(e){}},storage:{get:pRes,set:pRes,delete:pRes},theme:{get:function(){return Promise.resolve({})},onChange:noop},window:{resize:function(){},setTitle:function(){},onFocus:noop,onClose:noop},time:{now:function(){return new Date().toISOString()},timezone:function(){return Intl.DateTimeFormat().resolvedOptions().timeZone}},weather:{current:pRes,forecast:pRes},news:{fetch:pRes},web:{fetch:pRes},location:{current:pRes},ai:{complete:pRes},skills:{list:pRes,execute:pRes},calendar:{parse:pRes},clipboard:{readText:pRes,writeText:pRes},files:{read:pRes,list:pRes}}})()</` +
    `script>`;
  const uikitScript = `<script>${getUIKitJS()}</` + 'script>';

  previewInjectionCache = cspMeta + uikitStyles + themeDefaults + baseStyles + stub + uikitScript;
  return previewInjectionCache;
}

function injectPreviewStub(html: string): string {
  const injection = getPreviewInjection();
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + injection + html.slice(idx);
  }
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
}

const currentVersionHtml = computed(() => {
  const ver = currentVersion.value;
  if (!ver) return '';
  return injectPreviewStub(ver.html ?? '');
});

// ── Preview sizing ──

const previewContainerStyle = computed(() => {
  const ver = currentVersion.value;
  const size = ver?.defaultSize;
  if (size) {
    return {
      width: `${Math.min(size.w, 600)}px`,
      height: `${Math.min(size.h, 500)}px`,
    };
  }
  return { width: '400px', height: '300px' };
});

const previewIframeStyle = computed(() => ({
  width: '100%',
  height: '100%',
}));

// ── Rename ──

function startRename(): void {
  const ver = currentVersion.value;
  if (!ver) return;
  renameValue.value = ver.name ?? '';
  isRenaming.value = true;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function commitRename(): void {
  const trimmed = renameValue.value.trim();
  if (trimmed) {
    renameEditApp(trimmed);
  }
  isRenaming.value = false;
}

// ── Actions ──

function handleSendEdit(): void {
  const instruction = editInput.value.trim();
  if (!instruction || editState.value?.status === 'generating') return;
  editInput.value = '';
  void sendEdit(instruction);
}

function handlePrevVersion(): void {
  const state = editState.value;
  if (state) goToVersion(state.currentVersionIndex - 1);
}

function handleNextVersion(): void {
  const state = editState.value;
  if (state) goToVersion(state.currentVersionIndex + 1);
}

function handleGoToVersion(index: number): void {
  goToVersion(index);
}

function handleSave(): void {
  void saveEdits();
}

function handleCancel(): void {
  exitEditMode();
}
</script>

<style scoped>
/* ── Overlay ── */
.aem-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgb(10 10 10 / 55%);
  backdrop-filter: blur(var(--effect-backdrop-blur, 6px));
  -webkit-backdrop-filter: blur(var(--effect-backdrop-blur, 6px));
  display: flex;
  align-items: center;
  justify-content: center;
  animation: aem-overlay-in var(--motion-duration-fade, 0.35s) var(--motion-ease-standard, ease)
    both;
}

/* ── Content card ── */
/* Force light-on-dark palette: backgrounds are hardcoded dark,
   so text must always be light regardless of active theme. */
.aem-content {
  display: flex;
  flex-direction: column;
  width: min(1200px, 94vw);
  height: min(85vh, 800px);
  background: rgb(24 24 28 / 96%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--radius-xl, 28px);
  box-shadow: 0 25px 60px -12px rgb(0 0 0 / 60%);
  animation: aem-content-in var(--motion-duration-fade, 0.35s) var(--motion-ease-emphasis, ease)
    both;
  overflow: hidden;

  --color-text-primary: rgba(255, 255, 255, 0.9);
  --color-text-secondary: rgba(255, 255, 255, 0.6);
  --color-text-muted: rgba(255, 255, 255, 0.5);
  --color-text-hint: rgba(255, 255, 255, 0.4);
  --color-input-text: #fff;
  --color-input-bg: rgba(255, 255, 255, 0.06);
  --color-input-bg-focus: rgba(255, 255, 255, 0.08);
  --color-input-border: rgba(255, 255, 255, 0.12);
  --color-input-border-focus: rgba(255, 255, 255, 0.25);
  --color-btn-ghost-text: rgba(255, 255, 255, 0.6);
  --color-btn-ghost-bg-hover: rgba(255, 255, 255, 0.08);
}

/* ── Header ── */
.aem-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5, 12px) var(--space-6, 16px);
  border-bottom: 1px solid rgb(255 255 255 / 6%);
  flex-shrink: 0;
}

.aem-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4, 8px);
}

.aem-header-right {
  display: flex;
  gap: var(--space-3, 6px);
}

.aem-app-name {
  font-size: var(--font-size-sm, 14px);
  font-weight: 500;
  color: var(--color-text-primary, rgba(255, 255, 255, 0.9));
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.15s;
}

.aem-app-name:hover {
  border-bottom-color: var(--color-text-hint, rgba(255, 255, 255, 0.3));
}

.aem-rename-input {
  font-size: var(--font-size-sm, 14px);
  font-weight: 500;
  color: var(--color-input-text, #fff);
  background: var(--color-input-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--color-input-border-focus, rgba(255, 255, 255, 0.25));
  border-radius: var(--radius-sm, 6px);
  padding: 2px 8px;
  outline: none;
}

/* ── Version nav ── */
.aem-version-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.aem-nav-btn {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill, 999px);
  color: var(--color-text-muted, rgba(255, 255, 255, 0.5));
  font-size: 16px;
  line-height: 1;
  transition:
    background 0.15s,
    color 0.15s;
}

.aem-nav-btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 8%);
  color: var(--color-text-primary, rgba(255, 255, 255, 0.9));
}

.aem-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.aem-version-label {
  font-family: var(--font-family-mono, monospace);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-hint, rgba(255, 255, 255, 0.4));
  min-width: 40px;
  text-align: center;
}

/* ── Main: preview + chat ── */
.aem-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-height: 0;
}

/* ── Preview panel ── */
.aem-preview-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6, 16px);
  border-right: 1px solid rgb(255 255 255 / 6%);
  overflow: hidden;
}

.aem-preview-container {
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
  background: rgb(255 255 255 / 2%);
  max-width: 100%;
  max-height: 100%;
}

.aem-iframe {
  display: block;
  border: none;
  background: transparent;
}

/* ── Chat panel ── */
.aem-chat-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgb(28 28 34 / 100%);
}

.aem-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5, 12px) var(--space-6, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 8px);
}

.aem-chat-empty {
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.55));
  font-size: var(--font-size-sm, 14px);
  text-align: center;
  margin-top: var(--space-8, 24px);
}

/* ── Chat messages ── */
.aem-chat-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aem-chat-msg-label {
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.6));
}

.aem-chat-msg-text {
  font-size: var(--font-size-sm, 14px);
  color: var(--color-text-primary, rgba(255, 255, 255, 0.9));
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.aem-chat-msg--user {
  padding: var(--space-3, 6px) var(--space-4, 8px);
  background: rgb(255 255 255 / 12%);
  border-radius: var(--radius-md, 8px);
}

.aem-chat-msg--assistant {
  padding: var(--space-3, 6px) var(--space-4, 8px);
}

.aem-chat-msg-rich {
  font-size: var(--font-size-sm, 14px);
  color: var(--color-text-primary, rgba(255, 255, 255, 0.92));
  line-height: 1.5;
}

.aem-chat-msg-rich :deep(p) {
  margin: 0 0 var(--space-2, 4px);
}

.aem-chat-msg-rich :deep(p:last-child) {
  margin-bottom: 0;
}

.aem-version-link {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  margin-top: var(--space-2, 4px);
  font-family: var(--font-family-mono, monospace);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-btn-primary-bg, #4a9eff);
  background: rgba(74, 158, 255, 0.1);
  border: 1px solid rgba(74, 158, 255, 0.2);
  border-radius: var(--radius-pill, 999px);
  padding: 3px 10px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.aem-version-link:hover {
  background: rgba(74, 158, 255, 0.18);
  border-color: rgba(74, 158, 255, 0.35);
}

/* ── Typing dots ── */
.aem-typing-dots {
  display: flex;
  gap: 4px;
  padding: var(--space-2, 4px) 0;
}

.aem-typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-hint, rgba(255, 255, 255, 0.3));
  animation: aem-dot-blink 1.4s infinite both;
}

.aem-typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.aem-typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

/* ── Chat input ── */
.aem-chat-input {
  display: flex;
  gap: var(--space-3, 6px);
  padding: var(--space-4, 8px) var(--space-5, 12px);
  border-top: 1px solid rgb(255 255 255 / 8%);
  align-items: flex-end;
  background: rgb(32 32 38 / 100%);
}

.aem-chat-input textarea {
  flex: 1;
  padding: var(--space-3, 6px) var(--space-4, 8px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-input-border, rgba(255, 255, 255, 0.12));
  background: var(--color-input-bg, rgba(255, 255, 255, 0.06));
  color: var(--color-input-text, #fff);
  font-family: inherit;
  font-size: var(--font-size-sm, 14px);
  line-height: 1.4;
  resize: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.aem-chat-input textarea::placeholder {
  color: var(--color-text-hint, rgba(255, 255, 255, 0.4));
}

.aem-chat-input textarea:focus {
  outline: none;
  border-color: var(--color-input-border-focus, rgba(255, 255, 255, 0.25));
  background: var(--color-input-bg-focus, rgba(255, 255, 255, 0.08));
}

.aem-chat-input textarea:disabled {
  opacity: 0.5;
}

/* ── Buttons ── */
.aem-btn {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  font-size: var(--font-size-sm, 14px);
  padding: var(--space-3, 6px) var(--space-6, 16px);
  border-radius: var(--radius-pill, 999px);
  transition:
    background 0.15s,
    transform 0.1s,
    border-color 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.aem-btn:active {
  transform: scale(0.97);
}

.aem-btn--save {
  background: var(--color-btn-primary-bg, #4a9eff);
  color: var(--color-btn-primary-text, #fff);
}

.aem-btn--save:hover {
  filter: brightness(1.1);
}

.aem-btn--cancel {
  color: var(--color-btn-ghost-text, rgba(255, 255, 255, 0.6));
  background: transparent;
}

.aem-btn--cancel:hover {
  background: var(--color-btn-ghost-bg-hover, rgba(255, 255, 255, 0.08));
}

.aem-btn--send {
  background: rgb(255 255 255 / 6%);
  color: var(--color-input-text, #fff);
  border: 1px solid var(--color-input-border, rgba(255, 255, 255, 0.12));
  padding: var(--space-3, 6px) var(--space-5, 12px);
}

.aem-btn--send:hover:not(:disabled) {
  background: rgb(255 255 255 / 10%);
  border-color: var(--color-input-border-focus, rgba(255, 255, 255, 0.25));
}

.aem-btn--send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Animations ── */
@keyframes aem-overlay-in {
  from {
    opacity: 0;
  }
}

@keyframes aem-content-in {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.98);
  }
}

@keyframes aem-dot-blink {
  0%,
  80%,
  100% {
    opacity: 0.15;
  }
  40% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .aem-overlay,
  .aem-content {
    animation: none;
  }
}

/* ── Mobile: stack vertically ── */
@media (max-width: 768px) {
  .aem-content {
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
  }

  .aem-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .aem-preview-panel {
    border-right: none;
    border-bottom: 1px solid rgb(255 255 255 / 6%);
    padding: var(--space-4, 8px);
    max-height: 40vh;
  }

  .aem-header {
    padding: var(--space-4, 8px) var(--space-5, 12px);
  }
}
</style>
