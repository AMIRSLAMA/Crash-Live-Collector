'use strict';

function patternHoldoutDiscovery(items, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const values = items.map(item => Number(item && item.multiplier));
  if (values.some(value => !Number.isFinite(value) || value < 1)) throw new TypeError('items must contain valid multipliers');
  const trainFraction = Number.isFinite(options.trainFraction) ? options.trainFraction : 0.6;
  const minTrainSupport = Number.isFinite(options.minTrainSupport) ? Math.max(2, Math.floor(options.minTrainSupport)) : 8;
  const minTestSupport = Number.isFinite(options.minTestSupport) ? Math.max(1, Math.floor(options.minTestSupport)) : 5;
  const priorStrength = Number.isFinite(options.priorStrength) ? Math.max(0, options.priorStrength) : 10;
  if (!(trainFraction >= 0.5 && trainFraction <= 0.8)) throw new TypeError('trainFraction must be between 0.5 and 0.8');
  const splitIndex = Math.floor(values.length * trainFraction);
  if (splitIndex < 10 || values.length - splitIndex < 1) {
    return { totalRounds: values.length, trainRounds: splitIndex, testRounds: values.length - splitIndex,
      candidatesDiscovered: 0, candidatesEvaluated: 0, results: [], assessment: 'insufficient_history',
      message: 'holdout_discovery_needs_training_and_test_rows' };
  }
  const labels = values.map(value => value < 2 ? 1 : 0);
  const train = labels.slice(0, splitIndex), test = labels.slice(splitIndex);
  const trainBase = train.reduce((s, v) => s + v, 0) / train.length;
  const contexts = new Map();
  for (let i = 0; i < splitIndex; i++) {
    for (const length of [3,4,5]) {
      if (i < length) continue;
      const key = labels.slice(i-length, i).join('');
      const entry = contexts.get(key) || { length, key, trainMatches: 0, below: 0 };
      entry.trainMatches++; entry.below += labels[i]; contexts.set(key, entry);
    }
  }
  const candidates = [...contexts.values()].filter(c => c.trainMatches >= minTrainSupport);
  const results = [];
  for (const candidate of candidates) {
    let count=0, sumPatternBrier=0, sumBaseBrier=0, sumPatternLog=0, sumBaseLog=0;
    let belowTest=0, patternProb=(candidate.below + priorStrength*trainBase)/(candidate.trainMatches+priorStrength);
    const p=Math.min(1-1e-6,Math.max(1e-6,patternProb)), pb=Math.min(1-1e-6,Math.max(1e-6,trainBase));
    for(let target=splitIndex;target<values.length;target++){
      if(target<candidate.length)continue;
      if(labels.slice(target-candidate.length,target).join('')!==candidate.key)continue;
      const outcome=labels[target];count++;belowTest+=outcome;
      sumPatternBrier+=(patternProb-outcome)**2;sumBaseBrier+=(trainBase-outcome)**2;
      sumPatternLog+=-(outcome?Math.log(p):Math.log(1-p));
      sumBaseLog+=-(outcome?Math.log(pb):Math.log(1-pb));
    }
    if(count<minTestSupport)continue;
    const modelBrier=sumPatternBrier/count, baseBrier=sumBaseBrier/count;
    results.push({pattern:candidate.key,length:candidate.length,trainMatches:candidate.trainMatches,
      trainBelow2: candidate.below, trainProbabilityBelow2:Number(patternProb.toFixed(6)),
      testMatches:count,testBelow2:belowTest,testBelow2Percent:Number((belowTest/count*100).toFixed(2)),
      patternBrier:Number(modelBrier.toFixed(6)),baselineBrier:Number(baseBrier.toFixed(6)),
      brierDifference:Number((modelBrier-baseBrier).toFixed(6)),
      brierImprovementPercent:baseBrier===0?null:Number(((baseBrier-modelBrier)/baseBrier*100).toFixed(2)),
      patternLogLoss:Number((sumPatternLog/count).toFixed(6)),baselineLogLoss:Number((sumBaseLog/count).toFixed(6))});
  }
  results.sort((a,b)=>a.brierDifference-b.brierDifference);
  return {totalRounds:values.length,trainRounds:train.length,testRounds:test.length,splitIndex,
    trainBaselineBelow2:Number(trainBase.toFixed(6)),candidatesDiscovered:candidates.length,
    candidatesEvaluated:results.length,results:results.slice(0,30),
    assessment:'exploratory_holdout_only_multiple_candidate_selection_not_corrected',
    caveats:['Chronological split: candidate discovery uses the first training segment only; test outcomes are not used to discover contexts.',
      'Ranking many candidates on the same holdout creates selection bias; the top result is not confirmatory evidence.',
      'No null/permutation test or multiple-comparison correction is applied in this exploratory report.',
      'A result describes this recorded dataset only; random outcomes may not be predictable.']};
}
module.exports={patternHoldoutDiscovery};
