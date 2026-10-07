// Bounded, read-only event-site check. No order creation, login or SMS actions.
import { performance } from 'node:perf_hooks';
const origin = 'https://tge-live.netlify.app';
const users = 50;
const started = performance.now();
const samples = [];
const failures = [];
async function request(label, url, options, validate) {
  const start = performance.now();
  try {
    const result = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (result.status !== 200) throw new Error(`HTTP-${result.status}`);
    await validate(result);
    samples.push({ label, ms: performance.now() - start });
  } catch (error) {
    failures.push({ label, reason: /^HTTP-\d{3}$/.test(error.message) ? error.message : 'request-or-validation-failed' });
  }
}
await Promise.all(Array.from({ length: users }, async () => {
  await request('homepage', `${origin}/`, {}, async response => {
    const html = await response.text();
    if (!html.includes('Nuvei Live Personalisation') || !html.includes('app.js')) throw new Error('Unexpected homepage');
  });
  await request('availability', `${origin}/api/redemptions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"get-availability"}',
  }, async response => {
    const data = await response.json();
    if (data.products?.length !== 1 || data.products[0].id !== 'adaptor' || !Number.isInteger(data.products[0].remaining) || data.products[0].remaining < 0 || data.products[0].remaining > 50 || typeof data.eventClosed !== 'boolean') throw new Error('Unexpected availability');
    if (data.eventClosed && data.products[0].remaining !== 0) throw new Error('Closed event offered stock');
  });
}));
const stats = label => {
  const values = samples.filter(sample => sample.label === label).map(sample => sample.ms).sort((a, b) => a - b);
  return { successful: values.length, p50Ms: Math.round(values[Math.max(0, Math.ceil(values.length * .5) - 1)] || 0), p95Ms: Math.round(values[Math.max(0, Math.ceil(values.length * .95) - 1)] || 0), maxMs: Math.round(values.at(-1) || 0) };
};
console.log(JSON.stringify({ simulatedVisitors: users, totalRequests: users * 2, durationMs: Math.round(performance.now() - started), homepage: stats('homepage'), availability: stats('availability'), failures, scope: 'HTML and read-only availability only; no assets/browser rendering or order submissions tested', ordersCreated: 0, smsSent: 0 }, null, 2));
if (failures.length) process.exitCode = 1;
