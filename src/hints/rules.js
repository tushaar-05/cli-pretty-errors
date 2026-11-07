/**
 * Diagnostic rules knowledge base.
 * Deterministic pattern matching and targeted troubleshooting suggestions
 * for common Node.js system errors and ECMAScript runtime errors.
 */

/**
 * Extracts a file path from a system error or error message.
 *
 * @param {object} error
 * @returns {string|null}
 */
function extractPath(error) {
  if (error.system?.path) {
    return error.system.path;
  }
  const match = error.message?.match(/(?:open|stat|access|read|unlink|mkdir)\s+'([^']+)'/i);
  return match ? match[1] : null;
}

/**
 * Extracts port and host from a system error or error message.
 *
 * @param {object} error
 * @returns {{ address: string|null, port: number|null }}
 */
function extractEndpoint(error) {
  const address = error.system?.address ?? null;
  const port = error.system?.port ?? null;

  if (address || port) {
    return { address, port };
  }

  const match = error.message?.match(/(?:connect|listen)\s+[A-Z0-9_]+(?:\s+([^\s:]+))?:(\d+)/i);
  if (match) {
    return {
      address: match[1] || null,
      port: parseInt(match[2], 10)
    };
  }

  return { address: null, port: null };
}

/**
 * Built-in diagnostic rules.
 */
export const DEFAULT_RULES = [
  // 1. ENOENT — File or directory not found
  {
    id: 'ENOENT',
    name: 'File or Directory Not Found',
    match: (err) => err.code === 'ENOENT' || err.system?.code === 'ENOENT',
    resolve: (err) => {
      const targetPath = extractPath(err);
      const suggestions = [];

      if (targetPath) {
        suggestions.push(`Verify the file or directory exists: "${targetPath}".`);
        suggestions.push('If using relative paths, check process.cwd() or resolve paths using path.resolve(import.meta.dirname, ...).');
        suggestions.push('Ensure parent directories exist before creating files (e.g., fs.mkdir with { recursive: true }).');
      } else {
        suggestions.push('Check that the target file or directory path is spelled correctly.');
        suggestions.push('Verify the application working directory matches the expected relative path location.');
        suggestions.push('Ensure parent directories exist before performing write operations.');
      }

      return {
        id: 'ENOENT',
        title: 'File or Directory Not Found (ENOENT)',
        explanation: 'Node.js attempted an operation on a file, directory, or link that does not exist.',
        likelyCause: targetPath
          ? `The path "${targetPath}" could not be found or was resolved against the wrong working directory.`
          : 'A file system path could not be resolved from the current working directory.',
        suggestions
      };
    }
  },

  // 2. EACCES — Permission denied
  {
    id: 'EACCES',
    name: 'Permission Denied',
    match: (err) => err.code === 'EACCES' || err.system?.code === 'EACCES',
    resolve: (err) => {
      const targetPath = extractPath(err);
      const { port } = extractEndpoint(err);
      const suggestions = [];

      let likelyCause = 'The operating system denied access due to insufficient privileges or file ownership.';

      if (port && port < 1024) {
        likelyCause = `Binding to privileged port ${port} (< 1024) requires root or administrative privileges on POSIX systems.`;
        suggestions.push(`Change your server to listen on an unprivileged port (e.g., 3000, 8080) instead of port ${port}.`);
        suggestions.push('If port 80/443 is required, run behind a reverse proxy (like Nginx, Caddy, or a load balancer).');
      } else if (targetPath) {
        likelyCause = `The user running this Node.js process does not have read/write/execute permission for "${targetPath}".`;
        suggestions.push(`Check file permissions and ownership using: ls -la "${targetPath}".`);
        suggestions.push(`Ensure the current user has access to "${targetPath}" or adjust permissions using chmod/chown.`);
      } else {
        suggestions.push('Check file ownership and permissions for the target resource.');
        suggestions.push('Verify whether a privileged port (< 1024) is being opened without necessary system capabilities.');
      }

      return {
        id: 'EACCES',
        title: 'Permission Denied (EACCES)',
        explanation: 'The current process does not have adequate permissions to perform the requested file or network operation.',
        likelyCause,
        suggestions
      };
    }
  },

  // 3. ECONNREFUSED — Connection refused
  {
    id: 'ECONNREFUSED',
    name: 'Connection Refused',
    match: (err) => err.code === 'ECONNREFUSED' || err.system?.code === 'ECONNREFUSED',
    resolve: (err) => {
      const { address, port } = extractEndpoint(err);
      const endpointStr = address && port ? `${address}:${port}` : (port ? `port ${port}` : null);

      const suggestions = [];
      if (endpointStr) {
        suggestions.push(`Confirm the target service is running and listening on ${endpointStr}.`);
        suggestions.push(`Test the connection directly using: curl -v http://${address || 'localhost'}:${port || ''} or nc -zv ${address || '127.0.0.1'} ${port || ''}.`);
        suggestions.push('Check if the service listens only on IPv4 (127.0.0.1) while Node.js is resolving "localhost" to IPv6 (::1).');
      } else {
        suggestions.push('Verify the destination database, cache, or external service is started.');
        suggestions.push('Check host, port, and protocol settings in your environment variables.');
        suggestions.push('Inspect firewall or Docker port mapping configurations.');
      }

      return {
        id: 'ECONNREFUSED',
        title: 'Connection Refused (ECONNREFUSED)',
        explanation: 'No service or server accepted the connection request at the target host and port.',
        likelyCause: endpointStr
          ? `The service expected at ${endpointStr} is either offline, not ready, or rejecting inbound requests.`
          : 'The target network service is offline or not listening for incoming connections.',
        suggestions
      };
    }
  },

  // 4. EADDRINUSE — Port already in use
  {
    id: 'EADDRINUSE',
    name: 'Address or Port Already In Use',
    match: (err) => err.code === 'EADDRINUSE' || err.system?.code === 'EADDRINUSE',
    resolve: (err) => {
      const { address, port } = extractEndpoint(err);
      const portStr = port ? String(port) : null;
      const suggestions = [];

      if (portStr) {
        suggestions.push(`Find the process occupying the port: lsof -i :${portStr} (macOS/Linux) or netstat -ano | findstr :${portStr} (Windows).`);
        suggestions.push(`Terminate the existing process or choose a different port: PORT=${Number(port) + 1}.`);
      } else {
        suggestions.push('Check for lingering Node.js processes from previous test or dev server runs.');
        suggestions.push('Configure your application to bind to a different port via environment variables.');
      }

      return {
        id: 'EADDRINUSE',
        title: 'Address or Port Already In Use (EADDRINUSE)',
        explanation: 'A server tried to bind to a network port or interface that is already bound by another process.',
        likelyCause: portStr
          ? `Port ${portStr} is already in use by another running process or another instance of your application.`
          : 'The requested port or address is currently bound by another active process.',
        suggestions
      };
    }
  },

  // 5. ETIMEDOUT — Connection timed out
  {
    id: 'ETIMEDOUT',
    name: 'Connection Timed Out',
    match: (err) => err.code === 'ETIMEDOUT' || err.system?.code === 'ETIMEDOUT',
    resolve: (err) => {
      const { address, port } = extractEndpoint(err);
      const endpointStr = address && port ? `${address}:${port}` : null;

      const suggestions = [
        'Check network connectivity and ensure the destination server is reachable (e.g. ping or traceroute).',
        'Verify whether a corporate proxy, VPN, or firewall is silently dropping outbound packets.',
        'Increase the request timeout if the remote server is experiencing heavy load or latency.'
      ];

      return {
        id: 'ETIMEDOUT',
        title: 'Connection Timed Out (ETIMEDOUT)',
        explanation: 'A network socket or HTTP request did not receive a response before the timeout elapsed.',
        likelyCause: endpointStr
          ? `The destination server at ${endpointStr} took too long to acknowledge the connection.`
          : 'The remote host failed to respond within the allocated time window.',
        suggestions
      };
    }
  },

  // 6. MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND — Missing module
  {
    id: 'MODULE_NOT_FOUND',
    name: 'Module or Package Not Found',
    match: (err) => {
      const code = err.code;
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') return true;
      return typeof err.message === 'string' && (
        err.message.includes('Cannot find module') ||
        err.message.includes('Cannot find package')
      );
    },
    resolve: (err) => {
      const msg = err.message || '';
      const match = msg.match(/(?:Cannot find module|Cannot find package)\s+'([^']+)'/);
      const targetModule = match ? match[1] : null;

      const isRelative = targetModule && (targetModule.startsWith('.') || targetModule.startsWith('/'));
      const suggestions = [];

      if (isRelative) {
        suggestions.push(`Check the relative path: "${targetModule}".`);
        suggestions.push('Ensure the file extension (.js, .mjs, .json) is included when using ES Modules in Node.js.');
        suggestions.push('Verify the target file actually exists on disk relative to the importing file.');
      } else if (targetModule) {
        suggestions.push(`Install the missing dependency: npm install ${targetModule}.`);
        suggestions.push('Ensure "npm install" has been executed in the project root directory.');
        suggestions.push('Check your package.json dependencies to ensure the package is listed.');
      } else {
        suggestions.push('Verify all imported file paths and package names are spelled correctly.');
        suggestions.push('Run "npm install" to ensure all workspace dependencies are downloaded.');
      }

      return {
        id: 'MODULE_NOT_FOUND',
        title: 'Module or Package Not Found',
        explanation: 'Node.js was unable to locate or resolve an imported module or npm package.',
        likelyCause: targetModule
          ? `The module or package "${targetModule}" could not be resolved from this location.`
          : 'An imported path or package is missing or cannot be resolved.',
        suggestions
      };
    }
  },

  // 7. TypeError: Cannot read / set properties of undefined or null
  {
    id: 'TYPE_ERROR_NULL_OR_UNDEFINED',
    name: 'Null or Undefined Property Access',
    match: (err) => {
      if (err.name !== 'TypeError') return false;
      const msg = err.message || '';
      return (
        msg.includes('Cannot read properties of') ||
        msg.includes('Cannot read property') ||
        msg.includes('Cannot set properties of') ||
        msg.includes('Cannot set property') ||
        msg.includes('Cannot destructure property')
      );
    },
    resolve: (err) => {
      const msg = err.message || '';
      const propMatch = msg.match(/(?:read property|read properties of|set property|set properties of|destructure property)\s+'?([^'\s]+)'?\s+of\s+(undefined|null)/i)
        || msg.match(/Cannot read properties of (undefined|null)/i);

      let targetVal = 'undefined or null';
      let propName = null;

      if (propMatch) {
        if (propMatch[2]) {
          propName = propMatch[1];
          targetVal = propMatch[2];
        } else if (propMatch[1]) {
          targetVal = propMatch[1];
        }
      }

      const suggestions = [
        `Use optional chaining (?.) to guard property access: obj?.${propName || 'property'}.`,
        'Use nullish coalescing (??) to supply a default fallback: const value = target ?? defaultValue.',
        'Verify that asynchronous functions or database queries returned expected data before accessing fields.'
      ];

      return {
        id: 'TYPE_ERROR_NULL_OR_UNDEFINED',
        title: 'Null or Undefined Property Access (TypeError)',
        explanation: `Attempted to access or modify a property on a value that evaluates to ${targetVal}.`,
        likelyCause: propName
          ? `The object containing "${propName}" was ${targetVal} at runtime.`
          : `The target object was ${targetVal} at runtime.`,
        suggestions
      };
    }
  },

  // 8. TypeError: ... is not a function
  {
    id: 'TYPE_ERROR_NOT_A_FUNCTION',
    name: 'Not a Function',
    match: (err) => {
      if (err.name !== 'TypeError') return false;
      return typeof err.message === 'string' && err.message.includes('is not a function');
    },
    resolve: (err) => {
      const msg = err.message || '';
      const match = msg.match(/(?:(?:'([^']+)')|([a-zA-Z0-9_$.]+))\s+is not a function/);
      const callee = match ? (match[1] || match[2]) : null;

      const suggestions = [
        'Check your import statement (e.g. "import foo from ..." vs "import { foo } from ...").',
        'Check if the method was misspelled or does not exist on the target object.',
        `Inspect the runtime type of the variable with: console.log(typeof ${callee || 'fn'}).`
      ];

      return {
        id: 'TYPE_ERROR_NOT_A_FUNCTION',
        title: 'Value Is Not a Function (TypeError)',
        explanation: 'Attempted to invoke a value as a function, but its runtime type is not callable.',
        likelyCause: callee
          ? `"${callee}" evaluated to undefined, null, or a non-function value when invoked.`
          : 'The target variable was not a function at runtime.',
        suggestions
      };
    }
  },

  // 9. ReferenceError: ... is not defined
  {
    id: 'REFERENCE_ERROR_NOT_DEFINED',
    name: 'Undeclared Variable',
    match: (err) => {
      if (err.name !== 'ReferenceError') return false;
      const msg = err.message || '';
      return msg.includes('is not defined') || msg.includes('before initialization');
    },
    resolve: (err) => {
      const msg = err.message || '';
      const isTDZ = msg.includes('before initialization');
      const varMatch = msg.match(/(?:Cannot access '([^']+)' before initialization|([a-zA-Z0-9_$]+) is not defined)/);
      const varName = varMatch ? (varMatch[1] || varMatch[2]) : null;

      const suggestions = [];
      let likelyCause = '';

      if (isTDZ) {
        likelyCause = varName
          ? `The variable "${varName}" was accessed before its let/const declaration was evaluated (Temporal Dead Zone).`
          : 'A variable was accessed before its declaration line was reached.';
        suggestions.push(`Move the declaration of "${varName || 'variable'}" above the line where it is first used.`);
        suggestions.push('Avoid circular dependencies where module A uses module B before B has initialized.');
      } else {
        likelyCause = varName
          ? `The identifier "${varName}" has not been declared or imported in this scope.`
          : 'An identifier was referenced that does not exist in the current scope.';
        suggestions.push(varName ? `Check for typos in the variable name "${varName}".` : 'Check for typos in the variable name.');
        suggestions.push('Ensure the variable is declared with const, let, or var, or imported from its module.');
        suggestions.push('Check the scope of the variable to ensure it is accessible inside this block or function.');
      }

      return {
        id: 'REFERENCE_ERROR_NOT_DEFINED',
        title: isTDZ ? 'Accessed Variable Before Initialization (ReferenceError)' : 'Undeclared Variable (ReferenceError)',
        explanation: isTDZ
          ? 'A scoped variable was accessed within its Temporal Dead Zone prior to its initialization.'
          : 'A variable was referenced that does not exist in the current lexical or global scope.',
        likelyCause,
        suggestions
      };
    }
  },

  // 10. SyntaxError — Syntax or JSON Parsing error
  {
    id: 'SYNTAX_ERROR',
    name: 'Syntax or Parsing Error',
    match: (err) => err.name === 'SyntaxError',
    resolve: (err) => {
      const msg = err.message || '';
      const isJSON = msg.includes('JSON') || msg.includes('Unexpected token') && msg.includes('position');

      if (isJSON) {
        return {
          id: 'SYNTAX_ERROR_JSON',
          title: 'JSON Parse Failure (SyntaxError)',
          explanation: 'JSON.parse() failed because the input string is not valid JSON.',
          likelyCause: 'The input string contains trailing commas, single quotes, unquoted keys, or is an HTML/plain text error page.',
          suggestions: [
            'Ensure JSON uses double quotes for both property keys and string values.',
            'Remove any trailing commas after the last array element or object property.',
            'Log the raw string before parsing to verify the response is not an HTML error page (e.g. <!DOCTYPE html>).'
          ]
        };
      }

      return {
        id: 'SYNTAX_ERROR',
        title: 'Syntax Error (SyntaxError)',
        explanation: 'The JavaScript engine encountered code that violates ECMAScript syntax grammar.',
        likelyCause: 'A missing closing bracket, parenthesis, dangling comma, or language feature not supported by your Node.js version.',
        suggestions: [
          'Inspect the line and column indicated in the stack trace for unmatched brackets, quotes, or commas.',
          'Verify your Node.js version supports the syntax features used (check "node -v").'
        ]
      };
    }
  }
];
