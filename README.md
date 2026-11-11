# cli-pretty-errors

A lightweight, zero-dependency Node.js library that transforms confusing error messages and long stack traces into clean, readable terminal output with actionable troubleshooting suggestions.

## Features

- **Clear Visual Hierarchy**: Distinct header badges, formatted metadata, and focused user-code stack traces.
- **Actionable Diagnostics**: Context-aware troubleshooting hints and likely causes for common system errors (`ENOENT`, `EADDRINUSE`, `ECONNREFUSED`, `EACCES`) and JavaScript runtime errors (`TypeError`, `ReferenceError`, `SyntaxError`).
- **Dimmed Internals**: Highlights your own application code while de-emphasizing internal Node.js modules and third-party `node_modules` frames.
- **Comprehensive Error Support**: Handles native JavaScript errors, Node.js system errors, custom error classes, nested `cause` chains, `AggregateError`, and non-error thrown values (strings, objects, null, undefined).
- **Zero Dependencies**: Pure JavaScript (ES Modules) with zero external runtime dependencies.
- **Terminal Friendly**: Auto-detects terminal color capabilities and strictly honors `NO_COLOR`, `FORCE_COLOR`, and non-TTY environments.

---

## Installation

```bash
npm install cli-pretty-errors
```

---

## Quick Start

`cli-pretty-errors` provides two primary functions tailored to different workflows:

- **`prettyError(error, options)`**: Formats the error and prints it to `process.stderr` (or a custom stream). Also returns the formatted string.
- **`formatError(error, options)`**: Formats the error and returns the formatted string **without printing**. Perfect for custom loggers (Pino, Winston) and test suites.

```javascript
import { prettyError, formatError } from 'cli-pretty-errors';

try {
  // Your application code
  throw new TypeError("Cannot read properties of undefined (reading 'token')");
} catch (err) {
  // Prints formatted error directly to stderr
  prettyError(err);
}
```

---

## Realistic Usage Examples

### 1. Basic Usage in CLI Applications

Use `prettyError` for interactive CLI tools, scripts, or global error listeners:

```javascript
import { prettyError } from 'cli-pretty-errors';

process.on('uncaughtException', (err) => {
  prettyError(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  prettyError(reason);
  process.exit(1);
});
```

### 2. Custom Configuration

Tailor the output to your project's needs by adjusting frame limits, colors, and layout:

```javascript
import { formatError } from 'cli-pretty-errors';

const output = formatError(err, {
  color: true,        // Force colors on or off (defaults to auto-detection)
  maxFrames: 5,       // Limit displayed stack frames to 5
  stack: true,        // Set to false to hide the stack trace section entirely
  location: true,     // Set to false to omit the file:line:col location line
  hints: true         // Display diagnostic suggestions (default: true)
});

console.error(output);
```

### 3. Using with an Existing Logger (Pino / Winston / Custom)

When using structured logging libraries, use `formatError` to retrieve the formatted string without double-printing to standard streams:

```javascript
import pino from 'pino';
import { formatError } from 'cli-pretty-errors';

const logger = pino();

try {
  await database.connect();
} catch (err) {
  // Pass formatted terminal string to your logger
  logger.error(formatError(err, { color: false }));
}
```

### 4. Disabling Diagnostic Hints

If you only want clean stack formatting without diagnostic suggestions (e.g., in minimal production logs):

```javascript
import { prettyError } from 'cli-pretty-errors';

try {
  await performTask();
} catch (err) {
  // Only displays error header, origin location, and clean stack frames
  prettyError(err, { hints: false });
}
```

### 5. Handling Errors in an Express.js Application

Integrate directly into Express error-handling middleware:

```javascript
import express from 'express';
import { formatError, prettyError } from 'cli-pretty-errors';

const app = express();

// Application routes...
app.get('/api/users', (req, res) => {
  throw new Error('Database query failed');
});

// Centralized Express error-handling middleware
app.use((err, req, res, next) => {
  // Log formatted error to the terminal during development
  if (process.env.NODE_ENV !== 'production') {
    prettyError(err);
  } else {
    // Clean format without stack dumps in production
    console.error(formatError(err, { stack: false, color: false }));
  }

  // Send safe HTTP response to client
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error'
    }
  });
});

app.listen(3000);
```

---

## API Reference

### `prettyError(error, options)`
Formats the error, writes it to `stderr` (or `options.stream`), and returns the string.

### `formatError(error, options)`
Formats the error and returns the formatted string without writing to any stream.

#### Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `color` | `boolean` | `auto` | Enable or disable ANSI colors. Defaults to auto-detection (respects `NO_COLOR`). |
| `hints` | `boolean` | `true` | Include actionable explanations and troubleshooting suggestions. |
| `diagnostics` | `boolean` | `true` | Alias for `hints`. |
| `maxFrames` | `number` | `50` | Maximum number of stack frames to display before truncating. |
| `stack` | `boolean` | `true` | Set to `false` to omit the stack trace section. |
| `location` | `boolean` | `true` | Set to `false` to omit the primary source location line. |
| `theme` | `object` | `{}` | Customize badges, bullets, or hint icons. |
| `stream` | `Writable` | `process.stderr` | Target stream for `prettyError`. |
| `print` | `boolean` | `true` | Set to `false` in `prettyError` to suppress printing. |

---

## Advanced Modular Exports

For custom processing or integration pipelines, individual modules are directly accessible:

```javascript
import {
  parseError,              // Normalizes any input into standard error model
  getDiagnostic,           // Retrieves diagnostic hints for a normalized error
  registerDiagnosticRule,  // Register custom domain diagnostic rules
  formatTerminal,          // Low-level terminal layout formatter
  isSystemError,           // Checks if an error is a Node.js system error
  extractSystemInfo        // Extracts POSIX metadata (syscall, path, errno, port)
} from 'cli-pretty-errors';
```

---

## Known Limitations

- **Minified Code without Source Maps**: When running production bundles where source files have been concatenated and variable names mangled, `cli-pretty-errors` formats the reported bundle coordinates accurately, but cannot unminify original variable names without an external source map consumer.
- **Native C++ Addon Frames**: Errors originating directly inside native C++ bindings or N-API addons that do not generate standard V8 callsite strings will produce an empty `frames` array and fallback cleanly to standard message and error code display without source location coordinates.
- **Getter Safety**: Any custom property backed by an active getter is omitted rather than evaluated to ensure error formatting never triggers unexpected side effects.

---

## License

[MIT](LICENSE)
