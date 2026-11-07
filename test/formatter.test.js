import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseError, formatTerminal } from '../src/index.js';
import { stripAnsi, supportsColor, createStyler } from '../src/utils/terminal.js';

describe('Terminal Formatter', () => {
  describe('Color Utilities & Styler', () => {
    it('should strip ANSI escape sequences accurately', () => {
      const styler = createStyler({ enabled: true });
      const colored = styler.red(styler.bold('Error message'));
      assert.notEqual(colored, 'Error message');
      assert.equal(stripAnsi(colored), 'Error message');
    });

    it('should return identity strings when color is disabled', () => {
      const styler = createStyler({ enabled: false });
      assert.equal(styler.red('Hello'), 'Hello');
      assert.equal(styler.bold('World'), 'World');
      assert.equal(styler.badge('ERROR'), '[ERROR]');
    });

    it('should respect NO_COLOR environment variable', () => {
      const original = process.env.NO_COLOR;
      process.env.NO_COLOR = '1';
      assert.equal(supportsColor(), false);
      if (original !== undefined) {
        process.env.NO_COLOR = original;
      } else {
        delete process.env.NO_COLOR;
      }
    });
  });

  describe('Standard Native Errors', () => {
    it('should format a TypeError with header, origin, and stack trace', () => {
      const err = new TypeError('Cannot read property of undefined');
      const normalized = parseError(err);
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('[TypeError]'));
      assert.ok(output.includes('Cannot read property of undefined'));
      assert.ok(output.includes('Location:'));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(output.includes('●'));
    });

    it('should handle multiline error messages with proper indentation', () => {
      const err = new Error('First line\nSecond line\nThird line');
      const normalized = parseError(err);
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('First line'));
      assert.ok(output.includes('    Second line'));
      assert.ok(output.includes('    Third line'));
    });
  });

  describe('System Errors', () => {
    it('should format Node.js system error metadata properly', () => {
      const err = new Error('ENOENT: no such file or directory, open \'/var/log/app.log\'');
      err.code = 'ENOENT';
      err.syscall = 'open';
      err.path = '/var/log/app.log';
      err.errno = -2;

      const normalized = parseError(err);
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('[ENOENT]'));
      assert.ok(output.includes('Category:    System Error'));
      assert.ok(output.includes('Syscall:     open'));
      assert.ok(output.includes('Path:        /var/log/app.log'));
      assert.ok(output.includes('Errno:       -2'));
    });

    it('should format network endpoints for connection errors', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      err.code = 'ECONNREFUSED';
      err.syscall = 'connect';
      err.address = '127.0.0.1';
      err.port = 3000;

      const normalized = parseError(err);
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('Endpoint:    127.0.0.1:3000'));
    });
  });

  describe('Non-Error Thrown Values', () => {
    it('should format thrown strings gracefully', () => {
      const normalized = parseError('Database connection timed out');
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('[ThrownString]'));
      assert.ok(output.includes('Database connection timed out'));
      assert.ok(output.includes('Category:    Thrown Non-Error Value'));
      // Should not show empty stack trace section
      assert.ok(!output.includes('Stack Trace:'));
    });

    it('should format thrown plain objects and their custom properties', () => {
      const normalized = parseError({ message: 'Unauthorized', status: 401, role: 'guest' });
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('[ThrownObject]'));
      assert.ok(output.includes('Unauthorized'));
      assert.ok(output.includes('status:      401'));
      assert.ok(output.includes('role:        guest'));
    });
  });

  describe('Nested Causes & Aggregate Errors', () => {
    it('should render nested causes cleanly with tree hierarchy', () => {
      const root = new Error('Connection refused');
      const middle = new Error('Failed to query user', { cause: root });
      const top = new Error('Request handler failed', { cause: middle });

      const normalized = parseError(top);
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('Request handler failed'));
      assert.ok(output.includes('╰─ Caused by:'));
      assert.ok(output.includes('Failed to query user'));
      assert.ok(output.includes('Connection refused'));
    });

    it('should render AggregateError sub-errors cleanly', () => {
      const sub1 = new TypeError('Invalid parameter');
      const sub2 = new RangeError('Index out of range');
      const agg = new AggregateError([sub1, sub2], 'Multiple validation failures');

      const normalized = parseError(agg);
      const output = formatTerminal(normalized, { color: false });

      assert.ok(output.includes('Multiple validation failures'));
      assert.ok(output.includes('Aggregate Errors (2):'));
      assert.ok(output.includes('[1/2]'));
      assert.ok(output.includes('Invalid parameter'));
      assert.ok(output.includes('[2/2]'));
      assert.ok(output.includes('Index out of range'));
    });
  });

  describe('Stack Frame Formatting & Limits', () => {
    it('should distinguish user code frames from internal/node_modules frames', () => {
      const mockStack = [
        'Error: Sample',
        '    at userFunc (/app/src/index.js:10:5)',
        '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
        '    at expressRunner (/app/node_modules/express/lib/router.js:20:10)'
      ].join('\n');

      const mockError = {
        name: 'Error',
        message: 'Sample',
        category: 'native',
        code: null,
        raw: null,
        isErrorInstance: true,
        origin: { file: '/app/src/index.js', line: 10, column: 5, callee: 'userFunc' },
        frames: [
          { raw: '', callee: 'userFunc', file: '/app/src/index.js', line: 10, column: 5, isUserCode: true, isInternal: false, isNodeModules: false },
          { raw: '', callee: 'processTicksAndRejections', file: 'node:internal/process/task_queues', line: 95, column: 5, isUserCode: false, isInternal: true, isNodeModules: false },
          { raw: '', callee: 'expressRunner', file: '/app/node_modules/express/lib/router.js', line: 20, column: 10, isUserCode: false, isInternal: false, isNodeModules: true }
        ],
        system: null,
        cause: null,
        errors: [],
        customProperties: {}
      };

      const output = formatTerminal(mockError, { color: false });
      assert.ok(output.includes('● userFunc'));
      assert.ok(output.includes('○ processTicksAndRejections'));
      assert.ok(output.includes('○ expressRunner'));
    });

    it('should respect maxFrames limit', () => {
      const err = new Error('Many frames');
      const normalized = parseError(err);
      const output = formatTerminal(normalized, { color: false, maxFrames: 2 });

      if (normalized.frames.length > 2) {
        assert.ok(output.includes('more frames omitted'));
      }
    });

    it('should produce zero ANSI codes when color: false is passed', () => {
      const err = new Error('No ANSI please');
      const normalized = parseError(err);
      const output = formatTerminal(normalized, { color: false });

      assert.equal(stripAnsi(output), output);
    });
  });
});

