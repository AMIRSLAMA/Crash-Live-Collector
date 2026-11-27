'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePatternEvidenceGate } = require('./pattern-evidence-gate');

function strongFixture() {
  const rows = Array.from({ length: 120 }, (_, i) => ({ patternBrier: 0.12 + (i % 8) * 0.001, baselineBrier: 0.32 + (i % 8) * 0.001 }));
  return { id: 'fixture-strong', rows, support: 120, nullDifferences: Array.from({ length: 200 }, (_, i) => 0.08 + (i % 10) * 0.001) };
}

test('strict gate requires OOS minimum, all block sensitivity intervals, and FDR pass', () => {
  const candidate = strongFixture();
  // deterministic null distribution is well above the observed negative score difference
  candidate.nullDifferences = Array.from({ length: 200 }, (_, i) => 0.1 + (i % 5) * 0.001);
  const result = evaluatePatternEvidenceGate([candidate], { replicates: 300, seed: 19 });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.passedCount, 1);
  assert.equal(result.results[0].verdict, 'passes_research_gate');
  assert.equal(result.results[0].robustAcrossBlocks, true);
});

test('does not pass candidates with short OOS evaluation', () => {
  const rows = Array.from({ length: 35 }, () => ({ patternBrier: 0.1, baselineBrier: 0.3 }));
  const result = evaluatePatternEvidenceGate([{ id: 'short', rows, support: 35, nullDifferences: Array(100).fill(0.1) }], { minEvaluations: 100 });
  assert.equal(result.passedCount, 0);
  assert.equal(result.results[0].verdict, 'does_not_pass_research_gate');
});

test('rejects malformed candidate inputs', () => {
  assert.throws(() => evaluatePatternEvidenceGate([{ id: 'bad', rows: [{ patternBrier: 0.1, baselineBrier: 0.2 }], nullDifferences: [] }]), /at least 100 samples/);
  assert.throws(() => evaluatePatternEvidenceGate([], { blockLengths: [5] }), /at least two/);
});
