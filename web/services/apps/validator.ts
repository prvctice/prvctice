/**
 * Static Code Validator
 *
 * Analyzes app HTML for forbidden patterns before sandbox execution.
 * This is a defense-in-depth complement to CSP -- catches dangerous
 * code before it ever reaches the iframe.
 *
 * The validator checks raw app HTML BEFORE SDK injection. The SDK
 * itself uses window.parent.postMessage which would match some
 * patterns, but the SDK is injected separately by buildSrcdoc.
 */

import type { ValidationResult } from '@web/types/apps';

interface ForbiddenPattern {
  readonly pattern: RegExp;
  readonly description: string;
}

export const FORBIDDEN_PATTERNS: readonly ForbiddenPattern[] = [
  { pattern: /\beval\s*\(/, description: 'eval() is forbidden' },
  { pattern: /new\s+Function\s*\(/, description: 'new Function() is forbidden' },
  { pattern: /\bimport\s*\(/, description: 'Dynamic import() is forbidden' },
  { pattern: /\bimportScripts\s*\(/, description: 'importScripts() is forbidden' },
  { pattern: /document\.cookie/, description: 'Cookie access is forbidden' },
  { pattern: /window\.open\s*\(/, description: 'window.open() is forbidden' },
  {
    pattern: /window\.parent(?!\s*\.postMessage)/,
    description: 'Parent access (except postMessage) is forbidden',
  },
  { pattern: /window\.top\b/, description: 'Top frame access is forbidden' },
  { pattern: /parent\.document/, description: 'parent.document access is forbidden' },
  { pattern: /navigator\.sendBeacon/, description: 'sendBeacon is forbidden' },
  { pattern: /\.contentWindow/, description: 'contentWindow access is forbidden' },
  { pattern: /\.contentDocument/, description: 'contentDocument access is forbidden' },
] as const;

const CSP_OVERRIDE_PATTERN = /<meta[^>]*content-security-policy/i;

/**
 * Validate app HTML for forbidden patterns.
 *
 * Returns a ValidationResult with a list of violations found.
 * Clean HTML returns { valid: true, violations: [] }.
 *
 * Pure function -- no side effects.
 */
export function validateAppCode(html: string): ValidationResult {
  const violations: string[] = [];

  for (const { pattern, description } of FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) {
      violations.push(description);
    }
  }

  if (CSP_OVERRIDE_PATTERN.test(html)) {
    violations.push('CSP meta tag override is forbidden');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
