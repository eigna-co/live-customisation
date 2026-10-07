// Loopback-only staff connection check. No orders, status changes or SMS allowed.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const publicRoot = path.resolve('dist');
const endpoint = 'https://redemptions-s3i7tgf25a-as.a.run.app';
const allowedActions = new Set(['staff-sign-in', 'staff-list-orders', 'get-service-config', 'get-availability']);
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/redemptions') {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 10000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const body = Buffer.concat(chunks).toString();
      if (!allowedActions.has(JSON.parse(body).action)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'This connection check cannot create orders or change their status.' })); return; }
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) }, body, signal: AbortSignal.timeout(25000) });
      res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(await response.text()); return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/' && url.searchParams.get('staff') !== '1') { res.writeHead(302, { Location: '/?staff=1' }); res.end(); return; }
    const file = path.resolve(publicRoot, `.${url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`);
    const type = mime[path.extname(file)];
    if (!file.startsWith(publicRoot + path.sep) || !type) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': type }); res.end(data);
  } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Connection check unavailable. Please retry.' })); }
}).listen(4182, '127.0.0.1', () => console.log('Staff cloud connection check: http://127.0.0.1:4182/?staff=1 (read-only queue; no order/status/SMS actions)'));
