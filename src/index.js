/**
 * Entry point for cli-pretty-errors.
 */

import { parseError } from './parser/index.js';
import { formatTerminal } from './formatters/terminal.js';

/**
 * Checks if a value is already a normalized error model from parseError.
 *
 * @param {unknown} val
 * @returns {boolean}
 */
function isNormalized(val) {
  return (
    val !== null &&
    typeof val === 'object' &&
    typeof val.category === 'string' &&
    Array.isArray(val.frames) &&
    typeof val.origin === 'object' &&
    'customProperties' in val
  );
}

/**
 * Formats any thrown value or error into a clean, human-readable terminal output
 * with actionable troubleshooting diagnostics.
 *
 * @param {unknown} error - Error instance, thrown value, or normalized error model.
 * @param {object} [options]
 * @param {boolean} [options.color] - Override terminal color output (true/false).
 * @param {number} [options.maxFrames=50] - Maximum stack frames to display.
 * @param {boolean} [options.hints=true] - Whether to display troubleshooting diagnostics.
 * @param {boolean} [options.diagnostics=true] - Alias for options.hints.
 * @returns {string} Formatted terminal string.
 */
export function prettyError(error, options = {}) {
  const normalized = isNormalized(error) ? error : parseError(error, options);
  return formatTerminal(normalized, options);
}

// Alias for convenience
export const formatError = prettyError;

// Re-export modular components for advanced or low-level usage
export { parseError } from './parser/index.js';
export { parseStackTrace, parseStackFrame } from './parser/stack.js';
export { isSystemError, extractSystemInfo } from './parser/system.js';
export { formatTerminal } from './formatters/terminal.js';
export { getDiagnostic, registerDiagnosticRule, resetDiagnosticRules, getAllDiagnosticRules } from './hints/index.js';
