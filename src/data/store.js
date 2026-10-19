// App state: backend, signed-in user, reference lists, and a store per open brief.
import { useEffect, useState } from 'preact/hooks';
import { AD_OPS_ROLES, GATE_ROLES } from '../lib/constants.js';
import { isBlank, lower, mailtoHref, nowIso } from '../lib/util.js';

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      subs.forEach((f) => f(state));
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}

export function useStore(store) {
  const [s, setS] = useState(store.get());
  useEffect(() => {
    const unsub = store.subscribe(setS);
    setS(store.get()); // catch changes made between the first render and subscribing
    return unsub;
  }, [store]);
  return s;
}

// ---------------------------------------------------------------------------
// Global app store
// ---------------------------------------------------------------------------
export const app = createStore({
  db: null,
  me: null,           // { email, name, role, team, isAdOps, isGate, isAdmin }
  brands: [], team: [], holidays: [], sdf: [],
  notifications: [],
  toasts: [],
});

export const db = () => app.get().db;

// Breadcrumbs shown in the top bar: [{ label, href }]
export function useCrumbs(list) {
  const key = JSON.stringify(list);
  useEffect(() => { app.set({ crumbs: list }); }, [key]);
}

export function profileFor(session, team) {
  const email = lower(session.email);
  const row = team.find((t) => lower(t.email) === email);
  // Name and role are managed by Admins in User management (desk_team).
  const role = row?.role || 'Planner';
  return {
    email,
    registered: !!row,
    name: row?.name || session.fullName || email,
    role,
    team: row?.team || null,
    isAdOps: AD_OPS_ROLES.includes(role),
    isGate: GATE_ROLES.includes(role),
    isAdmin: role === 'Admin',
    hasName: !isBlank(session.fullName) || !isBlank(row?.name),
  };
}

export async function loadLookups() {
  const d = db();
  const [brands, team, holidays, sdf] = await Promise.all([
    d.list('brands'), d.list('desk_team'), d.list('holidays'), d.list('sdf_defaults'),
  ]);
  app.set({ brands, team, holidays, sdf });
  return { brands, team, holidays, sdf };
}

export async function loadNotifications() {
  const me = app.get().me;
  if (!me) return;
  try {
    const rows = await db().list('notifications', { eq: { recipient_email: me.email }, order: ['id', 'desc'] });
    app.set({ notifications: rows });
  } catch { /* notifications are optional */ }
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
let toastId = 0;
export function toast(msg, kind = 'info', extra = {}) {
  const id = ++toastId;
  app.set((s) => ({ toasts: [...s.toasts, { id, msg, kind, ...extra }] }));
  setTimeout(() => dismissToast(id), extra.href ? 12000 : kind === 'error' ? 9000 : 5000);
}
export const dismissToast = (id) => app.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

// Replaces Office365Outlook.SendEmailV2: writes an in-app notification for each
// recipient and offers a pre-filled email draft.
export async function notify(to, subject, body, briefId) {
  const me = app.get().me;
  const list = [...new Set((Array.isArray(to) ? to : [to]).flatMap((x) => String(x || '').split(';')).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  try {
    for (const r of list) {
      await db().insert('notifications', { recipient_email: r, brief_id: briefId, subject, body, created_by: me?.email, created_at: nowIso() });
    }
  } catch {
    toast('Saved, but the notification was not sent', 'warning');
  }
  if (me && list.includes(me.email)) loadNotifications();
  return list.length ? mailtoHref(list, subject, body) : null;
}

export const teamEmails = (...roles) =>
  app.get().team.filter((t) => roles.includes(t.role)).map((t) => t.email);

// ---------------------------------------------------------------------------
// One open brief and everything under it
// ---------------------------------------------------------------------------
const CHILD = { I: 'brief_ios', L: 'brief_lines', G: 'brief_ad_groups', A: 'brief_ads', E: 'brief_events' };
const KEY_OF = Object.fromEntries(Object.entries(CHILD).map(([k, v]) => [v, k]));

export function createBriefStore(briefId) {
  const s = createStore({ loading: true, error: null, b: null, I: [], L: [], G: [], A: [], E: [] });

  async function load() {
    try {
      const d = db();
      const [briefs, I, L, G, A, E] = await Promise.all([
        d.list('briefs', { eq: { brief_id: briefId } }),
        ...['I', 'L', 'G', 'A', 'E'].map((k) => d.list(CHILD[k], { eq: { brief_id: briefId } })),
      ]);
      if (!briefs.length) throw new Error(`Brief ${briefId} was not found. It may have been deleted.`);
      s.set({ loading: false, error: null, b: briefs[0], I, L, G, A, E });
    } catch (e) {
      s.set({ loading: false, error: e.message });
    }
  }

  const withSave = async (fn) => {
    try { return await fn(); } catch (e) { toast(`Not saved: ${e.message}`, 'error'); e.toasted = true; throw e; }
  };

  return {
    ...s,
    load,
    async patchBrief(patch) {
      return withSave(async () => {
        const b = await db().update('briefs', s.get().b.id, patch);
        s.set({ b });
        return b;
      });
    },
    async patchRow(table, id, patch) {
      return withSave(async () => {
        const row = await db().update(table, id, patch);
        const k = KEY_OF[table];
        s.set((st) => ({ [k]: st[k].map((r) => (r.id === id ? row : r)) }));
        return row;
      });
    },
    async patchRows(ups) {
      for (const u of ups) await this.patchRow(u.table, u.id, u.patch);
    },
    async addRow(table, row) {
      return withSave(async () => {
        const r = await db().insert(table, { brief_id: briefId, ...row });
        const k = KEY_OF[table];
        s.set((st) => ({ [k]: [...st[k], r] }));
        return r;
      });
    },
    async removeRow(table, id) {
      return withSave(async () => {
        await db().remove(table, id);
        const k = KEY_OF[table];
        s.set((st) => ({ [k]: st[k].filter((r) => r.id !== id) }));
      });
    },
    // RemoveIf(table, BriefID = ... && conditions)
    async removeWhere(table, pred) {
      const k = KEY_OF[table];
      for (const r of s.get()[k].filter(pred)) await this.removeRow(table, r.id);
    },
    // UpdateIf(table, BriefID = ... && conditions, patch)
    async updateWhere(table, pred, patch) {
      const k = KEY_OF[table];
      for (const r of s.get()[k].filter(pred)) await this.patchRow(table, r.id, patch);
    },
    async event(event, detail = '') {
      const me = app.get().me;
      return this.addRow('brief_events', { event, by_email: me.email, at: nowIso(), detail });
    },
  };
}

export function useBrief(briefId) {
  const [store] = useState(() => createBriefStore(briefId));
  const st = useStore(store);
  useEffect(() => { store.load(); }, [store]);
  return [st, store];
}
