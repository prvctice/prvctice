/**
 * App Generation Debug Logger
 *
 * Writes a detailed, human-readable log of every app generation attempt
 * to `logs/app-gen-debug.log`. Cleared at the start of each generation
 * so the file always shows the latest attempt.
 *
 * Usage: `tail -f logs/app-gen-debug.log` in a terminal while generating.
 */

import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_DIR = resolve(__dirname, '../../logs');
const LOG_FILE = resolve(LOG_DIR, 'app-gen-debug.log');

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

/** Clear the log and start a new generation session. */
export function startSession(label: string): void {
  ensureDir();
  const header = [
    '═'.repeat(80),
    `  APP GENERATION DEBUG LOG — ${label}`,
    `  Started: ${timestamp()}`,
    '═'.repeat(80),
    '',
  ].join('\n');
  writeFileSync(LOG_FILE, header);
}

/** Append a titled section to the debug log. */
export function logSection(title: string, content: string): void {
  const section = [
    '',
    `── ${title} ${'─'.repeat(Math.max(1, 74 - title.length))}`,
    `   [${timestamp()}]`,
    '',
    content,
    '',
  ].join('\n');
  try {
    appendFileSync(LOG_FILE, section);
  } catch {
    // Don't let debug logging break the pipeline
  }
}

/** Log a key-value summary block. */
export function logSummary(title: string, data: Record<string, unknown>): void {
  const lines = Object.entries(data).map(function ([k, v]) {
    const valStr = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    return `  ${k}: ${valStr}`;
  });
  logSection(title, lines.join('\n'));
}

/** Log raw text content (like LLM responses). */
export function logRaw(title: string, text: string): void {
  logSection(title, text);
}

/** Log an error with context. */
export function logError(title: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logSection(title + ' [ERROR]', msg + (stack ? '\n\nStack:\n' + stack : ''));
}

/** Log the final result. */
export function logResult(passed: boolean, details: string): void {
  const icon = passed ? 'PASSED' : 'FAILED';
  const section = [
    '',
    '═'.repeat(80),
    `  RESULT: ${icon}`,
    `  Finished: ${timestamp()}`,
    '═'.repeat(80),
    '',
    details,
    '',
  ].join('\n');
  try {
    appendFileSync(LOG_FILE, section);
  } catch {
    // Don't let debug logging break the pipeline
  }
}

export function getLogPath(): string {
  return LOG_FILE;
}
