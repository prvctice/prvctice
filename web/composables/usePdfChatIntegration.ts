/**
 * PDF Chat Integration Composable
 *
 * Provides functionality to send PDF content to chat:
 * - Send selected text with page reference
 * - Send all highlights with notes
 * - Send document summary
 */

import { ref, type Ref } from 'vue';
import { useChatStore } from '@web/stores/chat.js';
import { useNotifs } from '@web/composables/useNotifs.js';
import { overlayOn } from '@web/utils/customOverlay.js';
import { logError } from '@web/utils/debugLog.js';
import type { PdfDocument, PdfHighlight } from '@web/types/pdf';

export interface PdfSelection {
  text: string;
  pageNumber: number;
}

export interface SendToChatOptions {
  /** Clear selection after sending */
  clearSelection?: boolean;
  /** Show notification after sending */
  showNotification?: boolean;
}

export interface UsePdfChatIntegrationOptions {
  /** Ref to current PDF document */
  document: Ref<PdfDocument | null>;
  /** Ref to all highlights */
  highlights: Ref<PdfHighlight[]>;
  /** Ref to current page number */
  currentPage: Ref<number>;
  /** Callback to clear text selection */
  onClearSelection?: () => void;
}

export interface UsePdfChatIntegrationReturn {
  // State
  lastSentContent: Ref<string | null>;
  isSending: Ref<boolean>;

  // Methods
  sendSelectionToChat: (selection: PdfSelection, options?: SendToChatOptions) => void;
  sendHighlightsToChat: (options?: SendToChatOptions) => void;
  sendDocumentSummary: (firstPageText?: string, options?: SendToChatOptions) => void;
  sendHighlightToChat: (highlight: PdfHighlight, options?: SendToChatOptions) => void;
  copyTextToClipboard: (text: string) => Promise<boolean>;
  formatHighlightForChat: (highlight: PdfHighlight) => string;
  formatSelectionForChat: (selection: PdfSelection) => string;
}

export function usePdfChatIntegration(
  options: UsePdfChatIntegrationOptions
): UsePdfChatIntegrationReturn {
  const { document, highlights, onClearSelection } = options;

  // State
  const lastSentContent = ref<string | null>(null);
  const isSending = ref(false);

  // Get notification API
  const notifApi = useNotifs();
  const notify = (kind: string, text: string) => {
    try {
      notifApi?.push?.(kind, text);
    } catch {
      // Silent fail
    }
  };

  /**
   * Format a text selection for chat - just the content
   */
  function formatSelectionForChat(selection: PdfSelection): string {
    return selection.text;
  }

  /**
   * Format a single highlight for chat - just the content
   */
  function formatHighlightForChat(highlight: PdfHighlight): string {
    let formatted = highlight.text;

    if (highlight.annotation) {
      formatted += `\n\nNote: ${highlight.annotation}`;
    }

    return formatted;
  }

  /**
   * Format all highlights as a structured message - just the content
   */
  function formatAllHighlightsForChat(highlightList: PdfHighlight[]): string {
    if (highlightList.length === 0) {
      return '';
    }

    const sorted = [...highlightList].sort((a, b) => a.position.pageNumber - b.position.pageNumber);

    // Join all highlight texts, separated by double newlines
    const parts: string[] = [];
    for (const h of sorted) {
      let text = h.text;
      if (h.annotation) {
        text += `\n\nNote: ${h.annotation}`;
      }
      parts.push(text);
    }

    return parts.join('\n\n');
  }

  /**
   * Format document summary for chat
   */
  function formatDocumentSummaryForChat(firstPageText?: string): string {
    const doc = document.value;
    if (!doc) {
      return '';
    }

    let summary = `**PDF Document Summary**\n\n`;
    summary += `**Title:** ${doc.title}\n`;
    summary += `**Pages:** ${doc.numPages}\n`;

    if (doc.author) {
      summary += `**Author:** ${doc.author}\n`;
    }
    if (doc.subject) {
      summary += `**Subject:** ${doc.subject}\n`;
    }
    if (doc.fileSize) {
      const sizeMB = (doc.fileSize / (1024 * 1024)).toFixed(2);
      summary += `**Size:** ${sizeMB} MB\n`;
    }

    if (firstPageText) {
      // Truncate to ~500 words
      const words = firstPageText.split(/\s+/);
      const truncated = words.slice(0, 500).join(' ');
      const ellipsis = words.length > 500 ? '...' : '';
      summary += `\n**First page excerpt:**\n> ${truncated}${ellipsis}`;
    }

    return summary;
  }

  /**
   * Send content to chat
   */
  function sendToChat(message: string, options: SendToChatOptions = {}): void {
    if (!message.trim()) return;

    isSending.value = true;
    lastSentContent.value = message;

    try {
      const chat = useChatStore();

      // Trigger first prompt event for UI animations
      window.dispatchEvent(new Event('firstPromptSent'));

      // Activate chat overlay
      try {
        overlayOn('chat');
      } catch {
        // Silent fail
      }

      // Send the message
      chat.send(message);

      // Clear selection if requested
      if (options.clearSelection && onClearSelection) {
        onClearSelection();
      }

      // Show notification
      if (options.showNotification !== false) {
        notify('success', 'Sent to chat');
      }
    } catch (err) {
      logError('chat', 'pdf:sendFailed', err as Error);
      notify('error', 'Failed to send to chat');
    } finally {
      isSending.value = false;
    }
  }

  /**
   * Send selected text to chat
   */
  function sendSelectionToChat(selection: PdfSelection, options: SendToChatOptions = {}): void {
    if (!selection.text.trim()) {
      notify('error', 'No text selected');
      return;
    }

    const message = formatSelectionForChat(selection);
    sendToChat(message, { ...options, clearSelection: options.clearSelection ?? true });
  }

  /**
   * Send all highlights to chat
   */
  function sendHighlightsToChat(options: SendToChatOptions = {}): void {
    if (highlights.value.length === 0) {
      notify('error', 'No highlights to send');
      return;
    }

    const message = formatAllHighlightsForChat(highlights.value);
    sendToChat(message, options);
  }

  /**
   * Send document summary to chat
   */
  function sendDocumentSummary(firstPageText?: string, options: SendToChatOptions = {}): void {
    if (!document.value) {
      notify('error', 'No document loaded');
      return;
    }

    const message = formatDocumentSummaryForChat(firstPageText);
    sendToChat(message, options);
  }

  /**
   * Send a single highlight to chat
   */
  function sendHighlightToChat(highlight: PdfHighlight, options: SendToChatOptions = {}): void {
    const message = formatHighlightForChat(highlight);
    sendToChat(message, options);
  }

  /**
   * Copy text to clipboard
   */
  async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', 'Copied to clipboard');
      return true;
    } catch (err) {
      logError('chat', 'pdf:copyFailed', err as Error);
      notify('error', 'Failed to copy');
      return false;
    }
  }

  return {
    // State
    lastSentContent,
    isSending,

    // Methods
    sendSelectionToChat,
    sendHighlightsToChat,
    sendDocumentSummary,
    sendHighlightToChat,
    copyTextToClipboard,
    formatHighlightForChat,
    formatSelectionForChat,
  };
}

export default usePdfChatIntegration;
