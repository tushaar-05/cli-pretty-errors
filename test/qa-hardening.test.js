import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseError, parseStackFrame, formatError, prettyError } from '../src/index.js';

describe('QA & Hardening: Edge Cases & Reliability', () => {
  describe('Unusual Thrown Values', () => {
    it('should handle thrown named functions', () => {
      function calculateTax() {}
      const parsed = parseError(calculateTax);

      assert.equal(parsed.name, 'calculateTax');
      assert.equal(parsed.category, 'non-error');
      assert.equal(parsed.isErrorInstance, false);
      assert.ok(typeof parsed.message === 'string');
      assert.doesNotThrow(() => formatError(calculateTax));
    });

    it('should handle thrown anonymous arrow functions', () => {
      const fn = () => {};
      const parsed = parseError(fn);

      assert.equal(parsed.category, 'non-error');
      assert.equal(parsed.isErrorInstance, false);
      assert.ok(typeof parsed.message === 'string');
      assert.doesNotThrow(() => formatError(fn));
    });

    it('should handle thrown prototype-less objects (Object.create(null))', () => {
      const obj = Object.create(null);
      obj.customCode = 500;
      obj.message = 'Raw dictionary failure';

      const parsed = parseError(obj);
      assert.equal(parsed.name, 'ThrownObject');
      assert.equal(parsed.message, 'Raw dictionary failure');
      assert.equal(parsed.customProperties.customCode, 500);

      const formatted = formatError(obj, { color: false });
      assert.ok(formatted.includes('Raw dictionary failure'));
      assert.ok(formatted.includes('customCode:'));
      assert.ok(formatted.includes('500'));
    });

    it('should handle thrown objects with throwing getters without crashing', () => {
      const trap = {
        message: 'Normal message',
        get dangerous() {
          throw new Error('Getter explosion');
        }
      };

      assert.doesNotThrow(() => {
        const parsed = parseError(trap);
        assert.equal(parsed.message, 'Normal message');
        assert.equal(parsed.customProperties.dangerous, undefined);
      });
    });

    it('should handle Error instances with non-string message', () => {
      const err = new Error();
      err.message = 12345;

      const parsed = parseError(err);
      assert.equal(parsed.message, '12345');
      assert.doesNotThrow(() => formatError(err));

      const errNullMsg = new Error();
      errNullMsg.message = null;
      const parsedNull = parseError(errNullMsg);
      assert.equal(parsedNull.message, '');
    });
  });

  describe('Stack Frame Classification & Built-ins', () => {
    it('should classify root-level user files (e.g. index.js, app.js) as user code, not internal', () => {
      const frameIndex = parseStackFrame('    at main (index.js:15:3)');
      assert.ok(frameIndex !== null);
      assert.equal(frameIndex.file, 'index.js');
      assert.equal(frameIndex.isUserCode, true);
      assert.equal(frameIndex.isInternal, false);

      const frameServer = parseStackFrame('    at start (server.js:8:1)');
      assert.ok(frameServer !== null);
      assert.equal(frameServer.file, 'server.js');
      assert.equal(frameServer.isUserCode, true);
      assert.equal(frameServer.isInternal, false);
    });

    it('should correctly classify real Node.js built-ins as internal', () => {
      const frameFs = parseStackFrame('    at openSync (fs.js:80:10)');
      assert.ok(frameFs !== null);
      assert.equal(frameFs.isInternal, true);
      assert.equal(frameFs.isUserCode, false);

      const frameEvents = parseStackFrame('    at emit (events.js:12:34)');
      assert.ok(frameEvents !== null);
      assert.equal(frameEvents.isInternal, true);
      assert.equal(frameEvents.isUserCode, false);

      const frameNodePrefix = parseStackFrame('    at run (node:internal/modules/esm/loader:10:5)');
      assert.ok(frameNodePrefix !== null);
      assert.equal(frameNodePrefix.isInternal, true);
      assert.equal(frameNodePrefix.isUserCode, false);
    });
  });

  describe('Complex Custom Properties (BigInt & Circular)', () => {
    it('should serialize BigInt custom properties without throwing', () => {
      const err = new Error('BigInt metadata test');
      err.transactionId = 9007199254740993n;

      const parsed = parseError(err);
      assert.equal(parsed.customProperties.transactionId, 9007199254740993n);

      const output = formatError(err, { color: false });
      assert.ok(output.includes('9007199254740993n'));
    });

    it('should safely format deeply self-referential custom property objects', () => {
      const err = new Error('Circular metadata test');
      const circularMeta = { tag: 'session' };
      circularMeta.self = circularMeta;
      err.metadata = circularMeta;

      const output = formatError(err, { color: false });
      assert.ok(output.includes('[Circular]'));
    });
  });

  describe('Deep & Circular Causes', () => {
    it('should safely format mutual circular cause chains', () => {
      const errA = new Error('Error Alpha');
      const errB = new Error('Error Beta');
      errA.cause = errB;
      errB.cause = errA;

      const output = formatError(errA, { color: false });
      assert.ok(output.includes('Error Alpha'));
      assert.ok(output.includes('Error Beta'));
      assert.ok(output.includes('Circular reference'));
    });

    it('should respect maxDepth without stack overflow', () => {
      let head = new Error('Root');
      for (let i = 0; i < 25; i++) {
        head = new Error(`Level ${i}`, { cause: head });
      }

      const output = formatError(head, { color: false, maxDepth: 5 });
      assert.ok(output.includes('Level 24'));
      assert.ok(output.includes('Maximum cause depth exceeded'));
    });
  });

  describe('AggregateError Resilience', () => {
    it('should support AggregateError where errors is a Set or custom Iterable', () => {
      const sub1 = new Error('Set sub-error 1');
      const sub2 = new Error('Set sub-error 2');
      const agg = new AggregateError(new Set([sub1, sub2]), 'Iterated aggregate failure');

      const parsed = parseError(agg);
      assert.equal(parsed.errors.length, 2);
      assert.equal(parsed.errors[0].message, 'Set sub-error 1');
      assert.equal(parsed.errors[1].message, 'Set sub-error 2');

      const output = formatError(agg, { color: false });
      assert.ok(output.includes('Aggregate Errors (2):'));
      assert.ok(output.includes('Set sub-error 1'));
      assert.ok(output.includes('Set sub-error 2'));
    });
  });

  describe('Public API Robustness & Invalid Options', () => {
    it('should handle null or invalid options without throwing', () => {
      const err = new Error('Robustness test');

      assert.doesNotThrow(() => formatError(err, null));
      assert.doesNotThrow(() => formatError(err, 'not-an-object'));
      assert.doesNotThrow(() => formatError(err, { maxFrames: -10 }));
      assert.doesNotThrow(() => formatError(err, { maxFrames: 'abc' }));
      assert.doesNotThrow(() => formatError(err, { theme: null }));
      assert.doesNotThrow(() => formatError(err, { theme: 'invalid' }));
    });

    it('should recover gracefully when stream.write throws an error (e.g. EPIPE)', () => {
      const err = new Error('Stream error test');
      const brokenStream = {
        write: () => {
          const epipe = new Error('write EPIPE');
          epipe.code = 'EPIPE';
          throw epipe;
        }
      };

      // prettyError should not throw even if stream.write throws
      assert.doesNotThrow(() => {
        const returned = prettyError(err, { stream: brokenStream });
        assert.ok(returned.includes('Stream error test'));
      });
    });

    it('should maintain immutability and never mutate original errors', () => {
      const original = new Error('Untouched message');
      original.code = 'ERR_UNTOUCHED';
      original.meta = { x: 1 };

      const snapshot = JSON.stringify(original);
      const keysBefore = Object.keys(original);

      formatError(original);
      prettyError(original, { print: false });

      assert.equal(original.message, 'Untouched message');
      assert.equal(original.code, 'ERR_UNTOUCHED');
      assert.deepEqual(Object.keys(original), keysBefore);
    });
  });
});
