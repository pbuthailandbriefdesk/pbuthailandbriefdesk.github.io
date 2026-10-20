import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ALLOWED_DOMAINS, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { homeQueue, queuesFor } from './lib/queues.js';
import { fmtTs, lower } from './lib/util.js';
import { app, db, dismissToast, loadLookups, loadNotifications, profileFor, toast, useStore } from './data/store.js';
import { go, useRoute } from './router.js';
import { html, Icon, Loading, Modal } from './ui/ui.js';
import { Home, loadBriefs } from './screens/home.js';
import { BriefEditor } from './screens/brief.js';
import { Review } from './screens/review.js';
import { AdOps } from './screens/adops.js';
import { Gate } from './screens/gate.js';
import { Detail } from './screens/detail.js';
import { Score } from './screens/score.js';
import { Admin } from './screens/admin.js';
import { Qa } from './screens/qa.js';

// Counts in-flight writes so the top bar can show "Saving…".
function trackWrites(backend) {
  const writes = ['insert', 'update', 'updateWhere', 'remove', 'removeWhere'];
  return new Proxy(backend, {
    get(target, prop) {
      const v = target[prop];
      if (!writes.includes(prop)) return v;
      return async (...args) => {
        app.set((s) => ({ saving: (s.saving || 0) + 1 }));
        try { return await v.apply(target, args); } finally { app.set((s) => ({ saving: s.saving - 1, savedAt: Date.now() })); }
      };
    },
  });
}

async function boot() {
  let backend;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createSupabaseBackend } = await import('./data/backend-supabase.js');
    backend = createSupabaseBackend();
  } else {
    const { createDemoBackend } = await import('./data/backend-demo.js');
    backend = await createDemoBackend();
  }
  app.set({ db: trackWrites(backend), saving: 0 });
  backend.onAuthChange(() => refreshSession());
  await refreshSession();
}

async function refreshSession() {
  const d = db();
  const session = await d.session();
  if (!session) { app.set({ me: null, ready: true }); return; }
  if (!ALLOWED_DOMAINS.includes(lower(session.email).split('@')[1])) {
    await d.signOut();
    app.set({ me: null, ready: true, authError: `Only ${ALLOWED_DOMAINS.map((x) => '@' + x).join(', ')} addresses can use the Brief Desk.` });
    return;
  }
  try {
    const { team } = await loadLookups();
    const me = profileFor(session, team);
    if (!me.registered) {
      await d.signOut();
      app.set({ me: null, ready: true, authError: `${me.email} is no longer in User management. Ask an Admin to add you.` });
      return;
    }
    app.set({ me, ready: true, authError: null });
    loadBriefs();
    loadNotifications();
    clearInterval(window.__lbdPoll);
    window.__lbdPoll = setInterval(loadNotifications, 60000);
  } catch (e) {
    app.set({ me: null, ready: true, authError: e.message });
  }
}

// ---------------------------------------------------------------------------
function SignIn() {
  const { db: d, authError } = useStore(app);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [team, setTeam] = useState(null);
  useEffect(() => { d.list('desk_team').then(setTeam).catch(() => setTeam([])); }, []);

  // Name and role come from User management (desk_team) and are shown, not chosen.
  const em = email.trim().toLowerCase();
  const looksComplete = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(em);
  const match = team && team.find((t) => lower(t.email) === em);
  const admins = (team || []).filter((t) => t.role === 'Admin').map((t) => t.name || t.email).join(' or ');
  const roleLabel = (r) => (r === 'Gatekeeper' ? 'Gate' : ['Planner', 'Ad Ops', 'Buyer', 'Admin'].includes(r) ? r : 'Planner');

  const submit = async (e) => {
    e.preventDefault();
    if (!ALLOWED_DOMAINS.includes(em.split('@')[1])) { setErr(`Use your ${ALLOWED_DOMAINS.map((x) => '@' + x).join(' or ')} address.`); return; }
    if (!match) { setErr(`${em} isn't registered yet. Ask an Admin${admins ? ` (${admins})` : ''} to add you in User management.`); return; }
    setErr(null);
    setBusy(true);
    try { await d.signIn(em, match.name || ''); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return html`<div class="signin">
    <div class="art">
      <div class="eyebrow"><span class="dot"></span>WPP Media · Programmatic Thailand</div>
      <div>
        <h1>L'Oréal Brief Desk</h1>
        <p>Brief, taxonomy, Gate check and DV360 set-up for every L'Oréal programmatic campaign, in one place.</p>
      </div>
      <div class="small" style="color:rgba(255,255,255,.6)">Planner → Ad Ops → Gate → Buyer → QA</div>
    </div>
    <div class="form">
      <div class="eyebrow muted"><span class="dot"></span>${d.mode === 'demo' ? 'Demo mode' : 'Welcome'}</div>
      <h2>Enter your work email</h2>
      <p class="muted">${d.mode === 'demo' ? 'Demo data in this browser only. ' : ''}Your name and role come from User management.</p>
      <form onSubmit=${submit} class="stack" style="gap:14px">
        <div class="field"><label for="em">Work email</label>
          <input id="em" class="input" type="email" required autocomplete="email" placeholder="name@wppmedia.com" value=${email}
            onInput=${(e) => { setEmail(e.currentTarget.value); setErr(null); }} /></div>
        ${match ? html`<div class="who-card" aria-live="polite">
            <div><div class="label">Name</div><div class="strong">${match.name || '—'}</div></div>
            <div><div class="label">Role</div><span class="role-chip">${roleLabel(match.role)}</span></div>
            ${match.team && html`<div><div class="label">Team</div><div>${match.team}</div></div>`}
          </div>`
          : looksComplete && team ? html`<div class="callout warn small" aria-live="polite">Not registered yet. Ask an Admin${admins ? ` (${admins})` : ''} to add you in User management.</div>`
          : null}
        ${(err || authError) && html`<div class="callout err">${err || authError}</div>`}
        <div><button class="btn btn-primary btn-lg btn-arrow" type="submit" disabled=${busy || !match}>${busy ? 'Opening…' : 'Continue'}</button></div>
      </form>
    </div>
  </div>`;
}

function NamePrompt() {
  const { db: d, me } = useStore(app);
  const [name, setName] = useState('');
  return html`<${Modal} title="What's your name?">
    <p class="muted">It goes on the briefs you create and the history log, as your Microsoft name did in the Power App.</p>
    <form class="stack" style="gap:12px" onSubmit=${async (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      await d.setFullName(name.trim());
      app.set({ me: { ...me, name: name.trim(), hasName: true } });
    }}>
      <input class="input" required placeholder="First Last" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />
      <div><button class="btn btn-primary" type="submit">Save</button></div>
    </form>
  <//>`;
}

function Notifications() {
  const { notifications, db: d } = useStore(app);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const unread = notifications.filter((n) => !n.read_at).length;
  useEffect(() => {
    if (!open) return undefined;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [open]);
  const markAll = async () => {
    const now = new Date().toISOString();
    for (const n of notifications.filter((x) => !x.read_at)) await d.update('notifications', n.id, { read_at: now });
    loadNotifications();
  };
  return html`<div style="position:relative" ref=${ref}>
    <button class="icon-btn" aria-label=${`Notifications, ${unread} unread`} onClick=${() => { setOpen(!open); if (!open) loadNotifications(); }}>
      <${Icon} name="bell" />${unread > 0 && html`<span class="badge">${unread}</span>`}
    </button>
    ${open && html`<div class="popover">
      <div class="card-head"><h3>Notifications</h3><div class="right">${unread > 0 && html`<button class="btn btn-sm btn-ghost" onClick=${markAll}>Mark all read</button>`}</div></div>
      ${notifications.length === 0 ? html`<div class="empty small">Nothing yet.</div>` : notifications.slice(0, 40).map((n) => html`
        <a class=${`item${n.read_at ? '' : ' unread'}`} href=${n.brief_id ? `#/brief/${encodeURIComponent(n.brief_id)}` : '#/'}
          onClick=${async () => { setOpen(false); if (!n.read_at) { await d.update('notifications', n.id, { read_at: new Date().toISOString() }); loadNotifications(); } }}>
          <div class="s">${n.subject}</div>
          ${n.body && html`<div class="b">${n.body}</div>`}
          <div class="w">${fmtTs(n.created_at, 'dd mmm yy hh:mm')}${n.created_by ? ` · from ${n.created_by}` : ''}</div>
        </a>`)}
    </div>`}
  </div>`;
}

function Toasts() {
  const { toasts } = useStore(app);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${toasts.map((t) => html`<div class=${`toast ${t.kind}`}>
      <div style="flex:1">${t.msg}${t.href && html` <a href=${t.href}>${t.linkText || 'Open'}</a>`}</div>
      <button aria-label="Dismiss" onClick=${() => dismissToast(t.id)}>×</button>
    </div>`)}
  </div>`;
}

function SavingIndicator() {
  const { saving, savedAt } = useStore(app);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1500); return () => clearInterval(t); }, []);
  const recent = savedAt && Date.now() - savedAt < 2500;
  return html`<span class="saving">${saving > 0 ? 'Saving…' : recent ? 'All changes saved' : ''}</span>`;
}

// Collapsed sidebar (icons only) is remembered per browser.
const NAV_KEY = 'lbd-nav-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };
const saveCollapsed = (v) => { try { localStorage.setItem(NAV_KEY, v ? '1' : '0'); } catch { /* private mode */ } };

function Sidebar({ route, collapsed, onToggle, onClose }) {
  const { me, briefs, db: d } = useStore(app);
  const mine = queuesFor(me);
  const counts = Object.fromEntries(mine.map((q) => [q.key, (briefs || []).filter((b) => q.test(b, me)).length]));
  const tab = route.name === 'home' ? (mine.some((q) => q.key === route.query.tab) ? route.query.tab : homeQueue(me)) : null;
  const qa = mine.filter((q) => q.group === 'qa');
  const tip = (label, n) => (collapsed ? `${label}${n != null ? ` (${n})` : ''}` : undefined);
  const link = (q) => html`<a href=${`#/?tab=${q.key}`} title=${tip(q.label, briefs && counts[q.key])}
    class=${tab === q.key || (q.key === 'QA' && route.name === 'qa') ? 'active' : ''}>
    <${Icon} name=${q.icon} /><span class="nav-text">${q.label}</span>${briefs && html`<span class="count">${counts[q.key]}</span>`}</a>`;
  const initials = (me.name || me.email || '?').split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return html`<aside class="sidebar">
    <div class="brand">
      <div class="brand-text">
        <div class="eyebrow"><span class="dot"></span>WPP Media</div>
        <div class="brand-title">L'Oréal Brief Desk</div>
        <div class="brand-sub">Programmatic · Thailand</div>
      </div>
      <button class="nav-toggle" onClick=${onToggle} aria-expanded=${!collapsed}
        title=${collapsed ? 'Expand menu' : 'Collapse menu'} aria-label=${collapsed ? 'Expand menu' : 'Collapse menu'}>
        <${Icon} name=${collapsed ? 'expand' : 'collapse'} /></button>
      <button class="nav-close" onClick=${onClose} aria-label="Close menu"><${Icon} name="x" /></button>
    </div>
    <nav class="nav" aria-label="Main" onClick=${(e) => { if (e.target.closest('a') && onClose) onClose(); }}>
      <div class="nav-label">Briefs</div>
      ${mine.filter((q) => !q.group).map(link)}
      ${qa.length > 0 && html`<div class="nav-label">Quality assurance</div>${qa.map(link)}`}
      <div class="nav-label">Insights</div>
      <a href="#/score" title=${tip('Scorecards')} class=${route.name === 'score' ? 'active' : ''}><${Icon} name="chart" /><span class="nav-text">Scorecards</span></a>
      ${me.isAdmin && html`<a href="#/admin" title=${tip('User management')} class=${route.name === 'admin' ? 'active' : ''}><${Icon} name="settings" /><span class="nav-text">User management</span></a>`}
    </nav>
    <div class="sidebar-foot">
      <div class="avatar" title=${`${me.name} · ${me.role}`}>${initials}</div>
      <div class="who">${me.name}</div>
      <div class="role">${me.role}${me.team ? ` · ${me.team}` : ''}</div>
      <button onClick=${() => d.signOut()} title=${tip('Switch user')}><${Icon} name="logout" /><span class="nav-text">Switch user</span></button>
      ${d.mode === 'demo' && html`<div><span class="demo-badge">Demo data · this browser only</span></div>`}
    </div>
  </aside>`;
}

function Crumbs() {
  const { crumbs = [] } = useStore(app);
  return html`<nav class="crumbs" aria-label="Breadcrumb">
    ${crumbs.map((c, i) => html`${i > 0 && html`<span class="sep">/</span>`}${c.href && i < crumbs.length - 1
      ? html`<a href=${c.href}>${c.label}</a>`
      : html`<span class="here">${c.label}</span>`}`)}
  </nav>`;
}

const SCREENS = { home: Home, edit: BriefEditor, review: Review, adops: AdOps, gate: Gate, qa: Qa, detail: Detail, score: Score, admin: Admin };

function App() {
  const { ready, me } = useStore(app);
  const route = useRoute();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleNav = () => setCollapsed((v) => { saveCollapsed(!v); return !v; });
  // Phones and tablets: the sidebar is a drawer opened from the ☰ button.
  const [navOpen, setNavOpen] = useState(false);
  const routeKey = `${route.name}:${route.briefId || ''}:${JSON.stringify(route.query || {})}`;
  useEffect(() => setNavOpen(false), [routeKey]);
  useEffect(() => {
    document.body.classList.toggle('nav-locked', navOpen);
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);
  if (!ready) return html`<${Loading} text="Loading the Brief Desk…" />`;
  if (!me) return html`<${SignIn} /><${Toasts} />`;
  const Screen = SCREENS[route.name] || Home;
  return html`<div class=${`shell${collapsed ? ' nav-collapsed' : ''}${navOpen ? ' nav-open' : ''}`}>
    <${Sidebar} route=${route} collapsed=${collapsed} onToggle=${toggleNav} onClose=${() => setNavOpen(false)} />
    <div class="nav-backdrop" onClick=${() => setNavOpen(false)}></div>
    <main class="main">
      <div class="topbar">
        <button class="menu-btn" onClick=${() => setNavOpen(true)} aria-label="Open menu" aria-expanded=${navOpen}><${Icon} name="menu" /></button>
        <${Crumbs} />
        <div class="topbar-right"><${SavingIndicator} /><${Notifications} /></div>
      </div>
      <${Screen} key=${`${route.name}:${route.briefId || ''}`} route=${route} />
    </main>
    ${!me.hasName && html`<${NamePrompt} />`}
    <${Toasts} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
boot().catch((e) => {
  document.getElementById('app').innerHTML = '';
  render(html`<div class="page"><div class="callout err"><strong>The Brief Desk could not start.</strong><br />${e.message}</div></div>`, document.getElementById('app'));
});

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.message && !e.reason.toasted) toast(e.reason.message, 'error');
});

export { go };
