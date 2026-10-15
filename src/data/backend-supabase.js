// Supabase backend: same small interface as backend-demo.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

const PAGE = 1000;
// No sign-in (supabase/migrations/003_open_access.sql): people pick who they are,
// and the choice is remembered in this browser.
const WHO = 'lbd-who-v1';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(WHO) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(WHO, JSON.stringify(v)); } catch { /* private mode: this tab only */ } },
  del() { try { localStorage.removeItem(WHO); } catch { /* ignore */ } },
};

export function createSupabaseBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let who = store.get();
  const listeners = [];

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const applyEq = (q, eq = {}) => {
    for (const [k, v] of Object.entries(eq)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    return q;
  };

  return {
    mode: 'supabase',

    async session() { return who; },
    onAuthChange(cb) { listeners.push(cb); },
    async signIn(email, fullName = '', role = null) {
      who = { email, fullName, role };
      store.set(who);
      listeners.forEach((f) => f());
    },
    async signOut() { who = null; store.del(); listeners.forEach((f) => f()); },
    async setFullName(fullName) { who = { ...who, fullName }; store.set(who); },

    async list(table, { eq, order } = {}) {
      const out = [];
      for (let from = 0; ; from += PAGE) {
        let q = applyEq(sb.from(table).select('*'), eq);
        q = q.order(order?.[0] || 'id', { ascending: order?.[1] !== 'desc' }).range(from, from + PAGE - 1);
        const rows = check(await q);
        out.push(...rows);
        if (rows.length < PAGE) break;
      }
      return out;
    },
    async insert(table, row) {
      return check(await sb.from(table).insert(row).select().single());
    },
    async update(table, id, patch) {
      return check(await sb.from(table).update(patch).eq('id', id).select().single());
    },
    async updateWhere(table, eq, patch) {
      return check(await applyEq(sb.from(table).update(patch), eq).select());
    },
    async remove(table, id) {
      check(await sb.from(table).delete().eq('id', id));
    },
    async removeWhere(table, eq) {
      check(await applyEq(sb.from(table).delete(), eq));
    },
  };
}
