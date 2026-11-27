'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pairedBlockBootstrapAudit } = require('./pattern-robustness');

test('paired block bootstrap detects a consistently lower pattern Brier score on fixture data', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    patternBrier: i % 7 === 0 ? 0.18 : 0.12,
    baselineBrier: i % 7 === 0 ? 0.42 : 0.36
  }));
  const result = pairedBlockBootstrapAudit(rows, { blockLength: 5, replicates: 500, seed: 123 });
  assert.equal(result.sampleSize, 60);
  assert.equal(result.blockLength, 5);
  assert.equal(result.replicates, 500);
  assert.ok(result.confidenceInterval95.upper < 0);
  assert.equal(result.assessment, 'pattern_brier_lower_in_bootstrap_interval');
});

test('paired block bootstrap is deterministic and reports no clear difference when scores match', () => {
  const rows = Array.from({ length: 40 }, () => ({ patternBrier: 0.25, baselineBrier: 0.25 }));
  const a = pairedBlockBootstrapAudit(rows, { seed: 77 });
  const b = pairedBlockBootstrapAudit(rows, { seed: 77 });
  assert.deepEqual(a, b);
  assert.equal(a.meanBrierDifference, 0);
  assert.deepEqual(a.confidenceInterval95, { lower: 0, upper: 0 });
  assert.equal(a.assessment, 'interval_overlaps_zero_no_clear_difference');
});

test('paired block bootstrap refuses too-short traces and invalid scores', () => {
  assert.equal(pairedBlockBootstrapAudit(Array.from({ length: 19 }, () => ({ patternBrier: 0.2, baselineBrier: 0.3 }))).assessment, 'insufficient_trace_for_block_bootstrap');
  assert.throws(() => pairedBlockBootstrapAudit([{ patternBrier: NaN, baselineBrier: 0.3 }]), TypeError);
});
