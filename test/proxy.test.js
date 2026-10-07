const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/queue');
const fs = require('node:fs');
test('proxy rejects wrong methods, oversized bodies and invalid explicit configuration', async () => {
  const old = process.env.FIREBASE_QUEUE_URL;
  process.env.FIREBASE_QUEUE_URL = '';
  try {
    assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
    assert.equal((await handler({ httpMethod: 'POST', body: 'x'.repeat(10001) })).statusCode, 400);
    assert.equal((await handler({ httpMethod: 'POST', body: '{}' })).statusCode, 503);
  } finally { if (old === undefined) delete process.env.FIREBASE_QUEUE_URL; else process.env.FIREBASE_QUEUE_URL = old; }
});

test('proxy uses only the approved event backend when no environment override is set', async () => {
  const oldUrl = process.env.FIREBASE_QUEUE_URL; const oldFetch = global.fetch;
  delete process.env.FIREBASE_QUEUE_URL;
  let calls = 0;
  global.fetch = async (target, options) => {
    calls++;
    assert.equal(target.href, 'https://redemptions-s3i7tgf25a-as.a.run.app/');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, '{"action":"get-service-config"}');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    return { status: 200, json: async () => ({ transactional: true, staffLoginConfigured: true }) };
  };
  try {
    const result = await handler({ httpMethod: 'POST', body: '{"action":"get-service-config"}' });
    assert.equal(result.statusCode, 200);
    assert.equal(calls, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.FIREBASE_QUEUE_URL; else process.env.FIREBASE_QUEUE_URL = oldUrl;
  }
});
test('proxy only contacts approved HTTPS backend hosts and passes bearer auth only', async () => {
  const oldUrl = process.env.FIREBASE_QUEUE_URL; const oldFetch = global.fetch;
  let calls = 0;
  global.fetch = async (target, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer sample' });
    return { status: 429, json: async () => ({ error: 'Slow down' }) };
  };
  const event = { httpMethod: 'POST', body: '{}', headers: { authorization: 'Bearer sample', 'x-forwarded-for': 'spoofed' } };
  try {
    for (const url of ['http://example.cloudfunctions.net/f', 'https://example.com/f', 'https://example.cloudfunctions.net.evil.test/f', 'https://user:pass@example.cloudfunctions.net/f']) {
      process.env.FIREBASE_QUEUE_URL = url;
      assert.equal((await handler(event)).statusCode, 503);
    }
    assert.equal(calls, 0);
    process.env.FIREBASE_QUEUE_URL = 'https://example.cloudfunctions.net/redemptions';
    const response = await handler(event);
    assert.equal(response.statusCode, 429); assert.equal(response.headers['Retry-After'], '60');
    assert.equal(calls, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.FIREBASE_QUEUE_URL; else process.env.FIREBASE_QUEUE_URL = oldUrl;
  }
});
test('client database rules deny direct access and publish directory excludes source', () => {
  const rules = fs.readFileSync(require.resolve('../firestore.rules'), 'utf8');
  assert.match(rules, /allow read, write: if false/);
  const netlify = fs.readFileSync(require.resolve('../netlify.toml'), 'utf8');
  assert.match(netlify, /publish = "dist"/);
});
