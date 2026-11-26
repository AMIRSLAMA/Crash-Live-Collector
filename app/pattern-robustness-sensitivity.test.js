'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { blockLengthSensitivity } = require('./pattern-robustness-sensitivity');

test('sensitivity audit reports stable pattern advantage across block lengths for fixture', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({
    patternBrier: i % 8 === 0 ? 0.16 : 0.11,
    baselineBrier: i % 8 === 0 ? 0.38 : 0.32
  }));
  const result = blockLengthSensitivity(rows, { blockLengths: [2, 5, 12], replicates: 300, seed: 42 });
  assert.equal(result.testedBlockLengths, 3);
  assert.equal(result.patternWins, 3);
  assert.equal(result.baselineWins, 0);
  assert.equal(result.verdict, 'pattern_advantage_stable_across_block_lengths');
});

test('sensitivity audit flags mixed or inconclusive results', () => {
  const rows = Array.from({ length: 50 }, () => ({ patternBrier: 0.25, baselineBrier: 0.25 }));
  const result = blockLengthSensitivity(rows, { blockLengths: [3, 5], replicates: 100 });
  assert.equal(result.verdict, 'conclusion_sensitive_to_block_length_or_uncertain');
  assert.equal(result.intervalsOverlapZero, 2);
});

test('sensitivity audit reports insufficient sample without hiding block lengths', () => {
  const rows = Array.from({ length: 10 }, () => ({ patternBrier: 0.2, baselineBrier: 0.3 }));
  const result = blockLengthSensitivity(rows);
  assert.equal(result.verdict, 'insufficient_trace');
  assert.equal(result.testedBlockLengths, 0);
});
