'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { falseDiscoveryGuard } = require('./pattern-false-discovery-guard');

test('Benjamini-Hochberg correction retains strong candidates and rejects weak ones', () => {
  const result = falseDiscoveryGuard([
    { id: 'A', pValue: 0.001, support: 50 },
    { id: 'B', pValue: 0.01, support: 40 },
    { id: 'C', pValue: 0.2, support: 35 },
    { id: 'D', pValue: 0.05, support: 25 }
  ], { alpha: 0.05, minSupport: 20 });
  assert.equal(result.testedCandidates, 4);
  assert.equal(result.acceptedCount, 2);
  assert.deepEqual(result.candidates.map(c => c.status), [
    'passes_fdr_threshold', 'passes_fdr_threshold',
    'not_significant_after_correction', 'not_significant_after_correction'
  ]);
  assert.ok(result.candidates[0].qValue <= result.candidates[1].qValue);
});

test('low-support candidates do not enter the multiple-testing pool', () => {
  const result = falseDiscoveryGuard([
    { id: 'tiny', pValue: 0.0001, support: 4 },
    { id: 'supported', pValue: 0.02, support: 22 }
  ], { minSupport: 10 });
  assert.equal(result.testedCandidates, 1);
  assert.equal(result.candidates[0].qValue, null);
  assert.equal(result.candidates[0].status, 'rejected_insufficient_support');
});

test('equal and null candidates are handled conservatively', () => {
  const result = falseDiscoveryGuard([
    { id: 'one', pValue: 0.06, support: 20 },
    { id: 'two', pValue: 0.04, support: 20 }
  ]);
  assert.equal(result.acceptedCount, 0);
  assert.ok(result.candidates.every(c => c.status === 'not_significant_after_correction'));
});

test('invalid p-values, support, alpha, and duplicate ids are rejected', () => {
  assert.throws(() => falseDiscoveryGuard([{ id: 'x', pValue: -0.1, support: 20 }]), TypeError);
  assert.throws(() => falseDiscoveryGuard([{ id: 'x', pValue: 0.1, support: -1 }]), TypeError);
  assert.throws(() => falseDiscoveryGuard([], { alpha: 1 }), TypeError);
  assert.throws(() => falseDiscoveryGuard([{ id: 'x', pValue: 0.1, support: 20 }, { id: 'x', pValue: 0.2, support: 20 }]), TypeError);
});
