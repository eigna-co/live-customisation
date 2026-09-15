const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('does not ship the old client-side staff password or panel', () => {
  assert.doesNotMatch(html, /STAFF_PASSWORD|StaffPanel|onStaffTap|type="password"/);
});

test('does not put guest details into the external contact URL', () => {
  assert.doesNotMatch(html, /prefill_Name|prefill_Email|prefill_Company|contactUrl/);
  assert.match(html, /href=\{CONFIG\.CONTACT_FORM_URL\}/);
});

test('associates labels, hints and validation state with form inputs', () => {
  assert.match(html, /<label htmlFor=\{inputId\}/);
  assert.match(html, /id=\{inputId\} name=\{name\}/);
  assert.match(html, /aria-describedby=\{hint \? hintId : undefined\}/);
  assert.match(html, /aria-invalid=\{hintError \|\| undefined\}/);
  assert.match(html, /role=\{hintError \? 'alert' : undefined\}/);
});

test('exposes product and sticker selection state to assistive technology', () => {
  assert.match(html, /aria-pressed=\{selected\}/);
  assert.match(html, /aria-label=\{`\$\{gift\.name\}/);
  assert.match(html, /aria-label=\{`Letter \$\{s\.name\}`\}/);
});

test('shows a specific message for duplicate submission responses', () => {
  assert.match(html, /error\.status === 409/);
  assert.match(html, /This email has already been used for a redemption\./);
});
