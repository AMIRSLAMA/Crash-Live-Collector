function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function walkForwardBacktest(items, requestedWindow = 30) {
  const window = Math.min(500, Math.max(10, Number.isFinite(requestedWindow) ? Math.floor(requestedWindow) : 30));
  if (!Array.isArray(items) || items.length <= window) {
    return {
      window,
      evaluated: 0,
      rollingMae: null,
      baselineMae: null,
      improvementPercent: null,
      below2AccuracyPercent: null,
      baselineBelow2AccuracyPercent: null,
      message: 'insufficient_history'
    };
  }

  const values = items.map(item => Number(item.multiplier));
  if (values.some(value => !Number.isFinite(value) || value < 1)) {
    throw new TypeError('items must contain valid multipliers');
  }

  const initial = values.slice(0, window);
  const baselineMedian = median(initial);
  const baselineBelow2 = initial.filter(value => value < 2).length / window >= 0.5;
  let rollingError = 0;
  let baselineError = 0;
  let rollingClassCorrect = 0;
  let baselineClassCorrect = 0;
  let evaluated = 0;

  for (let index = window; index < values.length; index++) {
    const history = values.slice(index - window, index);
    const actual = values[index];
    const rollingPrediction = median(history);
    const rollingBelow2 = history.filter(value => value < 2).length / window >= 0.5;
    const actualBelow2 = actual < 2;

    rollingError += Math.abs(rollingPrediction - actual);
    baselineError += Math.abs(baselineMedian - actual);
    if (rollingBelow2 === actualBelow2) rollingClassCorrect++;
    if (baselineBelow2 === actualBelow2) baselineClassCorrect++;
    evaluated++;
  }

  const rollingMae = rollingError / evaluated;
  const baselineMae = baselineError / evaluated;
  return {
    window,
    evaluated,
    rollingMae: Number(rollingMae.toFixed(4)),
    baselineMae: Number(baselineMae.toFixed(4)),
    improvementPercent: baselineMae === 0 ? null : Number(((baselineMae - rollingMae) / baselineMae * 100).toFixed(2)),
    below2AccuracyPercent: Number((rollingClassCorrect / evaluated * 100).toFixed(1)),
    baselineBelow2AccuracyPercent: Number((baselineClassCorrect / evaluated * 100).toFixed(1)),
    message: 'historical_backtest_not_a_future_prediction'
  };
}

module.exports = { walkForwardBacktest };
