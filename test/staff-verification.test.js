const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueueHandler } = require('../firebase-functions/queue-service');
const { _test } = require('../firebase-functions/redemption');

async function login({ role = 'nuvei', verified = false, sendOk = true, tokenError = false, signInOk = true } = {}) {
  _test.resetRateLimit();
  const requests = [];
  const handler = createQueueHandler({
    getDb: () => { throw new Error('No database writes allowed'); },
    webApiKey: () => 'test-key',
    verifyToken: async () => { if (tokenError) throw new Error('Revoked'); return { eventStaff: role, email_verified: verified }; },
    authFetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return url.includes('signInWithPassword')
        ? { ok: signInOk, json: async () => ({ idToken: signInOk ? 'private-test-token' : undefined, expiresIn: '3600' }) }
        : { ok: sendOk };
    },
  });
  const response = await handler({ httpMethod: 'POST', clientAddress: 'test', body: JSON.stringify({ action: 'staff-sign-in', email: 'staff@example.test', password: 'test-only' }) });
  return { response, body: JSON.parse(response.body), requests };
}
test('approved unverified staff receive a verification email but no session token', async () => {
  const { response, body, requests } = await login();
  assert.equal(response.statusCode, 403);
  assert.equal(body.code, 'verification-required');
  assert.equal(body.idToken, undefined);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].body, { requestType: 'VERIFY_EMAIL', idToken: 'private-test-token' });
});
test('unapproved, revoked and incorrect-password sign-ins never send verification emails', async () => {
  for (const options of [{ role: 'other' }, { tokenError: true }, { signInOk: false }]) {
    const result = await login(options);
    assert.ok([401, 403].includes(result.response.statusCode));
    assert.equal(result.requests.length, 1);
    assert.equal(result.body.idToken, undefined);
  }
});
test('verified staff sign in normally without another email', async () => {
  const result = await login({ verified: true });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.body.idToken, 'private-test-token');
  assert.equal(result.requests.length, 1);
});
test('verification provider failures never grant access or claim an email was sent', async () => {
  const result = await login({ sendOk: false });
  assert.equal(result.response.statusCode, 403);
  assert.match(result.body.error, /could not be sent/);
  assert.equal(result.body.idToken, undefined);
});
