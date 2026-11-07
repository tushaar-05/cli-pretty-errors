import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseError,
  getDiagnostic,
  registerDiagnosticRule,
  resetDiagnosticRules
} from '../src/index.js';

describe('Diagnostic & Hints Engine', () => {
  beforeEach(() => {
    resetDiagnosticRules();
  });

  describe('Node.js System Error Diagnostics', () => {
    it('should diagnose ENOENT with target path', () => {
      const err = new Error('ENOENT: no such file or directory, open \'/var/app/config.json\'');
      err.code = 'ENOENT';
      err.syscall = 'open';
      err.path = '/var/app/config.json';
      err.errno = -2;

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'ENOENT');
      assert.ok(diagnostic.title.includes('ENOENT'));
      assert.ok(diagnostic.likelyCause.includes('/var/app/config.json'));
      assert.ok(diagnostic.suggestions.length >= 2);
      assert.ok(diagnostic.suggestions.some((s) => s.includes('/var/app/config.json')));
    });

    it('should diagnose ENOENT without explicit path gracefully', () => {
      const err = new Error('File not found');
      err.code = 'ENOENT';

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'ENOENT');
      assert.ok(diagnostic.explanation.length > 0);
      assert.ok(diagnostic.suggestions.length > 0);
    });

    it('should diagnose EACCES with file permission failure', () => {
      const err = new Error('EACCES: permission denied, open \'/etc/shadow\'');
      err.code = 'EACCES';
      err.syscall = 'open';
      err.path = '/etc/shadow';

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'EACCES');
      assert.ok(diagnostic.likelyCause.includes('/etc/shadow'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('ls -la "/etc/shadow"')));
    });

    it('should diagnose EACCES on privileged port (< 1024)', () => {
      const err = new Error('bind EACCES 0.0.0.0:80');
      err.code = 'EACCES';
      err.syscall = 'bind';
      err.port = 80;

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'EACCES');
      assert.ok(diagnostic.likelyCause.includes('privileged port 80'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('unprivileged port')));
    });

    it('should diagnose ECONNREFUSED with host and port', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      err.code = 'ECONNREFUSED';
      err.syscall = 'connect';
      err.address = '127.0.0.1';
      err.port = 5432;

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'ECONNREFUSED');
      assert.ok(diagnostic.likelyCause.includes('127.0.0.1:5432'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('curl -v') || s.includes('nc -zv')));
    });

    it('should diagnose EADDRINUSE with port and command suggestions', () => {
      const err = new Error('listen EADDRINUSE: address already in use :::3000');
      err.code = 'EADDRINUSE';
      err.syscall = 'listen';
      err.port = 3000;

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'EADDRINUSE');
      assert.ok(diagnostic.likelyCause.includes('3000'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('lsof -i :3000')));
    });

    it('should diagnose ETIMEDOUT network failure', () => {
      const err = new Error('connect ETIMEDOUT 93.184.216.34:443');
      err.code = 'ETIMEDOUT';
      err.syscall = 'connect';

      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'ETIMEDOUT');
      assert.ok(diagnostic.explanation.includes('timeout'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('proxy') || s.includes('timeout')));
    });

    it('should diagnose MODULE_NOT_FOUND for relative files and npm packages', () => {
      // Relative file import
      const relErr = new Error("Cannot find module './utils.js'");
      relErr.code = 'MODULE_NOT_FOUND';
      const normRel = parseError(relErr);
      const diagRel = getDiagnostic(normRel);

      assert.ok(diagRel !== null);
      assert.equal(diagRel.id, 'MODULE_NOT_FOUND');
      assert.ok(diagRel.suggestions.some((s) => s.includes('file extension')));

      // External package import
      const pkgErr = new Error("Cannot find package 'lodash'");
      pkgErr.code = 'ERR_MODULE_NOT_FOUND';
      const normPkg = parseError(pkgErr);
      const diagPkg = getDiagnostic(normPkg);

      assert.ok(diagPkg !== null);
      assert.ok(diagPkg.suggestions.some((s) => s.includes('npm install lodash')));
    });
  });

  describe('JavaScript Runtime Error Diagnostics', () => {
    it('should diagnose TypeError for reading property of undefined', () => {
      const err = new TypeError("Cannot read properties of undefined (reading 'token')");
      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'TYPE_ERROR_NULL_OR_UNDEFINED');
      assert.ok(diagnostic.likelyCause.includes('undefined'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('optional chaining (?.)')));
    });

    it('should diagnose TypeError for calling non-function', () => {
      const err = new TypeError('res.status is not a function');
      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'TYPE_ERROR_NOT_A_FUNCTION');
      assert.ok(diagnostic.likelyCause.includes('res.status'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('import statement')));
    });

    it('should diagnose ReferenceError for undeclared variable', () => {
      const err = new ReferenceError('authToken is not defined');
      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'REFERENCE_ERROR_NOT_DEFINED');
      assert.ok(diagnostic.likelyCause.includes('authToken'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('typos')));
    });

    it('should diagnose ReferenceError for Temporal Dead Zone (TDZ)', () => {
      const err = new ReferenceError("Cannot access 'config' before initialization");
      const normalized = parseError(err);
      const diagnostic = getDiagnostic(normalized);

      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'REFERENCE_ERROR_NOT_DEFINED');
      assert.ok(diagnostic.title.includes('Temporal Dead Zone') || diagnostic.likelyCause.includes('Temporal Dead Zone'));
      assert.ok(diagnostic.suggestions.some((s) => s.includes('Move the declaration')));
    });

    it('should diagnose SyntaxError and distinguish JSON parse errors', () => {
      const jsonErr = new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON');
      const normJson = parseError(jsonErr);
      const diagJson = getDiagnostic(normJson);

      assert.ok(diagJson !== null);
      assert.equal(diagJson.id, 'SYNTAX_ERROR_JSON');
      assert.ok(diagJson.suggestions.some((s) => s.includes('HTML error page')));

      const codeErr = new SyntaxError('Unexpected token \';\'');
      const normCode = parseError(codeErr);
      const diagCode = getDiagnostic(normCode);

      assert.ok(diagCode !== null);
      assert.equal(diagCode.id, 'SYNTAX_ERROR');
    });
  });

  describe('Unknown Errors, Missing Information, & Options', () => {
    it('should return null for unknown or unclassified errors', () => {
      const unknownErr = new Error('Application custom failure');
      const normalized = parseError(unknownErr);
      const diagnostic = getDiagnostic(normalized);

      assert.equal(diagnostic, null);
    });

    it('should return null for thrown non-error strings or numbers', () => {
      const normStr = parseError('Simple text');
      assert.equal(getDiagnostic(normStr), null);

      const normNum = parseError(404);
      assert.equal(getDiagnostic(normNum), null);
    });

    it('should return null when options.enabled is false', () => {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      const normalized = parseError(err);

      const diagnostic = getDiagnostic(normalized, { enabled: false });
      assert.equal(diagnostic, null);
    });

    it('should handle completely empty or malformed errors gracefully without throwing', () => {
      const emptyErr = new Error();
      emptyErr.message = '';
      const normalized = parseError(emptyErr);

      assert.doesNotThrow(() => {
        const diag = getDiagnostic(normalized);
        assert.equal(diag, null);
      });

      assert.equal(getDiagnostic(null), null);
      assert.equal(getDiagnostic(undefined), null);
      assert.equal(getDiagnostic({}), null);
    });

    it('should allow registering custom diagnostic rules with highest precedence', () => {
      registerDiagnosticRule({
        id: 'CUSTOM_AUTH_ERROR',
        name: 'Authentication Expired',
        match: (err) => err.code === 'ERR_AUTH_EXPIRED',
        resolve: (err) => ({
          id: 'CUSTOM_AUTH_ERROR',
          title: 'Session Token Expired',
          explanation: 'The provided bearer token has passed its expiration timestamp.',
          likelyCause: 'User has been inactive longer than session TTL.',
          suggestions: ['Refresh token using the /auth/refresh endpoint.']
        })
      });

      const customErr = new Error('Token expired');
      customErr.code = 'ERR_AUTH_EXPIRED';
      const normalized = parseError(customErr);

      const diagnostic = getDiagnostic(normalized);
      assert.ok(diagnostic !== null);
      assert.equal(diagnostic.id, 'CUSTOM_AUTH_ERROR');
      assert.equal(diagnostic.title, 'Session Token Expired');
    });

    it('should never mutate the input normalized error model', () => {
      const err = new Error('ENOENT: no such file');
      err.code = 'ENOENT';
      const normalized = parseError(err);
      const originalJSON = JSON.stringify(normalized);

      getDiagnostic(normalized);

      assert.equal(JSON.stringify(normalized), originalJSON);
    });
  });
});

