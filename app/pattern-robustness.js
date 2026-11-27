'use strict';

function pairedBlockBootstrapAudit(rows, options = {}) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const blockLength = Number.isFinite(options.blockLength) ? Math.max(1, Math.floor(options.blockLength)) : 5;
  const replicates = Number.isFinite(options.replicates) ? Math.max(100, Math.floor(options.replicates)) : 1000;
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) >>> 0 : 0xC0FFEE;
  const differences = rows.map(row => Number(row && row.patternBrier) - Number(row && row.baselineBrier));
  if (differences.some(value => !Number.isFinite(value))) throw new TypeError('rows must contain finite paired Brier scores');
  if (differences.length < 20) {
    return {
      sampleSize: differences.length, blockLength, replicates,
      meanBrierDifference: null, confidenceInterval95: null,
      assessment: 'insufficient_trace_for_block_bootstrap',
      note: 'Bootstrap is a stability diagnostic, not evidence of future predictability.'
    };
  }

  // Deterministic PRNG keeps CI and repeated audits reproducible.
  let state = seed || 1;
  function random() {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  }
  const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
  const observed = mean(differences);
  const sampledMeans = [];
  for (let b = 0; b < replicates; b++) {
    const sample = [];
    while (sample.length < differences.length) {
      const start = Math.floor(random() * differences.length);
      for (let offset = 0; offset < blockLength && sample.length < differences.length; offset++) {
        sample.push(differences[(start + offset) % differences.length]);
      }
    }
    sampledMeans.push(mean(sample));
  }
  sampledMeans.sort((a, b) => a - b);
  const percentile = p => sampledMeans[Math.min(sampledMeans.length - 1, Math.max(0, Math.floor(p * sampledMeans.length)))];
  const lower = percentile(0.025), upper = percentile(0.975);
  const assessment = upper < 0
    ? 'pattern_brier_lower_in_bootstrap_interval'
    : lower > 0
      ? 'baseline_brier_lower_in_bootstrap_interval'
      : 'interval_overlaps_zero_no_clear_difference';
  return {
    sampleSize: differences.length, blockLength, replicates,
    meanBrierDifference: Number(observed.toFixed(6)),
    confidenceInterval95: { lower: Number(lower.toFixed(6)), upper: Number(upper.toFixed(6)) },
    assessment,
    note: 'Negative paired difference favors the pattern model; positive favors baseline. This bootstrap only describes the supplied trace and does not establish predictive edge.'
  };
}

module.exports = { pairedBlockBootstrapAudit };
