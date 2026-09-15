const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/airtable');

const VALID_REDEMPTION = {
  name: 'Jane Tan',
  company: 'Example Co',
  email: 'Jane@Example.com',
  phone: '+65 9123 4567',
  gift: 'Coffee Tumbler',
  decoration: 'Jane',
};

function event(body, httpMethod = 'POST') {
  return { httpMethod, body: JSON.stringify(body) };
}

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

test.beforeEach(() => {
  process.env.AIRTABLE_TOKEN = 'test-token';
  process.env.AIRTABLE_BASE = 'test-base';
  process.env.AIRTABLE_TABLE = 'Redemptions';
});

test.afterEach(() => {
  delete global.fetch;
});

test('rejects every outer HTTP method except POST', async () => {
  const response = await handler(event({}, 'GET'));
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'POST');
});

test('rejects the old arbitrary proxy request without calling Airtable', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return jsonResponse({ records: [] });
  };

  const response = await handler(event({ method: 'GET', query: 'pageSize=100' }));
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('email checks expose only an exists boolean', async () => {
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = url;
    return jsonResponse({
      records: [{ id: 'rec-secret', fields: { Email: 'jane@example.com', Phone: '+6591234567' } }],
    });
  };

  const response = await handler(event({ action: 'check-email', email: ' Jane@Example.com ' }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { exists: true });
  assert.match(requestedUrl, /maxRecords=1/);
  assert.match(decodeURIComponent(requestedUrl), /LOWER\(\{Email\}\)="jane@example.com"/);
  assert.doesNotMatch(response.body, /rec-secret|91234567/);
});

test('rejects invalid fields before contacting Airtable', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return jsonResponse({ records: [] });
  };

  const response = await handler(event({
    action: 'create-redemption',
    redemption: { ...VALID_REDEMPTION, gift: 'Unapproved product' },
  }));

  assert.equal(response.statusCode, 422);
  assert.equal(called, false);
});

test('rejects a duplicate email without creating another record', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse({ records: [{ id: 'existing' }] });
  };

  const response = await handler(event({
    action: 'create-redemption',
    redemption: VALID_REDEMPTION,
  }));

  assert.equal(response.statusCode, 409);
  assert.equal(calls, 1);
});

test('creates only allow-listed fields with server-controlled values', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return jsonResponse({ records: [] });
    return jsonResponse({ id: 'created' });
  };

  const response = await handler(event({
    action: 'create-redemption',
    redemption: {
      ...VALID_REDEMPTION,
      status: 'Collected',
      unexpectedField: 'must not be forwarded',
    },
  }));

  assert.equal(response.statusCode, 201);
  const result = JSON.parse(response.body);
  assert.match(result.ticket, /^CC·[A-F0-9]{10}$/);
  assert.equal(calls.length, 2);

  const submitted = JSON.parse(calls[1].options.body).fields;
  assert.deepEqual(Object.keys(submitted).sort(), [
    'Company', 'Decoration', 'Email', 'Gift', 'Name', 'Phone', 'Status', 'Ticket',
  ]);
  assert.equal(submitted.Email, 'jane@example.com');
  assert.equal(submitted.Phone, '+6591234567');
  assert.equal(submitted.Status, 'Queued');
  assert.equal(submitted.Ticket, result.ticket);
});

test('returns a safe error when Airtable is unavailable', async () => {
  global.fetch = async () => { throw new Error('connection details must not leak'); };

  const response = await handler(event({ action: 'check-email', email: 'jane@example.com' }));
  assert.equal(response.statusCode, 502);
  assert.deepEqual(JSON.parse(response.body), { error: 'Airtable is unavailable' });
});
