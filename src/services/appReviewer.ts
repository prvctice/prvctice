/**
 * App Quality Gate — deterministic code-based validation for generated widgets.
 * No LLM call. Runs in <50ms. Checks for SDK correctness, ES5 compliance,
 * design anti-patterns, and security violations.
 */

import { getValidNamespaces } from '../contracts/sdk-surface.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewResult {
  readonly pass: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ComplianceScore {
  readonly score: number; // 0-100
  readonly pass: boolean; // score >= threshold
  readonly errors: readonly string[]; // hard-fail and deduction issues
  readonly warnings: readonly string[]; // cosmetic issues
  readonly breakdown: {
    readonly tokenCompliance: number; // 0-40
    readonly structureAdherence: number; // 0-35
    readonly contentDensity: number; // 0-25
  };
}

// ---------------------------------------------------------------------------
// Valid prvctice.* method whitelist — derived from contract schema
// ---------------------------------------------------------------------------

const VALID_NAMESPACES: ReadonlySet<string> = getValidNamespaces();

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function extractScriptContent(html: string): string {
  const scripts: string[] = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match = scriptRegex.exec(html);
  while (match !== null) {
    if (match[1]) scripts.push(match[1]);
    match = scriptRegex.exec(html);
  }
  return scripts.join('\n');
}

function checkErrors(html: string, scriptContent: string): string[] {
  const errors: string[] = [];

  // 1. Missing prvctice.onReady wrapper
  if (scriptContent.trim().length > 0 && !scriptContent.includes('prvctice.onReady')) {
    errors.push('Missing prvctice.onReady() wrapper — all JS must be inside onReady callback');
  }

  // 2. ES5 violations: const, let, arrow functions
  // Check for const/let at statement boundaries (not inside strings or comments)
  const constLetRegex = /(?:^|[;{}\n])\s*(?:const|let)\s+/m;
  if (constLetRegex.test(scriptContent)) {
    errors.push('ES5 violation: uses const/let — must use var for all declarations');
  }

  // Arrow functions: => preceded by ) or word char (catches both (x) => and x =>)
  const arrowRegex = /(?:\)|\w)\s*=>/;
  if (arrowRegex.test(scriptContent)) {
    errors.push('ES5 violation: uses arrow functions — must use function() {}');
  }

  // Template literals
  if (/`[^`]*\$\{/.test(scriptContent)) {
    errors.push('ES5 violation: uses template literals — must use string concatenation');
  }

  // 3. Non-existent prvctice.* methods
  const methodCallRegex = /prvctice\.(\w+)\.(\w+)/g;
  let methodMatch = methodCallRegex.exec(scriptContent);
  while (methodMatch !== null) {
    const ns = methodMatch[1] ?? '';
    const method = methodMatch[2] ?? '';
    const fullMethod = `prvctice.${ns}.${method}`;
    // Skip internal callbacks (like media._audioCallbacks)
    if (!method.startsWith('_') && !VALID_NAMESPACES.has(fullMethod)) {
      errors.push(`Unknown SDK method: ${fullMethod} — check the API reference`);
    }
    methodMatch = methodCallRegex.exec(scriptContent);
  }

  // 4. Security violations
  if (/\beval\s*\(/.test(scriptContent)) {
    errors.push('Security violation: eval() is forbidden');
  }
  if (/\bnew\s+Function\s*\(/.test(scriptContent)) {
    errors.push('Security violation: new Function() is forbidden');
  }
  if (/(?<!\.)fetch\s*\(/.test(scriptContent) && !scriptContent.includes('prvctice.web.fetch')) {
    // Only flag if using raw fetch, not prvctice.web.fetch
    if (/[^.]fetch\s*\(/.test(scriptContent) || /^fetch\s*\(/m.test(scriptContent)) {
      errors.push('Security violation: direct fetch() is forbidden — use prvctice.web.fetch()');
    }
  }
  if (/window\.parent(?!\s*\.postMessage)/.test(scriptContent)) {
    errors.push('Security violation: window.parent access is forbidden (except through SDK)');
  }

  // 5. No HTML content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = (bodyMatch[1] ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').trim();
    if (bodyContent.length === 0) {
      errors.push('No HTML content — body contains only script tags');
    }
  } else if (!html.includes('<body')) {
    errors.push('No <body> element found');
  }

  return errors;
}

function checkWarnings(html: string, scriptContent: string): string[] {
  const warnings: string[] = [];

  // 1. Starts with heading (header bar anti-pattern)
  const bodyMatch = html.match(/<body[^>]*>\s*([\s\S]*?)(?:<script|$)/i);
  if (bodyMatch) {
    const firstContent = (bodyMatch[1] ?? '').trim();
    if (/^<h[1-6]\b/i.test(firstContent)) {
      warnings.push('Anti-pattern: starts with <h1>-<h6> — widgets should not have header bars');
    }
  }

  // 2. Raw flex/grid instead of p-* classes
  if (/display\s*:\s*flex\b/.test(html) && !html.includes('p-stack') && !html.includes('p-row')) {
    warnings.push('Uses raw display:flex — prefer p-stack, p-row, p-split classes');
  }
  if (/display\s*:\s*grid\b/.test(html) && !html.includes('p-grid')) {
    warnings.push('Uses raw display:grid — prefer p-grid classes');
  }

  // 3. Hardcoded hex colors (skip CSS custom property definitions)
  const styleBlocks = html.match(/style="[^"]*"/g) || [];
  const inlineStyles = stripCustomPropertyDefinitions(styleBlocks.join(' '));
  if (/#[0-9a-fA-F]{3,8}\b/.test(inlineStyles)) {
    warnings.push('Hardcoded hex colors in inline styles — use var(--p-*) tokens');
  }

  // 4. Missing error handling on connector calls
  const connectorCalls = [
    'prvctice.weather',
    'prvctice.news',
    'prvctice.sports',
    'prvctice.markets',
    'prvctice.wikipedia',
    'prvctice.books',
    'prvctice.academic',
    'prvctice.movies',
    'prvctice.music',
    'prvctice.youtube',
    'prvctice.art',
    'prvctice.ai',
    'prvctice.web.fetch',
    'prvctice.media.playAudio',
    'prvctice.media.loadImage',
    'prvctice.media.startMicrophone',
    'prvctice.media.stopMicrophone',
    'prvctice.europeana',
    'prvctice.smithsonian',
    'prvctice.loc',
    'prvctice.googleBooks',
    'prvctice.location.geocode',
    'prvctice.location.reverseGeocode',
    'prvctice.films',
    'prvctice.vision',
    'prvctice.mediaTools',
    'prvctice.camera.start',
    'prvctice.camera.capture',
    'prvctice.camera.stop',
    'prvctice.video.load',
    'prvctice.video.seekAndCapture',
    'prvctice.gif.create',
    'prvctice.gif.addFrame',
    'prvctice.gif.finish',
  ];
  const hasConnectorCall = connectorCalls.some(function (c) {
    return scriptContent.includes(c);
  });
  if (hasConnectorCall && !scriptContent.includes('.catch')) {
    warnings.push('Missing .catch() on connector calls — add error handling');
  }

  // 5. innerHTML without escaping
  if (/\.innerHTML\s*=/.test(scriptContent) && !scriptContent.includes('textContent')) {
    warnings.push('Uses innerHTML without apparent escaping — consider textContent for user data');
  }

  // 6. document.write
  if (/document\.write\s*\(/.test(scriptContent)) {
    warnings.push('Uses document.write — manipulate DOM directly instead');
  }

  // 7. External asset URLs (blocked by sandbox CSP: img-src data: blob:, connect-src 'none')
  const htmlNoScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  if (/\bsrc\s*=\s*["']https?:\/\//i.test(htmlNoScript)) {
    warnings.push(
      'External URL in src attribute — sandbox CSP blocks remote assets; use prvctice.media.loadImage() or data: URIs'
    );
  }
  if (/\bhref\s*=\s*["']https?:\/\/[^"]*\.css/i.test(htmlNoScript)) {
    warnings.push(
      'External CSS in href — sandbox CSP blocks remote stylesheets; use inline <style> or UIKit classes'
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Hex colors that are allowed on color-accent archetype. */
const HEX_ALLOWLIST: ReadonlySet<string> = new Set([
  '#fff',
  '#ffffff',
  '#000',
  '#000000',
  '#FFF',
  '#FFFFFF',
  '#000',
  '#000000',
]);

interface DimensionResult {
  readonly points: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Extract CSS-context text: inline style="" values and <style> block content.
 * Excludes <script> content entirely.
 */
function extractCssContexts(html: string): string {
  const contexts: string[] = [];

  // Inline style attributes
  const styleAttrRegex = /style="([^"]*)"/gi;
  let attrMatch = styleAttrRegex.exec(html);
  while (attrMatch !== null) {
    if (attrMatch[1]) contexts.push(attrMatch[1]);
    attrMatch = styleAttrRegex.exec(html);
  }

  // <style> block content
  const styleBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let blockMatch = styleBlockRegex.exec(html);
  while (blockMatch !== null) {
    if (blockMatch[1]) contexts.push(blockMatch[1]);
    blockMatch = styleBlockRegex.exec(html);
  }

  return contexts.join('\n');
}

/**
 * Strip CSS custom property definitions from extracted CSS text.
 * Definitions like `--prvctice-primary: #0076c0;` legitimately use raw color
 * values (they define theme variables). Only color _usage_ should be flagged.
 */
function stripCustomPropertyDefinitions(css: string): string {
  return css.replace(/--[\w-]+\s*:\s*[^;]+;?/g, '');
}

/**
 * Token Compliance (40 points).
 * Checks for hardcoded colors in CSS contexts only.
 */
function scoreTokenCompliance(html: string, expectedArchetype?: string): DimensionResult {
  let points = 40;
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawCssText = extractCssContexts(html);
  // Strip CSS custom property definitions — they define theme vars with raw colors
  const cssText = stripCustomPropertyDefinitions(rawCssText);
  const isColorAccent = expectedArchetype === 'color-accent';

  // Hardcoded hex colors in CSS contexts
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
  let hexMatch = hexRegex.exec(cssText);
  let hasHardcodedHex = false;
  while (hexMatch !== null) {
    const hexValue = hexMatch[0];
    // Allow known safe values on color-accent archetype
    if (isColorAccent && HEX_ALLOWLIST.has(hexValue)) {
      hexMatch = hexRegex.exec(cssText);
      continue;
    }
    // Skip display:none style values that look like hex (e.g., in "display:none")
    // The regex only matches real hex patterns so this is safe
    hasHardcodedHex = true;
    hexMatch = hexRegex.exec(cssText);
  }

  if (hasHardcodedHex) {
    points = 0;
    errors.push('Hardcoded hex color in CSS — use var(--p-*) design tokens');
  }

  // Hardcoded rgb/rgba in CSS contexts
  const rgbRegex = /\brgba?\s*\(\s*\d/gi;
  if (rgbRegex.test(cssText)) {
    points = 0;
    errors.push('Hardcoded rgb/rgba color in CSS — use var(--p-*) design tokens');
  }

  return { points, errors, warnings };
}

/**
 * Structure Adherence (35 points).
 * Checks structural correctness: onReady, ES5, security, error states, headers, catch.
 */
function scoreStructureAdherence(html: string, scriptContent: string): DimensionResult {
  let points = 35;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Hard-fail checks (each sets points to 0 and is also tracked in checkHardFails)
  // We track them here for the breakdown but the hard-fail aggregation zeros the total.

  // Missing prvctice.onReady
  if (scriptContent.trim().length > 0 && !scriptContent.includes('prvctice.onReady')) {
    points = 0;
    errors.push('Missing prvctice.onReady() wrapper');
  }

  // ES5 violations
  const constLetRegex = /(?:^|[;{}\n])\s*(?:const|let)\s+/m;
  if (constLetRegex.test(scriptContent)) {
    points = 0;
    errors.push('ES5 violation: uses const/let');
  }
  const arrowRegex = /(?:\)|\w)\s*=>/;
  if (arrowRegex.test(scriptContent)) {
    points = 0;
    errors.push('ES5 violation: uses arrow functions');
  }
  if (/`[^`]*\$\{/.test(scriptContent)) {
    points = 0;
    errors.push('ES5 violation: uses template literals');
  }

  // Security violations
  if (/\beval\s*\(/.test(scriptContent)) {
    points = 0;
    errors.push('Security violation: eval() is forbidden');
  }
  if (/\bnew\s+Function\s*\(/.test(scriptContent)) {
    points = 0;
    errors.push('Security violation: new Function() is forbidden');
  }
  if (/(?<!\.)fetch\s*\(/.test(scriptContent) && !scriptContent.includes('prvctice.web.fetch')) {
    if (/[^.]fetch\s*\(/.test(scriptContent) || /^fetch\s*\(/m.test(scriptContent)) {
      points = 0;
      errors.push('Security violation: direct fetch() is forbidden');
    }
  }

  // No HTML content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = (bodyMatch[1] ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').trim();
    if (bodyContent.length === 0) {
      points = 0;
      errors.push('No HTML content — body contains only script tags');
    }
  } else if (!html.includes('<body')) {
    points = 0;
    errors.push('No <body> element found');
  }

  // Non-hard-fail deductions (only if we haven't already zeroed)
  if (points > 0) {
    // Missing error state container
    if (!html.includes('id="errorState"') && !html.includes("id='errorState'")) {
      points = Math.max(0, points - 10);
      warnings.push('Missing error state container (id="errorState")');
    }

    // Header anti-pattern
    const bodyFirstMatch = html.match(/<body[^>]*>\s*([\s\S]*?)(?:<script|$)/i);
    if (bodyFirstMatch) {
      const firstContent = (bodyFirstMatch[1] ?? '').trim();
      if (/^<h[1-6]\b/i.test(firstContent)) {
        points = Math.max(0, points - 10);
        warnings.push('Anti-pattern: starts with <h1>-<h6> header');
      }
    }

    // Missing .catch() on connector calls
    const connectorCalls = [
      'prvctice.weather',
      'prvctice.news',
      'prvctice.sports',
      'prvctice.markets',
      'prvctice.wikipedia',
      'prvctice.books',
      'prvctice.academic',
      'prvctice.movies',
      'prvctice.music',
      'prvctice.youtube',
      'prvctice.art',
      'prvctice.ai',
      'prvctice.web.fetch',
      'prvctice.media.playAudio',
      'prvctice.media.loadImage',
      'prvctice.media.startMicrophone',
      'prvctice.media.stopMicrophone',
      'prvctice.europeana',
      'prvctice.smithsonian',
      'prvctice.loc',
      'prvctice.googleBooks',
      'prvctice.location.geocode',
      'prvctice.location.reverseGeocode',
      'prvctice.films',
      'prvctice.vision',
      'prvctice.mediaTools',
      'prvctice.camera.start',
      'prvctice.camera.capture',
      'prvctice.camera.stop',
      'prvctice.video.load',
      'prvctice.video.seekAndCapture',
      'prvctice.gif.create',
      'prvctice.gif.addFrame',
      'prvctice.gif.finish',
    ];
    const hasConnectorCall = connectorCalls.some(function (c) {
      return scriptContent.includes(c);
    });
    if (hasConnectorCall && !scriptContent.includes('.catch')) {
      points = Math.max(0, points - 5);
      warnings.push('Missing .catch() on connector calls');
    }

    // External asset URLs (blocked by sandbox CSP)
    const htmlNoScriptS = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    if (/\bsrc\s*=\s*["']https?:\/\//i.test(htmlNoScriptS)) {
      points = Math.max(0, points - 5);
      warnings.push('External URL in src attribute — blocked by sandbox CSP');
    }
  }

  return { points, errors, warnings };
}

/**
 * Content Density (25 points).
 * Checks text hierarchy, hero presence, data density.
 */
function scoreContentDensity(html: string, expectedArchetype?: string): DimensionResult {
  let points = 25;
  const warnings: string[] = [];

  // Strip script content from HTML for content analysis
  const htmlNoScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Hero element check: look for large text indicators
  const hasHeroElement =
    /p-stat-value|text-3xl|text-4xl|font-size\s*:\s*var\(--p-text-[34]xl\)/i.test(htmlNoScript);
  const heroArchetypes = new Set(['hero-stat', 'viz']);
  if (expectedArchetype && heroArchetypes.has(expectedArchetype) && !hasHeroElement) {
    points = Math.max(0, points - 8);
    warnings.push(
      'No hero element on ' +
        expectedArchetype +
        ' archetype — expected large text (text-3xl/4xl or p-stat-value)'
    );
  }

  // Text hierarchy check: needs variation in text sizing/weight
  const hasTextVariation =
    /font-bold|font-semibold|p-stat-value|p-label-tech|text-xl|text-2xl|text-3xl|text-4xl|text-lg/i.test(
      htmlNoScript
    ) || /font-size\s*:\s*var\(--p-text-/i.test(htmlNoScript);
  if (!hasTextVariation) {
    points = Math.max(0, points - 8);
    warnings.push(
      'Same-size text throughout — add text hierarchy (font-bold, p-label-tech, varying sizes)'
    );
  }

  return { points, errors: [], warnings };
}

/**
 * Aggregate hard-fail conditions. Any hard fail zeros the total score.
 */
function hasHardFails(tokenResult: DimensionResult, structureResult: DimensionResult): boolean {
  // Token errors are always hard fails (hex/rgb in CSS)
  if (tokenResult.errors.length > 0) return true;
  // Structure errors that zero points are hard fails
  if (structureResult.points === 0 && structureResult.errors.length > 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Numeric compliance scoring for generated widget HTML.
 * Returns 0-100 score with breakdown across three dimensions:
 * token compliance (40), structure adherence (35), content density (25).
 *
 * Hard fails (hex colors in CSS, missing onReady, ES5 violations, security) zero the score.
 * Default threshold: 80 (per user decision).
 */
export function scoreCompliance(
  html: string,
  expectedArchetype?: string,
  threshold: number = 80
): ComplianceScore {
  const scriptContent = extractScriptContent(html);

  const tokenResult = scoreTokenCompliance(html, expectedArchetype);
  const structureResult = scoreStructureAdherence(html, scriptContent);
  const densityResult = scoreContentDensity(html, expectedArchetype);

  const isHardFail = hasHardFails(tokenResult, structureResult);
  const rawScore = tokenResult.points + structureResult.points + densityResult.points;
  const totalScore = isHardFail ? 0 : rawScore;

  const allErrors = [...tokenResult.errors, ...structureResult.errors];
  const allWarnings = [
    ...tokenResult.warnings,
    ...structureResult.warnings,
    ...densityResult.warnings,
  ];

  return {
    score: totalScore,
    pass: totalScore >= threshold && !isHardFail,
    errors: allErrors,
    warnings: allWarnings,
    breakdown: {
      tokenCompliance: isHardFail && tokenResult.errors.length > 0 ? 0 : tokenResult.points,
      structureAdherence:
        isHardFail && structureResult.errors.length > 0 ? 0 : structureResult.points,
      contentDensity: densityResult.points,
    },
  };
}

export function reviewApp(html: string): ReviewResult {
  const scriptContent = extractScriptContent(html);
  const errors = checkErrors(html, scriptContent);
  const warnings = checkWarnings(html, scriptContent);

  return {
    pass: errors.length === 0,
    errors,
    warnings,
  };
}
