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


function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function volatilityAnalysis(items, requestedGroupSize = 20) {
  const groupSize = Math.min(100, Math.max(5, Number.isFinite(requestedGroupSize) ? Math.floor(requestedGroupSize) : 20));
  if (!Array.isArray(items) || items.some(item => !item || !Number.isFinite(Number(item.multiplier)) || Number(item.multiplier) < 1)) {
    throw new TypeError('items must contain valid multipliers');
  }
  const values = items.map(item => Number(item.multiplier));
  const blocks = [];
  for (let start = 0; start < values.length; start += groupSize) {
    const chunk = values.slice(start, start + groupSize);
    const sorted = chunk.slice().sort((x, y) => x - y);
    const center = median(sorted);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const deviations = sorted.map(value => Math.abs(value - center)).sort((x, y) => x - y);
    const below2 = chunk.filter(value => value < 2).length;
    blocks.push({
      fromRound: start + 1,
      toRound: start + chunk.length,
      count: chunk.length,
      median: Number(center.toFixed(4)),
      q1: Number(q1.toFixed(4)),
      q3: Number(q3.toFixed(4)),
      iqr: Number((q3 - q1).toFixed(4)),
      mad: Number(median(deviations).toFixed(4)),
      below2Percent: Number((below2 / chunk.length * 100).toFixed(1))
    });
  }
  const spreads = blocks.map(block => block.iqr).sort((x, y) => x - y);
  const lowThreshold = quantile(spreads, 1 / 3);
  const highThreshold = quantile(spreads, 2 / 3);
  for (const block of blocks) {
    block.volatility = lowThreshold === highThreshold
      ? 'similar'
      : block.iqr <= lowThreshold ? 'lower' : block.iqr >= highThreshold ? 'higher' : 'middle';
  }
  const categories = ['lower', 'middle', 'higher', 'similar'];
  const groups = Object.fromEntries(categories.map(category => {
    const selected = blocks.filter(block => block.volatility === category);
    const average = key => selected.length ? Number((selected.reduce((sum, block) => sum + block[key], 0) / selected.length).toFixed(4)) : null;
    return [category, {
      blocks: selected.length,
      rounds: selected.reduce((sum, block) => sum + block.count, 0),
      averageIqr: average('iqr'),
      averageMad: average('mad'),
      averageBelow2Percent: average('below2Percent'),
      medianMultiplier: selected.length ? Number(median(selected.map(block => block.median)).toFixed(4)) : null
    }];
  }));
  return {
    totalRounds: values.length,
    groupSize,
    totalBlocks: blocks.length,
    thresholds: { lowerIqrMax: lowThreshold, higherIqrMin: highThreshold },
    groups,
    blocks: blocks.slice(-20),
    interpretation: 'descriptive_historical_volatility_not_a_future_prediction'
  };
}

module.exports = { walkForwardBacktest, multiplierDistribution, sequenceAnalysis, volatilityAnalysis };


function outOfSampleTest(items, requestedWindow = 30) {
  const window = Math.min(500, Math.max(10, Number.isFinite(requestedWindow) ? Math.floor(requestedWindow) : 30));
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const values = items.map(item => Number(item && item.multiplier));
  if (values.some(value => !Number.isFinite(value) || value < 1)) {
    throw new TypeError('items must contain valid multipliers');
  }
  if (values.length <= window) {
    return {
      window, totalRounds: values.length, evaluated: 0,
      rollingBrier: null, expandingBaselineBrier: null, brierImprovementPercent: null,
      rollingLogLoss: null, expandingBaselineLogLoss: null,
      rollingAccuracyPercent: null, expandingBaselineAccuracyPercent: null,
      averagePredictedBelow2Percent: null, observedBelow2Percent: null,
      assessment: 'insufficient_history',
      message: 'out_of_sample_test_requires_more_rounds_than_training_window'
    };
  }

  const epsilon = 1e-6;
  let rollingBrier = 0, baselineBrier = 0, rollingLogLoss = 0, baselineLogLoss = 0;
  let rollingCorrect = 0, baselineCorrect = 0, predictedProbabilitySum = 0, observedBelow2 = 0;
  let evaluated = 0;
  const evaluationRows = [];
  const scoreLogLoss = (p, outcome) => -(outcome ? Math.log(p) : Math.log(1 - p));
  for (let index = window; index < values.length; index++) {
    const history = values.slice(index - window, index);
    const expandingHistory = values.slice(0, index);
    const rollingProbability = history.filter(value => value < 2).length / history.length;
    const baselineProbability = expandingHistory.filter(value => value < 2).length / expandingHistory.length;
    const outcome = values[index] < 2 ? 1 : 0;
    const rollingP = Math.min(1 - epsilon, Math.max(epsilon, rollingProbability));
    const baselineP = Math.min(1 - epsilon, Math.max(epsilon, baselineProbability));
    rollingBrier += (rollingProbability - outcome) ** 2;
    baselineBrier += (baselineProbability - outcome) ** 2;
    rollingLogLoss += scoreLogLoss(rollingP, outcome);
    baselineLogLoss += scoreLogLoss(baselineP, outcome);
    if ((rollingProbability >= 0.5 ? 1 : 0) === outcome) rollingCorrect++;
    if ((baselineProbability >= 0.5 ? 1 : 0) === outcome) baselineCorrect++;
    predictedProbabilitySum += rollingProbability;
    observedBelow2 += outcome;
    evaluationRows.push({ roundIndex: index + 1, rollingProbabilityBelow2: Number(rollingProbability.toFixed(6)), baselineProbabilityBelow2: Number(baselineProbability.toFixed(6)), actualBelow2: Boolean(outcome), rollingBrier: Number(((rollingProbability - outcome) ** 2).toFixed(6)), baselineBrier: Number(((baselineProbability - outcome) ** 2).toFixed(6)) });
    evaluated++;
  }
  const modelBrier = rollingBrier / evaluated;
  const baseBrier = baselineBrier / evaluated;
  const improvement = baseBrier === 0 ? null : (baseBrier - modelBrier) / baseBrier * 100;
  const assessment = evaluated < 100
    ? 'descriptive_only_need_at_least_100_evaluations'
    : modelBrier < baseBrier ? 'rolling_model_better_on_this_sample'
      : modelBrier > baseBrier ? 'expanding_baseline_better_on_this_sample' : 'no_brier_difference_on_this_sample';
  return {
    window,
    totalRounds: values.length,
    evaluated,
    rollingBrier: Number(modelBrier.toFixed(6)),
    expandingBaselineBrier: Number(baseBrier.toFixed(6)),
    brierImprovementPercent: improvement === null ? null : Number(improvement.toFixed(2)),
    rollingLogLoss: Number((rollingLogLoss / evaluated).toFixed(6)),
    expandingBaselineLogLoss: Number((baselineLogLoss / evaluated).toFixed(6)),
    rollingAccuracyPercent: Number((rollingCorrect / evaluated * 100).toFixed(2)),
    expandingBaselineAccuracyPercent: Number((baselineCorrect / evaluated * 100).toFixed(2)),
    averagePredictedBelow2Percent: Number((predictedProbabilitySum / evaluated * 100).toFixed(2)),
    observedBelow2Percent: Number((observedBelow2 / evaluated * 100).toFixed(2)),
    assessment,
    recentEvaluations: evaluationRows.slice(-50),
    message: 'strict_walk_forward_uses_only_prior_rounds_no_future_data'
  };
}

module.exports = { walkForwardBacktest, multiplierDistribution, sequenceAnalysis, volatilityAnalysis, outOfSampleTest };


function below2Confidence(items, threshold = 2) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Number.isFinite(threshold) || threshold <= 0) throw new TypeError('threshold must be a positive number');
  const values = items.map(item => Number(item && item.multiplier));
  if (values.some(value => !Number.isFinite(value) || value < 1)) throw new TypeError('items must contain valid multipliers');
  const total = values.length;
  if (!total) return { totalRounds: 0, belowThreshold: 0, threshold, proportion: null, confidenceLevel: 0.95, confidenceInterval: null, method: 'wilson_score', assumption: 'independent_bernoulli_sample' };
  const below = values.filter(value => value < threshold).length;
  const p = below / total;
  const z = 1.959963984540054;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const halfWidth = z * Math.sqrt((p * (1 - p) / total) + z2 / (4 * total * total)) / denominator;
  return {
    totalRounds: total, belowThreshold: below, threshold,
    proportion: Number(p.toFixed(6)), percent: Number((p * 100).toFixed(2)),
    confidenceLevel: 0.95,
    confidenceInterval: { lower: Number(Math.max(0, center - halfWidth).toFixed(6)), upper: Number(Math.min(1, center + halfWidth).toFixed(6)), lowerPercent: Number((Math.max(0, center - halfWidth) * 100).toFixed(2)), upperPercent: Number((Math.min(1, center + halfWidth) * 100).toFixed(2)) },
    method: 'wilson_score', assumption: 'independent_bernoulli_sample',
    note: 'Confidence interval describes the observed sample proportion under a binomial assumption; it is not a forecast of the next round.'
  };
}

module.exports = { walkForwardBacktest, multiplierDistribution, sequenceAnalysis, volatilityAnalysis, outOfSampleTest, below2Confidence, sequencePatternTest };

function sequencePatternTest(items, requestedWindow = 50, minMatches = 8, priorStrength = 10) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Number.isFinite(requestedWindow)) throw new TypeError('window must be finite');
  if (!Number.isFinite(minMatches) || minMatches < 2) throw new TypeError('minMatches must be at least 2');
  if (!Number.isFinite(priorStrength) || priorStrength <= 0) throw new TypeError('priorStrength must be positive');
  const window = Math.min(500, Math.max(30, Math.floor(requestedWindow)));
  const values = items.map(item => Number(item && item.multiplier));
  if (values.some(value => !Number.isFinite(value) || value < 1)) throw new TypeError('items must contain valid multipliers');
  const labels = values.map(value => value < 2 ? 1 : 0);
  if (values.length <= window) return { window, totalRounds: values.length, evaluated: 0, patternPredictions: 0, rollingBrier: null, baselineBrier: null, brierImprovementPercent: null, rollingLogLoss: null, baselineLogLoss: null, rollingAccuracyPercent: null, baselineAccuracyPercent: null, assessment: 'insufficient_history', recentEvaluations: [], patternLengthCounts: {3:0,4:0,5:0}, message: 'strict_walk_forward_pattern_test_requires_more_rounds_than_window' };
  const epsilon=1e-6;
  let modelBrier=0, baseBrier=0, modelLog=0, baseLog=0, modelCorrect=0, baseCorrect=0, patternPredictions=0;
  const rows=[], patternLengthCounts={3:0,4:0,5:0};
  for(let i=window;i<values.length;i++){
    const start=Math.max(0,i-window), historyLabels=labels.slice(start,i);
    const baseline=historyLabels.reduce((sum,x)=>sum+x,0)/historyLabels.length;
    let selected=null;
    for(const length of [3,4,5]){
      if(i-start<length)continue;
      const key=labels.slice(i-length,i).join('');
      let matches=0, below=0;
      for(let end=start+length-1;end<=i-2;end++){
        if(labels.slice(end-length+1,end+1).join('')===key){matches++;below+=labels[end+1];}
      }
      if(matches>=minMatches)selected={length,key,matches,below,probability:(below+priorStrength*baseline)/(matches+priorStrength)};
    }
    const usedPattern=Boolean(selected), probability=usedPattern?selected.probability:baseline, actual=labels[i];
    const safeP=Math.min(1-epsilon,Math.max(epsilon,probability)), safeBase=Math.min(1-epsilon,Math.max(epsilon,baseline));
    const brier=(probability-actual)**2, base=(baseline-actual)**2;
    modelBrier+=brier;baseBrier+=base;modelLog+=-(actual?Math.log(safeP):Math.log(1-safeP));baseLog+=-(actual?Math.log(safeBase):Math.log(1-safeBase));
    if((probability>=.5?1:0)===actual)modelCorrect++;if((baseline>=.5?1:0)===actual)baseCorrect++;
    if(usedPattern){patternPredictions++;patternLengthCounts[selected.length]++;}
    rows.push({roundIndex:i+1,patternLength:usedPattern?selected.length:null,pattern:usedPattern?selected.key:null,patternMatches:usedPattern?selected.matches:0,patternBelow2:usedPattern?selected.below:0,usedPattern,patternProbabilityBelow2:Number(probability.toFixed(6)),baselineProbabilityBelow2:Number(baseline.toFixed(6)),actualBelow2:Boolean(actual),patternBrier:Number(brier.toFixed(6)),baselineBrier:Number(base.toFixed(6))});
  }
  const evaluated=rows.length, meanModel=modelBrier/evaluated, meanBase=baseBrier/evaluated;
  const assessment=evaluated<100?'descriptive_only_need_at_least_100_evaluations':meanModel<meanBase?'pattern_model_better_on_this_sample':meanModel>meanBase?'baseline_better_on_this_sample':'no_brier_difference_on_this_sample';
  return {window,totalRounds:values.length,evaluated,patternPredictions,rollingBrier:Number(meanModel.toFixed(6)),baselineBrier:Number(meanBase.toFixed(6)),brierImprovementPercent:meanBase===0?null:Number(((meanBase-meanModel)/meanBase*100).toFixed(2)),rollingLogLoss:Number((modelLog/evaluated).toFixed(6)),baselineLogLoss:Number((baseLog/evaluated).toFixed(6)),rollingAccuracyPercent:Number((modelCorrect/evaluated*100).toFixed(2)),baselineAccuracyPercent:Number((baseCorrect/evaluated*100).toFixed(2)),patternLengthCounts,assessment,recentEvaluations:rows.slice(-50),message:'strict_walk_forward_patterns_only_prior_rounds_with_baseline_comparison'};
}
