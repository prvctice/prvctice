<template>
  <div ref="widgetRef" class="notes-content" data-no-orbit>
    <!-- Tab Bar -->
    <div class="notes-tabs" role="tablist" aria-label="Note tabs">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="notes-tab"
        :class="{ active: tab.id === activeTabId }"
        role="tab"
        :aria-selected="tab.id === activeTabId"
        tabindex="0"
        @click="onTabClick(tab)"
        @keydown.enter="onTabClick(tab)"
      >
        <input
          v-if="editingTabId === tab.id"
          v-model="editingTitle"
          class="notes-tab-edit"
          @blur="saveTabEdit"
          @keydown.enter.prevent="saveTabEdit"
          @keydown.escape.prevent="cancelTabEdit"
          @click.stop
        />
        <span v-else class="notes-tab-title">{{ tab.title }}</span>
        <button
          v-if="tabs.length > 1 && editingTabId !== tab.id"
          class="notes-tab-close"
          @click.stop="onTabClose(tab.id)"
          :aria-label="`Close ${tab.title}`"
        >
          <iconify-icon icon="ph:x" aria-hidden="true" style="font-size: 10px"></iconify-icon>
        </button>
      </div>
      <button class="notes-tab add" aria-label="New tab" @click="onNewTab">+</button>
    </div>

    <!-- Persistent Format Toolbar -->
    <div class="notes-format-toolbar">
      <button
        @click="editorApi.toggleBold()"
        :class="{ active: editorApi.isActive('bold') }"
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      >
        <iconify-icon icon="ph:text-b"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleItalic()"
        :class="{ active: editorApi.isActive('italic') }"
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      >
        <iconify-icon icon="ph:text-italic"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleStrike()"
        :class="{ active: editorApi.isActive('strike') }"
        title="Strikethrough"
        aria-label="Strikethrough"
      >
        <iconify-icon icon="ph:text-strikethrough"></iconify-icon>
      </button>
      <span class="toolbar-divider"></span>
      <button
        @click="editorApi.toggleHeading(1)"
        :class="{ active: editorApi.isActive('heading', { level: 1 }) }"
        title="Heading 1"
        aria-label="Heading 1"
      >
        <iconify-icon icon="ph:text-h-one"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleHeading(2)"
        :class="{ active: editorApi.isActive('heading', { level: 2 }) }"
        title="Heading 2"
        aria-label="Heading 2"
      >
        <iconify-icon icon="ph:text-h-two"></iconify-icon>
      </button>
      <span class="toolbar-divider"></span>
      <button
        @click="editorApi.toggleBulletList()"
        :class="{ active: editorApi.isActive('bulletList') }"
        title="Bullet list"
        aria-label="Bullet list"
      >
        <iconify-icon icon="ph:list-bullets"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleTaskList()"
        :class="{ active: editorApi.isActive('taskList') }"
        title="Task list"
        aria-label="Task list"
      >
        <iconify-icon icon="ph:check-square"></iconify-icon>
      </button>
      <span class="toolbar-divider"></span>
      <button
        @click="editorApi.setHorizontalRule()"
        title="Horizontal rule"
        aria-label="Horizontal rule"
      >
        <iconify-icon icon="ph:minus"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleCodeBlock()"
        :class="{ active: editorApi.isActive('codeBlock') }"
        title="Code block"
        aria-label="Code block"
      >
        <iconify-icon icon="ph:code"></iconify-icon>
      </button>
      <span class="toolbar-divider"></span>
      <button @click="emailCurrentTab" title="Email this note" aria-label="Email current note">
        <iconify-icon icon="ph:envelope"></iconify-icon>
      </button>
      <button @click="sendToChat" title="Send to chat" aria-label="Send notes to chat">
        <iconify-icon icon="ph:paper-plane-right"></iconify-icon>
      </button>
    </div>

    <!-- Floating Bubble Toolbar -->
    <div v-if="showBubble" class="notes-bubble-toolbar" :style="bubbleStyle" @mousedown.prevent>
      <button
        @click="editorApi.toggleHeading(1)"
        :class="{ active: editorApi.isActive('heading', { level: 1 }) }"
        title="Heading"
      >
        <iconify-icon icon="ph:text-h-one"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleBold()"
        :class="{ active: editorApi.isActive('bold') }"
        title="Bold"
      >
        <iconify-icon icon="ph:text-b"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleItalic()"
        :class="{ active: editorApi.isActive('italic') }"
        title="Italic"
      >
        <iconify-icon icon="ph:text-italic"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleUnderline()"
        :class="{ active: editorApi.isActive('underline') }"
        title="Underline"
      >
        <iconify-icon icon="ph:text-underline"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleStrike()"
        :class="{ active: editorApi.isActive('strike') }"
        title="Strikethrough"
      >
        <iconify-icon icon="ph:text-strikethrough"></iconify-icon>
      </button>
      <span class="notes-bubble-divider"></span>
      <button
        @click="editorApi.toggleBulletList()"
        :class="{ active: editorApi.isActive('bulletList') }"
        title="Bullet list"
      >
        <iconify-icon icon="ph:list-bullets"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleOrderedList()"
        :class="{ active: editorApi.isActive('orderedList') }"
        title="Numbered list"
      >
        <iconify-icon icon="ph:list-numbers"></iconify-icon>
      </button>
      <button
        @click="editorApi.toggleTaskList()"
        :class="{ active: editorApi.isActive('taskList') }"
        title="Task list"
      >
        <iconify-icon icon="ph:check-square"></iconify-icon>
      </button>
    </div>

    <!-- TipTap Editor -->
    <EditorContent :editor="editor" class="notes-editor" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { EditorContent } from '@tiptap/vue-3';
import { useNotesEditor } from '@web/composables/useNotesEditor.js';
import { useNotesTabs } from '@web/composables/useNotesTabs.js';
import { useChatStore } from '@web/stores/chat.js';
import { useNotifs } from '@web/composables/useNotifs.js';
import { overlayOn } from '@web/utils/customOverlay.js';
import { useEventBus } from '@web/services/eventBus';
import { useWindowManager } from '@web/composables/useWindowManager';
import { BUILTIN_APPS } from '@web/services/apps/builtinApps';

// ==================== NOTES PANE STATE ====================

const widgetRef = ref(null);
const editingTabId = ref(null);
const editingTitle = ref('');
const showBubble = ref(false);
const bubbleX = ref(0);
const bubbleY = ref(0);

const bubbleStyle = computed(() => ({
  position: 'absolute',
  left: `${bubbleX.value}px`,
  top: `${bubbleY.value}px`,
  transform: 'translateX(-50%)',
  zIndex: 100,
}));

// Notifications
const notifApi = useNotifs();
const pushNotif = notifApi?.push || (() => {});
function notify(kind, text) {
  try {
    pushNotif(kind, text);
  } catch {}
}

// Event handler reference for cleanup
let saveToNotesHandler = null;

// ==================== TABS ====================

const {
  tabs,
  activeTabId,
  loadTabs,
  setActiveId,
  loadContent,
  saveContent,
  newTab,
  renameTab,
  closeTab,
} = useNotesTabs();

// ==================== EDITOR ====================

let saveDebounce = null;

const editorApi = useNotesEditor({
  placeholder: 'Type notes here...',
  onUpdate: (html) => {
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      if (activeTabId.value) {
        saveContent(activeTabId.value, html);
      }
    }, 300);
  },
  onSelectionUpdate: () => updateBubblePosition(),
  onBlur: () => {
    setTimeout(() => {
      showBubble.value = false;
    }, 150);
  },
});

const editor = editorApi.editor;

// ==================== TAB ACTIONS ====================

function onTabClick(tab) {
  if (tab.id === activeTabId.value) {
    startTabEdit(tab);
  } else {
    switchToTab(tab.id);
  }
}

function startTabEdit(tab) {
  editingTabId.value = tab.id;
  editingTitle.value = tab.title || 'Untitled';
  nextTick(() => {
    const input = widgetRef.value?.querySelector('.notes-tab-edit');
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function saveTabEdit() {
  if (editingTabId.value && editingTitle.value.trim()) {
    renameTab(editingTabId.value, editingTitle.value.trim());
  }
  editingTabId.value = null;
  editingTitle.value = '';
}

function cancelTabEdit() {
  editingTabId.value = null;
  editingTitle.value = '';
}

function onTabClose(id) {
  closeTab(id);
  if (activeTabId.value) {
    editorApi.setContent(loadContent(activeTabId.value));
  }
}

function onNewTab() {
  if (activeTabId.value) {
    saveContent(activeTabId.value, editorApi.getHTML());
  }
  newTab();
  editorApi.setContent('');
  editorApi.focus();
}

function switchToTab(id) {
  if (activeTabId.value) {
    saveContent(activeTabId.value, editorApi.getHTML());
  }
  setActiveId(id);
  editorApi.setContent(loadContent(id));
}

// ==================== HEADER ACTIONS ====================

function sendToChat() {
  const text = editorApi.getText();
  if (!text) return;
  try {
    const chat = useChatStore();
    window.dispatchEvent(new Event('firstPromptSent'));
    try {
      overlayOn('chat');
    } catch {}
    chat.send(text);
  } catch {
    const input = document.getElementById('user-input');
    if (input) input.value = text;
  }
}

function emailCurrentTab() {
  const text = editorApi.getText();
  if (!text) {
    notify('error', 'Nothing to email.');
    return;
  }
  const activeTab = tabs.value.find((t) => t.id === activeTabId.value);
  const subject = activeTab?.title || 'Notes';
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  window.open(mailtoUrl, '_blank');
}

// ==================== SEND TO NOTES HELPERS ====================

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str = '') {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

function shortenText(text, limit = 280) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= limit) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const sentence of sentences) {
    const candidate = out ? `${out} ${sentence}`.trim() : sentence.trim();
    if (!candidate) continue;
    if (candidate.length > limit) break;
    out = candidate;
  }
  if (!out) out = clean.slice(0, limit - 1).trim();
  return `${out}...`;
}

function collectLinks(contentEl) {
  if (!contentEl || typeof contentEl.querySelectorAll !== 'function') return [];
  const anchors = Array.from(contentEl.querySelectorAll('a[href]'));
  const seen = new Set();
  return anchors
    .map((a) => {
      try {
        const href = a.getAttribute('href') || a.href;
        if (!href) return null;
        const label = (a.textContent || '').trim() || href;
        let normalized = href;
        try {
          normalized = new URL(href, window.location.href).href;
        } catch {
          normalized = href;
        }
        return { href: normalized, label };
      } catch {
        return null;
      }
    })
    .filter((link) => {
      if (!link || !link.href) return false;
      if (seen.has(link.href)) return false;
      seen.add(link.href);
      return true;
    });
}

function summariseTextContent(rawText, contentEl) {
  const text = String(rawText || '').trim();
  if (!text) return '';
  const listItems = contentEl
    ? Array.from(contentEl.querySelectorAll('li'))
        .map((li) => (li.innerText || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    : [];
  if (listItems.length) {
    const cleaned = listItems.map((item) => shortenText(item, 320)).filter(Boolean);
    return `<ul>${cleaned.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]?/g) || [text];
  const collected = [];
  for (const sentence of sentences) {
    const chunk = sentence.trim();
    if (!chunk) continue;
    collected.push(chunk);
    if (collected.length >= 3 || collected.join(' ').length >= 420) break;
  }
  if (!collected.length) collected.push(text.slice(0, 240));
  const summary = collected.join(' ').trim();
  return summary
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('');
}

function buildNoteHtml(payload) {
  const stamp = new Date();
  const heading = stamp.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const summaryHtml = payload.summaryHtml || `<p>${escapeHtml(payload.rawText || '')}</p>`;
  let html = `<section class="notes-entry assistant-note"><p><strong>Summary - ${escapeHtml(
    heading
  )}</strong></p>${summaryHtml}`;
  if (payload.links && payload.links.length) {
    html += '<p><strong>Links</strong></p><ul>';
    html += payload.links
      .map(
        (link) =>
          `<li><a href="${escapeAttr(link.href)}" target="_blank" rel="noopener">${escapeHtml(
            link.label || link.href
          )}</a></li>`
      )
      .join('');
    html += '</ul>';
  }
  html += '</section>';
  return html;
}

function summariseAssistantBubble(bubbleEl) {
  if (!bubbleEl) return null;
  const content = bubbleEl.querySelector ? bubbleEl.querySelector('.message-content') : null;
  if (!content) return null;
  const rawText = (content.innerText || '').trim();
  if (!rawText) return null;
  const summaryHtml = summariseTextContent(rawText, content);
  const links = collectLinks(content);
  return { summaryHtml, links, rawText };
}

function appendAssistantBubbleToNotes(bubbleEl) {
  try {
    const payload = summariseAssistantBubble(bubbleEl);
    if (!payload) {
      notify('error', "Couldn't find anything to save from that reply.");
      return false;
    }
    const html = buildNoteHtml(payload);
    const ok = editorApi.appendHTML(html + '<p><br></p>');
    if (ok) {
      if (activeTabId.value) {
        saveContent(activeTabId.value, editorApi.getHTML());
      }
      notify('success', 'Summary saved to Notes.');
    } else {
      notify('error', 'Failed to write to Notes.');
    }
    return ok;
  } catch (err) {
    console.error('appendAssistantBubbleToNotes failed', err);
    notify('error', 'Something went wrong saving to Notes.');
    return false;
  }
}

function appendLastAssistantMessageToNotesFull() {
  const chatWin = document.getElementById('chat-window');
  if (!chatWin) {
    notify('error', 'Chat window is not ready yet.');
    return false;
  }
  const nodes = chatWin.querySelectorAll('.message.assistant');
  const last = nodes && nodes.length ? nodes[nodes.length - 1] : null;
  if (!last) {
    notify('error', 'No assistant message available to save.');
    return false;
  }
  return appendAssistantBubbleToNotes(last);
}

function appendTextToNotes(text) {
  if (!text) return false;
  try {
    const html = `<p>${escapeHtml(text)}</p><p><br></p>`;
    const ok = editorApi.appendHTML(html);
    if (ok && activeTabId.value) {
      saveContent(activeTabId.value, editorApi.getHTML());
    }
    if (ok) notify('success', 'Saved to Notes.');
    return ok;
  } catch (err) {
    console.error('appendTextToNotes failed', err);
    notify('error', 'Failed to save to Notes.');
    return false;
  }
}

// ==================== BUBBLE TOOLBAR ====================

function updateBubblePosition() {
  const ed = editor.value;
  if (!ed) {
    showBubble.value = false;
    return;
  }

  const { from, to, empty } = ed.state.selection;
  if (empty) {
    showBubble.value = false;
    return;
  }

  const view = ed.view;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);

  const wrapper = widgetRef.value;
  if (!wrapper) {
    showBubble.value = false;
    return;
  }
  const wrapperRect = wrapper.getBoundingClientRect();

  const centerX = (start.left + end.left) / 2 - wrapperRect.left;
  const topY = start.top - wrapperRect.top - 48;

  bubbleX.value = Math.max(120, Math.min(centerX, wrapperRect.width - 120));
  bubbleY.value = Math.max(10, topY);
  showBubble.value = true;
}

// ==================== LEGACY GLOBALS ====================

function setupLegacyGlobals() {
  const wm = useWindowManager();
  const notesDef = BUILTIN_APPS.find((d) => d.id === 'notes');

  // These globals are used by other parts of the app
  window.appendAssistantBubbleToNotes = appendAssistantBubbleToNotes;
  window.appendLastAssistantMessageToNotesFull = appendLastAssistantMessageToNotesFull;

  // Open/toggle globals route through window manager
  if (notesDef) {
    window.openNotesPane = () => {
      const existing = wm.windowList.value.find((w) => w.appId === 'notes');
      if (!existing) wm.openWindow(notesDef);
    };
    window.toggleNotesPane = () => {
      const existing = wm.windowList.value.find((w) => w.appId === 'notes');
      if (existing) wm.closeApp(existing.instanceId);
      else wm.openWindow(notesDef);
    };
  }
}

// ==================== LIFECYCLE ====================

onMounted(() => {
  loadTabs();
  editorApi.createEditor(loadContent(activeTabId.value));

  setupLegacyGlobals();

  // Listen for skill:save-to-notes events
  saveToNotesHandler = (event) => {
    if (event && event.text) {
      appendTextToNotes(event.text);
    }
  };
  useEventBus().on('skill:save-to-notes', saveToNotesHandler);
});

onBeforeUnmount(() => {
  if (activeTabId.value) {
    saveContent(activeTabId.value, editorApi.getHTML());
  }
  clearTimeout(saveDebounce);

  // Unregister event listeners
  if (saveToNotesHandler) {
    useEventBus().off('skill:save-to-notes', saveToNotesHandler);
    saveToNotesHandler = null;
  }

  // Clean up global functions
  try {
    if (window.appendAssistantBubbleToNotes === appendAssistantBubbleToNotes) {
      delete window.appendAssistantBubbleToNotes;
    }
    if (window.appendLastAssistantMessageToNotesFull === appendLastAssistantMessageToNotesFull) {
      delete window.appendLastAssistantMessageToNotesFull;
    }
  } catch {}
});
</script>

<style scoped>
.notes-content {
  /* Base tokens - light theme defaults */
  --notes-bg: rgb(250 250 252 / 98%);
  --notes-bg-solid: #fafafc;
  --notes-text: rgb(28 25 23);
  --notes-text-muted: rgb(28 25 23 / 55%);
  --notes-text-hint: rgb(28 25 23 / 35%);
  --notes-border: rgb(0 0 0 / 8%);
  --notes-surface-hover: rgb(0 0 0 / 4%);
  --notes-surface-active: rgb(0 0 0 / 8%);
  --notes-surface-muted: rgb(0 0 0 / 3%);
  --notes-toolbar-btn: rgb(28 25 23 / 65%);
  --notes-toolbar-btn-hover: rgb(28 25 23 / 85%);
  --notes-toolbar-btn-active: rgb(28 25 23);

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--notes-text);
  background: var(--notes-bg);
}

/* Tab bar */
.notes-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  overflow-x: auto;
  flex-shrink: 0;
  background: transparent;
  border-bottom: 1px solid var(--notes-border);
}

.notes-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--notes-text-muted);
  cursor: pointer;
  border-radius: 16px;
  background: var(--notes-surface-muted);
  transition:
    background 0.15s,
    color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
  border: none;
}

.notes-tab:hover {
  background: var(--notes-surface-hover);
  color: var(--notes-text);
}

.notes-tab.active {
  background: var(--notes-surface-active);
  color: var(--notes-text);
}

.notes-tab-title {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-tab-edit {
  width: 80px;
  font-size: 13px;
  border: 1px solid var(--notes-border);
  border-radius: 4px;
  padding: 2px 6px;
  background: rgb(255 255 255 / 80%);
  color: var(--notes-text);
}

.notes-tab-close {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--notes-text-hint);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.notes-tab:hover .notes-tab-close,
.notes-tab.active .notes-tab-close {
  opacity: 1;
}

.notes-tab-close:hover {
  background: var(--notes-surface-hover);
  color: var(--notes-text);
}

.notes-tab.add {
  background: transparent;
  color: var(--notes-text-hint);
  font-size: 18px;
  padding: 8px 12px;
  border: none;
}

.notes-tab.add:hover {
  background: var(--notes-surface-muted);
  color: var(--notes-text-muted);
}

/* Persistent Format Toolbar */
.notes-format-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--notes-border);
  background: transparent;
  flex-shrink: 0;
}

.notes-format-toolbar button {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--notes-toolbar-btn);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition:
    background 0.12s,
    color 0.12s;
}

.notes-format-toolbar button:hover {
  background: var(--notes-surface-hover);
  color: var(--notes-toolbar-btn-hover);
}

.notes-format-toolbar button.active {
  background: var(--notes-surface-active);
  color: var(--notes-toolbar-btn-active);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--notes-border);
  margin: 0 6px;
}

/* Bubble toolbar */
.notes-bubble-toolbar {
  display: flex;
  gap: 2px;
  padding: 6px;
  background: rgb(38 38 42 / 95%);
  border-radius: 8px;
  box-shadow:
    0 4px 16px rgb(0 0 0 / 20%),
    0 0 0 1px rgb(255 255 255 / 8%);
}

.notes-bubble-toolbar button {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: rgb(255 255 255 / 90%);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.1s;
}

.notes-bubble-toolbar button:hover {
  background: rgb(255 255 255 / 12%);
}

.notes-bubble-toolbar button.active {
  background: rgb(255 255 255 / 20%);
}

.notes-bubble-divider {
  width: 1px;
  background: rgb(255 255 255 / 15%);
  margin: 4px;
}

/* Editor area */
.notes-editor {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.notes-editor :deep(.ProseMirror) {
  min-height: 100%;
  outline: none;
  color: var(--notes-text);
  font-size: 15px;
  line-height: 1.7;
}

.notes-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--notes-text-hint);
  pointer-events: none;
  float: left;
  height: 0;
}

.notes-editor :deep(h1) {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 12px;
}

.notes-editor :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 10px;
}

.notes-editor :deep(ul),
.notes-editor :deep(ol) {
  padding-left: 24px;
  margin-bottom: 12px;
}

.notes-editor :deep(li) {
  margin-bottom: 4px;
}

/* Task list checkboxes */
.notes-editor :deep(ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0;
}

.notes-editor :deep(ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.notes-editor :deep(ul[data-type='taskList'] ul[data-type='taskList']) {
  padding-left: 12px;
  margin-top: 8px;
}

.notes-editor :deep(ul[data-type='taskList'] li label) {
  display: flex;
  cursor: pointer;
}

.notes-editor :deep(ul[data-type='taskList'] li input[type='checkbox']) {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--notes-text-hint);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  margin-top: 3px;
}

.notes-editor :deep(ul[data-type='taskList'] li input[type='checkbox']:checked) {
  background: var(--notes-text);
  border-color: var(--notes-text);
}

.notes-editor :deep(ul[data-type='taskList'] li input[type='checkbox']:checked::after) {
  content: '\2713';
  display: block;
  color: var(--notes-bg-solid);
  font-size: 11px;
  text-align: center;
  line-height: 14px;
}

/* Code block styling */
.notes-editor :deep(pre) {
  background: var(--notes-surface-muted);
  border: 1px solid var(--notes-border);
  border-radius: 6px;
  padding: 12px 16px;
  overflow-x: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.5;
  margin: 12px 0;
}

.notes-editor :deep(code) {
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 13px;
}

/* Horizontal rule */
.notes-editor :deep(hr) {
  border: none;
  border-top: 1px solid var(--notes-border);
  margin: 16px 0;
}

/* Scrollbar */
.notes-editor::-webkit-scrollbar {
  width: 8px;
}

.notes-editor::-webkit-scrollbar-track {
  background: transparent;
}

.notes-editor::-webkit-scrollbar-thumb {
  background: rgb(0 0 0 / 12%);
  border-radius: 4px;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .notes-format-toolbar button {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
}
</style>

<style>
/* Theme-Specific Overrides for notes content */
body.night-theme .notes-content,
body.vera-baxter-theme .notes-content,
body.custom-theme .notes-content,
body.purple-theme .notes-content {
  --notes-bg: rgb(24 24 28 / 98%);
  --notes-bg-solid: #18181c;
  --notes-text: rgb(240 240 245);
  --notes-text-muted: rgb(240 240 245 / 55%);
  --notes-text-hint: rgb(240 240 245 / 35%);
  --notes-border: rgb(255 255 255 / 10%);
  --notes-surface-hover: rgb(255 255 255 / 6%);
  --notes-surface-active: rgb(255 255 255 / 12%);
  --notes-surface-muted: rgb(255 255 255 / 4%);
  --notes-toolbar-btn: rgb(240 240 245 / 60%);
  --notes-toolbar-btn-hover: rgb(240 240 245 / 80%);
  --notes-toolbar-btn-active: rgb(240 240 245);
}

body.night-theme .notes-content .notes-tab-edit,
body.vera-baxter-theme .notes-content .notes-tab-edit,
body.custom-theme .notes-content .notes-tab-edit,
body.purple-theme .notes-content .notes-tab-edit {
  background: rgb(0 0 0 / 40%);
  color: rgb(240 240 245);
}

body.night-theme .notes-content .notes-editor::-webkit-scrollbar-thumb,
body.vera-baxter-theme .notes-content .notes-editor::-webkit-scrollbar-thumb,
body.custom-theme .notes-content .notes-editor::-webkit-scrollbar-thumb,
body.purple-theme .notes-content .notes-editor::-webkit-scrollbar-thumb {
  background: rgb(255 255 255 / 12%);
}

body.light-theme .notes-content {
  --notes-bg: rgb(215 235 248 / 96%);
  --notes-bg-solid: #d7ebf8;
  --notes-text: rgb(20 40 60);
  --notes-text-muted: rgb(20 40 60 / 60%);
  --notes-text-hint: rgb(20 40 60 / 40%);
  --notes-border: rgb(0 60 120 / 12%);
  --notes-surface-hover: rgb(0 60 120 / 6%);
  --notes-surface-active: rgb(0 60 120 / 10%);
  --notes-surface-muted: rgb(0 60 120 / 4%);
}

body.vitti-theme .notes-content {
  --notes-bg: rgb(245 247 245 / 96%);
  --notes-bg-solid: #f5f7f5;
  --notes-text: rgb(30 32 30);
  --notes-text-muted: rgb(30 32 30 / 55%);
  --notes-text-hint: rgb(30 32 30 / 35%);
}

body.share-bear-theme .notes-content {
  --notes-bg: rgb(235 225 245 / 96%);
  --notes-bg-solid: #ebe1f5;
  --notes-text: rgb(45 30 60);
  --notes-text-muted: rgb(45 30 60 / 55%);
  --notes-text-hint: rgb(45 30 60 / 35%);
  --notes-border: rgb(80 40 120 / 12%);
  --notes-surface-hover: rgb(80 40 120 / 6%);
  --notes-surface-active: rgb(80 40 120 / 10%);
}

body.fragile-theme .notes-content {
  --notes-bg: rgb(225 238 242 / 96%);
  --notes-bg-solid: #e1eef2;
  --notes-text: rgb(35 50 55);
  --notes-text-muted: rgb(35 50 55 / 55%);
  --notes-text-hint: rgb(35 50 55 / 35%);
  --notes-border: rgb(60 100 120 / 12%);
  --notes-surface-hover: rgb(60 100 120 / 6%);
  --notes-surface-active: rgb(60 100 120 / 10%);
}

body.eva-theme .notes-content {
  --notes-bg: rgb(240 232 225 / 96%);
  --notes-bg-solid: #f0e8e1;
  --notes-text: rgb(60 45 35);
  --notes-text-muted: rgb(60 45 35 / 55%);
  --notes-text-hint: rgb(60 45 35 / 35%);
  --notes-border: rgb(140 100 60 / 12%);
  --notes-surface-hover: rgb(140 100 60 / 6%);
  --notes-surface-active: rgb(140 100 60 / 10%);
}

body.high-contrast-theme .notes-content {
  --notes-bg: rgb(255 255 255 / 100%);
  --notes-bg-solid: #ffffff;
  --notes-text: rgb(0 0 0);
  --notes-text-muted: rgb(0 0 0 / 70%);
  --notes-text-hint: rgb(0 0 0 / 50%);
  --notes-border: rgb(0 0 0 / 20%);
  --notes-surface-hover: rgb(0 0 0 / 8%);
  --notes-surface-active: rgb(0 0 0 / 15%);
}
</style>
