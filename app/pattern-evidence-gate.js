'use strict';

const { pairedBlockBootstrapAudit } = require('./pattern-robustness');
const { empiricalLowerTailP } = require('./pattern-empirical-p');
const { falseDiscoveryGuard } = require('./pattern-false-discovery-guard');

/**
 * Research-only evidence gate. Candidate rows must be leakage-safe OOS pairs.
 * Null samples must be produced by a pre-specified, valid procedure outside this gate.
 */
function evaluatePatternEvidenceGate(candidates, options = {}) {
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  const minEvaluations = Number.isFinite(options.minEvaluations) ? Math.max(20, Math.floor(options.minEvaluations)) : 100;
  const minNullSamples = Number.isFinite(options.minNullSamples) ? Math.max(1, Math.floor(options.minNullSamples)) : 100;
  const blockLengths = Array.isArray(options.blockLengths) ? options.blockLengths.slice() : [3, 5, 10];
  if (blockLengths.length < 2 || blockLengths.some(n => !Number.isInteger(n) || n < 1) || new Set(blockLengths).size !== blockLengths.length) {
    throw new TypeError('blockLengths must contain at least two distinct positive integers');
  }
  const seen = new Set();
  const evaluated = candidates.map(candidate => {
    if (!candidate || !Array.isArray(candidate.rows) || !Array.isArray(candidate.nullDifferences)) {
      throw new TypeError('each candidate requires rows and nullDifferences arrays');
    }
    const id = String(candidate.id ?? '').trim();
    if (!id) throw new TypeError('candidate id must be non-empty');
    if (seen.has(id)) throw new TypeError('candidate ids must be unique');
    seen.add(id);
    const rows = candidate.rows;
    if (rows.some(r => !r || !Number.isFinite(Number(r.patternBrier)) || !Number.isFinite(Number(r.baselineBrier)) ||
      Number(r.patternBrier) < 0 || Number(r.patternBrier) > 1 || Number(r.baselineBrier) < 0 || Number(r.baselineBrier) > 1)) {
      throw new TypeError('rows must contain paired Brier scores in [0, 1]');
    }
    const support = candidate.support === undefined ? rows.length : Number(candidate.support);
    if (!Number.isInteger(support) || support < 0) throw new TypeError('support must be a non-negative integer');
    const observedDifference = rows.length
      ? rows.reduce((s, r) => s + (Number(r.patternBrier) - Number(r.baselineBrier)), 0) / rows.length
      : NaN;
    const p = empiricalLowerTailP(observedDifference, candidate.nullDifferences, { minNullSamples });
    const audits = blockLengths.map(blockLength => pairedBlockBootstrapAudit(rows, {
      blockLength, replicates: options.replicates ?? 1000, seed: options.seed ?? 0xC0FFEE
    }));
    const enough = rows.length >= minEvaluations;
    const stable = enough && audits.every(a => a.confidenceInterval95 && a.confidenceInterval95.upper < 0);
    return { id, support, evaluationCount: rows.length, meanDifference: p.observedDifference,
      empiricalP: p.pValue, nullSamples: p.nullSamples, blockAudits: audits, enoughEvaluations: enough, robustAcrossBlocks: stable };
  });
  const fdr = falseDiscoveryGuard(evaluated.map(x => ({ id: x.id, pValue: x.empiricalP, support: x.support })), {
    alpha: options.alpha ?? 0.05, minSupport: options.minSupport ?? 20
  });
  const byId = new Map(fdr.candidates.map(x => [x.id, x]));
  const results = evaluated.map(x => {
    const corrected = byId.get(x.id);
    const passes = x.enoughEvaluations && x.robustAcrossBlocks && corrected && corrected.accepted;
    return { ...x, qValue: corrected ? corrected.qValue : null, fdrStatus: corrected ? corrected.status : 'missing', verdict: passes ? 'passes_research_gate' : 'does_not_pass_research_gate' };
  });
  return { gate: 'strict_pattern_evidence_v1', alpha: fdr.alpha, minEvaluations, minNullSamples, blockLengths: blockLengths.slice(),
    candidateCount: results.length, passedCount: results.filter(x => x.verdict === 'passes_research_gate').length,
    results, limitations: ['Research gate only; not a prediction or betting signal.',
      'Valid null samples and leakage-safe OOS rows are prerequisites and are not verified here.',
      'Passing does not establish causality or durable future performance.'] };
}

module.exports = { evaluatePatternEvidenceGate };
