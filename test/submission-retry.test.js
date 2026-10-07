const test = require('node:test');
const assert = require('node:assert/strict');
const { withSubmissionRetry } = require('../src/submission-retry');
test('temporary order failures retry the identical operation with bounded backoff', async () => {
  let calls = 0; const waits = []; const details = { requestId: 'fixed', text: 'Jane' };
  const result = await withSubmissionRetry(async () => { assert.equal(details.requestId, 'fixed'); if (++calls < 3) throw Object.assign(new Error(), { status: 503 }); return 'same-receipt'; }, { sleep: async ms => waits.push(ms), random: () => 0 });
  assert.equal(result, 'same-receipt'); assert.equal(calls, 3); assert.deepEqual(waits, [1000, 2000]);
});
test('permanent order errors and rate limits are never automatically retried', async () => {
  for (const status of [400, 401, 403, 409, 422, 429]) {
    let calls = 0;
    await assert.rejects(withSubmissionRetry(async () => { calls++; throw Object.assign(new Error(), { status }); }));
    assert.equal(calls, 1);
  }
});
test('uncertain network failures are bounded to three attempts and preserve final error', async () => {
  for (const error of [new TypeError('Network unavailable'), Object.assign(new Error(), { name: 'AbortError' })]) {
    let calls = 0;
    await assert.rejects(withSubmissionRetry(async () => { calls++; throw error; }, { sleep: async () => {}, random: () => .5 }), actual => actual === error);
    assert.equal(calls, 3);
  }
});
