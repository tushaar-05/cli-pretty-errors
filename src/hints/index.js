/**
 * Suggestion engine that evaluates errors against known rules and matches hints.
 * Pure, deterministic, and modular.
 */

import { DEFAULT_RULES } from './rules.js';

let activeRules = [...DEFAULT_RULES];

/**
 * Registers a new diagnostic rule.
 *
 * @param {object} rule
 * @param {string} rule.id
 * @param {string} rule.name
 * @param {(err: object) => boolean} rule.match
 * @param {(err: object) => object|null} rule.resolve
 */
export function registerDiagnosticRule(rule) {
  if (!rule || typeof rule.match !== 'function' || typeof rule.resolve !== 'function') {
    throw new TypeError('Diagnostic rule must provide match(err) and resolve(err) functions.');
  }
  // Add new rules to the beginning so user rules have precedence over default rules
  activeRules.unshift(rule);
}

/**
 * Resets active diagnostic rules to defaults.
 */
export function resetDiagnosticRules() {
  activeRules = [...DEFAULT_RULES];
}

/**
 * Returns a copy of all active diagnostic rules.
 *
 * @returns {Array<object>}
 */
export function getAllDiagnosticRules() {
  return [...activeRules];
}

/**
 * Evaluates a normalized error against diagnostic rules and returns actionable suggestions.
 * Returns null if hints are disabled or no rule matches.
 *
 * @param {object} error - Normalized error model from parseError
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether diagnostics are enabled
 * @returns {object|null} Diagnostic result or null
 */
export function getDiagnostic(error, options = {}) {
  if (options.enabled === false) {
    return null;
  }

  if (!error || typeof error !== 'object') {
    return null;
  }

  for (const rule of activeRules) {
    try {
      if (rule.match(error)) {
        const resolved = rule.resolve(error);
        if (resolved) {
          return {
            id: resolved.id || rule.id,
            title: resolved.title || rule.name,
            explanation: resolved.explanation || '',
            likelyCause: resolved.likelyCause || '',
            suggestions: Array.isArray(resolved.suggestions) ? [...resolved.suggestions] : []
          };
        }
      }
    } catch {
      // If a rule fails unexpectedly, continue evaluation safely
      continue;
    }
  }

  return null;
}
