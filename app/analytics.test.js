const test = require('node:test');
const assert = require('node:assert/strict');
const { walkForwardBacktest } = require('./analytics');

test('walk-forward uses only the preceding window for each evaluation', () => {
  const values = [1, 1, 1, 10, 10, 10, 10, 10, 10, 10, 1, 10];
  const result = walkForwardBacktest(values.map(multiplier => ({ multiplier })), 10);

  assert.equal(result.window, 10);
  assert.equal(result.evaluated, 2);
  assert.equal(result.rollingMae, 4.5);
  assert.equal(result.baselineMae, 4.5);
  assert.equal(result.improvementPercent, 0);
  assert.equal(result.below2AccuracyPercent, 50);
  assert.equal(result.baselineBelow2AccuracyPercent, 50);
  assert.equal(result.message, 'historical_backtest_not_a_future_prediction');
});

test('walk-forward clamps the requested window to the supported range', () => {
  const tooSmall = walkForwardBacktest([], 1);
  const tooLarge = walkForwardBacktest([], 900);

  assert.equal(tooSmall.window, 10);
  assert.equal(tooLarge.window, 500);
  assert.equal(tooSmall.rollingMae, null);
  assert.equal(tooLarge.rollingMae, null);
});

test('walk-forward rejects invalid historical multipliers when there is enough history', () => {
  const values = Array.from({ length: 11 }, (_, index) => ({ multiplier: index === 10 ? 0 : 2 }));
  assert.throws(() => walkForwardBacktest(values, 10), {
    name: 'TypeError',
    message: 'items must contain valid multipliers'
  });
});

test('walk-forward does not produce a score when history is not longer than its window', () => {
  const values = Array.from({ length: 10 }, () => ({ multiplier: 2 }));
  const result = walkForwardBacktest(values, 10);

  assert.equal(result.evaluated, 0);
  assert.equal(result.rollingMae, null);
  assert.equal(result.baselineMae, null);
  assert.equal(result.message, 'insufficient_history');
});
