// Deterministic service-level test double; not a Firestore emulator.
const { randomUUID } = require('node:crypto');
const copy = value => value === undefined ? undefined : structuredClone(value);
function fakeDb() {
  const rows = new Map();
  let tail = Promise.resolve();
  const snapshot = (path, data = rows.get(path)) => ({ id: path.split('/').at(-1), exists: data !== undefined, data: () => copy(data) });
  const doc = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path), update: async patch => {
    if (!rows.has(path)) throw new Error('Not found');
    rows.set(path, { ...rows.get(path), ...copy(patch) });
  }, collection: name => ({ doc: (id = randomUUID()) => doc(`${path}/${name}/${id}`) }) });
  return { rows, doc, collection: path => {
    let key; let max = Infinity;
    const query = { orderBy: field => { key = field; return query; }, limit: count => { max = count; return query; }, get: async () => ({ docs: [...rows].filter(([name]) => name.startsWith(`${path}/`) && !name.slice(path.length + 1).includes('/')).sort((a, b) => a[1][key] - b[1][key]).slice(0, max).map(([name, data]) => snapshot(name, data)) }) };
    return query;
  }, runTransaction: callback => {
    const operation = tail.then(async () => {
      const pending = new Map();
      const tx = { get: async ref => snapshot(ref.path), create: (ref, data) => {
        if (rows.has(ref.path) || pending.has(ref.path)) throw new Error('Already exists'); pending.set(ref.path, copy(data));
      }, set: (ref, data) => pending.set(ref.path, copy(data)), update: (ref, patch) => {
        if (!rows.has(ref.path)) throw new Error('Not found'); pending.set(ref.path, { ...(pending.get(ref.path) || rows.get(ref.path)), ...copy(patch) });
      } };
      const result = await callback(tx);
      pending.forEach((value, path) => rows.set(path, value));
      return result;
    });
    tail = operation.catch(() => {});
    return operation;
  } };
}
module.exports = { fakeDb };
