/**
 * cli-pretty-errors
 * Clean, readable, and actionable terminal error formatting for Node.js.
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
 * Formats any error or thrown value into a clean, human-readable terminal string
 * without printing it to the console.
 *
 * Ideal for passing to custom loggers (Winston, Pino, Bunyan) or inspecting in tests.
 *
 * @param {unknown} error - Error instance, thrown primitive/object, or normalized error model.
 * @param {object} [options]
 * @param {boolean} [options.color] - Override terminal color output (defaults to auto-detected/NO_COLOR).
 * @param {number} [options.maxFrames=50] - Maximum stack frames to display.
 * @param {boolean} [options.stack=true] - Whether to include the stack trace section.
 * @param {boolean} [options.location=true] - Whether to include the primary source location line.
 * @param {boolean} [options.hints=true] - Whether to include actionable troubleshooting suggestions.
 * @param {boolean} [options.diagnostics=true] - Alias for options.hints.
 * @param {object} [options.theme] - Custom theme overrides (badgeBg, bulletUser, hintIcon, etc.).
 * @returns {string} Formatted terminal string.
 */
export function formatError(error, options = {}) {
  const validOptions = options && typeof options === 'object' ? options : {};
  const normalized = isNormalized(error) ? error : parseError(error, validOptions);
  return formatTerminal(normalized, validOptions);
}

/**
 * Formats any error or thrown value and writes it directly to stderr (or a custom stream).
 * Also returns the formatted string for convenience.
 *
 * Ideal for CLI applications, global error handlers, and interactive dev servers.
 *
 * @param {unknown} error - Error instance, thrown primitive/object, or normalized error model.
 * @param {object} [options]
 * @param {boolean} [options.color] - Override terminal color output (defaults to auto-detected/NO_COLOR).
 * @param {number} [options.maxFrames=50] - Maximum stack frames to display.
 * @param {boolean} [options.stack=true] - Whether to include the stack trace section.
 * @param {boolean} [options.location=true] - Whether to include the primary source location line.
 * @param {boolean} [options.hints=true] - Whether to include actionable troubleshooting suggestions.
 * @param {boolean} [options.diagnostics=true] - Alias for options.hints.
 * @param {object} [options.theme] - Custom theme overrides.
 * @param {boolean} [options.print=true] - Whether to write the formatted error to output.
 * @param {NodeJS.WritableStream} [options.stream=process.stderr] - Stream to write output to.
 * @returns {string} Formatted terminal string.
 */
export function prettyError(error, options = {}) {
  const validOptions = options && typeof options === 'object' ? options : {};
  const formatted = formatError(error, validOptions);

  if (validOptions.print !== false) {
    const stream = validOptions.stream || process.stderr;
    try {
      if (typeof stream?.write === 'function') {
        stream.write(`${formatted}\n`);
      } else {
        console.error(formatted);
      }
    } catch {
      // Silently catch to prevent crashing during error handling (e.g. EPIPE on process.stderr)
    }
  }

  return formatted;
}

// Low-level modular exports for advanced or specialized usage
export { parseError } from './parser/index.js';
export { parseStackTrace, parseStackFrame } from './parser/stack.js';
export { isSystemError, extractSystemInfo } from './parser/system.js';
export { formatTerminal } from './formatters/terminal.js';
export {
  getDiagnostic,
  registerDiagnosticRule,
  resetDiagnosticRules,
  getAllDiagnosticRules
} from './hints/index.js';
