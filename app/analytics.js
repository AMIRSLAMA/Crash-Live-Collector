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


const DISTRIBUTION_BINS = [
  { label: '1.00–1.49x', min: 1, max: 1.5 },
  { label: '1.50–1.99x', min: 1.5, max: 2 },
  { label: '2.00–2.99x', min: 2, max: 3 },
  { label: '3.00–4.99x', min: 3, max: 5 },
  { label: '5.00–9.99x', min: 5, max: 10 },
  { label: '10x فأكثر', min: 10, max: Infinity }
];

function describeWindow(items, label) {
  const values = items.map(item => Number(item.multiplier));
  const count = values.length;
  if (!count) return { label, count: 0, median: null, below2Percent: null, bins: DISTRIBUTION_BINS.map(bin => ({ label: bin.label, count: 0, percent: 0 })) };
  const sorted = values.slice().sort((a, b) => a - b);
  const below2 = values.filter(value => value < 2).length;
  return {
    label,
    count,
    median: Number(median(sorted).toFixed(4)),
    below2Percent: Number((below2 / count * 100).toFixed(1)),
    bins: DISTRIBUTION_BINS.map(bin => {
      const matches = values.filter(value => value >= bin.min && value < bin.max).length;
      return { label: bin.label, count: matches, percent: Number((matches / count * 100).toFixed(1)) };
    })
  };
}

function multiplierDistribution(items) {
  if (!Array.isArray(items) || items.some(item => !item || !Number.isFinite(Number(item.multiplier)) || Number(item.multiplier) < 1)) {
    throw new TypeError('items must contain valid multipliers');
  }
  return {
    total: describeWindow(items, 'كل الجولات'),
    windows: [30, 100, 500].map(size => describeWindow(items.slice(-size), 'آخر ' + size + ' جولة'))
  };
}

module.exports = { walkForwardBacktest, multiplierDistribution };
