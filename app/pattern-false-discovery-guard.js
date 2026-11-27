'use strict';

/**
 * Conservative multiple-testing guard for pattern candidates.
 * Accepts already-computed p-values from a separate, valid evaluation procedure.
 * This module does not calculate p-values or claim future predictability.
 */
function falseDiscoveryGuard(candidates, options = {}) {
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  const alpha = Number.isFinite(options.alpha) ? options.alpha : 0.05;
  const minSupport = Number.isFinite(options.minSupport) ? Math.max(1, Math.floor(options.minSupport)) : 20;
  if (!(alpha > 0 && alpha < 1)) throw new TypeError('alpha must be between 0 and 1');

  const seen = new Set();
  const normalized = candidates.map((candidate, index) => {
    const id = String(candidate && candidate.id != null ? candidate.id : index);
    if (seen.has(id)) throw new TypeError('candidate ids must be unique');
    seen.add(id);
    const pValue = Number(candidate && candidate.pValue);
    const support = Number(candidate && candidate.support);
    if (!Number.isFinite(pValue) || pValue < 0 || pValue > 1) throw new TypeError('pValue must be in [0, 1]');
    if (!Number.isFinite(support) || support < 0) throw new TypeError('support must be a non-negative finite number');
    return { id, pValue, support, eligible: support >= minSupport, qValue: null, accepted: false };
  });

  const eligible = normalized.filter(item => item.eligible).sort((a, b) => a.pValue - b.pValue);
  // Benjamini-Hochberg adjusted p-values, monotonized from the largest rank down.
  let running = 1;
  for (let i = eligible.length - 1; i >= 0; i--) {
    const rank = i + 1;
    running = Math.min(running, eligible[i].pValue * eligible.length / rank);
    eligible[i].qValue = Number(Math.min(1, running).toFixed(8));
    eligible[i].accepted = eligible[i].qValue <= alpha;
  }
  return {
    alpha, minSupport, testedCandidates: eligible.length,
    acceptedCount: eligible.filter(item => item.accepted).length,
    candidates: normalized.map(item => ({
      ...item,
      qValue: item.qValue == null ? null : item.qValue,
      status: !item.eligible ? 'rejected_insufficient_support'
        : item.accepted ? 'passes_fdr_threshold' : 'not_significant_after_correction'
    })),
    note: 'Only candidates meeting support and BH-adjusted q-value thresholds pass. Validity depends on p-values from a pre-specified evaluation; correction cannot repair data leakage or invalid tests.'
  };
}

module.exports = { falseDiscoveryGuard };
