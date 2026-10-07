const test = require('node:test');
const assert = require('node:assert/strict');
const { mirrorLabel, smsLabel, staffMessage } = require('../src/staff-copy');
test('staff sync labels explain the state instead of displaying raw Error or Processing', () => {
  assert.equal(mirrorLabel('Error'), 'Not synced — try again');
  assert.equal(mirrorLabel('Processing'), 'Syncing');
  assert.equal(mirrorLabel('Synced'), 'Saved');
  assert.match(mirrorLabel('Review'), /before retrying/);
});
test('staff SMS labels preserve uncertain delivery and never promise a successful send', () => {
  assert.match(smsLabel({ smsState: 'Accepted' }), /delivery not yet confirmed/);
  for (const smsState of ['Sending', 'Review']) assert.match(smsLabel({ smsState }), /before resending/);
  assert.match(smsLabel({ smsState: 'Blocked' }), /Not sent/);
});
test('staff connection messages hide raw browser errors but retain actionable sign-in warnings', () => {
  assert.equal(staffMessage(new TypeError('Failed to fetch')), 'Could not connect. Please try again.');
  assert.equal(staffMessage({ status: 401, message: 'Please sign in again.' }), 'Please sign in again.');
  assert.doesNotMatch(staffMessage({ status: 422, message: 'Invalid order reference.' }), /Invalid|Error/);
});
