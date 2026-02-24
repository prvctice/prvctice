<template>
  <div
    ref="widgetRef"
    class="pdf-content"
    tabindex="0"
    @keydown="handleWidgetKeydown"
    data-no-orbit
  >
    <!-- Action bar (library, send-to-chat) -->
    <div class="pdf-action-bar">
      <button
        @click="toggleLibrary"
        title="File library"
        aria-label="Open file library"
        class="pdf-action-btn library-btn"
        :class="{ active: libraryOpen }"
      >
        <iconify-icon icon="ph:folder-open" aria-hidden="true"></iconify-icon>
        <span v-if="libraryFileCount > 0" class="library-badge">{{ libraryFileCount }}</span>
      </button>
      <button
        @click="sendToChat"
        title="Send to chat"
        aria-label="Send PDF content to chat"
        class="pdf-action-btn"
      >
        <iconify-icon icon="ph:paper-plane-right" aria-hidden="true"></iconify-icon>
      </button>
    </div>

    <!-- File Library Panel -->
    <LibraryPanel
      :is-open="libraryOpen"
      :render-thumbnail="renderLibraryThumbnail"
      @close="libraryOpen = false"
      @select="handleLibraryFileSelect"
    />

    <!-- PDF content area with sidebar -->
    <div class="pdf-pane-wrapper">
      <!-- Thumbnail Sidebar -->
      <aside v-show="pdfLoaded && sidebarOpen" class="pdf-sidebar" aria-label="Page thumbnails">
        <div class="pdf-sidebar-header">
          <span class="pdf-sidebar-title">Pages</span>
        </div>
        <div class="pdf-thumbnail-list" ref="thumbnailListRef">
          <button
            v-for="thumb in thumbnails"
            :key="thumb.pageNumber"
            :ref="(el) => observeThumbnailElement(el as HTMLElement, thumb.pageNumber)"
            class="pdf-thumbnail-item"
            :class="{ active: thumb.pageNumber === currentPage }"
            @click="goToPageDirect(thumb.pageNumber)"
            :aria-label="`Go to page ${thumb.pageNumber}`"
            :aria-current="thumb.pageNumber === currentPage ? 'page' : undefined"
          >
            <div class="pdf-thumbnail-canvas-wrapper">
              <img
                v-if="thumb.dataUrl"
                :src="thumb.dataUrl"
                :alt="`Page ${thumb.pageNumber} thumbnail`"
                class="pdf-thumbnail-image"
              />
              <div v-else-if="thumb.isLoading" class="pdf-thumbnail-loading">
                <iconify-icon icon="ph:spinner" class="spin"></iconify-icon>
              </div>
              <div v-else class="pdf-thumbnail-placeholder">
                <iconify-icon icon="ph:file-pdf"></iconify-icon>
              </div>
            </div>
            <span class="pdf-thumbnail-number">{{ thumb.pageNumber }}</span>
          </button>
        </div>
      </aside>

      <!-- Main content area -->
      <div class="pdf-main-content">
        <!-- PDF Toolbar -->
        <div class="pdf-toolbar">
          <button
            v-if="pdfLoaded"
            @click="toggleSidebar"
            :title="sidebarOpen ? 'Hide pages' : 'Show pages'"
            class="pdf-toolbar-btn"
            :class="{ active: sidebarOpen }"
          >
            <iconify-icon icon="ph:sidebar-simple"></iconify-icon>
          </button>
          <span v-if="pdfLoaded" class="toolbar-divider"></span>

          <button
            @click="prevPage"
            :disabled="currentPage <= 1 || !pdfLoaded"
            title="Previous page"
          >
            <iconify-icon icon="ph:caret-left"></iconify-icon>
          </button>
          <div class="pdf-page-indicator">
            <input
              ref="pageInputRef"
              type="text"
              inputmode="numeric"
              :value="pageInputValue"
              :disabled="!pdfLoaded"
              @input="onPageInputChange"
              @keydown.enter="submitPageInput"
              @blur="resetPageInput"
              @focus="selectPageInput"
              class="pdf-page-input"
              :class="{ error: pageInputError }"
              aria-label="Current page"
            />
            <span class="pdf-page-separator">/</span>
            <span class="pdf-page-total">{{ totalPages || '-' }}</span>
          </div>
          <button
            @click="nextPage"
            :disabled="currentPage >= totalPages || !pdfLoaded"
            title="Next page"
          >
            <iconify-icon icon="ph:caret-right"></iconify-icon>
          </button>
          <span class="toolbar-divider"></span>
          <button @click="zoomOut" :disabled="!pdfLoaded" title="Zoom out">
            <iconify-icon icon="ph:minus"></iconify-icon>
          </button>
          <span class="pdf-zoom-indicator">{{ Math.round(scale * 100) }}%</span>
          <button @click="zoomIn" :disabled="!pdfLoaded" title="Zoom in">
            <iconify-icon icon="ph:plus"></iconify-icon>
          </button>
          <button
            @click="resetZoom"
            :disabled="!pdfLoaded"
            title="Fit to width"
            class="pdf-fit-width-btn"
          >
            <iconify-icon icon="ph:arrows-horizontal"></iconify-icon>
          </button>
          <span v-if="pdfLoaded && highlights.length > 0" class="toolbar-divider"></span>
          <button
            v-if="pdfLoaded && highlights.length > 0"
            @click="toggleNotesPanel"
            :title="notesPanelOpen ? 'Hide notes panel' : 'Show notes panel'"
            class="pdf-toolbar-notes-btn"
            :class="{ active: notesPanelOpen }"
          >
            <iconify-icon icon="ph:note-pencil"></iconify-icon>
            <span class="notes-count">{{ highlights.length }}</span>
          </button>
        </div>

        <!-- PDF Canvas Container -->
        <div class="pdf-canvas-container" ref="canvasContainerRef" @click="handleCanvasClick">
          <div v-if="!pdfLoaded" class="pdf-placeholder">
            <iconify-icon icon="ph:file-pdf" class="pdf-placeholder-icon"></iconify-icon>
            <p class="pdf-placeholder-text">Drag a PDF here or use the upload button</p>
            <button @click="openFilePicker" class="pdf-upload-btn">
              <iconify-icon icon="ph:upload-simple"></iconify-icon>
              <span>Select PDF</span>
            </button>
          </div>
          <Transition name="pdf-page-fade" mode="out-in">
            <div
              v-show="pdfLoaded"
              :key="pageTransitionKey"
              class="pdf-page-wrapper"
              :class="{ loading: isPageLoading }"
              ref="pageWrapperRef"
            >
              <canvas ref="pdfCanvasRef" class="pdf-canvas"></canvas>
              <div
                ref="textLayerRef"
                class="pdf-text-layer"
                @mouseup="handleTextSelection"
                @click.stop
              ></div>
              <div ref="highlightLayerRef" class="pdf-highlight-layer"></div>
              <div v-if="showLoadingSpinner" class="pdf-loading-overlay">
                <iconify-icon icon="ph:spinner" class="spin pdf-loading-spinner"></iconify-icon>
              </div>
            </div>
          </Transition>
          <!-- Highlight color picker -->
          <div
            v-if="showColorPicker"
            class="highlight-color-picker"
            :style="colorPickerPosition"
            @mousedown.stop
          >
            <button
              v-for="color in highlightColorOptions"
              :key="color"
              class="color-btn"
              :class="color"
              :title="`Highlight ${color}`"
              @click="createHighlightWithColor(color)"
            ></button>
          </div>
          <!-- Send selection button -->
          <div
            v-if="showSendButton && currentSelection"
            class="pdf-send-selection-btn"
            :style="sendButtonPosition"
            @mousedown.stop
          >
            <button
              @click="handleSendSelectionToChat"
              class="send-btn"
              title="Send selection to chat"
            >
              <iconify-icon icon="ph:paper-plane-right"></iconify-icon>
              <span>Send</span>
            </button>
          </div>
          <!-- Context menu -->
          <div
            v-if="showContextMenu && contextMenuHighlight"
            class="pdf-context-menu"
            :style="contextMenuPosition"
            @mousedown.stop
            @click.stop
          >
            <template v-if="!showAnnotationInput">
              <button class="context-menu-item" @click="contextMenuSendToChat">
                <iconify-icon icon="ph:paper-plane-right"></iconify-icon>
                <span>Send to Chat</span>
              </button>
              <button class="context-menu-item" @click="contextMenuCopyText">
                <iconify-icon icon="ph:copy"></iconify-icon>
                <span>Copy Text</span>
              </button>
              <button class="context-menu-item" @click="contextMenuShowAddNote">
                <iconify-icon icon="ph:note-pencil"></iconify-icon>
                <span>{{ contextMenuHighlight.annotation ? 'Edit Note' : 'Add Note' }}</span>
              </button>
              <div class="context-menu-divider"></div>
              <button class="context-menu-item danger" @click="contextMenuRemoveHighlight">
                <iconify-icon icon="ph:trash"></iconify-icon>
                <span>Remove</span>
              </button>
            </template>
            <template v-else>
              <div class="context-menu-note-input">
                <textarea
                  v-model="annotationText"
                  placeholder="Add a note..."
                  rows="3"
                  @keydown.enter.ctrl="saveAnnotationNote"
                  @keydown.escape="closeContextMenu"
                ></textarea>
                <div class="context-menu-note-actions">
                  <button class="note-cancel-btn" @click="closeContextMenu">Cancel</button>
                  <button class="note-save-btn" @click="saveAnnotationNote">Save</button>
                </div>
              </div>
            </template>
          </div>
          <!-- Note popup -->
          <div
            v-if="showNotePopup && activeNoteHighlightId"
            class="pdf-note-popup"
            :style="notePopupPosition"
            @mousedown.stop
            @click.stop
          >
            <div class="note-popup-header">
              <span class="note-popup-title">Note</span>
              <button class="note-popup-close" @click="closeNotePopup" title="Close">
                <iconify-icon icon="ph:x"></iconify-icon>
              </button>
            </div>
            <textarea
              ref="noteTextareaRef"
              v-model="noteContent"
              @input="handleNoteInput"
              @keydown.escape="closeNotePopup"
              placeholder="Add a note..."
              class="note-popup-textarea"
              rows="4"
            ></textarea>
            <div class="note-popup-footer">
              <span class="note-popup-hint">Auto-saves as you type</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Notes Panel (right sidebar) -->
      <aside
        v-show="pdfLoaded && notesPanelOpen && highlights.length > 0"
        class="pdf-notes-panel"
        aria-label="Highlights and notes"
      >
        <div class="notes-panel-header">
          <span class="notes-panel-title">Highlights</span>
          <div class="notes-panel-actions">
            <button @click="handleExportJson" title="Export as JSON" class="notes-panel-btn">
              <iconify-icon icon="ph:download-simple"></iconify-icon>
            </button>
            <button @click="handleExportText" title="Export as text" class="notes-panel-btn">
              <iconify-icon icon="ph:file-text"></iconify-icon>
            </button>
            <button @click="toggleNotesPanel" title="Close panel" class="notes-panel-btn">
              <iconify-icon icon="ph:x"></iconify-icon>
            </button>
          </div>
        </div>
        <div class="notes-panel-filter">
          <button :class="{ active: notesFilterPage === null }" @click="setNotesPageFilter(null)">
            All pages
          </button>
          <button
            :class="{ active: notesFilterPage === currentPage }"
            @click="setNotesPageFilter(currentPage)"
          >
            This page
          </button>
        </div>
        <div class="notes-panel-list">
          <div
            v-for="highlight in filteredHighlightsForPanel"
            :key="highlight.id"
            class="notes-panel-item"
            :class="{ 'has-note': highlight.annotation }"
            @click="navigateToHighlight(highlight)"
          >
            <div class="notes-item-header">
              <span
                class="notes-item-color"
                :style="{ backgroundColor: HIGHLIGHT_COLORS[highlight.color] }"
              ></span>
              <span class="notes-item-page">Page {{ highlight.position.pageNumber }}</span>
            </div>
            <div class="notes-item-text">{{ highlight.text }}</div>
            <div v-if="highlight.annotation" class="notes-item-note">
              <iconify-icon icon="ph:note" class="notes-item-note-icon"></iconify-icon>
              <span>{{ highlight.annotation }}</span>
            </div>
          </div>
          <div v-if="filteredHighlightsForPanel.length === 0" class="notes-panel-empty">
            <iconify-icon icon="ph:note-blank"></iconify-icon>
            <span>No highlights{{ notesFilterPage !== null ? ' on this page' : '' }}</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PdfContent.vue -- Content-only PDF viewer for AppWindow.
 *
 * This is extracted from FloatingPdfWidget.vue with all floating/drag/resize
 * infrastructure removed. The parent AppWindow handles positioning, title bar,
 * and close behavior.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useNotifs } from '@web/composables/useNotifs.js';
import { useEventBus } from '@web/services/eventBus';
import { usePdfRenderer } from '@web/composables/usePdfRenderer';
import { usePdfHighlights } from '@web/composables/usePdfHighlights';
import { usePdfNavigation } from '@web/composables/usePdfNavigation';
import { usePdfChatIntegration, type PdfSelection } from '@web/composables/usePdfChatIntegration';
import type { HighlightColor, PdfRect, PdfHighlight } from '@web/types/pdf';
import { HIGHLIGHT_COLORS } from '@web/types/pdf';
import { useFileLibrary } from '@web/composables/useFileLibrary.js';
import LibraryPanel from './LibraryPanel.vue';
import type { LibraryFile } from '@web/types/library';
import { useWindowManager } from '@web/composables/useWindowManager';
import { BUILTIN_APPS } from '@web/services/apps/builtinApps';

// ==================== REFS ====================

const widgetRef = ref<HTMLElement | null>(null);
const canvasContainerRef = ref<HTMLElement | null>(null);
const pdfCanvasRef = ref<HTMLCanvasElement | null>(null);
const textLayerRef = ref<HTMLDivElement | null>(null);
const highlightLayerRef = ref<HTMLDivElement | null>(null);
const pageWrapperRef = ref<HTMLDivElement | null>(null);
const thumbnailListRef = ref<HTMLElement | null>(null);
const thumbnailObserverMap = new Map<HTMLElement, number>();

// Page input state
const pageInputRef = ref<HTMLInputElement | null>(null);
const pageInputValue = ref('1');
const pageInputError = ref(false);
let pageInputErrorTimeout: ReturnType<typeof setTimeout> | null = null;

// Page loading
const isPageLoading = ref(false);
const showLoadingSpinner = ref(false);
let loadingSpinnerTimeout: ReturnType<typeof setTimeout> | null = null;
const pageTransitionKey = ref(1);

// ==================== PDF RENDERER ====================

const notifApi = useNotifs();
const pushNotif = notifApi?.push || (() => {});
function notify(kind: string, text: string) {
  try {
    pushNotif(kind, text);
  } catch {}
}

const pdfLoaded = ref(false);

const {
  document: pdfDocument,
  currentPage,
  totalPages,
  scale,
  loadDocument,
  renderPage,
  goToPage: rendererGoToPage,
  zoomIn: rendererZoomIn,
  zoomOut: rendererZoomOut,
  getPageText,
  renderThumbnail: rendererRenderThumbnail,
  destroy: destroyRenderer,
} = usePdfRenderer({
  containerRef: canvasContainerRef,
  onDocumentLoad: (doc) => {
    pdfLoaded.value = true;
    highlightsApi.setDocumentId(doc.id);
    nextTick(() => renderCurrentPage());
  },
  onPageChange: () => {
    nextTick(() => renderCurrentPage());
  },
  onError: (err) => {
    notify('error', `PDF Error: ${err}`);
  },
});

// ==================== HIGHLIGHTS ====================

const highlightsApi = usePdfHighlights({
  onHighlightsChange: () => renderHighlightOverlays(),
});

const {
  highlights,
  addHighlight,
  removeHighlight,
  getHighlightsForPage,
  updateHighlight,
  updateHighlightNote,
  deleteHighlightNote,
  exportAnnotations,
} = highlightsApi;

// Note popup state
const showNotePopup = ref(false);
const notePopupPosition = ref({ top: '0px', left: '0px' });
const activeNoteHighlightId = ref<string | null>(null);
const noteTextareaRef = ref<HTMLTextAreaElement | null>(null);
const noteContent = ref('');
let noteSaveDebounce: ReturnType<typeof setTimeout> | null = null;

const notesPanelOpen = ref(false);
const notesFilterPage = ref<number | null>(null);

const filteredHighlightsForPanel = computed(() => {
  const all = highlights.value;
  if (notesFilterPage.value === null) {
    return all.sort((a, b) => a.position.pageNumber - b.position.pageNumber);
  }
  return all.filter((h) => h.position.pageNumber === notesFilterPage.value);
});

// ==================== CHAT INTEGRATION ====================

const currentSelection = ref<PdfSelection | null>(null);
const showSendButton = ref(false);
const sendButtonPosition = ref({ top: '0px', left: '0px' });
const sentHighlightId = ref<string | null>(null);
const sentHighlightTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

const showContextMenu = ref(false);
const contextMenuPosition = ref({ top: '0px', left: '0px' });
const contextMenuHighlight = ref<PdfHighlight | null>(null);
const showAnnotationInput = ref(false);
const annotationText = ref('');

const chatIntegration = usePdfChatIntegration({
  document: pdfDocument,
  highlights,
  currentPage,
  onClearSelection: () => clearTextSelection(),
});

const {
  sendSelectionToChat,
  sendHighlightsToChat,
  sendDocumentSummary,
  sendHighlightToChat,
  copyTextToClipboard,
} = chatIntegration;

// Color picker
const showColorPicker = ref(false);
const colorPickerPosition = ref({ top: '0px', left: '0px' });
const pendingSelection = ref<{ text: string; rects: PdfRect[] } | null>(null);
const highlightColorOptions: HighlightColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'orange',
  'purple',
];

// ==================== NAVIGATION ====================

const {
  thumbnails,
  sidebarOpen,
  toggleSidebar,
  observeThumbnail,
  unobserveThumbnail,
  cleanupObserver,
} = usePdfNavigation({
  currentPage,
  totalPages,
  renderThumbnail: (pageNumber, options) => rendererRenderThumbnail(pageNumber, options),
  thumbnailSize: { maxWidth: 100, maxHeight: 140 },
  preloadRadius: 2,
  onNavigate: (page) => goToPageDirect(page),
});

// Event handlers for cleanup
let pdfDropHandler: ((event: { file: File }) => void) | null = null;

// ==================== FILE LIBRARY ====================

const {
  fileCount: libraryFileCount,
  initialize: initializeLibrary,
  addFile: addToLibrary,
  getFile: getFromLibrary,
  cleanup: cleanupLibrary,
} = useFileLibrary();

const libraryOpen = ref(false);

function toggleLibrary(): void {
  libraryOpen.value = !libraryOpen.value;
}

async function handleLibraryFileSelect(file: LibraryFile): Promise<void> {
  const fileObj = await getFromLibrary(file.id);
  if (fileObj) await loadPdf(fileObj);
  libraryOpen.value = false;
}

async function renderLibraryThumbnail(fileId: string): Promise<Blob | null> {
  const file = await getFromLibrary(fileId);
  if (!file || file.type !== 'application/pdf') return null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      pdf.destroy();
      return null;
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    pdf.destroy();
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.8);
    });
  } catch {
    return null;
  }
}

// Sidebar state persistence
const SIDEBAR_KEY = 'prvctice_pdf_sidebar';

function loadSidebarState() {
  try {
    const state = localStorage.getItem(SIDEBAR_KEY);
    if (state !== null) sidebarOpen.value = state === 'true';
  } catch {}
}

function saveSidebarState() {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen.value));
  } catch {}
}

watch(sidebarOpen, saveSidebarState);

// ResizeObserver for re-render on container size change
let resizeObserver: ResizeObserver | null = null;
let resizeDebounce: ReturnType<typeof setTimeout> | null = null;

function setupResizeObserver() {
  if (resizeObserver) return;
  resizeObserver = new ResizeObserver(() => {
    if (!pdfLoaded.value) return;
    if (resizeDebounce) clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => renderCurrentPage(), 100);
  });
  if (canvasContainerRef.value) resizeObserver.observe(canvasContainerRef.value);
}

function cleanupResizeObserver() {
  if (resizeDebounce) {
    clearTimeout(resizeDebounce);
    resizeDebounce = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
}

watch(canvasContainerRef, (container) => {
  if (container && !resizeObserver) setupResizeObserver();
});

// ==================== PDF RENDERING ====================

async function renderCurrentPage(): Promise<void> {
  if (!pdfCanvasRef.value || !pdfDocument.value) return;
  try {
    await renderPage({
      canvas: pdfCanvasRef.value,
      textLayerContainer: textLayerRef.value ?? undefined,
    });
    renderHighlightOverlays();
  } catch (err) {
    console.error('[PdfContent] Render error:', err);
  }
}

function renderHighlightOverlays(): void {
  if (!highlightLayerRef.value || !pdfCanvasRef.value) return;
  highlightLayerRef.value.innerHTML = '';
  const pageHighlights = getHighlightsForPage(currentPage.value);
  if (pageHighlights.length === 0) return;

  const canvas = pdfCanvasRef.value;
  const canvasWidth = parseFloat(canvas.style.width || '0');
  const canvasHeight = parseFloat(canvas.style.height || '0');
  if (canvasWidth === 0 || canvasHeight === 0) return;

  highlightLayerRef.value.style.width = `${canvasWidth}px`;
  highlightLayerRef.value.style.height = `${canvasHeight}px`;

  for (const highlight of pageHighlights) {
    const hasNote = highlight.annotation && highlight.annotation.trim().length > 0;
    let firstRect: PdfRect | null = null;

    for (const rect of highlight.position.rects) {
      if (!firstRect) firstRect = rect;
      const overlay = document.createElement('div');
      overlay.className = 'highlight-overlay';
      if (hasNote) overlay.classList.add('has-note');
      overlay.style.position = 'absolute';
      overlay.style.left = `${rect.x}px`;
      overlay.style.top = `${rect.y}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.backgroundColor = HIGHLIGHT_COLORS[highlight.color];
      overlay.style.pointerEvents = 'auto';
      overlay.style.cursor = 'pointer';
      overlay.dataset.highlightId = highlight.id;
      if (hasNote && highlight.annotation) {
        overlay.title =
          highlight.annotation.slice(0, 100) + (highlight.annotation.length > 100 ? '...' : '');
      }
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        openNotePopup(highlight, e);
      });
      overlay.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showHighlightContextMenu(highlight, e);
      });
      highlightLayerRef.value?.appendChild(overlay);
    }

    if (hasNote && firstRect && highlightLayerRef.value) {
      const noteIcon = document.createElement('div');
      noteIcon.className = 'highlight-note-indicator';
      noteIcon.style.position = 'absolute';
      noteIcon.style.left = `${firstRect.x + firstRect.width - 8}px`;
      noteIcon.style.top = `${firstRect.y - 8}px`;
      noteIcon.innerHTML = '<iconify-icon icon="ph:note-fill"></iconify-icon>';
      noteIcon.title = 'This highlight has a note';
      noteIcon.dataset.highlightId = highlight.id;
      noteIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        const hl = highlights.value.find((h) => h.id === highlight.id);
        if (hl) openNotePopup(hl, e);
      });
      highlightLayerRef.value.appendChild(noteIcon);
    }
  }
}

// ==================== NOTE POPUP ====================

function openNotePopup(highlight: PdfHighlight, event: MouseEvent | Event): void {
  closeNotePopup();
  closeContextMenu();
  closeColorPicker();

  activeNoteHighlightId.value = highlight.id;
  noteContent.value = highlight.annotation || '';

  const wrapperRect = pageWrapperRef.value?.getBoundingClientRect();
  if (wrapperRect && 'clientX' in event && 'clientY' in event) {
    const mouseEvent = event as MouseEvent;
    notePopupPosition.value = {
      top: `${mouseEvent.clientY - wrapperRect.top + 10}px`,
      left: `${mouseEvent.clientX - wrapperRect.left}px`,
    };
  } else if (highlight.position.rects[0]) {
    const rect = highlight.position.rects[0];
    notePopupPosition.value = { top: `${rect.y + rect.height + 10}px`, left: `${rect.x}px` };
  }

  showNotePopup.value = true;
  nextTick(() => noteTextareaRef.value?.focus());
}

function closeNotePopup(): void {
  if (activeNoteHighlightId.value && noteContent.value.trim()) saveNoteContent();
  showNotePopup.value = false;
  activeNoteHighlightId.value = null;
  noteContent.value = '';
  if (noteSaveDebounce) {
    clearTimeout(noteSaveDebounce);
    noteSaveDebounce = null;
  }
}

function handleNoteInput(): void {
  if (noteSaveDebounce) clearTimeout(noteSaveDebounce);
  noteSaveDebounce = setTimeout(() => {
    if (activeNoteHighlightId.value) saveNoteContent();
  }, 500);
}

function saveNoteContent(): void {
  if (!activeNoteHighlightId.value) return;
  updateHighlightNote(activeNoteHighlightId.value, noteContent.value.trim());
}

// ==================== NOTES PANEL ====================

function toggleNotesPanel(): void {
  notesPanelOpen.value = !notesPanelOpen.value;
}

function navigateToHighlight(highlight: PdfHighlight): void {
  if (highlight.position.pageNumber !== currentPage.value)
    goToPageDirect(highlight.position.pageNumber);
  nextTick(() => {
    const overlays = highlightLayerRef.value?.querySelectorAll(
      `[data-highlight-id="${highlight.id}"]`
    );
    if (overlays && overlays.length > 0) {
      (overlays[0] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashHighlight(highlight.id);
    }
  });
}

function setNotesPageFilter(page: number | null): void {
  notesFilterPage.value = page;
}

// ==================== EXPORT ====================

function handleExportJson(): void {
  if (highlights.value.length === 0) {
    notify('info', 'No highlights to export');
    return;
  }
  const content = exportAnnotations('json');
  downloadFile(content, 'pdf-annotations.json', 'application/json');
  notify('success', 'Annotations exported as JSON');
}

function handleExportText(): void {
  if (highlights.value.length === 0) {
    notify('info', 'No highlights to export');
    return;
  }
  const content = exportAnnotations('text');
  downloadFile(content, 'pdf-annotations.txt', 'text/plain');
  notify('success', 'Annotations exported as text');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== SELECTION & HIGHLIGHTING ====================

function closeColorPicker(): void {
  if (showColorPicker.value) {
    showColorPicker.value = false;
    pendingSelection.value = null;
    window.getSelection()?.removeAllRanges();
  }
}

function clearTextSelection(): void {
  window.getSelection()?.removeAllRanges();
  showColorPicker.value = false;
  pendingSelection.value = null;
  currentSelection.value = null;
  showSendButton.value = false;
}

function handleTextSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    showColorPicker.value = false;
    pendingSelection.value = null;
    currentSelection.value = null;
    showSendButton.value = false;
    return;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) return;

  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return;

  const wrapperRect = pageWrapperRef.value?.getBoundingClientRect();
  if (!wrapperRect) return;

  const pdfRects: PdfRect[] = rects.map((r) => ({
    x: r.left - wrapperRect.left,
    y: r.top - wrapperRect.top,
    width: r.width,
    height: r.height,
  }));

  pendingSelection.value = { text: selectedText, rects: pdfRects };
  currentSelection.value = { text: selectedText, pageNumber: currentPage.value };

  const lastRect = rects[rects.length - 1];
  if (!lastRect) return;

  colorPickerPosition.value = {
    top: `${lastRect.bottom - wrapperRect.top + 8}px`,
    left: `${lastRect.left - wrapperRect.left}px`,
  };
  showColorPicker.value = true;

  sendButtonPosition.value = {
    top: `${lastRect.bottom - wrapperRect.top + 8}px`,
    left: `${lastRect.left - wrapperRect.left + 180}px`,
  };
  showSendButton.value = true;
}

function createHighlightWithColor(color: HighlightColor): void {
  if (!pendingSelection.value) return;
  const highlight = addHighlight({
    text: pendingSelection.value.text,
    pageNumber: currentPage.value,
    rects: pendingSelection.value.rects,
    color,
  });
  useEventBus().emit('pdf:highlight-created', {
    highlightId: highlight.id,
    text: highlight.text,
    pageNumber: highlight.position.pageNumber,
  });
  window.getSelection()?.removeAllRanges();
  showColorPicker.value = false;
  pendingSelection.value = null;
  currentSelection.value = null;
  showSendButton.value = false;
}

function handleCanvasClick(): void {
  closeColorPicker();
  closeContextMenu();
  closeNotePopup();
}

function handleSendSelectionToChat(): void {
  if (!currentSelection.value) return;
  sendSelectionToChat(currentSelection.value);
  clearTextSelection();
}

function flashHighlight(highlightId: string): void {
  sentHighlightId.value = highlightId;
  if (sentHighlightTimeout.value) clearTimeout(sentHighlightTimeout.value);
  sentHighlightTimeout.value = setTimeout(() => {
    sentHighlightId.value = null;
    sentHighlightTimeout.value = null;
  }, 600);
}

// ==================== CONTEXT MENU ====================

function showHighlightContextMenu(highlight: PdfHighlight, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const wrapperRect = pageWrapperRef.value?.getBoundingClientRect();
  if (!wrapperRect) return;
  contextMenuHighlight.value = highlight;
  contextMenuPosition.value = {
    top: `${event.clientY - wrapperRect.top}px`,
    left: `${event.clientX - wrapperRect.left}px`,
  };
  showContextMenu.value = true;
  showAnnotationInput.value = false;
  annotationText.value = highlight.annotation || '';
}

function closeContextMenu(): void {
  showContextMenu.value = false;
  contextMenuHighlight.value = null;
  showAnnotationInput.value = false;
  annotationText.value = '';
}

function contextMenuSendToChat(): void {
  if (!contextMenuHighlight.value) return;
  sendHighlightToChat(contextMenuHighlight.value);
  flashHighlight(contextMenuHighlight.value.id);
  closeContextMenu();
}

function contextMenuCopyText(): void {
  if (!contextMenuHighlight.value) return;
  copyTextToClipboard(contextMenuHighlight.value.text);
  closeContextMenu();
}

function contextMenuRemoveHighlight(): void {
  if (!contextMenuHighlight.value) return;
  removeHighlight(contextMenuHighlight.value.id);
  useEventBus().emit('pdf:highlight-removed', { highlightId: contextMenuHighlight.value.id });
  closeContextMenu();
}

function contextMenuShowAddNote(): void {
  showAnnotationInput.value = true;
  annotationText.value = contextMenuHighlight.value?.annotation || '';
}

function saveAnnotationNote(): void {
  if (!contextMenuHighlight.value) return;
  updateHighlight(contextMenuHighlight.value.id, {
    annotation: annotationText.value.trim() || undefined,
  });
  closeContextMenu();
  notify('success', annotationText.value.trim() ? 'Note saved' : 'Note removed');
}

// ==================== NAVIGATION ====================

function prevPage() {
  if (currentPage.value > 1) goToPageDirect(currentPage.value - 1);
}
function nextPage() {
  if (currentPage.value < totalPages.value) goToPageDirect(currentPage.value + 1);
}

function goToPageDirect(page: number) {
  const validPage = Math.max(1, Math.min(page, totalPages.value));
  if (validPage !== currentPage.value) {
    isPageLoading.value = true;
    pageTransitionKey.value++;
    if (loadingSpinnerTimeout) clearTimeout(loadingSpinnerTimeout);
    loadingSpinnerTimeout = setTimeout(() => {
      if (isPageLoading.value) showLoadingSpinner.value = true;
    }, 200);
    rendererGoToPage(validPage);
    pageInputValue.value = String(validPage);
    scrollThumbnailIntoView(validPage);
    nextTick(() => {
      isPageLoading.value = false;
      showLoadingSpinner.value = false;
      if (loadingSpinnerTimeout) {
        clearTimeout(loadingSpinnerTimeout);
        loadingSpinnerTimeout = null;
      }
    });
  }
}

function scrollThumbnailIntoView(page: number) {
  if (!thumbnailListRef.value || !sidebarOpen.value) return;
  const thumbnailEl = thumbnailListRef.value.querySelector(
    `.pdf-thumbnail-item:nth-child(${page})`
  ) as HTMLElement | null;
  if (thumbnailEl) thumbnailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==================== PAGE INPUT ====================

function onPageInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  pageInputValue.value = target.value;
  pageInputError.value = false;
}

function submitPageInput() {
  const page = parseInt(pageInputValue.value, 10);
  if (isNaN(page) || page < 1 || page > totalPages.value) {
    pageInputError.value = true;
    if (pageInputErrorTimeout) clearTimeout(pageInputErrorTimeout);
    pageInputErrorTimeout = setTimeout(() => {
      pageInputError.value = false;
      pageInputValue.value = String(currentPage.value);
    }, 1500);
    return;
  }
  goToPageDirect(page);
  pageInputRef.value?.blur();
}

function resetPageInput() {
  pageInputValue.value = String(currentPage.value);
  pageInputError.value = false;
}
function selectPageInput() {
  pageInputRef.value?.select();
}
function focusPageInput() {
  pageInputRef.value?.focus();
  pageInputRef.value?.select();
}

function observeThumbnailElement(el: HTMLElement | null, pageNumber: number) {
  if (!el) return;
  thumbnailObserverMap.set(el, pageNumber);
  observeThumbnail(el, pageNumber);
}

// ==================== ZOOM ====================

function zoomIn() {
  rendererZoomIn();
  nextTick(() => renderCurrentPage());
}
function zoomOut() {
  rendererZoomOut();
  nextTick(() => renderCurrentPage());
}
function resetZoom() {
  nextTick(() => renderCurrentPage());
}

function openFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,application/pdf';
  input.onchange = (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) loadPdf(file);
  };
  input.click();
}

async function loadPdf(file: File) {
  if (!file || file.type !== 'application/pdf') {
    notify('error', 'Please select a valid PDF file');
    return;
  }
  addToLibrary(file).catch(() => {});
  await loadDocument(file);
}

function sendToChat() {
  if (!pdfLoaded.value) {
    notify('error', 'No PDF loaded to send');
    return;
  }
  if (currentSelection.value) {
    handleSendSelectionToChat();
    return;
  }
  if (highlights.value.length > 0) {
    sendHighlightsToChat();
    return;
  }
  // Document summary
  if (pdfDocument.value) {
    getPageText(1)
      .then((text) => sendDocumentSummary(text))
      .catch(() => sendDocumentSummary(''));
  }
}

// ==================== KEYBOARD ====================

function handleWidgetKeydown(e: KeyboardEvent) {
  if (!pdfLoaded.value) return;
  if (e.target === pageInputRef.value) return;
  const isCtrlOrMeta = e.ctrlKey || e.metaKey;

  switch (e.key) {
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault();
      prevPage();
      break;
    case 'ArrowDown':
    case 'PageDown':
      e.preventDefault();
      nextPage();
      break;
    case 'Home':
      e.preventDefault();
      goToPageDirect(1);
      break;
    case 'End':
      e.preventDefault();
      goToPageDirect(totalPages.value);
      break;
    case '+':
    case '=':
      if (!isCtrlOrMeta || e.key === '+') {
        e.preventDefault();
        zoomIn();
      }
      break;
    case '-':
    case '_':
      if (!isCtrlOrMeta || e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
      break;
    case '0':
      if (isCtrlOrMeta) {
        e.preventDefault();
        resetZoom();
      }
      break;
    case 'g':
    case 'G':
      if (isCtrlOrMeta) {
        e.preventDefault();
        focusPageInput();
      }
      break;
    case 's':
    case 'S':
      if (isCtrlOrMeta) {
        e.preventDefault();
        toggleSidebar();
      }
      break;
  }
}

// ==================== LEGACY GLOBALS ====================

function setupLegacyGlobals() {
  const wm = useWindowManager();
  const pdfDef = BUILTIN_APPS.find((d) => d.id === 'pdf-viewer');

  if (pdfDef) {
    (window as Window & { openPdfWidget?: () => void }).openPdfWidget = () => {
      const existing = wm.windowList.value.find((w) => w.appId === 'pdf-viewer');
      if (!existing) wm.openWindow(pdfDef);
    };
    (window as Window & { togglePdfWidget?: () => void }).togglePdfWidget = () => {
      const existing = wm.windowList.value.find((w) => w.appId === 'pdf-viewer');
      if (existing) wm.closeApp(existing.instanceId);
      else wm.openWindow(pdfDef);
    };
    (window as Window & { loadPdfFile?: typeof loadPdf }).loadPdfFile = loadPdf;
  }
}

// ==================== LIFECYCLE ====================

watch(currentPage, (newPage) => {
  pageInputValue.value = String(newPage);
});

onMounted(() => {
  loadSidebarState();
  initializeLibrary().catch(() => {});
  setupLegacyGlobals();

  pdfDropHandler = (event: { file: File }) => loadPdf(event.file);
  useEventBus().on('pdf:drop', pdfDropHandler);
  useEventBus().on('pdf:load', pdfDropHandler);

  // Check for a pending file queued before the viewer was opened
  const win = window as Window & { __pendingPdfFile?: File };
  if (win.__pendingPdfFile) {
    const pending = win.__pendingPdfFile;
    delete win.__pendingPdfFile;
    nextTick(() => loadPdf(pending));
  }

  nextTick(() => widgetRef.value?.focus());
});

onBeforeUnmount(() => {
  // Clean up global bridge so stale closures aren't called after unmount
  const win = window as Window & {
    loadPdfFile?: (f: File) => void;
    openPdfWidget?: () => void;
    togglePdfWidget?: () => void;
  };
  delete win.loadPdfFile;
  delete win.openPdfWidget;
  delete win.togglePdfWidget;

  cleanupResizeObserver();
  destroyRenderer();
  cleanupObserver();
  cleanupLibrary();

  if (loadingSpinnerTimeout) {
    clearTimeout(loadingSpinnerTimeout);
    loadingSpinnerTimeout = null;
  }
  if (pageInputErrorTimeout) {
    clearTimeout(pageInputErrorTimeout);
    pageInputErrorTimeout = null;
  }

  thumbnailObserverMap.forEach((_, el) => unobserveThumbnail(el));
  thumbnailObserverMap.clear();

  if (pdfDropHandler) {
    useEventBus().off('pdf:drop', pdfDropHandler);
    useEventBus().off('pdf:load', pdfDropHandler);
    pdfDropHandler = null;
  }
});

// Suppress unused variable warnings
void sentHighlightId.value;
void deleteHighlightNote;
</script>

<style scoped>
.pdf-content {
  --pdf-bg: rgb(250 250 252 / 98%);
  --pdf-bg-solid: #fafafc;
  --pdf-text: rgb(28 25 23);
  --pdf-text-muted: rgb(28 25 23 / 55%);
  --pdf-text-hint: rgb(28 25 23 / 35%);
  --pdf-border: rgb(0 0 0 / 8%);
  --pdf-surface-hover: rgb(0 0 0 / 4%);
  --pdf-surface-active: rgb(0 0 0 / 8%);
  --pdf-surface-muted: rgb(0 0 0 / 3%);
  --pdf-toolbar-btn: rgb(28 25 23 / 65%);
  --pdf-toolbar-btn-hover: rgb(28 25 23 / 85%);
  --pdf-toolbar-btn-active: rgb(28 25 23);
  --pdf-sidebar-width: 140px;

  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--pdf-text);
  background: var(--pdf-bg);
  outline: none;
  position: relative;
}

.pdf-action-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--pdf-border);
  flex-shrink: 0;
}

.pdf-action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--pdf-text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition:
    background 0.15s,
    color 0.15s;
  position: relative;
}

.pdf-action-btn:hover {
  background: var(--pdf-surface-hover);
  color: var(--pdf-text);
}
.pdf-action-btn.active {
  background: var(--pdf-surface-active);
  color: var(--pdf-toolbar-btn-active);
}

.library-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  color: white;
  background: var(--color-accent, #3b82f6);
  border-radius: 7px;
}

.pdf-pane-wrapper {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  position: relative;
  background: transparent;
}
.pdf-sidebar {
  width: var(--pdf-sidebar-width);
  min-width: var(--pdf-sidebar-width);
  background: var(--pdf-surface-muted);
  border-right: 1px solid var(--pdf-border);
  display: flex;
  flex-direction: column;
}
.pdf-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid var(--pdf-border);
}
.pdf-sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--pdf-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.pdf-thumbnail-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pdf-thumbnail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 2px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.pdf-thumbnail-item:hover {
  background: var(--pdf-surface-hover);
}
.pdf-thumbnail-item.active {
  border-color: var(--color-accent, #3b82f6);
  background: var(--pdf-surface-active);
}
.pdf-thumbnail-canvas-wrapper {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: white;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}
.pdf-thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.pdf-thumbnail-loading,
.pdf-thumbnail-placeholder {
  color: var(--pdf-text-hint);
  font-size: 24px;
}
.pdf-thumbnail-number {
  font-size: 11px;
  color: var(--pdf-text-muted);
}
.pdf-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.pdf-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--pdf-border);
  background: transparent;
  flex-shrink: 0;
}
.pdf-toolbar button {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--pdf-toolbar-btn);
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
.pdf-toolbar button:hover:not(:disabled) {
  background: var(--pdf-surface-hover);
  color: var(--pdf-toolbar-btn-hover);
}
.pdf-toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pdf-toolbar-btn.active {
  background: var(--pdf-surface-active);
  color: var(--pdf-toolbar-btn-active);
}
.pdf-toolbar-notes-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pdf-toolbar-notes-btn .notes-count {
  font-size: 11px;
  font-weight: 600;
  background: var(--pdf-surface-active);
  padding: 2px 6px;
  border-radius: 10px;
  color: var(--pdf-text-muted);
}
.pdf-toolbar-notes-btn.active {
  background: var(--pdf-surface-active);
  color: var(--pdf-toolbar-btn-active);
}
.pdf-toolbar-notes-btn.active .notes-count {
  background: var(--color-accent, #3b82f6);
  color: white;
}
.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--pdf-border);
  margin: 0 6px;
}
.pdf-page-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--pdf-text-muted);
}
.pdf-page-input {
  width: 40px;
  padding: 4px 6px;
  border: 1px solid var(--pdf-border);
  border-radius: 4px;
  background: transparent;
  color: var(--pdf-text);
  font-size: 13px;
  text-align: center;
}
.pdf-page-input:focus {
  outline: none;
  border-color: var(--color-accent, #3b82f6);
}
.pdf-page-input.error {
  border-color: #dc2626;
  background: rgb(239 68 68 / 8%);
  animation: shake 0.3s ease;
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  50% {
    transform: translateX(4px);
  }
  75% {
    transform: translateX(-4px);
  }
}
.pdf-page-separator {
  color: var(--pdf-text-hint);
}
.pdf-page-total {
  color: var(--pdf-text-muted);
}
.pdf-zoom-indicator {
  font-size: 12px;
  color: var(--pdf-text-muted);
  min-width: 40px;
  text-align: center;
}
.pdf-fit-width-btn {
  margin-left: 2px;
}
.pdf-canvas-container {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  background: var(--pdf-surface-muted);
}
.pdf-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  color: var(--pdf-text-hint);
  text-align: center;
}
.pdf-placeholder-icon {
  font-size: 64px;
  opacity: 0.4;
}
.pdf-placeholder-text {
  font-size: 14px;
  max-width: 200px;
}
.pdf-upload-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 1px solid var(--pdf-border);
  border-radius: 8px;
  background: var(--pdf-surface-hover);
  color: var(--pdf-text);
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.pdf-upload-btn:hover {
  background: var(--pdf-surface-active);
  border-color: var(--pdf-text-hint);
}
.pdf-page-wrapper {
  position: relative;
  display: inline-block;
}
.pdf-page-wrapper.loading {
  opacity: 0.7;
}
.pdf-canvas {
  display: block;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  background: white;
  position: relative;
  z-index: 1;
}
.pdf-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgb(255 255 255 / 60%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}
.pdf-loading-spinner {
  font-size: 32px;
  color: var(--pdf-text-muted);
}
.pdf-page-fade-enter-active,
.pdf-page-fade-leave-active {
  transition: opacity 0.15s ease;
}
.pdf-page-fade-enter-from,
.pdf-page-fade-leave-to {
  opacity: 0;
}
.spin {
  animation: spin 1s linear infinite;
}
.pdf-text-layer {
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 2;
  pointer-events: auto;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor, 1) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.pdf-text-layer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
}
.pdf-text-layer > :not(.markedContent),
.pdf-text-layer .markedContent span:not(.markedContent) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.pdf-text-layer .markedContent {
  display: contents;
}
.pdf-text-layer ::selection {
  background: rgb(0 100 255 / 30%);
}
.pdf-text-layer br::selection {
  background: transparent;
}
.pdf-highlight-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 3;
}
.pdf-highlight-layer .highlight-overlay {
  pointer-events: auto;
  border-radius: 2px;
  mix-blend-mode: multiply;
  transition: opacity 0.15s;
}
.pdf-highlight-layer .highlight-overlay:hover {
  opacity: 0.8;
}
.highlight-color-picker {
  position: absolute;
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: var(--pdf-bg-solid);
  border: 1px solid var(--pdf-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
  z-index: 100;
}
.highlight-color-picker .color-btn {
  width: 24px;
  height: 24px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition:
    transform 0.12s,
    border-color 0.12s;
}
.highlight-color-picker .color-btn:hover {
  transform: scale(1.15);
}
.highlight-color-picker .color-btn.yellow {
  background: rgba(255, 235, 59, 0.9);
}
.highlight-color-picker .color-btn.green {
  background: rgba(76, 175, 80, 0.9);
}
.highlight-color-picker .color-btn.blue {
  background: rgba(33, 150, 243, 0.9);
}
.highlight-color-picker .color-btn.pink {
  background: rgba(233, 30, 99, 0.9);
}
.highlight-color-picker .color-btn.orange {
  background: rgba(255, 152, 0, 0.9);
}
.highlight-color-picker .color-btn.purple {
  background: rgba(156, 39, 176, 0.9);
}
.pdf-send-selection-btn {
  position: absolute;
  z-index: 101;
}
.pdf-send-selection-btn .send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-accent, #3b82f6);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.12s;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
}
.pdf-send-selection-btn .send-btn:hover {
  background: var(--color-accent-hover, #2563eb);
  transform: translateY(-1px);
}
.pdf-context-menu {
  position: absolute;
  z-index: 200;
  min-width: 160px;
  background: var(--pdf-bg-solid);
  border: 1px solid var(--pdf-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  padding: 4px;
  animation: context-menu-in 0.12s ease;
}
@keyframes context-menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--pdf-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s;
}
.context-menu-item:hover {
  background: var(--pdf-surface-hover);
}
.context-menu-item.danger {
  color: #dc2626;
}
.context-menu-item.danger:hover {
  background: rgb(239 68 68 / 10%);
}
.context-menu-item iconify-icon {
  font-size: 16px;
  opacity: 0.7;
}
.context-menu-divider {
  height: 1px;
  background: var(--pdf-border);
  margin: 4px 8px;
}
.context-menu-note-input {
  padding: 8px;
}
.context-menu-note-input textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--pdf-border);
  border-radius: 6px;
  background: var(--pdf-surface-muted);
  color: var(--pdf-text);
  font-size: 13px;
  resize: none;
}
.context-menu-note-input textarea:focus {
  outline: none;
  border-color: var(--color-accent, #3b82f6);
}
.context-menu-note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.note-cancel-btn,
.note-save-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s;
}
.note-cancel-btn {
  background: var(--pdf-surface-hover);
  color: var(--pdf-text-muted);
}
.note-save-btn {
  background: var(--color-accent, #3b82f6);
  color: white;
}
.pdf-note-popup {
  position: absolute;
  z-index: 150;
  width: 260px;
  background: var(--pdf-bg-solid);
  border: 1px solid var(--pdf-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  animation: popup-in 0.15s ease;
}
@keyframes popup-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.note-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--pdf-border);
}
.note-popup-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pdf-text-muted);
}
.note-popup-close {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--pdf-text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s;
}
.note-popup-close:hover {
  background: var(--pdf-surface-hover);
}
.note-popup-textarea {
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--pdf-text);
  font-size: 13px;
  resize: none;
  outline: none;
}
.note-popup-footer {
  padding: 6px 12px 10px;
}
.note-popup-hint {
  font-size: 11px;
  color: var(--pdf-text-hint);
}
.highlight-note-indicator {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent, #3b82f6);
  color: white;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 10;
  box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
  transition: transform 0.12s;
}
.highlight-note-indicator:hover {
  transform: scale(1.15);
}
.pdf-notes-panel {
  width: 220px;
  min-width: 220px;
  background: var(--pdf-bg-solid);
  border-left: 1px solid var(--pdf-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.notes-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--pdf-border);
}
.notes-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pdf-text);
}
.notes-panel-actions {
  display: flex;
  gap: 4px;
}
.notes-panel-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--pdf-text-muted);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition:
    background 0.12s,
    color 0.12s;
}
.notes-panel-btn:hover {
  background: var(--pdf-surface-hover);
  color: var(--pdf-text);
}
.notes-panel-filter {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--pdf-border);
}
.notes-panel-filter button {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--pdf-border);
  border-radius: 6px;
  background: transparent;
  color: var(--pdf-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}
.notes-panel-filter button:hover {
  background: var(--pdf-surface-hover);
}
.notes-panel-filter button.active {
  background: var(--pdf-surface-active);
  color: var(--pdf-text);
  border-color: var(--color-accent, #3b82f6);
}
.notes-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.notes-panel-item {
  padding: 10px;
  margin-bottom: 8px;
  background: var(--pdf-surface-muted);
  border: 1px solid var(--pdf-border);
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.notes-panel-item:hover {
  background: var(--pdf-surface-hover);
  border-color: var(--pdf-text-hint);
}
.notes-panel-item.has-note {
  border-left: 3px solid var(--color-accent, #3b82f6);
}
.notes-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.notes-item-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.notes-item-page {
  font-size: 11px;
  color: var(--pdf-text-hint);
  font-weight: 500;
}
.notes-item-text {
  font-size: 12px;
  color: var(--pdf-text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.notes-item-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--pdf-border);
  font-size: 11px;
  color: var(--pdf-text-muted);
  line-height: 1.4;
}
.notes-item-note-icon {
  flex-shrink: 0;
  color: var(--color-accent, #3b82f6);
  font-size: 12px;
  margin-top: 1px;
}
.notes-panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--pdf-text-hint);
  text-align: center;
}
.notes-panel-empty iconify-icon {
  font-size: 32px;
  opacity: 0.5;
}
.notes-panel-empty span {
  font-size: 12px;
}

@media (max-width: 768px) {
  .pdf-sidebar {
    display: none;
  }
  .pdf-toolbar button {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
}

.pdf-canvas-container::-webkit-scrollbar,
.pdf-thumbnail-list::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.pdf-canvas-container::-webkit-scrollbar-track,
.pdf-thumbnail-list::-webkit-scrollbar-track {
  background: transparent;
}
.pdf-canvas-container::-webkit-scrollbar-thumb,
.pdf-thumbnail-list::-webkit-scrollbar-thumb {
  background: rgb(0 0 0 / 12%);
  border-radius: 4px;
}
</style>

<style>
/* Theme overrides for PdfContent */
body.night-theme .pdf-content,
body.vera-baxter-theme .pdf-content,
body.custom-theme .pdf-content,
body.purple-theme .pdf-content {
  --pdf-bg: rgb(24 24 28 / 98%);
  --pdf-bg-solid: #18181c;
  --pdf-text: rgb(240 240 245);
  --pdf-text-muted: rgb(240 240 245 / 55%);
  --pdf-text-hint: rgb(240 240 245 / 35%);
  --pdf-border: rgb(255 255 255 / 10%);
  --pdf-surface-hover: rgb(255 255 255 / 6%);
  --pdf-surface-active: rgb(255 255 255 / 12%);
  --pdf-surface-muted: rgb(255 255 255 / 4%);
  --pdf-toolbar-btn: rgb(240 240 245 / 60%);
  --pdf-toolbar-btn-hover: rgb(240 240 245 / 80%);
  --pdf-toolbar-btn-active: rgb(240 240 245);
}

body.light-theme .pdf-content {
  --pdf-bg: rgb(215 235 248 / 96%);
  --pdf-bg-solid: #d7ebf8;
  --pdf-text: rgb(20 40 60);
  --pdf-text-muted: rgb(20 40 60 / 60%);
  --pdf-text-hint: rgb(20 40 60 / 40%);
  --pdf-border: rgb(0 60 120 / 12%);
  --pdf-surface-hover: rgb(0 60 120 / 6%);
  --pdf-surface-active: rgb(0 60 120 / 10%);
  --pdf-surface-muted: rgb(0 60 120 / 4%);
}
body.vitti-theme .pdf-content {
  --pdf-bg: rgb(245 247 245 / 96%);
  --pdf-bg-solid: #f5f7f5;
  --pdf-text: rgb(30 32 30);
  --pdf-text-muted: rgb(30 32 30 / 55%);
  --pdf-text-hint: rgb(30 32 30 / 35%);
}
body.share-bear-theme .pdf-content {
  --pdf-bg: rgb(235 225 245 / 96%);
  --pdf-bg-solid: #ebe1f5;
  --pdf-text: rgb(45 30 60);
  --pdf-text-muted: rgb(45 30 60 / 55%);
  --pdf-text-hint: rgb(45 30 60 / 35%);
  --pdf-border: rgb(80 40 120 / 12%);
  --pdf-surface-hover: rgb(80 40 120 / 6%);
  --pdf-surface-active: rgb(80 40 120 / 10%);
}
body.fragile-theme .pdf-content {
  --pdf-bg: rgb(225 238 242 / 96%);
  --pdf-bg-solid: #e1eef2;
  --pdf-text: rgb(35 50 55);
  --pdf-text-muted: rgb(35 50 55 / 55%);
  --pdf-text-hint: rgb(35 50 55 / 35%);
  --pdf-border: rgb(60 100 120 / 12%);
  --pdf-surface-hover: rgb(60 100 120 / 6%);
  --pdf-surface-active: rgb(60 100 120 / 10%);
}
body.eva-theme .pdf-content {
  --pdf-bg: rgb(240 232 225 / 96%);
  --pdf-bg-solid: #f0e8e1;
  --pdf-text: rgb(60 45 35);
  --pdf-text-muted: rgb(60 45 35 / 55%);
  --pdf-text-hint: rgb(60 45 35 / 35%);
  --pdf-border: rgb(140 100 60 / 12%);
  --pdf-surface-hover: rgb(140 100 60 / 6%);
  --pdf-surface-active: rgb(140 100 60 / 10%);
}
body.high-contrast-theme .pdf-content {
  --pdf-bg: rgb(255 255 255 / 100%);
  --pdf-bg-solid: #ffffff;
  --pdf-text: rgb(0 0 0);
  --pdf-text-muted: rgb(0 0 0 / 70%);
  --pdf-text-hint: rgb(0 0 0 / 50%);
  --pdf-border: rgb(0 0 0 / 20%);
  --pdf-surface-hover: rgb(0 0 0 / 8%);
  --pdf-surface-active: rgb(0 0 0 / 15%);
}
</style>
