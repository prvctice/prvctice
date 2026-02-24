/**
 * Template Assembler — deterministic HTML assembly.
 *
 * Takes a template skeleton, slot fills, JS script, and optional CSS
 * and produces a complete self-contained HTML document.
 * The LLM provides slot content + script; this module owns the structure.
 */

import type { ArchetypeTemplate } from '../templates/types.js';

// ---------------------------------------------------------------------------
// Size presets (maps sizePreset string to window dimensions)
// ---------------------------------------------------------------------------

const SIZE_PRESETS: Readonly<Record<string, { width: number; height: number }>> = {
  compact: { width: 280, height: 220 },
  standard: { width: 340, height: 300 },
  wide: { width: 420, height: 260 },
  tall: { width: 300, height: 420 },
  large: { width: 420, height: 420 },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AssemblyInput {
  readonly template: ArchetypeTemplate;
  readonly slots: Readonly<Record<string, string>>;
  readonly script: string;
  readonly style?: string;
}

export interface AssembledWidget {
  readonly html: string;
  readonly window: { readonly width: number; readonly height: number };
}

/**
 * Assemble a complete HTML document from template + slot fills + script.
 *
 * - Replaces `{{SLOT_NAME}}` markers with LLM-provided fills
 * - Uses `defaultContent` for missing required slots
 * - Wraps script in `prvctice.onReady(function() { ... })`
 * - Produces `<!DOCTYPE html><html>…</html>`
 */
export function assembleWidget(input: AssemblyInput): AssembledWidget {
  const { template, slots, script, style } = input;

  // Fill slots in skeleton
  let body = template.skeleton;
  for (let i = 0; i < template.slots.length; i++) {
    const slot = template.slots[i]!;
    const marker = '{{' + slot.name + '}}';
    const fill = slots[slot.name];
    if (fill !== undefined && fill !== '') {
      body = body.split(marker).join(fill);
    } else {
      body = body.split(marker).join(slot.defaultContent);
    }
  }

  // Build <head>
  const headParts = ['<head><meta charset="utf-8">'];
  if (style) {
    headParts.push('<style>' + style + '</style>');
  }
  headParts.push('</head>');

  // Wrap script in onReady if not already wrapped
  let wrappedScript = script.trim();
  if (wrappedScript.length > 0 && !wrappedScript.includes('prvctice.onReady')) {
    wrappedScript = 'prvctice.onReady(function() {\n' + wrappedScript + '\n});';
  }

  // Assemble full document
  const html =
    '<!DOCTYPE html>\n<html>\n' +
    headParts.join('\n') +
    '\n' +
    body +
    '\n' +
    (wrappedScript.length > 0 ? '<script>\n' + wrappedScript + '\n</script>\n' : '') +
    '</html>';

  // Resolve window size
  const preset = SIZE_PRESETS[template.sizePreset];
  const windowSize = preset || SIZE_PRESETS.standard!;

  return { html, window: windowSize };
}
