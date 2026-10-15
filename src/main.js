import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ALLOWED_DOMAINS, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { QUEUES } from './lib/queues.js';
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
    app.set({ me: profileFor(session, team), ready: true, authError: null });
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
  const { db: d, authError, team } = useStore(app);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(null);
  const demo = d.mode === 'demo';
  const [demoTeam, setDemoTeam] = useState([]);
  useEffect(() => { if (demo) d.list('desk_team').then(setDemoTeam); }, [demo]);

  const submit = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!ALLOWED_DOMAINS.includes(em.split('@')[1])) { setErr(`Use your ${ALLOWED_DOMAINS.map((x) => '@' + x).join(' or ')} address.`); return; }
    setErr(null);
    try {
      await d.signIn(em, name.trim());
      if (!demo) setSent(true);
    } catch (ex) { setErr(ex.message); }
  };

  return html`<div class="signin">
    <div class="art">
      <div class="eyebrow"><span class="dot"></span>WPP Media · Programmatic Thailand</div>
      <div>
        <h1>L'Oréal Brief Desk</h1>
        <p>Brief, taxonomy, Gate check and DV360 set-up for every L'Oréal programmatic campaign, in one place.</p>
      </div>
      <div class="small" style="color:rgba(255,255,255,.6)">Planner → Ad Ops → Gate → Buyer</div>
    </div>
    <div class="form">
      ${sent ? html`
        <div class="eyebrow muted"><span class="dot"></span>Check your inbox</div>
        <h2>We sent you a sign-in link</h2>
        <p class="muted">Open the email sent to <strong>${email}</strong> and click the link. You can close this tab.</p>
        <button class="btn" onClick=${() => setSent(false)}>Use a different address</button>
      ` : html`
        <div class="eyebrow muted"><span class="dot"></span>${demo ? 'Demo mode' : 'Sign in'}</div>
        <h2>${demo ? 'Choose who you are' : 'Sign in with your work email'}</h2>
        <p class="muted">${demo
          ? 'Supabase is not connected yet, so the Brief Desk is running on the exported SharePoint data in this browser only. Pick a desk team member to try their view.'
          : "We'll email you a one-time sign-in link. Only @wppmedia.com addresses can sign in."}</p>
        ${demo && html`<div class="stack" style="gap:8px;margin:8px 0 20px">
          ${demoTeam.map((t) => html`<button class="btn" style="justify-content:space-between" onClick=${() => d.signIn(t.email.toLowerCase(), t.name)}>
            <span>${t.name}</span><span class="muted small">${t.role}</span></button>`)}
          <div class="small muted" style="margin-top:8px">Or sign in as someone else (they get the Planner role):</div>
        </div>`}
        <form onSubmit=${submit} class="stack" style="gap:12px">
          <div class="field"><label for="em">Work email</label>
            <input id="em" class="input" type="email" required placeholder="name@wppmedia.com" value=${email} onInput=${(e) => setEmail(e.currentTarget.value)} /></div>
          ${demo && html`<div class="field"><label for="nm">Your name</label>
            <input id="nm" class="input" placeholder="First Last" value=${name} onInput=${(e) => setName(e.currentTarget.value)} /></div>`}
          ${(err || authError) && html`<div class="callout err">${err || authError}</div>`}
          <div><button class="btn btn-primary btn-lg btn-arrow" type="submit">${demo ? 'Continue' : 'Email me a sign-in link'}</button></div>
        </form>
      `}
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

function Sidebar({ route }) {
  const { me, briefs, db: d } = useStore(app);
  const counts = Object.fromEntries(QUEUES.map((q) => [q.key, (briefs || []).filter((b) => q.test(b, me)).length]));
  const tab = route.name === 'home' ? (route.query.tab || 'Mine') : null;
  return html`<aside class="sidebar">
    <div class="brand">
      <div class="eyebrow"><span class="dot"></span>WPP Media</div>
      <div class="brand-title">L'Oréal Brief Desk</div>
      <div class="brand-sub">Programmatic · Thailand</div>
    </div>
    <nav class="nav" aria-label="Main">
      <div class="nav-label">Briefs</div>
      ${QUEUES.map((q) => html`<a href=${`#/?tab=${q.key}`} class=${tab === q.key ? 'active' : ''}>
        <${Icon} name=${q.icon} />${q.label}${briefs && html`<span class="count">${counts[q.key]}</span>`}</a>`)}
      <div class="nav-label">Insights</div>
      <a href="#/score" class=${route.name === 'score' ? 'active' : ''}><${Icon} name="chart" />Scorecards</a>
      ${me.isAdmin && html`<a href="#/admin" class=${route.name === 'admin' ? 'active' : ''}><${Icon} name="settings" />Admin</a>`}
    </nav>
    <div class="sidebar-foot">
      <div class="who">${me.name}</div>
      <div class="role">${me.role}${me.team ? ` · ${me.team}` : ''}</div>
      <button onClick=${() => d.signOut()}>Sign out</button>
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

const SCREENS = { home: Home, edit: BriefEditor, review: Review, adops: AdOps, gate: Gate, detail: Detail, score: Score, admin: Admin };

function App() {
  const { ready, me } = useStore(app);
  const route = useRoute();
  if (!ready) return html`<${Loading} text="Loading the Brief Desk…" />`;
  if (!me) return html`<${SignIn} /><${Toasts} />`;
  const Screen = SCREENS[route.name] || Home;
  return html`<div class="shell">
    <${Sidebar} route=${route} />
    <main class="main">
      <div class="topbar">
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
