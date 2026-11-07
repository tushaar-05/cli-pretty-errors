import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prettyError, formatError, parseError } from '../src/index.js';
import { stripAnsi } from '../src/utils/terminal.js';

describe('Integration: Parser + Formatter + Diagnostic Engine', () => {
  describe('Unified prettyError API', () => {
    it('should format a recognized TypeError with diagnosis and suggestions', () => {
      const err = new TypeError("Cannot read properties of undefined (reading 'username')");
      const output = prettyError(err, { color: false });

      assert.ok(output.includes('[TypeError]'));
      assert.ok(output.includes("Cannot read properties of undefined (reading 'username')"));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(output.includes('💡 Diagnosis: Null or Undefined Property Access (TypeError)'));
      assert.ok(output.includes('Suggestions:'));
      assert.ok(output.includes('optional chaining (?.)'));
    });

    it('should format a recognized Node.js system error (ENOENT) with system metadata and suggestions', () => {
      const err = new Error('ENOENT: no such file or directory, open \'/var/app/keys.pem\'');
      err.code = 'ENOENT';
      err.syscall = 'open';
      err.path = '/var/app/keys.pem';
      err.errno = -2;

      const output = prettyError(err, { color: false });

      assert.ok(output.includes('[ENOENT]'));
      assert.ok(output.includes('Syscall:     open'));
      assert.ok(output.includes('Path:        /var/app/keys.pem'));
      assert.ok(output.includes('💡 Diagnosis: File or Directory Not Found (ENOENT)'));
      assert.ok(output.includes('Verify the file or directory exists: "/var/app/keys.pem".'));
    });

    it('should format an unknown error without any diagnostic or suggestion section', () => {
      const err = new Error('Something unique and unexpected happened');
      const output = prettyError(err, { color: false });

      assert.ok(output.includes('[Error]'));
      assert.ok(output.includes('Something unique and unexpected happened'));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(!output.includes('💡 Diagnosis:'));
      assert.ok(!output.includes('Suggestions:'));
    });

    it('should allow disabling diagnostics via hints: false', () => {
      const err = new TypeError("Cannot read properties of undefined (reading 'token')");
      const output = prettyError(err, { color: false, hints: false });

      assert.ok(output.includes('[TypeError]'));
      assert.ok(output.includes('Stack Trace:'));
      assert.ok(!output.includes('💡 Diagnosis:'));
      assert.ok(!output.includes('Suggestions:'));
    });

    it('should allow disabling diagnostics via diagnostics: false', () => {
      const err = new Error('listen EADDRINUSE: address already in use :::4000');
      err.code = 'EADDRINUSE';
      err.port = 4000;

      const output = prettyError(err, { color: false, diagnostics: false });

      assert.ok(output.includes('[EADDRINUSE]'));
      assert.ok(!output.includes('💡 Diagnosis:'));
      assert.ok(!output.includes('Suggestions:'));
    });

    it('should accept an already parsed normalized error model', () => {
      const raw = new TypeError("Cannot read properties of undefined (reading 'user')");
      const normalized = parseError(raw);

      const outFromNormalized = prettyError(normalized, { color: false });
      const outFromRaw = prettyError(raw, { color: false });

      assert.equal(outFromNormalized, outFromRaw);
    });

    it('should support formatError as an alias for prettyError', () => {
      assert.equal(prettyError, formatError);
    });

    it('should handle thrown non-error objects gracefully', () => {
      const thrown = { message: 'Database query timeout', status: 504, retries: 3 };
      const output = prettyError(thrown, { color: false });

      assert.ok(output.includes('[ThrownObject]'));
      assert.ok(output.includes('Database query timeout'));
      assert.ok(output.includes('status:      504'));
      assert.ok(output.includes('retries:     3'));
    });

    it('should respect color: false and produce pure text with no ANSI escapes', () => {
      const err = new TypeError("Cannot read properties of null (reading 'id')");
      const output = prettyError(err, { color: false });

      assert.equal(stripAnsi(output), output);
    });

    it('should respect maxFrames limit', () => {
      const err = new Error('Trace limit test');
      const output = prettyError(err, { color: false, maxFrames: 1 });

      assert.ok(output.includes('more frames omitted'));
    });

    it('should format nested causes with child diagnosis', () => {
      const rootSys = new Error('connect ECONNREFUSED 127.0.0.1:27017');
      rootSys.code = 'ECONNREFUSED';
      rootSys.syscall = 'connect';
      rootSys.address = '127.0.0.1';
      rootSys.port = 27017;

      const topApp = new Error('Failed to bootstrap MongoDB connection', { cause: rootSys });
      const output = prettyError(topApp, { color: false });

      assert.ok(output.includes('Failed to bootstrap MongoDB connection'));
      assert.ok(output.includes('╰─ Caused by:'));
      assert.ok(output.includes('ECONNREFUSED'));
      assert.ok(output.includes('💡 Diagnosis: Connection Refused (ECONNREFUSED)'));
    });
  });
});

