import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseError, parseStackTrace, parseStackFrame, isSystemError, extractSystemInfo } from '../src/index.js';

describe('Error Parser & Normalized Model', () => {
  describe('Native JavaScript Errors', () => {
    it('should normalize a TypeError correctly', () => {
      const error = new TypeError('Cannot read property of undefined');
      const normalized = parseError(error);

      assert.equal(normalized.name, 'TypeError');
      assert.equal(normalized.message, 'Cannot read property of undefined');
      assert.equal(normalized.category, 'native');
      assert.equal(normalized.isErrorInstance, true);
      assert.equal(normalized.raw, error);
      assert.ok(Array.isArray(normalized.frames));
      assert.ok(normalized.frames.length > 0);
      assert.ok(normalized.origin.file !== null);
      assert.ok(typeof normalized.origin.line === 'number');
      assert.equal(normalized.system, null);
      assert.equal(normalized.cause, null);
      assert.deepEqual(normalized.errors, []);
    });

    it('should normalize SyntaxError, RangeError, ReferenceError', () => {
      for (const ErrorType of [SyntaxError, RangeError, ReferenceError]) {
        const err = new ErrorType('Test message');
        const normalized = parseError(err);
        assert.equal(normalized.name, ErrorType.name);
        assert.equal(normalized.category, 'native');
        assert.equal(normalized.isErrorInstance, true);
      }
    });
  });

  describe('Custom Error Classes', () => {
    class PaymentRequiredError extends Error {
      constructor(message, invoiceId) {
        super(message);
        this.name = 'PaymentRequiredError';
        this.invoiceId = invoiceId;
        this.statusCode = 402;
      }
    }

    it('should normalize a custom error class and preserve custom properties', () => {
      const err = new PaymentRequiredError('Invoice unpaid', 'INV-1234');
      const normalized = parseError(err);

      assert.equal(normalized.name, 'PaymentRequiredError');
      assert.equal(normalized.message, 'Invoice unpaid');
      assert.equal(normalized.category, 'custom');
      assert.equal(normalized.isErrorInstance, true);
      assert.equal(normalized.customProperties.invoiceId, 'INV-1234');
      assert.equal(normalized.customProperties.statusCode, 402);
    });
  });

  describe('Node.js System Errors', () => {
    it('should recognize and extract system error metadata', () => {
      const sysErr = new Error('ENOENT: no such file or directory, open \'/tmp/missing.txt\'');
      sysErr.code = 'ENOENT';
      sysErr.errno = -2;
      sysErr.syscall = 'open';
      sysErr.path = '/tmp/missing.txt';

      assert.equal(isSystemError(sysErr), true);

      const normalized = parseError(sysErr);
      assert.equal(normalized.category, 'system');
      assert.equal(normalized.code, 'ENOENT');
      assert.deepEqual(normalized.system, {
        syscall: 'open',
        path: '/tmp/missing.txt',
        dest: null,
        errno: -2,
        code: 'ENOENT',
        address: null,
        port: null
      });
      // System properties should not be duplicated in customProperties
      assert.equal(normalized.customProperties.syscall, undefined);
      assert.equal(normalized.customProperties.errno, undefined);
      assert.equal(normalized.customProperties.path, undefined);
    });

    it('should extract network system error metadata (address, port)', () => {
      const netErr = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      netErr.code = 'ECONNREFUSED';
      netErr.errno = -61;
      netErr.syscall = 'connect';
      netErr.address = '127.0.0.1';
      netErr.port = 8080;

      const normalized = parseError(netErr);
      assert.equal(normalized.category, 'system');
      assert.equal(normalized.system.address, '127.0.0.1');
      assert.equal(normalized.system.port, 8080);
    });
  });

  describe('Non-Error Thrown Values', () => {
    it('should normalize thrown strings', () => {
      const normalized = parseError('Unexpected database failure');

      assert.equal(normalized.name, 'ThrownString');
      assert.equal(normalized.message, 'Unexpected database failure');
      assert.equal(normalized.category, 'non-error');
      assert.equal(normalized.isErrorInstance, false);
      assert.equal(normalized.stack, null);
      assert.deepEqual(normalized.frames, []);
      assert.equal(normalized.origin.file, null);
    });

    it('should normalize thrown null and undefined', () => {
      const normNull = parseError(null);
      assert.equal(normNull.name, 'NullThrown');
      assert.equal(normNull.message, 'null');
      assert.equal(normNull.category, 'non-error');
      assert.equal(normNull.isErrorInstance, false);

      const normUndef = parseError(undefined);
      assert.equal(normUndef.name, 'UndefinedThrown');
      assert.equal(normUndef.message, 'undefined');
      assert.equal(normUndef.category, 'non-error');
      assert.equal(normUndef.isErrorInstance, false);
    });

    it('should normalize thrown numbers, booleans, and symbols', () => {
      const normNum = parseError(500);
      assert.equal(normNum.name, 'ThrownValue');
      assert.equal(normNum.message, '500');

      const normBool = parseError(false);
      assert.equal(normBool.name, 'ThrownValue');
      assert.equal(normBool.message, 'false');

      const normSym = parseError(Symbol('test'));
      assert.equal(normSym.name, 'ThrownValue');
      assert.equal(normSym.message, 'Symbol(test)');
    });

    it('should normalize thrown plain objects', () => {
      const obj = { message: 'Unauthorized access', code: 'AUTH_01', detail: 'Token expired' };
      const normalized = parseError(obj);

      assert.equal(normalized.name, 'ThrownObject');
      assert.equal(normalized.message, 'Unauthorized access');
      assert.equal(normalized.code, 'AUTH_01');
      assert.equal(normalized.category, 'non-error');
      assert.equal(normalized.isErrorInstance, false);
      assert.equal(normalized.customProperties.detail, 'Token expired');
    });
  });

  describe('Nested Causes & Circular Protection', () => {
    it('should normalize chained causes', () => {
      const rootCause = new Error('Database connection timeout');
      const middleErr = new Error('Failed to query users', { cause: rootCause });
      const topErr = new Error('HTTP 500: Internal Server Error', { cause: middleErr });

      const normalized = parseError(topErr);

      assert.equal(normalized.message, 'HTTP 500: Internal Server Error');
      assert.ok(normalized.cause !== null);
      assert.equal(normalized.cause.message, 'Failed to query users');
      assert.ok(normalized.cause.cause !== null);
      assert.equal(normalized.cause.cause.message, 'Database connection timeout');
      assert.equal(normalized.cause.cause.cause, null);
    });

    it('should prevent infinite loops with self-referential causes', () => {
      const err = new Error('Self referencing error');
      err.cause = err; // Direct cycle

      const normalized = parseError(err);
      assert.equal(normalized.name, 'Error');
      assert.ok(normalized.cause !== null);
      assert.equal(normalized.cause.name, 'CircularReference');
      assert.equal(normalized.cause.cause, null);
    });

    it('should prevent infinite loops with mutual circular causes', () => {
      const errA = new Error('Error A');
      const errB = new Error('Error B');
      errA.cause = errB;
      errB.cause = errA; // Indirect cycle

      const normalized = parseError(errA);
      assert.equal(normalized.message, 'Error A');
      assert.equal(normalized.cause.message, 'Error B');
      assert.equal(normalized.cause.cause.name, 'CircularReference');
      assert.equal(normalized.cause.cause.cause, null);
    });

    it('should respect maxDepth option', () => {
      let current = new Error('Base');
      for (let i = 0; i < 15; i++) {
        current = new Error(`Layer ${i}`, { cause: current });
      }

      const normalized = parseError(current, { maxDepth: 3 });
      assert.ok(normalized.cause);
      assert.ok(normalized.cause.cause);
      assert.ok(normalized.cause.cause.cause);
      assert.equal(normalized.cause.cause.cause.name, 'MaxDepthExceeded');
    });
  });

  describe('AggregateError', () => {
    it('should normalize AggregateError and all its inner errors', () => {
      const sub1 = new TypeError('Invalid parameter');
      const sub2 = new RangeError('Index out of bounds');
      const agg = new AggregateError([sub1, sub2], 'Batch operation failed');

      const normalized = parseError(agg);

      assert.equal(normalized.name, 'AggregateError');
      assert.equal(normalized.message, 'Batch operation failed');
      assert.equal(normalized.category, 'aggregate');
      assert.equal(normalized.isErrorInstance, true);
      assert.equal(normalized.errors.length, 2);
      assert.equal(normalized.errors[0].name, 'TypeError');
      assert.equal(normalized.errors[1].name, 'RangeError');
    });
  });

  describe('Stack Trace Handling & Edge Cases', () => {
    it('should handle missing, empty, or non-string stack gracefully', () => {
      const errNoStack = new Error('No stack');
      errNoStack.stack = undefined;

      const norm1 = parseError(errNoStack);
      assert.equal(norm1.stack, null);
      assert.deepEqual(norm1.frames, []);
      assert.equal(norm1.origin.file, null);

      const norm2 = parseError({ stack: '' });
      assert.equal(norm2.stack, null);
      assert.deepEqual(norm2.frames, []);

      const frames = parseStackTrace(12345);
      assert.deepEqual(frames, []);
    });

    it('should parse various stack frame patterns correctly', () => {
      const stack = [
        'Error: test',
        '    at async UserService.find (/app/src/user.service.js:42:15)',
        '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
        '    at expressRouter (/app/node_modules/express/lib/router.js:100:10)',
        '    at Array.forEach (<anonymous>)',
        '    at nativeMethod (native)'
      ].join('\n');

      const frames = parseStackTrace(stack);

      assert.equal(frames.length, 5);

      // Frame 0: User code with async callee
      assert.equal(frames[0].callee, 'async UserService.find');
      assert.equal(frames[0].file, '/app/src/user.service.js');
      assert.equal(frames[0].line, 42);
      assert.equal(frames[0].column, 15);
      assert.equal(frames[0].isUserCode, true);
      assert.equal(frames[0].isInternal, false);
      assert.equal(frames[0].isNodeModules, false);

      // Frame 1: Node.js internal
      assert.equal(frames[1].isInternal, true);
      assert.equal(frames[1].isUserCode, false);

      // Frame 2: node_modules
      assert.equal(frames[2].isNodeModules, true);
      assert.equal(frames[2].isUserCode, false);

      // Frame 3: Anonymous
      assert.equal(frames[3].file, '<anonymous>');
      assert.equal(frames[3].isUserCode, false);

      // Frame 4: Native
      assert.equal(frames[4].isNative, true);
      assert.equal(frames[4].isUserCode, false);
    });

    it('should parse Windows paths and file:// URLs in frames', () => {
      const winFrame = parseStackFrame('    at C:\\projects\\app\\index.js:10:5');
      assert.ok(winFrame !== null);
      assert.equal(winFrame.file, 'C:\\projects\\app\\index.js');
      assert.equal(winFrame.line, 10);
      assert.equal(winFrame.column, 5);
      assert.equal(winFrame.isUserCode, true);

      const urlFrame = parseStackFrame('    at run (file:///app/test.mjs:20:8)');
      assert.ok(urlFrame !== null);
      assert.equal(urlFrame.file, '/app/test.mjs');
      assert.equal(urlFrame.line, 20);
      assert.equal(urlFrame.column, 8);
    });
  });

  describe('Immutability and Integrity', () => {
    it('should never mutate the original error object', () => {
      const original = new Error('Immutable test');
      original.code = 'ERR_ORIGINAL';
      original.customMeta = { a: 1 };
      const originalKeys = Object.keys(original);

      const normalized = parseError(original);

      assert.equal(original.message, 'Immutable test');
      assert.equal(original.code, 'ERR_ORIGINAL');
      assert.deepEqual(Object.keys(original), originalKeys);
      assert.notEqual(normalized, original);
    });

    it('should never invent information when data is missing', () => {
      const err = new Error();
      err.stack = 'Error'; // No frame lines

      const normalized = parseError(err);
      assert.equal(normalized.message, '');
      assert.equal(normalized.code, null);
      assert.equal(normalized.origin.file, null);
      assert.equal(normalized.origin.line, null);
      assert.equal(normalized.origin.column, null);
      assert.equal(normalized.origin.callee, null);
      assert.equal(normalized.system, null);
    });
  });
});

