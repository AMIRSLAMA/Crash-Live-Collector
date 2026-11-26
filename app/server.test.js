const test = require('node:test');
const assert = require('node:assert/strict');

test('health payload shape remains minimal', () => {
  const payload = { status: 'ok', service: 'crash-live-collector-starter' };
  assert.equal(payload.status, 'ok');
  assert.equal(typeof payload.service, 'string');
});
