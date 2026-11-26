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

function sequenceAnalysis(items, requestedGroupSize = 10) {
  const groupSize = Math.min(100, Math.max(5, Number.isFinite(requestedGroupSize) ? Math.floor(requestedGroupSize) : 10));
  if (!Array.isArray(items) || items.some(item => !item || !Number.isFinite(Number(item.multiplier)) || Number(item.multiplier) < 1)) throw new TypeError('items must contain valid multipliers');
  const values = items.map(item => Number(item.multiplier));
  const labels = values.map(value => value < 2 ? 'below2' : 'atLeast2');
  const transitions = { below2: { below2: 0, atLeast2: 0 }, atLeast2: { below2: 0, atLeast2: 0 } };
  for (let i = 1; i < labels.length; i++) transitions[labels[i - 1]][labels[i]]++;
  const streaks = { below2: [], atLeast2: [] };
  let current = null, currentLength = 0;
  for (const label of labels) { if (label === current) currentLength++; else { if (current) streaks[current].push(currentLength); current = label; currentLength = 1; } }
  if (current) streaks[current].push(currentLength);
  const summarize = list => ({ count: list.length, longest: list.length ? Math.max(...list) : 0, average: list.length ? Number((list.reduce((sum, n) => sum + n, 0) / list.length).toFixed(2)) : 0 });
  const blocks = [];
  for (let start = 0; start < values.length; start += groupSize) { const chunk = values.slice(start, start + groupSize); const below = chunk.filter(value => value < 2).length; blocks.push({ fromRound: start + 1, toRound: start + chunk.length, count: chunk.length, median: Number(median(chunk).toFixed(4)), below2Percent: Number((below / chunk.length * 100).toFixed(1)) }); }
  const currentLabel = labels.length ? labels[labels.length - 1] : null;
  return { totalRounds: values.length, threshold: 2, groupSize, sequenceOrder: 'ingestion_order', transitions, streaks: { below2: summarize(streaks.below2), atLeast2: summarize(streaks.atLeast2), current: currentLabel ? { category: currentLabel, length: currentLength } : null }, blocks: blocks.slice(-10) };
}

module.exports = { walkForwardBacktest, multiplierDistribution, sequenceAnalysis };
