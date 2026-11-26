'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataAudit } = require('./data-audit');

const base = '2026-11-26T12:00:00.000Z';
const round = (id, offset = 0, source = 'chrome-extension') => ({
  roundId: id,
  multiplier: 1.75,
  occurredAt: new Date(Date.parse(base) + offset).toISOString(),
  recordedAt: new Date(Date.parse(base) + offset).toISOString(),
  source
});

test('clean chronological sample returns zero integrity warnings', () => {
  const result = dataAudit([round('a'), round('b', 10000)]);
  assert.equal(result.totalRounds, 2);
  assert.equal(result.warnings, 0);
  assert.equal(result.checks.duplicateRoundIds, 0);
  assert.equal(result.sourceCounts['chrome-extension'], 2);
});

test('detects duplicate IDs, invalid timestamps and occurrence-order reversals', () => {
  const first = round('same', 10000);
  const second = round('same', 5000);
  second.recordedAt = new Date(Date.parse(base) + 15000).toISOString();
  const bad = { roundId: 'bad', multiplier: 1.2, occurredAt: 'not-a-date', recordedAt: null, source: 'manual' };
  const result = dataAudit([first, second, bad]);
  assert.equal(result.checks.duplicateRoundIds, 1);
  assert.equal(result.checks.occurrenceOrderReversals, 1);
  assert.equal(result.checks.invalidOccurredAt, 1);
  assert.equal(result.checks.invalidRecordedAt, 1);
});

test('detects only long capture intervals and does not label them missing rounds', () => {
  const result = dataAudit([round('a'), round('b', 121000), round('c', 130000, 'manual')]);
  assert.equal(result.checks.captureGapsOver120Seconds, 1);
  assert.ok(result.notes.some(note => note.includes('not proof')));
  assert.equal(result.details.captureGaps[0].gapSeconds, 121);
});

test('detects occurrence timestamps far after recording time', () => {
  const item = round('future', 400000);
  item.recordedAt = base;
  const result = dataAudit([item]);
  assert.equal(result.checks.occurrenceTimestampMoreThan5MinutesAfterRecord, 1);
});

test('empty sample is supported and non-array input is rejected', () => {
  assert.equal(dataAudit([]).totalRounds, 0);
  assert.throws(() => dataAudit(null), TypeError);
});
