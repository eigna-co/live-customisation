const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
// Public address of the approved tgelive-1b68d backend; not a credential.
// Keep authentication on Firebase. An explicit environment override remains
// supported and must pass the same HTTPS host validation (never fall back if invalid).
const eventBackend = 'https://redemptions-s3i7tgf25a-as.a.run.app';
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { ...headers, Allow: 'POST' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!event.body || Buffer.byteLength(event.body) > 10000) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  let target;
  try {
    target = new URL(process.env.FIREBASE_QUEUE_URL ?? eventBackend);
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || !/(?:\.cloudfunctions\.net|\.run\.app)$/.test(target.hostname)) throw new Error();
  } catch {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'The event order service has not been configured yet.' }) };
  }
  try {
    const response = await fetch(target, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(event.headers?.authorization ? { Authorization: event.headers.authorization } : {}) },
      body: event.body, signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    return { statusCode: response.status, headers: { ...headers, ...(response.status === 429 ? { 'Retry-After': '60' } : {}) }, body: JSON.stringify(result) };
  } catch {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'The order service is temporarily unavailable. Please retry with the same details.' }) };
  }
};
