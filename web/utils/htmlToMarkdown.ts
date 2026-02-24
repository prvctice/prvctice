/**
 * Converts TipTap HTML output to Markdown.
 * DOM-based parsing for accuracy. Handles headings, bold, italic,
 * strikethrough, lists (including task lists), code blocks, and HRs.
 */

function processInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(processInline).join('');

  switch (tag) {
    case 'strong':
    case 'b':
      return `**${inner}**`;
    case 'em':
    case 'i':
      return `*${inner}*`;
    case 's':
    case 'del':
      return `~~${inner}~~`;
    case 'code':
      return `\`${inner}\``;
    case 'a':
      return `[${inner}](${el.getAttribute('href') || ''})`;
    case 'br':
      return '\n';
    default:
      return inner;
  }
}

function processNode(node: Node, listCounter?: { n: number }): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.trim() ? node.textContent : '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(tag[1] || '1', 10);
      const prefix = '#'.repeat(level);
      const text = Array.from(el.childNodes).map(processInline).join('');
      return `${prefix} ${text}\n\n`;
    }
    case 'p': {
      const text = Array.from(el.childNodes).map(processInline).join('');
      return text ? `${text}\n\n` : '\n';
    }
    case 'blockquote': {
      const inner = processChildren(el).trim();
      return (
        inner
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
      );
    }
    case 'ul': {
      const isTaskList = el.getAttribute('data-type') === 'taskList';
      const items = Array.from(el.children).map((li) => {
        if (isTaskList) {
          const checked = li.getAttribute('data-checked') === 'true';
          const checkbox = checked ? '[x]' : '[ ]';
          const text = Array.from(li.childNodes)
            .filter((c) => (c as HTMLElement).tagName?.toLowerCase() !== 'input')
            .map(processInline)
            .join('')
            .trim();
          return `- ${checkbox} ${text}`;
        }
        const text = Array.from(li.childNodes).map(processInline).join('').trim();
        return `- ${text}`;
      });
      return items.join('\n') + '\n\n';
    }
    case 'ol': {
      const counter = { n: 1 };
      const items = Array.from(el.children).map((li) => {
        const text = Array.from(li.childNodes).map(processInline).join('').trim();
        return `${counter.n++}. ${text}`;
      });
      return items.join('\n') + '\n\n';
    }
    case 'pre': {
      const codeEl = el.querySelector('code');
      const code = codeEl?.textContent || el.textContent || '';
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case 'hr':
      return '---\n\n';
    case 'li': {
      // Handled by parent ul/ol
      const text = Array.from(el.childNodes).map(processInline).join('').trim();
      if (listCounter) {
        return `${listCounter.n++}. ${text}`;
      }
      return `- ${text}`;
    }
    default:
      return processChildren(el);
  }
}

function processChildren(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .map((child) => processNode(child))
    .join('');
}

/**
 * Convert TipTap HTML to Markdown.
 * Returns a clean markdown string suitable for .md files.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const result = processChildren(doc.body);

  // Normalize: collapse 3+ consecutive newlines to 2, trim trailing whitespace
  return result.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
