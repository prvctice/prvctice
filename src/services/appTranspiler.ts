/**
 * App Transpiler Service
 *
 * Extracts inline <script> blocks from generated app HTML and runs them
 * through esbuild transform() with target es2016. This catches syntax
 * errors at generation time and normalizes post-ES2015 syntax (async/await,
 * optional chaining, nullish coalescing, class fields).
 *
 * Uses esbuild's async transform API to avoid blocking the Express event loop.
 */

import { transform } from 'esbuild';
import logger from '../utils/logger.js';

/**
 * Downlevel const/let to var. esbuild minimum target is es2015 which preserves
 * const/let. Since generated apps must be ES5, we do a simple token-level
 * replacement that handles the vast majority of LLM-generated code.
 */
function downlevelConstLet(code: string): string {
  // Replace const/let at statement boundaries (start of line, after ;, {, })
  // Avoid replacing inside string literals by using a simple heuristic:
  // only replace when preceded by line-start or statement-boundary characters
  return code.replace(/(?<=^|[;{}\n])\s*\b(const|let)\b(\s+)/gm, (match, keyword) => {
    return match.replace(keyword as string, 'var');
  });
}

// Match inline <script> tags (no src attribute). Non-greedy content capture.
// Handles <script>, <script type="text/javascript">, etc.
// Skips <script src="..."> tags (external scripts).
const INLINE_SCRIPT_REGEX =
  /<script(?:\s+(?!src\s*=)[^>]*)?>(?!.*bridge:hello)([\s\S]*?)<\/script>/gi;

/**
 * Transpile inline scripts in app HTML through esbuild es2016.
 *
 * - Extracts each inline <script> block
 * - Runs content through esbuild transform({ target: 'es2016' })
 * - Replaces original content with transpiled output
 * - On transpilation failure (syntax error in LLM code), logs a warning
 *   and leaves the original content unchanged
 *
 * @param html - The complete HTML string from app generation
 * @returns The HTML with inline scripts transpiled
 */
export async function transpileAppCode(html: string): Promise<string> {
  // Collect all matches first to process from last to first
  // (avoids offset corruption when replacing)
  interface ScriptMatch {
    readonly fullMatch: string;
    readonly content: string;
    readonly index: number;
  }

  const matches: ScriptMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset regex lastIndex for safety
  INLINE_SCRIPT_REGEX.lastIndex = 0;

  while ((match = INLINE_SCRIPT_REGEX.exec(html)) !== null) {
    const content = match[1] ?? '';
    if (!content.trim()) continue;

    matches.push({
      fullMatch: match[0],
      content,
      index: match.index,
    });
  }

  if (matches.length === 0) return html;

  // Process from last to first to preserve string indices
  let result = html;

  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    try {
      const transformed = await transform(m.content, {
        target: 'es2016',
        loader: 'js',
      });

      // Post-process: downlevel const/let to var (esbuild can't target es5)
      const downleveled = downlevelConstLet(transformed.code);

      // Replace only the script content (not the tags) within the full match
      const newFullMatch = m.fullMatch.replace(m.content, downleveled);
      result = result.slice(0, m.index) + newFullMatch + result.slice(m.index + m.fullMatch.length);

      if (transformed.warnings.length > 0) {
        logger.warn('transpile_warnings', {
          scriptIndex: i,
          warnings: transformed.warnings.map((w) => w.text),
        });
      }
    } catch (err: unknown) {
      // Transpilation failure = syntax error in LLM-generated code.
      // Log but don't block — the code may still work in the modern browser.
      logger.warn('transpile_warning', {
        scriptIndex: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
