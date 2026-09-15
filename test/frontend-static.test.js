const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const netlifyConfig = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');

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

test('does not persist guest details or tickets in browser storage', () => {
  assert.doesNotMatch(html, /localStorage\.(?:getItem|setItem|removeItem)\('lc\.(?:step|data|gift|pers|ticket)'/);
  assert.match(html, /const \[data, setData\] = useState\(\{ name: '', company: '', email: '', phone: '\+65' \}\)/);
});

test('does not expose a public email-enumeration request', () => {
  assert.doesNotMatch(html, /checkEmailExists|'check-email'/);
});

test('announces status and errors and moves focus after screen changes', () => {
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /role="alert" aria-live="assertive"/);
  assert.match(html, /querySelector\('\.screen h1'\)\?\.focus\(\)/);
});

test('respects reduced-motion preferences and uses protected editor messages', () => {
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /e\.origin !== window\.location\.origin/);
  assert.doesNotMatch(html, /postMessage\([^\n]+, '\*'\)/);
});

test('sets baseline browser security headers', () => {
  assert.match(netlifyConfig, /Content-Security-Policy/);
  assert.match(netlifyConfig, /frame-ancestors 'none'/);
  assert.match(netlifyConfig, /X-Frame-Options = "DENY"/);
  assert.match(netlifyConfig, /Permissions-Policy/);
});
