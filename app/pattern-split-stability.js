'use strict';
const { patternHoldoutDiscovery } = require('./pattern-holdout-discovery');

/**
 * Repeat chronological discovery with predeclared training fractions.
 * This is a descriptive stability check, not independent confirmation:
 * test windows overlap and candidates are repeatedly screened.
 */
function patternSplitStability(items, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const splits = options.splits || [0.5, 0.6, 0.7, 0.8];
  if (!Array.isArray(splits) || splits.length < 2 || splits.some(x => !Number.isFinite(x) || x < 0.5 || x > 0.8) || new Set(splits).size !== splits.length) {
    throw new TypeError('splits must contain at least two unique fractions between 0.5 and 0.8');
  }
  const reports = splits.map(trainFraction => patternHoldoutDiscovery(items, {
    trainFraction, minTrainSupport: options.minTrainSupport ?? 8,
    minTestSupport: options.minTestSupport ?? 5, priorStrength: options.priorStrength ?? 10
  }));
  const candidates = new Map();
  for (const report of reports) {
    for (const row of report.results) {
      const entry = candidates.get(row.pattern) || { pattern: row.pattern, length: row.length, appearances: 0, betterThanBaselineCount: 0, differences: [], splits: [] };
      entry.appearances++;
      if (row.brierDifference < 0) entry.betterThanBaselineCount++;
      entry.differences.push(row.brierDifference);
      entry.splits.push({ trainFraction: report.trainRounds / report.totalRounds, trainMatches: row.trainMatches, testMatches: row.testMatches, patternBrier: row.patternBrier, baselineBrier: row.baselineBrier, brierDifference: row.brierDifference });
      candidates.set(row.pattern, entry);
    }
  }
  const results = [...candidates.values()].map(entry => ({
    pattern: entry.pattern, length: entry.length, appearances: entry.appearances, splitsEvaluated: splits.length,
    betterThanBaselineCount: entry.betterThanBaselineCount,
    recurrenceRate: Number((entry.appearances / splits.length).toFixed(4)),
    meanBrierDifferenceWhenPresent: Number((entry.differences.reduce((a,b)=>a+b,0)/entry.differences.length).toFixed(6)),
    splitDetails: entry.splits
  })).sort((a,b) => b.appearances-a.appearances || a.meanBrierDifferenceWhenPresent-b.meanBrierDifferenceWhenPresent || a.pattern.localeCompare(b.pattern));
  const recurrentCandidates = results.filter(r => r.appearances >= 3).slice(0,20);
  const consistentlyBetterCandidates = results.filter(r => r.appearances >= 3 && r.betterThanBaselineCount >= 3 && r.meanBrierDifferenceWhenPresent < 0).slice(0,20);
  return { totalRounds: items.length, splits, reports: reports.map(r => ({ trainRounds:r.trainRounds, testRounds:r.testRounds, candidatesDiscovered:r.candidatesDiscovered, candidatesEvaluated:r.candidatesEvaluated })), candidatesTracked: results.length, results:results.slice(0,30), recurrentCandidates, consistentlyBetterCandidates, assessment:'descriptive_split_stability_not_confirmatory',
    caveats:['The chronological test windows overlap and are not independent replicates.', 'Candidate selection is repeated across splits; the reported best patterns are selection-biased.',
    'The consistently-better shortlist is only a conservative descriptive screen (present in at least 3 splits, better than baseline in at least 3, and negative mean Brier difference); it is not confirmation.', 'This audit measures stability only and does not establish predictive edge or future performance.'] };
}
module.exports = { patternSplitStability };
