import { Extension } from '@tiptap/core';

/**
 * Custom TipTap extension for Notion-like markdown shortcuts
 *
 * Note: Bullet list (`- `) and ordered list (`1. `) are already
 * provided by StarterKit, along with basic heading shortcuts.
 *
 * Task list shortcuts ([] ) can be added later once basic editing works.
 */
export const MarkdownShortcuts = Extension.create({
  name: 'markdownShortcuts',

  // Temporarily empty - StarterKit already provides most shortcuts
  addInputRules() {
    return [];
  },
});
