/**
 * Normalizes any caught value (native Errors, custom Errors, Node system errors,
 * nested causes, AggregateErrors, primitive strings/objects) into a unified internal error model.
 */

import { parseStackTrace } from './stack.js';
import { isSystemError, extractSystemInfo } from './system.js';
import { extractCustomProperties } from './custom-properties.js';

const NATIVE_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError'
]);

/**
 * Creates a normalized representation of a circular reference sentinel.
 *
 * @param {unknown} raw
 * @returns {object}
 */
function createCircularSentinel(raw) {
  return {
    name: 'CircularReference',
    message: '[Circular reference to previously processed error]',
    category: 'custom',
    code: null,
    raw,
    isErrorInstance: raw instanceof Error,
    origin: { file: null, line: null, column: null, callee: null },
    stack: null,
    frames: [],
    system: null,
    cause: null,
    errors: [],
    customProperties: {}
  };
}

/**
 * Creates a normalized representation when max nesting depth is exceeded.
 *
 * @param {unknown} raw
 * @returns {object}
 */
function createMaxDepthSentinel(raw) {
  return {
    name: 'MaxDepthExceeded',
    message: '[Maximum cause depth exceeded]',
    category: 'custom',
    code: null,
    raw,
    isErrorInstance: raw instanceof Error,
    origin: { file: null, line: null, column: null, callee: null },
    stack: null,
    frames: [],
    system: null,
    cause: null,
    errors: [],
    customProperties: {}
  };
}

/**
 * Extracts origin callsite information from parsed frames.
 * Prefers the topmost user-code frame; falls back to the topmost frame if no user frame is found.
 *
 * @param {Array<object>} frames
 * @returns {{ file: string|null, line: number|null, column: number|null, callee: string|null }}
 */
function extractOrigin(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return { file: null, line: null, column: null, callee: null };
  }

  const userFrame = frames.find((f) => f.isUserCode) || frames[0];

  return {
    file: userFrame.file ?? null,
    line: userFrame.line ?? null,
    column: userFrame.column ?? null,
    callee: userFrame.callee ?? null
  };
}

/**
 * Core error parser function. Normalizes any input into a consistent error model.
 *
 * @param {unknown} input - Thrown value of any type.
 * @param {object} [options]
 * @param {number} [options.maxDepth=10] - Maximum recursion depth for nested causes and aggregate errors.
 * @param {Set<unknown>} [options._visited] - Internal set used for circular reference detection.
 * @param {number} [options._depth=0] - Internal recursion depth counter.
 * @returns {object} Normalized error representation.
 */
export function parseError(input, options = {}) {
  const maxDepth = options.maxDepth ?? 10;
  const depth = options._depth ?? 0;
  const visited = options._visited ?? new Set();

  // Handle primitives and non-object values
  if (input === null) {
    return {
      name: 'NullThrown',
      message: 'null',
      category: 'non-error',
      code: null,
      raw: input,
      isErrorInstance: false,
      origin: { file: null, line: null, column: null, callee: null },
      stack: null,
      frames: [],
      system: null,
      cause: null,
      errors: [],
      customProperties: {}
    };
  }

  if (input === undefined) {
    return {
      name: 'UndefinedThrown',
      message: 'undefined',
      category: 'non-error',
      code: null,
      raw: input,
      isErrorInstance: false,
      origin: { file: null, line: null, column: null, callee: null },
      stack: null,
      frames: [],
      system: null,
      cause: null,
      errors: [],
      customProperties: {}
    };
  }

  const inputType = typeof input;

  if (inputType === 'string') {
    return {
      name: 'ThrownString',
      message: input,
      category: 'non-error',
      code: null,
      raw: input,
      isErrorInstance: false,
      origin: { file: null, line: null, column: null, callee: null },
      stack: null,
      frames: [],
      system: null,
      cause: null,
      errors: [],
      customProperties: {}
    };
  }

  if (inputType === 'number' || inputType === 'boolean' || inputType === 'bigint' || inputType === 'symbol') {
    return {
      name: 'ThrownValue',
      message: String(input),
      category: 'non-error',
      code: null,
      raw: input,
      isErrorInstance: false,
      origin: { file: null, line: null, column: null, callee: null },
      stack: null,
      frames: [],
      system: null,
      cause: null,
      errors: [],
      customProperties: {}
    };
  }

  // At this point, input is an object or function
  // Circular reference detection for object inputs
  if (visited.has(input)) {
    return createCircularSentinel(input);
  }

  if (depth >= maxDepth) {
    return createMaxDepthSentinel(input);
  }

  // Create a new visited set branch for this traversal path
  const currentVisited = new Set(visited);
  currentVisited.add(input);

  const isInstance = input instanceof Error;
  const isAggregate = (typeof AggregateError !== 'undefined' && input instanceof AggregateError) || input.name === 'AggregateError';

  // Extract name and message
  let name = 'Error';
  if (typeof input.name === 'string' && input.name.trim()) {
    name = input.name;
  } else if (isInstance && input.constructor?.name) {
    name = input.constructor.name;
  } else if (!isInstance) {
    name = 'ThrownObject';
  }

  let message = '';
  if (typeof input.message === 'string') {
    message = input.message;
  } else if (!isInstance) {
    try {
      message = JSON.stringify(input);
    } catch {
      message = String(input);
    }
  }

  // Extract code
  let code = null;
  if (typeof input.code === 'string' || typeof input.code === 'number') {
    code = String(input.code);
  }

  // Stack trace & frames
  const stack = typeof input.stack === 'string' && input.stack.trim() ? input.stack : null;
  const frames = parseStackTrace(stack);
  const origin = extractOrigin(frames);

  // System metadata
  const system = extractSystemInfo(input);

  // Determine category
  let category = 'custom';
  if (!isInstance) {
    category = 'non-error';
  } else if (isSystemError(input) || system !== null) {
    category = 'system';
  } else if (isAggregate) {
    category = 'aggregate';
  } else if (NATIVE_ERROR_NAMES.has(name)) {
    category = 'native';
  }

  // Handle nested cause
  let cause = null;
  if (input.cause !== undefined) {
    cause = parseError(input.cause, {
      maxDepth,
      _depth: depth + 1,
      _visited: currentVisited
    });
  }

  // Handle AggregateError sub-errors
  const errors = [];
  if (Array.isArray(input.errors)) {
    for (const subErr of input.errors) {
      errors.push(
        parseError(subErr, {
          maxDepth,
          _depth: depth + 1,
          _visited: currentVisited
        })
      );
    }
  }

  // Extract custom non-standard properties
  const customProperties = extractCustomProperties(input);

  return {
    name,
    message,
    category,
    code,
    raw: input,
    isErrorInstance: isInstance,
    origin,
    stack,
    frames,
    system,
    cause,
    errors,
    customProperties
  };
}
