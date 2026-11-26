'use strict';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CAPTURE_GAP_WARNING_MS = 120 * 1000;

function dataAudit(items) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const duplicateIds = [];
  const seenIds = new Set();
  const invalidOccurredAt = [];
  const invalidRecordedAt = [];
  const occurrenceOrderReversals = [];
  const futureOccurrence = [];
  const captureGaps = [];
  const sourceCounts = {};
  const validRecorded = [];

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      invalidOccurredAt.push(index + 1);
      invalidRecordedAt.push(index + 1);
      return;
    }
    const id = String(item.roundId ?? '');
    if (id && seenIds.has(id)) duplicateIds.push(id);
    if (id) seenIds.add(id);
    const source = item.source === 'chrome-extension' ? 'chrome-extension' : 'manual-or-import';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;

    const occurred = Date.parse(item.occurredAt);
    const recorded = Date.parse(item.recordedAt);
    if (!Number.isFinite(occurred)) invalidOccurredAt.push(index + 1);
    if (!Number.isFinite(recorded)) invalidRecordedAt.push(index + 1);
    else validRecorded.push({ index: index + 1, recordedAt: recorded, source });

    if (Number.isFinite(occurred) && Number.isFinite(recorded) && occurred - recorded > MAX_CLOCK_SKEW_MS) {
      futureOccurrence.push(index + 1);
    }
    if (index > 0) {
      const previous = items[index - 1];
      const previousOccurred = Date.parse(previous && previous.occurredAt);
      if (Number.isFinite(previousOccurred) && Number.isFinite(occurred) && occurred < previousOccurred) {
        occurrenceOrderReversals.push({ fromRound: index, toRound: index + 1 });
      }
    }
  });

  const captureItems = validRecorded.filter(row => row.source === 'chrome-extension');
  for (let i = 1; i < captureItems.length; i++) {
    const gapMs = captureItems[i].recordedAt - captureItems[i - 1].recordedAt;
    if (gapMs > CAPTURE_GAP_WARNING_MS) {
      captureGaps.push({
        fromRound: captureItems[i - 1].index,
        toRound: captureItems[i].index,
        gapSeconds: Math.floor(gapMs / 1000)
      });
    }
  }

  const issueCount = duplicateIds.length + invalidOccurredAt.length + invalidRecordedAt.length +
    occurrenceOrderReversals.length + futureOccurrence.length;
  return {
    totalRounds: items.length,
    sourceCounts,
    checks: {
      duplicateRoundIds: duplicateIds.length,
      invalidOccurredAt: invalidOccurredAt.length,
      invalidRecordedAt: invalidRecordedAt.length,
      occurrenceOrderReversals: occurrenceOrderReversals.length,
      occurrenceTimestampMoreThan5MinutesAfterRecord: futureOccurrence.length,
      captureGapsOver120Seconds: captureGaps.length
    },
    details: {
      duplicateRoundIds: duplicateIds.slice(0, 50),
      invalidOccurredAtRoundIndexes: invalidOccurredAt.slice(0, 50),
      invalidRecordedAtRoundIndexes: invalidRecordedAt.slice(0, 50),
      occurrenceOrderReversals: occurrenceOrderReversals.slice(0, 50),
      futureOccurrenceRoundIndexes: futureOccurrence.slice(0, 50),
      captureGaps: captureGaps.slice(0, 50)
    },
    warnings: issueCount + captureGaps.length,
    notes: [
      'Ingestion order is not guaranteed to equal occurrence-time order.',
      'A capture gap is a time interval between received rounds, not proof that rounds were missed.',
      'This audit checks record integrity only; it does not infer or predict game outcomes.'
    ]
  };
}

module.exports = { dataAudit };
