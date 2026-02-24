import type { jsPDF as JsPDFType } from 'jspdf';

/**
 * PDF Export Service
 * Clean, minimal chat transcript export inspired by professional invoices.
 */

// Types
type RGBColor = [number, number, number];

interface ContentBlock {
  type: 'text' | 'code';
  content: string;
}

interface LinkInfo {
  text: string | null;
  url: string;
}

interface MessageData {
  isUser: boolean;
  blocks: ContentBlock[];
  links: LinkInfo[];
  rawText?: string;
}

// Minimal color palette - clean black/gray aesthetic
const COLORS = {
  black: [0, 0, 0] as RGBColor,
  darkGray: [51, 51, 51] as RGBColor,
  mediumGray: [102, 102, 102] as RGBColor,
  lightGray: [153, 153, 153] as RGBColor,
  ruleGray: [220, 220, 220] as RGBColor,
  codeBg: [248, 248, 248] as RGBColor,
  link: [59, 130, 246] as RGBColor,
} as const;

// Layout constants - generous whitespace
const LAYOUT = {
  marginTop: 20,
  marginBottom: 24,
  marginLeft: 24,
  marginRight: 24,
  messageGap: 16,
  messagePadding: 12,
  headerHeight: 36,
  footerHeight: 16,
  lineHeight: 5,
  codeLineHeight: 4,
};

function getChatMessages(): Element[] {
  const chatWindow =
    typeof document !== 'undefined' ? document.getElementById('chat-window') : null;
  if (!chatWindow) return [];
  return Array.from(chatWindow.querySelectorAll('.message'));
}

function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return date.toLocaleDateString('en-US', options);
}

function extractCodeBlocks(text: string): ContentBlock[] {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const parts: ContentBlock[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const codeContent = match[0].replace(/```\w*\n?/, '').replace(/```$/, '');
    parts.push({ type: 'code', content: codeContent.trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', content: text }];
}

function drawHeader(doc: JsPDFType, pageWidth: number): void {
  const { marginLeft, marginRight } = LAYOUT;

  // Title - bold, clean
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.black);
  doc.text('Prvctice', marginLeft, 18);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.mediumGray);
  doc.text('Chat Transcript', marginLeft, 26);

  // Date - right aligned
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.mediumGray);
  const dateText = formatDate(new Date());
  const dateWidth = doc.getTextWidth(dateText);
  doc.text(dateText, pageWidth - marginRight - dateWidth, 18);

  // Horizontal rule under header
  doc.setDrawColor(...COLORS.ruleGray);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, 32, pageWidth - marginRight, 32);
}

function drawFooter(
  doc: JsPDFType,
  pageWidth: number,
  pageHeight: number,
  pageNumber: number,
  totalPages: number
): void {
  const { marginLeft, marginRight, footerHeight } = LAYOUT;
  const y = pageHeight - footerHeight;

  // Subtle footer line
  doc.setDrawColor(...COLORS.ruleGray);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y - 4, pageWidth - marginRight, y - 4);

  // Page number - left
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.lightGray);
  doc.text(`Page ${pageNumber} of ${totalPages}`, marginLeft, y + 4);

  // Website link - right
  doc.setTextColor(...COLORS.link);
  const linkText = 'prvctice.com';
  const linkWidth = doc.getTextWidth(linkText);
  doc.textWithLink(linkText, pageWidth - marginRight - linkWidth, y + 4, {
    url: 'https://prvctice.com',
  });
}

export async function saveChatAsPdf(): Promise<void> {
  const messages = getChatMessages();
  if (!messages.length) return;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - LAYOUT.marginLeft - LAYOUT.marginRight;
  // Start content after header (title + subtitle + rule + spacing)
  const contentStartY = 44;
  const contentEndY = pageHeight - LAYOUT.marginBottom - LAYOUT.footerHeight;

  // Parse all messages
  const messagesData: MessageData[] = messages.map((message) => {
    const isUser = message.classList.contains('user');
    const contentElement = message.querySelector('.message-content') as HTMLElement | null;

    if (!contentElement) {
      return { isUser, blocks: [], links: [] };
    }

    const rawText = contentElement.innerText.trim();
    const links: LinkInfo[] = Array.from(contentElement.querySelectorAll('a')).map(
      (link: HTMLAnchorElement) => ({
        text: link.textContent,
        url: link.href,
      })
    );

    const blocks = extractCodeBlocks(rawText);

    return { isUser, blocks, links, rawText };
  });

  // Render pages
  let yOffset = contentStartY;
  drawHeader(doc, pageWidth);

  for (let i = 0; i < messagesData.length; i++) {
    const data = messagesData[i];
    if (!data) continue;
    const messageHeight = estimateMessageHeight(doc, data, contentWidth);

    // Check if we need a new page
    if (yOffset + messageHeight > contentEndY && i > 0) {
      doc.addPage();
      drawHeader(doc, pageWidth);
      yOffset = contentStartY;
    }

    yOffset = renderMessage(doc, data, yOffset, contentWidth, contentEndY, pageWidth);
    yOffset += LAYOUT.messageGap;
  }

  // Add footers to all pages
  const pageCount = (
    doc.internal as unknown as { getNumberOfPages: () => number }
  ).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(doc, pageWidth, pageHeight, i, pageCount);
  }

  // Generate filename
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const filename = `prvctice-chat-${year}-${month}-${day}-${hours}${minutes}.pdf`;

  doc.save(filename);
}

function estimateMessageHeight(doc: JsPDFType, data: MessageData, contentWidth: number): number {
  // Label height + top padding + bottom padding before rule
  let height = 20;

  // Use conservative text width - leave extra margin for safety
  const textWidth = contentWidth - 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  for (const block of data.blocks) {
    if (block.type === 'text' && block.content.trim()) {
      const lines = doc.splitTextToSize(block.content.trim(), textWidth);
      height += lines.length * LAYOUT.lineHeight + 4;
    } else if (block.type === 'code' && block.content.trim()) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      // Code blocks need more margin for the background padding
      const codeWidth = textWidth - 16;
      const lines = doc.splitTextToSize(block.content.trim(), codeWidth);
      height += lines.length * LAYOUT.codeLineHeight + 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }
  }

  // Add space for links
  if (data.links.length > 0) {
    height += 8 + Math.min(data.links.length, 5) * 5;
  }

  return Math.max(height, 30);
}

function renderMessage(
  doc: JsPDFType,
  data: MessageData,
  startY: number,
  contentWidth: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _maxY: number,
  pageWidth: number
): number {
  const { isUser, blocks, links } = data;
  const x = LAYOUT.marginLeft;
  let y = startY;

  const label = isUser ? 'You' : 'Assistant';

  // Sender label - bold, clean
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.darkGray);
  doc.text(label, x, y + 4);
  y += 14;

  // Message content - use conservative width for wrapping
  const textWidth = contentWidth - 8;
  const textX = x + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.darkGray);

  for (const block of blocks) {
    if (block.type === 'text' && block.content.trim()) {
      const lines = doc.splitTextToSize(block.content.trim(), textWidth);
      for (const line of lines) {
        doc.text(line, textX, y);
        y += LAYOUT.lineHeight;
      }
      y += 2;
    } else if (block.type === 'code' && block.content.trim()) {
      // Code block with subtle background
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      const codeWidth = textWidth - 16;
      const codeLines = doc.splitTextToSize(block.content.trim(), codeWidth);
      const codeHeight = codeLines.length * LAYOUT.codeLineHeight + 10;

      // Subtle code background
      doc.setFillColor(...COLORS.codeBg);
      doc.roundedRect(textX, y - 2, textWidth, codeHeight, 2, 2, 'F');

      doc.setTextColor(...COLORS.darkGray);

      y += 4;
      for (const line of codeLines) {
        doc.text(line, textX + 6, y);
        y += LAYOUT.codeLineHeight;
      }

      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }
  }

  // Links section - cleaner presentation
  if (links.length > 0) {
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.lightGray);
    doc.text('Links:', textX, y);
    y += 5;

    doc.setTextColor(...COLORS.link);
    const maxLinks = Math.min(links.length, 5);
    // Calculate max URL length based on available width (conservative)
    const maxUrlChars = Math.floor((textWidth - 8) / 2);
    for (let i = 0; i < maxLinks; i++) {
      const link = links[i];
      if (!link) continue;
      const displayUrl =
        link.url.length > maxUrlChars ? link.url.substring(0, maxUrlChars - 3) + '...' : link.url;
      doc.textWithLink(displayUrl, textX + 4, y, { url: link.url });
      y += 5;
    }
    if (links.length > 5) {
      doc.setTextColor(...COLORS.lightGray);
      doc.text(`... and ${links.length - 5} more links`, textX + 4, y);
      y += 5;
    }
  }

  // Subtle separator line between messages
  y += 6;
  doc.setDrawColor(...COLORS.ruleGray);
  doc.setLineWidth(0.3);
  doc.line(x, y, pageWidth - LAYOUT.marginRight, y);

  return y + 4;
}

export default { saveChatAsPdf };
