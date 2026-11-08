/**
 * Safely extracts custom, non-standard properties from error objects
 * without mutating the original object or throwing on getter errors.
 */

const EXCLUDED_PROPERTIES = new Set([
  'name',
  'message',
  'stack',
  'cause',
  'errors',
  'syscall',
  'code',
  'errno',
  'path',
  'dest',
  'address',
  'port',
  'constructor',
  'prototype',
  'length',
  'arguments',
  'caller'
]);

/**
 * Safely extracts non-standard properties from an error object.
 *
 * @param {object} err
 * @returns {Record<string, unknown>}
 */
export function extractCustomProperties(err) {
  if (!err || (typeof err !== 'object' && typeof err !== 'function')) {
    return {};
  }

  const custom = {};
  const visited = new Set([err]);

  // Read own property names safely
  let keys = [];
  try {
    keys = Object.getOwnPropertyNames(err);
  } catch {
    return {};
  }

  for (const key of keys) {
    if (EXCLUDED_PROPERTIES.has(key)) {
      continue;
    }

    try {
      const descriptor = Object.getOwnPropertyDescriptor(err, key);
      if (!descriptor) {
        continue;
      }

      // Avoid executing dangerous getters
      if (typeof descriptor.get === 'function') {
        continue;
      }

      const val = descriptor.value;

      // Ignore functions
      if (typeof val === 'function') {
        continue;
      }

      // Prevent circular references in custom property values
      if (val && typeof val === 'object') {
        if (visited.has(val)) {
          custom[key] = '[Circular]';
          continue;
        }
        visited.add(val);
      }

      custom[key] = val;
    } catch {
      // If reading the property fails for any reason, skip it safely
    }
  }

  return custom;
}
