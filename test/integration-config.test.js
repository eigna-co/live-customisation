const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const settings = require('../firebase-functions/integration-config.json');
const event = require('../firebase-functions/event-config.json');

test('prepared integration selects the supplied event resources without enabling live SMS', () => {
  const project = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
  assert.equal(project.projects.default, 'tgelive-1b68d');
  assert.equal(settings.airtable.baseId, 'appdvB1aUSC8Q0Z2T');
  assert.equal(settings.airtable.tableId, 'tblj0ReKCFJmEf9x3');
  assert.equal(settings.sms.from, '+18142643662');
  assert.equal(settings.sms.collectionLocation, 'the Nuvei booth');
  assert.equal(settings.sms.enabled, false);
  assert.equal(settings.sms.accountSid, undefined);
  assert.equal(event.schedule.year, 2026);
  assert.deepEqual(event.schedule.days, [20, 21]);
  assert.equal(event.products[0].dailyQuantity, 50);
});

test('Twilio secrets are bound only to the notification worker, not the public API', () => {
  const source = fs.readFileSync(path.join(root, 'firebase-functions', 'index.js'), 'utf8');
  const api = source.slice(source.indexOf('exports.redemptions'), source.indexOf('exports.mirrorOrders'));
  assert.doesNotMatch(api, /TWILIO|secrets:/);
  const worker = source.slice(source.indexOf('exports.notifyCollection'));
  assert.match(worker, /TWILIO_ACCOUNT_SID/);
  assert.match(worker, /TWILIO_API_KEY/); assert.match(worker, /TWILIO_API_SECRET/);
  assert.match(worker, /retry: false/);
  assert.match(worker, /smsState === 'Pending'/);
});

test('browser code does not import integration configuration or provider credentials', () => {
  for (const file of ['src/app.jsx', 'src/staff.jsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /integration-config|TWILIO_API_SECRET|TWILIO_API_KEY|AIRTABLE_TOKEN/);
  }
  const deployment = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  assert.ok(deployment.functions[0].ignore.includes('.env*'));
  assert.ok(deployment.functions[0].ignore.includes('.secret.local'));
});
