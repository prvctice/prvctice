/**
 * PDF Highlights Composable
 *
 * Manages PDF highlights with localStorage persistence.
 * Provides:
 * - Highlight storage per document
 * - Add/remove/update highlights
 * - Color options (yellow, green, blue, pink, orange, purple)
 * - Load/save to localStorage
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { PdfHighlight, PdfRect, HighlightColor } from '@web/types/pdf';
import { PDF_STORAGE_KEYS, HIGHLIGHT_COLORS } from '@web/types/pdf';
import { logError } from '@web/utils/debugLog.js';

/** Generate unique ID for highlights */
function generateHighlightId(): string {
  return `hl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface UsePdfHighlightsOptions {
  /** Document ID to scope highlights to */
  documentId?: string;
  /** Callback when highlights change */
  onHighlightsChange?: (highlights: PdfHighlight[]) => void;
}

export interface UsePdfHighlightsReturn {
  // State
  highlights: Ref<PdfHighlight[]>;
  activeHighlight: Ref<PdfHighlight | null>;
  highlightColors: typeof HIGHLIGHT_COLORS;

  // Computed
  highlightCount: ComputedRef<number>;
  highlightsWithNotes: ComputedRef<PdfHighlight[]>;

  // Methods
  setDocumentId: (docId: string) => void;
  addHighlight: (params: AddHighlightParams) => PdfHighlight;
  removeHighlight: (highlightId: string) => void;
  updateHighlight: (highlightId: string, updates: Partial<PdfHighlight>) => void;
  updateHighlightNote: (highlightId: string, note: string) => void;
  deleteHighlightNote: (highlightId: string) => void;
  getHighlightsForPage: (pageNumber: number) => PdfHighlight[];
  getHighlightById: (highlightId: string) => PdfHighlight | undefined;
  clearHighlights: () => void;
  loadHighlights: () => void;
  saveHighlights: () => void;
  setActiveHighlight: (highlight: PdfHighlight | null) => void;
  exportAnnotations: (format: 'json' | 'text') => string;
}

export interface AddHighlightParams {
  text: string;
  pageNumber: number;
  rects: PdfRect[];
  color?: HighlightColor;
  annotation?: string;
}

export function usePdfHighlights(options: UsePdfHighlightsOptions = {}): UsePdfHighlightsReturn {
  const { onHighlightsChange } = options;

  // State
  const documentId = ref<string>(options.documentId || '');
  const highlights = ref<PdfHighlight[]>([]);
  const activeHighlight = ref<PdfHighlight | null>(null);

  // Computed
  const highlightCount = computed(() => highlights.value.length);

  /** Get all highlights that have notes/annotations */
  const highlightsWithNotes = computed(() =>
    highlights.value.filter((h) => h.annotation && h.annotation.trim().length > 0)
  );

  /**
   * Set the document ID and load highlights for that document
   */
  function setDocumentId(docId: string): void {
    if (documentId.value === docId) return;

    // Save current highlights before switching
    if (documentId.value) {
      saveHighlights();
    }

    documentId.value = docId;
    activeHighlight.value = null;

    if (docId) {
      loadHighlights();
    } else {
      highlights.value = [];
    }
  }

  /**
   * Load highlights from localStorage for current document
   */
  function loadHighlights(): void {
    if (!documentId.value) {
      highlights.value = [];
      return;
    }

    try {
      const storageKey = PDF_STORAGE_KEYS.highlights(documentId.value);
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate structure
        if (Array.isArray(parsed)) {
          highlights.value = parsed.filter(
            (h: unknown): h is PdfHighlight =>
              h !== null &&
              typeof h === 'object' &&
              'id' in h &&
              'text' in h &&
              'position' in h &&
              'color' in h
          );
        } else {
          highlights.value = [];
        }
      } else {
        highlights.value = [];
      }
    } catch (err) {
      logError('pdf', 'highlights:load', err as Error);
      highlights.value = [];
    }
  }

  /**
   * Save highlights to localStorage for current document
   */
  function saveHighlights(): void {
    if (!documentId.value) return;

    try {
      const storageKey = PDF_STORAGE_KEYS.highlights(documentId.value);

      if (highlights.value.length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(highlights.value));
      }
    } catch (err) {
      logError('pdf', 'highlights:save', err as Error);
    }
  }

  /**
   * Add a new highlight
   */
  function addHighlight(params: AddHighlightParams): PdfHighlight {
    const { text, pageNumber, rects, color = 'yellow', annotation } = params;

    const highlight: PdfHighlight = {
      id: generateHighlightId(),
      documentId: documentId.value,
      text,
      position: {
        pageNumber,
        startIndex: 0, // Text layer doesn't provide char indices
        endIndex: text.length,
        rects,
      },
      color,
      annotation,
      createdAt: Date.now(),
    };

    highlights.value = [...highlights.value, highlight];
    saveHighlights();
    onHighlightsChange?.(highlights.value);

    return highlight;
  }

  /**
   * Remove a highlight by ID
   */
  function removeHighlight(highlightId: string): void {
    const index = highlights.value.findIndex((h) => h.id === highlightId);
    if (index === -1) return;

    highlights.value = [...highlights.value.slice(0, index), ...highlights.value.slice(index + 1)];

    if (activeHighlight.value?.id === highlightId) {
      activeHighlight.value = null;
    }

    saveHighlights();
    onHighlightsChange?.(highlights.value);
  }

  /**
   * Update a highlight (e.g., change color or add annotation)
   */
  function updateHighlight(highlightId: string, updates: Partial<PdfHighlight>): void {
    const index = highlights.value.findIndex((h) => h.id === highlightId);
    if (index === -1) return;

    const existing = highlights.value[index];
    if (!existing) return;

    const updated: PdfHighlight = {
      // Start with all required fields from existing
      id: existing.id,
      documentId: existing.documentId,
      text: existing.text,
      position: existing.position,
      color: updates.color ?? existing.color,
      createdAt: existing.createdAt,
      // Apply updates (only optional fields should be updated)
      annotation: updates.annotation ?? existing.annotation,
      updatedAt: Date.now(),
    };

    highlights.value = [
      ...highlights.value.slice(0, index),
      updated,
      ...highlights.value.slice(index + 1),
    ];

    if (activeHighlight.value?.id === highlightId) {
      activeHighlight.value = updated;
    }

    saveHighlights();
    onHighlightsChange?.(highlights.value);
  }

  /**
   * Get highlights for a specific page
   */
  function getHighlightsForPage(pageNumber: number): PdfHighlight[] {
    return highlights.value.filter((h) => h.position.pageNumber === pageNumber);
  }

  /**
   * Get a highlight by ID
   */
  function getHighlightById(highlightId: string): PdfHighlight | undefined {
    return highlights.value.find((h) => h.id === highlightId);
  }

  /**
   * Update the note/annotation for a highlight
   */
  function updateHighlightNote(highlightId: string, note: string): void {
    updateHighlight(highlightId, { annotation: note });
  }

  /**
   * Delete the note from a highlight (keeps the highlight, removes note)
   */
  function deleteHighlightNote(highlightId: string): void {
    const index = highlights.value.findIndex((h) => h.id === highlightId);
    if (index === -1) return;

    const existing = highlights.value[index];
    if (!existing) return;

    // Create updated highlight without annotation
    const updated: PdfHighlight = {
      id: existing.id,
      documentId: existing.documentId,
      text: existing.text,
      position: existing.position,
      color: existing.color,
      createdAt: existing.createdAt,
      annotation: undefined,
      updatedAt: Date.now(),
    };

    highlights.value = [
      ...highlights.value.slice(0, index),
      updated,
      ...highlights.value.slice(index + 1),
    ];

    if (activeHighlight.value?.id === highlightId) {
      activeHighlight.value = updated;
    }

    saveHighlights();
    onHighlightsChange?.(highlights.value);
  }

  /**
   * Export annotations in JSON or plain text format
   */
  function exportAnnotations(format: 'json' | 'text'): string {
    const sortedHighlights = [...highlights.value].sort(
      (a, b) => a.position.pageNumber - b.position.pageNumber
    );

    if (format === 'json') {
      const exportData = sortedHighlights.map((h) => ({
        page: h.position.pageNumber,
        text: h.text,
        color: h.color,
        note: h.annotation || null,
        createdAt: new Date(h.createdAt).toISOString(),
      }));
      return JSON.stringify(exportData, null, 2);
    }

    // Plain text format
    const lines: string[] = ['PDF Highlights and Notes', '========================', ''];

    let currentPage = 0;
    for (const h of sortedHighlights) {
      if (h.position.pageNumber !== currentPage) {
        currentPage = h.position.pageNumber;
        lines.push(`--- Page ${currentPage} ---`, '');
      }

      lines.push(`[${h.color.toUpperCase()}] "${h.text}"`);
      if (h.annotation) {
        lines.push(`  Note: ${h.annotation}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Clear all highlights for current document
   */
  function clearHighlights(): void {
    highlights.value = [];
    activeHighlight.value = null;
    saveHighlights();
    onHighlightsChange?.(highlights.value);
  }

  /**
   * Set the active/selected highlight
   */
  function setActiveHighlight(highlight: PdfHighlight | null): void {
    activeHighlight.value = highlight;
  }

  return {
    // State
    highlights,
    activeHighlight,
    highlightColors: HIGHLIGHT_COLORS,

    // Computed
    highlightCount,
    highlightsWithNotes,

    // Methods
    setDocumentId,
    addHighlight,
    removeHighlight,
    updateHighlight,
    updateHighlightNote,
    deleteHighlightNote,
    getHighlightsForPage,
    getHighlightById,
    clearHighlights,
    loadHighlights,
    saveHighlights,
    setActiveHighlight,
    exportAnnotations,
  };
}

export default usePdfHighlights;
