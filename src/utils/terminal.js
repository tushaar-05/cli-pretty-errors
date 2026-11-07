/**
 * Minimal terminal styling and layout utilities (ANSI styling, wrapping, color checks).
 * Zero external dependencies.
 */

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgBlack: '\x1b[40m'
};

/**
 * Checks whether the current environment supports colored terminal output.
 * Respects standard NO_COLOR, FORCE_COLOR, CLI flags, and TTY status.
 *
 * @param {object} [stream=process.stdout]
 * @returns {boolean}
 */
export function supportsColor(stream = process.stdout) {
  const argv = Array.isArray(process.argv) ? process.argv : [];
  if (argv.includes('--no-color')) return false;
  if (argv.includes('--color')) return true;

  const env = process.env || {};
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false;
  }

  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  }

  if (env.TERM === 'dumb') {
    return false;
  }

  return Boolean(stream?.isTTY);
}

/**
 * Strips ANSI escape codes from a string.
 *
 * @param {string} str
 * @returns {string}
 */
export function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Creates an ANSI styler object. When enabled is false, all styling functions
 * return the input string unmodified.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled]
 * @returns {Record<string, (text: string|number) => string>}
 */
export function createStyler(options = {}) {
  const enabled = options.enabled ?? supportsColor();

  const styler = {};

  const styleKeys = Object.keys(ANSI);
  for (const key of styleKeys) {
    if (key === 'reset') continue;
    styler[key] = (text) => {
      const str = text !== undefined && text !== null ? String(text) : '';
      if (!enabled || !str) return str;
      return `${ANSI[key]}${str}${ANSI.reset}`;
    };
  }

  // Combined convenience styles
  styler.badge = (text, bg = 'bgRed', fg = 'white') => {
    const str = text !== undefined && text !== null ? String(text) : '';
    if (!enabled || !str) return `[${str}]`;
    const bgCode = ANSI[bg] || ANSI.bgRed;
    const fgCode = ANSI[fg] || ANSI.white;
    return `${bgCode}${fgCode}${ANSI.bold} ${str} ${ANSI.reset}`;
  };

  styler.enabled = enabled;

  return styler;
}
