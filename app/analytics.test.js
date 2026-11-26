const test = require('node:test');
const assert = require('node:assert/strict');
const { walkForwardBacktest, sequenceAnalysis, volatilityAnalysis, outOfSampleTest } = require('./analytics');

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

test('sequence analysis reports transitions, streaks and sequential blocks', () => {
  const values = [1.2, 1.5, 2.1, 2.5, 1.8, 1.4, 3, 4, 1.7, 2.2, 2.8];
  const result = sequenceAnalysis(values.map(multiplier => ({ multiplier })), 5);
  assert.equal(result.totalRounds, 11);
  assert.equal(result.groupSize, 5);
  assert.equal(result.sequenceOrder, 'ingestion_order');
  assert.deepEqual(result.transitions, { below2: { below2: 2, atLeast2: 3 }, atLeast2: { below2: 2, atLeast2: 3 } });
  assert.deepEqual(result.streaks.current, { category: 'atLeast2', length: 2 });
  assert.equal(result.streaks.below2.longest, 2);
  assert.equal(result.blocks.length, 3);
  assert.equal(result.blocks[0].count, 5);
  assert.equal(result.blocks[2].count, 1);
});

test('sequence analysis clamps group size and rejects invalid values', () => {
  assert.equal(sequenceAnalysis([], 1).groupSize, 5);
  assert.equal(sequenceAnalysis([], 500).groupSize, 100);
  assert.throws(() => sequenceAnalysis([{ multiplier: 0 }]), { name: 'TypeError', message: 'items must contain valid multipliers' });
});

test('volatility analysis compares sequential blocks using IQR and MAD', () => {
  const values = [
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    1, 1, 1, 10, 1, 10, 1, 10, 1, 10,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  ];
  const result = volatilityAnalysis(values.map(multiplier => ({ multiplier })), 10);
  assert.equal(result.totalRounds, 30);
  assert.equal(result.totalBlocks, 3);
  assert.equal(result.groupSize, 10);
  assert.equal(result.blocks[0].iqr, 0);
  assert.equal(result.blocks[0].mad, 0);
  assert.equal(result.blocks[1].iqr, 9);
  assert.equal(result.blocks[2].iqr, 4.5);
  assert.equal(result.interpretation, 'descriptive_historical_volatility_not_a_future_prediction');
  assert.equal(Object.values(result.groups).reduce((sum, group) => sum + group.blocks, 0), 3);
});

test('volatility analysis handles equal-spread and partial blocks without false tiers', () => {
  const values = Array.from({ length: 11 }, (_, index) => ({ multiplier: index < 10 ? 2 : 1 }));
  const result = volatilityAnalysis(values, 5);
  assert.equal(result.totalBlocks, 3);
  assert.equal(result.blocks[2].count, 1);
  assert.equal(result.blocks[2].iqr, 0);
  assert.equal(result.groups.similar.blocks, 3);
});

test('volatility analysis clamps group size and rejects invalid multipliers', () => {
  assert.equal(volatilityAnalysis([], 1).groupSize, 5);
  assert.equal(volatilityAnalysis([], 500).groupSize, 100);
  assert.throws(() => volatilityAnalysis([{ multiplier: 0 }]), {
    name: 'TypeError',
    message: 'items must contain valid multipliers'
  });
});


test('out-of-sample test scores each round using prior history only', () => {
  const values = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 2.5, 1, 1, 3];
  const result = outOfSampleTest(values.map(multiplier => ({ multiplier })), 10);
  assert.equal(result.evaluated, 4);
  assert.equal(result.recentEvaluations[0].roundIndex, 11);
  assert.equal(result.recentEvaluations[0].rollingProbabilityBelow2, 0.5);
  assert.equal(result.recentEvaluations[0].baselineProbabilityBelow2, 0.5);
  assert.equal(result.recentEvaluations[0].actualBelow2, false);
  assert.equal(result.message, 'strict_walk_forward_uses_only_prior_rounds_no_future_data');
  assert.equal(result.assessment, 'descriptive_only_need_at_least_100_evaluations');
});

test('out-of-sample test reports insufficient history and rejects invalid data', () => {
  const insufficient = outOfSampleTest(Array.from({ length: 10 }, () => ({ multiplier: 2 })), 10);
  assert.equal(insufficient.evaluated, 0);
  assert.equal(insufficient.rollingBrier, null);
  assert.equal(insufficient.assessment, 'insufficient_history');
  assert.throws(() => outOfSampleTest([{ multiplier: 0 }], 10), {
    name: 'TypeError',
    message: 'items must contain valid multipliers'
  });
});

test('out-of-sample recent audit is capped at the latest 50 evaluations', () => {
  const values = Array.from({ length: 80 }, (_, index) => ({ multiplier: index % 3 === 0 ? 1.5 : 2.5 }));
  const result = outOfSampleTest(values, 10);
  assert.equal(result.evaluated, 70);
  assert.equal(result.recentEvaluations.length, 50);
  assert.equal(result.recentEvaluations[0].roundIndex, 31);
  assert.equal(result.recentEvaluations[49].roundIndex, 80);
});
