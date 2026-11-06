/**
 * Parses and filters raw stack traces into structured frames.
 * Distinguishes user code, dependencies (node_modules), and Node.js internals.
 */

import { fileURLToPath } from 'node:url';

/**
 * Normalizes a file path or URL string.
 *
 * @param {string} file
 * @returns {string}
 */
function normalizeFilePath(file) {
  if (!file) return null;
  if (file.startsWith('file://')) {
    try {
      return fileURLToPath(file);
    } catch {
      return file;
    }
  }
  return file;
}

/**
 * Determines whether a file path points to Node.js internals.
 *
 * @param {string|null} file
 * @returns {boolean}
 */
function checkIsInternal(file) {
  if (!file) return false;
  if (file.startsWith('node:')) return true;
  if (file.startsWith('internal/') || file.includes('/internal/') || file.includes('\\internal\\')) return true;
  // Pre-node: prefix builtins like "events.js:12:34" or "fs.js"
  if (!file.includes('/') && !file.includes('\\') && file.endsWith('.js')) return true;
  return false;
}

/**
 * Determines whether a file path points to third-party node_modules.
 *
 * @param {string|null} file
 * @returns {boolean}
 */
function checkIsNodeModules(file) {
  if (!file) return false;
  return file.includes('/node_modules/') || file.includes('\\node_modules\\');
}

/**
 * Parses a single stack line into a structured frame object.
 * Returns null if the line is not a valid stack frame line.
 *
 * @param {string} line
 * @returns {object|null}
 */
export function parseStackFrame(line) {
  if (typeof line !== 'string') {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed.startsWith('at ')) {
    return null;
  }

  // Remove leading 'at '
  const content = trimmed.slice(3).trim();

  let callee = null;
  let rawLocation = '';

  // Case 1: "callee (location)" e.g. "async fetchUser (/app/user.js:24:10)"
  // Location is always enclosed in the outermost trailing parentheses
  const parenMatch = content.match(/^(?:(async|new)\s+)?(.*?)\s*\((.*)\)$/);

  if (parenMatch) {
    const modifier = parenMatch[1] ? `${parenMatch[1]} ` : '';
    callee = `${modifier}${parenMatch[2]}`.trim() || null;
    rawLocation = parenMatch[3].trim();
  } else {
    // Case 2: Location directly, e.g. "async /app/user.js:24:10" or "/app/user.js:24:10"
    const noParenMatch = content.match(/^(?:(async|new)\s+)?(.*)$/);
    if (noParenMatch) {
      if (noParenMatch[1]) {
        callee = noParenMatch[1];
      }
      rawLocation = noParenMatch[2].trim();
    }
  }

  if (!rawLocation) {
    return {
      raw: line,
      callee,
      file: null,
      line: null,
      column: null,
      isNative: false,
      isInternal: false,
      isNodeModules: false,
      isUserCode: false
    };
  }

  // Check for native or special frames
  const isNative = rawLocation === 'native' || rawLocation === '[native code]' || (callee ? callee.includes('[native code]') : false);
  const isAnonymous = rawLocation === '<anonymous>';

  if (isNative) {
    return {
      raw: line,
      callee,
      file: null,
      line: null,
      column: null,
      isNative: true,
      isInternal: false,
      isNodeModules: false,
      isUserCode: false
    };
  }

  if (isAnonymous) {
    return {
      raw: line,
      callee,
      file: '<anonymous>',
      line: null,
      column: null,
      isNative: false,
      isInternal: false,
      isNodeModules: false,
      isUserCode: false
    };
  }

  // Parse path:line:col
  // Notice path could contain drive letters like C:\path\file.js:10:5
  const locMatch = rawLocation.match(/^(.*?):(\d+)(?::(\d+))?$/);

  let file = null;
  let lineNum = null;
  let colNum = null;

  if (locMatch) {
    file = normalizeFilePath(locMatch[1]);
    lineNum = parseInt(locMatch[2], 10);
    colNum = locMatch[3] !== undefined ? parseInt(locMatch[3], 10) : null;
  } else {
    file = normalizeFilePath(rawLocation);
  }

  const isInternal = checkIsInternal(file);
  const isNodeModules = checkIsNodeModules(file);
  const isUserCode = Boolean(file && !isInternal && !isNodeModules && !isNative && file !== '<anonymous>');

  return {
    raw: line,
    callee,
    file,
    line: lineNum,
    column: colNum,
    isNative,
    isInternal,
    isNodeModules,
    isUserCode
  };
}

/**
 * Parses a complete stack trace string into an array of structured frames.
 * Gracefully handles null, undefined, empty, or non-string inputs.
 *
 * @param {string|unknown} stack
 * @returns {Array<object>}
 */
export function parseStackTrace(stack) {
  if (typeof stack !== 'string' || !stack.trim()) {
    return [];
  }

  const lines = stack.split(/\r?\n/);
  const frames = [];

  for (const line of lines) {
    const frame = parseStackFrame(line);
    if (frame !== null) {
      frames.push(frame);
    }
  }

  return frames;
}
