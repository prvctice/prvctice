import { type ShallowRef } from 'vue';
import { useEditor, type Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { MarkdownShortcuts } from '@web/extensions/MarkdownShortcuts.js';

interface UseNotesEditorOptions {
  placeholder?: string;
  onUpdate?: (html: string) => void;
  onSelectionUpdate?: () => void;
  onBlur?: () => void;
}

interface UseNotesEditorReturn {
  editor: ShallowRef<Editor | undefined>;
  createEditor: (content?: string) => Editor | undefined;
  setContent: (html: string) => void;
  getHTML: () => string;
  getText: () => string;
  focus: () => void;
  insertHTML: (html: string) => boolean;
  appendHTML: (html: string) => boolean;
  toggleHeading: (level?: 1 | 2) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleTaskList: () => void;
  toggleCodeBlock: () => void;
  setHorizontalRule: () => void;
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
}

/**
 * TipTap editor composable for notes
 *
 * Uses TipTap's useEditor for proper Vue 3 integration
 */
export function useNotesEditor(options: UseNotesEditorOptions = {}): UseNotesEditorReturn {
  // Store callbacks
  const onUpdateCallback = options.onUpdate || (() => {});
  const onSelectionUpdateCallback = options.onSelectionUpdate || (() => {});
  const onBlurCallback = options.onBlur || (() => {});

  // Use TipTap's useEditor for proper Vue integration
  const editor = useEditor({
    content: '',
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Placeholder.configure({
        placeholder: options.placeholder || 'Type notes here...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      MarkdownShortcuts,
    ],
    editorProps: {
      attributes: {
        class: 'notes-editor-content',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onUpdateCallback(ed.getHTML());
    },
    onSelectionUpdate: () => {
      onSelectionUpdateCallback();
    },
    onBlur: () => {
      onBlurCallback();
    },
  });

  /**
   * Initialize editor with content (call after mount)
   */
  function createEditor(content: string = ''): Editor | undefined {
    if (editor.value) {
      editor.value.commands.setContent(content || '', { emitUpdate: false });
    }
    return editor.value;
  }

  /**
   * Set editor content
   */
  function setContent(html: string): void {
    if (editor.value) {
      editor.value.commands.setContent(html || '', { emitUpdate: false });
    }
  }

  /**
   * Get editor HTML content
   */
  function getHTML(): string {
    return editor.value?.getHTML() || '';
  }

  /**
   * Get editor plain text content
   */
  function getText(): string {
    return editor.value?.getText() || '';
  }

  /**
   * Focus the editor
   */
  function focus(): void {
    editor.value?.commands.focus();
  }

  /**
   * Insert HTML at current position or end
   */
  function insertHTML(html: string): boolean {
    if (!editor.value) return false;
    try {
      editor.value.commands.insertContent(html);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Append HTML to the end of the document
   */
  function appendHTML(html: string): boolean {
    if (!editor.value) return false;
    try {
      editor.value.chain().focus('end').insertContent(html).run();
      return true;
    } catch {
      return false;
    }
  }

  // Toolbar commands
  function toggleHeading(level: 1 | 2 = 1): void {
    editor.value?.chain().focus().toggleHeading({ level }).run();
  }

  function toggleBold(): void {
    editor.value?.chain().focus().toggleBold().run();
  }

  function toggleItalic(): void {
    editor.value?.chain().focus().toggleItalic().run();
  }

  function toggleUnderline(): void {
    editor.value?.chain().focus().toggleUnderline().run();
  }

  function toggleStrike(): void {
    editor.value?.chain().focus().toggleStrike().run();
  }

  function toggleBulletList(): void {
    editor.value?.chain().focus().toggleBulletList().run();
  }

  function toggleOrderedList(): void {
    editor.value?.chain().focus().toggleOrderedList().run();
  }

  function toggleTaskList(): void {
    editor.value?.chain().focus().toggleTaskList().run();
  }

  function toggleCodeBlock(): void {
    editor.value?.chain().focus().toggleCodeBlock().run();
  }

  function setHorizontalRule(): void {
    editor.value?.chain().focus().setHorizontalRule().run();
  }

  // Check if format is active
  function isActive(name: string, attrs: Record<string, unknown> = {}): boolean {
    return editor.value?.isActive(name, attrs) || false;
  }

  return {
    editor,
    createEditor,
    setContent,
    getHTML,
    getText,
    focus,
    insertHTML,
    appendHTML,
    // Toolbar commands
    toggleHeading,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrike,
    toggleBulletList,
    toggleOrderedList,
    toggleTaskList,
    toggleCodeBlock,
    setHorizontalRule,
    isActive,
  };
}
