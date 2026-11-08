/**
 * Terminal Error Formatter.
 * Takes a normalized error model and renders a clean, modern, and readable terminal output.
 */

import { createStyler } from '../utils/terminal.js';
import { getDiagnostic } from '../hints/index.js';

const DEFAULT_THEME = {
  badgeBg: 'bgRed',
  badgeFg: 'white',
  bulletUser: '●',
  bulletInternal: '○',
  hintIcon: '💡'
};

/**
 * Formats a key-value detail line with aligned labels.
 *
 * @param {string} label
 * @param {string} value
 * @param {object} styler
 * @param {number} [labelWidth=12]
 * @returns {string}
 */
function formatDetailLine(label, value, styler, labelWidth = 12) {
  const paddedLabel = `${label}:`.padEnd(labelWidth);
  return `  ${styler.gray(paddedLabel)} ${value}`;
}

/**
 * Renders the header badge and error message.
 *
 * @param {object} error - Normalized error model
 * @param {object} styler - Styler instance
 * @param {object} theme - Theme configuration
 * @returns {string}
 */
function renderHeader(error, styler, theme) {
  const badgeName = error.name || 'ERROR';
  const badge = styler.badge(badgeName, theme.badgeBg || 'bgRed', theme.badgeFg || 'white');

  const codeTag = error.code ? ` ${styler.gray(`[${error.code}]`)}` : '';
  const headerPrefix = `${badge}${codeTag}`;

  if (!error.message) {
    return `  ${headerPrefix}`;
  }

  // Handle multi-line messages with proper indentation
  const lines = error.message.split(/\r?\n/);
  const firstLine = `  ${headerPrefix} ${styler.bold(lines[0])}`;

  if (lines.length === 1) {
    return firstLine;
  }

  const indent = '    ';
  const remainingLines = lines
    .slice(1)
    .map((l) => `${indent}${styler.bold(l)}`)
    .join('\n');

  return `${firstLine}\n${remainingLines}`;
}

/**
 * Renders error origin, system metadata, and custom properties.
 *
 * @param {object} error - Normalized error model
 * @param {object} styler - Styler instance
 * @param {object} options - Formatting options
 * @returns {string}
 */
function renderMetadata(error, styler, options) {
  const lines = [];

  // Primary origin location (can be disabled via options.location: false)
  if (options.location !== false && error.origin?.file) {
    const file = styler.cyan(error.origin.file);
    const line = error.origin.line !== null ? `:${styler.yellow(error.origin.line)}` : '';
    const col = error.origin.column !== null ? `:${styler.yellow(error.origin.column)}` : '';
    const callee = error.origin.callee ? ` ${styler.gray(`(${error.origin.callee})`)}` : '';
    lines.push(formatDetailLine('Location', `${file}${line}${col}${callee}`, styler));
  }

  // Category
  if (error.category && error.category !== 'native') {
    const categoryNames = {
      system: 'System Error',
      custom: 'Custom Error',
      aggregate: 'Aggregate Error',
      'non-error': 'Thrown Non-Error Value'
    };
    lines.push(formatDetailLine('Category', categoryNames[error.category] || error.category, styler));
  }

  // System error details
  if (error.system) {
    if (error.system.syscall) {
      lines.push(formatDetailLine('Syscall', styler.yellow(error.system.syscall), styler));
    }
    if (error.system.path) {
      lines.push(formatDetailLine('Path', styler.cyan(error.system.path), styler));
    }
    if (error.system.dest) {
      lines.push(formatDetailLine('Destination', styler.cyan(error.system.dest), styler));
    }
    if (error.system.errno !== null) {
      lines.push(formatDetailLine('Errno', `${error.system.errno}`, styler));
    }
    if (error.system.address) {
      const endpoint = error.system.port ? `${error.system.address}:${error.system.port}` : error.system.address;
      lines.push(formatDetailLine('Endpoint', styler.cyan(endpoint), styler));
    }
  }

  // Custom properties
  const customKeys = Object.keys(error.customProperties || {});
  if (customKeys.length > 0) {
    for (const key of customKeys) {
      const val = error.customProperties[key];
      let valStr;
      if (typeof val === 'object' && val !== null) {
        try {
          valStr = JSON.stringify(val);
        } catch {
          valStr = String(val);
        }
      } else {
        valStr = String(val);
      }
      lines.push(formatDetailLine(key, styler.magenta(valStr), styler));
    }
  }

  return lines.join('\n');
}

/**
 * Renders parsed stack frames.
 * Highlights user code while subtly dimming node_modules and internal frames.
 *
 * @param {Array<object>} frames - Parsed stack frames
 * @param {object} styler - Styler instance
 * @param {object} options - Formatting options
 * @param {object} theme - Theme configuration
 * @returns {string}
 */
function renderStackFrames(frames, styler, options = {}, theme) {
  if (options.stack === false) {
    return '';
  }

  if (!Array.isArray(frames) || frames.length === 0) {
    return '';
  }

  const maxFrames = options.maxFrames ?? 50;
  const displayedFrames = frames.slice(0, maxFrames);

  const lines = [`  ${styler.bold(styler.gray('Stack Trace:'))}`];

  const userBullet = theme.bulletUser || '●';
  const internalBullet = theme.bulletInternal || '○';

  for (const frame of displayedFrames) {
    const isUser = frame.isUserCode;

    // Bullet indicator: bold red for user code, dim gray for internals/node_modules
    const bullet = isUser ? styler.red(userBullet) : styler.gray(internalBullet);

    // Callee
    const callee = frame.callee || '<anonymous>';
    const calleeFormatted = isUser ? styler.bold(callee) : styler.gray(callee);

    // Location
    let locFormatted = '';
    if (frame.isNative) {
      locFormatted = styler.gray('[native code]');
    } else if (frame.file === '<anonymous>') {
      locFormatted = styler.gray('<anonymous>');
    } else if (frame.file) {
      const filePart = isUser ? styler.cyan(frame.file) : styler.gray(frame.file);
      const linePart = frame.line !== null ? `:${isUser ? styler.yellow(frame.line) : styler.gray(frame.line)}` : '';
      const colPart = frame.column !== null ? `:${isUser ? styler.yellow(frame.column) : styler.gray(frame.column)}` : '';
      locFormatted = `${filePart}${linePart}${colPart}`;
    }

    lines.push(`    ${bullet} ${calleeFormatted}  ${locFormatted}`);
  }

  if (frames.length > maxFrames) {
    const remaining = frames.length - maxFrames;
    lines.push(`    ${styler.gray(`... ${remaining} more frames omitted`)}`);
  }

  return lines.join('\n');
}

/**
 * Renders diagnostic explanation, likely cause, and actionable suggestions.
 *
 * @param {object} diagnostic - Diagnostic result from getDiagnostic
 * @param {object} styler - Styler instance
 * @param {object} theme - Theme configuration
 * @returns {string}
 */
function renderDiagnostic(diagnostic, styler, theme) {
  if (!diagnostic || typeof diagnostic !== 'object') {
    return '';
  }

  const lines = [];

  const icon = theme.hintIcon || '💡';
  const title = diagnostic.title ? ` ${diagnostic.title}` : '';
  lines.push(`  ${styler.bold(styler.yellow(`${icon} Diagnosis:${title}`))}`);

  // Explanation or likely cause
  if (diagnostic.likelyCause) {
    lines.push(`    ${diagnostic.likelyCause}`);
  } else if (diagnostic.explanation) {
    lines.push(`    ${diagnostic.explanation}`);
  }

  // Suggestions list
  if (Array.isArray(diagnostic.suggestions) && diagnostic.suggestions.length > 0) {
    lines.push('');
    lines.push(`    ${styler.bold(styler.gray('Suggestions:'))}`);
    for (const item of diagnostic.suggestions) {
      lines.push(`      ${styler.cyan('•')} ${item}`);
    }
  }

  return lines.join('\n');
}

/**
 * Indents a multi-line string by a specified prefix.
 *
 * @param {string} text
 * @param {string} prefix
 * @returns {string}
 */
function indentBlock(text, prefix = '  │ ') {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `${prefix}${line}` : prefix.trimEnd()))
    .join('\n');
}

/**
 * Main terminal formatter function.
 * Converts a normalized error model into a terminal-ready string.
 *
 * @param {object} error - Normalized error model
 * @param {object} [options]
 * @param {boolean} [options.color] - Override color support (true/false)
 * @param {number} [options.maxFrames=50] - Maximum stack frames to display
 * @param {boolean} [options.stack=true] - Whether to include the stack trace section
 * @param {boolean} [options.location=true] - Whether to include the source location line
 * @param {boolean} [options.hints=true] - Whether to include diagnostic suggestions
 * @param {boolean} [options.diagnostics=true] - Alias for options.hints
 * @param {object} [options.theme] - Custom theme overrides
 * @param {object|null} [options.diagnostic] - Pre-computed diagnostic result override
 * @param {number} [options._depth=0] - Internal recursion depth
 * @returns {string}
 */
export function formatTerminal(error, options = {}) {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const styler = createStyler({ enabled: options.color });
  const theme = {
    ...DEFAULT_THEME,
    ...(options.theme || {})
  };
  const depth = options._depth ?? 0;

  const sections = [];

  // 1. Header (Badge, Code, Message)
  const header = renderHeader(error, styler, theme).trimEnd();
  if (header) {
    sections.push(header);
  }

  // 2. Metadata (Location, Category, System Info, Custom Properties)
  const meta = renderMetadata(error, styler, options).trimEnd();
  if (meta) {
    sections.push(meta);
  }

  // 3. Stack Trace
  const stack = renderStackFrames(error.frames, styler, options, theme).trimEnd();
  if (stack) {
    sections.push(stack);
  }

  // 4. Diagnostic Suggestions (if available and enabled)
  const showHints = options.hints !== false && options.diagnostics !== false;
  const diagnostic =
    options.diagnostic !== undefined && depth === 0
      ? options.diagnostic
      : (showHints ? getDiagnostic(error, options) : null);

  if (diagnostic) {
    const diagBlock = renderDiagnostic(diagnostic, styler, theme).trimEnd();
    if (diagBlock) {
      sections.push(diagBlock);
    }
  }

  // 5. Nested Cause
  if (error.cause) {
    const causeHeader = `  ${styler.yellow('╰─ Caused by:')}`;
    const formattedCause = formatTerminal(error.cause, {
      ...options,
      _depth: depth + 1
    });
    sections.push(`${causeHeader}\n${indentBlock(formattedCause.trim(), '     │ ')}`);
  }

  // 6. AggregateError Nested Errors
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    const count = error.errors.length;
    const aggHeader = `  ${styler.yellow(`Aggregate Errors (${count}):`)}`;
    const aggBlocks = [aggHeader];

    error.errors.forEach((subErr, idx) => {
      const itemHeader = `  ${styler.gray(`[${idx + 1}/${count}]`)}`;
      const formattedSub = formatTerminal(subErr, {
        ...options,
        _depth: depth + 1
      });
      aggBlocks.push(`${itemHeader}\n${indentBlock(formattedSub.trim(), '     │ ')}`);
    });

    sections.push(aggBlocks.join('\n\n'));
  }

  return `\n${sections.join('\n\n')}\n`;
}
