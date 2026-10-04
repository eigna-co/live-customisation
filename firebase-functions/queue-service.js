const crypto = require('node:crypto');
const config = require('./event-config.json');
const { _test: validation } = require('./redemption');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const paths = { root: `events/${config.id}` };
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new ApiError(status, message, code); };
const nextStatus = { Queued: 'Decorating', Decorating: 'Ready', Ready: 'Collected' };
const receipt = order => ({ ticket: order.ticket, trackingToken: order.trackingToken, status: order.status });

function createQueueHandler({ getDb, verifyToken, webApiKey = () => '', authFetch = fetch, now = Date.now }) {
  async function staff(event) {
    const token = event.headers?.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) fail(401, 'Please sign in.');
    let identity;
    try { identity = await verifyToken(token); } catch { fail(401, 'Your session has expired. Please sign in again.'); }
    if (identity.eventStaff !== config.id || identity.email_verified !== true) fail(403, 'This account does not have access to this event.');
    return identity;
  }

  async function createOrder(request) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(request.requestId || '')) fail(422, 'Invalid request reference.');
    if (Object.hasOwn(request.redemption || {}, 'decorationBottom')) fail(422, 'Only the top area can be personalised. The bottom has a pre-engraved Nuvei logo.');
    const details = validation.validateRedemption(request.redemption);
    if (!details) fail(422, 'Invalid redemption details.');
    const product = config.products.find(product => product.name.toLowerCase() === details.gift);
    const fingerprint = digest(JSON.stringify(details));
    const db = getDb();
    const orderId = digest(details.email);
    const orderRef = db.doc(`${paths.root}/orders/${orderId}`);
    const requestRef = db.doc(`${paths.root}/requests/${request.requestId}`);
    const stockRef = db.doc(`${paths.root}/inventory/${product.id}`);
    // Generate these once, outside the callback: Firestore may retry transactions.
    const ticket = `${config.ticketPrefix}·${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const trackingToken = crypto.randomBytes(32).toString('hex');
    return db.runTransaction(async tx => {
      const [savedRequest, existing, stock] = await Promise.all([tx.get(requestRef), tx.get(orderRef), tx.get(stockRef)]);
      if (savedRequest.exists) {
        if (savedRequest.data().fingerprint !== fingerprint || savedRequest.data().orderId !== orderId) fail(409, 'This request reference was already used for different details.', 'request-conflict');
        if (!existing.exists) fail(503, 'Please contact the event team with your reference.');
        return { ...receipt(existing.data()), replayed: true };
      }
      if (existing.exists) fail(409, 'Email has already been used', 'duplicate-email');
      const inventory = stock.exists ? stock.data() : { capacity: product.quantity, reserved: 0 };
      if (!Number.isSafeInteger(inventory.capacity) || !Number.isSafeInteger(inventory.reserved) || inventory.reserved < 0) fail(503, 'Stock is unavailable. Please contact the event team.');
      if (inventory.reserved >= inventory.capacity) fail(409, 'This gift is sold out.', 'sold-out');
      const order = { ...details, productId: product.id, ticket, trackingToken, status: 'Queued', createdAt: now(), updatedAt: now(), version: 0, mirrorState: 'Pending' };
      tx.create(orderRef, order);
      tx.create(requestRef, { orderId, fingerprint });
      tx.create(db.doc(`${paths.root}/tracking/${digest(trackingToken)}`), { orderId });
      tx.set(stockRef, { ...inventory, reserved: inventory.reserved + 1 });
      return receipt(order);
    });
  }

  async function availability() {
    const db = getDb();
    const products = await Promise.all(config.products.map(async product => {
      const snap = await db.doc(`${paths.root}/inventory/${product.id}`).get();
      const data = snap.exists ? snap.data() : { capacity: product.quantity, reserved: 0 };
      if (!Number.isSafeInteger(data.capacity) || !Number.isSafeInteger(data.reserved) || data.reserved < 0) fail(503, 'Stock is unavailable.');
      return { id: product.id, remaining: Math.max(0, data.capacity - data.reserved) };
    }));
    return { products };
  }

  return async event => {
    if (event.httpMethod !== 'POST') return { ...reply(405, { error: 'Method not allowed' }), headers: { ...headers, Allow: 'POST' } };
    if (!event.body || Buffer.byteLength(event.body) > 10000) return reply(400, { error: 'Invalid request' });
    let request;
    try { request = JSON.parse(event.body); } catch { return reply(400, { error: 'Invalid JSON' }); }
    if (!request || typeof request !== 'object' || Array.isArray(request)) return reply(400, { error: 'Invalid request' });
    try {
      if (request.action === 'create-redemption') {
        const address = `${event.clientAddress || 'unknown'}:${digest(validation.normaliseEmail(request.redemption?.email) || 'invalid')}`;
        if (validation.isRateLimited({ clientAddress: address })) return { ...reply(429, { error: 'Too many requests. Please wait and try again.' }), headers: { ...headers, 'Retry-After': '60' } };
        const result = await createOrder(request);
        return reply(result.replayed ? 200 : 201, result);
      }
      if (request.action === 'get-availability') return reply(200, await availability());
      if (request.action === 'get-service-config') return reply(200, { transactional: true, staffLoginConfigured: !!webApiKey() });
      if (request.action === 'get-order-status') {
        if (!/^[a-f0-9]{64}$/.test(request.trackingToken || '')) fail(404, 'Order not found.');
        const db = getDb();
        const tracking = await db.doc(`${paths.root}/tracking/${digest(request.trackingToken)}`).get();
        if (!tracking.exists) fail(404, 'Order not found.');
        const order = await db.doc(`${paths.root}/orders/${tracking.data().orderId}`).get();
        if (!order.exists) fail(404, 'Order not found.');
        return reply(200, { ticket: order.data().ticket, status: order.data().status });
      }
      if (request.action === 'staff-sign-in') {
        if (validation.isRateLimited(event)) fail(429, 'Too many attempts. Please wait.');
        const key = webApiKey();
        if (!key) fail(503, 'Staff sign-in has not been configured yet.');
        if (typeof request.email !== 'string' || typeof request.password !== 'string' || request.password.length > 1000) fail(422, 'Enter your email and password.');
        const response = await authFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: request.email, password: request.password, returnSecureToken: true }),
          signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (!response.ok || !data.idToken) fail(401, 'Unable to sign in. Check your details or contact the event administrator.');
        await staff({ headers: { authorization: `Bearer ${data.idToken}` } });
        return reply(200, { idToken: data.idToken, expiresIn: Number(data.expiresIn) || 3600 });
      }
      if (request.action === 'staff-list-orders') {
        await staff(event);
        const snap = await getDb().collection(`${paths.root}/orders`).orderBy('createdAt', 'asc').limit(200).get();
        return reply(200, { orders: snap.docs.map(doc => {
          const { name, gift, decoration, font, ticket, status, version, createdAt, mirrorState } = doc.data();
          return { id: doc.id, name, gift, decoration, font, ticket, status, version, createdAt, mirrorState };
        }), ...await availability() });
      }
      if (request.action === 'staff-update-status') {
        const identity = await staff(event);
        if (!/^[a-f0-9]{64}$/.test(request.orderId || '') || !Number.isSafeInteger(request.version)) fail(422, 'Invalid order reference.');
        const db = getDb();
        const ref = db.doc(`${paths.root}/orders/${request.orderId}`);
        const result = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) fail(404, 'Order not found.');
          const order = snap.data();
          if (order.status === request.status) return { status: order.status, version: order.version };
          if (order.version !== request.version) fail(409, 'Another staff member updated this order. Refresh and try again.');
          if (nextStatus[order.status] !== request.status) fail(422, 'Invalid queue status change.');
          tx.update(ref, { status: request.status, version: order.version + 1, updatedAt: now(), mirrorState: ['Processing', 'Review'].includes(order.mirrorState) ? order.mirrorState : 'Pending' });
          tx.create(ref.collection('audit').doc(), { from: order.status, to: request.status, staffUid: identity.uid, at: now() });
          return { status: request.status, version: order.version + 1 };
        });
        return reply(200, result);
      }
      if (request.action === 'staff-retry-sync') {
        await staff(event);
        if (!/^[a-f0-9]{64}$/.test(request.orderId || '')) fail(422, 'Invalid order reference.');
        const db = getDb();
        const ref = db.doc(`${paths.root}/orders/${request.orderId}`);
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) fail(404, 'Order not found.');
          const order = snap.data();
          const stale = order.mirrorState === 'Processing' && Number.isFinite(order.mirrorStartedAt) && now() - order.mirrorStartedAt > 120000;
          if (!['Error', 'Review'].includes(order.mirrorState) && !stale) fail(409, 'This order is already syncing or synced.');
          tx.update(ref, { mirrorState: 'Pending' });
        });
        return reply(200, { queued: true });
      }
      return reply(400, { error: 'Unknown action' });
    } catch (error) {
      return reply(error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.message : 'Service temporarily unavailable. Please retry with the same details.', ...(error.code ? { code: error.code } : {}) });
    }
  };
}

module.exports = { createQueueHandler, digest, paths };
