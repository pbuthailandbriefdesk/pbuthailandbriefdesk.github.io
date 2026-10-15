// Supabase backend: same small interface as backend-demo.js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

const PAGE = 1000;

export function createSupabaseBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });

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

    async session() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { email: u.email, fullName: u.user_metadata?.full_name || '' } : null;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange(() => cb());
    },
    async signIn(email) {
      const redirectTo = window.location.origin + window.location.pathname;
      check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }));
    },
    async signOut() { await sb.auth.signOut(); },
    async setFullName(fullName) { check(await sb.auth.updateUser({ data: { full_name: fullName } })); },

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
