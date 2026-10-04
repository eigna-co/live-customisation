const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createRequestId } = require('../src/request-id');
test('uses native secure UUID generation when available', () => {
  const uuid = webcrypto.randomUUID();
  assert.equal(createRequestId({ randomUUID: () => uuid }), uuid);
});
test('LAN HTTP fallback generates valid unique version-four request IDs', () => {
  const source = { getRandomValues: array => webcrypto.getRandomValues(array) };
  const ids = Array.from({ length: 100 }, () => createRequestId(source));
  ids.forEach(id => assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/));
  assert.equal(new Set(ids).size, 100);
});
test('never falls back to insecure randomness', () => assert.throws(() => createRequestId({}), /unavailable/));
