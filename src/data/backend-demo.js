// Demo backend: runs the app on data/seed.json in this browser only.
// Changes are kept in localStorage so you can try every flow; "Reset demo data" restores the seed.
const KEY = 'lbd-demo-db-v1';
const WHO = 'lbd-demo-user-v1';
const TABLES = ['desk_team', 'brands', 'holidays', 'sdf_defaults', 'briefs', 'brief_events',
  'brief_ios', 'brief_lines', 'brief_ad_groups', 'brief_ads', 'notifications'];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage full or blocked: keep in memory */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export async function createDemoBackend() {
  let db = null;
  const saved = store.get(KEY);
  if (saved) {
    try { db = JSON.parse(saved); } catch { db = null; }
  }
  if (!db) db = await loadSeed();
  for (const t of TABLES) db[t] = db[t] || [];

  const persist = () => store.set(KEY, JSON.stringify(db));
  const listeners = [];
  const match = (row, eq = {}) => Object.entries(eq).every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
  const nextId = (t) => db[t].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const now = () => new Date().toISOString();

  return {
    mode: 'demo',

    async session() {
      const raw = store.get(WHO);
      return raw ? JSON.parse(raw) : null;
    },
    onAuthChange(cb) { listeners.push(cb); },
    async signIn(email, fullName = '') {
      store.set(WHO, JSON.stringify({ email, fullName }));
      listeners.forEach((f) => f());
    },
    async signOut() { store.del(WHO); listeners.forEach((f) => f()); },
    async setFullName(fullName) {
      const s = JSON.parse(store.get(WHO) || '{}');
      store.set(WHO, JSON.stringify({ ...s, fullName }));
    },
    async reset() {
      store.del(KEY);
      db = await loadSeed();
      for (const t of TABLES) db[t] = db[t] || [];
      persist();
    },

    async list(table, { eq, order } = {}) {
      const [col, dir] = order || ['id', 'asc'];
      const rows = db[table].filter((r) => match(r, eq)).map(clone);
      rows.sort((a, b) => {
        const av = a[col]; const bv = b[col];
        const c = av === bv ? 0 : av === null || av === undefined ? -1 : bv === null || bv === undefined ? 1 : av < bv ? -1 : 1;
        return dir === 'desc' ? -c : c;
      });
      return rows;
    },
    async insert(table, row) {
      const r = { id: nextId(table), created_at: now(), modified_at: now(), ...row };
      db[table].push(r);
      persist();
      return clone(r);
    },
    async update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (!r) throw new Error(`${table} ${id} not found`);
      Object.assign(r, patch, { modified_at: now() });
      persist();
      return clone(r);
    },
    async updateWhere(table, eq, patch) {
      const rows = db[table].filter((r) => match(r, eq));
      rows.forEach((r) => Object.assign(r, patch, { modified_at: now() }));
      persist();
      return rows.map(clone);
    },
    async remove(table, id) {
      db[table] = db[table].filter((r) => r.id !== id);
      persist();
    },
    async removeWhere(table, eq) {
      // Same cascade as the database foreign keys.
      if (table === 'briefs') {
        const ids = db.briefs.filter((r) => match(r, eq)).map((r) => r.brief_id);
        for (const t of ['brief_events', 'brief_ios', 'brief_lines', 'brief_ad_groups', 'brief_ads']) {
          db[t] = db[t].filter((r) => !ids.includes(r.brief_id));
        }
      }
      db[table] = db[table].filter((r) => !match(r, eq));
      persist();
    },
  };
}

async function loadSeed() {
  const res = await fetch('data/seed.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Demo data not found (data/seed.json). Run scripts/convert-export.ps1 first.');
  const seed = await res.json();
  const db = {};
  for (const t of TABLES) db[t] = (seed[t] || []).map((r) => ({ ...r }));
  return db;
}
