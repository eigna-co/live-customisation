const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.jsx'), 'utf8');
const netlifyConfig = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');

test('does not ship the old client-side staff password or panel', () => {
  assert.doesNotMatch(source, /STAFF_PASSWORD|StaffPanel|onStaffTap|type="password"/);
});

test('does not put guest details into the external contact URL', () => {
  assert.doesNotMatch(source, /prefill_Name|prefill_Email|prefill_Company|contactUrl/);
  assert.match(source, /href=\{CONFIG\.CONTACT_FORM_URL\}/);
});

test('associates labels, hints and validation state with form inputs', () => {
  assert.match(source, /<label htmlFor=\{inputId\}/);
  assert.match(source, /id=\{inputId\} name=\{name\}/);
  assert.match(source, /aria-describedby=\{hint \? hintId : undefined\}/);
  assert.match(source, /aria-invalid=\{hintError \|\| undefined\}/);
  assert.match(source, /role=\{hintError \? 'alert' : undefined\}/);
});

test('exposes product and sticker selection state to assistive technology', () => {
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /aria-label=\{`\$\{gift\.name\}/);
  assert.match(source, /aria-label=\{`Letter \$\{s\.name\}`\}/);
});

test('shows a specific message for duplicate submission responses', () => {
  assert.match(source, /error\.status === 409/);
  assert.match(source, /This email has already been used for a redemption\./);
});

test('does not persist guest details or tickets in browser storage', () => {
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\('lc\.(?:step|data|gift|pers|ticket)'/);
  assert.match(source, /const \[data, setData\] = useState\(\{ name: '', company: '', email: '', phone: '\+65' \}\)/);
});

test('does not expose a public email-enumeration request', () => {
  assert.doesNotMatch(source, /checkEmailExists|'check-email'/);
});

test('announces status and errors and moves focus after screen changes', () => {
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /role="alert" aria-live="assertive"/);
  assert.match(source, /querySelector\('\.screen h1'\)\?\.focus\(\)/);
});

test('respects reduced-motion preferences and uses protected editor messages', () => {
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(source, /e\.origin !== window\.location\.origin/);
  assert.doesNotMatch(source, /postMessage\([^\n]+, '\*'\)/);
});

test('loads a compiled production bundle without browser Babel or CDN React', () => {
  assert.match(html, /<script src="\/app\.js" defer><\/script>/);
  assert.doesNotMatch(html, /text\/babel|unpkg\.com|react(?:-dom)?\.development\.js|babel\.min\.js/);
});

test('sets baseline browser security headers', () => {
  assert.match(netlifyConfig, /Content-Security-Policy/);
  assert.match(netlifyConfig, /frame-ancestors 'none'/);
  assert.match(netlifyConfig, /X-Frame-Options = "DENY"/);
  assert.match(netlifyConfig, /Permissions-Policy/);
  assert.match(netlifyConfig, /script-src 'self'/);
  assert.doesNotMatch(netlifyConfig, /unsafe-eval|unpkg\.com/);
});
