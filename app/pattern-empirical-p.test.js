'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { empiricalLowerTailP } = require('./pattern-empirical-p');

test('plus-one empirical lower-tail p-value never reports zero', () => {
  const result = empiricalLowerTailP(-10, Array.from({ length: 100 }, (_, i) => i));
  assert.equal(result.pValue, 1 / 101);
  assert.equal(result.nullSamples, 100);
});

test('ties are counted as at least as extreme and p-value stays bounded', () => {
  const result = empiricalLowerTailP(2, Array(100).fill(2));
  assert.equal(result.pValue, 1);
  assert.ok(result.pValue > 0 && result.pValue <= 1);
});

test('rejects insufficient or invalid null samples and observed score', () => {
  assert.throws(() => empiricalLowerTailP(0, [1, 2, 3]), TypeError);
  assert.throws(() => empiricalLowerTailP(NaN, Array(100).fill(1)), TypeError);
  assert.throws(() => empiricalLowerTailP(0, Array(100).fill(NaN)), TypeError);
  assert.throws(() => empiricalLowerTailP(0, Array(9).fill(1), { minNullSamples: 10 }), TypeError);
});
