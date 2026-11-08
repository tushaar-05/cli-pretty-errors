import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prettyError, formatError, parseError } from '../src/index.js';
import { stripAnsi } from '../src/utils/terminal.js';

describe('Public API: formatError & prettyError', () => {
  describe('formatError (String return only, no printing)', () => {
    it('should format a recognized TypeError with diagnosis and suggestions without printing', () => {
      const err = new TypeError("Cannot read properties of undefined (reading 'username')");
      const output = formatError(err, { color: false });

      assert.ok(typeof output === 'string');
      assert.ok(output.includes('[TypeError]'));
      assert.ok(output.includes("Cannot read properties of undefined (reading 'username')"));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(output.includes('💡 Diagnosis: Null or Undefined Property Access (TypeError)'));
      assert.ok(output.includes('Suggestions:'));
      assert.ok(output.includes('optional chaining (?.)'));
    });

    it('should format a recognized Node.js system error (ENOENT)', () => {
      const err = new Error('ENOENT: no such file or directory, open \'/var/app/keys.pem\'');
      err.code = 'ENOENT';
      err.syscall = 'open';
      err.path = '/var/app/keys.pem';
      err.errno = -2;

      const output = formatError(err, { color: false });

      assert.ok(output.includes('[ENOENT]'));
      assert.ok(output.includes('Syscall:     open'));
      assert.ok(output.includes('Path:        /var/app/keys.pem'));
      assert.ok(output.includes('💡 Diagnosis: File or Directory Not Found (ENOENT)'));
      assert.ok(output.includes('Verify the file or directory exists: "/var/app/keys.pem".'));
    });

    it('should format an unknown error without any diagnostic or suggestion section', () => {
      const err = new Error('Something unique and unexpected happened');
      const output = formatError(err, { color: false });

      assert.ok(output.includes('[Error]'));
      assert.ok(output.includes('Something unique and unexpected happened'));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(!output.includes('💡 Diagnosis:'));
      assert.ok(!output.includes('Suggestions:'));
    });

    it('should allow disabling diagnostics via hints: false', () => {
      const err = new TypeError("Cannot read properties of undefined (reading 'token')");
      const output = formatError(err, { color: false, hints: false });

      assert.ok(output.includes('[TypeError]'));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(!output.includes('💡 Diagnosis:'));
      assert.ok(!output.includes('Suggestions:'));
    });

    it('should allow hiding stack trace via stack: false', () => {
      const err = new Error('Error with hidden stack');
      const output = formatError(err, { color: false, stack: false });

      assert.ok(output.includes('Error with hidden stack'));
      assert.ok(!output.includes('Stack Trace:'));
    });

    it('should allow hiding source location via location: false', () => {
      const err = new Error('Error with hidden location');
      const output = formatError(err, { color: false, location: false });

      assert.ok(output.includes('Error with hidden location'));
      assert.ok(!output.includes('Location:'));
    });

    it('should accept custom theme overrides', () => {
      const err = new Error('Themed error');
      err.code = 'ENOENT';
      const output = formatError(err, {
        color: false,
        theme: {
          hintIcon: '🔍',
          bulletUser: '►'
        }
      });

      assert.ok(output.includes('🔍 Diagnosis:'));
      assert.ok(output.includes('►'));
    });

    it('should accept an already parsed normalized error model', () => {
      const raw = new TypeError("Cannot read properties of undefined (reading 'user')");
      const normalized = parseError(raw);

      const outFromNormalized = formatError(normalized, { color: false });
      const outFromRaw = formatError(raw, { color: false });

      assert.equal(outFromNormalized, outFromRaw);
    });

    it('should handle thrown non-error objects gracefully', () => {
      const thrown = { message: 'Database query timeout', status: 504, retries: 3 };
      const output = formatError(thrown, { color: false });

      assert.ok(output.includes('[ThrownObject]'));
      assert.ok(output.includes('Database query timeout'));
      assert.ok(output.includes('status:      504'));
      assert.ok(output.includes('retries:     3'));
    });

    it('should respect color: false and produce pure text with no ANSI escapes', () => {
      const err = new TypeError("Cannot read properties of null (reading 'id')");
      const output = formatError(err, { color: false });

      assert.equal(stripAnsi(output), output);
    });

    it('should respect maxFrames limit', () => {
      const err = new Error('Trace limit test');
      const output = formatError(err, { color: false, maxFrames: 1 });

      assert.ok(output.includes('more frames omitted'));
    });
  });

  describe('prettyError (Print to stream and return)', () => {
    it('should print formatted error to the specified stream and return string', () => {
      let writtenData = '';
      const mockStream = {
        write: (chunk) => {
          writtenData += chunk;
        }
      };

      const err = new Error('CLI crash occurred');
      const returned = prettyError(err, { color: false, stream: mockStream });

      assert.equal(writtenData, `${returned}\n`);
      assert.ok(writtenData.includes('[Error] CLI crash occurred'));
    });

    it('should allow suppressing printing via print: false', () => {
      let printed = false;
      const mockStream = {
        write: () => {
          printed = true;
        }
      };

      const err = new Error('Silent format');
      const returned = prettyError(err, { color: false, print: false, stream: mockStream });

      assert.equal(printed, false);
      assert.ok(returned.includes('Silent format'));
    });
  });
});
