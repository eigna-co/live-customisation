const test = require('node:test');
const assert = require('node:assert/strict');
const { createHttpHandler } = require('../firebase-functions/http-adapter');
const { handler, _test } = require('../firebase-functions/redemption');
const config = require('../firebase.json');

function response() {
  return {
    set(headers) { this.headers = headers; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('Firebase serves only build output and routes both new and legacy endpoints', () => {
  assert.equal(config.hosting.public, 'dist');
  assert.deepEqual(config.hosting.rewrites.map((rule) => rule.source), [
    '/api/redemptions', '/.netlify/functions/airtable',
  ]);
  for (const rule of config.hosting.rewrites) {
    assert.equal(rule.function.functionId, 'redemptions');
    assert.equal(rule.function.region, 'asia-southeast1');
  }
  const headers = Object.fromEntries(config.hosting.headers[0].headers.map(({ key, value }) => [key, value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Content-Security-Policy'], /script-src 'self'/);
  assert.equal(headers['Cache-Control'], 'no-cache');
});

test('adapter preserves raw body, method, status and response headers', async () => {
  const res = response();
  await createHttpHandler(async (event) => {
    assert.equal(event.httpMethod, 'POST');
    assert.equal(event.body, '{"action":"unknown"}');
    assert.equal(event.clientAddress, '203.0.113.10');
    assert.deepEqual(event.headers, {});
    return { statusCode: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' }, body: '{"error":"slow down"}' };
  })({ method: 'POST', rawBody: Buffer.from('{"action":"unknown"}'), body: { ignored: true }, ip: '203.0.113.10', headers: { 'x-nf-client-connection-ip': 'spoofed' } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '60');
  assert.equal(res.body, '{"error":"slow down"}');
});

test('adapter handles parsed JSON and missing address without passing headers', async () => {
  await createHttpHandler(async (event) => {
    assert.equal(event.body, '{"action":"unknown"}');
    assert.equal(event.clientAddress, 'unknown');
    return { statusCode: 400, headers: {}, body: '{}' };
  })({ method: 'POST', body: { action: 'unknown' } }, response());
});

test('Firebase adapter and shared service reject non-POST, invalid JSON and null', async () => {
  for (const [method, body, expected] of [['GET', '', 405], ['POST', '{', 400], ['POST', 'null', 400], ['POST', '[]', 400], ['POST', '"text"', 400], ['POST', 'x'.repeat(10001), 400]]) {
    _test.resetRateLimit();
    const res = response();
    await createHttpHandler(handler)({ method, rawBody: Buffer.from(body) }, res);
    assert.equal(res.statusCode, expected);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});

test('Netlify and Firebase use exactly the same order service', () => {
  assert.equal(require('../netlify/functions/airtable').handler, handler);
});
