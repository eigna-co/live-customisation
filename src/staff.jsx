import React, { useEffect, useRef, useState } from 'react';

async function api(action, payload = {}, token) {
  const response = await fetch('/api/redemptions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Request failed'); error.status = response.status; throw error; }
  return result;
}
const advance = { Queued: 'Decorating', Decorating: 'Ready', Ready: 'Collected' };
export default function StaffScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const refreshInFlight = useRef(false);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('Active');
  const [lastUpdated, setLastUpdated] = useState(null);
  const logout = () => { sessionRef.current = null; setSession(null); setOrders([]); setProducts([]); setLoaded(false); setLastUpdated(null); };
  async function refresh(token = sessionRef.current?.token) {
    if (!token || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const data = await api('staff-list-orders', {}, token);
      if (sessionRef.current?.token !== token) return;
      setOrders(data.orders); setProducts(data.products); setLoaded(true); setLastUpdated(new Date()); setError('');
    } catch (error) {
      if (sessionRef.current?.token !== token) return;
      if ([401, 403].includes(error.status)) logout();
      setError(error.message);
    } finally { refreshInFlight.current = false; }
  }
  useEffect(() => {
    if (!session) return;
    refresh(session.token);
    const interval = setInterval(() => refresh(session.token), 15000);
    const expiry = setTimeout(() => { logout(); setError('Session expired. Please sign in again.'); }, Math.max(0, session.expiresAt - Date.now()));
    return () => { clearInterval(interval); clearTimeout(expiry); };
  }, [session]);
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('staff-sign-in', { email, password });
      const next = { token: result.idToken, expiresAt: Date.now() + result.expiresIn * 1000 };
      setPassword(''); sessionRef.current = next; setSession(next);
    } catch (error) { setError(error.message); setPassword(''); }
    finally { setBusy(false); }
  }
  async function update(order, action = 'staff-update-status') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(action, { orderId: order.id, version: order.version, status: advance[order.status] }, sessionRef.current.token);
      await refresh();
    } catch (error) { setError(error.message); if ([401, 403].includes(error.status)) logout(); }
    finally { setBusy(false); }
  }
  return <main className="style-nuvei staff-screen">
    <header><h1>Event staff queue</h1><p>Queued → Engraving → Ready → Collected</p></header>
    {error && <p role="alert">{error}</p>}
    {!session ? <form onSubmit={login} className="staff-login">
      <label>Email<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p>Use your approved event staff account.</p>
    </form> : <>
      <div className="staff-controls"><button onClick={() => refresh()} disabled={busy}>Refresh</button><button onClick={logout}>Sign out</button>
        <label>Show <select value={filter} onChange={event => setFilter(event.target.value)}>{['Active', 'All', 'Queued', 'Decorating', 'Ready', 'Collected'].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <p role="status">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading queue…'}</p>
      <div>{products.map(product => <p key={product.id}>Available: {product.remaining}</p>)}</div>
      {loaded && !orders.length && <p>No orders yet.</p>}
      {loaded && orders.length > 0 && !orders.some(order => filter === 'All' || (filter === 'Active' ? order.status !== 'Collected' : order.status === filter)) && <p>No orders in this view.</p>}
      <div className="staff-orders">{orders.filter(order => filter === 'All' || (filter === 'Active' ? order.status !== 'Collected' : order.status === filter)).map(order => <article key={order.id}>
        <h2>{order.ticket}</h2><p>{order.name} · {order.gift}</p>
        <p>Engraving: <strong>{order.decoration}</strong> · {order.font}</p><p>Status: <strong>{order.status}</strong></p>
        <p>Airtable: {order.mirrorState === 'Review' ? 'Needs reconciliation — do not create a second order' : order.mirrorState}</p>
        {advance[order.status] && <button disabled={busy} onClick={() => update(order)}>{order.status === 'Queued' ? 'Start engraving' : order.status === 'Decorating' ? 'Mark ready' : 'Confirm collected'}</button>}
        {['Error', 'Review', 'Processing'].includes(order.mirrorState) && <button disabled={busy} onClick={() => update(order, 'staff-retry-sync')}>{order.mirrorState === 'Review' ? 'Check existing Airtable copy' : order.mirrorState === 'Processing' ? 'Recover stalled sync (after 2 minutes)' : 'Retry Airtable sync'}</button>}
      </article>)}</div>
    </>}
  </main>;
}
