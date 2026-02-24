/* eslint-disable import/extensions */
const assert = require('assert');
const { test, describe, beforeEach } = require('node:test');

const {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  resetAllCircuits,
  MAX_FAILURES,
  BLOCK_DURATION_MS,
} = require('../../src/services/circuitBreaker');

describe('CircuitBreaker', () => {
  beforeEach(() => {
    resetAllCircuits();
  });

  describe('isCircuitOpen', () => {
    test('returns false for unknown source', () => {
      assert.strictEqual(isCircuitOpen('unknown-source'), false);
    });

    test('returns false after 1 failure', () => {
      recordFailure('test-source');
      assert.strictEqual(isCircuitOpen('test-source'), false);
    });

    test('returns false after 2 failures', () => {
      recordFailure('test-source');
      recordFailure('test-source');
      assert.strictEqual(isCircuitOpen('test-source'), false);
    });

    test('returns true after 3 failures (circuit opens)', () => {
      recordFailure('test-source');
      recordFailure('test-source');
      recordFailure('test-source');
      assert.strictEqual(isCircuitOpen('test-source'), true);
    });

    test('returns true after more than 3 failures', () => {
      for (let i = 0; i < 5; i++) {
        recordFailure('test-source');
      }
      assert.strictEqual(isCircuitOpen('test-source'), true);
    });

    test('auto-recovers after block duration passes', () => {
      // Record 3 failures to open circuit
      recordFailure('test-source');
      recordFailure('test-source');
      recordFailure('test-source');
      assert.strictEqual(isCircuitOpen('test-source'), true);

      // Mock time by manipulating Date.now
      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + BLOCK_DURATION_MS + 1;

      try {
        // Circuit should auto-recover (blockedUntil has passed)
        assert.strictEqual(isCircuitOpen('test-source'), false);
      } finally {
        Date.now = originalDateNow;
      }
    });

    test('tracks circuits independently per source', () => {
      recordFailure('source-a');
      recordFailure('source-a');
      recordFailure('source-a');

      recordFailure('source-b');

      assert.strictEqual(isCircuitOpen('source-a'), true);
      assert.strictEqual(isCircuitOpen('source-b'), false);
    });
  });

  describe('recordFailure', () => {
    test('increments failure count', () => {
      recordFailure('test-source');
      // After 1 failure, circuit is still closed
      assert.strictEqual(isCircuitOpen('test-source'), false);

      recordFailure('test-source');
      recordFailure('test-source');
      // After 3 failures, circuit is open
      assert.strictEqual(isCircuitOpen('test-source'), true);
    });

    test('sets blockedUntil when reaching threshold', () => {
      recordFailure('test-source');
      recordFailure('test-source');
      // Not yet at threshold -- circuit still closed
      assert.strictEqual(isCircuitOpen('test-source'), false);

      recordFailure('test-source');
      // At threshold -- circuit should be open with blockedUntil set
      assert.strictEqual(isCircuitOpen('test-source'), true);
    });
  });

  describe('recordSuccess', () => {
    test('resets circuit (closes it)', () => {
      recordFailure('test-source');
      recordFailure('test-source');
      recordFailure('test-source');
      assert.strictEqual(isCircuitOpen('test-source'), true);

      recordSuccess('test-source');
      assert.strictEqual(isCircuitOpen('test-source'), false);
    });

    test('is a no-op for unknown source', () => {
      // Should not throw
      recordSuccess('unknown-source');
      assert.strictEqual(isCircuitOpen('unknown-source'), false);
    });
  });

  describe('resetAllCircuits', () => {
    test('clears all circuit state', () => {
      recordFailure('source-a');
      recordFailure('source-a');
      recordFailure('source-a');
      recordFailure('source-b');
      recordFailure('source-b');
      recordFailure('source-b');

      assert.strictEqual(isCircuitOpen('source-a'), true);
      assert.strictEqual(isCircuitOpen('source-b'), true);

      resetAllCircuits();

      assert.strictEqual(isCircuitOpen('source-a'), false);
      assert.strictEqual(isCircuitOpen('source-b'), false);
    });
  });

  describe('constants', () => {
    test('MAX_FAILURES is 3', () => {
      assert.strictEqual(MAX_FAILURES, 3);
    });

    test('BLOCK_DURATION_MS is 5 minutes', () => {
      assert.strictEqual(BLOCK_DURATION_MS, 5 * 60 * 1000);
    });
  });
});
