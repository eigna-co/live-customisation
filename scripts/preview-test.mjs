// Local test double only. Never deploy this script or use real credentials.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fakeDb } = require('../test/fake-db');
const { createQueueHandler } = require('../firebase-functions/queue-service');
const db = fakeDb();
const handler = createQueueHandler({ getDb: () => db, webApiKey: () => 'local-test', verifyToken: async token => {
  if (token !== 'local-test-token') throw new Error('Invalid token');
  return { uid: 'local-test', eventStaff: 'nuvei', email_verified: true };
}, authFetch: async (url, options) => {
  const login = JSON.parse(options.body);
  const ok = login.email === 'staff@example.test' && login.password === 'preview-only';
  return { ok, json: async () => ok ? { idToken: 'local-test-token', expiresIn: '3600' } : {} };
} });
const publicRoot = path.resolve('dist');
const previewArgs = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')));
const previewHost = previewArgs.host || '127.0.0.1';
const previewPort = Number(previewArgs.port || 4174);
const hostParts = previewHost.split('.').map(Number);
const validAddress = /^\d+\.\d+\.\d+\.\d+$/.test(previewHost) && hostParts.every(value => Number.isInteger(value) && value >= 0 && value <= 255);
const privateAddress = hostParts[0] === 10 || (hostParts[0] === 172 && hostParts[1] >= 16 && hostParts[1] <= 31) || (hostParts[0] === 192 && hostParts[1] === 168);
if ((!validAddress || (!privateAddress && previewHost !== '127.0.0.1')) || !Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65535) throw new Error('Use a specific loopback or private IPv4 address and an unprivileged port.');
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/redemptions') {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 10000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const result = await handler({ httpMethod: req.method, body: Buffer.concat(chunks).toString(), clientAddress: 'localhost', headers: req.headers });
      res.writeHead(result.statusCode, result.headers); res.end(result.body); return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const file = path.resolve(publicRoot, `.${url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'image/png', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(previewPort, previewHost, () => console.log(`Temporary test-double preview: http://${previewHost}:${previewPort} — sample data only, no cloud writes.`));
