'use strict';
const { pairedBlockBootstrapAudit } = require('./pattern-robustness');

function blockLengthSensitivity(rows, options = {}) {
  const lengths = Array.isArray(options.blockLengths) && options.blockLengths.length
    ? options.blockLengths.map(value => Math.max(1, Math.floor(Number(value))))
    : [3, 5, 10];
  if (lengths.some(value => !Number.isFinite(value))) throw new TypeError('blockLengths must be finite numbers');
  const replicates = Number.isFinite(options.replicates) ? Math.max(100, Math.floor(options.replicates)) : 1000;
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0xC0FFEE;
  const results = lengths.map((blockLength, index) => pairedBlockBootstrapAudit(rows, {
    blockLength, replicates, seed: (seed + index * 101) >>> 0
  }));
  const usable = results.filter(result => result.confidenceInterval95);
  const patternWins = usable.filter(result => result.confidenceInterval95.upper < 0).length;
  const baselineWins = usable.filter(result => result.confidenceInterval95.lower > 0).length;
  const intervalsOverlapZero = usable.length - patternWins - baselineWins;
  const verdict = usable.length === 0 ? 'insufficient_trace'
    : patternWins === usable.length ? 'pattern_advantage_stable_across_block_lengths'
      : baselineWins === usable.length ? 'baseline_advantage_stable_across_block_lengths'
        : 'conclusion_sensitive_to_block_length_or_uncertain';
  return {
    blockLengths: lengths,
    replicates,
    testedBlockLengths: usable.length,
    patternWins, baselineWins, intervalsOverlapZero,
    verdict,
    results,
    note: 'Sensitivity check across block sizes; a stable result is still only historical robustness evidence, not a prediction of future rounds.'
  };
}

module.exports = { blockLengthSensitivity };
